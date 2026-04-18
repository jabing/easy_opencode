package {{package}}

import (
    "encoding/json"
    "net/http"
)

func {{subject}}Handler(w http.ResponseWriter, _ *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(map[string]any{
        "ok":      true,
        "route":   "{{route_path}}",
        "handler": "{{subject}}",
    })
}
