// Turns a project name (letters, digits, '.', '_' and '-') into the names each toolchain accepts.

// Lowercase words joined by '-', starting with a letter: npm packages, crates, Go modules, Maven artifacts.
export function kebabName(projectName: string): string {
  const name = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return /^[a-z]/.test(name) ? name : `app-${name}`.replace(/-+$/, '');
}

// The name with '-' as '_': the identifier Rust uses for a crate whose package is kebabName.
export function crateIdentifier(projectName: string): string {
  return kebabName(projectName).replace(/-/g, '_');
}

// A C# namespace: each '.'-separated segment a valid identifier.
export function dotnetNamespace(projectName: string): string {
  return projectName.split('.').filter(Boolean)
    .map((segment) => segment.replace(/[^A-Za-z0-9_]/g, '_'))
    .map((segment) => (/^[0-9]/.test(segment) ? `_${segment}` : segment))
    .join('.');
}

// A Java package: lowercase letters and digits, each segment starting with a letter.
export function javaPackage(projectName: string): string {
  const segments = projectName.toLowerCase().split('.')
    .map((segment) => segment.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .map((segment) => (/^[a-z]/.test(segment) ? segment : `p${segment}`));
  return segments.length ? segments.join('.') : 'app';
}
