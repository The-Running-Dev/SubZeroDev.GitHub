// Creates projects with createProject --local-only against a throwaway root, then adds a
// language to them with addProjectLanguage.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import type { TestContext } from 'node:test';
import { addProjectLanguage, run } from '../scripts/add-project-language.ts';
import { formatCommand } from '../scripts/lib/process.ts';
import { languageCommands } from '../scripts/lib/project.ts';
import type { Language } from '../scripts/lib/project.ts';
import { createProject } from '../scripts/new-project.ts';
import { createGitRepository, git, pathWithGraphify, testContext, testEnv, testRoot, tofuMock } from './helpers.ts';

const read = (path: string) => readFileSync(path, 'utf8');

// Every file in the project except .git, with its content hash.
function snapshot(project: string): string[] {
  return readdirSync(project, { recursive: true, encoding: 'utf8' })
    .map((relative) => relative.replace(/\\/g, '/'))
    .filter((relative) => !/^\.git(\/|$)/.test(relative) && statSync(join(project, relative)).isFile())
    .map((relative) => `${relative} ${createHash('sha256').update(readFileSync(join(project, relative))).digest('hex')}`)
    .sort();
}

function setup(t: TestContext, language?: Language, create = true) {
  const root = testRoot(t);
  const project = join(dirname(root), 'Example.Project');
  if (create) {
    createProject({
      name: 'Example.Project', path: project, language, localOnly: true, skipValidation: true,
      gitUserName: 'Test', gitUserEmail: 'test@example.com',
    }, testContext(root));
  }
  // Each call gets a fresh log, so its output is only its own.
  const add = (language: Language, path = project) => {
    const ctx = testContext(root);
    addProjectLanguage({ path, language }, ctx);
    return ctx.log.text();
  };
  return { root, project, add };
}

