package {{snake_name}}

import "testing"

func TestServiceExecuteReturnsStarterResult(t *testing.T) {
    result := Service{}.Execute()
    if !result.OK || result.Source != "{{snake_name}}" {
        t.Fatalf("unexpected result: %#v", result)
    }
}
