import { parseArgs } from 'node:util';
import type { ParseArgsConfig } from 'node:util';

export function parseOptions<T extends NonNullable<ParseArgsConfig['options']>>(
  options: T, args = process.argv.slice(2),
) {
  return parseArgs({ options, args, strict: true, allowPositionals: false }).values;
}

export function requiredOption(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`--${name} is required.`);
  return value;
}

// A repeatable option that also takes comma-separated values: --topics a,b --topics c.
export function listOption(values: string[] | undefined): string[] {
  return (values ?? []).flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
}

export function choiceOption<T extends string>(value: string | undefined, name: string, choices: readonly T[], fallback: T): T {
  if (value === undefined) return fallback;
  const match = choices.find((choice) => choice === value.toLowerCase());
  if (!match) throw new Error(`--${name} must be one of ${choices.join(', ')}; got '${value}'.`);
  return match;
}
