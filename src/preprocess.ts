// Muninn Cloudflare - Pre-processing Worker for LOCOMO-Grade Retrieval
// Implements recursive summarisation + Global Context Header prepending

export interface Segment {
  id: string;
  content: string;
  startOffset: number;
  endOffset: number;
  entities: string[];
  microSummary: string;
  decisionPoints: string[];
}

export interface ProcessedConversation {
  globalContextHeader: string;
  segments: Segment[];
  totalTokens: number;
}

export interface AtomicFact {
  subject: string;
  predicate: string;
  object: string;
  objectType: string;
  confidence: number;
  evidence: string;
  segmentId: string;
}

const SEGMENT_SIZE = 5000; // Characters per segment
const HEADER_TARGET_LENGTH = 500; // Words for Global Context Header
const MICRO_SUMMARY_LENGTH = 2; // Sentences per segment

/**
 * Pass 1: Bottom-Up Extraction
 * Split conversation into 5k segments and extract entities + micro-summaries
 */
export async function extractSegments(
  content: string,
  ai: Ai,
  sessionDate: string
): Promise<Segment[]> {
  // Split into ~5k character segments at natural boundaries
  const rawSegments = splitAtBoundaries(content, SEGMENT_SIZE);
  
  const segments: Segment[] = [];
  
  for (let i = 0; i < rawSegments.length; i++) {
    const segment = rawSegments[i];
    const segmentId = `seg-${i}-${Date.now()}`;
    
    // Extract entities and micro-summary in one pass
    const extraction = await extractSegmentMeta(ai, segment, sessionDate, i);
    
    segments.push({
      id: segmentId,
      content: segment,
      startOffset: i * SEGMENT_SIZE,
      endOffset: (i * SEGMENT_SIZE) + segment.length,
      entities: extraction.entities,
      microSummary: extraction.microSummary,
      decisionPoints: extraction.decisionPoints
    });
    
    console.log(`[Pass 1] Segment ${i + 1}/${rawSegments.length}: ${extraction.entities.length} entities, ${extraction.decisionPoints.length} decisions`);
  }
  
  return segments;
}

/**
 * Pass 2: Top-Down Global Context Header Generation
 * Feed micro-summaries into a synthesising prompt to create narrative arc
 */
export async function generateGlobalHeader(
  segments: Segment[],
  ai: Ai
): Promise<string> {
  // Aggregate all micro-summaries
  const microSummaries = segments.map((s, i) => 
    `Segment ${i + 1}: ${s.microSummary}`
  ).join('\n');
  
  // Aggregate all entities (deduplicated)
  const allEntities = [...new Set(segments.flatMap(s => s.entities))];
  
  // Aggregate decision points
  const allDecisions = segments.flatMap(s => s.decisionPoints);
  
  const prompt = `You are synthesising a Global Context Header for a long conversation.

## INPUT
Micro-Summaries from ${segments.length} segments:
${microSummaries}

Key Entities Mentioned: ${allEntities.slice(0, 20).join(', ')}

Critical Decision Points: ${allDecisions.slice(0, 10).join('; ')}

## TASK
Write a 500-word executive summary that captures:
1. The NARRATIVE ARC - what is the overall story or progression?
2. The KEY ENTITIES - who/what are the main actors?
3. The CENTRAL TOPICS - what themes recur throughout?
4. The TEMPORAL FLOW - what is the timeline of events?

This header will be prepended to every chunk for retrieval. It must provide enough context to anchor each chunk in the broader conversation.

OUTPUT: Just the header text, no metadata or labels.`;

  const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      { role: 'system', content: 'You are a precise summarisation engine. Output only the requested content.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 1024,
    temperature: 0.3
  }) as { response: string };
  
  const header = response.response?.trim() || '';
  console.log(`[Pass 2] Global Header: ${header.split(' ').length} words`);
  
  return header;
}

/**
 * Format segment with prepended header
 * Uses structural separator for embedding clarity
 */
export function formatSegmentWithHeader(
  header: string,
  segment: Segment,
  segmentIndex: number,
  totalSegments: number
): string {
  // Structural separator pattern
  return `[GLOBAL_CONTEXT: ${header}]

[SEGMENT ${segmentIndex + 1}/${totalSegments}]
Offset: ${segment.startOffset}-${segment.endOffset}
Entities: ${segment.entities.slice(0, 10).join(', ')}
Decision Points: ${segment.decisionPoints.slice(0, 3).join('; ')}

[SEGMENT_DETAIL]
${segment.content}`;
}

/**
 * Main preprocessing pipeline
 */
