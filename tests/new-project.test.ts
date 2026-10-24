// Calls createProject against a throwaway root, so the real repositories/ folder is never
// read or written. tofu is a recording stand-in and the "GitHub" remote is a local bare
// repository.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import type { TestContext } from 'node:test';
import { findExecutable } from '../scripts/lib/process.ts';
import { languageCommands, languages } from '../scripts/lib/project.ts';
import type { Language } from '../scripts/lib/project.ts';
import { createProject, run } from '../scripts/new-project.ts';
import type { ProjectOptions } from '../scripts/new-project.ts';
import {
  createGitRepository, git, pathWithTofu, shellMock, testContext, testEnv, testRoot, tofuMock,
} from './helpers.ts';

const name = 'Example.Project';
const identity = { gitUserName: 'Test', gitUserEmail: 'test@example.com' };
const publishEnv = { TF_VAR_state_passphrase: 'test-passphrase-0123', GITHUB_TOKEN: 'test-token' };
const commonFiles = [
  '.env.example', '.gitattributes', '.gitignore', 'AGENTS.md', 'CLAUDE.md', 'README.md',
  'docs/architecture.md', 'docs/decisions/0001-initial-project-setup.md', 'src/.gitkeep', 'tests/.gitkeep',
];
const starterFiles = [
  'package.json', 'tsconfig.json', 'eslint.config.js', 'requirements.txt', 'setup.py', 'pyproject.toml',
  'src/index.ts', 'src/main.py', 'tests/index.test.ts', 'tests/test_main.py',
];
const read = (path: string) => readFileSync(path, 'utf8');
const lines = (output: string) => (output ? output.split('\n') : []);

function setup(t: TestContext, options: { env?: NodeJS.ProcessEnv; exitCodes?: Record<string, number>; cloneUrl?: string } = {}) {
  const root = testRoot(t);
  const project = join(dirname(root), name);
  const { mock, runner } = tofuMock({ repositoryName: name, cloneUrl: options.cloneUrl });
  const { calls: shellCalls, shell } = shellMock(options.exitCodes);
  const ctx = testContext(root, { env: testEnv(options.env), run: runner, shell });
  const create = (options: Partial<ProjectOptions> = {}) => createProject({ name, path: project, ...identity, ...options }, ctx);
  return { root, project, mock, shellCalls, ctx, create };
}

function assertSingleCleanCommit(project: string) {
  assert.equal(git(project, 'branch', '--show-current'), 'main');
  assert.equal(lines(git(project, 'rev-list', '--all')).length, 1);
  assert.equal(git(project, 'log', '-1', '--format=%s|%an|%ae'), 'Initial project scaffold|Test|test@example.com');
  assert.equal(git(project, 'status', '--porcelain'), '');
  assert.equal(git(project, 'remote'), '');
}

describe('createProject --local-only', () => {
  const cases: { language: Language; starterFile?: string; testCommand: string }[] = [
    { language: 'node', starterFile: 'package.json', testCommand: 'npm test' },
    { language: 'python', starterFile: 'src/main.py', testCommand: 'pytest' },
    { language: 'csharp', testCommand: 'dotnet test' },
    { language: 'rust', testCommand: 'cargo test' },
    { language: 'java', testCommand: 'mvn test' },
    { language: 'go', testCommand: 'go test ./...' },
  ];
  for (const { language, starterFile, testCommand } of cases) {
    test(`scaffolds a ${language} project and commits it on main`, (t) => {
      const { create, project } = setup(t);
      create({ language, localOnly: true, skipValidation: true });

      const tracked = lines(git(project, 'ls-files'));
      for (const file of commonFiles) assert.ok(tracked.includes(file), file);
      if (starterFile) assert.ok(tracked.includes(starterFile), starterFile);
      assert.ok(read(join(project, 'README.md')).includes(testCommand));
      assertSingleCleanCommit(project);
    });
  }

  test('commits every file with LF endings', (t) => {
    const { create, project } = setup(t);
    create({ language: 'node', localOnly: true, skipValidation: true });
    assert.deepEqual(lines(git(project, 'ls-files', '--eol')).filter((line) => !/^i\/(lf|none)\s/.test(line)), []);
  });

  test('never touches the repositories folder', (t) => {
    const { create, root } = setup(t);
    create({ language: 'node', localOnly: true, skipValidation: true });
    assert.deepEqual(readdirSync(join(root, 'repositories')), []);
  });

  test('defaults the path to a sibling of the repository named after the project', (t) => {
    const { ctx, root } = setup(t);
    createProject({ name: 'Sibling.Project', language: 'go', ...identity, localOnly: true, skipValidation: true }, ctx);
    assert.ok(existsSync(join(dirname(root), 'Sibling.Project', 'README.md')));
  });

  for (const language of ['go', 'node'] as const) {
    for (const [client, expected, absent] of [['claude-code', 'CLAUDE.md', 'AGENTS.md'], ['codex', 'AGENTS.md', 'CLAUDE.md']] as const) {
      test(`writes only ${expected} for --client ${client} (${language})`, (t) => {
        const { create, project } = setup(t);
        create({ language, client, localOnly: true, skipValidation: true });
        assert.ok(existsSync(join(project, expected)));
        assert.ok(!existsSync(join(project, absent)));
      });
    }
  }

  test('leaves the starter out with --skip-language-starter', (t) => {
    const { create, project } = setup(t);
    create({ language: 'node', skipLanguageStarter: true, localOnly: true, skipValidation: true });
    assert.ok(!existsSync(join(project, 'package.json')));
    assert.ok(existsSync(join(project, 'README.md')));
  });

  test('warns when the language has no starter', (t) => {
    const { create, ctx } = setup(t);
    create({ language: 'csharp', localOnly: true, skipValidation: true });
    assert.match(ctx.log.text(), /There is no csharp starter yet/);
  });
});

