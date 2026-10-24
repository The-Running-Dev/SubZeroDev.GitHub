#Requires -Version 7.0
#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0.0' }

# Runs scripts/New-Project.ps1 from an isolated copy of scripts/, so the real
# repositories/ folder is never read or written. tofu is a recording stand-in and the
# "GitHub" remote is a local bare repository.

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot 'TestHelpers.psm1') -Force
    $savedEnvironment = Save-Environment

    $identity = @{ GitUserName = 'Pester'; GitUserEmail = 'pester@example.com' }

    function Invoke-NewProject {
        param([hashtable]$Arguments)
        $null = & (Join-Path $root 'scripts/New-Project.ps1') @identity @Arguments 6>$null
    }

    function Get-HostOutput {
        param([hashtable]$Arguments)
        (& (Join-Path $root 'scripts/New-Project.ps1') @identity @Arguments 6>&1 | Out-String)
    }
}

AfterAll {
    Uninstall-TofuMock
    Restore-Environment $savedEnvironment
}

Describe 'New-Project.ps1 -LocalOnly' {
    BeforeEach {
        $root = New-TestRoot -Parent $TestDrive
        $project = Join-Path (Split-Path -Parent $root) 'Example.Project'
    }

    It 'scaffolds a <Language> project and commits it on main' -TestCases @(
        @{ Language = 'node'; StarterFile = 'package.json'; TestCommand = 'npm test' }
        @{ Language = 'python'; StarterFile = 'src/main.py'; TestCommand = 'pytest' }
        @{ Language = 'csharp'; StarterFile = $null; TestCommand = 'dotnet test' }
        @{ Language = 'rust'; StarterFile = $null; TestCommand = 'cargo test' }
        @{ Language = 'java'; StarterFile = $null; TestCommand = 'mvn test' }
        @{ Language = 'go'; StarterFile = $null; TestCommand = 'go test ./...' }
    ) {
        Invoke-NewProject @{ Name = 'Example.Project'; Language = $Language; Path = $project; LocalOnly = $true; SkipValidation = $true }

        $tracked = @(git -C $project ls-files)
        foreach ($file in '.gitignore', '.gitattributes', '.env.example', 'README.md', 'CLAUDE.md', 'AGENTS.md',
            'docs/architecture.md', 'docs/decisions/0001-initial-project-setup.md', 'src/.gitkeep', 'tests/.gitkeep') {
            $tracked | Should -Contain $file
        }
        if ($StarterFile) { $tracked | Should -Contain $StarterFile }
        Get-Content -Raw (Join-Path $project 'README.md') | Should -Match ([regex]::Escape($TestCommand))

        git -C $project branch --show-current | Should -BeExactly 'main'
        @(git -C $project rev-list --all).Count | Should -Be 1
        git -C $project log -1 --format='%s|%an|%ae' | Should -BeExactly 'Initial project scaffold|Pester|pester@example.com'
        git -C $project status --porcelain | Should -BeNullOrEmpty
        git -C $project remote | Should -BeNullOrEmpty
    }

    It 'commits every file with LF endings' {
        Invoke-NewProject @{ Name = 'Example.Project'; Language = 'node'; Path = $project; LocalOnly = $true; SkipValidation = $true }

        $endings = @(git -C $project ls-files --eol | Where-Object { $_ -notmatch '^i/(lf|none)\s' })
        $endings | Should -BeNullOrEmpty
    }

    It 'never touches the repositories folder' {
        Invoke-NewProject @{ Name = 'Example.Project'; Language = 'node'; Path = $project; LocalOnly = $true; SkipValidation = $true }

        @(Get-ChildItem (Join-Path $root 'repositories')).Count | Should -Be 0
    }

    It 'defaults -Path to a sibling of the repository named after the project' {
        Invoke-NewProject @{ Name = 'Sibling.Project'; Language = 'go'; LocalOnly = $true; SkipValidation = $true }

        Join-Path (Split-Path -Parent $root) 'Sibling.Project/README.md' | Should -Exist
    }

    It 'writes only <Expected> for -Client <Client>' -TestCases @(
        @{ Client = 'ClaudeCode'; Expected = 'CLAUDE.md'; Absent = 'AGENTS.md'; Language = 'go' }
        @{ Client = 'Codex'; Expected = 'AGENTS.md'; Absent = 'CLAUDE.md'; Language = 'go' }
        @{ Client = 'ClaudeCode'; Expected = 'CLAUDE.md'; Absent = 'AGENTS.md'; Language = 'node' }
        @{ Client = 'Codex'; Expected = 'AGENTS.md'; Absent = 'CLAUDE.md'; Language = 'node' }
    ) {
        Invoke-NewProject @{ Name = 'Example.Project'; Language = $Language; Path = $project; Client = $Client; LocalOnly = $true; SkipValidation = $true }

        Join-Path $project $Expected | Should -Exist
        Join-Path $project $Absent | Should -Not -Exist
    }

    It 'leaves the starter out with -SkipLanguageStarter' {
        Invoke-NewProject @{ Name = 'Example.Project'; Language = 'node'; Path = $project; SkipLanguageStarter = $true; LocalOnly = $true; SkipValidation = $true }

        Join-Path $project 'package.json' | Should -Not -Exist
        Join-Path $project 'README.md' | Should -Exist
    }

    It 'warns when the language has no starter' {
        $output = Get-HostOutput @{ Name = 'Example.Project'; Language = 'csharp'; Path = $project; LocalOnly = $true; SkipValidation = $true }

        $output | Should -Match 'There is no csharp starter yet'
    }
}

