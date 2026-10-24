import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import type { TestContext } from 'node:test';
import { writeProjectFile } from '../scripts/lib/files.ts';
import {
  assertCommandAvailable, commandsSection, createInitialCommit, createProjectStructure, gitignoreSection,
  initializeProjectGit, runLanguageStarter, testProjectCommand, today, updateCommandsSection,
  writeAdr, writeAgentsInstructions, writeArchitecture, writeClaudeInstructions, writeEnvExample,
  writeGitattributes, writeGitignore, writeReadme,
} from '../scripts/lib/project.ts';
import type { Commands, Language } from '../scripts/lib/project.ts';
import { run, runShell } from '../scripts/lib/process.ts';
import { git, memoryLog, tempDir } from './helpers.ts';

const commands: Commands = { install: 'install-cmd', build: 'build-cmd', test: 'test-cmd', lint: 'lint-cmd', run: 'run-cmd' };
const commonFiles = ['README.md', 'CLAUDE.md', 'AGENTS.md', 'docs/architecture.md', 'docs/decisions/0001-initial-project-setup.md'];

function writeCommonFiles(path: string, projectCommands?: Commands): void {
  writeReadme(path, 'Example.Project', projectCommands);
  writeArchitecture(path, 'Example.Project');
  writeAdr(path);
  writeClaudeInstructions(path, 'Example.Project', projectCommands);
  writeAgentsInstructions(path, 'Example.Project', projectCommands);
}

function read(path: string, relativePath: string): string {
  return readFileSync(join(path, relativePath), 'utf8');
}

function fenceCount(content: string): number {
  return content.split('\n').filter((line) => line.trim().startsWith('```')).length;
}

describe('writeProjectFile', () => {
  test('writes UTF-8 without BOM, with LF endings and one trailing newline', (t) => {
    const path = tempDir(t);
    writeProjectFile(path, 'file.txt', 'one\r\ntwo\n\n\n');
    const bytes = readFileSync(join(path, 'file.txt'));
    assert.notEqual(bytes[0], 0xef);
    assert.equal(bytes.toString('utf8'), 'one\ntwo\n');
  });

  test('writes empty content as an empty file', (t) => {
    const path = tempDir(t);
    writeProjectFile(path, 'empty.txt', '');
    assert.equal(readFileSync(join(path, 'empty.txt')).length, 0);
  });

  test('creates parent folders', (t) => {
    const path = tempDir(t);
    writeProjectFile(path, 'deep/er/file.md', 'x');
    assert.ok(existsSync(join(path, 'deep/er/file.md')));
  });

  test('keeps an existing file unless forced', (t) => {
    const path = tempDir(t);
    const log = memoryLog();
    writeProjectFile(path, 'file.txt', 'original');
    writeProjectFile(path, 'file.txt', 'replacement', { log });
    assert.equal(read(path, 'file.txt'), 'original\n');
    assert.match(log.text(), /File already exists: file\.txt \(skipped\)/);

    writeProjectFile(path, 'file.txt', 'replacement', { force: true });
    assert.equal(read(path, 'file.txt'), 'replacement\n');
  });
});

describe('createProjectStructure', () => {
  test('creates the standard folders', (t) => {
    const path = tempDir(t);
    createProjectStructure(path);
    for (const directory of ['src', 'tests', 'docs/decisions', '.github']) assert.ok(existsSync(join(path, directory)), directory);
  });
});

describe('writeGitignore', () => {
  const markers: Record<string, string> = { python: '*.pyc', node: '.npm/', csharp: '*.user', java: '.gradle/', rust: 'Cargo.lock' };

  for (const [language, marker] of Object.entries(markers)) {
    test(`adds the ${language} section`, (t) => {
      const path = tempDir(t);
      writeGitignore(path, language as Language);
      const content = read(path, '.gitignore');
      assert.ok(content.split('\n').includes(marker), marker);
      assert.ok(content.split('\n').includes('.env'));
    });
  }

  test('has no language section for go', (t) => {
    const path = tempDir(t);
    writeGitignore(path, 'go');
    const content = read(path, '.gitignore');
    assert.doesNotMatch(content, /specific/);
    assert.match(content, /^\.env$/m);
    assert.equal(gitignoreSection('go'), '');
  });
});

