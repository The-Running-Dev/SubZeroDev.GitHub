#Requires -Version 7.0
<#
.SYNOPSIS
    Shared fixtures for the Pester suite: an isolated copy of this repository's scripts,
    a recording stand-in for tofu, and throwaway git repositories.

.DESCRIPTION
    Nothing here touches the real repositories/ folder, the real OpenTofu state, or GitHub.
    The tofu stand-in is a global function, which PowerShell resolves before any tofu
    executable on PATH.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot

function New-TestRoot {
    <#
    .SYNOPSIS
    Copies scripts/ into a fresh folder with an empty repositories/, and returns its path.
    #>
    param([Parameter(Mandatory)][string]$Parent)

    $root = Join-Path $Parent ([guid]::NewGuid().ToString('N').Substring(0, 8)) 'root'
    $null = New-Item -ItemType Directory -Path (Join-Path $root 'repositories') -Force
    Copy-Item -Path (Join-Path $repositoryRoot 'scripts') -Destination $root -Recurse
    $root
}

function New-TestGitRepository {
    <#
    .SYNOPSIS
    Creates a git repository on main; with -Commit it has one commit.
    #>
    param(
        [Parameter(Mandatory)][string]$Path,
        [switch]$Commit,
        [switch]$Bare
    )

    $null = New-Item -ItemType Directory -Path $Path -Force
    if ($Bare) {
        $null = & git init --quiet --bare --initial-branch=main $Path
        return
    }
    $null = & git -C $Path init --quiet --initial-branch=main
    $null = & git -C $Path config user.name 'Pester'
    $null = & git -C $Path config user.email 'pester@example.com'
    $null = & git -C $Path config core.autocrlf false
    if ($Commit) {
        Set-Content -Path (Join-Path $Path 'README.md') -Value "# Test`n" -NoNewline
        $null = & git -C $Path add README.md
        $null = & git -C $Path commit --quiet -m 'First'
    }
}

function Install-TofuMock {
    <#
    .SYNOPSIS
    Replaces tofu with a recording stand-in and returns its state.

    .DESCRIPTION
    Every call is recorded with its subcommand, arguments, and the bootstrap variable
    at that moment. `show` returns ResourceChanges as plan JSON; `output` returns
    CloneUrl as the http_clone_url of RepositoryName. ExitCodes maps a subcommand to
    the exit code it should fail with.
    #>
    param(
        [string]$RepositoryName = '',
        [string]$CloneUrl = ''
    )

    $global:TofuMock = [pscustomobject]@{
        Calls           = [System.Collections.Generic.List[object]]::new()
        ResourceChanges = @()
        ExitCodes       = @{}
        RepositoryName  = $RepositoryName
        CloneUrl        = $CloneUrl
    }

    function global:tofu {
        $mock = $global:TofuMock
        $command = @($args | Where-Object { $_ -notlike '-chdir=*' })[0]
        $mock.Calls.Add([pscustomobject]@{
                Command   = $command
                Arguments = @($args)
                Bootstrap = $env:TF_VAR_bootstrap_repositories
            })

        $exitCode = if ($mock.ExitCodes.ContainsKey($command)) { $mock.ExitCodes[$command] } else { 0 }
        if ($exitCode -eq 0) {
            switch ($command) {
                'show' { @{ resource_changes = @($mock.ResourceChanges) } | ConvertTo-Json -Depth 10 }
                'output' { @{ $mock.RepositoryName = @{ http_clone_url = $mock.CloneUrl } } | ConvertTo-Json -Depth 5 }
            }
        }
        $global:LASTEXITCODE = $exitCode
    }

    $global:TofuMock
}

function Uninstall-TofuMock {
    Remove-Item Function:\tofu -ErrorAction SilentlyContinue
    Remove-Variable -Name TofuMock -Scope Global -ErrorAction SilentlyContinue
}

function Get-TofuCommand {
    <#
    .SYNOPSIS
    The subcommands tofu was called with, in order.
    #>
    @($global:TofuMock.Calls | ForEach-Object Command)
}

function Save-Environment {
    <#
    .SYNOPSIS
    Captures the variables the scripts read, so a test can change them freely.
    #>
    $saved = @{}
    foreach ($name in 'TF_VAR_state_passphrase', 'TF_VAR_bootstrap_repositories', 'GITHUB_TOKEN') {
        $saved[$name] = [Environment]::GetEnvironmentVariable($name)
    }
    $saved
}

function Restore-Environment {
    param([Parameter(Mandatory)][hashtable]$Saved)

    # Assigning $null through [Environment] leaves an empty variable behind; remove it instead.
    foreach ($name in $Saved.Keys) {
        if ($null -eq $Saved[$name]) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
        else { Set-Item "Env:$name" -Value $Saved[$name] }
    }
}

Export-ModuleMember -Function @(
    'New-TestRoot'
    'New-TestGitRepository'
    'Install-TofuMock'
    'Uninstall-TofuMock'
    'Get-TofuCommand'
    'Save-Environment'
    'Restore-Environment'
)
