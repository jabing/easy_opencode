export function read{{class_name}}Config() {
  return {
    value: process.env.{{env_key}} ?? '',
    source: '{{kebab_name}}',
  };
}
