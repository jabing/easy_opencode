from {{python_schema_repository_import}} import {{pascal_name}}Payload, {{pascal_name}}Record


class {{pascal_name}}Repository:
    def create(self, payload: {{pascal_name}}Payload) -> {{pascal_name}}Record:
        return {{pascal_name}}Record(id="generated-id", name=payload.name)


def {{python_repository_dependency_factory}}() -> {{pascal_name}}Repository:
    return {{pascal_name}}Repository()
