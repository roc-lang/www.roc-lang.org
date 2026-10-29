package main

import (
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func TestSemanticScriptDependencies(t *testing.T) {
	for _, existing := range []string{"", `<script src="/compiler.js"></script>`} {
		doc, err := html.Parse(strings.NewReader("<html><head>" + existing + "</head><body></body></html>"))
		if err != nil {
			t.Fatal(err)
		}
		if !addCompilerScript(doc) {
			t.Fatal("dependencies were not inserted")
		}
		if addCompilerScript(doc) {
			t.Fatal("repeated patch must not change the page")
		}
		var scripts []string
		head := findElement(doc, "head")
		for child := head.FirstChild; child != nil; child = child.NextSibling {
			if child.Data == "script" {
				scripts = append(scripts, attr(child, "src"))
			}
		}
		if strings.Join(scripts, ",") != "/roc-builtin-metadata.js,/roc-syntax.js,/compiler.js" {
			t.Fatalf("incorrect script order: %v", scripts)
		}
	}
}
