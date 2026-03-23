/**
 * Muninn v5.3 - Briefing with Lessons
 * 
 * Generates session briefings that include both memories and lessons learned.
 */

import { getBriefingLessons, formatLessonsForBriefing } from './lessons';
import { getRecentFailures } from './audit';

// =============================================================================
// TYPES
// =============================================================================

export interface BriefingOptions {
  includeLessons?: boolean;
  includeFailures?: boolean;
  maxLessons?: number;
}

export interface BriefingResult {
  memories: any[];
  lessons: any[];
  failures: any[];
  formatted: string;
}

// =============================================================================
// BRIEFING FUNCTION
// =============================================================================

/**
 * Generate a session briefing
 * 
 * Includes:
 * 1. Recent memories (from existing briefing logic)
 * 2. Lessons learned (from audit consolidation)
 * 3. Recent failures (optional, for debugging)
 */
export async function generateBriefing(
  context: string,
  options: BriefingOptions = {}
): Promise<BriefingResult> {
  const {
    includeLessons = true,
    includeFailures = false,
    maxLessons = 5
  } = options;

  // Get lessons to include
  let lessons: any[] = [];
  if (includeLessons) {
    lessons = await getBriefingLessons();
    if (lessons.length > maxLessons) {
      lessons = lessons.slice(0, maxLessons);
    }
  }

  // Get recent failures (optional)
  let failures: any[] = [];
  if (includeFailures) {
    failures = await getRecentFailures(7);
  }

  // Format output
  const lines: string[] = [];

  // Add lessons section
  if (lessons.length > 0) {
    lines.push(formatLessonsForBriefing(lessons));
    lines.push('');
  }

  // Add failures section (if requested)
  if (failures.length > 0) {
    lines.push('## Recent Failures (Debug)');
    lines.push('');
    failures.forEach(f => {
      lines.push(`- ${f.event_type}: ${f.memory_key || 'unknown'} (${f.failure_count} failures)`);
    });
    lines.push('');
  }

  return {
    memories: [],  // Populated by existing briefing logic
    lessons,
    failures,
    formatted: lines.join('\n')
  };
}

// =============================================================================
// INTEGRATION WITH EXISTING BRIEFING
// =============================================================================

/**
 * Enhance existing briefing with lessons
 * 
 * Use this to add lessons to an existing briefing result.
 */
export function enhanceBriefing(
  existingBriefing: string,
  lessons: any[]
): string {
  if (lessons.length === 0) {
    return existingBriefing;
  }

  const lessonsSection = formatLessonsForBriefing(lessons);
  
  // Insert lessons after the header
  const lines = existingBriefing.split('\n');
  const insertIndex = lines.findIndex(l => l.startsWith('##')) + 1;
  
  lines.splice(insertIndex, 0, '', lessonsSection);
  
  return lines.join('\n');
}

// =============================================================================
// MCP INTEGRATION
// =============================================================================

/**
 * MCP tool: memory_briefing
 * 
 * Returns briefing with lessons included.
 */
export async function memoryBriefing(
  context: string,
  options?: BriefingOptions
): Promise<string> {
  const result = await generateBriefing(context, options);
  
  // Combine with existing briefing logic
  // (This would call the existing briefing function and merge)
  
  return result.formatted;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  generateBriefing,
  enhanceBriefing,
  memoryBriefing
};