/**
 * Muninn v5.3 - Index
 * 
 * Exports all audit and lessons functionality.
 */

// Audit trail
export {
  audit,
  auditStore,
  auditRecall,
  getRecentFailures,
  AuditEvent,
  AuditEventType
} from './audit';

// Lessons learned
export {
  getBriefingLessons,
  formatLessonsForBriefing,
  addManualLesson,
  LessonInsight
} from './lessons';

// Audit wrappers
export {
  withAuditStore,
  withAuditRecall,
  withAuditSearch,
  logRecallMiss,
  logLessonLearned
} from './audit-wrapper';

// Briefing with lessons
export {
  generateBriefing,
  enhanceBriefing,
  memoryBriefing,
  BriefingOptions,
  BriefingResult
} from './briefing-v53';

// Version info
export const VERSION = '5.3.0';
export const VERSION_NAME = 'Audit & Lessons';