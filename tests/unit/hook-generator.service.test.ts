/**
 * Unit tests for hook-generator service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateClaudeCodeHookScript,
  generateClaudeCodeSettings,
  generateCursorRulesFile,
  generateHooks,
  installHooks,
  getHookStatus,
  uninstallHooks,
  type SupportedIDE,
} from '../../src/services/hook-generator.service.js';

// Mock the critical-guidelines service
vi.mock('../../src/services/critical-guidelines.service.js', () => ({
  getCriticalGuidelinesForScope: vi.fn(() => [
    {
      id: 'guideline-1',
      name: 'no-hardcoded-secrets',
      content: 'Never hardcode API keys or secrets in source code',
      priority: 95,
      category: 'security',
      rationale: 'Hardcoded secrets can be exposed in version control',
      examples: {
        bad: ['const apiKey = "sk-abc123"', 'password = "secret"'],
        good: ['const apiKey = process.env.API_KEY', 'password = getSecret()'],
      },
      scopeType: 'global',
      scopeId: null,
    },
    {
      id: 'guideline-2',
      name: 'no-eval',
      content: 'Never use eval() or new Function()',
      priority: 92,
      category: 'security',
      rationale: 'eval can execute arbitrary code',
      examples: {
        bad: ['eval(userInput)'],
        good: ['JSON.parse(userInput)'],
      },
      scopeType: 'global',
      scopeId: null,
    },
  ]),
}));

const TEST_PROJECT_PATH = './data/test-hook-project';

describe('hook-generator.service', () => {
  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_PROJECT_PATH)) {
      rmSync(TEST_PROJECT_PATH, { recursive: true, force: true });
    }
    mkdirSync(TEST_PROJECT_PATH, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    if (existsSync(TEST_PROJECT_PATH)) {
      rmSync(TEST_PROJECT_PATH, { recursive: true, force: true });
    }
  });

  describe('generateClaudeCodeHookScript', () => {
    it('should generate a valid bash script', () => {
      const script = generateClaudeCodeHookScript();

      expect(script).toContain('#!/bin/bash');
      expect(script).toContain('Claude Code post-response verification hook');
      expect(script).toContain('TOOL_OUTPUT=$(cat)');
      expect(script).toContain('exit 0');
    });

    it('should include tool type checking', () => {
      const script = generateClaudeCodeHookScript();

      expect(script).toContain('Edit|Write|Bash');
      expect(script).toContain('TOOL_NAME');
    });

    it('should include verification logic', () => {
      const script = generateClaudeCodeHookScript();

      expect(script).toContain('memory_verify');
      expect(script).toContain('blocked');
      expect(script).toContain('exit 1');
    });
  });

  describe('generateClaudeCodeSettings', () => {
    it('should generate valid JSON settings', () => {
      const settings = generateClaudeCodeSettings(TEST_PROJECT_PATH);

      const parsed = JSON.parse(settings);
      expect(parsed).toHaveProperty('hooks');
      expect(parsed.hooks).toHaveProperty('PostToolUse');
      expect(parsed.hooks.PostToolUse).toHaveLength(1);
      expect(parsed.hooks.PostToolUse[0]).toHaveProperty('matcher');
      expect(parsed.hooks.PostToolUse[0]).toHaveProperty('command');
    });

    it('should include correct hook path', () => {
      const settings = generateClaudeCodeSettings(TEST_PROJECT_PATH);

      const parsed = JSON.parse(settings);
      expect(parsed.hooks.PostToolUse[0].command).toContain('test-hook-project');
      expect(parsed.hooks.PostToolUse[0].command).toContain('verify-response.sh');
    });
  });

  describe('generateCursorRulesFile', () => {
    it('should generate markdown with critical guidelines', () => {
      const rules = generateCursorRulesFile(null, null);

      expect(rules).toContain('Critical Guidelines');
      expect(rules).toContain('MUST FOLLOW');
      expect(rules).toContain('Priority 90+');
    });

    it('should include guideline content', () => {
      const rules = generateCursorRulesFile(null, null);

      expect(rules).toContain('no-hardcoded-secrets');
      expect(rules).toContain('no-eval');
      expect(rules).toContain('Priority: 95');
      expect(rules).toContain('Priority: 92');
    });

    it('should include examples', () => {
      const rules = generateCursorRulesFile(null, null);

      expect(rules).toContain('Bad examples');
      expect(rules).toContain('Good examples');
      expect(rules).toContain('sk-abc123');
      expect(rules).toContain('process.env.API_KEY');
    });

    it('should include rationale', () => {
      const rules = generateCursorRulesFile(null, null);

      expect(rules).toContain('Rationale');
      expect(rules).toContain('version control');
    });

    it('should include timestamp', () => {
      const rules = generateCursorRulesFile(null, null);

      expect(rules).toContain('Last synced:');
      expect(rules).toContain('Total critical guidelines: 2');
    });
  });

  describe('generateHooks', () => {
    it('should generate Claude Code hooks', () => {
      const result = generateHooks({
        ide: 'claude',
        projectPath: TEST_PROJECT_PATH,
      });

      expect(result.success).toBe(true);
      expect(result.hooks).toHaveLength(2); // Script + settings
      expect(result.hooks.some(h => h.filePath.includes('verify-response.sh'))).toBe(true);
      expect(result.hooks.some(h => h.filePath.includes('settings-hook.json'))).toBe(true);
    });

    it('should generate Cursor rules', () => {
      const result = generateHooks({
        ide: 'cursor',
        projectPath: TEST_PROJECT_PATH,
      });

      expect(result.success).toBe(true);
      expect(result.hooks).toHaveLength(1);
      expect(result.hooks[0].filePath).toContain('critical-guidelines.md');
    });

    it('should generate VSCode rules', () => {
      const result = generateHooks({
        ide: 'vscode',
        projectPath: TEST_PROJECT_PATH,
      });

      expect(result.success).toBe(true);
      expect(result.hooks).toHaveLength(1);
      expect(result.hooks[0].filePath).toContain('.vscode');
      expect(result.hooks[0].filePath).toContain('critical-guidelines.md');
    });

    it('should fail for unsupported IDE', () => {
      const result = generateHooks({
        ide: 'unsupported' as SupportedIDE,
        projectPath: TEST_PROJECT_PATH,
      });

      expect(result.success).toBe(false);
      expect(result.hooks).toHaveLength(0);
      expect(result.message).toContain('Unsupported IDE');
    });

    it('should include instructions in generated hooks', () => {
      const result = generateHooks({
        ide: 'claude',
        projectPath: TEST_PROJECT_PATH,
      });

      expect(result.hooks[0].instructions).toBeDefined();
      expect(result.hooks[0].instructions.length).toBeGreaterThan(0);
    });
  });

  describe('installHooks', () => {
    it('should install hooks to filesystem', () => {
      const result = generateHooks({
        ide: 'claude',
        projectPath: TEST_PROJECT_PATH,
      });

      const installResult = installHooks(result.hooks);

      expect(installResult.success).toBe(true);
      expect(installResult.installed).toHaveLength(2);
      expect(installResult.errors).toHaveLength(0);

      // Verify files were created
      const hookPath = join(TEST_PROJECT_PATH, '.claude', 'hooks', 'verify-response.sh');
      expect(existsSync(hookPath)).toBe(true);
    });

    it('should make shell scripts executable', () => {
      const result = generateHooks({
        ide: 'claude',
        projectPath: TEST_PROJECT_PATH,
      });

      installHooks(result.hooks);

      const hookPath = join(TEST_PROJECT_PATH, '.claude', 'hooks', 'verify-response.sh');
      const content = readFileSync(hookPath, 'utf-8');
      expect(content).toContain('#!/bin/bash');
    });

    it('should create directories if needed', () => {
      const result = generateHooks({
        ide: 'cursor',
        projectPath: TEST_PROJECT_PATH,
      });

      const installResult = installHooks(result.hooks);

      expect(installResult.success).toBe(true);
      expect(existsSync(join(TEST_PROJECT_PATH, '.cursor', 'rules'))).toBe(true);
    });
  });

  describe('getHookStatus', () => {
    it('should return not installed when no hooks exist', () => {
      const status = getHookStatus(TEST_PROJECT_PATH, 'claude');

      expect(status.installed).toBe(false);
      expect(status.files.every(f => !f.exists)).toBe(true);
    });

    it('should return installed when hooks exist', () => {
      // Install hooks first
      const result = generateHooks({
        ide: 'claude',
        projectPath: TEST_PROJECT_PATH,
      });
      installHooks(result.hooks);

      const status = getHookStatus(TEST_PROJECT_PATH, 'claude');

      expect(status.installed).toBe(true);
      expect(status.files.some(f => f.exists)).toBe(true);
    });

    it('should return correct file paths for each IDE', () => {
      const claudeStatus = getHookStatus(TEST_PROJECT_PATH, 'claude');
      expect(claudeStatus.files.some(f => f.path.includes('.claude'))).toBe(true);

      const cursorStatus = getHookStatus(TEST_PROJECT_PATH, 'cursor');
      expect(cursorStatus.files.some(f => f.path.includes('.cursor'))).toBe(true);

      const vscodeStatus = getHookStatus(TEST_PROJECT_PATH, 'vscode');
      expect(vscodeStatus.files.some(f => f.path.includes('.vscode'))).toBe(true);
    });
  });

  describe('uninstallHooks', () => {
    it('should remove installed hooks', () => {
      // Install hooks first
      const result = generateHooks({
        ide: 'claude',
        projectPath: TEST_PROJECT_PATH,
      });
      installHooks(result.hooks);

      // Verify installed
      expect(getHookStatus(TEST_PROJECT_PATH, 'claude').installed).toBe(true);

      // Uninstall
      const uninstallResult = uninstallHooks(TEST_PROJECT_PATH, 'claude');

      expect(uninstallResult.success).toBe(true);
      expect(uninstallResult.removed.length).toBeGreaterThan(0);
      expect(uninstallResult.errors).toHaveLength(0);
    });

    it('should return success even when no hooks to remove', () => {
      const uninstallResult = uninstallHooks(TEST_PROJECT_PATH, 'claude');

      expect(uninstallResult.success).toBe(true);
      expect(uninstallResult.removed).toHaveLength(0);
    });
  });
});
