from tests.fixtures.{{snake_name}}_fixture import build_{{snake_name}}_fixture


def test_{{snake_name}}_starter() -> None:
    assert build_{{snake_name}}_fixture()['label'] == '{{subject}}'
