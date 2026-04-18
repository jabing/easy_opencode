import { build{{pascal_name}}Service } from '{{import_service_from_controller}}';
{{controller_schema_import_statement}}

export interface {{pascal_name}}Controller {
  handle(input: {{pascal_name}}Payload): Promise<unknown>;
}

export function build{{pascal_name}}Controller(): {{pascal_name}}Controller {
  const service = build{{pascal_name}}Service();

  return {
    async handle(input: {{pascal_name}}Payload) {
      return service.execute(input);
    },
  };
}
