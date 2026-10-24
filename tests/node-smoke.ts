// Builds, tests, lints and starts a real, locally scaffolded Node project.
//
// Requires Git, Node.js 22.18+ and npm (including registry access). Deletes the whole
// workspace on success or failure. No GitHub credentials, OpenTofu or repository
// publishing are needed.
//
//   node tests/node-smoke.ts

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultContext } from '../scripts/lib/context.ts';
import { run } from '../scripts/lib/process.ts';
import type { Runner } from '../scripts/lib/process.ts';
import { main } from '../scripts/lib/runtime.ts';
import { createProject } from '../scripts/new-project.ts';

const name = 'Node.Smoke';

function git(cwd: string, ...args: string[]): string {
  const result = run('git', ['-C', cwd, ...args]);
  if (result.code !== 0) throw new Error(`Command failed (${result.code}): git ${args.join(' ')}\n${result.stderr}`);
  return result.stdout.trim();
}

// Fixed npm command lines only; a shell finds npm.cmd on Windows.
function npm(cwd: string, args: string, options: { check?: boolean } = {}): { code: number; output: string } {
  const result = spawnSync(`npm ${args}`, { cwd, shell: true, encoding: 'utf8', windowsHide: true });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if ((options.check ?? true) && result.status !== 0) {
    process.stdout.write(output);
    throw new Error(`Command failed (${result.status}): npm ${args}`);
  }
  return { code: result.status ?? 1, output };
}

// Fail locally if scaffolding ever regresses into trying to publish.
const guarded: Runner = (command, args, options) => {
  if (command === 'tofu') throw new Error('The Node smoke test must not invoke OpenTofu.');
  if (command === 'gh') throw new Error('The Node smoke test must not invoke GitHub.');
  return run(command, args, options);
};

function smoke(): void {
  const workspace = mkdtempSync(join(tmpdir(), 'node-smoke-'));
  const root = join(workspace, 'scaffolder');
  const project = join(workspace, 'project with spaces');
  try {
    mkdirSync(join(root, 'repositories'), { recursive: true });
    // Installation happens below; pre-install validation would only warn about missing dependencies.
    createProject({
      name, language: 'node', path: project, localOnly: true, skipValidation: true,
      gitUserName: 'Node Smoke', gitUserEmail: 'node-smoke@example.com',
    }, { ...defaultContext(), root, run: guarded });

    if (git(project, 'branch', '--show-current') !== 'main') throw new Error('The scaffold must be initialized on main.');
    if (git(project, 'rev-list', '--count', 'HEAD') !== '1') throw new Error('The scaffold must have exactly one initial commit.');
    if (git(project, 'status', '--porcelain')) throw new Error('The initial scaffold must have a clean working tree.');
    if (git(project, 'remote')) throw new Error('The local scaffold must not have a remote.');
    if (readdirSync(join(root, 'repositories')).length) throw new Error('Local scaffolding must not write repository definitions.');
    const badEndings = git(project, 'ls-files', '--eol').split('\n')
      .filter((line) => !/^i\/(lf|none)\s/.test(line) || !/\sw\/(lf|none)\s/.test(line));
    if (badEndings.length) throw new Error(`Scaffold files must have LF endings: ${badEndings.join('\n')}`);
    for (const file of ['AGENTS.md', 'CLAUDE.md']) {
      if (!existsSync(join(project, file))) throw new Error(`Missing client instructions: ${file}`);
    }

    for (const args of ['install --no-audit --no-fund', 'run build', 'test', 'run lint']) {
      process.stdout.write(npm(project, args).output);
    }

    // Prove the tools detect real failures, rather than passing with no effective checks.
    const failingTest = join(project, 'tests/smoke-failure.test.ts');
    writeFileSync(failingTest, "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\ntest('smoke failure', () => { assert.equal(1, 2); });\n");
    try {
      const result = npm(project, 'test', { check: false });
      if (result.code === 0 || !result.output.includes('ERR_ASSERTION')) {
        process.stdout.write(result.output);
        throw new Error('npm test did not reject the intentional failing assertion as expected.');
      }
      console.log('Confirmed: npm test rejects a failing assertion.');
    } finally {
      rmSync(failingTest, { force: true });
    }

    const lintFailure = join(project, 'src/smoke-lint-failure.ts');
    writeFileSync(lintFailure, 'const unused: number = 1;\n');
    try {
      const result = npm(project, 'run lint', { check: false });
      if (result.code === 0 || !result.output.includes('@typescript-eslint/no-unused-vars')) {
        process.stdout.write(result.output);
        throw new Error('npm run lint did not reject the unused TypeScript variable as expected.');
      }
      console.log('Confirmed: npm run lint rejects an unused TypeScript variable.');
    } finally {
      rmSync(lintFailure, { force: true });
    }

    const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')) as { main?: string };
    if (pkg.main !== 'dist/index.js' || !existsSync(join(project, pkg.main))) {
      throw new Error('package.json main must reference the compiled entry point.');
    }
    if (existsSync(join(project, 'dist/tests'))) throw new Error('Tests must not be emitted in the application build.');

    // Starting without source proves both the entry point and its imports use dist/.
    renameSync(join(project, 'src'), join(workspace, 'source-away'));
    const startup = npm(project, 'start');
    process.stdout.write(startup.output);
    if (!startup.output.split(/\r?\n/).includes(`Welcome to ${name}`)) {
      throw new Error('The compiled application did not print its greeting.');
    }

    console.log('Node smoke test passed (including expected test/lint failures and startup without source).');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

await main(smoke);
