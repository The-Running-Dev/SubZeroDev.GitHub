// Writes repositories/<name>.yaml by hand: every string is single-quoted, so no YAML
// library is needed and no value can turn into another YAML type.

export interface RepositoryDefinition {
  description: string;
  visibility: 'public' | 'private';
  topics: string[];
  // "context" or "context@integration_id".
  requiredChecks: string[];
  // The repository is pushed from a local folder, so GitHub must not create a first commit.
  pushedFromPath: boolean;
}

export function yamlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function repositoryYaml(definition: RepositoryDefinition): string {
  const lines = [`description: ${yamlString(definition.description)}`, `visibility: ${definition.visibility}`];
  if (definition.topics.length) {
    lines.push('topics:', ...definition.topics.map((topic) => `  - ${yamlString(topic.toLowerCase())}`));
  }
  if (definition.requiredChecks.length) {
    lines.push('required_checks:');
    for (const check of definition.requiredChecks) {
      const at = check.indexOf('@');
      const context = at < 0 ? check : check.slice(0, at);
      const integrationId = at < 0 ? '' : check.slice(at + 1);
      lines.push(`  - context: ${yamlString(context)}`);
      if (integrationId) {
        if (!/^\s*[+-]?\d+\s*$/.test(integrationId)) throw new Error(`--required-check '${check}' has an integration id that is not a number.`);
        lines.push(`    integration_id: ${Number.parseInt(integrationId, 10)}`);
      }
    }
  }
  if (definition.pushedFromPath) lines.push('auto_init: false');
  return `${lines.join('\n')}\n`;
}