Describe 'New-Project.ps1 without -Language' {
    BeforeAll {
        Import-Module (Join-Path $PSScriptRoot '../scripts/modules/Project.psm1') -Force
        $everyCommand = foreach ($language in 'node', 'python', 'csharp', 'rust', 'java', 'go') {
            (Get-LanguageCommands -Language $language).Values
        }
        $starterFiles = 'package.json', 'tsconfig.json', 'eslint.config.js', 'requirements.txt', 'setup.py', 'pyproject.toml',
            'src/index.ts', 'src/main.py', 'tests/index.test.ts', 'tests/test_main.py'
    }

    BeforeEach {
        $root = New-TestRoot -Parent $TestDrive
        $project = Join-Path (Split-Path -Parent $root) 'Example.Project'
    }

    AfterEach { Remove-Item Function:\npm, Function:\pytest -ErrorAction SilentlyContinue }

    It 'scaffolds the common files and commits them on main' {
        Invoke-NewProject @{ Name = 'Example.Project'; Path = $project; LocalOnly = $true }

        $tracked = @(git -C $project ls-files)
        $tracked | Should -Be @('.env.example', '.gitattributes', '.gitignore', 'AGENTS.md', 'CLAUDE.md', 'README.md',
            'docs/architecture.md', 'docs/decisions/0001-initial-project-setup.md', 'src/.gitkeep', 'tests/.gitkeep')
        git -C $project branch --show-current | Should -BeExactly 'main'
        @(git -C $project rev-list --all).Count | Should -Be 1
        git -C $project log -1 --format='%s|%an|%ae' | Should -BeExactly 'Initial project scaffold|Pester|pester@example.com'
        git -C $project status --porcelain | Should -BeNullOrEmpty
        git -C $project remote | Should -BeNullOrEmpty
    }

    It 'writes no starter and invents no commands' {
        Invoke-NewProject @{ Name = 'Example.Project'; Path = $project; LocalOnly = $true }

        foreach ($file in $starterFiles) { Join-Path $project $file | Should -Not -Exist }
        foreach ($file in 'README.md', 'CLAUDE.md', 'AGENTS.md') {
            $content = Get-Content -Raw (Join-Path $project $file)
            foreach ($command in $everyCommand) { $content | Should -Not -Match ([regex]::Escape($command)) -Because $file }
            $content | Should -Match 'not selected yet|has not been selected yet' -Because $file
        }
        Get-Content -Raw (Join-Path $project '.gitignore') | Should -Not -Match 'specific'
    }

    It 'runs no build or test validation, and says the language is deferred' {
        function global:npm { throw 'npm must not run' }
        function global:pytest { throw 'pytest must not run' }

        $output = Get-HostOutput @{ Name = 'Example.Project'; Path = $project; LocalOnly = $true }

        $output | Should -Match 'Implementation language deferred'
        $output | Should -Match 'Add-ProjectLanguage\.ps1'
        $output | Should -Not -Match 'Running:|Build and tests passed|Build or tests did not pass'
    }

    It 'writes only <Expected> for -Client <Client>' -TestCases @(
        @{ Client = 'ClaudeCode'; Expected = 'CLAUDE.md'; Absent = 'AGENTS.md' }
        @{ Client = 'Codex'; Expected = 'AGENTS.md'; Absent = 'CLAUDE.md' }
    ) {
        Invoke-NewProject @{ Name = 'Example.Project'; Path = $project; Client = $Client; LocalOnly = $true }

        Join-Path $project $Expected | Should -Exist
        Join-Path $project $Absent | Should -Not -Exist
    }
}

