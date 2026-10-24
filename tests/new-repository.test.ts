// Calls createRepository against a throwaway root, so the real repositories/ folder is
// never read or written. tofu is a recording stand-in and the "GitHub" remote is a local
// bare repository.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import type { TestContext } from 'node:test';
import { createRepository } from '../scripts/new-repository.ts';
import type { RepositoryOptions } from '../scripts/new-repository.ts';
import { createGitRepository, git, repositoryRoot, testContext, testEnv, testRoot, tofuMock } from './helpers.ts';

const name = 'Example.Repository';
const passphrase = 'test-passphrase-0123';
const token = 'test-token';
const repositoryAddress = `module.repository["${name}"].github_repository.this`;
const rulesetAddress = `module.repository["${name}"].github_repository_ruleset.main`;

function setup(t: TestContext, options: { cloneUrl?: string; env?: NodeJS.ProcessEnv } = {}) {
  const root = testRoot(t);
  const { mock, runner } = tofuMock({ repositoryName: name, cloneUrl: options.cloneUrl });
  const ctx = testContext(root, {
    env: testEnv(options.env ?? { TF_VAR_state_passphrase: passphrase, GITHUB_TOKEN: token }),
    run: runner,
  });
  const definition = join(root, 'repositories', `${name}.yaml`);
  const planFile = join(root, 'new-repository.tfplan');
  const create = (options: Partial<RepositoryOptions> = {}) => createRepository({ name, ...options }, ctx);
  return { root, mock, ctx, definition, planFile, create };
}

// A local repository with one commit on main, and an empty bare one standing in for GitHub.
function setupWithPath(t: TestContext, cloneUrl?: string) {
  const context = setup(t, { cloneUrl: cloneUrl ?? 'pending' });
  const local = join(context.root, '..', 'local');
  const remote = join(context.root, '..', 'remote.git');
  createGitRepository(local, { commit: true });
  createGitRepository(remote, { bare: true });
  if (!cloneUrl) context.mock.cloneUrl = remote;
  return { ...context, local, remote };
}

interface ResourceChange {
  address: string;
  mode: string;
  change: { actions: string[]; before: Record<string, unknown> | null; after: Record<string, unknown>; [field: string]: unknown };
}

function change(address: string, actions: string[], fields: Record<string, unknown> = {}): ResourceChange {
  return { address, mode: 'managed', change: { actions, before: null, after: {}, ...fields } };
}

function creationPlan(withPath: boolean) {
  return [
    change(repositoryAddress, ['create'], { after: { name } }),
    change(rulesetAddress, ['create'], {
      after: { name: 'Main', repository: name, target: 'branch', enforcement: withPath ? 'disabled' : 'active' },
    }),
  ];
}

function activationPlan() {
  return [
    change(rulesetAddress, ['update'], {
      before: {
        id: '123', name: 'Main', repository: name, target: 'branch', enforcement: 'disabled',
        rules: [{ deletion: true, non_fast_forward: true }],
      },
      after: {
        rules: [{ non_fast_forward: true, deletion: true }], enforcement: 'active',
        target: 'branch', repository: name, name: 'Main', id: '123',
      },
      after_unknown: { id: false, rules: [{ deletion: false }] },
    }),
  ];
}

type Mutation = (plan: ResourceChange[]) => ResourceChange[];
const repository = (plan: ResourceChange[]) => plan.find((resource) => resource.address === repositoryAddress)!;
const ruleset = (plan: ResourceChange[]) => plan.find((resource) => resource.address === rulesetAddress)!;
const sibling = (siblingName: string) => `module.repository["${siblingName}"].github_repository.this`;

