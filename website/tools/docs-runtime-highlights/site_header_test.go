package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func renderTest(t *testing.T, doc *html.Node) string {
	t.Helper()
	var out bytes.Buffer
	if err := html.Render(&out, doc); err != nil {
		t.Fatal(err)
	}
	return out.String()
}
func TestSiteHeaderPreservesDocsAndIsIdempotent(t *testing.T) {
	doc, err := html.Parse(strings.NewReader(`<html><head></head><body class="docs-index"><nav id="sidebar-nav"><div class="pkg-and-logo">Old logo</div><div class="module-links-container"><a href="/docs/main/Str/">Str</a></div></nav><main><form id="module-search-form"></form><div class="main-content"><!--!` + "\x00" + `--><section>API</section><!--!` + "\x1e" + `--></div></main></body></html>`))
	if err != nil {
		t.Fatal(err)
	}
	headerDoc, _ := html.Parse(strings.NewReader(`<header id="top-bar"><nav aria-label="primary"><a href="/">Roc</a></nav></header>`))
	header := findID(headerDoc, "top-bar")
	sidebar, main, search := findID(doc, "sidebar-nav"), findElement(doc, "main"), findID(doc, "module-search-form")
	if !applySiteHeader(doc, header) {
		t.Fatal("header was not applied")
	}
	if findID(doc, "sidebar-nav") != sidebar || findElement(doc, "main") != main || findID(doc, "module-search-form") != search {
		t.Fatal("docs navigation/content replaced")
	}
	if findElementWithClass(sidebar, "div", "pkg-and-logo") != nil {
		t.Fatal("old logo remains")
	}
	if !hasClass(findElement(doc, "body"), "docs-index") {
		t.Fatal("lost existing body class")
	}
	first := renderTest(t, doc)
	applySiteHeader(doc, header)
	if second := renderTest(t, doc); second != first {
		t.Fatal("not idempotent")
	}
	if strings.Count(first, `id="top-bar"`) != 1 {
		t.Fatal("duplicate header")
	}
	// Refreshing the website header must update already-generated docs.
	findElement(header, "a").FirstChild.Data = "Updated"
	applySiteHeader(doc, header)
	if !strings.Contains(renderTest(t, doc), ">Updated</a>") {
		t.Fatal("stale header")
	}
}

func TestProcessingWithoutSiteHeaderPreservesPackageBranding(t *testing.T) {
	path := filepath.Join(t.TempDir(), "index.html")
	src := `<html><head></head><body><nav id="sidebar-nav"><div class="pkg-and-logo">My package</div></nav><main><div class="main-content">API</div></main></body></html>`
	if err := os.WriteFile(path, []byte(src), 0600); err != nil {
		t.Fatal(err)
	}
	if err := processHTML(path, nil); err != nil {
		t.Fatal(err)
	}
	out, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(out), `class="pkg-and-logo">My package</div>`) {
		t.Fatal("package branding removed without opting in")
	}
	if strings.Contains(string(out), "website-docs") || strings.Contains(string(out), "site-header.css") {
		t.Fatal("website header injected without opting in")
	}
}
