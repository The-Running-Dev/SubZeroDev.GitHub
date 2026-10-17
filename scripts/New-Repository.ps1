<#
.SYNOPSIS
    Creates a GitHub repository with the standard settings and "Main" ruleset.

.DESCRIPTION
    Writes repositories/<Name>.yaml, then plans and applies the whole configuration.
    The plan is refused if it would destroy or replace anything, unless -Force is given.

    With -Path, the repository is created empty, the ruleset is applied disabled, the
    local main branch is pushed, and the ruleset is then switched to active.

    Requires TF_VAR_state_passphrase (16+ characters). GITHUB_TOKEN is taken from
    `gh auth token` when it is not already set.

.EXAMPLE
    ./scripts/New-Repository.ps1 -Name SubZeroDev.Thing -Description 'Does a thing' -Topics powershell,tooling

.EXAMPLE
    ./scripts/New-Repository.ps1 -Name SubZeroDev.Thing -Path D:\Projects\SubZeroDev.Thing
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string] $Name,

    [string] $Description = '',

    [ValidateSet('public', 'private')]
    [string] $Visibility = 'public',

    [string[]] $Topics = @(),

    # Required status checks, as "context" or "context@integration_id".
    [string[]] $RequiredCheck = @(),

    # An existing local repository whose main branch is pushed as the initial history.
    [string] $Path,

    # Show the plan and stop without applying.
    [switch] $PlanOnly,

    # Overwrite an existing YAML file and allow a plan that destroys or replaces resources.
    [switch] $Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
$definition = Join-Path $root "repositories/$Name.yaml"
$planFile = Join-Path $root 'new-repository.tfplan'

function Invoke-Tofu {
    & tofu "-chdir=$root" @args
    if ($LASTEXITCODE -ne 0) { throw "tofu $($args[0]) failed with exit code $LASTEXITCODE." }
}

function Invoke-Git {
    & git -C $Path @args
    if ($LASTEXITCODE -ne 0) { throw "git $($args[0]) failed with exit code $LASTEXITCODE." }
}

function ConvertTo-YamlString([string] $Value) {
    "'" + ($Value -replace "'", "''") + "'"
}

function Invoke-PlanAndApply {
    Invoke-Tofu plan -input=false "-out=$planFile"
    try {
        $plan = Invoke-Tofu show -json $planFile | ConvertFrom-Json
        $destructive = @($plan.resource_changes | Where-Object { $_.change.actions -contains 'delete' })
        if ($destructive.Count -gt 0 -and -not $Force) {
            $addresses = ($destructive | ForEach-Object address) -join ', '
            throw "Plan destroys or replaces: $addresses. Re-run with -Force if that is intended."
        }
        if ($PlanOnly) { return }
        Invoke-Tofu apply -input=false $planFile
    }
    finally {
        Remove-Item $planFile -ErrorAction SilentlyContinue
    }
}

if (-not $env:TF_VAR_state_passphrase -or $env:TF_VAR_state_passphrase.Length -lt 16) {
    throw 'Set TF_VAR_state_passphrase (16+ characters) before running.'
}

if (-not $env:GITHUB_TOKEN) {
    $env:GITHUB_TOKEN = (& gh auth token)
    if ($LASTEXITCODE -ne 0 -or -not $env:GITHUB_TOKEN) { throw 'GITHUB_TOKEN is not set and `gh auth token` failed.' }
}

if ($Path) {
    $Path = (Resolve-Path $Path).Path
    & git -C $Path rev-parse --verify --quiet refs/heads/main | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "$Path has no local main branch to push." }
    if ((& git -C $Path remote) -contains 'origin') {
        throw "$Path already has an origin remote; remove it or create the repository without -Path."
    }
}

if ((Test-Path $definition) -and -not $Force) {
    throw "$definition already exists. Edit it and run tofu apply, or re-run with -Force to overwrite."
}

$lines = @("description: $(ConvertTo-YamlString $Description)", "visibility: $Visibility")
if ($Topics) {
    $lines += 'topics:'
    $lines += $Topics | ForEach-Object { "  - $(ConvertTo-YamlString $_.ToLowerInvariant())" }
}
if ($RequiredCheck) {
    $lines += 'required_checks:'
    foreach ($check in $RequiredCheck) {
        $context, $integrationId = $check -split '@', 2
        $lines += "  - context: $(ConvertTo-YamlString $context)"
        if ($integrationId) { $lines += "    integration_id: $([int] $integrationId)" }
    }
}
if ($Path) { $lines += 'auto_init: false' }

# A -PlanOnly run puts the definition back the way it found it.
$previous = if (Test-Path $definition) { Get-Content -Raw $definition } else { $null }
Set-Content -Path $definition -Value $lines -Encoding utf8NoBOM

try {
    Invoke-Tofu init -input=false

    if (-not $Path) {
        Invoke-PlanAndApply
        return
    }

    $env:TF_VAR_bootstrap_repositories = ConvertTo-Json -InputObject @($Name) -Compress
    try {
        Invoke-PlanAndApply
        if ($PlanOnly) { return }

        $cloneUrl = (Invoke-Tofu output -json repositories | ConvertFrom-Json).$Name.http_clone_url
        Invoke-Git remote add origin $cloneUrl
        Invoke-Git push -u origin main
    }
    finally {
        Remove-Item Env:TF_VAR_bootstrap_repositories
    }

    # Ruleset back to active now that main exists.
    Invoke-PlanAndApply
}
finally {
    if ($PlanOnly) {
        if ($null -eq $previous) { Remove-Item $definition }
        else { Set-Content -Path $definition -Value $previous -NoNewline -Encoding utf8NoBOM }
    }
}
