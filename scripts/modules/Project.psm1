#Requires -Version 7.0
<#
.SYNOPSIS
    Generates the files of a new AI-assisted project.

.DESCRIPTION
    Used by scripts/New-Project.ps1 and the language starters in scripts/starters.
    Every generated file is written UTF-8 without BOM, with LF line endings.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-WarningMessage {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Assert-CommandAvailable {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$InstallHint
    )
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "'$Name' was not found. $InstallHint"
    }
}

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter()][string[]]$ArgumentList = @()
    )
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($ArgumentList -join ' ')"
    }
}

# ============================================================================
# Project Structure
# ============================================================================

function New-ProjectStructure {
    param(
        [Parameter(Mandatory)][string]$ProjectPath,
        [Parameter()][string[]]$Directories = @('src', 'tests', 'docs/decisions', '.github')
    )

    foreach ($dir in $Directories) {
        $null = New-Item -ItemType Directory -Path (Join-Path $ProjectPath $dir) -Force
    }
}

function New-ProjectFile {
    <#
    .SYNOPSIS
    Writes a project file as UTF-8 without BOM, LF line endings, one trailing newline.
    #>
    param(
        [Parameter(Mandatory)][string]$ProjectPath,
        [Parameter(Mandatory)][string]$RelativePath,
        [Parameter(Mandatory)][AllowEmptyString()][string]$Content,
        [Parameter()][switch]$Force
    )

    $fullPath = Join-Path $ProjectPath $RelativePath
    $directory = Split-Path -Parent $fullPath

    if (-not (Test-Path $directory)) {
        $null = New-Item -ItemType Directory -Path $directory -Force
    }

    if ((Test-Path $fullPath) -and -not $Force) {
        Write-WarningMessage "File already exists: $RelativePath (skipped)"
        return
    }

    $normalized = ($Content -replace "`r`n", "`n").TrimEnd("`n")
    if ($normalized) { $normalized += "`n" }
    Set-Content -Path $fullPath -Value $normalized -NoNewline -Encoding utf8NoBOM
}

# ============================================================================
# Common Files
# ============================================================================

function New-Gitignore {
    param(
        [Parameter(Mandatory)][string]$ProjectPath,
        [Parameter()][string]$Language = 'generic'
    )

    $content = @'
# Environment & secrets
.env
.env.local
.env.*.local
*.key
*.pem
secrets/

# IDE & build outputs
.vscode/
.idea/
.DS_Store
Thumbs.db

# Dependencies
node_modules/
__pycache__/
venv/
.venv/
*.egg-info/
dist/
build/

# Build outputs
bin/
obj/
.next/
out/
.pytest_cache/
coverage/
.nyc_output/

# Logs
*.log
npm-debug.log*
yarn-debug.log*

# Runtime
tmp/
cache/
.cache/
'@

    switch ($Language) {
        'python' { $content += "`n# Python specific`nvenv/`n*.pyc`n.pytest_cache/`ndist/`nbuild/" }
        'node' { $content += "`n# Node specific`nnode_modules/`n.npm/`n.next/`nout/" }
        'csharp' { $content += "`n# C# specific`nbin/`nobj/`n*.user`n.vs/" }
        'java' { $content += "`n# Java specific`ntarget/`n.gradle/`nbuild/" }
        'rust' { $content += "`n# Rust specific`ntarget/`nCargo.lock" }
    }

    New-ProjectFile -ProjectPath $ProjectPath -RelativePath '.gitignore' -Content $content -Force
}

function New-Gitattributes {
    param([Parameter(Mandatory)][string]$ProjectPath)

    New-ProjectFile -ProjectPath $ProjectPath -RelativePath '.gitattributes' -Content '* text=auto eol=lf' -Force
}

function New-EnvExample {
    param([Parameter(Mandatory)][string]$ProjectPath)

    $content = @'
# Environment variables template
# Copy this file to .env and configure for local development
# Never commit .env to version control - it contains secrets

# Deployment environment
NODE_ENV=development
DEBUG=false

# Database (if applicable)
DATABASE_URL=postgresql://user:password@localhost:5432/myproject
DATABASE_POOL_SIZE=10

# API Configuration
API_KEY=your_api_key_here
API_SECRET=your_api_secret_here
API_BASE_URL=http://localhost:3000

# Logging
LOG_LEVEL=info

# Add project-specific variables below
'@

    New-ProjectFile -ProjectPath $ProjectPath -RelativePath '.env.example' -Content $content -Force
}

