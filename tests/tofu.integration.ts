// Needs OpenTofu, so it runs on its own (npm run test:tofu) and is skipped where tofu is
// not installed. The github provider is mocked inside tofu test, so nothing here needs a
// token or the real state.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { findExecutable, run } from '../scripts/lib/process.ts';
import type { ProcessResult } from '../scripts/lib/process.ts';
import { createRepository } from '../scripts/new-repository.ts';
import { createGitRepository, repositoryRoot, testContext, testEnv, tofuMock } from './helpers.ts';

const tofu = findExecutable('tofu');
const skip = tofu ? false : 'tofu is not installed';
// Any 16+ characters satisfy validation; tofu test sets its own passphrase.
const env = testEnv({ TF_VAR_state_passphrase: 'test-passphrase-0123' });
const realTofu = (...args: string[]): ProcessResult => run(tofu!, [`-chdir=${repositoryRoot}`, ...args, '-no-color'], { env });

describe('OpenTofu configuration', { skip }, () => {
  let init: ProcessResult;
  before(() => { init = realTofu('init', '-input=false', '-backend=false'); });

  test('initializes', () => {
    assert.equal(init.code, 0, init.stdout + init.stderr);
  });

  test('is formatted', () => {
    const result = realTofu('fmt', '-check', '-recursive', '-diff');
    assert.equal(result.code, 0, result.stdout + result.stderr);
  });

  test('validates', () => {
    const result = realTofu('validate');
    assert.equal(result.code, 0, result.stdout + result.stderr);
  });

  test('passes tofu test (standard settings, Main ruleset, bootstrap, definitions)', () => {
    const result = realTofu('test');
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Success! \d+ passed, 0 failed/);
  });
});

describe('Definitions written by new-repository.ts, as OpenTofu reads them', { skip }, () => {
  let decoded: {
    description: string; visibility: string; topics: unknown[]; auto_init: unknown;
    required_checks: { context: string; integration_id?: unknown }[];
  };

  const folder = mkdtempSync(join(tmpdir(), 'subzerodev-'));
  after(() => rmSync(folder, { recursive: true, force: true }));

  before(() => {
    const root = join(folder, 'root');
    mkdirSync(join(root, 'repositories'), { recursive: true });
    const local = join(folder, 'local');
    const remote = join(folder, 'remote.git');
    createGitRepository(local, { commit: true });
    createGitRepository(remote, { bare: true });
    const { runner } = tofuMock({ repositoryName: 'Example.Repository', cloneUrl: remote });
    createRepository({
      name: 'Example.Repository',
      description: "It's: a [thing] # not a comment",
      visibility: 'private',
      topics: ['TypeScript', 'yes', '123'],
      requiredChecks: ['build / Result@15368', 'lint: strict'],
      path: local,
    }, testContext(root, { env: testEnv({ TF_VAR_state_passphrase: 'test-passphrase-0123', GITHUB_TOKEN: 'test-token' }), run: runner }));

    const definition = join(root, 'repositories', 'Example.Repository.yaml').replace(/\\/g, '/');
    const empty = join(folder, 'console');
    mkdirSync(empty);
    const result = spawnSync(tofu!, [`-chdir=${empty}`, 'console', '-no-color'], {
      input: `jsonencode(yamldecode(file("${definition}")))\n`, encoding: 'utf8', env, windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr);
    decoded = JSON.parse(JSON.parse(result.stdout.trim()) as string) as typeof decoded;
  });

  test('keeps the description verbatim', () => {
    assert.equal(decoded.description, "It's: a [thing] # not a comment");
  });

  test('keeps visibility', () => {
    assert.equal(decoded.visibility, 'private');
  });

  test('keeps topics as strings, even ones YAML would read as booleans or numbers', () => {
    assert.deepEqual(decoded.topics, ['typescript', 'yes', '123']);
  });

  test('keeps required checks and their integration_id as a number', () => {
    assert.deepEqual(decoded.required_checks, [
      { context: 'build / Result', integration_id: 15368 },
      { context: 'lint: strict' },
    ]);
  });

  test('turns auto_init off as a boolean', () => {
    assert.equal(decoded.auto_init, false);
  });
});
