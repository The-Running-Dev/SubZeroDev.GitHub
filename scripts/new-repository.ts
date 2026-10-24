// Creates a GitHub repository with the standard settings and "Main" ruleset.
//
// Writes repositories/<name>.yaml, then plans and applies the whole configuration. The
// plan is refused if it would destroy or replace anything, unless --force is given.
// --target-scoped additionally checks each saved plan immediately before apply: only
// this repository and its Main ruleset may be created, then only that ruleset's
// enforcement may change from disabled to active. --force cannot bypass this guard.
//
// With --path, the repository is created empty, the ruleset is applied disabled, the
// local main branch is pushed, and the ruleset is then switched to active.
//
// Requires TF_VAR_state_passphrase (16+ characters). GITHUB_TOKEN is taken from
// `gh auth token` when it is not already set; it is passed to tofu only.
//
//   node scripts/new-repository.ts --name SubZeroDev.Thing --description 'Does a thing' --topics typescript,tooling
//   node scripts/new-repository.ts --name SubZeroDev.Thing --path ../SubZeroDev.Thing

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Context } from './lib/context.ts';
import { defaultContext } from './lib/context.ts';
import { choiceOption, listOption, parseOptions, requiredOption } from './lib/options.ts';
import { assertNonDestructivePlan, assertTargetScopedPlan } from './lib/plan-guard.ts';
import type { Phase, Plan } from './lib/plan-guard.ts';
import type { ProcessOptions } from './lib/process.ts';
import { assertName } from './lib/project.ts';
import { isMain, main, writeJson } from './lib/runtime.ts';
import { repositoryYaml } from './lib/yaml.ts';

export interface RepositoryOptions {
  name: string;
  description?: string;
  visibility?: 'public' | 'private';
  topics?: string[];
  // "context" or "context@integration_id".
  requiredChecks?: string[];
  // An existing local repository whose main branch is pushed as the initial history.
  path?: string;
  // Show the plan and stop without applying.
  planOnly?: boolean;
  // Restrict each saved plan to the requested creation / ruleset-activation transition.
  targetScoped?: boolean;
  // Overwrite an existing YAML file and allow a plan that destroys or replaces resources.
  force?: boolean;
}

// Callers such as AgentKit's /setup-project ask for this before relying on --target-scoped.
export const capabilities = { targetScoped: true };

