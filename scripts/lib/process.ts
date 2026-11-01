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

// A program and its arguments, such as ['npm', 'run', 'build'].
export type CommandLine = readonly [program: string, ...args: string[]];
// Runs one of a language's commands, such as `npm test`, in a project folder.
export type CommandRunner = (command: CommandLine, options?: ProcessOptions) => ProcessResult;

function spawn(file: string, args: readonly string[], options: ProcessOptions, windowsVerbatimArguments = false): ProcessResult {
  const result = spawnSync(file, args, {
    ...options, encoding: 'utf8', shell: false, windowsHide: true, windowsVerbatimArguments,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr || result.error?.message || '',
    found: (result.error as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT',
  };
}

// Always pass arguments directly. In particular, user text must never become shell syntax.
export const run: Runner = (command, args, options = {}) => spawn(command, args, options);

// The command as a person would type it, for READMEs, instruction files and messages.
export function formatCommand(command: CommandLine): string {
  return command.map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(' ');
}

export interface Invocation {
  file: string;
  args: string[];
  verbatim: boolean;
}

// Characters cmd.exe passes to a batch file unchanged, outside quotes.
const batchSafeArgument = /^[A-Za-z0-9_@+=,.:/\\-]+$/;

// How to start a command without a shell, or undefined when its program is not on PATH.
// Node.js refuses to start a Windows batch file, such as npm.cmd or mvn.cmd, directly, and
// cmd.exe reinterprets the command line it is given, so a batch file gets only arguments
// cmd.exe cannot read as syntax; anything else is refused rather than escaped.
export function commandInvocation(command: CommandLine, env = process.env, platform = process.platform): Invocation | undefined {
  const [program, ...args] = command;
  const file = findExecutable(program, env, platform);
  if (!file) return undefined;
  if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(file)) return { file, args, verbatim: false };

  if (/[%!"\r\n]/.test(file)) throw new Error(`Cannot run ${file}: its path contains a character cmd.exe would expand.`);
  const unsafe = args.find((arg) => !batchSafeArgument.test(arg));
  if (unsafe !== undefined) throw new Error(`Cannot pass '${unsafe}' to ${file}: cmd.exe would read it as syntax.`);
  // A copy of the environment, unlike process.env, is case-sensitive, and shells spell it COMSPEC.
  const comSpec = Object.entries(env).find(([name]) => name.toUpperCase() === 'COMSPEC')?.[1];
  // /d skips AutoRun commands; /s keeps everything between the outer quotes as written.
  return { file: comSpec || 'cmd.exe', args: ['/d', '/s', '/c', `""${file}" ${args.join(' ')}"`], verbatim: true };
}

export const runCommand: CommandRunner = (command, options = {}) => {
  const invocation = commandInvocation(command, options.env);
  if (!invocation) return { code: 1, stdout: '', stderr: `'${command[0]}' was not found on PATH.`, found: false };
  return spawn(invocation.file, invocation.args, options, invocation.verbatim);
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
