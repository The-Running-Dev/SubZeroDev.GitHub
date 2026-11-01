// Installs, builds, tests, lints and runs a real, locally scaffolded C#, Rust, Java or Go
// project, using the commands the scaffold writes into its README.
//
// Requires Git, Node.js 22.18+ and the language's toolchain on PATH, with access to its
// package registry: the .NET 10 SDK, Rust with Clippy, Java 21 with Maven, or Go 1.24+.
// Deletes the whole workspace on success or failure. No GitHub credentials, OpenTofu or
// repository publishing are needed. The Node starter has its own test, node-smoke.ts.
//
//   node tests/starter-smoke.ts csharp

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { defaultContext } from '../scripts/lib/context.ts';
import { formatCommand, run, runCommand } from '../scripts/lib/process.ts';
import type { CommandLine, Runner } from '../scripts/lib/process.ts';
import { languageCommands } from '../scripts/lib/project.ts';
import { main } from '../scripts/lib/runtime.ts';
import { createProject } from '../scripts/new-project.ts';
import { dotnetNamespace, javaPackage } from '../scripts/starters/names.ts';

const name = 'Starter.Smoke';

// A file that must make a command fail, and text its output must then include.
interface Probe {
  file: string;
  content: string;
  marker: string;
}

const javaPath = `src/test/java/${javaPackage(name).replace(/\./g, '/')}`;

const probes: Record<'csharp' | 'rust' | 'java' | 'go', { test: Probe; lint: Probe }> = {
  csharp: {
    test: {
      file: 'tests/SmokeFailureTests.cs',
      content: `namespace ${dotnetNamespace(name)}.Tests;\n\npublic class SmokeFailureTests\n{\n    [Fact]\n    public void Fails() => Assert.Equal(1, 2);\n}\n`,
      marker: 'Assert.Equal() Failure',
    },
    lint: {
      file: 'src/SmokeLintFailure.cs',
      content: `namespace ${dotnetNamespace(name)};\n\ninternal static class SmokeLintFailure\n{\n  public static int Value() => 1;\n}\n`,
      marker: 'WHITESPACE',
    },
  },
  rust: {
    test: {
      file: 'tests/smoke_failure.rs',
      content: '#[test]\nfn smoke_failure() {\n    assert_eq!(1, 2);\n}\n',
      marker: 'assertion `left == right` failed',
    },
    lint: {
      file: 'tests/smoke_lint.rs',
      content: '#[test]\nfn smoke_lint() {\n    let values: Vec<u8> = Vec::new();\n    assert!(values.len() == 0);\n}\n',
      marker: 'clippy::len_zero',
    },
  },
  java: {
    test: {
      file: `${javaPath}/SmokeFailureTest.java`,
      content: `package ${javaPackage(name)};\n\nimport static org.junit.jupiter.api.Assertions.assertEquals;\n\nimport org.junit.jupiter.api.Test;\n\nclass SmokeFailureTest {\n  @Test\n  void fails() {\n    assertEquals(1, 2);\n  }\n}\n`,
      marker: 'expected: <1> but was: <2>',
    },
    lint: {
      file: `${javaPath}/SmokeLintFailure.java`,
      content: `package ${javaPackage(name)};\n\nclass SmokeLintFailure {\n    int value() {\n        return 1;\n    }\n}\n`,
      marker: '[Indentation]',
    },
  },
  go: {
    test: {
      file: 'smoke_failure_test.go',
      content: 'package main\n\nimport "testing"\n\nfunc TestSmokeFailure(t *testing.T) {\n\tt.Fatal("intentional smoke failure")\n}\n',
      marker: 'intentional smoke failure',
    },
    lint: {
      file: 'smoke_lint.go',
      content: 'package main\n\nimport "fmt"\n\nfunc smokeLint() {\n\tfmt.Printf("%d\\n", "text")\n}\n',
      marker: 'fmt.Printf format %d has arg',
    },
  },
};
type StarterLanguage = keyof typeof probes;

