package {{go_schema_package}}

// {{go_input_type}} captures the writable fields for {{pascal_name}}.
type {{go_input_type}} struct {
	Name string `json:"name"`
}

// {{go_model_type}} is the API-facing representation of {{pascal_name}}.
type {{go_model_type}} struct {
	ID string `json:"id"`
	Name string `json:"name"`
}
