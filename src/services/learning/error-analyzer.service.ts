/**
 * Error Analyzer Service - DEPRECATED
 *
 * @deprecated Import from './outcome-analyzer.service.js' instead.
 * This file now serves as a compatibility wrapper.
 *
 * The service has been renamed to OutcomeAnalyzerService to reflect its
 * broader scope (both success and error pattern analysis). All exports
 * are re-exported from the new location for backward compatibility.
 */

export {
  OutcomeAnalyzerService,
  OutcomeAnalyzerService as ErrorAnalyzerService,
  getOutcomeAnalyzerService,
  getOutcomeAnalyzerService as getErrorAnalyzerService,
  resetOutcomeAnalyzerService,
  resetOutcomeAnalyzerService as resetErrorAnalyzerService,
} from './outcome-analyzer.service.js';

export type {
  GuidelineEntry,
  KnowledgeEntry,
  ErrorPattern,
  AnalysisResult,
  CrossSessionAnalysisResult,
  OutcomeAnalysisConfig,
  ErrorAnalysisConfig,
  DetectedPattern,
  PatternType,
  OutcomeAnalysisResult,
  ComprehensiveAnalysis,
} from './outcome-analyzer.service.js';
