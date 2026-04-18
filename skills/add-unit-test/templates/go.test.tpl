package main

import "testing"

func Test{{class_name}}Starter(t *testing.T) {
    fixture := load{{class_name}}Fixture()
    if fixture.Label != "{{subject}}" {
        t.Fatalf("unexpected label: %#v", fixture)
    }
}

type {{class_name}}Fixture struct {
    Label string
}

func load{{class_name}}Fixture() {{class_name}}Fixture {
    return {{class_name}}Fixture{Label: "{{subject}}"}
}
