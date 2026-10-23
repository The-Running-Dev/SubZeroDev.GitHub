#Requires -Version 7.0
#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0.0' }

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot '../scripts/modules/Project.psm1') -Force

    $commands = @{ install = 'install-cmd'; build = 'build-cmd'; test = 'test-cmd'; lint = 'lint-cmd'; run = 'run-cmd' }

    function New-TestFolder {
        $path = Join-Path $TestDrive ([guid]::NewGuid().ToString('N').Substring(0, 8))
        $null = New-Item -ItemType Directory -Path $path
        $path
    }
}

Describe 'New-ProjectFile' {
    BeforeEach { $project = New-TestFolder }

    It 'writes LF endings, no BOM, and exactly one trailing newline' {
        New-ProjectFile -ProjectPath $project -RelativePath 'a.txt' -Content "one`r`ntwo`n`n`n"

        $bytes = [IO.File]::ReadAllBytes((Join-Path $project 'a.txt'))
        [Text.Encoding]::UTF8.GetString($bytes) | Should -BeExactly "one`ntwo`n"
        $bytes[0] | Should -Not -Be 0xEF
    }

    It 'writes an empty file for empty content' {
        New-ProjectFile -ProjectPath $project -RelativePath 'empty' -Content ''

        (Get-Item (Join-Path $project 'empty')).Length | Should -Be 0
    }

    It 'creates missing parent folders' {
        New-ProjectFile -ProjectPath $project -RelativePath 'deep/er/file.md' -Content 'x'

        Join-Path $project 'deep/er/file.md' | Should -Exist
    }

    It 'leaves an existing file alone without -Force' {
        New-ProjectFile -ProjectPath $project -RelativePath 'keep.txt' -Content 'original'
        New-ProjectFile -ProjectPath $project -RelativePath 'keep.txt' -Content 'replacement' 6>$null

        Get-Content -Raw (Join-Path $project 'keep.txt') | Should -BeExactly "original`n"
    }

    It 'overwrites an existing file with -Force' {
        New-ProjectFile -ProjectPath $project -RelativePath 'keep.txt' -Content 'original'
        New-ProjectFile -ProjectPath $project -RelativePath 'keep.txt' -Content 'replacement' -Force

        Get-Content -Raw (Join-Path $project 'keep.txt') | Should -BeExactly "replacement`n"
    }
}

Describe 'New-ProjectStructure' {
    It 'creates src, tests, docs/decisions and .github' {
        $project = New-TestFolder
        New-ProjectStructure -ProjectPath $project

        foreach ($folder in 'src', 'tests', 'docs/decisions', '.github') {
            Join-Path $project $folder | Should -Exist
        }
    }
}

Describe 'New-Gitignore' {
    It 'adds the <Language> section' -TestCases @(
        @{ Language = 'python'; Expected = '*.pyc' }
        @{ Language = 'node'; Expected = '.npm/' }
        @{ Language = 'csharp'; Expected = '*.user' }
        @{ Language = 'java'; Expected = '.gradle/' }
        @{ Language = 'rust'; Expected = 'Cargo.lock' }
    ) {
        $project = New-TestFolder
        New-Gitignore -ProjectPath $project -Language $Language

        $lines = Get-Content (Join-Path $project '.gitignore')
        $lines | Should -Contain $Expected
        $lines | Should -Contain '.env'
    }

    It 'writes only the common section for go' {
        $project = New-TestFolder
        New-Gitignore -ProjectPath $project -Language 'go'

        $content = Get-Content -Raw (Join-Path $project '.gitignore')
        $content | Should -Not -Match 'specific'
        $content | Should -Match '(?m)^\.env$'
    }
}

Describe 'Common files' {
    BeforeAll {
        $project = New-TestFolder
        New-Gitattributes -ProjectPath $project
        New-EnvExample -ProjectPath $project
        New-ReadmeFile -ProjectPath $project -ProjectName 'Example.Project' -Commands $commands
        New-ArchitectureFile -ProjectPath $project -ProjectName 'Example.Project'
        New-AdrTemplate -ProjectPath $project
        New-ClaudeInstructions -ProjectPath $project -ProjectName 'Example.Project' -Commands $commands
        New-AgentsInstructions -ProjectPath $project -ProjectName 'Example.Project' -Commands $commands
    }

    It '.gitattributes forces LF' {
        Get-Content -Raw (Join-Path $project '.gitattributes') | Should -BeExactly "* text=auto eol=lf`n"
    }

    It '.env.example holds placeholders, never a real .env' {
        Join-Path $project '.env.example' | Should -Exist
        Join-Path $project '.env' | Should -Not -Exist
    }

    It '<File> names the project and every command' -TestCases @(
        @{ File = 'README.md' }
        @{ File = 'CLAUDE.md' }
        @{ File = 'AGENTS.md' }
    ) {
        $content = Get-Content -Raw (Join-Path $project $File)
        $content | Should -Match 'Example\.Project'
        foreach ($command in $commands.Values) { $content | Should -Match ([regex]::Escape($command)) }
    }

    It 'README.md has balanced code fences' {
        $fences = @(Get-Content (Join-Path $project 'README.md') | Where-Object { $_.Trim() -like '```*' })
        $fences.Count % 2 | Should -Be 0
    }

    It 'writes the architecture page and the first ADR with today''s date' {
        $today = Get-Date -Format 'yyyy-MM-dd'
        Get-Content -Raw (Join-Path $project 'docs/architecture.md') | Should -Match "Example\.Project Architecture[\s\S]*$today"
        Get-Content -Raw (Join-Path $project 'docs/decisions/0001-initial-project-setup.md') | Should -Match $today
    }

    It 'writes every file without CR characters' {
        foreach ($file in Get-ChildItem -Path $project -Recurse -File) {
            [IO.File]::ReadAllText($file.FullName) | Should -Not -Match "`r" -Because $file.Name
        }
    }
}