describe('createRepository YAML', () => {
  test('writes exactly the definition for a description with a quote', (t) => {
    const { create, definition } = setup(t);
    create({ description: "It's a thing" });
    assert.equal(readFileSync(definition, 'utf8'), "description: 'It''s a thing'\nvisibility: public\n");
  });

  test('lowercases and quotes topics', (t) => {
    const { create, definition } = setup(t);
    create({ topics: ['TypeScript', 'Tooling'] });
    assert.match(readFileSync(definition, 'utf8'), /topics:\n {2}- 'typescript'\n {2}- 'tooling'\n/);
  });

  test('writes required checks with an integration id only where given', (t) => {
    const { create, definition } = setup(t);
    create({ requiredChecks: ['build / Result@15368', 'lint'] });
    assert.match(readFileSync(definition, 'utf8'),
      /required_checks:\n {2}- context: 'build \/ Result'\n {4}integration_id: 15368\n {2}- context: 'lint'\n$/);
  });

  test('writes private visibility', (t) => {
    const { create, definition } = setup(t);
    create({ visibility: 'private' });
    assert.match(readFileSync(definition, 'utf8'), /^visibility: private$/m);
  });

  test('writes no auto_init without a path', (t) => {
    const { create, definition } = setup(t);
    create();
    assert.doesNotMatch(readFileSync(definition, 'utf8'), /auto_init/);
  });

  test('writes LF endings and no BOM', (t) => {
    const { create, definition } = setup(t);
    create({ description: 'x', topics: ['a'] });
    const bytes = readFileSync(definition);
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(!bytes.includes(0x0d));
  });
});

describe('createRepository plan and apply', () => {
  test('runs init, plan, show and apply against the root, then removes the plan file', (t) => {
    const { create, mock, root, planFile } = setup(t);
    create();
    assert.deepEqual(mock.commands(), ['init', 'plan', 'show', 'apply']);
    assert.ok(mock.calls[0].args.includes(`-chdir=${root}`));
    assert.ok(!existsSync(planFile));
  });

  test('shows tofu init, plan and apply as they run and captures show', (t) => {
    const { create, mock } = setup(t);
    create();
    assert.deepEqual(mock.calls.map((call) => call.stdio), ['inherit', 'inherit', undefined, 'inherit']);
  });

  test('sets no bootstrap variable without a path', (t) => {
    const { create, mock } = setup(t);
    create();
    assert.ok(mock.calls.every((call) => call.bootstrap === undefined));
  });

  test('refuses a plan that destroys or replaces, and applies nothing', (t) => {
    const { create, mock } = setup(t);
    mock.resourceChanges = [change('module.repository["Other"].github_repository.this', ['delete', 'create'])];
    assert.throws(() => create(), /destroys or replaces: module\.repository\["Other"\]\.github_repository\.this.*--force/);
    assert.ok(!mock.commands().includes('apply'));
  });

  test('applies a destructive plan with force', (t) => {
    const { create, mock } = setup(t);
    mock.resourceChanges = [change('module.repository["Other"].github_repository.this', ['delete', 'create'])];
    create({ force: true });
    assert.ok(mock.commands().includes('apply'));
  });

  test('applies create, update and no-op changes', (t) => {
    const { create, mock } = setup(t);
    mock.resourceChanges = [
      change(repositoryAddress, ['create']),
      change('module.repository["Other"].github_repository.this', ['update']),
      change('module.repository["Third"].github_repository.this', ['no-op']),
    ];
    create();
    assert.ok(mock.commands().includes('apply'));
  });

  for (const subcommand of ['init', 'plan', 'apply']) {
    test(`reports a failing tofu ${subcommand} and leaves no plan file`, (t) => {
      const { create, mock, planFile } = setup(t);
      mock.exitCodes[subcommand] = 1;
      assert.throws(() => create(), { message: `tofu ${subcommand} failed with exit code 1.` });
      assert.ok(!existsSync(planFile));
    });
  }
});

describe('createRepository --plan-only', () => {
  test('applies nothing and removes the definition it wrote', (t) => {
    const { create, mock, definition } = setup(t);
    create({ planOnly: true });
    assert.deepEqual(mock.commands(), ['init', 'plan', 'show']);
    assert.ok(!existsSync(definition));
  });

  test('restores a definition it overwrote with force', (t) => {
    const { create, definition } = setup(t);
    writeFileSync(definition, "description: 'original'\n");
    create({ planOnly: true, force: true, description: 'replacement' });
    assert.equal(readFileSync(definition, 'utf8'), "description: 'original'\n");
  });

  test('still refuses a destructive plan, and still cleans up', (t) => {
    const { create, mock, definition } = setup(t);
    mock.resourceChanges = [change('module.repository["Other"].github_repository.this', ['delete'])];
    assert.throws(() => create({ planOnly: true }), /destroys or replaces/);
    assert.ok(!existsSync(definition));
  });
});

