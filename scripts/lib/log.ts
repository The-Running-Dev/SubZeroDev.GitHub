import { styleText } from 'node:util';

export interface Log {
  step(message: string): void;
  success(message: string): void;
  warn(message: string): void;
  info(message: string): void;
}

// Colors only reach a terminal; styleText leaves redirected output plain.
export function createLog(write = (text: string) => { process.stdout.write(text); }): Log {
  return {
    step: (message) => write(`\n${styleText('cyan', `==> ${message}`)}\n`),
    success: (message) => write(`${styleText('green', `[OK] ${message}`)}\n`),
    warn: (message) => write(`${styleText('yellow', `[WARN] ${message}`)}\n`),
    info: (message) => write(`${message}\n`),
  };
}
