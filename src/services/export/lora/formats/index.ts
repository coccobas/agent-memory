/**
 * LoRA Format Converters
 *
 * Convert training examples to various LoRA training formats.
 */

import type {
  TrainingExample,
  LoRAFormat,
  AlpacaExample,
  ShareGPTExample,
  OpenAIMessagesExample,
  AnthropicPromptsExample,
} from '../types.js';
import { createValidationError } from '../../../../core/errors.js';

/**
 * Export training examples to specified format
 */
export function exportToFormat(examples: TrainingExample[], format: LoRAFormat): string {
  switch (format) {
    case 'alpaca':
      return exportToAlpaca(examples);
    case 'sharegpt':
      return exportToShareGPT(examples);
    case 'openai-messages':
      return exportToOpenAIMessages(examples);
    case 'anthropic-prompts':
      return exportToAnthropicPrompts(examples);
    default:
      throw createValidationError('format', `unsupported format: ${format}`, 'Use alpaca, sharegpt, openai-messages, or anthropic-prompts');
  }
}

/**
 * Convert to Alpaca format (instruction, input, output)
 */
function exportToAlpaca(examples: TrainingExample[]): string {
  const alpacaExamples: AlpacaExample[] = examples.map((ex) => ({
    instruction: ex.instruction,
    input: ex.input || '',
    output: ex.output,
  }));

  return JSON.stringify(alpacaExamples, null, 2);
}

/**
 * Convert to ShareGPT format (conversations)
 */
function exportToShareGPT(examples: TrainingExample[]): string {
  const shareGPTExamples: ShareGPTExample[] = examples.map((ex) => {
    const conversations: ShareGPTExample['conversations'] = [];

    // Add system message if present
    if (ex.system) {
      conversations.push({
        from: 'system',
        value: ex.system,
      });
    }

    // Add user message
    const userMessage = ex.input
      ? `${ex.instruction}\n\nInput: ${ex.input}`
      : ex.instruction;
    conversations.push({
      from: 'human',
      value: userMessage,
    });

    // Add assistant response
    conversations.push({
      from: 'gpt',
      value: ex.output,
    });

    return { conversations };
  });

  return JSON.stringify(shareGPTExamples, null, 2);
}

/**
 * Convert to OpenAI messages format
 */
function exportToOpenAIMessages(examples: TrainingExample[]): string {
  const openAIExamples: OpenAIMessagesExample[] = examples.map((ex) => {
    const messages: OpenAIMessagesExample['messages'] = [];

    // Add system message if present
    if (ex.system) {
      messages.push({
        role: 'system',
        content: ex.system,
      });
    }

    // Add user message
    const userMessage = ex.input
      ? `${ex.instruction}\n\nInput: ${ex.input}`
      : ex.instruction;
    messages.push({
      role: 'user',
      content: userMessage,
    });

    // Add assistant response
    messages.push({
      role: 'assistant',
      content: ex.output,
    });

    return { messages };
  });

  return JSON.stringify(openAIExamples, null, 2);
}

/**
 * Convert to Anthropic prompts format
 */
function exportToAnthropicPrompts(examples: TrainingExample[]): string {
  const anthropicExamples: AnthropicPromptsExample[] = examples.map((ex) => {
    let prompt = ex.instruction;

    // Add system context if present
    if (ex.system) {
      prompt = `${ex.system}\n\n${prompt}`;
    }

    // Add input if present
    if (ex.input) {
      prompt = `${prompt}\n\nInput: ${ex.input}`;
    }

    return {
      prompt,
      completion: ex.output,
    };
  });

  return JSON.stringify(anthropicExamples, null, 2);
}

/**
 * Export to JSONL format (one JSON per line)
 */
export function exportToJSONL(examples: TrainingExample[], format: LoRAFormat): string {
  const jsonObjects: any[] = [];

  for (const ex of examples) {
    switch (format) {
      case 'alpaca':
        jsonObjects.push({
          instruction: ex.instruction,
          input: ex.input || '',
          output: ex.output,
        });
        break;

      case 'sharegpt': {
        const conversations: ShareGPTExample['conversations'] = [];
        if (ex.system) {
          conversations.push({ from: 'system' as const, value: ex.system });
        }
        conversations.push({
          from: 'human' as const,
          value: ex.input ? `${ex.instruction}\n\nInput: ${ex.input}` : ex.instruction,
        });
        conversations.push({ from: 'gpt' as const, value: ex.output });
        jsonObjects.push({ conversations });
        break;
      }

      case 'openai-messages': {
        const messages: OpenAIMessagesExample['messages'] = [];
        if (ex.system) {
          messages.push({ role: 'system' as const, content: ex.system });
        }
        messages.push({
          role: 'user' as const,
          content: ex.input ? `${ex.instruction}\n\nInput: ${ex.input}` : ex.instruction,
        });
        messages.push({ role: 'assistant' as const, content: ex.output });
        jsonObjects.push({ messages });
        break;
      }

      case 'anthropic-prompts': {
        let prompt = ex.instruction;
        if (ex.system) prompt = `${ex.system}\n\n${prompt}`;
        if (ex.input) prompt = `${prompt}\n\nInput: ${ex.input}`;
        jsonObjects.push({ prompt, completion: ex.output });
        break;
      }
    }
  }

  return jsonObjects.map((obj) => JSON.stringify(obj)).join('\n');
}
