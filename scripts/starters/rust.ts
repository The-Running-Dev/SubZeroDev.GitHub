// Writes the Rust starter files: a binary crate with its logic in a library and an integration test.

import { writeProjectFile } from '../lib/files.ts';
import type { Log } from '../lib/log.ts';
import { crateIdentifier, kebabName } from './names.ts';

export function rustStarter(log: Log, projectPath: string, projectName: string): void {
  const write = (relativePath: string, content: string) => writeProjectFile(projectPath, relativePath, content, { force: true });
  log.step('Setting up Rust starter files');

  const crate = crateIdentifier(projectName);
  write('Cargo.toml', `[package]
name = "${kebabName(projectName)}"
version = "0.1.0"
edition = "2024"
description = "${projectName}"

[dependencies]`);

  write('src/lib.rs', `pub fn greeting(name: &str) -> String {
    format!("Welcome to {name}")
}`);

  write('src/main.rs', `fn main() {
    println!("{}", ${crate}::greeting("${projectName}"));
}`);

  write('tests/greeting.rs', `#[test]
fn welcomes_the_named_project() {
    assert_eq!(${crate}::greeting("Example.Project"), "Welcome to Example.Project");
}`);

  log.success('Rust starter files written');
}
