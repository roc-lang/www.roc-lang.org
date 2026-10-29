// Structural highlighting, independent of the DOM. Source offsets are UTF-16.
(function (global) {
  "use strict";
  const names = {
    u: "enumMember",
    v: "variable",
    n: "number",
    s: "string",
    k: "keyword",
    p: "bracket",
    d: "bracket",
    o: "operator",
    e: "error",
    c: "comment",
    f: "punctuation",
  };
  const word = /^[A-Za-z_][A-Za-z_0-9]*!?$/;
  const upper = /^[A-Z]/;
  const variable = { kind: "variable" };
  const fn = { kind: "function" };

  global.rocSemanticTokens = function (source, options = {}) {
    const lexical = options.lexicalTokens || global.rocLexicalTokens(source);
    const metadata = options.metadata || global.rocBuiltinMetadata || {};
    const moduleKinds = metadata.moduleKinds || {};
    const modules =
      options.modules ||
      options.metadata?.modules ||
      global.rocBuiltinMetadata?.modules ||
      {};
    const all = [];
    let line = 0,
      lineStart = 0,
      scanned = 0;
    for (const range of lexical) {
      // The lexer groups field names with their colon. Split structural tokens,
      // retaining operators, literals, and errors exactly as the lexer produced them.
      const text = source.slice(range.start, range.end);
      const pieces = ["s", "c", "n", "e", "o"].includes(range.type) || text === "${"
        ? [{ index: 0, 0: text }]
        : [
            ...text.matchAll(
              /[A-Za-z_][A-Za-z_0-9]*!?|:=|::|=>|->|==|!=|<=|>=|\.\.|[^\s]/g,
            ),
          ];
      for (const piece of pieces) {
        const start = range.start + piece.index,
          end = start + piece[0].length;
        while (scanned < start) {
          if (source[scanned++] === "\n") {
            line++;
            lineStart = scanned;
          }
        }
        const value = piece[0];
        let type = names[range.type] || "punctuation";
        if (!["s", "c", "n", "e"].includes(range.type)) {
          if ("(){}[]|".includes(value)) type = "bracket";
          else if (value === "," || value === ":" || value === ".")
            type = "punctuation";
          else if (word.test(value) && range.type !== "k")
            type = upper.test(value) ? "enumMember" : "variable";
        }
        all.push({
          start,
          end,
          type,
          modifiers: [],
          // Literal spelling must never participate in grammar lookahead. Keep
          // its original extent and category; interpolation expressions retain
          // their real tokens and are walked in the enclosing binding scope.
          text: ["s", "n", "e"].includes(range.type) ? "\0" : value,
          line,
          column: start - lineStart,
        });
      }
    }
    const ts = all.filter((t) => t.type !== "comment");
    let pos = 0,
      depth = 0;
    const root = { parent: null, bindings: new Map() };
    function scope(parent) {
      return { parent, bindings: new Map() };
    }
    function lookup(s, name) {
      for (; s; s = s.parent)
        if (s.bindings.has(name)) return s.bindings.get(name);
      return null;
    }
    function mark(t, type, declaration = false) {
      if (t && t.text !== "\0") {
        t.type = type;
        t.modifiers = declaration ? ["declaration"] : [];
      }
    }
    function bind(s, t, shape, role = "variable") {
      mark(t, role, role === "type");
      s.bindings.set(t.text, { ...shape, role });
    }
    function at(value) {
      return ts[pos]?.text === value;
    }
    function take(value) {
      if (at(value)) return ts[pos++];
      return null;
    }
    function boundary(t, base) {
      return (
        t &&
        t.line > base.line &&
        t.column <= base.column &&
        source.slice(ts[pos - 1]?.end ?? 0, t.start).includes("\n")
      );
    }
    function shapeOf(entry) {
      return typeof entry === "string" ? { kind: entry } : entry || variable;
    }
    function own(object, key) {
      return object && Object.hasOwn(object, key) ? object[key] : undefined;
    }
    function member(shape, name) {
      if (shape?.module) {
        const module = own(modules, shape.module);
        return shapeOf(own(module?.exports || module, name));
      }
      return own(shape?.fields, name) || variable;
    }
    function reference(t, s) {
      const found = lookup(s, t.text);
      if (found) {
        mark(
          t,
          found.role === "parameter" ? "parameter" : found.kind || "variable",
        );
        return found;
      }
      if (own(modules, t.text)) {
        const kind = own(moduleKinds, t.text) || "namespace";
        mark(t, kind);
        return { kind, module: t.text };
      }
      if (upper.test(t.text)) {
        mark(t, "enumMember");
        return { kind: "enumMember" };
      }
      return variable;
    }
    function annotation(base) {
      let result = variable,
        nesting = 0;
      const containers = [];
      while (pos < ts.length) {
        const t = ts[pos];
        if (
          nesting === 0 &&
          (t.text === "=" ||
            boundary(t, base) ||
            (t.text === base.text && ts[pos + 1]?.text === "="))
        )
          break;
        pos++;
        if (nesting === 0 && (t.text === "->" || t.text === "=>")) result = fn;
        if (word.test(t.text) && t.type !== "keyword")
          mark(
            t,
            upper.test(t.text)
              ? containers.at(-1) === "["
                ? "enumMember"
                : "type"
              : ts[pos]?.text === ":"
                ? "property"
                : "typeParameter",
          );
        if ("([{".includes(t.text)) {
          nesting++;
          containers.push(t.text);
        }
        if (")]}".includes(t.text)) {
          if (!nesting) {
            pos--;
            break;
          }
          nesting--;
          containers.pop();
        }
      }
      return result;
    }
    function pattern(s, role, stop, base = null, shape = variable) {
      // Patterns are user input too: use an explicit stack so deeply nested
      // destructuring does not consume the browser's JavaScript call stack.
      const frames = [{ stop, closer: null, shape }];
      while (pos < ts.length && frames.length) {
        const frame = frames.at(-1),
          next = ts[pos];
        if (frame.stop.includes(next.text)) {
          frames.pop();
          if (frame.closer) take(frame.closer);
          continue;
        }
        if (
          base &&
          boundary(next, base) &&
          (frames.length === 1 || ts[pos + 1]?.text === "=")
        )
          break;
        const t = ts[pos++];
        if (["{", "(", "["].includes(t.text)) {
          const closer = { "{": "}", "(": ")", "[": "]" }[t.text];
          frames.push({ stop: [closer], closer, shape: variable });
        } else if (
          word.test(t.text) &&
          t.type !== "keyword" &&
          t.text !== "_"
        ) {
          if (upper.test(t.text)) mark(t, "enumMember");
          else if (at(":")) {
            mark(t, "property");
            pos++;
            frames.push({
              stop: [",", "}", ")", "]", ...stop],
              closer: null,
              shape: variable,
            });
          } else
            bind(
              s,
              t,
              frame.shape,
              role === "variable" && frame.shape.kind === "function"
                ? "function"
                : role,
            );
        }
      }
    }
    function lambda(s, base) {
      const child = scope(s);
      pos++;
      pattern(child, "parameter", ["|", "}"], base);
      if (!take("|")) return fn;
      const result = expression(child, ts[pos] || base);
      return { kind: "function", result };
    }
    function recordOrBlock(s, base, forceBlock = false) {
      pos++;
      const child = scope(s),
        fields = Object.create(null);
      // A leading field assignment/colon or a comma identifies a record. Empty
      // braces need no bindings and work for either structural interpretation.
      let declaration = false,
        nesting = 0;
      for (let i = pos; i < ts.length; i++) {
        const text = ts[i].text;
        if (nesting === 0 && [",", "}"].includes(text)) break;
        if (nesting === 0 && text === "=") {
          declaration = true;
          break;
        }
        if ("([{".includes(text)) nesting++;
        else if (")]}".includes(text)) nesting--;
      }
      const record =
        !declaration &&
        ts[pos] &&
        (ts[pos + 1]?.text === ":" ||
          ts[pos]?.text === ".." ||
          ts[pos + 1]?.text === "," ||
          (!forceBlock && ts[pos + 1]?.text === "}"));
      if (record) {
        while (pos < ts.length && !at("}")) {
          const before = pos,
            t = ts[pos++];
          if (word.test(t.text)) {
            mark(t, "property");
            fields[t.text] = take(":")
              ? expression(child, ts[pos] || t)
              : lookup(s, t.text) || variable;
          } else if (t.text === "..") expression(child, ts[pos] || t);
          take(",");
          if (pos === before) pos++;
        }
      } else {
        const result = sequence(child, "}");
        take("}");
        return result;
      }
      take("}");
      return { kind: "variable", fields };
    }
    function match(s, base) {
      pos++;
      const scrutinee = expression(s, ts[pos] || base, ["{"]);
      if (!take("{")) return variable;
      while (pos < ts.length && !at("}")) {
        const before = pos,
          child = scope(s);
        pattern(child, "variable", ["=>", "if", "}"], null, scrutinee);
        if (take("if")) expression(child, ts[pos] || base, ["=>"]);
        if (take("=>")) expression(child, ts[pos] || base);
        take(",");
        if (pos === before) pos++;
      }
      take("}");
      return variable;
    }
    function atom(s, base, forceBlock = false) {
      const t = ts[pos];
      if (!t) return variable;
      if (t.type === "string") {
        pos++;
        const opening = source.slice(t.start, t.end);
        // Character literals are atomic. Quoted and multiline strings have
        // multiple lexer spans, and interpolation is part of this same atom.
        if (opening !== '"' && opening !== "\\\\") return variable;
        const quoted = opening === '"';
        let line = t.line;
        while (pos < ts.length) {
          if (at("${")) {
            pos++;
            while (pos < ts.length && !at("}")) {
              const before = pos;
              expression(s, ts[pos], ["}"]);
              if (pos === before) pos++;
            }
            take("}");
            line = ts[pos - 1]?.line ?? line;
            continue;
          }
          const part = ts[pos];
          if (!["string", "error"].includes(part.type)) break;
          const spelling = source.slice(part.start, part.end);
          if (part.line > line && (quoted || spelling !== "\\\\")) break;
          pos++;
          line = part.line;
          if (quoted && spelling === '"') break;
        }
        return variable;
      }
      if (t.text === "|") return lambda(s, base);
      if (t.text === "{") return recordOrBlock(s, base, forceBlock);
      if (t.text === "match") return match(s, base);
      if (t.text === "if") {
        pos++;
        expression(s, ts[pos] || base, ["{"]);
        const result = expression(s, ts[pos] || base, ["else"], true);
        if (take("else")) expression(s, ts[pos] || base, [], true);
        return result;
      }
      if (t.text === "for") {
        pos++;
        const child = scope(s);
        pattern(child, "variable", ["in", "}"]);
        if (take("in")) expression(s, ts[pos] || base, ["{"]);
        if (take("{")) {
          sequence(child, "}");
          take("}");
        }
        return variable;
      }
      pos++;
      if (t.text === "(" || t.text === "[") {
        const close = t.text === "(" ? ")" : "]";
        let shape = variable;
        while (pos < ts.length && !at(close)) {
          const before = pos;
          shape = expression(s, ts[pos]);
          take(",");
          if (pos === before) pos++;
        }
        take(close);
        return shape;
      }
      if (word.test(t.text) && t.type !== "keyword") return reference(t, s);
      return variable;
    }
    function expression(s, base, extraStops = [], forceBlock = false) {
      if (!base || depth++ > 160) {
        depth--;
        return variable;
      }
      let shape = atom(s, base, forceBlock);
      let binary = false;
      while (pos < ts.length) {
        const t = ts[pos];
        if (
          [",", ")", "]", "}", "=>", "=", "else", ...extraStops].includes(
            t.text,
          ) ||
          boundary(t, base)
        )
          break;
        if (t.text === "." && word.test(ts[pos + 1]?.text || "")) {
          pos++;
          const name = ts[pos++];
          const namespace = shape.module;
          shape = member(shape, name.text);
          mark(name, namespace && shape !== variable ? shape.kind : "property");
          if (at("(") && name.end === ts[pos].start) mark(name, "function");
        } else if (t.text === "(" && ts[pos - 1]?.end === t.start) {
          const previous = ts[pos - 1];
          if (previous && previous.type === "variable")
            mark(previous, "function");
          pos++;
          while (pos < ts.length && !at(")")) {
            const before = pos;
            expression(s, ts[pos]);
            take(",");
            if (pos === before) pos++;
          }
          take(")");
          shape = shape.result || variable;
        } else if (t.text === ":") {
          pos++;
          annotation(base);
        } else if (t.type === "operator" || ["and", "or"].includes(t.text)) {
          pos++;
          shape = atom(s, ts[pos] || base);
          binary = true;
        } else break;
      }
      depth--;
      return binary ? variable : shape;
    }
    function imports(s, base) {
      pos++;
      const start = ts[pos];
      let moduleName = "";
      while (
        pos < ts.length &&
        !boundary(ts[pos], base) &&
        !["as", "exposing"].includes(ts[pos].text)
      ) {
        const t = ts[pos++];
        if (word.test(t.text)) {
          mark(t, "namespace");
          moduleName += (moduleName ? "." : "") + t.text;
        }
      }
      const alias = take("as") ? ts[pos++] : start;
      if (alias)
        bind(s, alias, { kind: "namespace", module: moduleName }, "namespace");
      if (take("exposing")) {
        const close = take("[") ? "]" : take("(") ? ")" : null;
        while (
          pos < ts.length &&
          (!close || !at(close)) &&
          !boundary(ts[pos], base)
        ) {
          const t = ts[pos++];
          if (word.test(t.text)) {
            const shape = member({ module: moduleName }, t.text);
            bind(s, t, shape, shape.kind);
          }
        }
        if (close) take(close);
      }
    }
    function sequence(s, close) {
      let result = variable;
      while (pos < ts.length && !at(close)) {
        const before = pos,
          t = ts[pos];
        if (t.text === "import") imports(s, t);
        else if (t.text === "var" && word.test(ts[pos + 1]?.text || "")) {
          pos++;
          const name = ts[pos++];
          take("=");
          const shape = expression(s, ts[pos] || name);
          bind(s, name, shape);
        } else if (
          ["{", "[", "("].includes(t.text) &&
          patternDeclarationEnd(pos) !== null
        ) {
          pattern(s, "variable", ["="]);
          if (take("=")) expression(s, ts[pos] || t);
        } else if (
          upper.test(t.text) &&
          ts[pos + 1]?.text === "(" &&
          typeDeclarationEnd(pos) !== null
        ) {
          bind(s, t, { kind: "type" }, "type");
          pos += 2;
          while (pos < ts.length && !at(")")) {
            const parameter = ts[pos++];
            if (word.test(parameter.text)) mark(parameter, "typeParameter");
          }
          take(")");
          pos++;
          annotation(t);
        } else if (
          word.test(t.text) &&
          ["=", ":", ":=", "::"].includes(ts[pos + 1]?.text)
        ) {
          pos++;
          const separator = ts[pos++].text;
          if (upper.test(t.text)) {
            bind(s, t, { kind: "type" }, "type");
            annotation(t);
          } else {
            let shape = separator === ":" ? annotation(t) : variable;
            if (separator === "=" || take("=")) {
              // A declaration is not visible in its own RHS except a lambda,
              // whose identity can be known before walking its body.
              if (at("|")) bind(s, t, fn);
              shape = expression(s, ts[pos] || t);
            }
            bind(
              s,
              t,
              shape,
              shape.kind === "function" ? "function" : "variable",
            );
          }
        } else result = expression(s, t);
        take(",");
        if (pos === before) pos++;
      }
      return result;
    }
    function typeDeclarationEnd(start) {
      let nesting = 0;
      for (let i = start + 1; i < ts.length; i++) {
        if (ts[i].text === "(") nesting++;
        else if (ts[i].text === ")" && --nesting === 0)
          return [":", ":=", "::"].includes(ts[i + 1]?.text) ? i : null;
      }
      return null;
    }
    function patternDeclarationEnd(start) {
      let nesting = 0;
      for (let i = start; i < ts.length; i++) {
        if ("([{".includes(ts[i].text)) nesting++;
        else if (")]}".includes(ts[i].text)) {
          if (--nesting === 0) return ts[i + 1]?.text === "=" ? i : null;
        }
      }
      return null;
    }
    // Module-level functions may be referenced before their declaration.
    let nesting = 0;
    for (let i = 0; i < ts.length - 2; i++) {
      const t = ts[i];
      if ("([{".includes(t.text)) nesting++;
      if (")]}".includes(t.text)) nesting--;
      if (
        !nesting &&
        word.test(t.text) &&
        ts[i + 1].text === "=" &&
        ts[i + 2].text === "|"
      )
        root.bindings.set(t.text, { kind: "function", role: "function" });
    }
    sequence(root, null);
    return all.map(({ start, end, type, modifiers }) => ({
      start,
      end,
      type,
      modifiers,
    }));
  };
})(globalThis);
