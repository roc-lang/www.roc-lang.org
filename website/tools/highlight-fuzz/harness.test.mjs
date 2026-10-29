import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {
  compare,
  generator,
  minimize,
  signature,
  candidate,
  encodeMetadata,
} from "./harness.mjs";

test("compact metadata round trips arbitrary shapes and shares identical descriptors", () => {
  const functionShape = { kind: "function", result: { kind: "variable" } };
  const fixture = {
    formatVersion: 1,
    rocRevision: "fixture",
    confidence: "checked",
    moduleKinds: { Demo: "namespace", Empty: "type", constructor: "type" },
    futureHeader: { enabled: true },
    modules: {
      Demo: {
        first: functionShape,
        second: { ...functionShape },
        curried: { kind: "function", result: functionShape },
        record: { kind: "variable", fields: { run: functionShape } },
      },
      Empty: {},
      constructor: Object.fromEntries([
        ["__proto__", { kind: "type", futureDetail: "retained" }],
        ["two words", { kind: "variable" }],
      ]),
    },
  };
  const source = encodeMetadata(fixture);
  assert.equal(source, encodeMetadata(fixture), "encoding is deterministic");
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const metadata = context.rocBuiltinMetadata;
  assert.deepEqual(JSON.parse(JSON.stringify(metadata)), fixture);
  assert.equal(metadata.modules.Demo.first, metadata.modules.Demo.second);
  assert.equal(metadata.modules.Demo.first.result.kind, "variable");
  assert.equal(metadata.modules.Demo.curried.result.kind, "function");
  assert.ok(Object.hasOwn(metadata.modules.constructor, "__proto__"));
});
test("metadata factoring preserves overlapping sets, different roles, and optional kinds", () => {
  const fn = { kind: "function", result: { kind: "variable" } };
  const common = {
    common_mapping_function: fn,
    common_filtering_function: fn,
    common_folding_function: fn,
  };
  for (const kinds of [undefined, {}, null, { A: "namespace", B: "type", "External.Type": "type" }]) {
    const fixture = {
      formatVersion: 1,
      ...(kinds === undefined ? {} : { moduleKinds: kinds }),
      modules: {
        A: { ...common, same_name: fn, only_a: fn },
        B: { ...common, same_name: { kind: "variable" }, only_b: fn },
        C: { ...common, only_c: { kind: "type" } },
        Empty: {},
      },
    };
    const source = encodeMetadata(fixture);
    const context = vm.createContext({});
    vm.runInContext(source, context);
    const metadata = JSON.parse(JSON.stringify(context.rocBuiltinMetadata));
    assert.deepEqual(metadata, fixture);
    assert.equal(source, encodeMetadata(metadata), "decode/re-encode is stable");
    assert.equal(metadata.modules.A.same_name.kind, "function");
    assert.equal(metadata.modules.B.same_name.kind, "variable");
  }
});
test("aligns spans across Unicode and differing token boundaries", () => {
  const source = '"😀" x';
  const actual = [
    { start: 0, end: 4, type: "string" },
    { start: 5, end: 6, type: "variable" },
  ];
  const reference = {
    confidence: "checked",
    semantic: [
      { start: 0, end: 6, type: "string" },
      { start: 7, end: 8, type: "parameter" },
    ],
    lexical: [],
  };
  const differences = compare(source, actual, reference);
  assert.equal(differences.length, 1);
  assert.equal(differences[0].text, "x");
  assert.equal(signature(differences[0]), "semantic:parameter:variable");
});
test("does not report omitted punctuation or trivia", () => {
  assert.deepEqual(
    compare("# comment\nx = 1", [], {
      confidence: "parse",
      semantic: [],
      lexical: [{ start: 12, end: 13, type: "punctuation" }],
    }),
    [],
  );
});
test("detects a controlled classifier defect and labels recovery", () => {
  const native = {
    confidence: "parse",
    semantic: [{ start: 0, end: 1, type: "parameter" }],
    lexical: [],
  };
  assert.equal(
    compare("x", [{ start: 0, end: 1, type: "variable" }], native)[0].category,
    "recovery",
  );
});
test("generation replays exactly and composes constructs", () => {
  const a = generator(42),
    b = generator(42);
  const forms = new Set();
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.deepEqual(x, b());
    x.features.forEach((x) => forms.add(x));
    assert.ok(x.source.length < 8192);
  }
  assert.ok(forms.size > 20);
});
test("minimization preserves a predicate", async () => {
  assert.equal(
    await minimize("prefix TARGET suffix", async (text) =>
      text.includes("TARGET"),
    ),
    "TARGET",
  );
});
test("runs the production candidate", () => {
  const tokens = candidate()("double = |x| x");
  assert.equal(tokens.find((x) => x.start === 10)?.type, "parameter");
});