function git(cwd: string, ...args: string[]): string {
  const result = run('git', ['-C', cwd, ...args]);
  if (result.code !== 0) throw new Error(`Command failed (${result.code}): git ${args.join(' ')}\n${result.stderr}`);
  return result.stdout.trim();
}

// Runs a command from languageCommands the way the scaffold's validation does, without a shell.
function execute(cwd: string, command: CommandLine, options: { check?: boolean } = {}): { code: number; output: string } {
  const result = runCommand(command, { cwd });
  const output = `${result.stdout}${result.stderr}`;
  if ((options.check ?? true) && result.code !== 0) {
    process.stdout.write(output);
    throw new Error(`Command failed (${result.code}): ${formatCommand(command)}`);
  }
  return { code: result.code, output };
}

// Fail locally if scaffolding ever regresses into trying to publish.
const guarded: Runner = (command, args, options) => {
  if (command === 'tofu') throw new Error('The starter smoke test must not invoke OpenTofu.');
  if (command === 'gh') throw new Error('The starter smoke test must not invoke GitHub.');
  return run(command, args, options);
};

// Proves a command detects a real failure, rather than passing with no effective checks.
function expectFailure(project: string, command: CommandLine, probe: Probe): void {
  const target = join(project, probe.file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, probe.content);
  try {
    const result = execute(project, command, { check: false });
    if (result.code === 0 || !result.output.includes(probe.marker)) {
      process.stdout.write(result.output);
      throw new Error(`${formatCommand(command)} did not reject ${probe.file} with "${probe.marker}" as expected.`);
    }
    console.log(`Confirmed: ${formatCommand(command)} rejects ${probe.file}.`);
  } finally {
    rmSync(target, { force: true });
  }
}

function smoke(language: StarterLanguage): void {
  const commands = languageCommands(language);
  const workspace = mkdtempSync(join(tmpdir(), `${language}-smoke-`));
  const root = join(workspace, 'scaffolder');
  const project = join(workspace, 'project with spaces');
  try {
    mkdirSync(join(root, 'repositories'), { recursive: true });
    // Installation happens below; pre-install validation would only warn about missing dependencies.
    createProject({
      name, language, path: project, localOnly: true, skipValidation: true,
      gitUserName: 'Starter Smoke', gitUserEmail: 'starter-smoke@example.com',
    }, { ...defaultContext(), root, run: guarded });

    if (git(project, 'rev-list', '--count', 'HEAD') !== '1') throw new Error('The scaffold must have exactly one initial commit.');
    if (git(project, 'status', '--porcelain')) throw new Error('The initial scaffold must have a clean working tree.');
    const badEndings = git(project, 'ls-files', '--eol').split('\n')
      .filter((line) => !/^i\/(lf|none)\s/.test(line) || !/\sw\/(lf|none)\s/.test(line));
    if (badEndings.length) throw new Error(`Scaffold files must have LF endings: ${badEndings.join('\n')}`);

    for (const command of [commands.install, commands.build, commands.test, commands.lint]) {
      console.log(`> ${formatCommand(command)}`);
      process.stdout.write(execute(project, command).output);
    }

    expectFailure(project, commands.test, probes[language].test);
    expectFailure(project, commands.lint, probes[language].lint);

    const startup = execute(project, commands.run);
    process.stdout.write(startup.output);
    if (!startup.output.split(/\r?\n/).includes(`Welcome to ${name}`)) {
      throw new Error(`${formatCommand(commands.run)} did not print the greeting.`);
    }

    // Build output must be ignored; Cargo.lock is the one file an application should commit.
    const untracked = git(project, 'status', '--porcelain', '--untracked-files=all').split('\n')
      .filter((line) => line && line !== '?? Cargo.lock');
    if (untracked.length) throw new Error(`The commands left files .gitignore does not cover:\n${untracked.join('\n')}`);

    console.log(`${language} smoke test passed (including expected test and lint failures).`);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

await main(() => {
  const language = process.argv[2];
  if (!language || !Object.hasOwn(probes, language)) {
    throw new Error(`Usage: node tests/starter-smoke.ts <${Object.keys(probes).join('|')}>`);
  }
  smoke(language as StarterLanguage);
});
