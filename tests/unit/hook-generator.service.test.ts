/**
 * Unit tests for hook-generator service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateClaudeCodeHookScript,
  generateClaudeCodeStopHookScript,
  generateClaudeCodeUserPromptSubmitHookScript,
  generateClaudeCodeSessionEndHookScript,
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
      expect(script).toContain('Claude Code PreToolUse hook');
      expect(script).toContain('exit 0');
    });

    it('should include safe defaults and command invocation', () => {
      const script = generateClaudeCodeHookScript();

      expect(script).toContain('AGENT_MEMORY_DB_PATH');
      expect(script).toContain('agent-memory@latest');
      expect(script).toContain('hook pretooluse');
    });

    it('should embed projectId when provided', () => {
      const script = generateClaudeCodeHookScript({ projectId: 'proj-123' });
      expect(script).toContain('--project-id "proj-123"');
    });
  });

  describe('generateClaudeCodeSessionEndHookScript', () => {
    it('should generate a valid bash script', () => {
      const script = generateClaudeCodeSessionEndHookScript();
      expect(script).toContain('#!/bin/bash');
      expect(script).toContain('Claude Code SessionEnd hook');
      expect(script).toContain('hook session-end');
    });

    it('should embed projectId when provided', () => {
      const script = generateClaudeCodeSessionEndHookScript({ projectId: 'proj-123' });
      expect(script).toContain('--project-id "proj-123"');
    });
  });

  describe('generateClaudeCodeStopHookScript', () => {
    it('should generate a valid bash script', () => {
      const script = generateClaudeCodeStopHookScript();
      expect(script).toContain('#!/bin/bash');
      expect(script).toContain('Claude Code Stop hook');
      expect(script).toContain('hook stop');
    });

    it('should embed projectId when provided', () => {
      const script = generateClaudeCodeStopHookScript({ projectId: 'proj-123' });
      expect(script).toContain('--project-id "proj-123"');
    });
  });

  describe('generateClaudeCodeUserPromptSubmitHookScript', () => {
    it('should generate a valid bash script', () => {
      const script = generateClaudeCodeUserPromptSubmitHookScript();
      expect(script).toContain('#!/bin/bash');
      expect(script).toContain('Claude Code UserPromptSubmit hook');
      expect(script).toContain('hook userpromptsubmit');
    });

    it('should embed projectId when provided', () => {
      const script = generateClaudeCodeUserPromptSubmitHookScript({ projectId: 'proj-123' });
      expect(script).toContain('--project-id "proj-123"');
    });
  });

  describe('generateClaudeCodeSettings', () => {
    it('should generate valid JSON settings', () => {
      const settings = generateClaudeCodeSettings(TEST_PROJECT_PATH);

      const parsed = JSON.parse(settings);
      expect(parsed).toHaveProperty('hooks');
      expect(parsed.hooks).toHaveProperty('PreToolUse');
      expect(parsed.hooks).toHaveProperty('Stop');
      expect(parsed.hooks).toHaveProperty('UserPromptSubmit');
      expect(parsed.hooks).toHaveProperty('SessionEnd');
      expect(parsed.hooks.PreToolUse).toHaveLength(1);
      expect(parsed.hooks.PreToolUse[0]).toHaveProperty('matcher');
      expect(parsed.hooks.PreToolUse[0]).toHaveProperty('hooks');
      expect(parsed.hooks.PreToolUse[0].hooks[0]).toHaveProperty('command');
    });

    it('should include correct hook path', () => {
      const settings = generateClaudeCodeSettings(TEST_PROJECT_PATH);

      const parsed = JSON.parse(settings);
      expect(parsed.hooks.PreToolUse[0].hooks[0].command).toContain('test-hook-project');
      expect(parsed.hooks.PreToolUse[0].hooks[0].command).toContain('pretooluse.sh');
      expect(parsed.hooks.Stop[0].hooks[0].command).toContain('stop.sh');
      expect(parsed.hooks.UserPromptSubmit[0].hooks[0].command).toContain('userpromptsubmit.sh');
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
      expect(result.hooks).toHaveLength(5); // PreToolUse + Stop + UserPromptSubmit + SessionEnd + settings
      expect(result.hooks.some((h) => h.filePath.includes('pretooluse.sh'))).toBe(true);
      expect(result.hooks.some((h) => h.filePath.includes('stop.sh'))).toBe(true);
      expect(result.hooks.some((h) => h.filePath.includes('userpromptsubmit.sh'))).toBe(true);
      expect(result.hooks.some((h) => h.filePath.includes('session-end.sh'))).toBe(true);
      expect(result.hooks.some((h) => h.filePath.endsWith('.claude/settings.json'))).toBe(true);
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
      expect(installResult.installed).toHaveLength(5);
      expect(installResult.errors).toHaveLength(0);

      // Verify files were created
      expect(existsSync(join(TEST_PROJECT_PATH, '.claude', 'hooks', 'pretooluse.sh'))).toBe(true);
      expect(existsSync(join(TEST_PROJECT_PATH, '.claude', 'hooks', 'stop.sh'))).toBe(true);
      expect(existsSync(join(TEST_PROJECT_PATH, '.claude', 'hooks', 'userpromptsubmit.sh'))).toBe(
        true
      );
      expect(existsSync(join(TEST_PROJECT_PATH, '.claude', 'hooks', 'session-end.sh'))).toBe(true);
      expect(existsSync(join(TEST_PROJECT_PATH, '.claude', 'settings.json'))).toBe(true);
    });

    it('should make shell scripts executable', () => {
      const result = generateHooks({
        ide: 'claude',
        projectPath: TEST_PROJECT_PATH,
      });

      installHooks(result.hooks);

      const preToolUsePath = join(TEST_PROJECT_PATH, '.claude', 'hooks', 'pretooluse.sh');
      const stopPath = join(TEST_PROJECT_PATH, '.claude', 'hooks', 'stop.sh');
      const userPromptSubmitPath = join(
        TEST_PROJECT_PATH,
        '.claude',
        'hooks',
        'userpromptsubmit.sh'
      );
      const sessionEndPath = join(TEST_PROJECT_PATH, '.claude', 'hooks', 'session-end.sh');
      expect(readFileSync(preToolUsePath, 'utf-8')).toContain('#!/bin/bash');
      expect(readFileSync(stopPath, 'utf-8')).toContain('#!/bin/bash');
      expect(readFileSync(userPromptSubmitPath, 'utf-8')).toContain('#!/bin/bash');
      expect(readFileSync(sessionEndPath, 'utf-8')).toContain('#!/bin/bash');
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
      expect(status.files.every((f) => !f.exists)).toBe(true);
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
      expect(status.files.some((f) => f.exists)).toBe(true);
    });

    it('should return correct file paths for each IDE', () => {
      const claudeStatus = getHookStatus(TEST_PROJECT_PATH, 'claude');
      expect(claudeStatus.files.some((f) => f.path.includes('.claude'))).toBe(true);

      const cursorStatus = getHookStatus(TEST_PROJECT_PATH, 'cursor');
      expect(cursorStatus.files.some((f) => f.path.includes('.cursor'))).toBe(true);

      const vscodeStatus = getHookStatus(TEST_PROJECT_PATH, 'vscode');
      expect(vscodeStatus.files.some((f) => f.path.includes('.vscode'))).toBe(true);
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
