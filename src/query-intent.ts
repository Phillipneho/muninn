// P3: Query Intent Classification
// Determines whether to use SQL, Vector, or Hybrid search

export type QueryIntent = 'temporal' | 'factual' | 'sentimental' | 'causal';

export function detectQueryIntent(query: string): QueryIntent {
  const lower = query.toLowerCase();
  
  // Temporal: "when", dates, time expressions
  if (/\bwhen\b|\bin (january|february|march|april|may|june|july|august|september|october|november|december)\b|\blast (week|month|year)\b|\b(20\d{2})\b/.test(lower)) {
    return 'temporal';
  }
  
  // Sentimental: "why", "feeling", "emotion", emotional context
  if (/\bwhy\b|\bfeeling\b|\bemotion\b|\bfeel\b|\bsad\b|\bhappy\b|\banxious\b|\bstressed\b/.test(lower)) {
    return 'sentimental';
  }
  
  // Causal: "because", "reason", "cause", "how come"
  if (/\bbecause\b|\breason\b|\bcause\b|\bhow come\b|\blead to\b|\bresult\b/.test(lower)) {
    return 'causal';
  }
  
  // Default: Factual
  return 'factual';
}

export function getRetrievalStrategy(intent: QueryIntent): {
  primary: 'sql' | 'vector' | 'hybrid';
  sqlWeight: number;
  vectorWeight: number;
} {
  switch (intent) {
    case 'temporal':
      return {
        primary: 'sql',
        sqlWeight: 0.9,
        vectorWeight: 0.1
      };
    
    case 'sentimental':
      return {
        primary: 'vector',
        sqlWeight: 0.3,
        vectorWeight: 0.7
      };
    
    case 'causal':
      return {
        primary: 'hybrid',
        sqlWeight: 0.5,
        vectorWeight: 0.5
      };
    
    case 'factual':
    default:
      return {
        primary: 'sql',
        sqlWeight: 0.8,
        vectorWeight: 0.2
      };
  }
}