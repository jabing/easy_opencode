from fastapi import FastAPI
from fastapi.testclient import TestClient

from {{python_router_import}} import router


def test_{{snake_name}}_route_serves_created_response() -> None:
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)

    response = client.post("{{python_route_prefix}}", json={"name": "demo"})

    assert response.status_code == 201
    assert response.json()["name"] == "demo"
