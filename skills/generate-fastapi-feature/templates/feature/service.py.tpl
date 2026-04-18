from fastapi import Depends

from {{python_import_repository}} import {{pascal_name}}Repository, {{python_repository_dependency_factory}}
from {{python_schema_service_import}} import {{pascal_name}}Payload, {{pascal_name}}Record


class {{pascal_name}}Service:
    def __init__(self, repository: {{pascal_name}}Repository | None = None) -> None:
        self.repository = repository or {{pascal_name}}Repository()

    def create(self, payload: {{pascal_name}}Payload) -> {{pascal_name}}Record:
        return self.repository.create(payload)


def {{python_service_dependency_factory}}(repository: {{pascal_name}}Repository = Depends({{python_repository_dependency_factory}})) -> {{pascal_name}}Service:
    return {{pascal_name}}Service(repository)
