import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function supportedNode(version = process.versions.node): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  return !!match && (Number(match[1]) > 22 || (Number(match[1]) === 22 && Number(match[2]) >= 18));
}

export function requireNode(version = process.versions.node): void {
  if (!supportedNode(version)) throw new Error(`These scripts require Node >= 22.18; found ${version}.`);
}

// import.meta.main is not available at our Node 22.18 floor.
export function isMain(url: string, entry = process.argv[1]): boolean {
  if (!entry) return false;
  try { return realpathSync(fileURLToPath(url)) === realpathSync(entry); }
  catch { return false; }
}

export function writeJson(value: object): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

// A refusal is one line on stderr and exit code 1, never a stack trace.
export async function main(action: () => void | Promise<void>): Promise<void> {
  try {
    requireNode();
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 2;
    return;
  }
  try {
    await action();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
