package {{go_route_package}}

import (
	"bytes"
{{go_test_imports_block}}
)

func Test{{pascal_name}}Route(t *testing.T) {
{{go_test_router_setup}}

	request := httptest.NewRequest(http.MethodPost, "{{go_route_mount_path}}", bytes.NewBufferString(`{"name":"demo"}`))
	request.Header.Set("Content-Type", "application/json")
{{go_test_execute_block}}
}
