package main

import (
	"bytes"
	_ "embed"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/net/html"
)

//go:embed getting_started.html
var gettingStartedHTML string

//go:embed builtin_types.html
var builtinTypesHTML string

func findID(node *html.Node, id string) *html.Node {
	if node.Type == html.ElementNode && attr(node, "id") == id {
		return node
	}
	for c := node.FirstChild; c != nil; c = c.NextSibling {
		if found := findID(c, id); found != nil {
			return found
		}
	}
	return nil
}

func cloneNode(node *html.Node) *html.Node {
	copy := &html.Node{Type: node.Type, Data: node.Data, DataAtom: node.DataAtom, Namespace: node.Namespace, Attr: append([]html.Attribute(nil), node.Attr...)}
	for c := node.FirstChild; c != nil; c = c.NextSibling {
		copy.AppendChild(cloneNode(c))
	}
	return copy
}

func readSiteHeader(path string) (*html.Node, error) {
	src, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	doc, err := html.Parse(bytes.NewReader(src))
	if err != nil {
		return nil, err
	}
	header := findID(doc, "top-bar")
	if header == nil {
		return nil, fmt.Errorf("%s: missing website header", path)
	}
	return header, nil
}

// Only enabled by this website's build, for build/docs/main. The compiler's
// generated markup, scripts, and other packages' documentation are unchanged.
func applySiteHeader(doc, header *html.Node) bool {
	body, head := findElement(doc, "body"), findElement(doc, "head")
	sidebar := findID(doc, "sidebar-nav")
	if body == nil || head == nil || sidebar == nil {
		return false
	}
	if old := findID(doc, "top-bar"); old != nil {
		old.Parent.RemoveChild(old)
	}
	body.InsertBefore(cloneNode(header), body.FirstChild)
	if logo := findElementWithClass(sidebar, "div", "pkg-and-logo"); logo != nil {
		logo.Parent.RemoveChild(logo)
	}
	updateSiteSidebar(sidebar)
	if hasClass(body, "docs-index") {
		applyGettingStarted(doc)
	}
	addClass(body, "website-docs")
	for _, asset := range []struct{ id, tag, key, path string }{
		{"website-header-css", "link", "href", "/site-header.css"},
		{"website-docs-css", "link", "href", "/docs-site.css"},
		{"website-docs-js", "script", "src", "/docs-site.js"},
	} {
		if findID(doc, asset.id) != nil {
			continue
		}
		node := &html.Node{Type: html.ElementNode, Data: asset.tag, Attr: []html.Attribute{{Key: "id", Val: asset.id}, {Key: asset.key, Val: asset.path}}}
		if asset.tag == "link" {
			node.Attr = append(node.Attr, html.Attribute{Key: "rel", Val: "stylesheet"})
		} else {
			node.Attr = append(node.Attr, html.Attribute{Key: "defer", Val: ""})
		}
		head.AppendChild(node)
	}
	return true
}

// Only adjust the top-level website links, leaving API and language entries intact.
func updateSiteSidebar(sidebar *html.Node) {
	links := findElementWithClass(sidebar, "ul", "module-links")
	if links == nil {
		return
	}
	if findID(sidebar, "getting-started-link") == nil {
		entryDoc, _ := html.Parse(strings.NewReader(`<ul><li class="sidebar-entry"><a id="getting-started-link" class="sidebar-module-link prose-label" href="/docs/main/">Docs Home</a></li></ul>`))
		entry := findElement(entryDoc, "li")
		entry.Parent.RemoveChild(entry)
		links.InsertBefore(entry, links.FirstChild)
	}
	if link := findID(sidebar, "getting-started-link"); link != nil {
		for link.FirstChild != nil {
			link.RemoveChild(link.FirstChild)
		}
		link.AppendChild(&html.Node{Type: html.TextNode, Data: "Docs Home"})
	}
	var faq *html.Node
	for entry := links.FirstChild; entry != nil; {
		next := entry.NextSibling
		if entry.Type == html.ElementNode && entry.Data == "li" {
			link := findElement(entry, "a")
			if link != nil && attr(link, "data-module-name") == "__builtin_types__" {
				for i := range link.Attr {
					if link.Attr[i].Key == "href" {
						link.Attr[i].Val = "/docs/main/builtin-types/"
					}
				}
			}
			if link != nil && attr(link, "data-module-name") == "" {
				switch strings.TrimSpace(textContent(link)) {
				case "Examples", "Tutorial":
					links.RemoveChild(entry)
				case "FAQ":
					faq = entry
				}
			}
		}
		entry = next
	}
	if faq != nil {
		links.RemoveChild(faq)
		links.AppendChild(faq)
	}
}

func applyGettingStarted(doc *html.Node) {
	replacePageContent(doc, gettingStartedHTML)
}

func replacePageContent(doc *html.Node, source string) {
	main := findElement(doc, "main")
	if main == nil {
		return
	}
	content := findElementWithClass(main, "div", "main-content")
	if content == nil {
		return
	}
	page, _ := html.Parse(strings.NewReader(source))
	for content.FirstChild != nil {
		content.RemoveChild(content.FirstChild)
	}
	// Keep the compiler's streaming navigation boundaries around the new content.
	content.AppendChild(&html.Node{Type: html.CommentNode, Data: "!\x00"})
	content.AppendChild(cloneNode(findElement(page, "section")))
	content.AppendChild(&html.Node{Type: html.CommentNode, Data: "!\x1e"})
}

// Reuse the docs shell, resolving its root-relative assets before nesting the page.
func writeBuiltinTypesPage(root string) error {
	src, err := os.ReadFile(filepath.Join(root, "index.html"))
	if err != nil {
		return err
	}
	doc, err := html.Parse(bytes.NewReader(src))
	if err != nil {
		return err
	}
	body := findElement(doc, "body")
	for i := range body.Attr {
		if body.Attr[i].Key == "class" {
			classes := strings.Fields(body.Attr[i].Val)
			kept := []string{}
			for _, class := range classes {
				if class != "docs-index" {
					kept = append(kept, class)
				}
			}
			body.Attr[i].Val = strings.Join(kept, " ")
		}
	}
	replacePageContent(doc, builtinTypesHTML)
	if title := findElement(doc, "title"); title != nil {
		title.FirstChild.Data = "Builtin Types | Roc Docs"
	}
	base, _ := url.Parse("/docs/main/")
	var resolveLinks func(*html.Node)
	resolveLinks = func(node *html.Node) {
		for i := range node.Attr {
			attr := &node.Attr[i]
			if attr.Key == "href" || attr.Key == "src" {
				target, err := url.Parse(attr.Val)
				if err == nil && !target.IsAbs() && !strings.HasPrefix(attr.Val, "/") {
					attr.Val = base.ResolveReference(target).String()
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			resolveLinks(child)
		}
	}
	resolveLinks(doc)
	var out bytes.Buffer
	if err := html.Render(&out, doc); err != nil {
		return err
	}
	directory := filepath.Join(root, "builtin-types")
	if err := os.MkdirAll(directory, 0755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(directory, "index.html"), restoreDocsStreamMarkers(out.Bytes()), 0644)
}