describe('createProject without a language', () => {
  const everyCommand = languages.flatMap((language) => Object.values(languageCommands(language)));

  test('scaffolds the common files and commits them on main', (t) => {
    const { create, project } = setup(t);
    create({ localOnly: true });
    assert.deepEqual(lines(git(project, 'ls-files')), commonFiles);
    assertSingleCleanCommit(project);
  });

  test('writes no starter and invents no commands', (t) => {
    const { create, project } = setup(t);
    create({ localOnly: true });
    for (const file of starterFiles) assert.ok(!existsSync(join(project, file)), file);
    for (const file of ['README.md', 'CLAUDE.md', 'AGENTS.md']) {
      const content = read(join(project, file));
      for (const command of everyCommand) assert.ok(!content.includes(command), `${file} has ${command}`);
      assert.match(content, /not selected yet|has not been selected yet/i, file);
    }
    assert.doesNotMatch(read(join(project, '.gitignore')), /specific/i);
  });

  test('runs no build or test validation, and says the language is deferred', (t) => {
    const { create, ctx, shellCalls } = setup(t);
    create({ localOnly: true });
    const output = ctx.log.text();
    assert.match(output, /Implementation language deferred/);
    assert.match(output, /add-project-language\.ts/);
    assert.doesNotMatch(output, /Running:|Build and tests passed|Build or tests did not pass/);
    assert.deepEqual(shellCalls, []);
  });

  for (const [client, expected, absent] of [['claude-code', 'CLAUDE.md', 'AGENTS.md'], ['codex', 'AGENTS.md', 'CLAUDE.md']] as const) {
    test(`writes only ${expected} for --client ${client}`, (t) => {
      const { create, project } = setup(t);
      create({ client, localOnly: true });
      assert.ok(existsSync(join(project, expected)));
      assert.ok(!existsSync(join(project, absent)));
    });
  }
});

describe('createProject validation of the build and tests', () => {
  test('reports success when build and test exit 0', (t) => {
    const { create, ctx, project, shellCalls } = setup(t);
    create({ language: 'node', localOnly: true });
    assert.match(ctx.log.text(), /Build and tests passed/);
    assert.deepEqual(shellCalls.map((call) => call.command), ['npm run build', 'npm test']);
    assert.equal(lines(git(project, 'rev-list', '--all')).length, 1);
  });

  test('warns, and still commits, when the build fails', (t) => {
    const { create, ctx, project } = setup(t, { exitCodes: { 'npm run build': 1 } });
    create({ language: 'node', localOnly: true });
    assert.match(ctx.log.text(), /Build or tests did not pass/);
    assert.doesNotMatch(ctx.log.text(), /Build and tests passed/);
    assert.equal(lines(git(project, 'rev-list', '--all')).length, 1);
    assert.equal(git(project, 'status', '--porcelain'), '');
  });
});

