<#
.SYNOPSIS
    Scaffolds a new project locally, then creates its GitHub repository and pushes it.

.DESCRIPTION
    1. Writes the project into -Path: directory structure, .gitignore, .gitattributes,
       .env.example, README.md, docs/architecture.md, the first ADR, CLAUDE.md and/or
       AGENTS.md, and the language starter (scripts/starters/<Language>.ps1).
    2. Optionally runs the build and test commands and reports the result.

    Without -Language the implementation language stays undecided: the common files are
    written without any commands, and no starter or validation runs. Add the language
    later with Add-ProjectLanguage.ps1.
    3. Initializes git on main and commits the scaffold.
    4. Runs New-Repository.ps1 -Path, which creates the repository with the standard
       settings, pushes main, and switches the Main ruleset on.

    -LocalOnly stops after step 3. -PlanOnly runs steps 1-3 and shows the OpenTofu plan
    without applying it; the scaffold stays on disk, and New-Repository.ps1 -Path can
    publish it later.

.EXAMPLE
    ./scripts/New-Project.ps1 -Name SubZeroDev.Thing -Language node -Description 'Does a thing'

.EXAMPLE
    ./scripts/New-Project.ps1 -Name SubZeroDev.Thing -Language python -LocalOnly

.EXAMPLE
    ./scripts/New-Project.ps1 -Name SubZeroDev.Thing -LocalOnly
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string] $Name,

    # Omit to defer the choice; Add-ProjectLanguage.ps1 applies it later.
    [ValidateSet('node', 'python', 'csharp', 'rust', 'java', 'go')]
    [string] $Language,

    # Project folder. Defaults to a sibling of this repository named after the project.
    [string] $Path,

    [string] $Description = '',

    [ValidateSet('public', 'private')]
    [string] $Visibility = 'public',

    [string[]] $Topics = @(),

    # Required status checks, as "context" or "context@integration_id".
    [string[]] $RequiredCheck = @(),

    [ValidateSet('Both', 'ClaudeCode', 'Codex')]
    [string] $Client = 'Both',

    # Commit identity for this repository only; the global git config is used when omitted.
    [string] $GitUserName,
    [string] $GitUserEmail,

    [switch] $SkipLanguageStarter,

    [switch] $SkipValidation,

    # Scaffold and commit, but do not create the GitHub repository.
    [switch] $LocalOnly,

    # Scaffold and commit, then show the GitHub plan without applying it.
    [switch] $PlanOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path $PSScriptRoot 'modules/Project.psm1') -Force

$commands = if ($Language) { Get-LanguageCommands -Language $Language } else { $null }

# Everything that can stop the run is checked before anything is written.
Assert-CommandAvailable -Name 'git' -InstallHint 'Install Git and make sure it is on PATH.'

if (-not $Path) { $Path = Join-Path (Split-Path -Parent $root) $Name }
$Path = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
if (Test-Path $Path) { throw "$Path already exists. Choose another -Path, or publish it with New-Repository.ps1 -Path." }

if (-not $LocalOnly) {
    Assert-CommandAvailable -Name 'tofu' -InstallHint 'winget install OpenTofu.Tofu'
    if (-not $env:TF_VAR_state_passphrase -or $env:TF_VAR_state_passphrase.Length -lt 16) {
        throw 'Set TF_VAR_state_passphrase (16+ characters) before running, or pass -LocalOnly.'
    }
    if (Test-Path (Join-Path $root "repositories/$Name.yaml")) {
        throw "repositories/$Name.yaml already exists; $Name is already managed here."
    }
}

Write-Step "Scaffolding $Name ($(if ($Language) { $Language } else { 'language deferred' })) in $Path"
$null = New-Item -ItemType Directory -Path $Path
New-ProjectStructure -ProjectPath $Path
New-Gitignore -ProjectPath $Path -Language $Language
New-Gitattributes -ProjectPath $Path
New-EnvExample -ProjectPath $Path
New-ReadmeFile -ProjectPath $Path -ProjectName $Name -Commands $commands
New-ArchitectureFile -ProjectPath $Path -ProjectName $Name
New-AdrTemplate -ProjectPath $Path
if ($Client -in 'Both', 'ClaudeCode') { New-ClaudeInstructions -ProjectPath $Path -ProjectName $Name -Commands $commands }
if ($Client -in 'Both', 'Codex') { New-AgentsInstructions -ProjectPath $Path -ProjectName $Name -Commands $commands }
Write-Success 'Common files written'

Initialize-ProjectGit -ProjectPath $Path -UserName $GitUserName -UserEmail $GitUserEmail

if (-not $Language) {
    Write-WarningMessage "Implementation language deferred: no starter, no commands, and no build or test validation. Add it later with: ./scripts/Add-ProjectLanguage.ps1 -Path '$Path' -Language <language>"
}
elseif (-not $SkipLanguageStarter) {
    if (-not (Invoke-LanguageStarter -Language $Language -ProjectPath $Path -ProjectName $Name)) {
        Write-WarningMessage "There is no $Language starter yet; only the common files were written."
    }
}

if ($Language -and -not $SkipValidation) {
    if ((Test-ProjectCommand -ProjectPath $Path -Command $commands.build) -and
        (Test-ProjectCommand -ProjectPath $Path -Command $commands.test)) {
        Write-Success 'Build and tests passed'
    }
    else {
        Write-WarningMessage "Build or tests did not pass. Dependencies may not be installed yet: $($commands.install)"
    }
}

Write-Step 'Committing the scaffold'
New-ProjectInitialCommit -ProjectPath $Path
Write-Success 'Initial commit created on main'

if ($LocalOnly) {
    Write-Success "$Name scaffolded at $Path. Publish it later with: ./scripts/New-Repository.ps1 -Name $Name -Path '$Path'"
    return
}

$repositoryArguments = @{
    Name          = $Name
    Description   = $Description
    Visibility    = $Visibility
    Topics        = $Topics
    RequiredCheck = $RequiredCheck
    Path          = $Path
    PlanOnly      = $PlanOnly
}
& (Join-Path $PSScriptRoot 'New-Repository.ps1') @repositoryArguments

if ($PlanOnly) {
    Write-Success "Plan shown, nothing applied. $Name stays scaffolded at $Path."
}
else {
    Write-Success "$Name created and pushed from $Path"
}
