// Runs build/Test-Documentation.ps1 against Markdown fixtures in throwaway folders, with
// its own rules file, so the gate's link, anchor, terminology and generated-file checks
// are pinned without depending on this repository's documents.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import type { TestContext } from 'node:test';
import { findExecutable } from '../scripts/lib/process.ts';
import { repositoryRoot, tempDir } from './helpers.ts';

const pwsh = findExecutable('pwsh');
const script = join(repositoryRoot, 'build', 'Test-Documentation.ps1');
const skip = pwsh ? false : 'pwsh is not on PATH';

const rules = `@{
  Terminology = @( @{ Required = 'GitHub'; Variants = @('Github') } )
  ExcludedSegments = @('node_modules')
  ExcludedFiles = @()
}`;

interface GateResult {
  code: number | null;
  output: string;
}

function write(folder: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, relative)), { recursive: true });
    writeFileSync(join(folder, relative), content);
  }
}

// Writes the files into a docs/ folder and runs the gate over it with the given rules.
function gate(t: TestContext, files: Record<string, string>, options: { args?: string[]; settings?: string } = {}): Promise<GateResult> {
  const folder = tempDir(t);
  const docs = join(folder, 'docs');
  write(docs, files);
  const settings = join(folder, 'rules.psd1');
  writeFileSync(settings, options.settings ?? rules);
  const args = ['-NoProfile', '-NonInteractive', '-File', script, '-Path', docs, '-SettingsPath', settings, ...(options.args ?? [])];
  return new Promise((resolve, reject) => {
    const child = spawn(pwsh!, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}

function assertPassed(result: GateResult, files: number): void {
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, new RegExp(`passed across ${files} Markdown file\\(s\\)`));
}

function assertFailed(result: GateResult, errors: number): void {
  assert.notEqual(result.code, 0, result.output);
  assert.match(result.output, new RegExp(`failed with ${errors} error\\(s\\)`));
}

describe('Test-Documentation.ps1 links', { skip, concurrency: true }, () => {
  test('passes documents whose relative links, anchors and files all resolve', async (t) => {
    assertPassed(await gate(t, {
      'guide.md': [
        '# Guide',
        '',
        '## Set up',
        '',
        'See [usage](reference/usage.md#options), [above](#set-up) and ![diagram](diagram.png).',
        'Nested [parentheses](file(1).md), [angle brackets](<my file.md>) and [encoding](my%20file.md).',
        '',
        '[usage]: reference/usage.md',
        '',
      ].join('\n'),
      'reference/usage.md': '# Usage\n\n## Options\n',
      'file(1).md': '# One\n',
      'my file.md': '# Spaced\n',
      'diagram.png': 'png',
    }), 4);
  });

  test('reports a missing link target with its file, line and column', async (t) => {
    const result = await gate(t, { 'guide.md': '# Guide\n\nSee [usage](missing.md).\n' });
    assertFailed(result, 1);
    assert.match(result.output, /guide\.md:3:13 \[Error\] MarkdownLink: Link target 'missing\.md' does not exist\./);
  });

  test('reports a missing reference definition target and an angle-bracket target', async (t) => {
    const result = await gate(t, { 'guide.md': '# Guide\n\nSee [other](<other file.md>).\n\n[usage]: missing.md\n' });
    assertFailed(result, 2);
    assert.match(result.output, /Link target 'other file\.md' does not exist/);
    assert.match(result.output, /guide\.md:5:10 \[Error\] MarkdownLink: Link target 'missing\.md' does not exist/);
  });

  test('reports an anchor that no heading produces, in another document or the same one', async (t) => {
    const result = await gate(t, {
      'guide.md': '# Guide\n\nSee [usage](usage.md#flags) and [this](#nowhere).\n',
      'usage.md': '# Usage\n\n## Options\n',
    });
    assertFailed(result, 2);
    assert.match(result.output, /\[Error\] MarkdownAnchor: Link target 'usage\.md' has no heading producing the anchor '#flags'\./);
    assert.match(result.output, /\[Error\] MarkdownAnchor: No heading in this document produces the anchor '#nowhere'\./);
  });

  test('leaves external and site-absolute links unchecked', async (t) => {
    assertPassed(await gate(t, {
      'guide.md': '# Guide\n\n[a](https://example.com/missing) [b](mailto:someone@example.com) [c](/docs/missing) <https://example.com/x>\n',
    }), 1);
  });

  test('ignores links inside fenced and inline code', async (t) => {
    assertPassed(await gate(t, {
      'guide.md': '# Guide\n\n```md\n[a](missing.md)\n```\n\n~~~\n[b](missing.md)\n~~~\n\nRun `[c](missing.md)` as is.\n',
    }), 1);
  });

  test('skips folders named in ExcludedSegments', async (t) => {
    assertPassed(await gate(t, {
      'guide.md': '# Guide\n',
      'node_modules/package/README.md': '# Package\n\n[broken](missing.md)\n',
    }), 1);
  });
});

describe('Test-Documentation.ps1 heading anchors', { skip, concurrency: true }, () => {
  test('produces the anchors GitHub and Docusaurus generate', async (t) => {
    assertPassed(await gate(t, {
      'guide.md': [
        '# Guide',
        '',
        '## The `--path` option',
        '## Phase 1 — Fixes',
        '## Setup',
        '## Setup',
        '## Renamed {#custom-id}',
        '## [Linked](https://example.com) heading',
        '## *Bold* and _italic_',
        '',
        '[a](#the---path-option) [b](#phase-1--fixes) [c](#setup) [d](#setup-1) [e](#custom-id)',
        '[f](#linked-heading) [g](#bold-and-italic) [h](#GUIDE)',
        '',
      ].join('\n'),
    }), 1);
  });

  test('gives no anchor to a heading inside a fence, and keeps doubled hyphens', async (t) => {
    const result = await gate(t, {
      'guide.md': '# Guide\n\n## Phase 1 — Fixes\n\n```md\n## Fenced\n```\n\n[a](#fenced) [b](#phase-1-fixes) [c](#renamed)\n\n## Renamed {#custom-id}\n',
    });
    assertFailed(result, 3);
    for (const anchor of ['fenced', 'phase-1-fixes', 'renamed']) {
      assert.match(result.output, new RegExp(`produces the anchor '#${anchor}'`));
    }
  });
});

describe('Test-Documentation.ps1 terminology', { skip, concurrency: true }, () => {
  test('reports a variant as a warning that does not fail the gate', async (t) => {
    const result = await gate(t, { 'guide.md': '# Guide\n\nHosted on Github.\n' });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /guide\.md:3:11 \[Warning\] Terminology: Use 'GitHub' instead of 'Github'\./);
    assert.match(result.output, /passed across 1 Markdown file\(s\), with 1 warning\(s\)/);
  });

  test('fails on a warning with -TreatWarningsAsErrors', async (t) => {
    const result = await gate(t, { 'guide.md': '# Guide\n\nHosted on Github.\n' }, { args: ['-TreatWarningsAsErrors'] });
    assert.notEqual(result.code, 0, result.output);
    assert.match(result.output, /failed with 1 warning\(s\) \(-TreatWarningsAsErrors\)/);
  });

  test('ignores variants in code, link targets, URLs and longer words', async (t) => {
    const result = await gate(t, {
      'guide.md': '# Guide\n\nRun `Github` with [GitHub](https://Github.com/x), https://Github.com/y and Github-Actions.\n\n```text\nGithub\n```\n',
    });
    assertPassed(result, 1);
    assert.doesNotMatch(result.output, /Warning/);
  });
});

describe('Test-Documentation.ps1 generated files', { skip, concurrency: true }, () => {
  // A generator that prefixes each source line, and rules that check out.md against it.
  function generated(t: TestContext, committed: string, source: string | null = 'one\ntwo\n') {
    const folder = tempDir(t);
    write(folder, {
      'generate.ps1': 'param([string] $SourcePath, [string] $Prefix)\nGet-Content -LiteralPath $SourcePath | ForEach-Object { "$Prefix$_" }\n',
      'out.md': committed,
      ...(source === null ? {} : { 'source.txt': source }),
    });
    const quote = (path: string) => `'${join(folder, path).replace(/'/g, "''")}'`;
    const settings = rules.replace(/\}$/, `  GeneratedFiles = @( @{
    Path = ${quote('out.md')}; Source = ${quote('source.txt')}; Generator = ${quote('generate.ps1')}
    SourceParameter = 'SourcePath'; Arguments = @{ Prefix = '> ' }
  } )
}`);
    return gate(t, { 'guide.md': '# Guide\n' }, { settings });
  }

  test('passes when the committed copy matches the generator', async (t) => {
    assertPassed(await generated(t, '> one\r\n> two\r\n'), 1);
  });

  test('names the first line that differs', async (t) => {
    const result = await generated(t, '> one\n> TWO\n');
    assertFailed(result, 1);
    assert.match(result.output, /out\.md:2:1 \[Error\] GeneratedFile: Generated from '.*source\.txt' but the committed copy differs/);
  });

  test('reports a source that does not exist', async (t) => {
    const result = await generated(t, '> one\n', null);
    assertFailed(result, 1);
    assert.match(result.output, /\[Error\] GeneratedFile: Cannot check generated file: '.*source\.txt' does not exist\./);
  });
});
