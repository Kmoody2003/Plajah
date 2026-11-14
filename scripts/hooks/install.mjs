// Installs the shared git hooks into this clone. Hooks apply to every worktree of the clone.
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const hooks = resolve(execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim(), 'hooks');
const target = join(hooks, 'pre-push');
copyFileSync('scripts/hooks/pre-push', target);
chmodSync(target, 0o755);
console.log(`Installed ${target}`);