function New-ReadmeFile {
    param(
        [Parameter(Mandatory)][string]$ProjectPath,
        [Parameter(Mandatory)][string]$ProjectName,
        [Parameter(Mandatory)][hashtable]$Commands
    )

    $fence = '```'
    $content = @"
# $ProjectName

Brief description of what this project does and its main purpose.

## Prerequisites

- [List required tools, frameworks, and versions]

## Local Setup

1. **Clone the repository**
   ${fence}bash
   git clone <repository-url>
   cd $ProjectName
   $fence

2. **Install dependencies**
   ${fence}bash
   $($Commands.install)
   $fence

3. **Configure environment**
   ${fence}bash
   cp .env.example .env
   # Edit .env and add your configuration
   $fence

## Build

${fence}bash
$($Commands.build)
$fence

## Test

${fence}bash
$($Commands.test)
$fence

## Lint

${fence}bash
$($Commands.lint)
$fence

## Run Locally

${fence}bash
$($Commands.run)
$fence

## Architecture

This project consists of:
- **src/** — Main source code
- **tests/** — Test suite
- **docs/** — Architecture and decision records

See [docs/architecture.md](docs/architecture.md) for detailed system design.

## Development Workflow

1. Create a feature branch
2. Make focused, atomic commits
3. Write or update tests for new functionality
4. Ensure all tests pass locally
5. Submit a pull request

See [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md) for AI assistant guidelines.

## License

[Add license information]
"@

    New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'README.md' -Content $content -Force
}

function New-ArchitectureFile {
    param(
        [Parameter(Mandatory)][string]$ProjectPath,
        [Parameter(Mandatory)][string]$ProjectName
    )

    $fence = '```'
    $content = @"
# $ProjectName Architecture

**Last Updated:** $(Get-Date -Format 'yyyy-MM-dd')

## Overview

[Provide a high-level overview of the system's purpose and main responsibilities]

## System Architecture Diagram

$fence
[Add ASCII diagram or describe the component relationships]
$fence

## Core Components

### Component 1: [Name]
- **Purpose:** [What does it do?]
- **Responsibilities:** [Key duties]
- **Dependencies:** [What does it depend on?]
- **Technology:** [Tech stack]

[Add more components as needed]

## Data Flow

[Describe how data flows through the system]

## External Integrations

- [Service 1]: [Purpose and API details]

## Deployment Architecture

[Describe how the system is deployed in production]

## Technology Stack

- **Language:** [e.g., Node.js, Python]
- **Framework:** [e.g., Express, FastAPI]
- **Database:** [e.g., PostgreSQL]
- **Hosting:** [e.g., Docker, Kubernetes, serverless]

## Security Considerations

[Key security measures and threat model]

## Design Decisions

See [decisions/](decisions/) for Architecture Decision Records (ADRs) documenting major design choices.
"@

    New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'docs/architecture.md' -Content $content -Force
}

function New-AdrTemplate {
    param([Parameter(Mandatory)][string]$ProjectPath)

    $content = @"
# ADR-0001: Project Setup and Initial Decisions

- **Status:** Accepted
- **Date:** $(Get-Date -Format 'yyyy-MM-dd')

## Context

[Describe the background and context that led to this decision]

## Decision

[Clearly state what decision was made]

## Consequences

### Positive
- [Benefit 1]

### Negative
- [Trade-off 1]

## Alternatives Considered

- **Alternative 1:** [Description and why rejected]
"@

    New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'docs/decisions/0001-initial-project-setup.md' -Content $content -Force
}

# ============================================================================
# Client Instructions
# ============================================================================

function New-ClaudeInstructions {
    param(
        [Parameter(Mandatory)][string]$ProjectPath,
        [Parameter(Mandatory)][string]$ProjectName,
        [Parameter(Mandatory)][hashtable]$Commands
    )

    $fence = '```'
    $content = @"
# Claude Code Project Instructions

- **Project:** $ProjectName
- **Last Updated:** $(Get-Date -Format 'yyyy-MM-dd')

## Commands

- **Install:** ``$($Commands.install)``
- **Build:** ``$($Commands.build)``
- **Test:** ``$($Commands.test)``
- **Lint/Format:** ``$($Commands.lint)``
- **Run locally:** ``$($Commands.run)``

## Architecture Principles

- Keep domain logic independent from infrastructure
- Put external integrations behind well-defined interfaces
- Avoid circular dependencies between modules
- Record consequential architecture decisions in [docs/decisions/](docs/decisions/)

## Project Structure

$fence
$ProjectName/
├── src/           # Source code
├── tests/         # Test suite
├── docs/          # Documentation
│   ├── architecture.md
│   └── decisions/  # Architecture Decision Records
└── README.md      # Project overview
$fence

## Workflow Guidelines

1. **Before making changes:**
   - Read relevant tests to understand expected behavior
   - Check [docs/architecture.md](docs/architecture.md) for component relationships

2. **During implementation:**
   - Make the smallest coherent change
   - Keep commits focused and descriptive
   - Run affected checks before committing

3. **Before committing:**
   - Ensure tests pass
   - Verify no secrets or credentials in diff
   - Update documentation if behavior changed

## Memory & Knowledge Management

- Store important conventions and lessons learned
- Memory supplements but doesn't replace documentation
- Keep architecture rationale in docs/decisions/ (not just memory)
"@

    New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'CLAUDE.md' -Content $content -Force
}

function New-AgentsInstructions {
    param(
        [Parameter(Mandatory)][string]$ProjectPath,
        [Parameter(Mandatory)][string]$ProjectName,
        [Parameter(Mandatory)][hashtable]$Commands
    )

    $fence = '```'
    $content = @"
# Project Working Agreement

- **Project:** $ProjectName
- **Last Updated:** $(Get-Date -Format 'yyyy-MM-dd')

## Essential Commands

- **Install:** ``$($Commands.install)``
- **Build:** ``$($Commands.build)``
- **Test:** ``$($Commands.test)``
- **Lint/Format:** ``$($Commands.lint)``
- **Run locally:** ``$($Commands.run)``

## Architecture & Design

- Keep domain logic independent from infrastructure
- Put external integrations behind well-defined interfaces
- Avoid circular dependencies between modules
- Record all consequential architecture decisions in [docs/decisions/](docs/decisions/)

### Project Structure

$fence
$ProjectName/
├── src/           # Source code
├── tests/         # Test suite
├── docs/          # Documentation
│   ├── architecture.md
│   └── decisions/  # Architecture Decision Records (ADRs)
└── README.md
$fence

## Development Workflow

1. **Before making changes:**
   - Read relevant tests to understand expected behavior
   - Review [docs/architecture.md](docs/architecture.md) for design context

2. **During implementation:**
   - Make the smallest coherent change possible
   - Keep commits focused and well-described
   - Run the checks affected by your change

3. **Commit safety:**
   - Never commit secrets, generated credentials, or local .env files
   - Ensure all tests pass locally
   - Verify no unwanted files in the diff
"@

    New-ProjectFile -ProjectPath $ProjectPath -RelativePath 'AGENTS.md' -Content $content -Force
}

# ============================================================================
# Git
# ============================================================================

function Initialize-ProjectGit {
    <#
    .SYNOPSIS
    Initializes the repository on a main branch and sets the commit identity.
    #>
    param(
        [Parameter(Mandatory)][string]$ProjectPath,
        [Parameter()][string]$UserName,
        [Parameter()][string]$UserEmail
    )

    Invoke-NativeCommand -FilePath 'git' -ArgumentList '-C', $ProjectPath, 'init', '--initial-branch=main'
    if ($UserName) { Invoke-NativeCommand -FilePath 'git' -ArgumentList '-C', $ProjectPath, 'config', 'user.name', $UserName }
    if ($UserEmail) { Invoke-NativeCommand -FilePath 'git' -ArgumentList '-C', $ProjectPath, 'config', 'user.email', $UserEmail }

    foreach ($dir in 'src', 'tests') {
        New-ProjectFile -ProjectPath $ProjectPath -RelativePath "$dir/.gitkeep" -Content ''
    }
}

function New-ProjectInitialCommit {
    param(
        [Parameter(Mandatory)][string]$ProjectPath,
        [Parameter()][string]$Message = 'Initial project scaffold'
    )

    # A brand-new scaffold: everything in it is the commit.
    Invoke-NativeCommand -FilePath 'git' -ArgumentList '-C', $ProjectPath, 'add', '--all'
    Invoke-NativeCommand -FilePath 'git' -ArgumentList '-C', $ProjectPath, 'commit', '--quiet', '-m', $Message
}

# ============================================================================
# Language Starters
# ============================================================================

function Invoke-LanguageStarter {
    <#
    .SYNOPSIS
    Runs scripts/starters/<Language>.ps1. Returns $false when the language has no starter.
    #>
    param(
        [Parameter(Mandatory)][string]$Language,
        [Parameter(Mandatory)][string]$ProjectPath,
        [Parameter(Mandatory)][string]$ProjectName
    )

    $starterScript = Join-Path $PSScriptRoot "../starters/$Language.ps1"
    if (-not (Test-Path $starterScript)) { return $false }

    & $starterScript -ProjectPath $ProjectPath -ProjectName $ProjectName
    return $true
}

# ============================================================================
# Validation
# ============================================================================

function Test-ProjectCommand {
    <#
    .SYNOPSIS
    Runs one of the project's commands in its directory; $true only on exit code 0.
    #>
    param(
        [Parameter(Mandatory)][string]$ProjectPath,
        [Parameter(Mandatory)][string]$Command
    )

    Push-Location $ProjectPath
    try {
        Write-Step "Running: $Command"
        $global:LASTEXITCODE = 0
        # Out-Host keeps the command's output out of the return value.
        Invoke-Expression $Command | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Write-WarningMessage "'$Command' exited with code $LASTEXITCODE"
            return $false
        }
        return $true
    }
    catch {
        Write-WarningMessage "'$Command' failed: $_"
        return $false
    }
    finally {
        Pop-Location
    }
}

Export-ModuleMember -Function @(
    'Write-Step'
    'Write-Success'
    'Write-WarningMessage'
    'Assert-CommandAvailable'
    'Invoke-NativeCommand'
    'New-ProjectStructure'
    'New-ProjectFile'
    'New-Gitignore'
    'New-Gitattributes'
    'New-EnvExample'
    'New-ReadmeFile'
    'New-ArchitectureFile'
    'New-AdrTemplate'
    'New-ClaudeInstructions'
    'New-AgentsInstructions'
    'Initialize-ProjectGit'
    'New-ProjectInitialCommit'
    'Invoke-LanguageStarter'
    'Test-ProjectCommand'
)
