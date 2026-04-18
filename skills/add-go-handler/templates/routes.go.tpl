package {{package}}

import "net/http"

func Register{{subject}}Routes(mux *http.ServeMux) {
    mux.HandleFunc("{{route_path}}", {{subject}}Handler)
}