describe('common files with commands', () => {
  function scaffold(t: TestContext): string {
    const path = tempDir(t);
    createProjectStructure(path);
    writeGitattributes(path);
    writeEnvExample(path);
    writeCommonFiles(path, commands);
    return path;
  }

  test('writes .gitattributes and .env.example, never .env', (t) => {
    const path = scaffold(t);
    assert.equal(read(path, '.gitattributes'), '* text=auto eol=lf\n');
    assert.ok(existsSync(join(path, '.env.example')));
    assert.ok(!existsSync(join(path, '.env')));
  });

  test('names the project and every command in README, CLAUDE and AGENTS', (t) => {
    const path = scaffold(t);
    for (const file of ['README.md', 'CLAUDE.md', 'AGENTS.md']) {
      const content = read(path, file);
      assert.ok(content.includes('Example.Project'), file);
      for (const command of Object.values(commands)) assert.ok(content.includes(command), `${file}: ${command}`);
    }
  });

  test('balances the README fences', (t) => {
    const path = scaffold(t);
    assert.equal(fenceCount(read(path, 'README.md')) % 2, 0);
  });

  test("dates the architecture page and the ADR with today's date", (t) => {
    const path = scaffold(t);
    const date = today();
    assert.match(read(path, 'docs/architecture.md'), new RegExp(`Example\\.Project Architecture[\\s\\S]*${date}`));
    assert.ok(read(path, 'docs/decisions/0001-initial-project-setup.md').includes(date));
  });

  test('writes no carriage returns', (t) => {
    const path = scaffold(t);
    for (const file of [...commonFiles, '.gitattributes', '.env.example']) assert.ok(!read(path, file).includes('\r'), file);
  });
});

