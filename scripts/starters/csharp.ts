// Writes the C# starter files: a .NET 10 console app and an xUnit v3 test project in one solution.

import { writeProjectFile } from '../lib/files.ts';
import type { Log } from '../lib/log.ts';
import { dotnetNamespace } from './names.ts';
import { nugetVersion } from './versions.ts';

export function csharpStarter(log: Log, projectPath: string, projectName: string): void {
  const write = (relativePath: string, content: string) => writeProjectFile(projectPath, relativePath, content, { force: true });
  log.step('Setting up C# starter files');

  const namespace = dotnetNamespace(projectName);
  write(`${projectName}.slnx`, `<Solution>
  <Folder Name="/src/">
    <Project Path="src/${projectName}.csproj" />
  </Folder>
  <Folder Name="/tests/">
    <Project Path="tests/${projectName}.Tests.csproj" />
  </Folder>
</Solution>`);

  write('Directory.Build.props', `<Project>
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <AnalysisLevel>latest-recommended</AnalysisLevel>
    <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
  </PropertyGroup>
</Project>`);

  // dotnet test runs the tests on Microsoft.Testing.Platform, which xUnit v3 uses.
  write('global.json', JSON.stringify({ test: { runner: 'Microsoft.Testing.Platform' } }, null, 2));

  write('.editorconfig', `root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.cs]
indent_style = space
indent_size = 4

[*.{csproj,props,slnx,xml,json}]
indent_style = space
indent_size = 2`);

  write(`src/${projectName}.csproj`, `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <RootNamespace>${namespace}</RootNamespace>
  </PropertyGroup>
</Project>`);

  write('src/Greeting.cs', `namespace ${namespace};

public static class Greeting
{
    public static string For(string name) => $"Welcome to {name}";
}`);

  write('src/Program.cs', `using ${namespace};

Console.WriteLine(Greeting.For("${projectName}"));`);

  write(`tests/${projectName}.Tests.csproj`, `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <RootNamespace>${namespace}.Tests</RootNamespace>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="xunit.v3" Version="${nugetVersion()('xunit.v3')}" />
    <Using Include="Xunit" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="../src/${projectName}.csproj" />
  </ItemGroup>
</Project>`);

  write('tests/GreetingTests.cs', `namespace ${namespace}.Tests;

public class GreetingTests
{
    [Fact]
    public void WelcomesTheNamedProject()
    {
        Assert.Equal("Welcome to Example.Project", Greeting.For("Example.Project"));
    }
}`);

  log.success('C# starter files written');
}
