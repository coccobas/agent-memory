import { execFileSync } from 'node:child_process';

function main() {
  try {
    execFileSync('git', ['checkout', 'HEAD', '--', 'src/db/migrations/'], { stdio: 'inherit' });
  } catch (error) {
    // In some sandboxed environments, writing to `.git/` (index.lock) is blocked.
    // Tests can still run as long as migrations weren't modified.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`restore-migrations: skipped (git checkout failed: ${message.trim()})\n`);
  }
}

main();

