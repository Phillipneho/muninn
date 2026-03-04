// v3.1: Relationship Resolver
// Resolves relative entities ("my partner", "his boss") to actual entity IDs

import type { MuninnDatabase } from './database-sqlite.js';

export interface ResolvedEntity {
  entityId: string;
  entityName: string;
  relationship?: string;
  path: string[];
}

export interface QueryIntent {
  type: 'temporal' | 'factual' | 'sentimental' | 'causal' | 'relationship';
  rootEntity?: string;
  relativeDescription?: string;
  targetEntity?: string;
}

// Relationship type mappings for common patterns
const RELATIONSHIP_PATTERNS: Record<string, string[]> = {
  partner: ['is_partner_of', 'spouse_of', 'girlfriend_of', 'boyfriend_of', 'partner'],
  spouse: ['spouse_of', 'is_partner_of', 'married_to'],
  child: ['child_of', 'son_of', 'daughter_of', 'parent_of'],
  parent: ['parent_of', 'mother_of', 'father_of'],
  sibling: ['sibling_of', 'brother_of', 'sister_of'],
  friend: ['friend_of', 'best_friend_of'],
  colleague: ['colleague_of', 'works_with', 'coworker_of'],
  boss: ['boss_of', 'manager_of', 'supervisor_of'],
  employee: ['employee_of', 'works_for', 'reports_to']
};

// Inverse relationship mappings
const INVERSE_RELATIONSHIPS: Record<string, string> = {
  'is_partner_of': 'is_partner_of',
  'spouse_of': 'spouse_of',
  'parent_of': 'child_of',
  'child_of': 'parent_of',
  'son_of': 'parent_of',
  'daughter_of': 'parent_of',
  'mother_of': 'child_of',
  'father_of': 'child_of',
  'sibling_of': 'sibling_of',
  'brother_of': 'sibling_of',
  'sister_of': 'sibling_of',
  'friend_of': 'friend_of',
  'boss_of': 'employee_of',
  'manager_of': 'employee_of',
  'works_for': 'boss_of',
  'employee_of': 'boss_of'
};

/**
 * Resolves a relative entity reference to an actual entity
 * Example: "my partner" → resolves to "Alisha" (if Phillip is the root)
 */
export async function resolveRelativeEntity(
  db: MuninnDatabase,
  rootEntityName: string,
  relativeDescription: string
): Promise<ResolvedEntity | null> {
  // Normalize the relative description
  const normalized = relativeDescription.toLowerCase().replace(/^(my|his|her|their|the)\s+/, '');
  
  // Find matching relationship types
  const relationshipTypes: string[] = [];
  for (const [pattern, types] of Object.entries(RELATIONSHIP_PATTERNS)) {
    if (normalized.includes(pattern)) {
      relationshipTypes.push(...types);
    }
  }
  
  // Also try the description directly as a relationship type
  if (relationshipTypes.length === 0) {
    // Try mapping common descriptions to relationship types
    const directMappings: Record<string, string> = {
      'son': 'child_of',
      'daughter': 'child_of',
      'parent': 'parent_of',
      'mother': 'parent_of',
      'father': 'parent_of',
      'partner': 'is_partner_of',
      'spouse': 'spouse_of',
      'friend': 'friend_of',
      'boss': 'boss_of',
      'employee': 'employee_of'
    };
    const mapped = directMappings[normalized];
    if (mapped) {
      relationshipTypes.push(mapped);
    }
  }
  
  if (relationshipTypes.length === 0) {
    return null;
  }
  
  // Get root entity ID
  const rootEntity = db.resolveEntity(rootEntityName);
  if (!rootEntity) {
    return null;
  }
  
  // Search for relationships
  for (const relType of relationshipTypes) {
    // Try outgoing first
    const outgoing = db.getEntityRelationships(rootEntity.id, 'outgoing');
    const found = outgoing.find(r => 
      r.relationship_type.toLowerCase().includes(relType.toLowerCase())
    );
    
    if (found) {
      const targetEntity = db['db'].prepare('SELECT id, name FROM entities WHERE id = ?').get(found.target_entity_id) as any;
      return {
        entityId: found.target_entity_id,
        entityName: targetEntity?.name || 'Unknown',
        relationship: found.relationship_type,
        path: [rootEntityName, relType, targetEntity?.name]
      };
    }
    
    // Try incoming
    const incoming = db.getEntityRelationships(rootEntity.id, 'incoming');
    const foundIncoming = incoming.find(r => 
      r.relationship_type.toLowerCase().includes(relType.toLowerCase())
    );
    
    if (foundIncoming) {
      const sourceEntity = db['db'].prepare('SELECT id, name FROM entities WHERE id = ?').get(foundIncoming.source_entity_id) as any;
      return {
        entityId: foundIncoming.source_entity_id,
        entityName: sourceEntity?.name || 'Unknown',
        relationship: foundIncoming.relationship_type,
        path: [sourceEntity?.name, relType, rootEntityName]
      };
    }
  }
  
  return null;
}

