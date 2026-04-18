package {{go_repository_package}}

import "{{go_schema_import_path}}"

// {{go_repository_type}} stores {{pascal_name}} records.
type {{go_repository_type}} struct{}

func {{go_repository_constructor}}() *{{go_repository_type}} {
	return &{{go_repository_type}}{}
}

func (repository *{{go_repository_type}}) Save(input {{go_schema_package}}.{{go_input_type}}) {{go_schema_package}}.{{go_model_type}} {
	return {{go_schema_package}}.{{go_model_type}}{
		ID:   "generated-{{kebab_name}}",
		Name: input.Name,
	}
}