test("generates real module lines rather than escaped newline text", () => {
  const next = generator(1);
  let accepted = 0;
  for (let i = 0; i < 100; i++) {
    const sample = next();
    if (sample.malformed) continue;
    accepted++;
    assert.ok(
      sample.source.startsWith("module [result]\nresult : I64\nresult = "),
    );
    assert.ok(sample.source.endsWith("\n"));
    assert.ok(!sample.source.includes("\\n"));
  }
  assert.ok(accepted > 50);
});

test("detects missing coverage and an incorrectly classified keyword", () => {
  const reference = {
    confidence: "checked",
    semantic: [{ start: 0, end: 1, type: "variable" }],
    lexical: [],
  };
  assert.equal(
    signature(compare("x", [], reference)[0]),
    "lexical:variable:unclassified",
  );
  const keyword = {
    confidence: "checked",
    semantic: [],
    lexical: [{ start: 0, end: 2, type: "keyword" }],
  };
  assert.equal(
    signature(
      compare("if", [{ start: 0, end: 2, type: "variable" }], keyword)[0],
    ),
    "lexical:keyword:variable",
  );
});

test("minimization retains the original disagreement signature", async () => {
  const classify = (source) => {
    const at = source.indexOf("x");
    return at < 0
      ? []
      : compare(source, [{ start: at, end: at + 1, type: "variable" }], {
          confidence: "checked",
          semantic: [{ start: at, end: at + 1, type: "parameter" }],
          lexical: [],
        });
  };
  const source = "before x after";
  const expected = signature(classify(source)[0]);
  const reduced = await minimize(source, async (s) =>
    classify(s).some((f) => signature(f) === expected),
  );
  assert.equal(reduced, "x");
  assert.equal(signature(classify(reduced)[0]), expected);
});

import { Reference } from "./harness.mjs";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
function child(handler) {
  const process = new EventEmitter();
  process.stdin = new PassThrough();
  process.stdout = new PassThrough();
  process.stderr = new PassThrough();
  process.stdin.on("data", (data) => handler(JSON.parse(data), process));
  process.kill = () => {
    setTimeout(() => process.emit("exit", null, "SIGTERM"), 10);
  };
  return process;
}
test("timeout restarts reference and ignores delayed exit of old child", async () => {
  let starts = 0;
  const reference = new Reference(100, () =>
    child((request, process) => {
      if (starts === 1) return;
      setTimeout(
        () =>
          process.stdout.write(
            JSON.stringify({ id: request.id, confidence: "checked" }) + "\n",
          ),
        30,
      );
    }),
  );
  const spawn = reference.spawnReference;
  reference.spawnReference = () => {
    starts++;
    return spawn();
  };
  try {
    await assert.rejects(reference.evaluate("hang"), /timeout/);
    const result = await reference.evaluate("good");
    assert.equal(result.confidence, "checked");
    assert.equal(starts, 2);
  } finally {
    reference.stop();
  }
});
test("crash is reported and next evaluation gets a fresh reference", async () => {
  let starts = 0;
  const reference = new Reference(100, () => {
    const number = ++starts;
    return child((request, process) => {
      if (number === 1) queueMicrotask(() => process.emit("exit", 1, null));
      else
        queueMicrotask(() =>
          process.stdout.write(
            JSON.stringify({ id: request.id, confidence: "checked" }) + "\n",
          ),
        );
    });
  });
  try {
    await assert.rejects(reference.evaluate("crash"), /exited 1/);
    assert.equal((await reference.evaluate("good")).confidence, "checked");
    assert.equal(starts, 2);
  } finally {
    reference.stop();
  }
});
