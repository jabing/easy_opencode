package {{go_service_package}}

import (
	"{{go_repository_import_path}}"
	"{{go_schema_import_path}}"
)

// {{go_service_type}} coordinates {{pascal_name}} operations.
type {{go_service_type}} struct {
	repository *{{go_repository_package}}.{{go_repository_type}}
}

func {{go_service_constructor}}(repository *{{go_repository_package}}.{{go_repository_type}}) *{{go_service_type}} {
	return &{{go_service_type}}{repository: repository}
}

func (service *{{go_service_type}}) Create(input {{go_schema_package}}.{{go_input_type}}) {{go_schema_package}}.{{go_model_type}} {
	return service.repository.Save(input)
}
