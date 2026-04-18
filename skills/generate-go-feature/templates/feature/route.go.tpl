package {{go_route_package}}

import (
{{go_route_framework_import}}

	"{{go_repository_import_path}}"
	"{{go_service_import_path}}"
)

func {{go_route_register_function}}{{go_route_registration_signature}} {
	repository := {{go_repository_package}}.{{go_repository_constructor}}()
	service := {{go_service_package}}.{{go_service_constructor}}(repository)
	handler := {{go_handler_constructor}}(service)
{{go_route_registration_statement}}
}

{{go_route_middleware_helpers}}
