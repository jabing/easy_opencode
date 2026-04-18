from fastapi import APIRouter, Depends, status

from {{python_import_controller}} import {{pascal_name}}Controller, {{python_dependency_factory}}
from {{python_import_schema}} import {{pascal_name}}Payload, {{pascal_name}}Record
{{python_auth_dependency_block}}
router = APIRouter(prefix="{{python_route_prefix}}", tags=["{{python_feature_tag}}"]{{python_router_dependencies}})


@router.post("", response_model={{pascal_name}}Record, status_code=status.HTTP_201_CREATED, summary="{{python_route_summary}}")
def create_{{snake_name}}(
    payload: {{pascal_name}}Payload,
    controller: {{pascal_name}}Controller = Depends({{python_dependency_factory}}),
) -> {{pascal_name}}Record:
    return controller.create(payload)
