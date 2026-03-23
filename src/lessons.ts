/**
 * Muninn v5.3 - Lessons Learned
 * 
 * Extracts patterns from audit events and surfaces actionable lessons.
 */

import { getLessonsAttention, getLessons, Lesson } from './audit';

// =============================================================================
// TYPES
// =============================================================================

export interface LessonInsight {
  lesson: string;
  pattern?: string;
  priority: 'high' | 'medium' | 'low';
  action?: string;
}

// =============================================================================
// BRIEFING INTEGRATION
// =============================================================================

/**
 * Get lessons to include in session briefing
 * 
 * Returns the most important unconsolidated lessons.
 */
export async function getBriefingLessons(): Promise<LessonInsight[]> {
  const lessons = await getLessonsAttention();
  
  if (lessons.length === 0) {
    return [];
  }

  return lessons.map(l => ({
    lesson: l.lesson,
    pattern: l.pattern,
    priority: l.impact,
    action: suggestAction(l)
  }));
}

/**
 * Format lessons for briefing display
 */
export function formatLessonsForBriefing(lessons: LessonInsight[]): string {
  if (lessons.length === 0) {
    return '';
  }

  const lines = ['## Lessons Learned', ''];
  
  const highPriority = lessons.filter(l => l.priority === 'high');
  const mediumPriority = lessons.filter(l => l.priority === 'medium');
  const lowPriority = lessons.filter(l => l.priority === 'low');

  if (highPriority.length > 0) {
    lines.push('### High Priority');
    highPriority.forEach(l => {
      lines.push(`- ${l.lesson}`);
      if (l.action) lines.push(`  → ${l.action}`);
    });
    lines.push('');
  }

  if (mediumPriority.length > 0) {
    lines.push('### Medium Priority');
    mediumPriority.forEach(l => {
      lines.push(`- ${l.lesson}`);
    });
    lines.push('');
  }

  if (lowPriority.length > 0) {
    lines.push('### Low Priority');
    lowPriority.forEach(l => {
      lines.push(`- ${l.lesson}`);
    });
  }

  return lines.join('\n');
}

// =============================================================================
// ACTION SUGGESTIONS
// =============================================================================

/**
 * Suggest an action based on the lesson type
 */
function suggestAction(lesson: Lesson): string | undefined {
  const lessonText = lesson.lesson.toLowerCase();
  
  // Store failures
  if (lessonText.includes('store') && lessonText.includes('fail')) {
    return 'Check write permissions and disk space';
  }
  
  // Recall failures
  if (lessonText.includes('recall') && lessonText.includes('fail')) {
    return 'Review embedding quality and query formulation';
  }
  
  // Recall misses
  if (lessonText.includes('recall') && lessonText.includes('miss')) {
    return 'Consider storing this information if it\'s important';
  }
  
  // Pattern-specific suggestions
  if (lesson.pattern) {
    return `Check memory key: ${lesson.pattern}`;
  }
  
  return undefined;
}

// =============================================================================
// MANUAL LESSON ADDITION
// =============================================================================

/**
 * Add a lesson manually (from explicit feedback)
 */
export async function addManualLesson(
  lesson: string,
  pattern?: string,
  impact: 'high' | 'medium' | 'low' = 'medium'
): Promise<{ success: boolean; error?: string }> {
  const { addLesson } = await import('./audit');
  
  const result = await addLesson(lesson, pattern, impact);
  
  if (result.success) {
    console.log(`[lessons] Added manual lesson: ${lesson}`);
  }
  
  return result;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  getBriefingLessons,
  formatLessonsForBriefing,
  addManualLesson
};