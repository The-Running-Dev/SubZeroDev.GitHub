#Requires -Version 7.0
<#
.SYNOPSIS
    Writes the Node.js starter files. Run by Invoke-LanguageStarter for -Language node.
#>
param(
    [Parameter(Mandatory)][string]$ProjectPath,
    [Parameter(Mandatory)][string]$ProjectName
)

Import-Module (Join-Path $PSScriptRoot '../modules/Project.psm1') -Force

Write-Step 'Setting up Node.js starter files'

$projectNameKebab = ($ProjectName -replace '[^a-zA-Z0-9]', '-').ToLower()

$packageJson = [ordered]@{
    name            = $projectNameKebab
    version         = '0.1.0'
    description     = $ProjectName
    main            = 'dist/index.js'
    type            = 'module'
    engines         = @{ node = '^22.13.0 || >=24.0.0' }
    scripts         = [ordered]@{
        build = 'tsc'
        test  = 'tsc -p tsconfig.test.json && vitest run'
        lint  = 'eslint . --max-warnings 0'
        start = 'node dist/index.js'
        dev   = 'tsx watch src/index.ts'
    }
    keywords        = @('project', 'typescript')
    author          = ''
    license         = 'MIT'
    dependencies    = [ordered]@{}
    devDependencies = [ordered]@{
        '@types/node'       = '^22.0.0'
        'typescript'        = '^5.9.0'
        '@eslint/js'        = '^10.0.0'
        'eslint'            = '^10.0.0'
        'globals'           = '^16.0.0'
        'typescript-eslint' = '^8.0.0'
        'prettier'          = '^3.0.0'
        'vitest'            = '^4.0.0'
        'tsx'               = '^4.0.0'
    }
} | ConvertTo-Json -Depth 10

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'package.json' -Content $packageJson -Force

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'tsconfig.json' -Force -Content @'
{
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
}
'@

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'tsconfig.test.json' -Force -Content @'
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
'@

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'eslint.config.js' -Force -Content @'
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
);
'@

New-ProjectFile -ProjectPath $ProjectPath -RelativePath '.prettierrc.json' -Force -Content @'
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
'@

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'src/greeting.ts' -Force -Content @'
export function greeting(name: string): string {
  return `Welcome to ${name}`;
}
'@

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'src/index.ts' -Force -Content @"
import { greeting } from './greeting.js';

console.log(greeting('$ProjectName'));
"@

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'tests/index.test.ts' -Force -Content @'
import { describe, expect, test } from 'vitest';
import { greeting } from '../src/greeting.js';

describe('Application', () => {
  test('welcomes the named project', () => {
    expect(greeting('Example.Project')).toBe('Welcome to Example.Project');
  });
});
'@

Write-Success 'Node.js starter files written'
