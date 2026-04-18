package {{go_route_package}}

import (
{{go_controller_imports_block}}

	"{{go_schema_import_path}}"
	"{{go_service_import_path}}"
)

// {{go_handler_type}} adapts HTTP requests into {{pascal_name}} service calls.
type {{go_handler_type}} struct {
	service *{{go_service_package}}.{{go_service_type}}
}

func {{go_handler_constructor}}(service *{{go_service_package}}.{{go_service_type}}) *{{go_handler_type}} {
	return &{{go_handler_type}}{service: service}
}

func {{go_controller_signature}} {
{{go_method_guard}}
{{go_decode_input_block}}
{{go_success_response_block}}{{go_controller_return_tail}}
}
