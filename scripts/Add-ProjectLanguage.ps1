<#
.SYNOPSIS
    Adds the implementation language to a project that was created without one.

.DESCRIPTION
    Writes the language starter (scripts/starters/<Language>.ps1), appends the language's
    .gitignore lines, and replaces the undecided commands section of README.md, CLAUDE.md
    and AGENTS.md with the language's commands.

    Every change is planned before anything is written. A starter file is only created
    where no file exists, and a commands section is only replaced while it is still the
    undecided one New-Project.ps1 wrote. If a starter file already exists with other
    content, or a commands section was edited or removed, nothing is written and each
    conflict is listed. Running it again with the same language changes nothing.

    Nothing is committed, so the history and the current branch stay as they are; review
    the changes and commit them through the usual pull request.

.EXAMPLE
    ./scripts/Add-ProjectLanguage.ps1 -Path ../SubZeroDev.Thing -Language node
#>
[CmdletBinding()]
param(
    # The project's folder: the root of its git repository.
    [Parameter(Mandatory)]
    [string] $Path,

    [Parameter(Mandatory)]
    [ValidateSet('node', 'python', 'csharp', 'rust', 'java', 'go')]
    [string] $Language,

    # Passed to the starter for package and module names. Defaults to the folder name.
    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string] $Name
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Import-Module (Join-Path $PSScriptRoot 'modules/Project.psm1') -Force

Assert-CommandAvailable -Name 'git' -InstallHint 'Install Git and make sure it is on PATH.'

$Path = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
if (-not (Test-Path $Path -PathType Container)) { throw "$Path does not exist." }
$cdup = git -C $Path rev-parse --show-cdup 2>$null
if ($LASTEXITCODE -ne 0) { throw "$Path is not a git repository." }
if ($cdup) { throw "$Path is not the root of its git repository." }
if (-not $Name) { $Name = Split-Path -Leaf $Path }

$commands = Get-LanguageCommands -Language $Language
$documents = @(
    @{ RelativePath = 'README.md'; Style = 'Readme' }
    @{ RelativePath = 'CLAUDE.md'; Style = 'Instructions'; Heading = 'Commands' }
    @{ RelativePath = 'AGENTS.md'; Style = 'Instructions'; Heading = 'Essential Commands' }
)

$newFiles = [System.Collections.Generic.List[object]]::new()
$readyDocuments = [System.Collections.Generic.List[hashtable]]::new()
$conflicts = [System.Collections.Generic.List[string]]::new()

# The starter writes into a scratch folder first, so nothing in the project is overwritten.
$staging = Join-Path ([IO.Path]::GetTempPath()) "starter-$([guid]::NewGuid().ToString('N'))"
$null = New-Item -ItemType Directory -Path $staging
try {
    Write-Step "Planning $Language for $Name in $Path"
    $hasStarter = Invoke-LanguageStarter -Language $Language -ProjectPath $staging -ProjectName $Name
    foreach ($file in Get-ChildItem -Path $staging -Recurse -File -Force) {
        $relative = [IO.Path]::GetRelativePath($staging, $file.FullName) -replace '\\', '/'
        $target = Join-Path $Path $relative
        if (-not (Test-Path $target)) {
            $newFiles.Add([pscustomobject]@{ Source = $file.FullName; RelativePath = $relative })
        }
        elseif ((Get-FileHash $target).Hash -ne (Get-FileHash $file.FullName).Hash) {
            $conflicts.Add("$relative already exists with different content")
        }
    }

    foreach ($document in $documents) {
        switch (Update-CommandsSection -ProjectPath $Path -Commands $commands @document) {
            'Ready' { $readyDocuments.Add($document) }
            'Conflict' { $conflicts.Add("$($document.RelativePath) has no undecided commands section to replace; it was edited, removed, or lists other commands") }
        }
    }

    $gitignoreSection = Get-GitignoreLanguageSection -Language $Language
    $gitignorePath = Join-Path $Path '.gitignore'
    $gitignore = if (Test-Path $gitignorePath) { [IO.File]::ReadAllText($gitignorePath) -replace "`r`n", "`n" } else { '' }
    $gitignoreHeader = ($gitignoreSection -split "`n")[0]
    $appendGitignore = $gitignoreSection -and ($gitignore -split "`n") -notcontains $gitignoreHeader

    if ($conflicts.Count) {
        throw "Nothing was changed. Resolve each of these, then run again:`n  - $($conflicts -join "`n  - ")"
    }

    if (-not ($newFiles.Count -or $readyDocuments.Count -or $appendGitignore)) {
        Write-Success "$Name already has the $Language setup; nothing to change."
        return
    }

    Write-Step "Adding $Language to $Name"
    foreach ($file in $newFiles) {
        $target = Join-Path $Path $file.RelativePath
        $null = New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force
        Copy-Item -LiteralPath $file.Source -Destination $target
        Write-Host "  created  $($file.RelativePath)"
    }
    foreach ($document in $readyDocuments) {
        $null = Update-CommandsSection -ProjectPath $Path -Commands $commands @document -Apply
        Write-Host "  updated  $($document.RelativePath) commands"
    }
    if ($appendGitignore) {
        $content = if ($gitignore.Trim()) { "$($gitignore.TrimEnd("`n"))`n`n$gitignoreSection" } else { $gitignoreSection }
        New-ProjectFile -ProjectPath $Path -RelativePath '.gitignore' -Content $content -Force
        Write-Host '  updated  .gitignore'
    }
}
finally {
    Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
}

if (-not $hasStarter) {
    Write-WarningMessage "There is no $Language starter yet; only the commands and .gitignore were updated."
}
Write-Success "$Language added to $Name. Nothing was committed: review the changes, run $($commands.install), $($commands.build) and $($commands.test), then commit."
