import os


def read_{{snake_name}}_config() -> dict[str, str]:
    return {'value': os.getenv('{{env_key}}', ''), 'source': '{{snake_name}}'}
