#!/usr/bin/env node
// Local compiler-backed development tool; no dependencies or website runtime hooks.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";

export const revision = "bad769be8e8855fa90e08800e31a75bfed1fb128";
const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, "../../..");
const publicDir = join(root, "website/public");
const defaultOut = join(root, "website/.cache/highlight-fuzz");
export function candidate() {
  const context = vm.createContext({
    TextEncoder,
    TextDecoder,
    performance,
    window: {},
    document: { addEventListener() {} },
  });
  for (const name of [
    "roc-builtin-metadata.js",
    "roc-syntax.js",
    "compiler.js",
  ]) {
    const path = join(publicDir, name);
    if (existsSync(path))
      vm.runInContext(readFileSync(path, "utf8"), context, {
        filename: name,
        timeout: 1000,
      });
  }
  return (source) => {
    context.input = source;
    return JSON.parse(
      vm.runInContext("JSON.stringify(rocSemanticTokens(input))", context, {
        timeout: 1000,
      }),
    );
  };
}
export class Reference {
  constructor(
    timeout = 2000,
    spawnReference = () =>
      spawn(join(dir, "zig-out/bin/roc-highlight-reference"), [], {
        stdio: ["pipe", "pipe", "pipe"],
      }),
  ) {
    this.spawnReference = spawnReference;
    this.timeout = timeout;
    this.next = 0;
    this.pending = null;
  }
  start() {
    this.process = this.spawnReference();
    const child = this.process;
    this.stderr = "";
    this.process.stderr.on("data", (x) => {
      this.stderr = (this.stderr + x).slice(-12000);
    });
    createInterface({ input: this.process.stdout }).on("line", (line) => {
      if (this.process !== child || !this.pending) return;
      try {
        const response = JSON.parse(line);
        if (response.id !== this.pending.id)
          throw Error("response ID mismatch");
        this.pending.resolve(response);
      } catch (error) {
        this.pending.reject(error);
      }
    });
    this.process.on("error", (error) => {
      if (this.process === child) this.pending?.reject(error);
    });
    this.process.on("exit", (code, signal) => {
      if (this.process === child)
        this.pending?.reject(
          Error(`Reference exited ${code ?? signal}: ${this.stderr}`),
        );
    });
  }
  async evaluate(source, check = true, builtin = false) {
    if (!this.process) this.start();
    const id = ++this.next;
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("Reference timeout")),
          this.timeout,
        );
        this.pending = {
          id,
          resolve: (x) => {
            clearTimeout(timer);
            resolve(x);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        };
        this.process.stdin.write(
          JSON.stringify({ id, source, check, builtin }) + "\n",
        );
      });
    } catch (error) {
      this.stop();
      throw error;
    } finally {
      this.pending = null;
    }
  }
  stop() {
    const process = this.process;
    this.process = null;
    this.pending = null;
    process?.kill();
  }
}
const projection = (type) =>
  ["function", "parameter", "variable", "typeParameter"].includes(type)
    ? "identifier"
    : ["namespace", "type", "enumMember"].includes(type)
      ? "upperIdentifier"
      : type;
