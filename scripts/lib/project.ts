// Generates the files of a new AI-assisted project. Used by scripts/new-project.ts,
// scripts/add-project-language.ts and the language starters in scripts/starters.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { starters } from '../starters/index.ts';
import { writeProjectFile } from './files.ts';
import type { Log } from './log.ts';
import { findExecutable } from './process.ts';
import type { Runner, ShellRunner } from './process.ts';

export const languages = ['node', 'csharp', 'rust', 'java', 'go'] as const;
export type Language = (typeof languages)[number];

export interface Commands {
  install: string;
  build: string;
  test: string;
  lint: string;
  run: string;
}

export const namePattern = /^[A-Za-z0-9._-]+$/;

export function assertName(name: string): string {
  if (!namePattern.test(name)) {
    throw new Error(`--name '${name}' may contain only letters, digits, '.', '_' and '-'.`);
  }
  return name;
}

export function today(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function assertCommandAvailable(name: string, installHint: string, env = process.env): void {
  if (!findExecutable(name, env)) throw new Error(`'${name}' was not found. ${installHint}`);
}

export function runNative(run: Runner, file: string, args: string[]): void {
  const result = run(file, args);
  if (!result.found) throw new Error(`'${file}' was not found.`);
  if (result.code !== 0) {
    const detail = result.stderr.trim();
    throw new Error(`Command failed with exit code ${result.code}: ${file} ${args.join(' ')}${detail ? `\n${detail}` : ''}`);
  }
}

// ============================================================================
// Project Structure
// ============================================================================

export function createProjectStructure(projectPath: string, directories = ['src', 'tests', 'docs/decisions', '.github']): void {
  for (const directory of directories) mkdirSync(join(projectPath, directory), { recursive: true });
}

// ============================================================================
// Common Files
// ============================================================================

const commonGitignore = `# Environment & secrets
.env
.env.local
.env.*.local
*.key
*.pem
secrets/

# IDE & build outputs
.vscode/
.idea/
.DS_Store
Thumbs.db

# Dependencies
node_modules/
dist/
build/

# Build outputs
bin/
obj/
.next/
out/
coverage/
.nyc_output/

# Logs
*.log
npm-debug.log*
yarn-debug.log*

# Runtime
tmp/
cache/
.cache/`;

// The language's own .gitignore lines, headed by a comment; empty when it has none.
export function gitignoreSection(language?: Language): string {
  switch (language) {
    case 'node': return '# Node specific\nnode_modules/\n.npm/\n.next/\nout/';
    case 'csharp': return '# C# specific\nbin/\nobj/\n*.user\n.vs/';
    case 'java': return '# Java specific\ntarget/\n.gradle/\nbuild/';
    case 'rust': return '# Rust specific\ntarget/';
    case 'go': return '# Go specific\n*.test\n*.out';
    default: return '';
  }
}

export function writeGitignore(projectPath: string, language?: Language): void {
  const section = gitignoreSection(language);
  writeProjectFile(projectPath, '.gitignore', section ? `${commonGitignore}\n${section}` : commonGitignore, { force: true });
}

export function writeGitattributes(projectPath: string): void {
  writeProjectFile(projectPath, '.gitattributes', '* text=auto eol=lf', { force: true });
}

export function writeEnvExample(projectPath: string): void {
  writeProjectFile(projectPath, '.env.example', `# Environment variables template
# Copy this file to .env and configure for local development
# Never commit .env to version control - it contains secrets

# Deployment environment
NODE_ENV=development
DEBUG=false

# Database (if applicable)
DATABASE_URL=postgresql://user:password@localhost:5432/myproject
DATABASE_POOL_SIZE=10

# API Configuration
API_KEY=your_api_key_here
API_SECRET=your_api_secret_here
API_BASE_URL=http://localhost:3000

# Logging
LOG_LEVEL=info

# Add project-specific variables below`, { force: true });
}

export function languageCommands(language: Language): Commands {
  switch (language) {
    case 'node': return { install: 'npm install', build: 'npm run build', test: 'npm test', lint: 'npm run lint', run: 'npm start' };
    case 'csharp': return { install: 'dotnet restore', build: 'dotnet build', test: 'dotnet test', lint: 'dotnet format --verify-no-changes', run: 'dotnet run --project src' };
    case 'rust': return { install: 'cargo fetch', build: 'cargo build --release', test: 'cargo test', lint: 'cargo clippy --all-targets -- -D warnings', run: 'cargo run --release' };
    case 'java': return { install: 'mvn dependency:resolve', build: 'mvn package -DskipTests', test: 'mvn test', lint: 'mvn checkstyle:check', run: 'java -jar target/app.jar' };
    case 'go': return { install: 'go mod download', build: 'go build -o bin/app .', test: 'go test ./...', lint: 'go vet ./...', run: 'go run .' };
  }
}

// README.md, CLAUDE.md and AGENTS.md hold their commands between these markers, so
// add-project-language.ts can tell the generated section from anything a person wrote.
export const commandsBegin = '<!-- BEGIN project-commands -->';
export const commandsEnd = '<!-- END project-commands -->';

const fence = '```';

export type SectionStyle = 'readme' | 'instructions';

// The marked commands section of README.md or of an instructions file. Without commands
// the implementation language is undecided, and the section says so instead of listing
// commands nobody has chosen yet.
export function commandsSection(style: SectionStyle, heading = 'Commands', commands?: Commands): string {
  let body: string;
  if (style === 'readme') {
    body = commands
      ? ([['Install', commands.install], ['Build', commands.build], ['Test', commands.test], ['Lint', commands.lint], ['Run Locally', commands.run]] as const)
        .map(([title, command]) => `## ${title}\n\n${fence}bash\n${command}\n${fence}`).join('\n\n')
      : `## Implementation Stack

Not selected yet. Install, build, test, lint and run commands are added here when the implementation language is chosen.`;
  } else if (commands) {
    body = `## ${heading}

- **Install:** \`${commands.install}\`
- **Build:** \`${commands.build}\`
- **Test:** \`${commands.test}\`
- **Lint/Format:** \`${commands.lint}\`
- **Run locally:** \`${commands.run}\``;
  } else {
    body = `## ${heading}

The implementation language has not been selected yet, so this project has no install, build, test, lint or run commands. Do not guess or invent them; they are added here when the language is chosen.`;
  }
  return `${commandsBegin}\n${body.trim().replace(/\r\n/g, '\n')}\n${commandsEnd}`;
}

export type SectionState = 'Missing' | 'Unchanged' | 'Ready' | 'Conflict';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Replaces a file's undecided commands section with the given commands. Missing when the
// file does not exist, Unchanged when it already lists these commands, Ready when its
// section is still the undecided one, and Conflict otherwise: no markers, or a section
// someone edited. Only apply writes, and only for Ready.
export function updateCommandsSection(
  projectPath: string, relativePath: string, style: SectionStyle, heading: string, commands: Commands, apply = false,
): SectionState {
  const fullPath = join(projectPath, relativePath);
  if (!existsSync(fullPath)) return 'Missing';

  const content = readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
  const pattern = new RegExp(`${escapeRegExp(commandsBegin)}[\\s\\S]*?${escapeRegExp(commandsEnd)}`, 'g');
  const sections = [...content.matchAll(pattern)];
  if (sections.length !== 1) return 'Conflict';

  const [section] = sections;
  const current = section[0];
  const target = commandsSection(style, heading, commands);
  if (current === target) return 'Unchanged';
  if (current !== commandsSection(style, heading)) return 'Conflict';

  if (apply) {
    const updated = content.slice(0, section.index) + target + content.slice(section.index + current.length);
    writeProjectFile(projectPath, relativePath, updated, { force: true });
  }
  return 'Ready';
}

// Commands are omitted while the implementation language is undecided.
export function writeReadme(projectPath: string, projectName: string, commands?: Commands): void {
  writeProjectFile(projectPath, 'README.md', `# ${projectName}

Brief description of what this project does and its main purpose.

## Prerequisites

- [List required tools, frameworks, and versions]

## Local Setup

1. **Clone the repository**
   ${fence}bash
   git clone <repository-url>
   cd ${projectName}
   ${fence}

2. **Configure environment**
   ${fence}bash
   cp .env.example .env
   # Edit .env and add your configuration
   ${fence}

${commandsSection('readme', 'Commands', commands)}

## Architecture

This project consists of:
- **src/** — Main source code
- **tests/** — Test suite
- **docs/** — Architecture and decision records

See [docs/architecture.md](docs/architecture.md) for detailed system design.

## Development Workflow

1. Create a feature branch
2. Make focused, atomic commits
3. Write or update tests for new functionality
4. Ensure all tests pass locally
5. Submit a pull request

See [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md) for AI assistant guidelines.

## License

[Add license information]`, { force: true });
}

export function writeArchitecture(projectPath: string, projectName: string, date = today()): void {
  writeProjectFile(projectPath, 'docs/architecture.md', `# ${projectName} Architecture

**Last Updated:** ${date}

## Overview

[Provide a high-level overview of the system's purpose and main responsibilities]

## System Architecture Diagram

${fence}
[Add ASCII diagram or describe the component relationships]
${fence}

## Core Components

### Component 1: [Name]
- **Purpose:** [What does it do?]
- **Responsibilities:** [Key duties]
- **Dependencies:** [What does it depend on?]
- **Technology:** [Tech stack]

[Add more components as needed]

## Data Flow

[Describe how data flows through the system]

## External Integrations

- [Service 1]: [Purpose and API details]

## Deployment Architecture

[Describe how the system is deployed in production]

## Technology Stack

- **Language:** [e.g., Node.js, C#]
- **Framework:** [e.g., Express, ASP.NET Core]
- **Database:** [e.g., PostgreSQL]
- **Hosting:** [e.g., Docker, Kubernetes, serverless]

## Security Considerations

[Key security measures and threat model]

## Design Decisions

See [decisions/](decisions/) for Architecture Decision Records (ADRs) documenting major design choices.`, { force: true });
}

export function writeAdr(projectPath: string, date = today()): void {
  writeProjectFile(projectPath, 'docs/decisions/0001-initial-project-setup.md', `# ADR-0001: Project Setup and Initial Decisions

- **Status:** Accepted
- **Date:** ${date}

## Context

[Describe the background and context that led to this decision]

## Decision

[Clearly state what decision was made]

## Consequences

### Positive
- [Benefit 1]

### Negative
- [Trade-off 1]

## Alternatives Considered

- **Alternative 1:** [Description and why rejected]`, { force: true });
}

// ============================================================================
// Client Instructions
// ============================================================================

export function writeClaudeInstructions(projectPath: string, projectName: string, commands?: Commands, date = today()): void {
  writeProjectFile(projectPath, 'CLAUDE.md', `# Claude Code Project Instructions

- **Project:** ${projectName}
- **Last Updated:** ${date}

${commandsSection('instructions', 'Commands', commands)}

## Architecture Principles

- Keep domain logic independent from infrastructure
- Put external integrations behind well-defined interfaces
- Avoid circular dependencies between modules
- Record consequential architecture decisions in [docs/decisions/](docs/decisions/)

## Project Structure

${fence}
${projectName}/
├── src/           # Source code
├── tests/         # Test suite
├── docs/          # Documentation
│   ├── architecture.md
│   └── decisions/  # Architecture Decision Records
└── README.md      # Project overview
${fence}

## Workflow Guidelines

1. **Before making changes:**
   - Read relevant tests to understand expected behavior
   - Check [docs/architecture.md](docs/architecture.md) for component relationships

2. **During implementation:**
   - Make the smallest coherent change
   - Keep commits focused and descriptive
   - Run affected checks before committing

3. **Before committing:**
   - Ensure tests pass
   - Verify no secrets or credentials in diff
   - Update documentation if behavior changed

## Memory & Knowledge Management

- Store important conventions and lessons learned
- Memory supplements but doesn't replace documentation
- Keep architecture rationale in docs/decisions/ (not just memory)`, { force: true });
}

export function writeAgentsInstructions(projectPath: string, projectName: string, commands?: Commands, date = today()): void {
  writeProjectFile(projectPath, 'AGENTS.md', `# Project Working Agreement

- **Project:** ${projectName}
- **Last Updated:** ${date}

${commandsSection('instructions', 'Essential Commands', commands)}

## Architecture & Design

- Keep domain logic independent from infrastructure
- Put external integrations behind well-defined interfaces
- Avoid circular dependencies between modules
- Record all consequential architecture decisions in [docs/decisions/](docs/decisions/)

### Project Structure

${fence}
${projectName}/
├── src/           # Source code
├── tests/         # Test suite
├── docs/          # Documentation
│   ├── architecture.md
│   └── decisions/  # Architecture Decision Records (ADRs)
└── README.md
${fence}

## Development Workflow

1. **Before making changes:**
   - Read relevant tests to understand expected behavior
   - Review [docs/architecture.md](docs/architecture.md) for design context

2. **During implementation:**
   - Make the smallest coherent change possible
   - Keep commits focused and well-described
   - Run the checks affected by your change

3. **Commit safety:**
   - Never commit secrets, generated credentials, or local .env files
   - Ensure all tests pass locally
   - Verify no unwanted files in the diff`, { force: true });
}

// ============================================================================
// Git
// ============================================================================

// Initializes the repository on a main branch and sets the commit identity.
export function initializeProjectGit(run: Runner, log: Log, projectPath: string, userName?: string, userEmail?: string): void {
  runNative(run, 'git', ['-C', projectPath, 'init', '--initial-branch=main']);
  if (userName) runNative(run, 'git', ['-C', projectPath, 'config', 'user.name', userName]);
  if (userEmail) runNative(run, 'git', ['-C', projectPath, 'config', 'user.email', userEmail]);

  for (const directory of ['src', 'tests']) writeProjectFile(projectPath, `${directory}/.gitkeep`, '', { log });
}

export function createInitialCommit(run: Runner, projectPath: string, message = 'Initial project scaffold'): void {
  // A brand-new scaffold: everything in it is the commit.
  runNative(run, 'git', ['-C', projectPath, 'add', '--all']);
  runNative(run, 'git', ['-C', projectPath, 'commit', '--quiet', '-m', message]);
}

// ============================================================================
// Language Starters
// ============================================================================

// Writes the scripts/starters/<language>.ts files.
export function runLanguageStarter(log: Log, language: Language, projectPath: string, projectName: string): void {
  starters[language](log, projectPath, projectName);
}

// ============================================================================
// Validation
// ============================================================================

// Runs one of the project's commands in its directory; true only on exit code 0.
export function testProjectCommand(shell: ShellRunner, log: Log, projectPath: string, command: string): boolean {
  log.step(`Running: ${command}`);
  try {
    const result = shell(command, projectPath);
    if (!result.found) {
      log.warn(`'${command}' failed: ${result.stderr}`);
      return false;
    }
    if (result.code !== 0) {
      log.warn(`'${command}' exited with code ${result.code}`);
      return false;
    }
    return true;
  } catch (error) {
    log.warn(`'${command}' failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
