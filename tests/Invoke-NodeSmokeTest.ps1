#Requires -Version 7.0
<#
.SYNOPSIS
    Builds, tests, lints and starts a real, locally scaffolded Node project.
.DESCRIPTION
    Requires Git, Node.js 22.13+ (22.x or 24+) and npm (including registry access). Uses a temporary
    copy of scripts/ and deletes the entire workspace on success or failure. No
    GitHub credentials, OpenTofu, Pester or repository publishing are needed.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$PSNativeCommandUseErrorActionPreference = $false

# Resolve executables, rather than inheriting any Pester stand-ins.
$git = (Get-Command git -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$npm = (Get-Command npm -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$null = Get-Command node -CommandType Application -ErrorAction Stop

function Invoke-CheckedCommand {
    param([string]$FilePath, [string[]]$ArgumentList)
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed ($LASTEXITCODE): $FilePath $($ArgumentList -join ' ')"
    }
}

# Fail locally if scaffolding ever regresses into trying to publish.
function tofu { throw 'The Node smoke test must not invoke OpenTofu.' }
function gh { throw 'The Node smoke test must not invoke GitHub.' }

$workspace = Join-Path ([IO.Path]::GetTempPath()) "node-smoke-$([guid]::NewGuid().ToString('N'))"
$root = Join-Path $workspace 'scaffolder'
$project = Join-Path $workspace 'project with spaces'
$name = 'Node.Smoke'

try {
    $null = New-Item -ItemType Directory -Path (Join-Path $root 'repositories') -Force
    Copy-Item (Join-Path $PSScriptRoot '../scripts') -Destination $root -Recurse
    # Installation happens below; pre-install validation would only warn about missing dependencies.
    & (Join-Path $root 'scripts/New-Project.ps1') -Name $name -Language node -Path $project `
        -LocalOnly -SkipValidation -GitUserName 'Node Smoke' -GitUserEmail 'node-smoke@example.com'

    if ((Invoke-CheckedCommand $git @('-C', $project, 'branch', '--show-current')) -cne 'main') {
        throw 'The scaffold must be initialized on main.'
    }
    if ((Invoke-CheckedCommand $git @('-C', $project, 'rev-list', '--count', 'HEAD')) -ne '1') {
        throw 'The scaffold must have exactly one initial commit.'
    }
    if (Invoke-CheckedCommand $git @('-C', $project, 'status', '--porcelain')) {
        throw 'The initial scaffold must have a clean working tree.'
    }
    if (Invoke-CheckedCommand $git @('-C', $project, 'remote')) {
        throw 'The local scaffold must not have a remote.'
    }
    if (@(Get-ChildItem (Join-Path $root 'repositories') -Force).Count -ne 0) {
        throw 'Local scaffolding must not write repository definitions.'
    }
    $badEndings = Invoke-CheckedCommand $git @('-C', $project, 'ls-files', '--eol') |
        Where-Object { $_ -notmatch '^i/(lf|none)\s' -or $_ -notmatch '\sw/(lf|none)\s' }
    if ($badEndings) { throw "Scaffold files must have LF endings: $badEndings" }
    foreach ($file in 'AGENTS.md', 'CLAUDE.md') {
        if (-not (Test-Path (Join-Path $project $file))) { throw "Missing client instructions: $file" }
    }

    Push-Location $project
    try {
        Invoke-CheckedCommand $npm @('install', '--no-audit', '--no-fund') | Out-Host
        Invoke-CheckedCommand $npm @('run', 'build') | Out-Host
        Invoke-CheckedCommand $npm @('test') | Out-Host
        Invoke-CheckedCommand $npm @('run', 'lint') | Out-Host

        # Prove the tools detect real failures, rather than passing with no effective checks.
        $failingTest = Join-Path $project 'tests/smoke-failure.test.ts'
        Set-Content $failingTest "import { test, expect } from 'vitest';`ntest('smoke failure', () => { expect(1).toBe(2); });" -Encoding utf8NoBOM
        try {
            $failureOutput = @(& $npm test 2>&1)
            if ($LASTEXITCODE -eq 0 -or ($failureOutput -join "`n") -notmatch 'AssertionError: expected 1 to be 2') {
                $failureOutput | Out-Host
                throw 'npm test did not reject the intentional failing assertion as expected.'
            }
            Write-Host 'Confirmed: npm test rejects a failing assertion.'
        }
        finally { Remove-Item $failingTest -Force }

        $lintFailure = Join-Path $project 'src/smoke-lint-failure.ts'
        Set-Content $lintFailure 'const unused: number = 1;' -Encoding utf8NoBOM
        try {
            $failureOutput = @(& $npm run lint 2>&1)
            if ($LASTEXITCODE -eq 0 -or ($failureOutput -join "`n") -notmatch '@typescript-eslint/no-unused-vars') {
                $failureOutput | Out-Host
                throw 'npm run lint did not reject the unused TypeScript variable as expected.'
            }
            Write-Host 'Confirmed: npm run lint rejects an unused TypeScript variable.'
        }
        finally { Remove-Item $lintFailure -Force }

        $package = Get-Content package.json -Raw | ConvertFrom-Json
        if ($package.main -cne 'dist/index.js' -or -not (Test-Path $package.main)) {
            throw 'package.json main must reference the compiled entry point.'
        }
        if (Test-Path 'dist/tests') { throw 'Tests must not be emitted in the application build.' }

        # Starting without source proves both the entry point and its imports use dist/.
        Move-Item (Join-Path $project 'src') (Join-Path $workspace 'source-away')
        $startup = @(Invoke-CheckedCommand $npm @('start'))
        $startup | Out-Host
        if ($startup -cnotcontains "Welcome to $name") { throw 'The compiled application did not print its greeting.' }
    }
    finally { Pop-Location }

    Write-Host 'Node smoke test passed (including expected test/lint failures and startup without source).'
}
finally {
    if (Test-Path $workspace) { Remove-Item $workspace -Recurse -Force }
}
