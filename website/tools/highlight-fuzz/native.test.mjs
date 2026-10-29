// Explicit local integration tests: run prepare first; no compiler is downloaded by tests.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Reference, candidate } from "./harness.mjs";
const dir = dirname(fileURLToPath(import.meta.url));
const executable = resolve(
  dir,
  process.env.ROC_HIGHLIGHT_PREFIX || "zig-out",
  "bin/roc-highlight-reference",
);
test("native checked roles, diagnostics, and document state reset", async () => {
  const reference = new Reference(10000, () =>
    spawn(executable, [], { stdio: ["pipe", "pipe", "pipe"] }),
  );
  const source = "module [result]\nresult = |x| {\n local = x\n local\n}\n";
  try {
    const first = await reference.evaluate(source);
    assert.equal(first.confidence, "checked");
    assert.ok(first.lexical.some((x) => x.tag === "LowerIdent"));
    const text = Buffer.from(source);
    assert.equal(
      first.semantic.filter(
        (x) =>
          x.type === "parameter" &&
          text.subarray(x.start, x.end).toString() === "x",
      ).length,
      2,
    );
    const broken = await reference.evaluate(
      'module [result]\nresult = |x| { "unfinished',
    );
    assert.equal(broken.confidence, "parse");
    assert.ok(broken.diagnostics.length);
    assert.ok(broken.lexical.length);
    const rejected = await reference.evaluate(
      "module [result]\nresult = missing_identifier\n",
    );
    assert.equal(rejected.confidence, "parse");
    assert.ok(
      rejected.diagnostics.length,
      "checking diagnostics survive deferred finalization",
    );
    const again = await reference.evaluate(source);
    assert.deepEqual(again.semantic, first.semantic);
  } finally {
    reference.stop();
  }
});
test("checked builtin snapshot resolves exported function values", () => {
  const tokens = candidate()("callback = List.map\nother = Str.trim");
  assert.ok(tokens.filter((x) => x.type === "function").length >= 4);
});
