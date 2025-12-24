/**
 * Training Data Generator
 *
 * Generates training examples from guidelines for LoRA fine-tuning.
 * Creates both positive and negative (contrastive) examples.
 *
 * Features:
 * - Automatic instruction variant generation
 * - Scenario extraction from guideline content
 * - Positive (correct) and negative (contrastive) examples
 * - Metadata preservation for traceability
 */

import type { GuidelineData, TrainingExample } from './types.js';

/**
 * Generate training examples from guidelines
 */
export class TrainingDataGenerator {
  /**
   * Generate training examples from a guideline
   */
  generateExamples(
    guideline: GuidelineData,
    count: number = 3,
    includeNegative: boolean = false
  ): TrainingExample[] {
    const examples: TrainingExample[] = [];

    // Generate positive examples
    const positiveCount = includeNegative ? Math.ceil(count * 0.7) : count;
    for (let i = 0; i < positiveCount; i++) {
      examples.push(this.generatePositiveExample(guideline, i));
    }

    // Generate negative (contrastive) examples
    if (includeNegative) {
      const negativeCount = count - positiveCount;
      for (let i = 0; i < negativeCount; i++) {
        examples.push(this.generateNegativeExample(guideline, i));
      }
    }

    return examples;
  }

  /**
   * Generate a positive training example
   */
  private generatePositiveExample(guideline: GuidelineData, variant: number): TrainingExample {
    const instructions = this.generateInstructionVariants(guideline);
    const instruction = instructions[variant % instructions.length];
    const contextualInput = this.generateContextualInput(guideline, variant);

    return {
      system: this.generateSystemPrompt(guideline),
      instruction,
      input: contextualInput || '',
      output: this.generateCorrectOutput(guideline),
      guidelineId: guideline.id,
      isNegative: false,
      metadata: {
        guidelineName: guideline.name,
        category: guideline.category ?? undefined,
        priority: guideline.priority,
        tags: guideline.tags ?? [],
      },
    };
  }

  /**
   * Generate a negative (contrastive) example
   */
  private generateNegativeExample(guideline: GuidelineData, variant: number): TrainingExample {
    const instructions = this.generateInstructionVariants(guideline);
    const instruction = instructions[variant % instructions.length];
    const contextualInput = this.generateContextualInput(guideline, variant);

    return {
      system: this.generateSystemPrompt(guideline),
      instruction,
      input: contextualInput || '',
      output: this.generateIncorrectOutput(guideline),
      guidelineId: guideline.id,
      isNegative: true,
      metadata: {
        guidelineName: guideline.name,
        category: guideline.category ?? undefined,
        priority: guideline.priority,
        tags: guideline.tags ?? [],
      },
    };
  }

  /**
   * Generate system prompt with guideline context
   */
  private generateSystemPrompt(guideline: GuidelineData): string {
    const priority = guideline.priority >= 90 ? 'critical' : guideline.priority >= 70 ? 'high' : 'standard';
    const category = guideline.category || 'general';

    return `You are an AI assistant that strictly follows coding guidelines and best practices.
This is a ${priority} priority ${category} guideline that must be followed carefully.`;
  }

  /**
   * Generate instruction variants for variety
   */
  private generateInstructionVariants(guideline: GuidelineData): string[] {
    const category = guideline.category || 'code';
    const variants: string[] = [];

    // Base instruction
    variants.push(`Follow this ${category} guideline: ${guideline.name}`);

    // Question format
    variants.push(`How should you handle ${this.extractTopic(guideline.name)}?`);

    // Direct command
    variants.push(`Apply the guideline for ${this.extractTopic(guideline.name)}.`);

    // Scenario-based
    variants.push(
      `When working with ${this.extractTopic(guideline.name)}, what is the correct approach?`
    );

    return variants;
  }

  /**
   * Generate contextual input based on guideline
   */
  private generateContextualInput(guideline: GuidelineData, variant: number): string {
    const scenarios = this.extractScenarios(guideline);
    if (scenarios.length === 0) {
      return '';
    }
    return scenarios[variant % scenarios.length];
  }

  /**
   * Generate correct output based on guideline content
   */
  private generateCorrectOutput(guideline: GuidelineData): string {
    let output = guideline.content || guideline.name;

    // Add rationale if available
    if (guideline.rationale) {
      output += `\n\nRationale: ${guideline.rationale}`;
    }

    // Add priority context for high-priority guidelines
    if (guideline.priority >= 90) {
      output += '\n\nNote: This is a critical guideline that must always be followed.';
    }

    return output;
  }

  /**
   * Generate incorrect output for contrastive learning
   */
  private generateIncorrectOutput(guideline: GuidelineData): string {
    // Generate common anti-patterns or violations
    const violations = [
      `This guideline (${guideline.name}) can be ignored in most cases.`,
      `The standard approach differs from this guideline: ${this.generateCounterExample(guideline)}`,
      `While the guideline suggests one approach, it's often better to ${this.generateAlternative(guideline)}`,
    ];

    return violations[Math.floor(Math.random() * violations.length)];
  }

  /**
   * Extract topic from guideline name
   */
  private extractTopic(name: string): string {
    // Remove common prefixes and clean up
    return name
      .replace(/^(use|avoid|prefer|never|always|must)\s+/i, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Extract scenarios from guideline content
   */
  private extractScenarios(guideline: GuidelineData): string[] {
    const scenarios: string[] = [];
    const content = guideline.content;

    // Look for example patterns
    const exampleMatches = content.match(/example[s]?:\s*([^\n]+)/gi);
    if (exampleMatches) {
      scenarios.push(...exampleMatches.map((m) => m.replace(/example[s]?:\s*/i, '')));
    }

    // Look for "when" clauses
    const whenMatches = content.match(/when\s+([^,.\n]+)/gi);
    if (whenMatches) {
      scenarios.push(...whenMatches);
    }

    // Look for "if" clauses
    const ifMatches = content.match(/if\s+([^,.\n]+)/gi);
    if (ifMatches) {
      scenarios.push(...ifMatches);
    }

    return scenarios.filter((s) => s.length > 10 && s.length < 200);
  }

  /**
   * Generate a counter-example
   */
  private generateCounterExample(guideline: GuidelineData): string {
    return `[Counter-example that violates: ${guideline.name}]`;
  }

  /**
   * Generate an alternative approach
   */
  private generateAlternative(guideline: GuidelineData): string {
    return `[Alternative approach different from: ${guideline.name}]`;
  }

  /**
   * Batch generate examples for multiple guidelines
   */
  batchGenerate(
    guidelines: GuidelineData[],
    examplesPerGuideline: number = 3,
    includeNegative: boolean = false
  ): TrainingExample[] {
    const allExamples: TrainingExample[] = [];

    for (const guideline of guidelines) {
      const examples = this.generateExamples(guideline, examplesPerGuideline, includeNegative);
      allExamples.push(...examples);
    }

    return allExamples;
  }
}