describe('createRepository refusals', () => {
  for (const value of [undefined, 'fifteen-chars!!']) {
    test(`refuses passphrase ${JSON.stringify(value)} before calling tofu`, (t) => {
      const { create, mock, definition } = setup(t, { env: { TF_VAR_state_passphrase: value, GITHUB_TOKEN: token } });
      assert.throws(() => create(), /TF_VAR_state_passphrase/);
      assert.deepEqual(mock.calls, []);
      assert.ok(!existsSync(definition));
    });
  }

  test('refuses an existing definition without force and keeps it', (t) => {
    const { create, mock, definition } = setup(t);
    writeFileSync(definition, "description: 'original'\n");
    assert.throws(() => create(), /already exists/);
    assert.equal(readFileSync(definition, 'utf8'), "description: 'original'\n");
    assert.deepEqual(mock.calls, []);
  });

  test('refuses a name GitHub would not accept', (t) => {
    const { ctx, mock } = setup(t);
    assert.throws(() => createRepository({ name: 'has space' }, ctx), /may contain only/);
    assert.deepEqual(mock.calls, []);
  });

  test('refuses a path with no local main branch', (t) => {
    const { create, mock, root } = setup(t);
    const local = join(root, '..', 'empty');
    createGitRepository(local);
    assert.throws(() => create({ path: local }), /has no local main branch to push/);
    assert.deepEqual(mock.calls, []);
  });

  test('refuses a path that already has an origin', (t) => {
    const { create, mock, local, remote } = setupWithPath(t);
    git(local, 'remote', 'add', 'origin', remote);
    assert.throws(() => create({ path: local }), /already has an origin remote/);
    assert.deepEqual(mock.calls, []);
  });

  test('takes the token from gh for tofu only, when GITHUB_TOKEN is unset', (t) => {
    const { create, mock, ctx } = setup(t, { env: { TF_VAR_state_passphrase: passphrase } });
    create();
    assert.equal(mock.ghCalls, 1);
    assert.ok(mock.calls.every((call) => call.githubToken === 'test-token'));
    assert.equal(ctx.env.GITHUB_TOKEN, undefined);
  });

  test('refuses when GITHUB_TOKEN is unset and gh fails', (t) => {
    const { create, mock } = setup(t, { env: { TF_VAR_state_passphrase: passphrase } });
    mock.exitCodes.gh = 1;
    assert.throws(() => create(), /gh auth token/);
    assert.deepEqual(mock.calls, []);
  });

  test('passes GITHUB_TOKEN through to tofu when it is set', (t) => {
    const { create, mock } = setup(t);
    create();
    assert.equal(mock.ghCalls, 0);
    assert.ok(mock.calls.every((call) => call.githubToken === token));
  });
});

describe('createRepository --path', () => {
  test('creates, pushes main, then activates the ruleset', (t) => {
    const { create, mock, ctx, definition, local, remote } = setupWithPath(t);
    create({ path: local });

    assert.deepEqual(mock.commands(), ['init', 'plan', 'show', 'apply', 'output', 'plan', 'show', 'apply']);
    const plans = mock.calls.filter((call) => call.command === 'plan');
    assert.equal(plans[0].bootstrap, `["${name}"]`);
    assert.equal(plans[1].bootstrap, undefined);
    assert.equal(ctx.env.TF_VAR_bootstrap_repositories, undefined);

    assert.match(readFileSync(definition, 'utf8'), /^auto_init: false$/m);
    assert.equal(git(local, 'remote', 'get-url', 'origin'), remote);
    assert.equal(git(remote, 'rev-parse', 'refs/heads/main'), git(local, 'rev-parse', 'HEAD'));
    assert.equal(git(local, 'rev-parse', '--abbrev-ref', 'main@{upstream}'), 'origin/main');
  });

  test('with plan-only stops after the first plan, adds no remote and removes the definition', (t) => {
    const { create, mock, definition, local } = setupWithPath(t);
    create({ path: local, planOnly: true });
    assert.deepEqual(mock.commands(), ['init', 'plan', 'show']);
    assert.equal(mock.calls[1].bootstrap, `["${name}"]`);
    assert.equal(git(local, 'remote'), '');
    assert.ok(!existsSync(definition));
  });

  test('adds no remote when the first apply fails', (t) => {
    const { create, mock, local } = setupWithPath(t);
    mock.exitCodes.apply = 1;
    assert.throws(() => create({ path: local }), /tofu apply failed/);
    assert.equal(git(local, 'remote'), '');
  });

  test('stops after one apply when the push fails', (t) => {
    const { create, mock, local, root } = setupWithPath(t, 'pending');
    mock.cloneUrl = join(root, '..', 'does-not-exist.git');
    assert.throws(() => create({ path: local }), /git push failed/);
    assert.equal(mock.commands().filter((command) => command === 'apply').length, 1);
  });
});

