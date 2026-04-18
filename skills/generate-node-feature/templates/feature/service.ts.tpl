{{service_schema_import_statement}}
{{service_error_import_statement}}
import { build{{pascal_name}}Repository } from '{{import_repository_from_service}}';

{{service_error_declaration}}
export interface {{pascal_name}}Service {
  execute(input: {{pascal_name}}Payload): Promise<{ ok: true; feature: string; input: {{pascal_name}}Payload }>;
}

export function build{{pascal_name}}Service(): {{pascal_name}}Service {
  const repository = build{{pascal_name}}Repository();

  return {
    async execute(input: {{pascal_name}}Payload) {
      {{service_input_guard}}
      await repository.save(input);
      return {
        ok: true,
        feature: '{{kebab_name}}',
        input,
      };
    },
  };
}
