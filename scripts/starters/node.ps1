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
    main            = 'src/index.js'
    type            = 'module'
    scripts         = [ordered]@{
        build = 'tsc'
        test  = 'jest'
        lint  = 'eslint src/ --fix'
        start = 'node src/index.js'
        dev   = 'nodemon src/index.js'
    }
    keywords        = @('project', 'typescript')
    author          = ''
    license         = 'MIT'
    dependencies    = [ordered]@{}
    devDependencies = [ordered]@{
        '@types/node' = '^20.0.0'
        'typescript'  = '^5.0.0'
        'eslint'      = '^8.0.0'
        'prettier'    = '^3.0.0'
        'jest'        = '^29.0.0'
    }
} | ConvertTo-Json -Depth 10

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'package.json' -Content $packageJson -Force

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'tsconfig.json' -Force -Content @'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noImplicitAny": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
'@

New-ProjectFile -ProjectPath $ProjectPath -RelativePath '.eslintrc.json' -Force -Content @'
{
  "env": {
    "node": true,
    "es2020": true
  },
  "extends": ["eslint:recommended"],
  "parserOptions": {
    "ecmaVersion": 2020,
    "sourceType": "module"
  },
  "rules": {
    "indent": ["error", 2],
    "linebreak-style": ["error", "unix"],
    "quotes": ["error", "single"],
    "semi": ["error", "always"],
    "no-unused-vars": ["warn"]
  }
}
'@

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'jest.config.js' -Force -Content @'
export default {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: ['src/**/*.js'],
  coveragePathIgnorePatterns: ['/node_modules/'],
};
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

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'src/index.js' -Force -Content @"
/**
 * Main application entry point
 */

console.log('Welcome to $ProjectName');
"@

New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'tests/index.test.js' -Force -Content @'
describe('Application', () => {
  test('should exist', () => {
    expect(true).toBe(true);
  });
});
'@

Write-Success 'Node.js starter files written'