export function createRepository(options: RepositoryOptions, ctx: Context): void {
  const { name, planOnly = false, targetScoped = false, force = false } = options;
  assertName(name);
  const { root } = ctx;
  const definition = join(root, 'repositories', `${name}.yaml`);
  const planFile = join(root, 'new-repository.tfplan');
  let creationApplied = false;
  let mainPushed = false;
  let applyStarted = false;

  const passphrase = ctx.env.TF_VAR_state_passphrase;
  if (!passphrase || passphrase.length < 16) {
    throw new Error('Set TF_VAR_state_passphrase (16+ characters) before running.');
  }

  // The token goes into tofu's environment only; the caller's environment is left alone.
  let token = ctx.env.GITHUB_TOKEN;
  if (!token) {
    const result = ctx.run('gh', ['auth', 'token']);
    token = result.code === 0 ? result.stdout.trim() : '';
    if (!token) throw new Error('GITHUB_TOKEN is not set and `gh auth token` failed.');
  }
  const tofuEnv: NodeJS.ProcessEnv = { ...ctx.env, GITHUB_TOKEN: token };

  let path: string | undefined;
  if (options.path) {
    path = resolve(options.path);
    if (!existsSync(path)) throw new Error(`${path} does not exist.`);
    if (ctx.run('git', ['-C', path, 'rev-parse', '--verify', '--quiet', 'refs/heads/main']).code !== 0) {
      throw new Error(`${path} has no local main branch to push.`);
    }
    if (ctx.run('git', ['-C', path, 'remote']).stdout.split(/\r?\n/).includes('origin')) {
      throw new Error(`${path} already has an origin remote; remove it or create the repository without --path.`);
    }
  }

  if (existsSync(definition) && !force) {
    throw new Error(`${definition} already exists. Edit it and run tofu apply, or re-run with --force to overwrite.`);
  }

  const tofu = (args: string[], processOptions: ProcessOptions = {}): string => {
    const result = ctx.run('tofu', [`-chdir=${root}`, ...args], { env: tofuEnv, ...processOptions });
    if (!result.found) throw new Error("'tofu' was not found. Install OpenTofu and make sure it is on PATH.");
    if (result.code !== 0) throw new Error(`tofu ${args[0]} failed with exit code ${result.code}.`);
    return result.stdout;
  };
  const git = (args: string[], processOptions: ProcessOptions = {}): void => {
    const result = ctx.run('git', ['-C', path!, ...args], processOptions);
    if (result.code !== 0) throw new Error(`git ${args[0]} failed with exit code ${result.code}.`);
  };

  const planAndApply = (phase: Phase): void => {
    tofu(['plan', '-input=false', `-out=${planFile}`], { stdio: 'inherit' });
    try {
      const plan = JSON.parse(tofu(['show', '-json', planFile])) as Plan;
      assertNonDestructivePlan(plan, force);
      if (targetScoped) assertTargetScopedPlan(plan, phase, name, !!path);
      if (planOnly) return;
      applyStarted = true;
      tofu(['apply', '-input=false', planFile], { stdio: 'inherit' });
    } finally {
      rmSync(planFile, { force: true });
    }
  };

  const yaml = repositoryYaml({
    description: options.description ?? '',
    visibility: options.visibility ?? 'public',
    topics: options.topics ?? [],
    requiredChecks: options.requiredChecks ?? [],
    pushedFromPath: !!path,
  });

  // A plan-only run puts the definition back the way it found it.
  const previous = existsSync(definition) ? readFileSync(definition) : undefined;
  writeFileSync(definition, yaml);

  try {
    tofu(['init', '-input=false'], { stdio: 'inherit' });

    if (!path) {
      planAndApply('Create');
      return;
    }

    tofuEnv.TF_VAR_bootstrap_repositories = JSON.stringify([name]);
    try {
      planAndApply('Create');
      if (planOnly) return;
      creationApplied = true;

      const outputs = JSON.parse(tofu(['output', '-json', 'repositories'])) as Record<string, { http_clone_url: string }>;
      git(['remote', 'add', 'origin', outputs[name].http_clone_url]);
      git(['push', '-u', 'origin', 'main'], { stdio: 'inherit' });
      mainPushed = true;
    } finally {
      delete tofuEnv.TF_VAR_bootstrap_repositories;
    }

    // Ruleset back to active now that main exists.
    planAndApply('Activate');
  } catch (error) {
    if (targetScoped && !planOnly) {
      const progress = mainPushed
        ? 'Creation apply and main push completed; ruleset activation did not complete.'
        : creationApplied
          ? 'Creation apply completed; main push did not complete.'
          : applyStarted
            ? 'Creation apply did not complete and may have partially changed remote resources.'
            : 'No apply ran.';
      throw new Error(`Target-scoped setup stopped: ${(error as Error).message} ${progress} Definition retained at ${definition}. Verify remote state before retrying; no rollback was attempted.`);
    }
    throw error;
  } finally {
    if (planOnly) {
      if (previous === undefined) rmSync(definition, { force: true });
      else writeFileSync(definition, previous);
    }
  }
}

export const cliOptions = {
  name: { type: 'string' },
  description: { type: 'string' },
  visibility: { type: 'string' },
  topics: { type: 'string', multiple: true },
  'required-check': { type: 'string', multiple: true },
  path: { type: 'string' },
  'plan-only': { type: 'boolean' },
  'target-scoped': { type: 'boolean' },
  force: { type: 'boolean' },
  capabilities: { type: 'boolean' },
} as const;

export function run(args: string[], ctx: Context = defaultContext()): void {
  const values = parseOptions(cliOptions, args);
  if (values.capabilities) {
    writeJson(capabilities);
    return;
  }
  createRepository({
    name: requiredOption(values.name, 'name'),
    description: values.description,
    visibility: choiceOption(values.visibility, 'visibility', ['public', 'private'] as const, 'public'),
    topics: listOption(values.topics),
    requiredChecks: listOption(values['required-check']),
    path: values.path,
    planOnly: values['plan-only'],
    targetScoped: values['target-scoped'],
    force: values.force,
  }, ctx);
}

if (isMain(import.meta.url)) await main(() => run(process.argv.slice(2)));