describe('createRepository --target-scoped', () => {
  test('applies exactly each plan it checked, with a path', (t) => {
    const { create, mock, root, local, remote } = setupWithPath(t);
    mock.plans = [creationPlan(true), activationPlan()];
    create({ path: local, targetScoped: true });

    const shows = mock.calls.filter((call) => call.command === 'show');
    const applies = mock.calls.filter((call) => call.command === 'apply');
    assert.equal(applies.length, 2);
    for (const [index, apply] of applies.entries()) {
      assert.equal(apply.planPath, shows[index].planPath);
      assert.equal(apply.planJson, shows[index].planJson);
      assert.equal(apply.args.at(-1), join(root, 'new-repository.tfplan'));
    }
    assert.equal(git(remote, 'rev-parse', 'refs/heads/main'), git(local, 'rev-parse', 'HEAD'));
  });

  test('applies once without a path, with the ruleset created active', (t) => {
    const { create, mock } = setup(t);
    mock.plans = [creationPlan(false)];
    create({ targetScoped: true });
    assert.equal(mock.commands().filter((command) => command === 'apply').length, 1);
  });

  test('allows unrelated no-op changes', (t) => {
    const { create, mock, local } = setupWithPath(t);
    mock.plans = [[...creationPlan(true), change('module.repository["Other"].github_repository.this', ['no-op'])]];
    create({ path: local, targetScoped: true, planOnly: true });
    assert.deepEqual(mock.commands(), ['init', 'plan', 'show']);
  });

  for (const phase of ['Create', 'Activate'] as const) {
    for (const action of ['create', 'update']) {
      test(`refuses an unrelated ${action} that appears in the ${phase} plan after a clean preview`, (t) => {
        const { create, mock, definition, planFile, local, remote } = setupWithPath(t);
        const unrelated = change('module.repository["Other"].github_repository.this', [action]);
        mock.plans = [creationPlan(true)];
        create({ path: local, targetScoped: true, planOnly: true });
        mock.calls.length = 0;

        mock.plans = phase === 'Create'
          ? [[...creationPlan(true), unrelated]]
          : [creationPlan(true), [...activationPlan(), unrelated]];
        let message = '';
        assert.throws(() => create({ path: local, targetScoped: true }), (error: Error) => { message = error.message; return true; });

        assert.match(message, new RegExp(`Target-scoped ${phase} plan refuses change at module\\.repository\\["Other"\\]`));
        const applies = mock.calls.filter((call) => call.command === 'apply');
        assert.equal(applies.length, phase === 'Create' ? 0 : 1);
        const lastShow = mock.calls.filter((call) => call.command === 'show').at(-1)!;
        assert.ok(applies.every((apply) => apply.planJson !== lastShow.planJson));
        if (phase === 'Create') {
          assert.match(message, /No apply ran\./);
          assert.equal(git(local, 'remote'), '');
          assert.equal(git(remote, 'for-each-ref', 'refs/heads'), '');
        } else {
          assert.match(message, /Creation apply and main push completed; ruleset activation did not complete\./);
          assert.equal(git(local, 'remote', 'get-url', 'origin'), remote);
          assert.equal(git(remote, 'rev-parse', 'refs/heads/main'), git(local, 'rev-parse', 'HEAD'));
        }
        assert.match(message, /Definition retained at /);
        assert.ok(!message.includes(token) && !message.includes(passphrase));
        assert.ok(existsSync(definition));
        assert.ok(!existsSync(planFile));
      });
    }
  }

  const creationMutations: Record<string, Mutation> = {
    'a target update': (plan) => { repository(plan).change.actions = ['update']; return plan; },
    'an extra target resource': (plan) => [...plan, change(`module.repository["${name}"].github_branch_default.this`, ['create'])],
    'a prefix sibling': (plan) => [...plan, change(sibling(`${name}2`), ['create'], { after: { name: `${name}2` } })],
    'a case sibling': (plan) => [...plan, change(sibling(name.toLowerCase()), ['create'], { after: { name: name.toLowerCase() } })],
    'a wrong repository name': (plan) => { repository(plan).change.after = { name: 'Other' }; return plan; },
    'an active bootstrap ruleset': (plan) => { ruleset(plan).change.after.enforcement = 'active'; return plan; },
    'a missing ruleset': (plan) => plan.filter((resource) => resource.address !== rulesetAddress),
    'an import': (plan) => { Object.assign(repository(plan).change, { importing: { id: name } }); return plan; },
    'a move': (plan) => { Object.assign(repository(plan), { previous_address: sibling('Old') }); return plan; },
  };
  for (const [label, mutate] of Object.entries(creationMutations)) {
    test(`rejects ${label} in the Create plan and applies nothing`, (t) => {
      const { create, mock, local } = setupWithPath(t);
      mock.plans = [mutate(creationPlan(true))];
      assert.throws(() => create({ path: local, targetScoped: true }), /Target-scoped (Create plan|setup stopped)/);
      assert.ok(!mock.commands().includes('apply'));
      assert.equal(git(local, 'remote'), '');
    });
  }

  const activationMutations: Record<string, Mutation> = {
    'a repository update': (plan) => [...plan, change(repositoryAddress, ['update'], { before: { name }, after: { name } })],
    'a ruleset create': (plan) => { ruleset(plan).change.actions = ['create']; return plan; },
    'a rename': (plan) => { ruleset(plan).change.after.name = 'Other'; return plan; },
    'a rules change': (plan) => { ruleset(plan).change.after.rules = [{ deletion: false, non_fast_forward: true }]; return plan; },
    'an unknown attribute': (plan) => { ruleset(plan).change.after_unknown = { id: false, rules: [{ deletion: true }] }; return plan; },
    'a new attribute': (plan) => { ruleset(plan).change.after.bypass_actors = []; return plan; },
    'an already active ruleset': (plan) => { ruleset(plan).change.before!.enforcement = 'active'; return plan; },
    'a missing transition': (plan) => { ruleset(plan).change.actions = ['no-op']; return plan; },
  };
  for (const [label, mutate] of Object.entries(activationMutations)) {
    test(`rejects ${label} in the Activate plan after one apply`, (t) => {
      const { create, mock, local } = setupWithPath(t);
      mock.plans = [creationPlan(true), mutate(activationPlan())];
      assert.throws(() => create({ path: local, targetScoped: true }), /ruleset activation did not complete/);
      assert.equal(mock.commands().filter((command) => command === 'apply').length, 1);
    });
  }

  for (const actions of [['delete'], ['delete', 'create']]) {
    for (const force of [false, true]) {
      test(`refuses ${actions.join('+')} ${force ? 'even with' : 'without'} force`, (t) => {
        const { create, mock, local } = setupWithPath(t);
        mock.plans = [[...creationPlan(true), change(sibling('Other'), actions)]];
        assert.throws(() => create({ path: local, targetScoped: true, force }), /Target-scoped setup stopped/);
        assert.ok(!mock.commands().includes('apply'));
      });
    }
  }

  test('reports a creation apply that failed part way, and keeps the definition', (t) => {
    const { create, mock, definition, local } = setupWithPath(t);
    mock.plans = [creationPlan(true)];
    mock.exitCodes.apply = 1;
    assert.throws(() => create({ path: local, targetScoped: true }),
      /Creation apply did not complete and may have partially changed remote resources\./);
    assert.ok(existsSync(definition));
    assert.equal(git(local, 'remote'), '');
  });
});

describe('new-repository.ts command line', () => {
  const script = join(repositoryRoot, 'scripts', 'new-repository.ts');

  test('prints its capabilities', () => {
    const result = spawnSync(process.execPath, [script, '--capabilities'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '{"targetScoped":true}\n');
  });

  test('reports a refusal as one line and exit code 1', () => {
    const result = spawnSync(process.execPath, [script, '--name', 'has space'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stderr, "--name 'has space' may contain only letters, digits, '.', '_' and '-'.\n");
  });

  test('refuses an unknown option', () => {
    const result = spawnSync(process.execPath, [script, '--Name', 'x'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown option '--Name'/);
  });
});
