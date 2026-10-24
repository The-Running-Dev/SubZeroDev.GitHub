// Checks on a saved OpenTofu plan (`tofu show -json`) before new-repository.ts applies it.

type PlanValue = unknown;

interface ResourceChange {
  address: string;
  mode?: string;
  previous_address?: string;
  change: {
    actions: string[];
    before?: Record<string, PlanValue> | null;
    after?: Record<string, PlanValue> | null;
    after_unknown?: PlanValue;
    importing?: PlanValue;
  };
}

export interface Plan {
  resource_changes?: ResourceChange[];
}

export type Phase = 'Create' | 'Activate';

// Refuses a plan that destroys or replaces anything, unless forced.
export function assertNonDestructivePlan(plan: Plan, force: boolean): void {
  const destructive = (plan.resource_changes ?? []).filter((resource) => resource.change.actions.includes('delete'));
  if (destructive.length && !force) {
    throw new Error(`Plan destroys or replaces: ${destructive.map((resource) => resource.address).join(', ')}. Re-run with --force if that is intended.`);
  }
}

// Compares all attributes, including nested rules, without depending on object key order.
function canonical(value: PlanValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, PlanValue>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function hasUnknown(value: PlanValue): boolean {
  if (Array.isArray(value)) return value.some(hasUnknown);
  if (value !== null && typeof value === 'object') return Object.values(value).some(hasUnknown);
  return value === true;
}

function withoutEnforcement(value: Record<string, PlanValue>): Record<string, PlanValue> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'enforcement'));
}

// Create allows only a fresh create of this repository and its Main ruleset; Activate only
// that ruleset's enforcement changing from disabled to active. Nothing can bypass it.
// withPath: the repository is pushed from a local folder, so its ruleset is created disabled.
export function assertTargetScopedPlan(plan: Plan, phase: Phase, name: string, withPath: boolean): void {
  const repositoryAddress = `module.repository["${name}"].github_repository.this`;
  const rulesetAddress = `module.repository["${name}"].github_repository_ruleset.main`;
  const expected = phase === 'Create' ? [repositoryAddress, rulesetAddress] : [rulesetAddress];
  const seen: string[] = [];

  for (const resource of plan.resource_changes ?? []) {
    const { address, change } = resource;
    const actions = change.actions;
    // Moves and imports are mutations too, even if their action is reported as no-op.
    if (resource.previous_address || change.importing) {
      throw new Error(`Target-scoped ${phase} plan refuses a move or import at ${address}.`);
    }
    if (actions.length === 1 && actions[0] === 'no-op') continue;
    if (!expected.includes(address) || seen.includes(address) || resource.mode !== 'managed') {
      throw new Error(`Target-scoped ${phase} plan refuses change at ${address}.`);
    }
    seen.push(address);

    if (phase === 'Create') {
      if (actions.length !== 1 || actions[0] !== 'create' || change.before != null) {
        throw new Error(`Target-scoped Create plan requires a fresh create at ${address}.`);
      }
      const after = change.after ?? {};
      const enforcement = withPath ? 'disabled' : 'active';
      if ((address === repositoryAddress && after.name !== name)
        || (address === rulesetAddress && (after.name !== 'Main' || after.repository !== name
          || after.target !== 'branch' || after.enforcement !== enforcement))) {
        throw new Error(`Target-scoped Create plan has unexpected target attributes at ${address}.`);
      }
    } else {
      const before = change.before ?? {};
      const after = change.after ?? {};
      if (actions.length !== 1 || actions[0] !== 'update'
        || before.enforcement !== 'disabled' || after.enforcement !== 'active'
        || before.name !== 'Main' || before.repository !== name || before.target !== 'branch'
        || hasUnknown(change.after_unknown)) {
        throw new Error(`Target-scoped Activate plan requires known disabled-to-active enforcement at ${address}.`);
      }
      // Removing the one permitted difference must leave identical objects.
      if (canonical(withoutEnforcement(before)) !== canonical(withoutEnforcement(after))) {
        throw new Error(`Target-scoped Activate plan changes attributes other than enforcement at ${address}.`);
      }
    }
  }
  if (seen.length !== expected.length) {
    throw new Error(`Target-scoped ${phase} plan is missing the required target transition.`);
  }
}