export function compare(source, actual, reference) {
  const asBytes = (offset) => Buffer.byteLength(source.slice(0, offset));
  const js = actual.map((x) => ({
    ...x,
    start: asBytes(x.start),
    end: asBytes(x.end),
  }));
  const differences = [];
  const add = (start, end, expected, found, category) => {
    if (expected === found || start === end) return;
    differences.push({
      start,
      end,
      expected,
      actual: found,
      category,
      text: Buffer.from(source).subarray(start, end).toString(),
    });
  };
  // LSP intentionally omits comments and punctuation. Compare only reference-covered
  // intervals, splitting at both producers' boundaries (not token array indices).
  for (const expected of reference.semantic) {
    const points = new Set([expected.start, expected.end]);
    for (const token of js)
      if (token.end > expected.start && token.start < expected.end) {
        points.add(Math.max(token.start, expected.start));
        points.add(Math.min(token.end, expected.end));
      }
    const edges = [...points].sort((a, b) => a - b);
    for (let i = 0; i + 1 < edges.length; i++) {
      const start = edges[i],
        end = edges[i + 1];
      const found =
        js.find((x) => x.start <= start && x.end >= end)?.type ??
        "unclassified";
      add(
        start,
        end,
        expected.type,
        found,
        reference.confidence === "checked"
          ? projection(expected.type) === projection(found)
            ? "semantic"
            : "lexical"
          : "recovery",
      );
    }
  }
  // Native lexer catches extra candidate coverage too, excluding compiler-unclassified
  // trivia and LSP-only structural differences in strings/interpolations.
  for (const expected of reference.lexical) {
    if (!["number", "keyword"].includes(expected.type)) continue;
    const found =
      js.find((x) => x.start <= expected.start && x.end >= expected.end)
        ?.type ?? "unclassified";
    add(
      expected.start,
      expected.end,
      expected.type,
      found,
      reference.confidence === "checked" ? "lexical" : "recovery",
    );
  }
  return differences.filter(
    (x, i, all) =>
      all.findIndex((y) => JSON.stringify(y) === JSON.stringify(x)) === i,
  );
}
export const signature = (finding) =>
  [finding.category, finding.expected, finding.actual].join(":");
