// Writes the Node.js starter files: TypeScript, node:test, ESLint and Prettier.

import { writeProjectFile } from '../lib/files.ts';
import type { Log } from '../lib/log.ts';

export function nodeStarter(log: Log, projectPath: string, projectName: string): void {
  const write = (relativePath: string, content: string) => writeProjectFile(projectPath, relativePath, content, { force: true });
  log.step('Setting up Node.js starter files');

  const packageName = projectName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  write('package.json', JSON.stringify({
    name: packageName,
    version: '0.1.0',
    description: projectName,
    main: 'dist/index.js',
    type: 'module',
    engines: { node: '^22.13.0 || >=24.0.0' },
    scripts: {
      build: 'tsc',
      test: 'tsc -p tsconfig.test.json && node --import tsx --test "tests/*.test.ts"',
      lint: 'eslint . --max-warnings 0',
      start: 'node dist/index.js',
      dev: 'tsx watch src/index.ts',
    },
    keywords: ['project', 'typescript'],
    author: '',
    license: 'MIT',
    dependencies: {},
    devDependencies: {
      '@types/node': '^22.0.0',
      'typescript': '^5.9.0',
      '@eslint/js': '^10.0.0',
      'eslint': '^10.0.0',
      'globals': '^16.0.0',
      'typescript-eslint': '^8.0.0',
      'prettier': '^3.0.0',
      'tsx': '^4.0.0',
    },
  }, null, 2));

  write('tsconfig.json', `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "noEmitOnError": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noImplicitAny": true,
    "moduleResolution": "NodeNext"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}`);

  write('tsconfig.test.json', `{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}`);

  write('eslint.config.js', `import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
);`);

  write('.prettierrc.json', `{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}`);

  write('src/greeting.ts', `export function greeting(name: string): string {
  return \`Welcome to \${name}\`;
}`);

  write('src/index.ts', `import { greeting } from './greeting.js';

console.log(greeting('${projectName}'));`);

  write('tests/index.test.ts', `import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { greeting } from '../src/greeting.js';

describe('Application', () => {
  test('welcomes the named project', () => {
    assert.equal(greeting('Example.Project'), 'Welcome to Example.Project');
  });
});`);

  log.success('Node.js starter files written');
}
