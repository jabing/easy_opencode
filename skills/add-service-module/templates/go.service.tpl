package {{snake_name}}

type Service struct{}

type Result struct {
    OK     bool
    Source string
}

func (s Service) Execute() Result {
    return Result{OK: true, Source: "{{snake_name}}"}
}
