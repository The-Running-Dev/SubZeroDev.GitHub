import type { Log } from '../lib/log.ts';
import type { Language } from '../lib/project.ts';
import { nodeStarter } from './node.ts';
import { pythonStarter } from './python.ts';

export type Starter = (log: Log, projectPath: string, projectName: string) => void;

// A language without an entry gets only the common files and its commands.
export const starters: Partial<Record<Language, Starter>> = {
  node: nodeStarter,
  python: pythonStarter,
};
