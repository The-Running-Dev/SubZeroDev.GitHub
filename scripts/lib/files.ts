import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Log } from './log.ts';

export interface WriteOptions {
  force?: boolean;
  log?: Log;
}

// Every generated file is UTF-8 without BOM, with LF endings and exactly one trailing newline.
export function normalizeContent(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  return normalized ? `${normalized}\n` : '';
}

export function writeProjectFile(projectPath: string, relativePath: string, content: string, options: WriteOptions = {}): void {
  const fullPath = join(projectPath, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  if (existsSync(fullPath) && !options.force) {
    options.log?.warn(`File already exists: ${relativePath} (skipped)`);
    return;
  }
  writeFileSync(fullPath, normalizeContent(content), 'utf8');
}
