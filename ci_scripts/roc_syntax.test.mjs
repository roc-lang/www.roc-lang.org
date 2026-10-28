import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const context = vm.createContext({
  TextEncoder,
  TextDecoder,
  window: {},
  document: { addEventListener() {} },
  performance,
});
vm.runInContext(
  readFileSync(
    new URL("../website/public/compiler.js", import.meta.url),
    "utf8",
  ),
  context,
);
// Prior to browser integration the lexical entry point still has its old name.
vm.runInContext("globalThis.rocLexicalTokens ||= rocTokenRanges", context);
vm.runInContext(
  readFileSync(
    new URL("../website/public/roc-syntax.js", import.meta.url),
    "utf8",
  ),
  context,
);
function tokens(source, options = {}) {
  return Array.from(context.rocSemanticTokens(source, options), (t) => ({
    ...t,
    text: source.slice(t.start, t.end),
  }));
}
function roles(source, name, options = {}) {
  return tokens(source, options)
    .filter((t) => t.text === name)
    .map((t) => t.type);
}

test("lambda identity, calls, capture, and block declaration order", () => {
  const source =
    "f = |transform, x| {\n    y = transform(x)\n    g = |z| transform(z)\n    y\n}\nx = 1\nother = x";
  assert.deepEqual(roles(source, "transform"), [
    "parameter",
    "parameter",
    "parameter",
  ]);
  assert.deepEqual(roles(source, "x"), [
    "parameter",
    "parameter",
    "variable",
    "variable",
  ]);
  assert.deepEqual(roles(source, "y"), ["variable", "variable"]);
  assert.deepEqual(roles(source, "g"), ["function"]);
});
test("functions propagate through aliases and forward module references", () => {
  const source =
    "answer = later(1)\nlater = |n| n\nalias = later\nresult = alias(2)";
  assert.deepEqual(roles(source, "later"), [
    "function",
    "function",
    "function",
  ]);
  assert.deepEqual(roles(source, "alias"), ["function", "function"]);
});
test("destructured parameters distinguish properties and bindings", () => {
  const source = "f = |{ x, y: renamed }, (a, b), [first, .. as rest]| renamed";
  assert.deepEqual(roles(source, "y"), ["property"]);
  for (const name of ["x", "renamed", "a", "b", "first", "rest"])
    assert.ok(
      roles(source, name).every((r) => r === "parameter"),
      name,
    );
});
test("annotations distinguish values, functions and type parameters", () => {
  const source = "identity : a -> a\nidentity = |x| x\nlimit : I64\nlimit = 1";
  assert.deepEqual(roles(source, "identity"), ["function", "function"]);
  assert.deepEqual(roles(source, "a"), ["typeParameter", "typeParameter"]);
  assert.deepEqual(roles(source, "I64"), ["type"]);
});
test("metadata resolves qualified exports, exposed names, and aliases", () => {
  const options = {
    metadata: {
      modules: {
        Util: { transform: { kind: "function" }, limit: { kind: "variable" } },
      },
    },
  };
  const source =
    "import Util as U exposing [transform]\nf = U.transform\nx = U.limit\ng = f\ny = transform";
  assert.deepEqual(roles(source, "transform", options), [
    "function",
    "function",
    "function",
  ]);
  assert.deepEqual(roles(source, "f", options), ["function", "function"]);
  assert.deepEqual(roles(source, "g", options), ["function"]);
  assert.deepEqual(roles(source, "U", options), [
    "namespace",
    "namespace",
    "namespace",
  ]);
});
test("members and tag expressions retain distinct roles", () => {
  const source =
    'value = { name: "hi", run: |x| x }\nresult = value.run(1)\ntag = Done';
  assert.deepEqual(roles(source, "name"), ["property"]);
  assert.deepEqual(roles(source, "run"), ["property", "function"]);
  assert.deepEqual(roles(source, "Done"), ["enumMember"]);
});
test("Unicode CRLF, comments, literals, malformed input and spans", () => {
  for (const source of [
    'f = |x| "😀 ${x}"\r\n# hello\r\ny = 1',
    "f = |{x",
    'f = |x| {\n y = "unterminated',
    "f = |x| x\nother = x",
  ]) {
    const result = tokens(source);
    let end = 0;
    for (const t of result) {
      assert.ok(t.start >= end);
      assert.ok(t.end > t.start);
      assert.ok(t.end <= source.length);
      end = t.end;
    }
  }
  assert.deepEqual(roles("f = |x| x\nother = x", "x"), [
    "parameter",
    "parameter",
    "variable",
  ]);
});
test("conditional blocks retain parameter identity and block results propagate", () => {
  assert.deepEqual(roles("f = |x| if x { x } else { x }", "x"), [
    "parameter",
    "parameter",
    "parameter",
    "parameter",
  ]);
  assert.deepEqual(
    roles("value = {\n f = |x| x\n f\n}\nother = value", "value"),
    ["function", "function"],
  );
});
test("loop bindings and destructuring declarations stay inside their scopes", () => {
  const source =
    "f = |xs| {\n for item in xs { item }\n item\n}\n{ a, b: renamed } = value\nresult = renamed";
  assert.deepEqual(roles(source, "item"), ["variable", "variable", "variable"]);
  assert.deepEqual(roles(source, "b"), ["property"]);
  assert.deepEqual(roles(source, "renamed"), ["variable", "variable"]);
});
test("generic declarations distinguish tag variants from payload types", () => {
  const source =
    "Shape(a) : [Circle(a), Empty]\nPair(a) : { first: a, second: Str }";
  assert.deepEqual(roles(source, "Shape"), ["type"]);
  assert.deepEqual(roles(source, "Circle"), ["enumMember"]);
  assert.deepEqual(roles(source, "Empty"), ["enumMember"]);
  assert.deepEqual(roles(source, "first"), ["property"]);
  assert.deepEqual(roles(source, "Str"), ["type"]);
  assert.ok(roles(source, "a").every((r) => r === "typeParameter"));
});
test("unfinished lambda does not consume subsequent declarations", () => {
  const source = "broken = |x\nvalid = |y| y";
  assert.deepEqual(roles(source, "valid"), ["function"]);
  assert.deepEqual(roles(source, "y"), ["parameter", "parameter"]);
});
test("match branch bindings do not escape their branch", () => {
  const source = "f = |x| match x {\n Some(y) => y\n None => x\n}\nother = y";
  assert.deepEqual(roles(source, "y"), ["variable", "variable", "variable"]);
  assert.deepEqual(roles(source, "x"), ["parameter", "parameter", "parameter"]);
});
test("JavaScript object property names are ordinary Roc names", () => {
  assert.deepEqual(roles("result = constructor", "constructor"), ["variable"]);
  assert.deepEqual(roles("result = toString", "toString"), ["variable"]);
  const source = "record = { constructor: |x| x }\nvalue = record.constructor";
  assert.deepEqual(roles(source, "constructor"), ["property", "function"]);
});
