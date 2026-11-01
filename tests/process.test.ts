import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import type { TestContext } from 'node:test';
import { commandInvocation, formatCommand, runCommand } from '../scripts/lib/process.ts';
import { languageCommands, languages } from '../scripts/lib/project.ts';
import { tempDir } from './helpers.ts';

// A PATH folder holding a batch file `tool.cmd`, and on POSIX an executable `tool`, that
// both exit with their first argument.
function toolFolder(t: TestContext): string {
  const bin = join(tempDir(t), 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'tool.cmd'), '@exit /b %1\r\n');
  writeFileSync(join(bin, 'tool'), '#!/bin/sh\nexit "$1"\n', { mode: 0o755 });
  return bin;
}

describe('formatCommand', () => {
  test('joins the program and arguments as a person would type them', () => {
    assert.equal(formatCommand(['npm', 'run', 'build']), 'npm run build');
    assert.equal(formatCommand(['cargo', 'clippy', '--all-targets', '--', '-D', 'warnings']), 'cargo clippy --all-targets -- -D warnings');
  });

  test('quotes an argument that holds a space', () => {
    assert.equal(formatCommand(['node', '-e', 'console.log(1)', 'two words']), 'node -e console.log(1) "two words"');
  });
});

describe('commandInvocation', () => {
  test('is undefined when the program is not on PATH', (t) => {
    assert.equal(commandInvocation(['tool'], { PATH: tempDir(t) }, 'win32'), undefined);
  });

  test('starts a Windows batch file through cmd.exe with its arguments', (t) => {
    const bin = toolFolder(t);
    const invocation = commandInvocation(['tool', 'run', 'build'], { PATH: bin, ComSpec: 'C:\\Windows\\cmd.exe' }, 'win32');
    assert.deepEqual(invocation, {
      file: 'C:\\Windows\\cmd.exe',
      args: ['/d', '/s', '/c', `""${join(bin, 'tool.cmd')}" run build"`],
      verbatim: true,
    });
  });

  for (const argument of ['a&b', 'a|b', 'a>b', '%PATH%', 'a^b', '"quoted"', 'two words', '!x!', '(a)']) {
    test(`refuses to pass ${argument} to a batch file`, (t) => {
      assert.throws(() => commandInvocation(['tool', argument], { PATH: toolFolder(t) }, 'win32'), /cmd\.exe would read it as syntax/);
    });
  }

  test('refuses a batch file whose path cmd.exe would expand', (t) => {
    const bin = join(tempDir(t), '100%');
    mkdirSync(bin);
    writeFileSync(join(bin, 'tool.cmd'), '@exit /b 0\r\n');
    assert.throws(() => commandInvocation(['tool'], { PATH: bin }, 'win32'), /contains a character cmd\.exe would expand/);
  });

  test('starts any other program directly, with arguments untouched', (t) => {
    const bin = join(tempDir(t), 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'tool.exe'), '');
    assert.deepEqual(commandInvocation(['tool', 'a&b', 'two words'], { PATH: bin }, 'win32'), {
      file: join(bin, 'tool.exe'), args: ['a&b', 'two words'], verbatim: false,
    });
  });

  test('finds cmd.exe however the environment spells ComSpec', (t) => {
    const invocation = commandInvocation(['tool'], { PATH: toolFolder(t), COMSPEC: 'C:\\Windows\\cmd.exe' }, 'win32');
    assert.equal(invocation?.file, 'C:\\Windows\\cmd.exe');
  });

  test('accepts every argument of the language table', () => {
    for (const language of languages) {
      for (const command of Object.values(languageCommands(language))) {
        for (const argument of command.slice(1)) assert.match(argument, /^[A-Za-z0-9_@+=,.:/\\-]+$/, `${language}: ${formatCommand(command)}`);
      }
    }
  });
});

describe('runCommand', () => {
  test('runs a batch file and returns its exit code', (t) => {
    const env = { ...process.env, PATH: toolFolder(t) };
    assert.equal(runCommand(['tool', '3'], { env }).code, 3);
    assert.equal(runCommand(['tool', '0'], { env }).code, 0);
  });

  test('passes shell syntax to a program as plain text', (t) => {
    const path = tempDir(t);
    const result = runCommand(['node', '-e', 'console.log(process.argv[1])', 'a&b|c>out.txt'], { cwd: path });
    assert.equal(result.code, 0);
    assert.equal(result.stdout.trim(), 'a&b|c>out.txt');
  });

  test('reports a program that is not on PATH', () => {
    const result = runCommand(['definitely-not-a-command-xyz']);
    assert.equal(result.found, false);
    assert.match(result.stderr, /'definitely-not-a-command-xyz' was not found on PATH/);
  });
});
