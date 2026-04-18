package {{package}}

import (
    "net/http"
    "net/http/httptest"
    "testing"
)

func Test{{subject}}Handler(t *testing.T) {
    req := httptest.NewRequest(http.MethodGet, "{{route_path}}", nil)
    res := httptest.NewRecorder()

    {{subject}}Handler(res, req)

    if res.Code != http.StatusOK {
        t.Fatalf("expected status 200, got %d", res.Code)
    }
}
