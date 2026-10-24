#Requires -Version 7.0
#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0.0' }

# Creates projects with New-Project.ps1 -LocalOnly from an isolated copy of scripts/, then
# adds a language to them with Add-ProjectLanguage.ps1.

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot 'TestHelpers.psm1') -Force

    $identity = @{ GitUserName = 'Pester'; GitUserEmail = 'pester@example.com' }

    function New-Project {
        param([hashtable]$Arguments = @{})
        $null = & (Join-Path $root 'scripts/New-Project.ps1') -Name 'Example.Project' -Path $project -LocalOnly -SkipValidation @identity @Arguments 6>$null
    }

    function Add-Language {
        param([string]$Language, [string]$Path = $project)
        (& (Join-Path $root 'scripts/Add-ProjectLanguage.ps1') -Path $Path -Language $Language 6>&1 | Out-String)
    }

    # Every file in the project except .git, with its content hash.
    function Get-ProjectSnapshot {
        Get-ChildItem -Path $project -Recurse -File -Force |
            Where-Object { $_.FullName -notmatch '[\\/]\.git[\\/]' } |
            ForEach-Object { '{0} {1}' -f [IO.Path]::GetRelativePath($project, $_.FullName), (Get-FileHash $_.FullName).Hash } |
            Sort-Object
    }
}

Describe 'Add-ProjectLanguage.ps1 on a project created without a language' {
    BeforeEach {
        $root = New-TestRoot -Parent $TestDrive
        $project = Join-Path (Split-Path -Parent $root) 'Example.Project'
        New-Project
        $head = git -C $project rev-parse HEAD
    }

    It 'adds the starter, commands and .gitignore lines, and keeps the history and user files' {
        $design = "# Design`n`nOur own notes.`n"
        Set-Content -Path (Join-Path $project 'docs/design.md') -Value $design -NoNewline
        $null = git -C $project add docs/design.md
        $null = git -C $project commit --quiet -m 'Add design notes'
        $head = git -C $project rev-parse HEAD
        Set-Content -Path (Join-Path $project 'notes.txt') -Value 'untracked' -NoNewline
        $architecture = Get-Content -Raw (Join-Path $project 'docs/architecture.md')

        $output = Add-Language node

        Join-Path $project 'package.json' | Should -Exist
        Join-Path $project 'src/index.ts' | Should -Exist
        foreach ($file in 'README.md', 'CLAUDE.md', 'AGENTS.md') {
            $content = Get-Content -Raw (Join-Path $project $file)
            $content | Should -Match ([regex]::Escape('npm test')) -Because $file
            $content | Should -Not -Match 'not selected yet|has not been selected yet' -Because $file
        }
        Get-Content -Raw (Join-Path $project '.gitignore') | Should -Match '# Node specific'

        git -C $project rev-parse HEAD | Should -BeExactly $head
        @(git -C $project rev-list --all).Count | Should -Be 2
        git -C $project branch --show-current | Should -BeExactly 'main'
        Get-Content -Raw (Join-Path $project 'docs/design.md') | Should -BeExactly $design
        Get-Content -Raw (Join-Path $project 'notes.txt') | Should -BeExactly 'untracked'
        Get-Content -Raw (Join-Path $project 'docs/architecture.md') | Should -BeExactly $architecture
        $output | Should -Match 'Nothing was committed'
    }

    It 'changes nothing when run again with the same language' {
        $null = Add-Language node
        $before = Get-ProjectSnapshot

        $output = Add-Language node

        $output | Should -Match 'already has the node setup; nothing to change'
        Get-ProjectSnapshot | Should -Be $before
        git -C $project rev-parse HEAD | Should -BeExactly $head
    }

    It 'writes nothing and names the file when a commands section was edited' {
        $readme = Join-Path $project 'README.md'
        $edited = (Get-Content -Raw $readme) -replace 'Not selected yet\.', 'We will use Elixir.'
        Set-Content -Path $readme -Value $edited -NoNewline
        $before = Get-ProjectSnapshot

        { Add-Language node } | Should -Throw '*Nothing was changed*README.md*'
        Get-ProjectSnapshot | Should -Be $before
    }

    It 'writes nothing and names the file when a starter file already exists with other content' {
        Set-Content -Path (Join-Path $project 'package.json') -Value '{ "name": "mine" }' -NoNewline
        $before = Get-ProjectSnapshot

        { Add-Language node } | Should -Throw '*Nothing was changed*package.json already exists*'
        Get-ProjectSnapshot | Should -Be $before
    }

    It 'updates the commands and warns for a language without a starter' {
        $gitignore = Get-Content -Raw (Join-Path $project '.gitignore')

        $output = Add-Language go

        $output | Should -Match 'There is no go starter yet'
        Get-Content -Raw (Join-Path $project 'README.md') | Should -Match ([regex]::Escape('go test ./...'))
        Get-Content -Raw (Join-Path $project '.gitignore') | Should -BeExactly $gitignore
    }

    It 'refuses a language it does not know' {
        $before = Get-ProjectSnapshot

        { Add-Language cobol } | Should -Throw
        Get-ProjectSnapshot | Should -Be $before
    }
}

Describe 'Add-ProjectLanguage.ps1 on a project that already has a language' {
    BeforeEach {
        $root = New-TestRoot -Parent $TestDrive
        $project = Join-Path (Split-Path -Parent $root) 'Example.Project'
        New-Project @{ Language = 'node' }
    }

    It 'changes nothing for the same language' {
        $before = Get-ProjectSnapshot

        Add-Language node | Should -Match 'nothing to change'
        Get-ProjectSnapshot | Should -Be $before
    }

    It 'refuses a different language and writes nothing' {
        $before = Get-ProjectSnapshot

        { Add-Language python } | Should -Throw '*Nothing was changed*'
        Get-ProjectSnapshot | Should -Be $before
    }
}

Describe 'Add-ProjectLanguage.ps1 refuses a folder that is not a project root' {
    BeforeEach {
        $root = New-TestRoot -Parent $TestDrive
        $project = Join-Path (Split-Path -Parent $root) 'Example.Project'
    }

    It 'refuses a folder that is not a git repository' {
        $null = New-Item -ItemType Directory -Path $project

        { Add-Language node } | Should -Throw '*is not a git repository*'
        @(Get-ChildItem $project -Force).Count | Should -Be 0
    }

    It 'refuses a subfolder of a repository' {
        New-TestGitRepository -Path $project -Commit
        $sub = Join-Path $project 'sub'
        $null = New-Item -ItemType Directory -Path $sub

        { Add-Language node -Path $sub } | Should -Throw '*is not the root*'
        @(Get-ChildItem $sub -Force).Count | Should -Be 0
    }

    It 'refuses a folder that does not exist' {
        { Add-Language node } | Should -Throw '*does not exist*'
    }
}
