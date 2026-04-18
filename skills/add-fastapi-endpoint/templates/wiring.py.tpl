from fastapi import FastAPI

from app.routers.{{snake_name}} import router


def include_{{snake_name}}(app: FastAPI) -> None:
    app.include_router(router)