export function generator(seed) {
  let state = seed >>> 0 || 1,
    serial = 0;
  const random = (n) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % n;
  };
  const expr = (depth, scope, features) => {
    const choice = depth > 4 ? random(2) : random(8);
    features.add(`${depth}:${choice}`);
    if (choice === 0) return String(random(100));
    if (choice === 1)
      return scope.length ? scope[random(scope.length)] : String(random(10));
    if (choice === 2)
      return `(${expr(depth + 1, scope, features)} + ${expr(depth + 1, scope, features)})`;
    const name = `v${serial++}`;
    if (choice === 3)
      return `(|${name}| ${expr(depth + 1, [...scope, name], features)})(${expr(depth + 1, scope, features)})`;
    if (choice === 4)
      return `{\n    ${name} = ${expr(depth + 1, scope, features)}\n    ${expr(depth + 1, [...scope, name], features)}\n}`;
    if (choice === 5)
      return `{ amount: ${expr(depth + 1, scope, features)} }.amount`;
    if (choice === 6)
      return `if True ${expr(depth + 1, scope, features)} else ${expr(depth + 1, scope, features)}`;
    return `match ${expr(depth + 1, scope, features)} {\n ${name} => ${expr(depth + 1, [...scope, name], features)}\n}`;
  };
  const next = () => {
    serial = 0;
    const features = new Set();
    let source = `module [result]\nresult : I64\nresult = ${expr(0, [], features)}\n`;
    let malformed = false;
    if (random(5) === 0) {
      const at = random(source.length);
      source = source.slice(0, at) + source.slice(at + 1 + random(3));
      malformed = true;
    }
    return { source, features: [...features].sort(), malformed };
  };
  next.random = random;
  next.mutate = (parent) => {
    const features = new Set(parent.features),
      numbers = [...parent.source.matchAll(/\b[0-9]+\b/g)];
    if (!numbers.length) return next();
    const selected = numbers[random(numbers.length)];
    const replacement = expr(2, [], features);
    return {
      source:
        parent.source.slice(0, selected.index) +
        replacement +
        parent.source.slice(selected.index + selected[0].length),
      features: [...features],
      malformed: parent.malformed,
    };
  };
  return next;
}
export async function minimize(source, predicate) {
  // Delta debugging then lexical simplification. The predicate must retain confidence
  // and the precise disagreement signature, rather than merely any disagreement.
  let current = source;
  for (let chunks = 2; chunks <= Math.max(2, current.length); ) {
    const width = Math.ceil(current.length / chunks);
    let changed = false;
    for (let start = 0; start < current.length; start += width) {
      const next = current.slice(0, start) + current.slice(start + width);
      if (next.length < current.length && (await predicate(next))) {
        current = next;
        chunks = Math.max(2, chunks - 1);
        changed = true;
        break;
      }
    }
    if (!changed) {
      if (chunks >= current.length) break;
      chunks = Math.min(current.length, chunks * 2);
    }
  }
  return current;
}
async function runCommand(command, args) {
  const child = spawn(command, args, { cwd: dir, stdio: "inherit" });
  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(Error(`${command} exited ${code}`)),
    );
  });
}
async function provenance(prefix) {
  const buildInfo = JSON.parse(
    await readFile(join(prefix, "build-info.json"), "utf8"),
  );
  const hash = createHash("sha256");
  for (const name of [
    "compiler.js",
    "roc-syntax.js",
    "roc-builtin-metadata.js",
  ])
    if (existsSync(join(publicDir, name)))
      hash.update(name).update(await readFile(join(publicDir, name)));
  return { ...buildInfo, candidateHash: hash.digest("hex") };
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const option = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i < 0 ? fallback : args[i + 1];
  };
  const prefix = resolve(dir, option("prefix", "zig-out"));
  if (command === "prepare") {
    const buildMode = option("optimize", "safe");
    if (!["safe", "fast", "debug"].includes(buildMode))
      throw Error("--optimize must be safe, fast, or debug");
    await runCommand("zig", [
      "build",
      `-Doptimize=${buildMode}`,
      "--prefix",
      prefix,
    ]);
    await writeFile(
      join(prefix, "build-info.json"),
      JSON.stringify({
        rocRevision: revision,
        zigVersion: spawnSync("zig", ["version"], {
          encoding: "utf8",
        }).stdout.trim(),
        buildMode,
      }) + "\n",
    );
    return;
  }
  const reference = new Reference(Number(option("timeout", 2000)), () =>
    spawn(join(prefix, "bin/roc-highlight-reference"), [], {
      stdio: ["pipe", "pipe", "pipe"],
    }),
  );
  try {
    if (command === "metadata-refresh") {
      await metadata(reference);
      return;
    }
    const highlight = candidate();
    const evaluate = async (source) => {
      const native = await reference.evaluate(source);
      const actual = highlight(source);
      return { native, actual, differences: compare(source, actual, native) };
    };
    if (command === "compare" || command === "replay") {
      const input = await readFile(resolve(args[0]), "utf8");
      const source = command === "replay" ? JSON.parse(input).source : input;
      console.log(
        JSON.stringify({ source, ...(await evaluate(source)) }, null, 2),
      );
      return;
    }
    if (command === "minimize") {
      const file = resolve(args[0]),
        finding = JSON.parse(await readFile(file, "utf8"));
      const target = finding.signature;
      const source = await minimize(finding.source, async (source) => {
        const r = await evaluate(source);
        return (
          r.native.confidence === finding.native.confidence &&
          r.differences.some((x) => signature(x) === target)
        );
      });
      const result = { ...finding, source, ...(await evaluate(source)) };
      await writeFile(
        file.replace(/\.json$/, ".min.json"),
        JSON.stringify(result, null, 2) + "\n",
      );
      return;
    }
    if (command !== "fuzz")
      throw Error(
        "Usage: node harness.mjs prepare|compare FILE|fuzz [--seed N --iterations N --out DIR]|replay FILE|minimize FILE|metadata-refresh",
      );
    const seed = Number(option("seed", 1)),
      iterations = Number(option("iterations", 10000)),
      out = resolve(option("out", defaultOut));
    await mkdir(out, { recursive: true });
    const generate = generator(seed),
      seen = new Map(),
      coverage = new Set(),
      retained = [];
    let checked = 0,
      recovery = 0,
      failures = 0;
    const corpus = option("corpus", null);
    if (corpus)
      for (const name of (await readdir(resolve(corpus))).sort())
        if (name.endsWith(".roc"))
          retained.push({
            source: await readFile(join(resolve(corpus), name), "utf8"),
            features: [],
            malformed: false,
          });
    const info = await provenance(prefix);
    for (let iteration = 0; iteration < iterations; iteration++) {
      const generated =
        retained.length && generate.random(4) === 0
          ? generate.mutate(retained[generate.random(retained.length)])
          : generate();
      const source = generated.source;
      if (Buffer.byteLength(source) > 8192) {
        iteration--;
        continue;
      }
      try {
        const result = await evaluate(source);
        if (result.native.confidence === "checked") checked++;
        else recovery++;
        const features = [
          ...generated.features,
          ...result.native.semantic.map(
            (x) => `${result.native.confidence}:${x.type}`,
          ),
          ...result.native.lexical.map(
            (x, i, a) => `${a[i - 1]?.tag}:${x.tag}`,
          ),
        ];
        const novel = features.filter((x) => !coverage.has(x));
        features.forEach((x) => coverage.add(x));
        if (novel.length) retained.push(generated);
        if (novel.length)
          await writeFile(
            join(
              out,
              `corpus-${createHash("sha256").update(source).digest("hex").slice(0, 16)}.roc`,
            ),
            source,
          );
        for (const difference of result.differences) {
          const key = signature(difference);
          const existing = seen.get(key);
          if (existing && existing.source.length <= source.length) continue;
          const number = existing?.number ?? seen.size + 1;
          seen.set(key, { source, number });
          const finding = {
            ...info,
            seed,
            iteration,
            source,
            signature: key,
            ...result,
            replay: `node website/tools/highlight-fuzz/harness.mjs replay ${join(out, `finding-${number}.json`)}`,
          };
          await writeFile(
            join(out, `finding-${number}.json`),
            JSON.stringify(finding, null, 2) + "\n",
          );
          console.log(
            JSON.stringify({
              iteration,
              signature: key,
              text: difference.text,
            }),
          );
        }
      } catch (error) {
        failures++;
        await writeFile(
          join(out, `failure-${iteration}.json`),
          JSON.stringify(
            { ...info, seed, iteration, source, error: String(error) },
            null,
            2,
          ) + "\n",
        );
      }
      if ((iteration + 1) % 1000 === 0)
        console.log(
          JSON.stringify({
            iteration: iteration + 1,
            checked,
            recovery,
            signatures: seen.size,
            features: coverage.size,
            failures,
          }),
        );
    }
    const summary = {
      ...info,
      seed,
      iterations,
      checked,
      recovery,
      signatures: [...seen.keys()],
      features: coverage.size,
      failures,
    };
    await writeFile(
      join(out, "summary.json"),
      JSON.stringify(summary, null, 2) + "\n",
    );
    console.log(JSON.stringify(summary));
    if (failures) process.exitCode = 1;
  } finally {
    reference.stop();
  }
}
async function metadata(reference) {
  const packages = await readdir(join(dir, "zig-pkg"));
  const packageName = packages.find((x) => x.startsWith("roc-0.0.0-"));
  if (!packageName) throw Error("Run prepare before metadata-refresh");
  const source = await readFile(
    join(dir, "zig-pkg", packageName, "src/build/roc/Builtin.roc"),
    "utf8",
  );
  const referenceTokens = await reference.evaluate(source, false, true);
  const roles = new Map(referenceTokens.semantic.map((x) => [x.start, x.type]));
  const modules = {},
    stack = [];
  let offset = 0;
  const lines = source.split("\n"),
    lineOffsets = [];
  let lineOffset = 0;
  for (const line of lines) {
    lineOffsets.push(lineOffset);
    lineOffset += Buffer.byteLength(line) + 1;
  }
  const typeShape = (text) => {
    text = text.trim();
    if (text.startsWith("(") && text.endsWith(")"))
      return typeShape(text.slice(1, -1));
    let nesting = 0;
    for (let i = 0; i < text.length - 1; i++) {
      const c = text[i];
      if ("([{".includes(c)) nesting++;
      else if (")]}".includes(c)) nesting--;
      else if (
        nesting === 0 &&
        (text.slice(i, i + 2) === "->" || text.slice(i, i + 2) === "=>")
      )
        return { kind: "function", result: typeShape(text.slice(i + 2)) };
    }
    return { kind: "variable" };
  };
  for (const [lineIndex, line] of lines.entries()) {
    const indent = line.match(/^\t*/)[0].length;
    if (line.trim() && !line.trim().startsWith("#"))
      while (stack.length && indent <= stack.at(-1).indent) stack.pop();
    const declaration = line.match(
      /^\t*([A-Z][A-Za-z_0-9]*)(?:\([^\n]*?\))?\s*(?:::|:=|:)/,
    );
    if (declaration) {
      const parent = stack
        .map((x) => x.name)
        .filter((x) => x !== "Builtin")
        .join(".");
      if (parent) (modules[parent] ??= {})[declaration[1]] = { kind: "type" };
      const name = [parent, declaration[1]].filter(Boolean).join(".");
      if (declaration[1] !== "Builtin") modules[name] ??= {};
      if (/\.\{\s*$/.test(line)) stack.push({ indent, name: declaration[1] });
    }
    const annotation = line.match(/^\t*([a-z][A-Za-z_0-9]*!?)\s*:/);
    if (annotation && stack.length && indent === stack.at(-1).indent + 1) {
      const owner =
        stack
          .map((x) => x.name)
          .filter((x) => x !== "Builtin")
          .join(".") || "Builtin";
      const start =
        offset + Buffer.byteLength(line.slice(0, line.indexOf(annotation[1])));
      let type = roles.get(start);
      // Checked CIR carries the definitive role on the binding itself. Some
      // compiler annotations are intentionally left as general variables.
      for (let i = lineIndex + 1; i < lines.length; i++) {
        const next = lines[i],
          nextIndent = next.match(/^\t*/)[0].length;
        if (next.trim() && !next.trim().startsWith("#") && nextIndent < indent)
          break;
        if (
          nextIndent === indent &&
          next.trim().startsWith(annotation[1] + " =")
        ) {
          type =
            roles.get(
              lineOffsets[i] +
                Buffer.byteLength(next.slice(0, next.indexOf(annotation[1]))),
            ) || type;
          break;
        }
        if (nextIndent === indent && /^\t*[a-zA-Z_].*[:=]/.test(next)) break;
      }
      if (type === "function" || type === "variable") {
        let annotationText = line.slice(line.indexOf(":") + 1);
        for (let i = lineIndex + 1; i < lines.length; i++) {
          const next = lines[i];
          if (
            next.trim() &&
            !next.trim().startsWith("#") &&
            next.match(/^\t*/)[0].length <= indent
          )
            break;
          if (!next.trim().startsWith("#")) annotationText += " " + next;
        }
        const shape = typeShape(annotationText);
        (modules[owner] ??= {})[annotation[1]] =
          type === "function"
            ? { kind: type, result: shape.result || { kind: "variable" } }
            : { kind: type };
      }
    }
    offset += Buffer.byteLength(line) + 1;
  }
  const snapshot = {
    formatVersion: 1,
    rocRevision: revision,
    confidence: referenceTokens.confidence,
    modules,
  };
  const path = join(publicDir, "roc-builtin-metadata.js");
  await writeFile(
    path,
    `// Generated from pinned Roc compiler semantic tokens. Refresh with the local highlight harness.\nglobalThis.rocBuiltinMetadata = ${JSON.stringify(snapshot)};\n`,
  );
  console.log(
    `Wrote ${Object.keys(modules).length} modules / ${Object.values(modules).reduce((n, m) => n + Object.keys(m).length, 0)} exports to ${path}`,
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
