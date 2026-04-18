from fastapi import APIRouter

from app.services.{{snake_name}}_service import build_{{snake_name}}_payload

router = APIRouter()


@router.get('{{route_path}}')
def {{function_name}}() -> dict[str, object]:
    return build_{{snake_name}}_payload()
