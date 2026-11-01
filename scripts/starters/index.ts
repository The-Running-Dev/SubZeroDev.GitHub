import type { Log } from '../lib/log.ts';
import type { Language } from '../lib/project.ts';
import { csharpStarter } from './csharp.ts';
import { goStarter } from './go.ts';
import { javaStarter } from './java.ts';
import { nodeStarter } from './node.ts';
import { rustStarter } from './rust.ts';

export type Starter = (log: Log, projectPath: string, projectName: string) => void;

// Every language has a starter; a language without one is not accepted.
export const starters: Record<Language, Starter> = {
  node: nodeStarter,
  csharp: csharpStarter,
  rust: rustStarter,
  java: javaStarter,
  go: goStarter,
};
