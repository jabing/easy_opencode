{{repository_schema_import_statement}}
{{repository_runtime_import_statement}}

export interface {{pascal_name}}Repository {
  save(input: {{pascal_name}}Payload): Promise<void>;
}

export function build{{pascal_name}}Repository(): {{pascal_name}}Repository {
  return {
    async save(_input: {{pascal_name}}Payload) {
      {{repository_persistence_statement}}
    },
  };
}