export async function preprocessConversation(
  content: string,
  ai: Ai,
  sessionDate: string
): Promise<ProcessedConversation> {
  console.log(`[Preprocess] Starting: ${content.length} chars`);
  
  // Pass 1: Extract segments with entities and micro-summaries
  const segments = await extractSegments(content, ai, sessionDate);
  
  // Pass 2: Generate Global Context Header from micro-summaries
  const globalHeader = await generateGlobalHeader(segments, ai);
  
  // Calculate token overhead
  const headerTokens = globalHeader.split(' ').length;
  const segmentTokens = segments.reduce((sum, s) => sum + s.content.split(' ').length, 0);
  const totalTokens = headerTokens * segments.length + segmentTokens;
  
  console.log(`[Preprocess] Complete: ${segments.length} segments, ${headerTokens}-word header, ${totalTokens} total tokens`);
  
  return {
    globalContextHeader: globalHeader,
    segments,
    totalTokens
  };
}

/**
 * Split content at natural boundaries (sentences/paragraphs)
 * Avoids cutting mid-sentence
 */
function splitAtBoundaries(content: string, targetSize: number): string[] {
  const segments: string[] = [];
  let remaining = content;
  
  while (remaining.length > targetSize) {
    // Find last sentence boundary before targetSize
    const cutoff = remaining.lastIndexOf('.', targetSize);
    const altCutoff = remaining.lastIndexOf('\n', targetSize);
    
    const splitPoint = Math.max(cutoff, altCutoff);
    
    if (splitPoint > targetSize * 0.5) {
      // Good boundary found
      segments.push(remaining.substring(0, splitPoint + 1).trim());
      remaining = remaining.substring(splitPoint + 1);
    } else {
      // No good boundary, hard split
      segments.push(remaining.substring(0, targetSize).trim());
      remaining = remaining.substring(targetSize);
    }
  }
  
  // Final segment
  if (remaining.trim().length > 0) {
    segments.push(remaining.trim());
  }
  
  return segments;
}

/**
 * Extract entities, micro-summary, and decision points from a single segment
 */
async function extractSegmentMeta(
  ai: Ai,
  segment: string,
  sessionDate: string,
  segmentIndex: number
): Promise<{ entities: string[]; microSummary: string; decisionPoints: string[] }> {
  const prompt = `Extract from this conversation segment:

## SEGMENT (Part ${segmentIndex + 1})
${segment.substring(0, 4000)}

## TASK
1. List ALL named entities (people, places, organizations, technologies)
2. Write a 2-sentence micro-summary capturing the key point
3. List any DECISION POINTS (statements like "we decided to", "I chose", "the plan is")

OUTPUT FORMAT (JSON only):
{
  "entities": ["Caroline", "Melanie", "Brisbane"],
  "microSummary": "Caroline discussed her painting hobby with Melanie. They planned to meet next week.",
  "decisionPoints": ["Caroline decided to join the art class", "Melanie offered to teach painting"]
}`;

  try {
    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'You are a precise extraction engine. Output only JSON.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 512,
      temperature: 0.1
    }) as { response: string };
    
    const jsonMatch = response.response?.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        entities: parsed.entities || [],
        microSummary: parsed.microSummary || '',
        decisionPoints: parsed.decisionPoints || []
      };
    }
  } catch (error) {
    console.error(`[Segment ${segmentIndex}] Extraction error:`, error);
  }
  
  // Fallback
  return { entities: [], microSummary: '', decisionPoints: [] };
}

/**
 * Generate relationship metadata for multi-hop retrieval
 * Tags chunks with related entities across segments
 */
export function generateRelationshipTags(segments: Segment[]): Map<string, string[]> {
  const relationshipMap = new Map<string, string[]>();
  
  // Find entities that appear in multiple segments
  const entitySegments = new Map<string, number[]>();
  
  segments.forEach((seg, i) => {
    seg.entities.forEach(entity => {
      const existing = entitySegments.get(entity) || [];
      existing.push(i);
      entitySegments.set(entity, existing);
    });
  });
  
  // For each segment, tag related entities
  segments.forEach((seg, i) => {
    const related: string[] = [];
    
    seg.entities.forEach(entity => {
      const segmentIndices = entitySegments.get(entity) || [];
      // Find other segments with same entity
      segmentIndices.forEach(otherIndex => {
        if (otherIndex !== i) {
          const otherSeg = segments[otherIndex];
          // Tag entities from related segments
          otherSeg.entities.forEach(otherEntity => {
            if (!seg.entities.includes(otherEntity)) {
              related.push(`${otherEntity}(via:${entity})`);
            }
          });
        }
      });
    });
    
    relationshipMap.set(seg.id, [...new Set(related)]);
  });
  
  return relationshipMap;
}