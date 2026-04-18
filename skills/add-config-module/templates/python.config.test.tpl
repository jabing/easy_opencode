from app.config.{{snake_name}} import read_{{snake_name}}_config


def test_read_{{snake_name}}_config_returns_expected_shape() -> None:
    config = read_{{snake_name}}_config()
    assert config['source'] == '{{snake_name}}'