Describe 'New-Project.ps1 validation of the build and tests' {
    BeforeEach {
        $root = New-TestRoot -Parent $TestDrive
        $project = Join-Path (Split-Path -Parent $root) 'Example.Project'
    }

    AfterEach { Remove-Item Function:\npm -ErrorAction SilentlyContinue }

    It 'reports success when build and test exit 0' {
        function global:npm { $global:LASTEXITCODE = 0 }

        $output = Get-HostOutput @{ Name = 'Example.Project'; Language = 'node'; Path = $project; LocalOnly = $true }

        $output | Should -Match 'Build and tests passed'
        @(git -C $project rev-list --all).Count | Should -Be 1
    }

    It 'warns, and still commits, when the build fails' {
        function global:npm { $global:LASTEXITCODE = 1 }

        $output = Get-HostOutput @{ Name = 'Example.Project'; Language = 'node'; Path = $project; LocalOnly = $true }

        $output | Should -Match 'Build or tests did not pass'
        $output | Should -Not -Match 'Build and tests passed'
        @(git -C $project rev-list --all).Count | Should -Be 1
        git -C $project status --porcelain | Should -BeNullOrEmpty
    }
}

Describe 'New-Project.ps1 refuses before writing anything' {
    BeforeEach {
        $root = New-TestRoot -Parent $TestDrive
        $project = Join-Path (Split-Path -Parent $root) 'Example.Project'
        $null = Install-TofuMock
        $env:TF_VAR_state_passphrase = 'pester-passphrase-0123'
        $env:GITHUB_TOKEN = 'pester-token'
    }

    It 'rejects a name GitHub would not accept' {
        { Invoke-NewProject @{ Name = 'bad name'; Language = 'node'; Path = $project; LocalOnly = $true } } | Should -Throw
        $project | Should -Not -Exist
    }

    It 'rejects a language it does not know' {
        { Invoke-NewProject @{ Name = 'Example.Project'; Language = 'cobol'; Path = $project; LocalOnly = $true } } | Should -Throw
        $project | Should -Not -Exist
    }

    It 'refuses a path that already exists' {
        $null = New-Item -ItemType Directory -Path $project

        { Invoke-NewProject @{ Name = 'Example.Project'; Language = 'node'; Path = $project; LocalOnly = $true } } | Should -Throw '*already exists*'
        @(Get-ChildItem $project -Force).Count | Should -Be 0
    }

    It 'refuses without a state passphrase unless -LocalOnly' -TestCases @(
        @{ Passphrase = $null }, @{ Passphrase = 'too-short' }
    ) {
        $env:TF_VAR_state_passphrase = $Passphrase

        { Invoke-NewProject @{ Name = 'Example.Project'; Language = 'node'; Path = $project; SkipValidation = $true } } | Should -Throw '*TF_VAR_state_passphrase*'
        $project | Should -Not -Exist
        Get-TofuCommand | Should -BeNullOrEmpty
    }

    It 'refuses a project that already has a repositories/<name>.yaml' {
        Set-Content -Path (Join-Path $root 'repositories/Example.Project.yaml') -Value "description: 'x'`n"

        { Invoke-NewProject @{ Name = 'Example.Project'; Language = 'node'; Path = $project; SkipValidation = $true } } | Should -Throw '*already managed here*'
        $project | Should -Not -Exist
        Get-TofuCommand | Should -BeNullOrEmpty
    }

    It 'refuses without tofu unless -LocalOnly' {
        Uninstall-TofuMock
        $path = $env:PATH
        try {
            # git stays reachable; nothing else does.
            $env:PATH = Split-Path -Parent (Get-Command git -CommandType Application | Select-Object -First 1).Source
            { Invoke-NewProject @{ Name = 'Example.Project'; Language = 'node'; Path = $project; SkipValidation = $true } } | Should -Throw "'tofu' was not found*"
        }
        finally {
            $env:PATH = $path
        }
        $project | Should -Not -Exist
    }
}

