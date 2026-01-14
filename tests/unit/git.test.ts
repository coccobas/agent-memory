import { describe, it, expect } from 'vitest';
import { getGitBranch, formatBranchForSession } from '../../src/utils/git.js';

describe('git utilities', () => {
  describe('getGitBranch', () => {
    it('returns branch name for current directory', () => {
      const branch = getGitBranch();
      // We're in a git repo, should return something
      expect(branch).toBeDefined();
      expect(typeof branch).toBe('string');
    });

    it('returns null for non-git directory', () => {
      const branch = getGitBranch('/tmp');
      expect(branch).toBeNull();
    });
  });

  describe('formatBranchForSession', () => {
    it('removes feature/ prefix and formats', () => {
      expect(formatBranchForSession('feature/add-auth')).toBe('Add auth');
    });

    it('removes fix/ prefix and formats', () => {
      expect(formatBranchForSession('fix/login-bug')).toBe('Login bug');
    });

    it('removes bugfix/ prefix and formats', () => {
      expect(formatBranchForSession('bugfix/crash-on-startup')).toBe('Crash on startup');
    });

    it('removes chore/ prefix and formats', () => {
      expect(formatBranchForSession('chore/update-deps')).toBe('Update deps');
    });

    it('handles branch without prefix', () => {
      expect(formatBranchForSession('JIRA-123-fix-issue')).toBe('JIRA 123 fix issue');
    });

    it('replaces underscores with spaces', () => {
      expect(formatBranchForSession('feature/add_new_feature')).toBe('Add new feature');
    });

    it('capitalizes first letter', () => {
      expect(formatBranchForSession('test-branch')).toBe('Test branch');
    });
  });
});
