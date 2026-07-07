package main

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/net/html"
)

var generatedTokenClasses = map[string]bool{
	"comment":    true,
	"constant":   true,
	"delimiter":  true,
	"delimeter":  true,
	"kw":         true,
	"literal":    true,
	"lowerident": true,
	"op":         true,
	"sig-arrow":  true,
	"string":     true,
	"type":       true,
	"type-var":   true,
	"upperident": true,
}

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: docs-runtime-highlights docs-root")
		os.Exit(2)
	}

	root := os.Args[1]
	if err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || !strings.HasSuffix(path, ".html") {
			return nil
		}
		return processHTML(path)
	}); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func processHTML(path string) error {
	src, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	doc, err := html.Parse(bytes.NewReader(src))
	if err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}

	changed := addCompilerScript(doc)
	if flattenGeneratedHighlights(doc) {
		changed = true
	}

	if !changed {
		return nil
	}

	var out bytes.Buffer
	if err := html.Render(&out, doc); err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}

	return os.WriteFile(path, out.Bytes(), 0o644)
}

func addCompilerScript(doc *html.Node) bool {
	head := findElement(doc, "head")
	if head == nil || hasCompilerScript(head) {
		return false
	}

	head.AppendChild(&html.Node{
		Type: html.ElementNode,
		Data: "script",
		Attr: []html.Attribute{
			{Key: "src", Val: "/compiler.js"},
			{Key: "defer", Val: ""},
		},
	})

	return true
}

func hasCompilerScript(node *html.Node) bool {
	if node.Type == html.ElementNode && node.Data == "script" && attr(node, "src") == "/compiler.js" {
		return true
	}

	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if hasCompilerScript(child) {
			return true
		}
	}

	return false
}

func flattenGeneratedHighlights(node *html.Node) bool {
	changed := false

	if node.Type == html.ElementNode && shouldFlattenOnly(node) {
		return flattenToText(node)
	}

	if node.Type == html.ElementNode && shouldRuntimeHighlight(node) {
		if addClass(node, "roc-highlight") {
			changed = true
		}
		if flattenToText(node) {
			changed = true
		}
		return changed
	}

	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if flattenGeneratedHighlights(child) {
			changed = true
		}
	}

	return changed
}

func shouldFlattenOnly(node *html.Node) bool {
	return hasClass(node, "type-ahead-signature")
}

func shouldRuntimeHighlight(node *html.Node) bool {
	if hasClass(node, "entry-signature-code") || hasClass(node, "entry-type-def") {
		return true
	}

	if node.Data == "code" {
		return parentElementIs(node, "pre") || containsGeneratedTokenClass(node)
	}

	return false
}

func containsGeneratedTokenClass(node *html.Node) bool {
	if node.Type == html.ElementNode {
		for _, class := range strings.Fields(attr(node, "class")) {
			if generatedTokenClasses[class] {
				return true
			}
		}
	}

	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if containsGeneratedTokenClass(child) {
			return true
		}
	}

	return false
}

func flattenToText(node *html.Node) bool {
	text := textContent(node)
	if node.FirstChild != nil && node.FirstChild == node.LastChild && node.FirstChild.Type == html.TextNode && node.FirstChild.Data == text {
		return false
	}

	for node.FirstChild != nil {
		node.RemoveChild(node.FirstChild)
	}
	node.AppendChild(&html.Node{Type: html.TextNode, Data: text})

	return true
}

func textContent(node *html.Node) string {
	if node.Type == html.TextNode {
		return node.Data
	}

	var builder strings.Builder
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		builder.WriteString(textContent(child))
	}

	return builder.String()
}

func findElement(node *html.Node, name string) *html.Node {
	if node.Type == html.ElementNode && node.Data == name {
		return node
	}

	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if found := findElement(child, name); found != nil {
			return found
		}
	}

	return nil
}

func parentElementIs(node *html.Node, name string) bool {
	return node.Parent != nil && node.Parent.Type == html.ElementNode && node.Parent.Data == name
}

func attr(node *html.Node, key string) string {
	for _, attribute := range node.Attr {
		if attribute.Key == key {
			return attribute.Val
		}
	}

	return ""
}

func hasClass(node *html.Node, class string) bool {
	for _, candidate := range strings.Fields(attr(node, "class")) {
		if candidate == class {
			return true
		}
	}

	return false
}

func addClass(node *html.Node, class string) bool {
	for i, attribute := range node.Attr {
		if attribute.Key != "class" {
			continue
		}

		classes := strings.Fields(attribute.Val)
		for _, candidate := range classes {
			if candidate == class {
				return false
			}
		}

		classes = append(classes, class)
		node.Attr[i].Val = strings.Join(classes, " ")
		return true
	}

	node.Attr = append(node.Attr, html.Attribute{Key: "class", Val: class})
	return true
}
