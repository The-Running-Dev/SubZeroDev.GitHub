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

    Describe 'Opt-in target-scoped publishing' {
        BeforeAll {
            function New-CreationPlan([string] $Enforcement = 'disabled') {
                @(
                    @{ address = 'module.repository["Example.Repository"].github_repository.this'; mode = 'managed'
                        change = @{ actions = @('create'); before = $null; after = @{ name = 'Example.Repository' } } }
                    @{ address = 'module.repository["Example.Repository"].github_repository_ruleset.main'; mode = 'managed'
                        change = @{ actions = @('create'); before = $null
                            after = @{ name = 'Main'; repository = 'Example.Repository'; target = 'branch'; enforcement = $Enforcement } } }
                )
            }

            function New-ActivationPlan {
                $before = @{ id = '123'; name = 'Main'; repository = 'Example.Repository'; target = 'branch'
                    enforcement = 'disabled'; rules = @(@{ deletion = $true; non_fast_forward = $true }) }
                # Deliberately different object-key order; object ordering is not a mutation.
                $after = [ordered]@{ rules = @(@{ non_fast_forward = $true; deletion = $true })
                    enforcement = 'active'; target = 'branch'; repository = 'Example.Repository'; name = 'Main'; id = '123' }
                @(@{ address = 'module.repository["Example.Repository"].github_repository_ruleset.main'; mode = 'managed'
                    change = @{ actions = @('update'); before = $before; after = $after
                        after_unknown = @{ id = $false; rules = @(@{ deletion = $false }) } } })
            }
        }

        BeforeEach {
            $local = Join-Path $workspace 'local'
            $remote = Join-Path $workspace 'remote.git'
            New-TestGitRepository -Path $local -Commit
            New-TestGitRepository -Path $remote -Bare
            $mock.CloneUrl = $remote
        }

        It 'checks and applies each saved plan, with only enforcement changing after the push' {
            $mock.Plans.Enqueue(@(New-CreationPlan))
            $mock.Plans.Enqueue(@(New-ActivationPlan))

            Invoke-NewRepository @{ Name = 'Example.Repository'; Path = $local; TargetScoped = $true }

            Get-TofuCommand | Should -Be @('init', 'plan', 'show', 'apply', 'output', 'plan', 'show', 'apply')
            $shows = @($mock.Calls | Where-Object Command -EQ show)
            $applies = @($mock.Calls | Where-Object Command -EQ apply)
            foreach ($i in 0..1) {
                $shows[$i].PlanPath | Should -BeExactly $applies[$i].PlanPath
                $shows[$i].PlanJson | Should -BeExactly $applies[$i].PlanJson
                $applies[$i].Arguments[-1] | Should -BeExactly (Join-Path $root 'new-repository.tfplan')
            }
            git -C $remote rev-parse refs/heads/main | Should -BeExactly (git -C $local rev-parse HEAD)
            $env:TF_VAR_bootstrap_repositories | Should -BeNullOrEmpty
            Join-Path $root 'new-repository.tfplan' | Should -Not -Exist
        }

        It 'supports creation without -Path, with an active ruleset' {
            $mock.Plans.Enqueue(@(New-CreationPlan -Enforcement active))
            Invoke-NewRepository @{ Name = 'Example.Repository'; TargetScoped = $true }
            @(Get-TofuCommand | Where-Object { $_ -eq 'apply' }).Count | Should -Be 1
        }

        It 'allows unrelated no-ops' {
            $changes = @(New-CreationPlan) + @(@{ address = 'module.repository["Other"].github_repository.this'
                change = @{ actions = @('no-op') } })
            $mock.Plans.Enqueue($changes)
            Invoke-NewRepository @{ Name = 'Example.Repository'; Path = $local; TargetScoped = $true; PlanOnly = $true }
            Get-TofuCommand | Should -Not -Contain apply
            Join-Path $root 'repositories/Example.Repository.yaml' | Should -Not -Exist
        }

        It 'rejects an unrelated <Action> introduced after a clean preview in the <Phase> plan' -TestCases @(
            @{ Action = 'create'; Phase = 'Create'; ApplyCount = 0 }
            @{ Action = 'update'; Phase = 'Create'; ApplyCount = 0 }
            @{ Action = 'create'; Phase = 'Activate'; ApplyCount = 1 }
            @{ Action = 'update'; Phase = 'Activate'; ApplyCount = 1 }
        ) {
            $mock.Plans.Enqueue(@(New-CreationPlan))
            Invoke-NewRepository @{ Name = 'Example.Repository'; Path = $local; TargetScoped = $true; PlanOnly = $true }
            git -C $local remote | Should -BeNullOrEmpty
            Join-Path $root 'repositories/Example.Repository.yaml' | Should -Not -Exist

            $outside = @{ address = 'module.repository["Other"].github_repository.this'; mode = 'managed'
                change = @{ actions = @($Action) } }
            if ($Phase -eq 'Create') { $mock.Plans.Enqueue(@(New-CreationPlan) + @($outside)) }
            else {
                $mock.Plans.Enqueue(@(New-CreationPlan))
                $mock.Plans.Enqueue(@(New-ActivationPlan) + @($outside))
            }
            $failure = $null
            try { Invoke-NewRepository @{ Name = 'Example.Repository'; Path = $local; TargetScoped = $true } }
            catch { $failure = $_.Exception.Message }

            $failure | Should -Not -BeNullOrEmpty
            $failure | Should -Match "Target-scoped $Phase plan refuses change at"
            $failure | Should -Match 'module.repository\["Other"\].github_repository.this'
            @(Get-TofuCommand | Where-Object { $_ -eq 'apply' }).Count | Should -Be $ApplyCount
            $shows = @($mock.Calls | Where-Object Command -EQ show)
            $applies = @($mock.Calls | Where-Object Command -EQ apply)
            @($applies | Where-Object PlanJson -EQ $shows[-1].PlanJson).Count | Should -Be 0
            if ($Phase -eq 'Create') {
                $failure | Should -Match 'No apply ran'
                git -C $local remote | Should -BeNullOrEmpty
                git -C $remote show-ref --heads | Should -BeNullOrEmpty
            }
            else {
                $failure | Should -Match 'Creation apply and main push completed; ruleset activation did not complete'
                git -C $local remote get-url origin | Should -BeExactly $remote
                git -C $remote rev-parse refs/heads/main | Should -BeExactly (git -C $local rev-parse HEAD)
            }
            $failure | Should -Match 'Definition retained at'
            $failure | Should -Not -Match 'pester-token|pester-passphrase'
            Join-Path $root 'repositories/Example.Repository.yaml' | Should -Exist
            Join-Path $root 'new-repository.tfplan' | Should -Not -Exist
            $env:TF_VAR_bootstrap_repositories | Should -BeNullOrEmpty
        }

        It 'rejects an unexpected creation transition: <Mutation>' -TestCases @(
            @{ Mutation = 'target update' }, @{ Mutation = 'extra target resource' }
            @{ Mutation = 'prefix sibling' }, @{ Mutation = 'case sibling' }
            @{ Mutation = 'wrong repository name' }, @{ Mutation = 'active bootstrap' }
            @{ Mutation = 'missing ruleset' }, @{ Mutation = 'import' }, @{ Mutation = 'move' }
        ) {
            $changes = @(New-CreationPlan)
            switch ($Mutation) {
                'target update' { $changes[0].change.actions = @('update') }
                'extra target resource' { $changes += @{ address = 'module.repository["Example.Repository"].github_branch.extra'; mode = 'managed'; change = @{ actions = @('create') } } }
                'prefix sibling' { $changes[0].address = 'module.repository["Example.Repository-extra"].github_repository.this' }
                'case sibling' { $changes[0].address = 'module.repository["example.repository"].github_repository.this' }
                'wrong repository name' { $changes[0].change.after.name = 'Other' }
                'active bootstrap' { $changes[1].change.after.enforcement = 'active' }
                'missing ruleset' { $changes = @($changes[0]) }
                'import' { $changes += @{ address = 'outside'; change = @{ actions = @('no-op'); importing = @{ id = '1' } } } }
                'move' { $changes[0].previous_address = 'outside' }
            }
            $mock.Plans.Enqueue($changes)
            { Invoke-NewRepository @{ Name = 'Example.Repository'; Path = $local; TargetScoped = $true } } | Should -Throw '*Target-scoped*'
            Get-TofuCommand | Should -Not -Contain apply
        }

        It 'rejects an unexpected activation transition: <Mutation>' -TestCases @(
            @{ Mutation = 'repository update' }, @{ Mutation = 'ruleset create' }
            @{ Mutation = 'ruleset rename' }, @{ Mutation = 'rules change' }
            @{ Mutation = 'unknown attribute' }, @{ Mutation = 'new attribute' }
            @{ Mutation = 'already active' }, @{ Mutation = 'missing transition' }
        ) {
            $changes = @(New-ActivationPlan)
            switch ($Mutation) {
                'repository update' { $changes += @{ address = 'module.repository["Example.Repository"].github_repository.this'; mode = 'managed'; change = @{ actions = @('update') } } }
                'ruleset create' { $changes[0].change.actions = @('create') }
                'ruleset rename' { $changes[0].change.after.name = 'Other' }
                'rules change' { $changes[0].change.after.rules[0].deletion = $false }
                'unknown attribute' { $changes[0].change.after_unknown.rules[0].deletion = $true }
                'new attribute' { $changes[0].change.after['extra'] = 'unexpected' }
                'already active' { $changes[0].change.before.enforcement = 'active' }
                'missing transition' { $changes[0].change.actions = @('no-op') }
            }
            $mock.Plans.Enqueue(@(New-CreationPlan))
            $mock.Plans.Enqueue($changes)
            { Invoke-NewRepository @{ Name = 'Example.Repository'; Path = $local; TargetScoped = $true } } | Should -Throw '*Target-scoped*'
            @(Get-TofuCommand | Where-Object { $_ -eq 'apply' }).Count | Should -Be 1
        }

        It 'preserves destruction safeguards, including when -Force is combined with the scope guard' -TestCases @(
            @{ Actions = @('delete'); Force = $false }, @{ Actions = @('delete', 'create'); Force = $false }
            @{ Actions = @('delete'); Force = $true }, @{ Actions = @('delete', 'create'); Force = $true }
        ) {
            $changes = @(New-CreationPlan)
            $changes[0].change.actions = $Actions
            $mock.Plans.Enqueue($changes)
            { Invoke-NewRepository @{ Name = 'Example.Repository'; Path = $local; TargetScoped = $true; Force = $Force } } | Should -Throw
            Get-TofuCommand | Should -Not -Contain apply
        }

        It 'reports an apply failure as potentially partial, retaining the definition' {
            $mock.Plans.Enqueue(@(New-CreationPlan))
            $mock.ExitCodes['apply'] = 1
            { Invoke-NewRepository @{ Name = 'Example.Repository'; Path = $local; TargetScoped = $true } } |
                Should -Throw '*Creation apply did not complete and may have partially changed remote resources*'
            Join-Path $root 'repositories/Example.Repository.yaml' | Should -Exist
            git -C $local remote | Should -BeNullOrEmpty
        }
    }

}
