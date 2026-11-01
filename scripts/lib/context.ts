import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLog } from './log.ts';
import type { Log } from './log.ts';
import { run, runCommand } from './process.ts';
import type { CommandRunner, Runner } from './process.ts';

// Everything an entry point touches outside its arguments. Tests pass their own.
export interface Context {
  // The repository root: config/, the tofu configuration and scripts/ live here.
  root: string;
  env: NodeJS.ProcessEnv;
  run: Runner;
  runCommand: CommandRunner;
  log: Log;
}

export function defaultContext(): Context {
  return {
    root: resolve(fileURLToPath(new URL('../..', import.meta.url))),
    env: process.env,
    run,
    runCommand,
    log: createLog(),
  };
}
