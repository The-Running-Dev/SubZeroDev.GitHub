// Writes the Go starter files: a main package with its logic in a separate file and a test.

import { writeProjectFile } from '../lib/files.ts';
import type { Log } from '../lib/log.ts';
import { kebabName } from './names.ts';

export function goStarter(log: Log, projectPath: string, projectName: string): void {
  const write = (relativePath: string, content: string) => writeProjectFile(projectPath, relativePath, content, { force: true });
  log.step('Setting up Go starter files');

  write('go.mod', `module ${kebabName(projectName)}

go 1.24`);

  write('greeting.go', `package main

func greeting(name string) string {
	return "Welcome to " + name
}`);

  write('main.go', `package main

import "fmt"

func main() {
	fmt.Println(greeting("${projectName}"))
}`);

  write('greeting_test.go', `package main

import "testing"

func TestGreetingWelcomesTheNamedProject(t *testing.T) {
	got := greeting("Example.Project")
	if want := "Welcome to Example.Project"; got != want {
		t.Errorf("greeting() = %q, want %q", got, want)
	}
}`);

  log.success('Go starter files written');
}
