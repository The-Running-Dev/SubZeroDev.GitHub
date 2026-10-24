<#
.SYNOPSIS
    Creates a GitHub repository with the standard settings and "Main" ruleset.

.DESCRIPTION
    Writes repositories/<Name>.yaml, then plans and applies the whole configuration.
    The plan is refused if it would destroy or replace anything, unless -Force is given.
    -TargetScoped additionally checks each saved plan immediately before apply: only
    this repository and its Main ruleset may be created, then only that ruleset's
    enforcement may change from disabled to active. -Force cannot bypass this guard.

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

    # Restrict each saved plan to the requested creation / ruleset-activation transition.
    [switch] $TargetScoped,

    # Overwrite an existing YAML file and allow a plan that destroys or replaces resources.
    [switch] $Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
$definition = Join-Path $root "repositories/$Name.yaml"
$planFile = Join-Path $root 'new-repository.tfplan'
$creationApplied = $false
$mainPushed = $false
$applyStarted = $false

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

function ConvertTo-CanonicalPlanValue($Value) {
    # Compare all attributes, including nested rules, without depending on object key order.
    if ($Value -is [System.Collections.IDictionary]) {
        $members = foreach ($key in ($Value.Keys | Sort-Object -CaseSensitive)) {
            (ConvertTo-Json -InputObject $key -Compress) + ':' + (ConvertTo-CanonicalPlanValue $Value[$key])
        }
        return '{' + ($members -join ',') + '}'
    }
    if ($Value -is [array]) {
        $items = foreach ($item in $Value) { ConvertTo-CanonicalPlanValue $item }
        return '[' + ($items -join ',') + ']'
    }
    ConvertTo-Json -InputObject $Value -Depth 100 -Compress
}

function Test-UnknownPlanValue($Value) {
    if ($Value -is [System.Collections.IDictionary]) {
        foreach ($item in $Value.Values) { if (Test-UnknownPlanValue $item) { return $true } }
    }
    elseif ($Value -is [array]) {
        foreach ($item in $Value) { if (Test-UnknownPlanValue $item) { return $true } }
    }
    elseif ($Value -eq $true) { return $true }
    return $false
}

function Assert-TargetScopedPlan([System.Collections.IDictionary] $Plan, [string] $Phase) {
    $repositoryAddress = 'module.repository["' + $Name + '"].github_repository.this'
    $rulesetAddress = 'module.repository["' + $Name + '"].github_repository_ruleset.main'
    $expected = @(if ($Phase -eq 'Create') { $repositoryAddress; $rulesetAddress } else { $rulesetAddress })
    $seen = @()

    foreach ($resource in $Plan.resource_changes) {
        $address = $resource.address
        $change = $resource.change
        $actions = @($change.actions)
        # Moves and imports are mutations too, even if their action is reported as no-op.
        if ($resource['previous_address'] -or $change['importing']) {
            throw "Target-scoped $Phase plan refuses a move or import at $address."
        }
        if ($actions.Count -eq 1 -and $actions[0] -ceq 'no-op') { continue }
        if ($address -cnotin $expected -or $address -cin $seen -or $resource.mode -cne 'managed') {
            throw "Target-scoped $Phase plan refuses change at $address."
        }
        $seen += $address
        if ($Phase -eq 'Create') {
            if ($actions.Count -ne 1 -or $actions[0] -cne 'create' -or $null -ne $change.before) {
                throw "Target-scoped Create plan requires a fresh create at $address."
            }
            $after = $change.after
            $enforcement = if ($Path) { 'disabled' } else { 'active' }
            if (($address -ceq $repositoryAddress -and $after.name -cne $Name) -or
                ($address -ceq $rulesetAddress -and ($after.name -cne 'Main' -or
                    $after.repository -cne $Name -or $after.target -cne 'branch' -or
                    $after.enforcement -cne $enforcement))) {
                throw "Target-scoped Create plan has unexpected target attributes at $address."
            }
        }
        else {
            $before = $change.before
            $after = $change.after
            if ($actions.Count -ne 1 -or $actions[0] -cne 'update' -or
                $before.enforcement -cne 'disabled' -or $after.enforcement -cne 'active' -or
                $before.name -cne 'Main' -or $before.repository -cne $Name -or $before.target -cne 'branch' -or
                (Test-UnknownPlanValue $change['after_unknown'])) {
                throw "Target-scoped Activate plan requires known disabled-to-active enforcement at $address."
            }
            # Removing the one permitted difference must leave identical objects.
            $beforeCopy = [ordered]@{}; $afterCopy = [ordered]@{}
            foreach ($key in $before.Keys) { if ($key -cne 'enforcement') { $beforeCopy[$key] = $before[$key] } }
            foreach ($key in $after.Keys) { if ($key -cne 'enforcement') { $afterCopy[$key] = $after[$key] } }
            if ((ConvertTo-CanonicalPlanValue $beforeCopy) -cne (ConvertTo-CanonicalPlanValue $afterCopy)) {
                throw "Target-scoped Activate plan changes attributes other than enforcement at $address."
            }
        }
    }
    if ($seen.Count -ne $expected.Count) {
        throw "Target-scoped $Phase plan is missing the required target transition."
    }
}

function Invoke-PlanAndApply {
    param([ValidateSet('Create', 'Activate')][string] $Phase = 'Create')

    Invoke-Tofu plan -input=false "-out=$planFile"
    try {
        $plan = Invoke-Tofu show -json $planFile | ConvertFrom-Json -AsHashtable
        $destructive = @($plan.resource_changes | Where-Object { $_.change.actions -contains 'delete' })
        if ($destructive.Count -gt 0 -and -not $Force) {
            $addresses = ($destructive | ForEach-Object address) -join ', '
            throw "Plan destroys or replaces: $addresses. Re-run with -Force if that is intended."
        }
        if ($TargetScoped) { Assert-TargetScopedPlan $plan $Phase }
        if ($PlanOnly) { return }
        $script:applyStarted = $true
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
Set-Content -Path $definition -Value (($lines -join "`n") + "`n") -NoNewline -Encoding utf8NoBOM

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
        $creationApplied = $true

        $cloneUrl = (Invoke-Tofu output -json repositories | ConvertFrom-Json).$Name.http_clone_url
        Invoke-Git remote add origin $cloneUrl
        Invoke-Git push -u origin main
        $mainPushed = $true
    }
    finally {
        Remove-Item Env:TF_VAR_bootstrap_repositories
    }

    # Ruleset back to active now that main exists.
    Invoke-PlanAndApply -Phase Activate
}
catch {
    if ($TargetScoped -and -not $PlanOnly) {
        $progress = if ($mainPushed) {
            'Creation apply and main push completed; ruleset activation did not complete.'
        }
        elseif ($creationApplied) { 'Creation apply completed; main push did not complete.' }
        elseif ($applyStarted) { 'Creation apply did not complete and may have partially changed remote resources.' }
        else { 'No apply ran.' }
        throw "Target-scoped setup stopped: $($_.Exception.Message) $progress Definition retained at $definition. Verify remote state before retrying; no rollback was attempted."
    }
    throw
}
finally {
    if ($PlanOnly) {
        if ($null -eq $previous) { Remove-Item $definition }
        else { Set-Content -Path $definition -Value $previous -NoNewline -Encoding utf8NoBOM }
    }
}