Describe 'New-Project.ps1 end to end, with GitHub stood in for' {
    BeforeEach {
        $root = New-TestRoot -Parent $TestDrive
        $workspace = Split-Path -Parent $root
        $project = Join-Path $workspace 'Example.Project'
        $remote = Join-Path $workspace 'remote.git'
        New-TestGitRepository -Path $remote -Bare
        $null = Install-TofuMock -RepositoryName 'Example.Project' -CloneUrl $remote
        $env:TF_VAR_state_passphrase = 'pester-passphrase-0123'
        $env:GITHUB_TOKEN = 'pester-token'
    }

    It 'writes the definition, creates the repository, pushes main, then activates the ruleset' {
        Invoke-NewProject @{
            Name          = 'Example.Project'
            Language      = 'node'
            Path          = $project
            Description   = 'Does a thing'
            Topics        = @('Node', 'tooling')
            RequiredCheck = @('build / Result@15368')
            SkipValidation = $true
        }

        $expected = @(
            "description: 'Does a thing'"
            'visibility: public'
            'topics:'
            "  - 'node'"
            "  - 'tooling'"
            'required_checks:'
            "  - context: 'build / Result'"
            '    integration_id: 15368'
            'auto_init: false'
            ''
        ) -join "`n"
        Get-Content -Raw (Join-Path $root 'repositories/Example.Project.yaml') | Should -BeExactly $expected

        Get-TofuCommand | Should -Be @('init', 'plan', 'show', 'apply', 'output', 'plan', 'show', 'apply')
        $plans = @($TofuMock.Calls | Where-Object Command -EQ 'plan')
        $plans[0].Bootstrap | Should -BeExactly '["Example.Project"]'
        $plans[1].Bootstrap | Should -BeNullOrEmpty

        git -C $project remote get-url origin | Should -BeExactly $remote
        git -C $remote rev-parse refs/heads/main | Should -BeExactly (git -C $project rev-parse HEAD)
        $env:TF_VAR_bootstrap_repositories | Should -BeNullOrEmpty
    }

    It 'publishes a project without -Language through the same New-Repository.ps1 steps' {
        Invoke-NewProject @{ Name = 'Example.Project'; Path = $project; Description = 'Does a thing' }

        Get-TofuCommand | Should -Be @('init', 'plan', 'show', 'apply', 'output', 'plan', 'show', 'apply')
        Get-Content -Raw (Join-Path $root 'repositories/Example.Project.yaml') | Should -Match 'auto_init: false'
        git -C $remote rev-parse refs/heads/main | Should -BeExactly (git -C $project rev-parse HEAD)
        Join-Path $project 'package.json' | Should -Not -Exist
    }

    It 'with -PlanOnly scaffolds and commits, applies nothing, and removes the definition' {
        Invoke-NewProject @{ Name = 'Example.Project'; Language = 'node'; Path = $project; SkipValidation = $true; PlanOnly = $true }

        Get-TofuCommand | Should -Be @('init', 'plan', 'show')
        Join-Path $root 'repositories/Example.Project.yaml' | Should -Not -Exist
        @(git -C $project rev-list --all).Count | Should -Be 1
        git -C $project remote | Should -BeNullOrEmpty
        git -C $remote rev-parse --verify --quiet refs/heads/main | Should -BeNullOrEmpty
    }
}
