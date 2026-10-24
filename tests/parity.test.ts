// Temporary, while the PowerShell scripts still exist: scaffolds the same projects with
// New-Project.ps1 and new-project.ts and requires identical working trees. Skipped
// where pwsh is not installed.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { addProjectLanguage } from '../scripts/add-project-language.ts';
import { findExecutable, run } from '../scripts/lib/process.ts';
import type { Language } from '../scripts/lib/project.ts';
import { createProject } from '../scripts/new-project.ts';
import type { Client } from '../scripts/new-project.ts';
import { git, repositoryRoot, tempDir, testContext } from './helpers.ts';

const pwsh = findExecutable('pwsh');
const psClients: Record<Client, string> = { both: 'Both', 'claude-code': 'ClaudeCode', codex: 'Codex' };

// Every file except .git, with dates normalized, keyed by its relative path.
function tree(project: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const relative of readdirSync(project, { recursive: true, encoding: 'utf8' }).sort()) {
    const normalized = relative.replace(/\\/g, '/');
    if (/^\.git(\/|$)/.test(normalized) || !statSync(join(project, relative)).isFile()) continue;
    files[normalized] = readFileSync(join(project, relative), 'utf8').replace(/\d{4}-\d{2}-\d{2}/g, 'YYYY-MM-DD');
  }
  return files;
}

const cases: { language?: Language; client: Client }[] = [
  ...(['node', 'python', 'csharp', 'rust', 'java', 'go'] as const).map((language) => ({ language, client: 'both' as const })),
  { client: 'both' },
  { language: 'node', client: 'claude-code' },
  { language: 'node', client: 'codex' },
  { client: 'claude-code' },
  { client: 'codex' },
];

describe('new-project.ts matches New-Project.ps1', { skip: pwsh ? false : 'pwsh is not installed' }, () => {
  for (const { language, client } of cases) {
    test(`${language ?? 'no language'}, client ${client}`, (t) => {
      const folder = tempDir(t);
      const name = 'Parity.Project';
      const powershell = join(folder, 'ps', name);
      const node = join(folder, 'node', name);

      const result = run(pwsh!, [
        '-NoProfile', '-NonInteractive', '-File', join(repositoryRoot, 'scripts', 'New-Project.ps1'),
        '-Name', name, '-Path', powershell, '-Client', psClients[client], '-LocalOnly', '-SkipValidation',
        '-GitUserName', 'Pester', '-GitUserEmail', 'pester@example.com',
        ...(language ? ['-Language', language] : []),
      ]);
      assert.equal(result.code, 0, result.stderr);

      createProject({
        name, path: node, language, client, localOnly: true, skipValidation: true,
        gitUserName: 'Pester', gitUserEmail: 'pester@example.com',
      }, testContext(repositoryRoot));

      assert.deepEqual(tree(node), tree(powershell));
      assert.equal(git(node, 'ls-files', '--eol'), git(powershell, 'ls-files', '--eol'));
      assert.equal(git(node, 'log', '--format=%s|%an|%ae'), git(powershell, 'log', '--format=%s|%an|%ae'));
      assert.equal(git(node, 'branch', '--show-current'), git(powershell, 'branch', '--show-current'));
    });
  }
});

describe('add-project-language.ts matches Add-ProjectLanguage.ps1', { skip: pwsh ? false : 'pwsh is not installed' }, () => {
  for (const language of ['node', 'python', 'go'] as const) {
    test(language, (t) => {
      const folder = tempDir(t);
      const name = 'Parity.Project';
      const powershell = join(folder, 'ps', name);
      const node = join(folder, 'node', name);
      for (const path of [powershell, node]) {
        createProject({
          name, path, localOnly: true, skipValidation: true, gitUserName: 'Pester', gitUserEmail: 'pester@example.com',
        }, testContext(repositoryRoot));
      }

      const result = run(pwsh!, [
        '-NoProfile', '-NonInteractive', '-File', join(repositoryRoot, 'scripts', 'Add-ProjectLanguage.ps1'),
        '-Path', powershell, '-Language', language,
      ]);
      assert.equal(result.code, 0, result.stderr);
      addProjectLanguage({ path: node, language }, testContext(repositoryRoot));

      assert.deepEqual(tree(node), tree(powershell));
      assert.equal(git(node, 'status', '--porcelain'), git(powershell, 'status', '--porcelain'));
    });
  }
});
