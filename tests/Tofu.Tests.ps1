#Requires -Version 7.0
#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0.0' }

# Needs OpenTofu, so it is tagged Tofu and skipped where tofu is not installed. The
# github provider is mocked inside tofu test, so nothing here needs a token or the
# real state.

BeforeDiscovery {
    $tofuMissing = -not (Get-Command tofu -CommandType Application -ErrorAction SilentlyContinue)
}

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot 'TestHelpers.psm1') -Force
    $savedEnvironment = Save-Environment
    $repositoryRoot = Split-Path -Parent $PSScriptRoot

    function Invoke-RealTofu {
        $tofu = (Get-Command tofu -CommandType Application | Select-Object -First 1).Source
        $output = & $tofu @args 2>&1 | Out-String
        [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output }
    }
}

AfterAll {
    Uninstall-TofuMock
    Restore-Environment $savedEnvironment
}

Describe 'OpenTofu configuration' -Tag 'Tofu' -Skip:$tofuMissing {
    BeforeAll {
        # Any 16+ characters satisfy validation; tofu test sets its own passphrase.
        $env:TF_VAR_state_passphrase = 'pester-passphrase-0123'
        Remove-Item Env:TF_VAR_bootstrap_repositories -ErrorAction SilentlyContinue
        $init =Invoke-RealTofu "-chdir=$repositoryRoot" init -input=false -backend=false -no-color
    }

    It 'initializes' {
        $init.ExitCode | Should -Be 0 -Because $init.Output
    }

    It 'is formatted' {
        $result = Invoke-RealTofu "-chdir=$repositoryRoot" fmt -check -recursive -diff -no-color
        $result.ExitCode | Should -Be 0 -Because $result.Output
    }

    It 'validates' {
        $result = Invoke-RealTofu "-chdir=$repositoryRoot" validate -no-color
        $result.ExitCode | Should -Be 0 -Because $result.Output
    }

    It 'passes tofu test (standard settings, Main ruleset, bootstrap, definitions)' {
        $result = Invoke-RealTofu "-chdir=$repositoryRoot" test -no-color
        $result.ExitCode | Should -Be 0 -Because $result.Output
        $result.Output | Should -Match 'Success! \d+ passed, 0 failed'
    }
}

Describe 'Definitions written by New-Repository.ps1, as OpenTofu reads them' -Tag 'Tofu' -Skip:$tofuMissing {
    BeforeAll {
        $root = New-TestRoot -Parent $TestDrive
        $local = Join-Path (Split-Path -Parent $root) 'local'
        $remote = Join-Path (Split-Path -Parent $root) 'remote.git'
        New-TestGitRepository -Path $local -Commit
        New-TestGitRepository -Path $remote -Bare

        $env:TF_VAR_state_passphrase = 'pester-passphrase-0123'
        $env:GITHUB_TOKEN = 'pester-token'
        $null = Install-TofuMock -RepositoryName 'Example.Repository' -CloneUrl $remote
        $arguments = @{
            Name          = 'Example.Repository'
            Description   = "It's: a [thing] # not a comment"
            Visibility    = 'private'
            Topics        = @('PowerShell', 'yes', '123')
            RequiredCheck = @('build / Result@15368', 'lint: strict')
            Path          = $local
        }
        $null = & (Join-Path $root 'scripts/New-Repository.ps1') @arguments 6>$null
        Uninstall-TofuMock

        $definition = Join-Path $root 'repositories/Example.Repository.yaml'
        $expression = 'jsonencode(yamldecode(file("{0}")))' -f ($definition -replace '\\', '/')
        $console = Join-Path $TestDrive 'console'
        $null = New-Item -ItemType Directory -Path $console
        $tofu = (Get-Command tofu -CommandType Application | Select-Object -First 1).Source
        $raw = $expression | & $tofu "-chdir=$console" console -no-color
        $decoded = $raw | ConvertFrom-Json | ConvertFrom-Json
    }

    It 'keeps the description verbatim' {
        $decoded.description | Should -BeExactly "It's: a [thing] # not a comment"
    }

    It 'keeps visibility' {
        $decoded.visibility | Should -BeExactly 'private'
    }

    It 'keeps topics as strings, even ones YAML would read as booleans or numbers' {
        $decoded.topics | Should -Be @('powershell', 'yes', '123')
        foreach ($topic in $decoded.topics) { $topic | Should -BeOfType [string] }
    }

    It 'keeps required checks and their integration_id as a number' {
        $decoded.required_checks.Count | Should -Be 2
        $decoded.required_checks[0].context | Should -BeExactly 'build / Result'
        $decoded.required_checks[0].integration_id | Should -Be 15368
        $decoded.required_checks[0].integration_id | Should -BeOfType [long]
        $decoded.required_checks[1].context | Should -BeExactly 'lint: strict'
        $decoded.required_checks[1].PSObject.Properties.Name | Should -Not -Contain 'integration_id'
    }

    It 'turns auto_init off as a boolean' {
        $decoded.auto_init | Should -BeOfType [bool]
        $decoded.auto_init | Should -BeFalse
    }
}
