from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.{{snake_name}}_wiring import include_{{snake_name}}


def test_{{snake_name}}_route() -> None:
    app = FastAPI()
    include_{{snake_name}}(app)
    client = TestClient(app)

    response = client.get('{{route_path}}')

    assert response.status_code == 200
    assert response.json()['ok'] is True
    assert response.json()['route'] == '{{route_path}}'