describe('common files while the language is undecided', () => {
  test('say the language is not chosen and list no commands', (t) => {
    const path = tempDir(t);
    writeCommonFiles(path);
    for (const file of ['README.md', 'CLAUDE.md', 'AGENTS.md']) {
      const content = read(path, file);
      assert.ok(content.includes('Example.Project'), file);
      assert.match(content, /not selected yet|has not been selected yet/i, file);
      assert.doesNotMatch(content, /\*\*(Install|Build|Test):\*\*|## (Install|Build|Test|Lint)\b/i, file);
    }
    assert.ok(read(path, 'docs/architecture.md').includes('Architecture'));
    assert.equal(fenceCount(read(path, 'README.md')) % 2, 0);
  });
});

describe('updateCommandsSection', () => {
  function undecided(t: TestContext): string {
    const path = tempDir(t);
    writeClaudeInstructions(path, 'Example.Project');
    return path;
  }
  const afterEnd = (content: string) => content.slice(content.indexOf('<!-- END project-commands -->'));

  test('reports Ready without writing unless applied', (t) => {
    const path = undecided(t);
    const before = read(path, 'CLAUDE.md');
    assert.equal(updateCommandsSection(path, 'CLAUDE.md', 'instructions', 'Commands', commands), 'Ready');
    assert.equal(read(path, 'CLAUDE.md'), before);
  });

  test('replaces the undecided section and keeps the rest', (t) => {
    const path = undecided(t);
    const before = read(path, 'CLAUDE.md');
    assert.equal(updateCommandsSection(path, 'CLAUDE.md', 'instructions', 'Commands', commands, true), 'Ready');
    const after = read(path, 'CLAUDE.md');
    assert.ok(after.includes('- **Test:** `test-cmd`'));
    assert.ok(!after.includes('not been selected'));
    assert.equal(afterEnd(after), afterEnd(before));
    assert.equal(updateCommandsSection(path, 'CLAUDE.md', 'instructions', 'Commands', commands, true), 'Unchanged');
  });

  test('reports Conflict for an edited section and leaves it', (t) => {
    const path = undecided(t);
    writeFileSync(join(path, 'CLAUDE.md'), read(path, 'CLAUDE.md').replace('Do not guess', 'Please do not guess'));
    const before = read(path, 'CLAUDE.md');
    assert.equal(updateCommandsSection(path, 'CLAUDE.md', 'instructions', 'Commands', commands, true), 'Conflict');
    assert.equal(read(path, 'CLAUDE.md'), before);
  });

  test('reports Conflict without markers', (t) => {
    const path = tempDir(t);
    writeFileSync(join(path, 'CLAUDE.md'), '# Mine\n');
    assert.equal(updateCommandsSection(path, 'CLAUDE.md', 'instructions', 'Commands', commands, true), 'Conflict');
  });

  test('reports Missing for a missing file', (t) => {
    const path = undecided(t);
    assert.equal(updateCommandsSection(path, 'AGENTS.md', 'instructions', 'Essential Commands', commands), 'Missing');
  });

  test('frames a section in its markers', () => {
    const section = commandsSection('readme', 'Commands', commands);
    assert.ok(section.startsWith('<!-- BEGIN project-commands -->\n## Install'));
    assert.ok(section.endsWith('\n<!-- END project-commands -->'));
  });
});

describe('runLanguageStarter', () => {
  for (const language of ['csharp', 'rust', 'java', 'go'] as const) {
    test(`has no starter for ${language}`, (t) => {
      const path = tempDir(t);
      assert.equal(runLanguageStarter(memoryLog(), language, path, 'Example.Project'), false);
      assert.deepEqual(readdirSync(path), []);
    });
  }

  test('writes the Node starter', (t) => {
    const path = tempDir(t);
    assert.equal(runLanguageStarter(memoryLog(), 'node', path, 'SubZeroDev.Thing'), true);
    for (const file of ['package.json', 'tsconfig.json', 'tsconfig.test.json', 'eslint.config.js', '.prettierrc.json', 'src/index.ts', 'src/greeting.ts', 'tests/index.test.ts']) {
      assert.ok(existsSync(join(path, file)), file);
    }
    assert.equal(JSON.parse(read(path, 'package.json')).name, 'subzerodev-thing');
  });

  test('writes the Python starter', (t) => {
    const path = tempDir(t);
    assert.equal(runLanguageStarter(memoryLog(), 'python', path, 'Example.Project'), true);
    for (const file of ['requirements.txt', 'requirements-dev.txt', 'setup.py', 'pyproject.toml', 'pytest.ini', '.flake8', 'src/__init__.py', 'src/main.py', 'tests/__init__.py', 'tests/test_main.py']) {
      assert.ok(existsSync(join(path, file)), file);
    }
  });
});

describe('testProjectCommand', () => {
  test('is true when the command exits 0', (t) => {
    const path = tempDir(t);
    assert.equal(testProjectCommand(runShell, memoryLog(), path, 'node -e "console.log(1)"'), true);
  });

  test('is false on a non-zero exit', (t) => {
    const path = tempDir(t);
    const log = memoryLog();
    assert.equal(testProjectCommand(runShell, log, path, 'node -e "process.exit(3)"'), false);
    assert.match(log.text(), /exited with code 3/);
  });

  test('is false when the runner throws', (t) => {
    const path = tempDir(t);
    const log = memoryLog();
    assert.equal(testProjectCommand(() => { throw new Error('boom'); }, log, path, 'anything'), false);
    assert.match(log.text(), /'anything' failed: boom/);
  });

  test('is false for a command that does not exist', (t) => {
    const path = tempDir(t);
    assert.equal(testProjectCommand(runShell, memoryLog(), path, 'definitely-not-a-command-xyz'), false);
  });

  test('runs in the project folder', (t) => {
    const path = tempDir(t);
    testProjectCommand(runShell, memoryLog(), path, 'node -e "require(\'fs\').writeFileSync(\'ran.txt\', \'\')"');
    assert.ok(existsSync(join(path, 'ran.txt')));
  });
});

describe('git', () => {
  test('initializes on main, commits the scaffold and leaves a clean tree', (t) => {
    const path = tempDir(t);
    createProjectStructure(path);
    initializeProjectGit(run, memoryLog(), path, 'Pester', 'pester@example.com');
    git(path, 'config', 'core.autocrlf', 'false');
    createInitialCommit(run, path);

    assert.equal(git(path, 'branch', '--show-current'), 'main');
    assert.equal(git(path, 'config', 'user.name'), 'Pester');
    assert.equal(git(path, 'config', 'user.email'), 'pester@example.com');
    const tracked = git(path, 'ls-files').split('\n');
    assert.ok(tracked.includes('src/.gitkeep'));
    assert.ok(tracked.includes('tests/.gitkeep'));
    assert.equal(git(path, 'rev-list', '--count', 'HEAD'), '1');
    assert.equal(git(path, 'log', '-1', '--format=%s'), 'Initial project scaffold');
    assert.equal(git(path, 'status', '--porcelain'), '');
  });

  test('throws with the exit code when git fails', (t) => {
    const path = join(tempDir(t), 'missing/nested/path');
    assert.throws(() => createInitialCommit(run, path), /exit code/);
  });
});

describe('assertCommandAvailable', () => {
  test('passes for git', () => {
    assertCommandAvailable('git', 'Install it.');
  });

  test('names a missing command', () => {
    assert.throws(() => assertCommandAvailable('definitely-not-a-command-xyz', 'Install it.'), {
      message: "'definitely-not-a-command-xyz' was not found. Install it.",
    });
  });
});
