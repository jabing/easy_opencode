from app.models.{{snake_name}} import {{subject}}


def test_{{snake_name}}_string_representation() -> None:
    instance = {{subject}}(name='starter')
    assert str(instance) == 'starter'
