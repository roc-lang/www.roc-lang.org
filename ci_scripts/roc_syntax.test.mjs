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
  assert.deepEqual(roles(source, "constructor"), ["property", "property"]);
});
test("unbraced conditionals separate conditions, branches and record expressions", () => {
  const source =
    "module [result]\nresult : I64\nresult = if True 41 else { amount: 59 }.amount";
  assert.deepEqual(roles(source, "amount"), ["property", "property"]);
  assert.deepEqual(roles(source, "result"), [
    "variable",
    "variable",
    "variable",
  ]);
});
test("parenthesized lambda application returns its value shape", () => {
  const source =
    "result = (|x| {\n local = if True x else x\n { amount: x }.amount\n})(3)";
  assert.deepEqual(roles(source, "result"), ["variable"]);
  assert.deepEqual(roles(source, "x"), [
    "parameter",
    "parameter",
    "parameter",
    "parameter",
  ]);
  assert.deepEqual(roles(source, "amount"), ["property", "property"]);
});
test("shipped builtin snapshot identifies function values and leaves absent exports general", () => {
  const metadataContext = vm.createContext({});
  vm.runInContext(
    readFileSync(
      new URL("../website/public/roc-builtin-metadata.js", import.meta.url),
      "utf8",
    ),
    metadataContext,
  );
  const options = { metadata: metadataContext.rocBuiltinMetadata };
  assert.deepEqual(roles("f = List.map\ng = f", "f", options), [
    "function",
    "function",
  ]);
  assert.deepEqual(roles("f = List.absent_export", "absent_export", options), [
    "property",
  ]);
});
test("parenthesized branches are not whitespace function applications", () => {
  const source =
    "result = if True (|x| x)(1) else {\n value = { amount: 3 }.amount\n (|y| y)(value)\n}";
  assert.deepEqual(roles(source, "True"), ["enumMember"]);
  assert.deepEqual(roles(source, "amount"), ["property", "property"]);
  assert.deepEqual(roles(source, "value"), ["variable", "variable"]);
  assert.deepEqual(roles(source, "y"), ["parameter", "parameter"]);
});

test("match binding inherits callable shape while record access remains property", () => {
  const source =
    "module [result]\nresult : I64\nresult = match { amount: |n| n }.amount { f => 1 }\n";
  assert.deepEqual(roles(source, "amount"), ["property", "property"]);
  assert.deepEqual(roles(source, "f"), ["function"]);
});
test("annotated local declarations make a block rather than a record", () => {
  const source =
    "f = |x| {\n local : I64\n local = x\n if True local else x\n}";
  assert.deepEqual(roles(source, "local"), [
    "variable",
    "variable",
    "variable",
  ]);
  assert.deepEqual(roles(source, "I64"), ["type"]);
  assert.deepEqual(roles(source, "x"), ["parameter", "parameter", "parameter"]);
  assert.deepEqual(roles(source, "if"), ["keyword"]);
});
test("annotation ends before a repeated definition even without a newline or matching indentation", () => {
  for (const source of [
    "result = { value : I64 value = 94\nvalue }",
    "result = {\nvalue : I64\n value = 94\n value\n}",
  ]) {
    assert.deepEqual(roles(source, "value"), [
      "variable",
      "variable",
      "variable",
    ]);
    assert.deepEqual(roles(source, "I64"), ["type"]);
  }
});
test("deep destructuring uses bounded call stack and recovers following declarations", () => {
  const source =
    "f = |" + "[".repeat(5000) + "x" + "]".repeat(5000) + "| x\nvalid = |y| y";
  assert.deepEqual(roles(source, "x"), ["parameter", "parameter"]);
  assert.deepEqual(roles(source, "y"), ["parameter", "parameter"]);
  const broken = "f = |" + "[".repeat(5000) + "x\nvalid = |y| y";
  assert.deepEqual(roles(broken, "valid"), ["function"]);
  assert.deepEqual(roles(broken, "y"), ["parameter", "parameter"]);
});

test("pipeline operators preserve qualified functions without inventing lambda parameters", () => {
  const options = {
    modules: { Str: { join_with: "function", trim: "function" } },
  };
  const source =
    'main! = |numbers| {\n result = numbers.map(U32.to_str)\n  |> Str.join_with("\\n")\n result\n}\nvalue = "hi" |> Str.trim';
  assert.deepEqual(roles(source, "join_with", options), ["function"]);
  assert.deepEqual(roles(source, "trim", options), ["function"]);
  assert.deepEqual(roles(source, "numbers", options), [
    "parameter",
    "parameter",
  ]);
  assert.deepEqual(roles(source, "value", options), ["variable"]);
  assert.equal(
    tokens(source, options).filter(t => t.text === "|>" && t.type === "operator").length,
    2,
  );
  for (const operator of ["|>", "??", "//", "<-"]) {
    assert.ok(
      tokens(`value = left ${operator} right`).some(
        t => t.text === operator && t.type === "operator",
      ),
    );
  }
});

test("literal spelling cannot become a tag, binding, keyword, or delimiter", () => {
  const contents = [
    "Done", "Waiting", "x", "if", "match", "for", "else", "import", "var",
    "|", "{", "}", "(", ")", "[", "]", "=", ":", "->", "=>", "and", "or",
  ];
  for (const text of contents) {
    const source = `f = |x| ${JSON.stringify(text)}\nafter = |y| y`;
    const actual = tokens(source);
    const immutable = { s: "string", n: "number", e: "error", c: "comment" };
    for (const lexical of context.rocLexicalTokens(source)) {
      if (!immutable[lexical.type]) continue;
      assert.ok(actual.some(token => token.start === lexical.start &&
        token.end === lexical.end && token.type === immutable[lexical.type]), text);
    }
    assert.deepEqual(roles(source, "after"), ["function"], text);
    assert.deepEqual(roles(source, "y"), ["parameter", "parameter"], text);
  }
  const source = 'Status : [Done, Pending]\ndescribe = |status| match status {\n Done => "Done"\n Pending => "Waiting"\n}';
  assert.deepEqual(roles(source, "Done"), ["enumMember", "enumMember", "string"]);
  assert.deepEqual(roles(source, "Waiting"), ["string"]);
});

test("string interpolation uses its enclosing scope while literal contents stay opaque", () => {
  const source = 'f = |x| "x${x}Done${x.trim()}"\nafter = |y| y';
  assert.deepEqual(roles(source, "x"), ["parameter", "string", "parameter", "parameter"]);
  assert.deepEqual(roles(source, "Done"), ["string"]);
  assert.deepEqual(roles(source, "trim"), ["function"]);
  assert.deepEqual(roles(source, "y"), ["parameter", "parameter"]);
  assert.deepEqual(roles('f = |x| "${"${x}"}"', "x"), ["parameter", "parameter"]);
  const adjacent = 'outer = |x| {\n f = |y| "inside"\n "outside${y}${x}"\n}';
  assert.deepEqual(roles(adjacent, "y"), ["parameter", "variable"]);
  assert.deepEqual(roles(adjacent, "x"), ["parameter", "parameter"]);
});

test("interpolation boundaries share a role while ordinary braces stay brackets", () => {
  const actual = tokens('render = |name| { "Hello ${name} and ${name.trim()}" }');
  assert.deepEqual(actual.filter(t => t.text === "${").map(t => t.type), [
    "operator", "operator",
  ]);
  assert.deepEqual(actual.filter(t => t.text === "}").map(t => t.type), [
    "operator", "operator", "bracket",
  ]);
  assert.deepEqual(actual.filter(t => t.text === "{").map(t => t.type), ["bracket"]);
});
