{{service_schema_import_statement}}
{{service_error_import_statement}}
import { {{pascal_name}}Repository } from '{{import_repository_from_service}}';

{{service_error_declaration}}
export class {{pascal_name}}Service {
  constructor(private readonly repository: {{pascal_name}}Repository = new {{pascal_name}}Repository()) {}

  async execute(input: {{pascal_name}}Payload): Promise<{ ok: true; feature: string; input: {{pascal_name}}Payload }> {
    {{service_input_guard}}
    await this.repository.save(input);
    return {
      ok: true,
      feature: '{{kebab_name}}',
      input,
    };
  }
}

export function build{{pascal_name}}Service(): {{pascal_name}}Service {
  return new {{pascal_name}}Service();
}
