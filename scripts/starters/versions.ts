// The starters' dependency versions live in real manifests under versions/, where Dependabot
// can update them; the smoke tests then exercise each update.

import { readFileSync } from 'node:fs';

const read = (file: string) => readFileSync(new URL(`./versions/${file}`, import.meta.url), 'utf8');

function lookup(versions: Map<string, string>, file: string): (name: string) => string {
  return (name) => {
    const version = versions.get(name);
    if (!version) throw new Error(`No version for ${name} in scripts/starters/versions/${file}`);
    return version;
  };
}

// Each <artifactId> in the POM, with the <version> that follows it.
export function mavenVersion(pom = read('pom.xml')): (artifactId: string) => string {
  const versions = new Map([...pom.matchAll(/<artifactId>([^<]+)<\/artifactId>\s*<version>([^<]+)<\/version>/g)].map((m) => [m[1], m[2]] as const));
  return lookup(versions, 'pom.xml');
}

export function nugetVersion(csproj = read('CSharpStarter.csproj')): (packageId: string) => string {
  const versions = new Map([...csproj.matchAll(/<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g)].map((m) => [m[1], m[2]] as const));
  return lookup(versions, 'CSharpStarter.csproj');
}

export function npmDevDependencies(json = read('package.json')): Record<string, string> {
  return (JSON.parse(json) as { devDependencies: Record<string, string> }).devDependencies;
}
