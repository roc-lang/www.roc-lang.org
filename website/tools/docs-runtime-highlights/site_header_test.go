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
	doc, err := html.Parse(strings.NewReader(`<html><head></head><body class="docs-index"><nav id="sidebar-nav"><div class="pkg-and-logo">Old logo</div><div class="module-links-container"><ul class="module-links"><li><a href="/examples/">Examples</a></li><li><a href="/tutorial/">Tutorial</a></li><li id="faq-entry"><a href="/faq">FAQ</a></li><li><a data-module-name="Str" href="/docs/main/Str/">Str</a></li><li><a href="/docs/main/langref/">Language Reference</a></li></ul></div></nav><main><form id="module-search-form"></form><div class="main-content"><!--!` + "\x00" + `--><section>API</section><!--!` + "\x1e" + `--></div></main></body></html>`))
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

	links := findElementWithClass(sidebar, "ul", "module-links")
	if links.LastChild != findID(doc, "faq-entry") {
		t.Fatal("FAQ is not last")
	}
	sidebarHTML := renderTest(t, sidebar)
	if strings.Contains(sidebarHTML, ">Examples</a>") || strings.Contains(sidebarHTML, ">Tutorial</a>") {
		t.Fatal("duplicate header links remain in sidebar")
	}
	if findElementWithClass(doc, "section", "getting-started") == nil {
		t.Fatal("docs index is missing Getting Started content")
	}
	if links.FirstChild != findID(doc, "getting-started-link").Parent {
		t.Fatal("Getting Started is not the first sidebar entry")
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
