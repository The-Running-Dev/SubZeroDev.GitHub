import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
  found: boolean;
}
export interface ProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  // Show the command's output as it runs, such as a tofu plan, instead of capturing it.
  stdio?: 'inherit';
}
export type Runner = (command: string, args: string[], options?: ProcessOptions) => ProcessResult;
// Runs one of a language's command lines, such as `npm test`, in a project folder.
export type ShellRunner = (command: string, cwd: string) => ProcessResult;

// Always pass arguments directly. In particular, user text must never become shell syntax.
export const run: Runner = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    ...options, encoding: 'utf8', shell: false, windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr || result.error?.message || '',
    found: (result.error as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT',
  };
};

// Only for the fixed command lines of the language table: they need a shell to find
// npm.cmd and the like on Windows, and they contain no user text.
export const runShell: ShellRunner = (command, cwd) => {
  const result = spawnSync(command, { cwd, shell: true, stdio: 'inherit', windowsHide: true });
  return {
    code: result.status ?? 1,
    stdout: '',
    stderr: result.error?.message ?? '',
    found: !result.error,
  };
};

export function findExecutable(name: string, env = process.env, platform = process.platform): string | undefined {
  const dirs = (env.PATH || env.Path || '').split(platform === 'win32' ? ';' : ':');
  const names = platform === 'win32' && !/\.(exe|cmd|bat)$/i.test(name) ? [name + '.exe', name + '.cmd', name + '.bat'] : [name];
  for (const dir of dirs) for (const leaf of names) {
    const path = join(dir.replace(/^"|"$/g, ''), leaf);
    try { if (statSync(path).isFile() && (platform === 'win32' || (statSync(path).mode & 0o111))) return resolve(path); } catch { /* Continue PATH lookup. */ }
  }
  return undefined;
}
