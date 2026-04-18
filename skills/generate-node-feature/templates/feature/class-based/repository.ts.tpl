{{repository_schema_import_statement}}
{{repository_runtime_import_statement}}

export class {{pascal_name}}Repository {
  async save(_input: {{pascal_name}}Payload): Promise<void> {
    {{repository_persistence_statement}}
  }
}

export function build{{pascal_name}}Repository(): {{pascal_name}}Repository {
  return new {{pascal_name}}Repository();
}
