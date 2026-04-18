from fastapi import Depends

from {{python_import_service_from_controller}} import {{pascal_name}}Service, {{python_service_dependency_factory}}
from {{python_schema_controller_import}} import {{pascal_name}}Payload, {{pascal_name}}Record


class {{pascal_name}}Controller:
    def __init__(self, service: {{pascal_name}}Service | None = None) -> None:
        self.service = service or {{pascal_name}}Service()

    def create(self, payload: {{pascal_name}}Payload) -> {{pascal_name}}Record:
        return self.service.create(payload)


def {{python_dependency_factory}}(service: {{pascal_name}}Service = Depends({{python_service_dependency_factory}})) -> {{pascal_name}}Controller:
    return {{pascal_name}}Controller(service)
