// Adds the implementation language to a project that was created without one.
//
// Writes the language starter (scripts/starters/<language>.ts), appends the language's
// .gitignore lines, and replaces the undecided commands section of README.md, CLAUDE.md
// and AGENTS.md with the language's commands.
//
// Every change is planned before anything is written. A starter file is only created
// where no file exists, and a commands section is only replaced while it is still the
// undecided one new-project.ts wrote. If a starter file already exists with other
// content, or a commands section was edited or removed, nothing is written and each
// conflict is listed. Running it again with the same language changes nothing.
//
// Nothing is committed, so the history and the current branch stay as they are; review
// the changes and commit them through the usual pull request.
//
//   node scripts/add-project-language.ts --path ../SubZeroDev.Thing --language node

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { Context } from './lib/context.ts';
import { defaultContext } from './lib/context.ts';
import { writeProjectFile } from './lib/files.ts';
import { choiceOption, parseOptions, requiredOption } from './lib/options.ts';
import {
  assertCommandAvailable, assertName, gitignoreSection, languageCommands, languages, runLanguageStarter,
  updateCommandsSection,
} from './lib/project.ts';
import type { Language, SectionStyle } from './lib/project.ts';
import { isMain, main } from './lib/runtime.ts';

export interface LanguageOptions {
  // The project's folder: the root of its git repository.
  path: string;
  language: Language;
  // Passed to the starter for package and module names. Defaults to the folder name.
  name?: string;
}

interface Document {
  relativePath: string;
  style: SectionStyle;
  heading: string;
}

const documents: Document[] = [
  { relativePath: 'README.md', style: 'readme', heading: 'Commands' },
  { relativePath: 'CLAUDE.md', style: 'instructions', heading: 'Commands' },
  { relativePath: 'AGENTS.md', style: 'instructions', heading: 'Essential Commands' },
];

export function addProjectLanguage(options: LanguageOptions, ctx: Context): void {
  const { language } = options;
  const { log } = ctx;
  if (options.name !== undefined) assertName(options.name);
  assertCommandAvailable('git', 'Install Git and make sure it is on PATH.', ctx.env);

  const path = resolve(options.path);
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`${path} does not exist.`);
  const cdup = ctx.run('git', ['-C', path, 'rev-parse', '--show-cdup']);
  if (cdup.code !== 0) throw new Error(`${path} is not a git repository.`);
  if (cdup.stdout.trim()) throw new Error(`${path} is not the root of its git repository.`);
  const name = options.name ?? basename(path);

  const commands = languageCommands(language);
  const newFiles: string[] = [];
  const readyDocuments: Document[] = [];
  const conflicts: string[] = [];

  // The starter writes into a scratch folder first, so nothing in the project is overwritten.
  const staging = mkdtempSync(join(tmpdir(), 'starter-'));
  try {
    log.step(`Planning ${language} for ${name} in ${path}`);
    runLanguageStarter(log, language, staging, name);
    const staged = readdirSync(staging, { recursive: true, encoding: 'utf8' })
      .map((relative) => relative.replace(/\\/g, '/'))
      .filter((relative) => statSync(join(staging, relative)).isFile())
      .sort();
    for (const relative of staged) {
      const target = join(path, relative);
      if (!existsSync(target)) newFiles.push(relative);
      else if (!readFileSync(target).equals(readFileSync(join(staging, relative)))) {
        conflicts.push(`${relative} already exists with different content`);
      }
    }

    for (const document of documents) {
      const state = updateCommandsSection(path, document.relativePath, document.style, document.heading, commands);
      if (state === 'Ready') readyDocuments.push(document);
      else if (state === 'Conflict') {
        conflicts.push(`${document.relativePath} has no undecided commands section to replace; it was edited, removed, or lists other commands`);
      }
    }

    const section = gitignoreSection(language);
    const gitignorePath = join(path, '.gitignore');
    const gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8').replace(/\r\n/g, '\n') : '';
    const appendGitignore = !!section && !gitignore.split('\n').includes(section.split('\n')[0]);

    if (conflicts.length) {
      throw new Error(`Nothing was changed. Resolve each of these, then run again:\n  - ${conflicts.join('\n  - ')}`);
    }

    if (!newFiles.length && !readyDocuments.length && !appendGitignore) {
      log.success(`${name} already has the ${language} setup; nothing to change.`);
      return;
    }

    log.step(`Adding ${language} to ${name}`);
    for (const relative of newFiles) {
      const target = join(path, relative);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(staging, relative), target);
      log.info(`  created  ${relative}`);
    }
    for (const document of readyDocuments) {
      updateCommandsSection(path, document.relativePath, document.style, document.heading, commands, true);
      log.info(`  updated  ${document.relativePath} commands`);
    }
    if (appendGitignore) {
      const content = gitignore.trim() ? `${gitignore.replace(/\n+$/, '')}\n\n${section}` : section;
      writeProjectFile(path, '.gitignore', content, { force: true });
      log.info('  updated  .gitignore');
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }

  log.success(`${language} added to ${name}. Nothing was committed: review the changes, run ${commands.install}, ${commands.build} and ${commands.test}, then commit.`);
}

export const cliOptions = {
  path: { type: 'string' },
  language: { type: 'string' },
  name: { type: 'string' },
} as const;

export function run(args: string[], ctx: Context = defaultContext()): void {
  const values = parseOptions(cliOptions, args);
  addProjectLanguage({
    path: requiredOption(values.path, 'path'),
    language: choiceOption(requiredOption(values.language, 'language'), 'language', languages, 'node'),
    name: values.name,
  }, ctx);
}

if (isMain(import.meta.url)) await main(() => run(process.argv.slice(2)));
