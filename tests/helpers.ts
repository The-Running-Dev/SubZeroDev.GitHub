// Shared fixtures for the test suite: throwaway folders and git repositories, a memory
// log, and a recording stand-in for tofu. Nothing here touches the real repositories/
// folder, the real OpenTofu state, or GitHub.

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestContext } from 'node:test';
import type { Context } from '../scripts/lib/context.ts';
import type { Log } from '../scripts/lib/log.ts';
import { formatCommand, run, runCommand } from '../scripts/lib/process.ts';
import type { CommandRunner, ProcessResult, Runner } from '../scripts/lib/process.ts';

export const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

// A fresh folder, removed when the test ends.
export function tempDir(t: TestContext): string {
  const path = mkdtempSync(join(tmpdir(), 'subzerodev-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

// A copy of scripts/ with an empty repositories/ beside it, for tests that run an entry point's CLI.
export function testRoot(t: TestContext): string {
  const root = join(tempDir(t), 'root');
  mkdirSync(join(root, 'repositories'), { recursive: true });
  cpSync(join(repositoryRoot, 'scripts'), join(root, 'scripts'), { recursive: true });
  return root;
}

export interface MemoryLog extends Log {
  lines: string[];
  text(): string;
}

export function memoryLog(): MemoryLog {
  const lines: string[] = [];
  return {
    lines,
    text: () => lines.join('\n'),
    step: (message) => { lines.push(`==> ${message}`); },
    success: (message) => { lines.push(`[OK] ${message}`); },
    warn: (message) => { lines.push(`[WARN] ${message}`); },
    info: (message) => { lines.push(message); },
  };
}

export function git(cwd: string, ...args: string[]): string {
  const result = run('git', ['-C', cwd, ...args]);
  if (result.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

// A git repository on main; with commit it has one commit.
export function createGitRepository(path: string, options: { commit?: boolean; bare?: boolean } = {}): void {
  mkdirSync(path, { recursive: true });
  if (options.bare) {
    const result = run('git', ['init', '--quiet', '--bare', '--initial-branch=main', path]);
    if (result.code !== 0) throw new Error(result.stderr);
    return;
  }
  git(path, 'init', '--quiet', '--initial-branch=main');
  git(path, 'config', 'user.name', 'Test');
  git(path, 'config', 'user.email', 'test@example.com');
  git(path, 'config', 'core.autocrlf', 'false');
  if (options.commit) {
    writeFileSync(join(path, 'README.md'), '# Test\n');
    git(path, 'add', 'README.md');
    git(path, 'commit', '--quiet', '-m', 'First');
  }
}

export interface TofuCall {
  command: string;
  args: string[];
  bootstrap: string | undefined;
  githubToken: string | undefined;
  planPath: string | undefined;
  planJson: string | undefined;
  stdio: 'inherit' | undefined;
}

export interface TofuMock {
  calls: TofuCall[];
  resourceChanges: unknown[];
  // Distinct resource_changes arrays, one per plan, before resourceChanges applies.
  plans: unknown[][];
  savedPlans: Map<string, string>;
  // tofu subcommands, or 'gh', mapped to the exit code they fail with.
  exitCodes: Record<string, number>;
  ghCalls: number;
  repositoryName: string;
  cloneUrl: string;
  ghToken: string;
  commands(): string[];
}

// Records every tofu call with its subcommand, arguments, and the bootstrap variable it
// was given. `plan` saves its resource_changes as plan JSON under its -out path, so show
// and apply record the exact saved plan; `output` returns cloneUrl as the http_clone_url
// of repositoryName. `gh auth token` returns ghToken. Every other command really runs.
export function tofuMock(options: { repositoryName?: string; cloneUrl?: string } = {}): { mock: TofuMock; runner: Runner } {
  const mock: TofuMock = {
    calls: [],
    resourceChanges: [],
    plans: [],
    savedPlans: new Map(),
    exitCodes: {},
    ghCalls: 0,
    repositoryName: options.repositoryName ?? '',
    cloneUrl: options.cloneUrl ?? '',
    ghToken: 'test-token',
    commands: () => mock.calls.map((call) => call.command),
  };

  const result = (code: number, stdout = ''): ProcessResult => ({ code, stdout, stderr: code ? `tofu failed with ${code}` : '', found: true });

  const runner: Runner = (command, args, processOptions = {}) => {
    if (command === 'gh' && args[0] === 'auth' && args[1] === 'token') {
      mock.ghCalls += 1;
      return mock.exitCodes.gh ? result(mock.exitCodes.gh) : result(0, `${mock.ghToken}\n`);
    }
    if (command !== 'tofu') return run(command, args, processOptions);

    const subcommand = args.filter((arg) => !arg.startsWith('-chdir='))[0];
    const planPath = subcommand === 'plan'
      ? args.find((arg) => arg.startsWith('-out='))?.replace(/^-out=/, '')
      : subcommand === 'show' || subcommand === 'apply' ? args.at(-1) : undefined;
    mock.calls.push({
      command: subcommand,
      args,
      bootstrap: processOptions.env?.TF_VAR_bootstrap_repositories,
      githubToken: processOptions.env?.GITHUB_TOKEN,
      planPath,
      planJson: planPath ? mock.savedPlans.get(planPath) : undefined,
      stdio: processOptions.stdio,
    });

    const code = mock.exitCodes[subcommand] ?? 0;
    if (code !== 0) return result(code);
    switch (subcommand) {
      case 'plan': {
        const changes = mock.plans.length ? mock.plans.shift() : mock.resourceChanges;
        const json = JSON.stringify({ resource_changes: changes });
        mock.savedPlans.set(planPath!, json);
        writeFileSync(planPath!, json);
        return result(0);
      }
      case 'show': return result(0, readFileSync(planPath!, 'utf8'));
      case 'output': return result(0, JSON.stringify({ [mock.repositoryName]: { http_clone_url: mock.cloneUrl } }));
      default: return result(0);
    }
  };
  return { mock, runner };
}

export interface CommandCall {
  // As formatCommand shows it, such as 'npm test'.
  command: string;
  cwd: string | undefined;
}

// Records the project commands it is asked to run; each exits with exitCodes[command] or 0.
export function commandMock(exitCodes: Record<string, number> = {}): { calls: CommandCall[]; runCommand: CommandRunner } {
  const calls: CommandCall[] = [];
  return {
    calls,
    runCommand: (command, options = {}) => {
      const display = formatCommand(command);
      calls.push({ command: display, cwd: options.cwd });
      return { code: exitCodes[display] ?? 0, stdout: '', stderr: '', found: true };
    },
  };
}

// A PATH whose first folder holds a do-nothing tofu, so the availability check passes;
// the calls themselves go to tofuMock.
export function pathWithTofu(t: TestContext): string {
  const bin = join(tempDir(t), 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'tofu'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  writeFileSync(join(bin, 'tofu.cmd'), '@exit /b 0\r\n');
  return `${bin}${delimiter}${process.env.PATH ?? process.env.Path ?? ''}`;
}

// The scripts' environment without the variables they read, plus any overrides.
export function testEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of ['TF_VAR_state_passphrase', 'TF_VAR_bootstrap_repositories', 'GITHUB_TOKEN']) delete env[name];
  return { ...env, ...overrides };
}

export function testContext(root: string, overrides: Partial<Context> = {}): Context & { log: MemoryLog } {
  const log = memoryLog();
  return { root, env: testEnv(), run, runCommand, ...overrides, log: (overrides.log as MemoryLog | undefined) ?? log };
}
