#Requires -Version 7.0
#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0.0' }

# Runs scripts/New-Repository.ps1 from an isolated copy of scripts/, against a recording
# stand-in for tofu. The "GitHub" remote is a local bare repository.

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot 'TestHelpers.psm1') -Force
    $savedEnvironment = Save-Environment

    function Invoke-NewRepository {
        param([hashtable]$Arguments)
        $null = & (Join-Path $root 'scripts/New-Repository.ps1') @Arguments 6>$null
    }

    function Get-Definition {
        param([string]$Name = 'Example.Repository')
        Get-Content -Raw (Join-Path $root "repositories/$Name.yaml")
    }

    $destroyChange = [pscustomobject]@{
        address = 'module.repository["Other"].github_repository.this'
        change  = [pscustomobject]@{ actions = @('delete', 'create') }
    }
}

AfterAll {
    Uninstall-TofuMock
    Restore-Environment $savedEnvironment
}

Describe 'New-Repository.ps1' {
    BeforeEach {
        $root = New-TestRoot -Parent $TestDrive
        $workspace = Split-Path -Parent $root
        $mock = Install-TofuMock -RepositoryName 'Example.Repository'
        $env:TF_VAR_state_passphrase = 'pester-passphrase-0123'
        $env:GITHUB_TOKEN = 'pester-token'
        Remove-Item Env:TF_VAR_bootstrap_repositories -ErrorAction SilentlyContinue
    }

    Describe 'The repository definition it writes' {
        It 'quotes the description, doubling single quotes' {
            Invoke-NewRepository @{ Name = 'Example.Repository'; Description = "It's a thing" }

            Get-Definition | Should -BeExactly "description: 'It''s a thing'`nvisibility: public`n"
        }

        It 'lowercases and quotes topics' {
            Invoke-NewRepository @{ Name = 'Example.Repository'; Topics = @('PowerShell', 'Tooling') }

            Get-Definition | Should -Match "(?m)^topics:\n  - 'powershell'\n  - 'tooling'$"
        }

        It 'writes required checks, with integration_id only where one is given' {
            Invoke-NewRepository @{ Name = 'Example.Repository'; RequiredCheck = @('build / Result@15368', 'lint') }

            Get-Definition | Should -Match "(?m)^required_checks:\n  - context: 'build / Result'\n    integration_id: 15368\n  - context: 'lint'$"
        }

        It 'writes private visibility' {
            Invoke-NewRepository @{ Name = 'Example.Repository'; Visibility = 'private' }

            Get-Definition | Should -Match '(?m)^visibility: private$'
        }

        It 'leaves auto_init to the standard when there is no -Path' {
            Invoke-NewRepository @{ Name = 'Example.Repository' }

            Get-Definition | Should -Not -Match 'auto_init'
        }

        It 'writes LF endings and no BOM' {
            Invoke-NewRepository @{ Name = 'Example.Repository'; Topics = @('a', 'b') }

            $bytes = [IO.File]::ReadAllBytes((Join-Path $root 'repositories/Example.Repository.yaml'))
            $bytes[0] | Should -Not -Be 0xEF
            [Text.Encoding]::UTF8.GetString($bytes) | Should -Not -Match "`r"
        }
    }

    Describe 'Planning and applying' {
        It 'initializes, plans, checks the plan, applies, and removes the plan file' {
            Invoke-NewRepository @{ Name = 'Example.Repository' }

            Get-TofuCommand | Should -Be @('init', 'plan', 'show', 'apply')
            $mock.Calls[0].Arguments | Should -Contain "-chdir=$root"
            Join-Path $root 'new-repository.tfplan' | Should -Not -Exist
        }

        It 'never sets the bootstrap variable without -Path' {
            Invoke-NewRepository @{ Name = 'Example.Repository' }

            @($mock.Calls | Where-Object Bootstrap) | Should -BeNullOrEmpty
        }

        It 'refuses a plan that destroys or replaces anything' {
            $mock.ResourceChanges = @($destroyChange)

            { Invoke-NewRepository @{ Name = 'Example.Repository' } } | Should -Throw '*Plan destroys or replaces: module.repository`["Other"`].github_repository.this*'
            Get-TofuCommand | Should -Not -Contain 'apply'
        }

        It 'applies a destructive plan with -Force' {
            $mock.ResourceChanges = @($destroyChange)

            Invoke-NewRepository @{ Name = 'Example.Repository'; Force = $true }

            Get-TofuCommand | Should -Contain 'apply'
        }

        It 'applies a plan that only creates or updates' {
            $mock.ResourceChanges = @(
                [pscustomobject]@{ address = 'a'; change = [pscustomobject]@{ actions = @('create') } }
                [pscustomobject]@{ address = 'b'; change = [pscustomobject]@{ actions = @('update') } }
                [pscustomobject]@{ address = 'c'; change = [pscustomobject]@{ actions = @('no-op') } }
            )

            Invoke-NewRepository @{ Name = 'Example.Repository' }

            Get-TofuCommand | Should -Contain 'apply'
        }

        It 'stops when tofu <Command> fails' -TestCases @(
            @{ Command = 'init' }, @{ Command = 'plan' }, @{ Command = 'apply' }
        ) {
            $mock.ExitCodes[$Command] = 1

            { Invoke-NewRepository @{ Name = 'Example.Repository' } } | Should -Throw "tofu $Command failed with exit code 1."
            Join-Path $root 'new-repository.tfplan' | Should -Not -Exist
        }
    }

    Describe '-PlanOnly' {
        It 'shows the plan, applies nothing, and removes the definition it wrote' {
            Invoke-NewRepository @{ Name = 'Example.Repository'; PlanOnly = $true }

            Get-TofuCommand | Should -Be @('init', 'plan', 'show')
            Join-Path $root 'repositories/Example.Repository.yaml' | Should -Not -Exist
        }

        It 'puts back a definition it overwrote with -Force' {
            $original = "description: 'Before'`nvisibility: private`n"
            Set-Content -Path (Join-Path $root 'repositories/Example.Repository.yaml') -Value $original -NoNewline

            Invoke-NewRepository @{ Name = 'Example.Repository'; Description = 'After'; PlanOnly = $true; Force = $true }

            Get-Definition | Should -BeExactly $original
        }

        It 'still refuses a destructive plan, and still cleans up' {
            $mock.ResourceChanges = @($destroyChange)

            { Invoke-NewRepository @{ Name = 'Example.Repository'; PlanOnly = $true } } | Should -Throw '*Plan destroys or replaces*'
            Join-Path $root 'repositories/Example.Repository.yaml' | Should -Not -Exist
        }
    }

    Describe 'Refusals before anything is written' {
        It 'refuses without a 16+ character passphrase' -TestCases @(
            @{ Passphrase = $null }, @{ Passphrase = 'fifteen-chars!!' }
        ) {
            $env:TF_VAR_state_passphrase = $Passphrase

            { Invoke-NewRepository @{ Name = 'Example.Repository' } } | Should -Throw '*TF_VAR_state_passphrase*'
            Get-TofuCommand | Should -BeNullOrEmpty
            Join-Path $root 'repositories/Example.Repository.yaml' | Should -Not -Exist
        }

        It 'refuses to overwrite an existing definition without -Force' {
            $original = "description: 'Keep me'`n"
            Set-Content -Path (Join-Path $root 'repositories/Example.Repository.yaml') -Value $original -NoNewline

            { Invoke-NewRepository @{ Name = 'Example.Repository' } } | Should -Throw '*already exists*'
            Get-Definition | Should -BeExactly $original
            Get-TofuCommand | Should -BeNullOrEmpty
        }

        It 'rejects a name GitHub would not accept' {
            { Invoke-NewRepository @{ Name = 'has space' } } | Should -Throw
            Get-TofuCommand | Should -BeNullOrEmpty
        }

        It 'refuses a -Path with no main branch' {
            $local = Join-Path $workspace 'local'
            New-TestGitRepository -Path $local

            { Invoke-NewRepository @{ Name = 'Example.Repository'; Path = $local } } | Should -Throw '*has no local main branch*'
            Get-TofuCommand | Should -BeNullOrEmpty
            Join-Path $root 'repositories/Example.Repository.yaml' | Should -Not -Exist
        }

        It 'refuses a -Path that already has an origin' {
            $local = Join-Path $workspace 'local'
            New-TestGitRepository -Path $local -Commit
            $null = git -C $local remote add origin 'https://example.com/elsewhere.git'

            { Invoke-NewRepository @{ Name = 'Example.Repository'; Path = $local } } | Should -Throw '*already has an origin remote*'
            Get-TofuCommand | Should -BeNullOrEmpty
        }

        It 'takes GITHUB_TOKEN from gh when it is not set' {
            Remove-Item Env:GITHUB_TOKEN
            function global:gh { 'token-from-gh'; $global:LASTEXITCODE = 0 }
            try {
                Invoke-NewRepository @{ Name = 'Example.Repository' }
                $env:GITHUB_TOKEN | Should -BeExactly 'token-from-gh'
            }
            finally { Remove-Item Function:\gh }
        }

        It 'refuses when GITHUB_TOKEN is not set and gh fails' {
            Remove-Item Env:GITHUB_TOKEN
            function global:gh { $global:LASTEXITCODE = 1 }
            try {
                { Invoke-NewRepository @{ Name = 'Example.Repository' } } | Should -Throw '*gh auth token*'
                Get-TofuCommand | Should -BeNullOrEmpty
            }
            finally { Remove-Item Function:\gh }
        }
    }

    Describe 'Publishing an existing local repository with -Path' {
        BeforeEach {
            $local = Join-Path $workspace 'local'
            $remote = Join-Path $workspace 'remote.git'
            New-TestGitRepository -Path $local -Commit
            New-TestGitRepository -Path $remote -Bare
            $mock.CloneUrl = $remote
        }

        It 'creates the repository with the ruleset disabled, pushes main, then activates the ruleset' {
            Invoke-NewRepository @{ Name = 'Example.Repository'; Path = $local }

            Get-TofuCommand | Should -Be @('init', 'plan', 'show', 'apply', 'output', 'plan', 'show', 'apply')
            $plans = @($mock.Calls | Where-Object Command -EQ 'plan')
            $plans[0].Bootstrap | Should -BeExactly '["Example.Repository"]'
            $plans[1].Bootstrap | Should -BeNullOrEmpty

            Get-Definition | Should -Match '(?m)^auto_init: false$'
            git -C $local remote get-url origin | Should -BeExactly $remote
            git -C $remote rev-parse refs/heads/main | Should -BeExactly (git -C $local rev-parse HEAD)
            git -C $local rev-parse --abbrev-ref 'main@{upstream}' | Should -BeExactly 'origin/main'
            $env:TF_VAR_bootstrap_repositories | Should -BeNullOrEmpty
        }

        It 'with -PlanOnly pushes nothing and clears the bootstrap variable' {
            Invoke-NewRepository @{ Name = 'Example.Repository'; Path = $local; PlanOnly = $true }

            Get-TofuCommand | Should -Be @('init', 'plan', 'show')
            $mock.Calls[1].Bootstrap | Should -BeExactly '["Example.Repository"]'
            git -C $local remote | Should -BeNullOrEmpty
            $env:TF_VAR_bootstrap_repositories | Should -BeNullOrEmpty
            Join-Path $root 'repositories/Example.Repository.yaml' | Should -Not -Exist
        }

        It 'clears the bootstrap variable and pushes nothing when the first apply fails' {
            $mock.ExitCodes['apply'] = 1

            { Invoke-NewRepository @{ Name = 'Example.Repository'; Path = $local } } | Should -Throw '*tofu apply failed*'
            git -C $local remote | Should -BeNullOrEmpty
            $env:TF_VAR_bootstrap_repositories | Should -BeNullOrEmpty
        }

        It 'stops before activating the ruleset when the push fails' {
            $mock.CloneUrl = Join-Path $workspace 'does-not-exist.git'

            { Invoke-NewRepository @{ Name = 'Example.Repository'; Path = $local } 2>$null } | Should -Throw '*git push failed*'
            @(Get-TofuCommand | Where-Object { $_ -eq 'apply' }).Count | Should -Be 1
            $env:TF_VAR_bootstrap_repositories | Should -BeNullOrEmpty
        }
    }
}
