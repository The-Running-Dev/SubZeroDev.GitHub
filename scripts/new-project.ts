// Scaffolds a new project locally, then creates its GitHub repository and pushes it.
//
// 1. Writes the project into --path: directory structure, .gitignore, .gitattributes,
//    .env.example, README.md, docs/architecture.md, the first ADR, CLAUDE.md and/or
//    AGENTS.md, and the language starter (scripts/starters/<language>.ts).
// 2. Optionally runs the build and test commands and reports the result.
// 3. Initializes git on main and commits the scaffold.
// 4. Runs new-repository.ts with the path, which creates the repository with the standard
//    settings, pushes main, and switches the Main ruleset on.
//
// Without --language the implementation language stays undecided: the common files are
// written without any commands, and no starter or validation runs. Add the language
// later with add-project-language.ts.
//
// --local-only stops after step 3. --plan-only runs steps 1-3 and shows the OpenTofu plan
// without applying it; the scaffold stays on disk, and new-repository.ts --path can
// publish it later.
//
//   node scripts/new-project.ts --name SubZeroDev.Thing --language node --description 'Does a thing'
//   node scripts/new-project.ts --name SubZeroDev.Thing --language python --local-only
//   node scripts/new-project.ts --name SubZeroDev.Thing --local-only

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Context } from './lib/context.ts';
import { defaultContext } from './lib/context.ts';
import { choiceOption, listOption, parseOptions, requiredOption } from './lib/options.ts';
import {
  assertCommandAvailable, assertName, createInitialCommit, createProjectStructure, initializeProjectGit,
  languageCommands, languages, runLanguageStarter, testProjectCommand, writeAdr, writeAgentsInstructions,
  writeArchitecture, writeClaudeInstructions, writeEnvExample, writeGitattributes, writeGitignore, writeReadme,
} from './lib/project.ts';
import type { Language } from './lib/project.ts';
import { isMain, main } from './lib/runtime.ts';
import { createRepository } from './new-repository.ts';

export const clients = ['both', 'claude-code', 'codex'] as const;
export type Client = (typeof clients)[number];

export interface ProjectOptions {
  name: string;
  // Omit to defer the choice; add-project-language.ts applies it later.
  language?: Language;
  // Project folder. Defaults to a sibling of this repository named after the project.
  path?: string;
  description?: string;
  visibility?: 'public' | 'private';
  topics?: string[];
  // "context" or "context@integration_id".
  requiredChecks?: string[];
  client?: Client;
  // Commit identity for this repository only; the global git config is used when omitted.
  gitUserName?: string;
  gitUserEmail?: string;
  skipLanguageStarter?: boolean;
  skipValidation?: boolean;
  // Scaffold and commit, but do not create the GitHub repository.
  localOnly?: boolean;
  // Scaffold and commit, then show the GitHub plan without applying it.
  planOnly?: boolean;
}

export function createProject(options: ProjectOptions, ctx: Context): void {
  const { name, language, client = 'both', localOnly = false, planOnly = false } = options;
  const { root, log } = ctx;
  assertName(name);
  const commands = language ? languageCommands(language) : undefined;

  // Everything that can stop the run is checked before anything is written.
  assertCommandAvailable('git', 'Install Git and make sure it is on PATH.', ctx.env);

  const path = resolve(options.path ?? join(dirname(root), name));
  if (existsSync(path)) throw new Error(`${path} already exists. Choose another --path, or publish it with new-repository.ts --path.`);

  if (!localOnly) {
    assertCommandAvailable('tofu', 'Install OpenTofu: https://opentofu.org/docs/intro/install/', ctx.env);
    const passphrase = ctx.env.TF_VAR_state_passphrase;
    if (!passphrase || passphrase.length < 16) {
      throw new Error('Set TF_VAR_state_passphrase (16+ characters) before running, or pass --local-only.');
    }
    if (existsSync(join(root, 'repositories', `${name}.yaml`))) {
      throw new Error(`repositories/${name}.yaml already exists; ${name} is already managed here.`);
    }
  }

  log.step(`Scaffolding ${name} (${language ?? 'language deferred'}) in ${path}`);
  mkdirSync(path, { recursive: true });
  createProjectStructure(path);
  writeGitignore(path, language);
  writeGitattributes(path);
  writeEnvExample(path);
  writeReadme(path, name, commands);
  writeArchitecture(path, name);
  writeAdr(path);
  if (client !== 'codex') writeClaudeInstructions(path, name, commands);
  if (client !== 'claude-code') writeAgentsInstructions(path, name, commands);
  log.success('Common files written');

  initializeProjectGit(ctx.run, log, path, options.gitUserName, options.gitUserEmail);

  if (!language) {
    log.warn(`Implementation language deferred: no starter, no commands, and no build or test validation. Add it later with: node scripts/add-project-language.ts --path '${path}' --language <language>`);
  } else if (!options.skipLanguageStarter) {
    if (!runLanguageStarter(log, language, path, name)) {
      log.warn(`There is no ${language} starter yet; only the common files were written.`);
    }
  }

  if (commands && !options.skipValidation) {
    if (testProjectCommand(ctx.shell, log, path, commands.build) && testProjectCommand(ctx.shell, log, path, commands.test)) {
      log.success('Build and tests passed');
    } else {
      log.warn(`Build or tests did not pass. Dependencies may not be installed yet: ${commands.install}`);
    }
  }

  log.step('Committing the scaffold');
  createInitialCommit(ctx.run, path);
  log.success('Initial commit created on main');

  if (localOnly) {
    log.success(`${name} scaffolded at ${path}. Publish it later with: node scripts/new-repository.ts --name ${name} --path '${path}'`);
    return;
  }

  createRepository({
    name,
    description: options.description,
    visibility: options.visibility,
    topics: options.topics,
    requiredChecks: options.requiredChecks,
    path,
    planOnly,
  }, ctx);

  log.success(planOnly ? `Plan shown, nothing applied. ${name} stays scaffolded at ${path}.` : `${name} created and pushed from ${path}`);
}

export const cliOptions = {
  name: { type: 'string' },
  language: { type: 'string' },
  path: { type: 'string' },
  description: { type: 'string' },
  visibility: { type: 'string' },
  topics: { type: 'string', multiple: true },
  'required-check': { type: 'string', multiple: true },
  client: { type: 'string' },
  'git-user-name': { type: 'string' },
  'git-user-email': { type: 'string' },
  'skip-language-starter': { type: 'boolean' },
  'skip-validation': { type: 'boolean' },
  'local-only': { type: 'boolean' },
  'plan-only': { type: 'boolean' },
} as const;

export function run(args: string[], ctx: Context = defaultContext()): void {
  const values = parseOptions(cliOptions, args);
  createProject({
    name: requiredOption(values.name, 'name'),
    language: values.language === undefined ? undefined : choiceOption(values.language, 'language', languages, 'node'),
    path: values.path,
    description: values.description,
    visibility: choiceOption(values.visibility, 'visibility', ['public', 'private'] as const, 'public'),
    topics: listOption(values.topics),
    requiredChecks: listOption(values['required-check']),
    client: choiceOption(values.client, 'client', clients, 'both'),
    gitUserName: values['git-user-name'],
    gitUserEmail: values['git-user-email'],
    skipLanguageStarter: values['skip-language-starter'],
    skipValidation: values['skip-validation'],
    localOnly: values['local-only'],
    planOnly: values['plan-only'],
  }, ctx);
}

if (isMain(import.meta.url)) await main(() => run(process.argv.slice(2)));
