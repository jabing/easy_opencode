from app.services.{{snake_name}}_service import {{class_name}}Service


def test_{{snake_name}}_service_execute_returns_starter_result() -> None:
    service = {{class_name}}Service()
    assert service.execute() == {'ok': True, 'source': '{{snake_name}}'}
