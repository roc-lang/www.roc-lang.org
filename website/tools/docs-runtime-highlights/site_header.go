package main

import (
	"bytes"
	"fmt"
	"os"

	"golang.org/x/net/html"
)

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
