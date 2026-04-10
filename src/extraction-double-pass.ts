// Muninn Cloudflare - Double-Pass Fact Extraction
// Pass 1: Entity identification + basic facts
// Pass 2: Identity, temporal, and state facts with date resolution

import { ExtractedFact, ExtractedEntity, ExtractedEvent, ExtractionResult } from './extraction';

export interface DoublePassConfig {
  model?: string;
  sessionDate?: string;
}

// PASS 1: Entity Identification + Basic Facts
const PASS_ONE_PROMPT = `Identify all people and extract basic facts from this conversation.

Text:
{{CONTENT}}

Instructions:
1. List ALL people mentioned (including speaker and anyone referenced)
2. Extract basic facts: attended, visited, works_at, lives_in, has_hobby, owns, mentioned
3. Convert "I" to the speaker name, "she/he" to actual person names
4. Include evidence for each fact

Output JSON on one line:
{"speaker":"Name","entities":[{"name":"Name","type":"person"}],"facts":[{"subject":"Name","predicate":"predicate","object":"value","evidence":"quote from text"}]}

Example predicates: attended, visited, works_at, lives_in, has_hobby, owns, mentioned, went_to, started, ended`;

// PASS 2: Identity, Temporal, and State Facts
const PASS_TWO_PROMPT = `Extract identity, relationship, temporal, and state facts for these entities.

Text:
{{CONTENT}}

Speaker: {{SPEAKER}}
Entities: {{ENTITIES}}

Instructions:
1. Identity facts: gender, nationality, occupation, personality traits
2. Relationship facts: dating, married, friends_with, family_of
3. Temporal facts with dates: events with WHEN they happened (convert "yesterday" to specific dates based on session date {{SESSION_DATE}})
4. State facts: emotional states, preferences, beliefs

Output JSON on one line:
{"identity_facts":[{"subject":"Name","predicate":"is","object":"value","evidence":"quote"}],"relationship_facts":[{"subject":"Name","predicate":"relationship","object":"Name","evidence":"quote"}],"temporal_facts":[{"subject":"Name","predicate":"action","object":"value","date":"YYYY-MM-DD","evidence":"quote"}],"state_facts":[{"subject":"Name","predicate":"prefers","object":"value","evidence":"quote"}]}

Important:
- Convert relative dates to specific dates (session date is {{SESSION_DATE}})
- Extract: is, from, relationship_status, prefers, believes, wants
- Dates MUST be in YYYY-MM-DD format`;

async function callOllamaLocal(prompt: string, model: string): Promise<string> {
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: { num_ctx: 32768, num_predict: 8192 }
    })
  });

  const data = await response.json();
  return data.message?.content || '';
}

function parseJSON(text: string): any {
  // Remove markdown code blocks
  let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  
  // Find JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  
  let jsonStr = jsonMatch[0];
  
  // Fix common JSON issues
  jsonStr = jsonStr.replace(/(\w+)\s*:/g, '"$1":');
  jsonStr = jsonStr.replace(/'/g, '"');
  jsonStr = jsonStr.replace(/,\s*}/g, '}');
  jsonStr = jsonStr.replace(/,\s*]/g, ']');
  
  // Handle truncated JSON
  const openBraces = (jsonStr.match(/\{/g) || []).length;
  const closeBraces = (jsonStr.match(/\}/g) || []).length;
  const openBrackets = (jsonStr.match(/\[/g) || []).length;
  const closeBrackets = (jsonStr.match(/\]/g) || []).length;
  
  for (let i = closeBrackets; i < openBrackets; i++) jsonStr += ']';
  for (let i = closeBraces; i < openBraces; i++) jsonStr += '}';
  
  try {
    return JSON.parse(jsonStr);
  } catch {
    // Try regex extraction for truncated JSON
    const entityMatches = jsonStr.match(/\{"name":"[^"]+","type":"[^"]+"\}/g) || [];
    const factMatches = jsonStr.match(/\{"subject":"[^"]+","predicate":"[^"]+","object":"[^"]*"[^}]*\}/g) || [];
    
    return {
      entities: entityMatches.map((e) => { try { return JSON.parse(e); } catch { return null; } }).filter(Boolean),
      facts: factMatches.map((f) => { try { return JSON.parse(f); } catch { return null; } }).filter(Boolean)
    };
  }
}

