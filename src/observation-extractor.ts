// Muninn v2 Unified Observation Extractor
// Replaces binary Event/Fact extraction with tagged observations

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface Observation {
  entity_name: string;
  tags: string[];           // ['IDENTITY', 'TRAIT', 'ACTIVITY', 'STATE']
  predicate: string;        // 'is', 'painted', 'attended', 'identifies_as'
  content: string;          // The value or description
  valid_from?: string;       // ISO timestamp when this became true
  valid_until?: string;      // ISO timestamp when this stopped being true (rare)
  confidence: number;
  evidence?: string;         // Exact quote from text
  metadata?: Record<string, any>;
}

export interface ExtractionResult {
  entities: Array<{ name: string; type: string }>;
  observations: Observation[];
}

/**
 * The Universal Observer Prompt (v4.0)
 * 
 * Core principle: Be an Aggressive Collector of signal.
 * If a fact is stated, capture it. Do not require a "change" to have occurred.
 */
const OBSERVATION_PROMPT = `You are the Muninn Knowledge Extracter. Your job is to extract EVERY assertion from the text as tagged observations.

## Critical: Extract for ALL Speakers
Do not focus only on one person. Extract observations about EVERY entity mentioned.

## Tag Definitions (use multiple tags when appropriate)

| Tag | Definition | Examples | Persistence |
|-----|------------|----------|-------------|
| IDENTITY | Core definitions of who someone is | "is transgender", "is from Sweden", "is a mother" | Permanent |
| TRAIT | Persistent habits, skills, preferences | "paints sunrises", "plays violin", "enjoys hiking" | Long-term |
| ACTIVITY | One-off events with timestamps | "attended support group May 7", "ran charity race" | Temporal |
| STATE | Current values that can change | "works at TechCorp", "lives in Brisbane", "is single" | Updateable |

## Tagging Rules

1. **Multi-tag**: An observation can have multiple tags
   - "Melanie paints sunrises" → ["TRAIT", "ACTIVITY"] (shows she's an artist AND happened)
   - "Caroline is transgender" → ["IDENTITY", "STATE"]

2. **No oldValue required**: If something is stated, capture it
   - Do NOT ignore "painted a sunrise" just because it's not a state change

3. **Natural predicates**: Use the verb from the text
   - "painted", "attended", "is", "researched", "moved from"

4. **Temporal resolution**: Convert relative dates to ISO
   - "last year" (from May 2023) → "2022-01-01"
   - "the Sunday before May 25" → Calculate the exact date
   - "yesterday" (from session date) → session_date - 1

## Extraction Examples

Input: "Melanie: Yeah, I painted that lake sunrise last year! It's special to me."
Output:
{
  "observations": [
    {
      "entity_name": "Melanie",
      "tags": ["TRAIT", "ACTIVITY"],
      "predicate": "painted",
      "content": "lake sunrise",
      "valid_from": "2022-01-01",
      "confidence": 0.95,
      "evidence": "I painted that lake sunrise last year!"
    },
    {
      "entity_name": "Melanie",
      "tags": ["TRAIT"],
      "predicate": "is_artist",
      "content": "paints landscapes",
      "confidence": 0.9,
      "evidence": "I painted that lake sunrise"
    }
  ]
}

Input: "Caroline: I'm thinking about pursuing counseling or mental health work."
Output:
{
  "observations": [
    {
      "entity_name": "Caroline",
      "tags": ["STATE"],
      "predicate": "career_interest",
      "content": "counseling or mental health",
      "confidence": 0.85,
      "evidence": "I'm thinking about pursuing counseling or mental health work"
    }
  ]
}

Input: "Caroline: I am a transgender woman."
Output:
{
  "observations": [
    {
      "entity_name": "Caroline",
      "tags": ["IDENTITY"],
      "predicate": "identifies_as",
      "content": "transgender woman",
      "confidence": 1.0,
      "evidence": "I am a transgender woman"
    }
  ]
}

## Session Date
Use this to resolve relative dates: {sessionDate}

## Output Format

{
  "entities": [
    {"name": "Caroline", "type": "person"},
    {"name": "Melanie", "type": "person"}
  ],
  "observations": [
    {
      "entity_name": "Caroline",
      "tags": ["IDENTITY"],
      "predicate": "identifies_as",
      "content": "transgender woman",
      "valid_from": null,
      "confidence": 1.0,
      "evidence": "I am a transgender woman"
    }
  ]
}

## Conversation to Process:

{conversation}

Extract all observations. Output valid JSON only.`;

