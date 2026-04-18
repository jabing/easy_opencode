export function build{{pascal_name}}Payload() {
  return { ok: true, route: '{{route_path}}', handler: '{{camel_name}}' };
}
