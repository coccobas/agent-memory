/**
 * Git utilities for extracting context from the working directory
 */
import { execFileSync } from 'node:child_process';

/**
 * Get the current git branch name
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns Branch name or null if not in a git repo
 */
export function getGitBranch(cwd?: string): string | null {
  try {
    // Using execFileSync (not execSync) to avoid shell injection
    // All arguments are hardcoded, no user input
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // HEAD means detached state
    if (branch === 'HEAD') {
      return null;
    }

    return branch || null;
  } catch {
    // Not in a git repo or git not available
    return null;
  }
}

/**
 * Format a git branch name for display as a session name
 * Handles common branch naming conventions:
 * - feature/add-auth -> "Add auth"
 * - fix/login-bug -> "Login bug"
 * - JIRA-123-fix-issue -> "JIRA 123 fix issue"
 *
 * @param branch - Raw branch name
 * @returns Cleaned up branch name suitable for session display
 */
export function formatBranchForSession(branch: string): string {
  // Remove common prefixes but keep the meaningful part
  const prefixPatterns = [
    /^(feature|feat|fix|bugfix|bug|hotfix|chore|refactor|docs|test|ci|build)\//i,
  ];

  let cleaned = branch;
  for (const pattern of prefixPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Replace dashes/underscores with spaces for readability
  cleaned = cleaned.replace(/[-_]/g, ' ');

  // Capitalize first letter
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  return cleaned;
}
