import { {{pascal_name}}Service } from '{{import_service_from_controller}}';
{{controller_schema_import_statement}}

export class {{pascal_name}}Controller {
  constructor(private readonly service: {{pascal_name}}Service = new {{pascal_name}}Service()) {}

  async handle(input: {{pascal_name}}Payload): Promise<unknown> {
    return this.service.execute(input);
  }
}

export function build{{pascal_name}}Controller(): {{pascal_name}}Controller {
  return new {{pascal_name}}Controller();
}