describe('createProject refuses before writing anything', () => {
  const publishing = (t: TestContext, env: NodeJS.ProcessEnv = publishEnv) => setup(t, { env: { ...env, PATH: pathWithTofu(t) } });

  test('rejects a name GitHub would not accept', (t) => {
    const { ctx, project } = setup(t);
    assert.throws(() => createProject({ name: 'bad name', language: 'node', path: project, localOnly: true }, ctx), /may contain only/);
    assert.ok(!existsSync(project));
  });

  test('rejects a language it does not know', (t) => {
    const { ctx, project } = setup(t);
    assert.throws(() => run(['--name', name, '--language', 'cobol', '--path', project, '--local-only'], ctx), /--language/);
    assert.ok(!existsSync(project));
  });

  test('refuses a path that already exists', (t) => {
    const { create, project } = setup(t);
    mkdirSync(project);
    assert.throws(() => create({ language: 'node', localOnly: true }), /already exists/);
    assert.deepEqual(readdirSync(project), []);
  });

  for (const passphrase of [undefined, 'too-short']) {
    test(`refuses passphrase ${JSON.stringify(passphrase)} unless --local-only`, (t) => {
      const { create, mock, project } = publishing(t, { ...publishEnv, TF_VAR_state_passphrase: passphrase });
      assert.throws(() => create({ language: 'node', skipValidation: true }), /TF_VAR_state_passphrase/);
      assert.ok(!existsSync(project));
      assert.deepEqual(mock.calls, []);
    });
  }

  test('refuses a project that already has a repositories/<name>.yaml', (t) => {
    const { create, mock, project, root } = publishing(t);
    writeFileSync(join(root, 'repositories', `${name}.yaml`), "description: 'x'\n");
    assert.throws(() => create({ language: 'node', skipValidation: true }), /already managed here/);
    assert.ok(!existsSync(project));
    assert.deepEqual(mock.calls, []);
  });

  test('refuses without tofu unless --local-only', (t) => {
    // git stays reachable; nothing else does.
    const gitFolder = dirname(findExecutable('git')!);
    const { create, project } = setup(t, { env: { ...publishEnv, PATH: gitFolder, Path: gitFolder } });
    assert.throws(() => create({ language: 'node', skipValidation: true }), /^Error: 'tofu' was not found/);
    assert.ok(!existsSync(project));
  });
});

describe('createProject end to end, with GitHub stood in for', () => {
  function publishing(t: TestContext) {
    const context = setup(t, { env: { ...publishEnv, PATH: pathWithTofu(t) }, cloneUrl: 'pending' });
    const remote = join(dirname(context.root), 'remote.git');
    createGitRepository(remote, { bare: true });
    context.mock.cloneUrl = remote;
    return { ...context, remote };
  }

  test('writes the definition, creates the repository, pushes main, then activates the ruleset', (t) => {
    const { create, mock, ctx, root, project, remote } = publishing(t);
    create({
      language: 'node', description: 'Does a thing', topics: ['Node', 'tooling'],
      requiredChecks: ['build / Result@15368'], skipValidation: true,
    });

    assert.equal(read(join(root, 'repositories', `${name}.yaml`)), [
      "description: 'Does a thing'",
      'visibility: public',
      'topics:',
      "  - 'node'",
      "  - 'tooling'",
      'required_checks:',
      "  - context: 'build / Result'",
      '    integration_id: 15368',
      'auto_init: false',
      '',
    ].join('\n'));

    assert.deepEqual(mock.commands(), ['init', 'plan', 'show', 'apply', 'output', 'plan', 'show', 'apply']);
    const plans = mock.calls.filter((call) => call.command === 'plan');
    assert.equal(plans[0].bootstrap, `["${name}"]`);
    assert.equal(plans[1].bootstrap, undefined);

    assert.equal(git(project, 'remote', 'get-url', 'origin'), remote);
    assert.equal(git(remote, 'rev-parse', 'refs/heads/main'), git(project, 'rev-parse', 'HEAD'));
    assert.equal(ctx.env.TF_VAR_bootstrap_repositories, undefined);
  });

  test('publishes a project without a language through the same createRepository steps', (t) => {
    const { create, mock, root, project, remote } = publishing(t);
    create({ description: 'Does a thing' });

    assert.deepEqual(mock.commands(), ['init', 'plan', 'show', 'apply', 'output', 'plan', 'show', 'apply']);
    assert.match(read(join(root, 'repositories', `${name}.yaml`)), /auto_init: false/);
    assert.equal(git(remote, 'rev-parse', 'refs/heads/main'), git(project, 'rev-parse', 'HEAD'));
    assert.ok(!existsSync(join(project, 'package.json')));
  });

  test('with --plan-only scaffolds and commits, applies nothing, and removes the definition', (t) => {
    const { create, mock, root, project, remote } = publishing(t);
    create({ language: 'node', skipValidation: true, planOnly: true });

    assert.deepEqual(mock.commands(), ['init', 'plan', 'show']);
    assert.ok(!existsSync(join(root, 'repositories', `${name}.yaml`)));
    assert.equal(lines(git(project, 'rev-list', '--all')).length, 1);
    assert.equal(git(project, 'remote'), '');
    assert.equal(git(remote, 'for-each-ref', 'refs/heads'), '');
  });
});