describe('addProjectLanguage on a project created without a language', () => {
  test('adds the starter, commands and .gitignore lines, and keeps the history and user files', (t) => {
    const { project, add } = setup(t);
    const design = '# Design\n\nOur own notes.\n';
    writeFileSync(join(project, 'docs/design.md'), design);
    git(project, 'add', 'docs/design.md');
    git(project, 'commit', '--quiet', '-m', 'Add design notes');
    const head = git(project, 'rev-parse', 'HEAD');
    writeFileSync(join(project, 'notes.txt'), 'untracked');
    const architecture = read(join(project, 'docs/architecture.md'));

    const output = add('node');

    assert.ok(existsSync(join(project, 'package.json')));
    assert.ok(existsSync(join(project, 'src/index.ts')));
    for (const file of ['README.md', 'CLAUDE.md', 'AGENTS.md']) {
      const content = read(join(project, file));
      assert.ok(content.includes('npm test'), file);
      assert.doesNotMatch(content, /not selected yet|has not been selected yet/i, file);
    }
    assert.match(read(join(project, '.gitignore')), /# Node specific/);

    assert.equal(git(project, 'rev-parse', 'HEAD'), head);
    assert.equal(git(project, 'rev-list', '--all').split('\n').length, 2);
    assert.equal(git(project, 'branch', '--show-current'), 'main');
    assert.equal(read(join(project, 'docs/design.md')), design);
    assert.equal(read(join(project, 'notes.txt')), 'untracked');
    assert.equal(read(join(project, 'docs/architecture.md')), architecture);
    assert.match(output, /Nothing was committed/);
  });

  test('changes nothing when run again with the same language', (t) => {
    const { project, add } = setup(t);
    const head = git(project, 'rev-parse', 'HEAD');
    add('node');
    const before = snapshot(project);

    assert.match(add('node'), /already has the node setup; nothing to change/);
    assert.deepEqual(snapshot(project), before);
    assert.equal(git(project, 'rev-parse', 'HEAD'), head);
  });

  test('writes nothing and names the file when a commands section was edited', (t) => {
    const { project, add } = setup(t);
    const readme = join(project, 'README.md');
    writeFileSync(readme, read(readme).replace(/Not selected yet\./, 'We will use Elixir.'));
    const before = snapshot(project);

    assert.throws(() => add('node'), /Nothing was changed[\s\S]*README\.md/);
    assert.deepEqual(snapshot(project), before);
  });

  test('writes nothing and names the file when a starter file already exists with other content', (t) => {
    const { project, add } = setup(t);
    writeFileSync(join(project, 'package.json'), '{ "name": "mine" }');
    const before = snapshot(project);

    assert.throws(() => add('node'), /Nothing was changed[\s\S]*package\.json already exists/);
    assert.deepEqual(snapshot(project), before);
  });

  for (const [language, file] of [['csharp', 'Example.Project.slnx'], ['rust', 'Cargo.toml'], ['java', 'pom.xml'], ['go', 'go.mod']] as const) {
    test(`adds the ${language} starter, commands and .gitignore section`, (t) => {
      const { project, add } = setup(t);

      assert.doesNotMatch(add(language), /starter yet/);
      assert.ok(existsSync(join(project, file)), file);
      assert.match(read(join(project, '.gitignore')), /specific/);
      assert.ok(read(join(project, 'README.md')).includes(formatCommand(languageCommands(language).test)));
    });
  }

  test('refuses a language it does not know', (t) => {
    const { root, project } = setup(t);
    const before = snapshot(project);

    assert.throws(() => run(['--path', project, '--language', 'cobol'], testContext(root)), /--language/);
    assert.deepEqual(snapshot(project), before);
  });
});

describe('addProjectLanguage on a project that already has a language', () => {
  test('changes nothing for the same language', (t) => {
    const { project, add } = setup(t, 'node');
    const before = snapshot(project);

    assert.match(add('node'), /nothing to change/);
    assert.deepEqual(snapshot(project), before);
  });

  test('refuses a different language and writes nothing', (t) => {
    const { project, add } = setup(t, 'node');
    const before = snapshot(project);

    assert.throws(() => add('csharp'), /Nothing was changed/);
    assert.deepEqual(snapshot(project), before);
  });
});

describe('addProjectLanguage and the Graphify code graph', () => {
  // Adds node with a graphify stand-in on PATH; the calls go to tofuMock.
  function addWithGraphify(t: TestContext, root: string, project: string, exitCodes: Record<string, number> = {}) {
    const { mock, runner } = tofuMock();
    Object.assign(mock.exitCodes, exitCodes);
    const ctx = testContext(root, { env: testEnv({ PATH: pathWithGraphify(t) }), run: runner });
    addProjectLanguage({ path: project, language: 'node' }, ctx);
    return { mock, output: ctx.log.text() };
  }

  test('rebuilds an existing graph after adding the starter', (t) => {
    const { root, project } = setup(t);
    mkdirSync(join(project, 'graphify-out'));

    const { mock, output } = addWithGraphify(t, root, project);
    assert.deepEqual(mock.graphifyCalls, [{ args: ['update', '.'], cwd: project }]);
    assert.ok(existsSync(join(project, 'graphify-out', 'GRAPH_REPORT.md')));
    assert.match(output, /Code graph written to graphify-out\/[\s\S]*node added to Example\.Project/);
    assert.ok(existsSync(join(project, 'package.json')));
  });

  test('builds no graph for a project that has none', (t) => {
    const { root, project } = setup(t);
    const { mock, output } = addWithGraphify(t, root, project);
    assert.deepEqual(mock.graphifyCalls, []);
    assert.ok(!existsSync(join(project, 'graphify-out')));
    assert.doesNotMatch(output, /Graphify/);
  });

  test('leaves the graph alone when there is nothing to change', (t) => {
    const { root, project, add } = setup(t);
    add('node');
    mkdirSync(join(project, 'graphify-out'));
    const { mock } = addWithGraphify(t, root, project);
    assert.deepEqual(mock.graphifyCalls, []);
  });

  test('warns, and keeps the added files, when the rebuild fails', (t) => {
    const { root, project } = setup(t);
    mkdirSync(join(project, 'graphify-out'));
    const { output } = addWithGraphify(t, root, project, { 'graphify update .': 1 });
    assert.match(output, /'graphify update \.' exited with code 1/);
    assert.ok(existsSync(join(project, 'package.json')));
  });
});

describe('addProjectLanguage refuses a folder that is not a project root', () => {
  test('refuses a folder that is not a git repository', (t) => {
    const { project, add } = setup(t, undefined, false);
    mkdirSync(project);
    assert.throws(() => add('node'), /is not a git repository/);
    assert.deepEqual(readdirSync(project), []);
  });

  test('refuses a subfolder of a repository', (t) => {
    const { project, add } = setup(t, undefined, false);
    createGitRepository(project, { commit: true });
    const sub = join(project, 'sub');
    mkdirSync(sub);
    assert.throws(() => add('node', sub), /is not the root/);
    assert.deepEqual(readdirSync(sub), []);
  });

  test('refuses a folder that does not exist', (t) => {
    const { add } = setup(t, undefined, false);
    assert.throws(() => add('node'), /does not exist/);
  });
});