/**
 * Detects relationship queries in user input
 * Returns the root entity and relative description if found
 */
export function detectRelationshipQuery(query: string): { rootEntity?: string; relativeDescription?: string } | null {
  const lower = query.toLowerCase();
  
  // Pattern: "What did [Entity]'s [relationship] do?"
  const possessivePattern = /what did (\w+)'s (\w+) do/;
  const match = lower.match(possessivePattern);
  if (match) {
    return {
      rootEntity: match[1],
      relativeDescription: match[2]
    };
  }
  
  // Pattern: "What is [Entity]'s [relationship]?"
  const whatIsPattern = /what is (\w+)'s (\w+)/;
  const match2 = lower.match(whatIsPattern);
  if (match2) {
    return {
      rootEntity: match2[1],
      relativeDescription: match2[2]
    };
  }
  
  // Pattern: "When did [Entity]'s [relationship] [verb]?"
  const whenPattern = /when did (\w+)'s (\w+) (\w+)/;
  const match3 = lower.match(whenPattern);
  if (match3) {
    return {
      rootEntity: match3[1],
      relativeDescription: match3[2]
    };
  }
  
  return null;
}

/**
 * Creates inverse relationship automatically
 * If A → parent_of → B, also creates B → child_of → A
 */
export function createInverseRelationship(
  db: MuninnDatabase,
  sourceId: string,
  targetId: string,
  relationshipType: string,
  confidence: number,
  evidence?: string
): void {
  const inverseType = INVERSE_RELATIONSHIPS[relationshipType.toLowerCase()];
  
  if (inverseType && inverseType !== relationshipType.toLowerCase()) {
    // Create inverse relationship
    db.createEntityRelationship({
      sourceEntityId: targetId,
      targetEntityId: sourceId,
      relationshipType: inverseType.toUpperCase(),
      confidence,
      evidence
    });
  }
}

/**
 * Two-pass retrieval for complex queries
 * Pass 1: Resolve relationships
 * Pass 2: Execute search on resolved entity
 */
export async function twoPassRetrieval(
  db: MuninnDatabase,
  query: string,
  executeSearch: (entityName: string, query: string) => Promise<any[]>
): Promise<{ resolvedEntity?: ResolvedEntity; results: any[] }> {
  // Check if query contains relationship
  const relationshipQuery = detectRelationshipQuery(query);
  
  if (!relationshipQuery || !relationshipQuery.rootEntity || !relationshipQuery.relativeDescription) {
    // No relationship detected, execute normal search
    return {
      results: await executeSearch('', query)
    };
  }
  
  // Pass 1: Resolve the relative entity
  const resolved = await resolveRelativeEntity(
    db,
    relationshipQuery.rootEntity,
    relationshipQuery.relativeDescription
  );
  
  if (!resolved) {
    // Could not resolve, try with root entity
    return {
      results: await executeSearch(relationshipQuery.rootEntity, query)
    };
  }
  
  // Pass 2: Execute search on resolved entity
  const results = await executeSearch(resolved.entityName, query);
  
  return {
    resolvedEntity: resolved,
    results
  };
}