export class ObservationExtractor {
  
  async extract(content: string, sessionDate?: string): Promise<ExtractionResult> {
    const prompt = OBSERVATION_PROMPT
      .replace('{sessionDate}', sessionDate || new Date().toISOString().split('T')[0])
      .replace('{conversation}', content);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a precise knowledge extraction system. Output valid JSON only. Extract EVERY assertion as a tagged observation.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    });
    
    const text = response.choices[0]?.message?.content || '{"entities":[],"observations":[]}';
    
    try {
      const result = JSON.parse(text) as ExtractionResult;
      return this.validateAndClean(result);
    } catch (e) {
      console.error('Failed to parse observation extraction:', e);
      return { entities: [], observations: [] };
    }
  }
  
  private validateAndClean(result: ExtractionResult): ExtractionResult {
    return {
      entities: result.entities.map(e => ({
        name: this.normalizeName(e.name),
        type: this.validateEntityType(e.type)
      })),
      observations: result.observations.map(o => ({
        entity_name: this.normalizeName(o.entity_name),
        tags: this.validateTags(o.tags),
        predicate: this.normalizePredicate(o.predicate),
        content: o.content.trim(),
        valid_from: this.normalizeDate(o.valid_from),
        valid_until: this.normalizeDate(o.valid_until),
        confidence: Math.min(1, Math.max(0, o.confidence || 0.8)),
        evidence: o.evidence?.trim(),
        metadata: o.metadata
      }))
    };
  }
  
  private normalizeName(name: string): string {
    if (!name) return '';
    return name.trim()
      .replace(/^(the|a|an)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  private validateTags(tags: string[]): string[] {
    const validTags = ['IDENTITY', 'TRAIT', 'ACTIVITY', 'STATE'];
    const normalized = tags.map(t => t.toUpperCase());
    // Ensure at least one valid tag
    const valid = normalized.filter(t => validTags.includes(t));
    if (valid.length === 0) {
      return ['ACTIVITY']; // Default to ACTIVITY if no valid tags
    }
    return valid;
  }
  
  private validateEntityType(type: string): string {
    const validTypes = ['person', 'org', 'project', 'concept', 'location', 'technology', 'event'];
    const normalized = type.toLowerCase().trim();
    
    const mappings: Record<string, string> = {
      'person': 'person',
      'people': 'person',
      'human': 'person',
      'user': 'person',
      'organization': 'org',
      'org': 'org',
      'company': 'org',
      'team': 'org',
      'group': 'org',
      'project': 'project',
      'task': 'project',
      'initiative': 'project',
      'product': 'project',
      'concept': 'concept',
      'idea': 'concept',
      'topic': 'concept',
      'location': 'location',
      'place': 'location',
      'city': 'location',
      'country': 'location',
      'technology': 'technology',
      'tech': 'technology',
      'tool': 'technology',
      'platform': 'technology',
      'language': 'technology',
      'event': 'event'
    };
    
    return mappings[normalized] || 'concept';
  }
  
  private normalizePredicate(predicate: string): string {
    return predicate.toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      .replace(/^(is_|are_|was_|were_)/, '')
      .replace(/_+/g, '_');
  }
  
  private normalizeDate(date?: string): string | undefined {
    if (!date) return undefined;
    
    // Already ISO format
    if (/^\d{4}-\d{2}-\d{2}/.test(date)) return date.split('T')[0];
    
    // Try to parse
    try {
      const parsed = new Date(date);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
    } catch {}
    
    return undefined;
  }
}

// Weight calculation for retrieval
export function calculateObservationWeight(observation: { tags: string[] }, similarity: number = 1.0): number {
  const WEIGHTS: Record<string, number> = {
    'IDENTITY': 10.0,
    'STATE': 5.0,
    'TRAIT': 3.0,
    'ACTIVITY': 1.0
  };
  
  // Use the highest weight tag
  const maxWeight = Math.max(...observation.tags.map(t => WEIGHTS[t] || 1.0));
  return similarity * maxWeight;
}