export async function extractDoublePass(
  content: string,
  config?: DoublePassConfig
): Promise<ExtractionResult> {
  const model = config?.model || 'gemma3:12b';
  const sessionDate = config?.sessionDate || new Date().toISOString().split('T')[0];
  const startTime = Date.now();
  
  console.log(`[DOUBLE-PASS] Starting double-pass extraction with ${model}`);
  console.log(`[DOUBLE-PASS] Content length: ${content.length} chars`);
  
  const allEntities: ExtractedEntity[] = [];
  const allFacts: ExtractedFact[] = [];
  const allEvents: ExtractedEvent[] = [];
  let speaker: string | undefined;
  
  // ========== PASS 1: Entity Identification + Basic Facts ==========
  console.log('[DOUBLE-PASS] Pass 1: Entity identification + basic facts...');
  
  const passOnePrompt = PASS_ONE_PROMPT.replace('{{CONTENT}}', content.slice(0, 8000));
  const passOneResponse = await callOllamaLocal(passOnePrompt, model);
  const passOneData = parseJSON(passOneResponse);
  
  if (passOneData) {
    speaker = passOneData.speaker || passOneData.entities?.[0]?.name;
    
    if (passOneData.entities) {
      allEntities.push(...passOneData.entities.map((e: any) => ({
        name: e.name,
        type: e.type || 'person'
      })));
    }
    
    if (passOneData.facts) {
      allFacts.push(...passOneData.facts.map((f: any) => ({
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
        objectType: 'string',
        confidence: 0.9,
        evidence: f.evidence || ''
      })));
    }
    
    console.log(`[DOUBLE-PASS] Pass 1: ${allEntities.length} entities, ${allFacts.length} facts`);
  }
  
  // ========== PASS 2: Identity + Temporal + State Facts ==========
  console.log('[DOUBLE-PASS] Pass 2: Identity + temporal + state facts...');
  
  const entityNames = allEntities.map(e => e.name).join(', ');
  const passTwoPrompt = PASS_TWO_PROMPT
    .replace('{{CONTENT}}', content.slice(0, 8000))
    .replace('{{SPEAKER}}', speaker || 'Unknown')
    .replace('{{ENTITIES}}', entityNames)
    .replace(/{{SESSION_DATE}}/g, sessionDate);
  
  const passTwoResponse = await callOllamaLocal(passTwoPrompt, model);
  const passTwoData = parseJSON(passTwoResponse);
  
  if (passTwoData) {
    // Identity facts
    if (passTwoData.identity_facts) {
      allFacts.push(...passTwoData.identity_facts.map((f: any) => ({
        subject: f.subject,
        predicate: f.predicate || 'is',
        object: f.object,
        objectType: 'string',
        confidence: 0.9,
        evidence: f.evidence || ''
      })));
    }
    
    // Relationship facts
    if (passTwoData.relationship_facts) {
      allFacts.push(...passTwoData.relationship_facts.map((f: any) => ({
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
        objectType: 'entity',
        confidence: 0.9,
        evidence: f.evidence || ''
      })));
    }
    
    // Temporal facts (with dates)
    if (passTwoData.temporal_facts) {
      allFacts.push(...passTwoData.temporal_facts.map((f: any) => ({
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
        objectType: 'string',
        validFrom: f.date,
        confidence: 0.9,
        evidence: f.evidence || ''
      })));
    }
    
    // State facts
    if (passTwoData.state_facts) {
      allFacts.push(...passTwoData.state_facts.map((f: any) => ({
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
        objectType: 'string',
        confidence: 0.9,
        evidence: f.evidence || ''
      })));
    }
    
    console.log(`[DOUBLE-PASS] Pass 2 complete: ${allFacts.length} total facts`);
  }
  
  const latency = Date.now() - startTime;
  
  console.log(`[DOUBLE-PASS] Complete: ${allEntities.length} entities, ${allFacts.length} facts in ${latency}ms`);
  
  return {
    speaker,
    entities: allEntities,
    facts: allFacts,
    events: allEvents,
    temporalContext: sessionDate,
    provider: 'ollama-local',
    model,
    latency
  };
}

export default extractDoublePass;