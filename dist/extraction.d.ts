import type { ExtractionResult, ExtractedFact, ExtractedEntity } from './types.js';
export declare class FactExtractor {
    extract(content: string, sessionDate?: string): Promise<ExtractionResult>;
    private validateAndClean;
    private normalizeEntityName;
    private normalizePredicate;
    private normalizeDate;
    private validateEntityType;
}
export declare function resolveEntities(extracted: ExtractedEntity[], existing: Map<string, {
    id: string;
    type: string;
    aliases: string[];
}>): Map<string, {
    id: string;
    confidence: number;
    isNew: boolean;
}>;
export declare function detectContradictions(newFact: ExtractedFact, existingFacts: ExtractedFact[]): Array<{
    fact: ExtractedFact;
    type: 'value_conflict' | 'temporal_overlap' | 'logical';
}>;
export declare function scoreConfidence(fact: ExtractedFact, speaker?: string): number;
//# sourceMappingURL=extraction.d.ts.map