Describe 'Invoke-LanguageStarter' {
    It 'returns $false for <Language>, which has no starter' -TestCases @(
        @{ Language = 'csharp' }, @{ Language = 'rust' }, @{ Language = 'java' }, @{ Language = 'go' }
    ) {
        $project = New-TestFolder

        Invoke-LanguageStarter -Language $Language -ProjectPath $project -ProjectName 'Example' | Should -BeFalse
        @(Get-ChildItem $project -Force).Count | Should -Be 0
    }

    It 'writes the <Language> starter files' -TestCases @(
        @{ Language = 'node'; Files = @('package.json', 'tsconfig.json', 'tsconfig.test.json', 'eslint.config.js', '.prettierrc.json', 'src/index.ts', 'src/greeting.ts', 'tests/index.test.ts') }
        @{ Language = 'python'; Files = @('requirements.txt', 'requirements-dev.txt', 'setup.py', 'pyproject.toml', 'pytest.ini', '.flake8', 'src/__init__.py', 'src/main.py', 'tests/__init__.py', 'tests/test_main.py') }
    ) {
        $project = New-TestFolder

        $result = Invoke-LanguageStarter -Language $Language -ProjectPath $project -ProjectName 'Example.Project' 6>$null
        $result | Should -BeTrue
        foreach ($file in $Files) { Join-Path $project $file | Should -Exist }
    }

    It 'gives package.json a valid npm name derived from the project name' {
        $project = New-TestFolder
        $null = Invoke-LanguageStarter -Language 'node' -ProjectPath $project -ProjectName 'SubZeroDev.Thing' 6>$null

        $package = Get-Content -Raw (Join-Path $project 'package.json') | ConvertFrom-Json
        $package.name | Should -BeExactly 'subzerodev-thing'
    }
}

Describe 'Test-ProjectCommand' {
    BeforeAll { $project = New-TestFolder }

    It 'returns exactly $true when the command exits 0, even when it writes output' {
        $result = @(Test-ProjectCommand -ProjectPath $project -Command "Write-Output 'noise'" 6>$null)

        $result.Count | Should -Be 1
        $result[0] | Should -BeOfType [bool]
        $result[0] | Should -BeTrue
    }

    It 'returns $false when a native command exits non-zero' {
        Test-ProjectCommand -ProjectPath $project -Command 'pwsh -NoLogo -NoProfile -NonInteractive -Command exit 3' 6>$null | Should -BeFalse
    }

    It 'returns $false when the command throws' {
        Test-ProjectCommand -ProjectPath $project -Command "throw 'boom'" 6>$null | Should -BeFalse
    }

    It 'returns $false when the command does not exist' {
        Test-ProjectCommand -ProjectPath $project -Command 'definitely-not-a-command-xyz' 6>$null | Should -BeFalse
    }

    It 'runs in the project folder and restores the caller''s location' {
        $before = (Get-Location).Path
        $marker = 'Set-Content -Path ran.txt -Value x'

        Test-ProjectCommand -ProjectPath $project -Command $marker 6>$null | Should -BeTrue
        Join-Path $project 'ran.txt' | Should -Exist
        (Get-Location).Path | Should -Be $before
    }
}

Describe 'Initialize-ProjectGit and New-ProjectInitialCommit' {
    BeforeAll {
        $project = New-TestFolder
        $null = Initialize-ProjectGit -ProjectPath $project -UserName 'Pester' -UserEmail 'pester@example.com'
        New-ProjectFile -ProjectPath $project -RelativePath 'README.md' -Content '# Example'
        $null = New-ProjectInitialCommit -ProjectPath $project
    }

    It 'initializes on main with the given identity' {
        git -C $project branch --show-current | Should -BeExactly 'main'
        git -C $project config user.name | Should -BeExactly 'Pester'
        git -C $project config user.email | Should -BeExactly 'pester@example.com'
    }

    It 'keeps the empty src and tests folders with .gitkeep' {
        git -C $project ls-files | Should -Contain 'src/.gitkeep'
        git -C $project ls-files | Should -Contain 'tests/.gitkeep'
    }

    It 'commits everything in one commit and leaves a clean tree' {
        @(git -C $project rev-list --all).Count | Should -Be 1
        git -C $project log -1 --format=%s | Should -BeExactly 'Initial project scaffold'
        git -C $project status --porcelain | Should -BeNullOrEmpty
    }

    It 'throws when git fails' {
        { Initialize-ProjectGit -ProjectPath (Join-Path $TestDrive 'missing/nested/path') } | Should -Throw '*exit code*'
    }
}

Describe 'Assert-CommandAvailable' {
    It 'passes for a command that exists' {
        { Assert-CommandAvailable -Name 'git' -InstallHint 'hint' } | Should -Not -Throw
    }

    It 'throws with the install hint for a missing command' {
        { Assert-CommandAvailable -Name 'definitely-not-a-command-xyz' -InstallHint 'Install it.' } |
            Should -Throw "'definitely-not-a-command-xyz' was not found. Install it."
    }
}
