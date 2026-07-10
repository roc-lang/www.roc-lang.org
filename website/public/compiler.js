// main.js — Roc interactive examples
"use strict";

const decode = (bytes) => new TextDecoder().decode(bytes);
const encode = (str) => new TextEncoder().encode(str);
const WASM_URL = "/echo.wasm";

// All null until the user clicks "Run" for the first time.

let mod = null; // WebAssembly.Module
let inst = null; // WebAssembly.Instance
let mem = null; // WebAssembly.Memory
let loading = null; // Promise | null — guards against concurrent loads
let preloading = null; // Promise<WebAssembly.Module> | null

// Every run creates a fresh { out, err } object
// and stashes it here so the import callbacks can write into it.
let capture = null;

// Build a fresh imports object (needed for initial load & re-instantiation).
function imports() {
  return {
    env: {
      js_echo(ptr, len) {
        if (capture) {
          const slice = new Uint8Array(mem.buffer, ptr, len);
          capture.out += decode(slice);
        }
      },
      js_stderr(ptr, len) {
        if (capture) {
          const slice = new Uint8Array(mem.buffer, ptr, len);
          capture.err += decode(slice);
        }
      },
    },
  };
}

async function instantiateCompiler(module) {
  const instance = await WebAssembly.instantiate(module, imports());
  mod = module;
  inst = instance;
  mem = instance.exports.memory;
  inst.exports.init();
}

async function compileCompiler() {
  const response = await fetch(WASM_URL, { priority: "low" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${WASM_URL}`);
  }
  if (WebAssembly.compileStreaming) {
    return WebAssembly.compileStreaming(response);
  }
  return WebAssembly.compile(await response.arrayBuffer());
}

function preloadCompiler() {
  if (mod) return Promise.resolve(mod);
  if (preloading) return preloading;

  preloading = compileCompiler()
    .then((module) => {
      mod = module;
      return module;
    })
    .finally(() => {
      preloading = null;
    });

  preloading.catch(() => {});
  return preloading;
}

async function load() {
  if (inst) return; // already loaded
  if (loading) return loading; // another click is loading it

  loading = (async () => {
    const module = mod || await preloadCompiler();
    await instantiateCompiler(module);
  })();

  try {
    await loading;
  } finally {
    loading = null;
  }
}

async function recover() {
  try {
    const instance = await WebAssembly.instantiate(mod, imports());
    inst = instance;
    mem = instance.exports.memory;
    inst.exports.init();
  } catch (_) {
    // best-effort — if recovery fails the next run will show the error
  }
}

function htmlEscape(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const ANSI_COLOR_CLASSES = "c e n k k k n v".split(" ");

function ansi(text) {
  let bold = false;
  let dim = false;
  let italic = false;
  let underline = false;
  let fg = "";

  const classes = () => {
    const result = [];
    if (bold) result.push("b");
    if (dim) result.push("m");
    if (italic) result.push("i");
    if (underline) result.push("x");
    if (fg) result.push(fg);
    return result.join(" ");
  };

  const span = (chunk) => {
    if (!chunk) return "";
    const cls = classes();
    const escaped = htmlEscape(chunk);
    return cls ? `<span class="${cls}">${escaped}</span>` : escaped;
  };

  const applySgr = (body) => {
    for (const code of (body || "0").split(";").map(Number)) {
      if (code === 0) {
        bold = dim = italic = underline = false;
        fg = "";
      } else if (code === 1) {
        bold = true;
      } else if (code === 2) {
        dim = true;
      } else if (code === 3) {
        italic = true;
      } else if (code === 4) {
        underline = true;
      } else if (code === 22) {
        bold = dim = false;
      } else if (code === 23) {
        italic = false;
      } else if (code === 24) {
        underline = false;
      } else if (code === 39) {
        fg = "";
      } else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
        fg = ANSI_COLOR_CLASSES[code % 10];
      }
    }
  };

  let html = "";
  let index = 0;
  while (index < text.length) {
    const esc = text.indexOf("\x1b[", index);
    if (esc === -1) {
      html += span(text.slice(index));
      break;
    }

    html += span(text.slice(index, esc));
    const end = text.indexOf("m", esc + 2);
    if (end === -1) {
      html += htmlEscape(text.slice(esc));
      break;
    }

    const body = text.slice(esc + 2, end);
    if (/^[0-9;]*$/.test(body)) {
      applySgr(body);
    } else {
      html += htmlEscape(text.slice(esc, end + 1));
    }
    index = end + 1;
  }
  return html;
}

function terminal(text) {
  return `<pre class="roc-terminal">${ansi(text)}</pre>`;
}

const CL = [null, "u", "v", "n", "s", "k", "p", "d", "o", "e", "c"];
const M = 15, X = 16, A = 32, N = 64, B = 128, G = 256, H = 512;
const Z = 0, ER = 9, EE = 25, U = 17, L = 82, NUM = 19, S = 4, SE = 20;
const K = 5, KE = 21, P = 6, PE = 22, F = 38, D = 7, DE = 23, O = 8;
const OF = 40, CO = 520, DL = 210, DU = 145, DN = 147, DO = 136;
const DER = 153, DD = 264, CM = 10;

const TWO_BYTE_TOKENS = {
  0x213d: O, // !=
  0x3f3f: O, // ??
  0x7c3e: O, // |>
  0x2f2f: O, // //
  0x3e3d: O, // >=
  0x3c3d: O, // <=
  0x3c2d: OF, // <-
  0x3d3d: O, // ==
  0x3d3e: O, // =>
  0x3a3d: O, // :=
  0x3a3a: O, // ::
};

const ONE_BYTE_TOKENS = {
  33: O, // !
  38: OF, // &
  44: F, // ,
  63: O, // ?
  124: O, // |
  43: O, // +
  42: O, // *
  47: O, // /
  37: O, // %
  94: O, // ^
  62: O, // >
  60: O, // <
  61: O, // =
  58: CO, // :
  40: P, // (
  91: D, // [
  123: F, // {
  41: PE, // )
  93: DE, // ]
};

const KWDS =
  /^(app|as|crash|dbg|else|expect|exposes|exposing|for|generates|has|hosted|if|implements|import|imports|in|interface|match|module|package|packages|platform|provides|requires|return|targets|var|where|while|with|break)$/;
const SUF =
  /^(dec|f32|f64|i128|i16|i32|i64|i8|nat|u128|u16|u32|u64|u8)$/;

function tokenError(tok) {
  return (tok & M) === ER;
}

function keepError(tok, next) {
  return tokenError(tok) ? tok : next;
}

function lo(c) {
  return c >= 97 && c <= 122;
}

function up(c) {
  return c >= 65 && c <= 90;
}

function dig(c) {
  return c >= 48 && c <= 57;
}

function hex(c) {
  return dig(c) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);
}

function u8len(c) {
  if (c < 0x80) return 1;
  if (c >= 0xc2 && c <= 0xdf) return 2;
  if (c >= 0xe0 && c <= 0xef) return 3;
  if (c >= 0xf0 && c <= 0xf4) return 4;
  return null;
}

function validCp(codepoint) {
  return codepoint <= 0x10ffff && !(codepoint >= 0xd800 && codepoint <= 0xdfff);
}

class RocTokenizer {
  constructor(text) {
    this.b = encode(text);
    this.p = 0;
    this.t = [];
    this.s = [];
  }

  pk() {
    return this.p < this.b.length ? this.b[this.p] : null;
  }

  at(lookahead) {
    const idx = this.p + lookahead;
    return idx < this.b.length ? this.b[idx] : null;
  }

  inRange(lookahead, start, end) {
    const peeked = this.at(lookahead);
    return peeked != null && peeked >= start && peeked <= end;
  }

  trivia() {
    while (this.p < this.b.length) {
      const b = this.b[this.p];
      if (b === 32 || b === 9 || b === 10) {
        this.p += 1;
      } else if (b === 13) {
        this.p += 1;
        if (this.p < this.b.length && this.b[this.p] === 10) {
          this.p += 1;
        }
      } else if (b === 35) {
        const start = this.p;
        this.p += 1;
        while (
          this.p < this.b.length &&
          this.b[this.p] !== 10 &&
          this.b[this.p] !== 13
        ) {
          this.p += 1;
        }
        this.t.push([CM, start, this.p]);
      } else if (b >= 0 && b <= 31) {
        this.p += 1;
      } else {
        break;
      }
    }
  }

  number() {
    const initialDigit = this.b[this.p];
    this.p += 1;

    let tok = NUM;
    if (initialDigit === 48) {
      while (true) {
        const c = this.pk() ?? 0;
        if (c === 120 || c === 88) {
          this.p += 1;
          if (!this.int16()) {
            tok = EE;
          }
          tok = this.suffix(tok);
          break;
        } else if (c === 111 || c === 79) {
          this.p += 1;
          if (!this.int8()) {
            tok = EE;
          }
          tok = this.suffix(tok);
          break;
        } else if (c === 98 || c === 66) {
          this.p += 1;
          if (!this.int2()) {
            tok = EE;
          }
          tok = this.suffix(tok);
          break;
        } else if (dig(c)) {
          tok = this.num10();
          tok = this.suffix(tok);
          break;
        } else if (c === 95) {
          this.p += 1;
        } else if (c === 46) {
          this.p -= 1;
          tok = this.num10();
          tok = this.suffix(tok);
          break;
        } else {
          tok = this.suffix(tok);
          break;
        }
      }
    } else {
      tok = this.num10();
      tok = this.suffix(tok);
    }
    return tok;
  }

  exp() {
    const c = this.pk() ?? 0;
    if (c === 101 || c === 69) {
      this.p += 1;
      const sign = this.pk() ?? 0;
      if (sign === 43 || sign === 45) {
        this.p += 1;
      }
      if (!this.int10()) {
        return "EmptyExponent";
      }
      return true;
    }
    return false;
  }

  suffix(hypothesis) {
    const c = this.pk();
    if (c == null) {
      return hypothesis;
    }
    const isIdentChar =
      lo(c) ||
      up(c) ||
      dig(c) ||
      c === 95 ||
      c === 36 ||
      c >= 0x80;
    if (!isIdentChar) {
      return hypothesis;
    }

    const start = this.p;
    if (!this.ident()) {
      return keepError(hypothesis, EE);
    }
    const suffix = decode(this.b.subarray(start, this.p));
    if (!SUF.test(suffix)) {
      return keepError(hypothesis, EE);
    }
    return hypothesis;
  }

  num10() {
    let tokenType = NUM;
    this.int10();
    if (
      (this.pk() ?? 0) === 46 &&
      (this.inRange(1, 48, 57) ||
        this.at(1) === 101 ||
        this.at(1) === 69)
    ) {
      this.p += 1;
      this.int10();
      tokenType = NUM;
    }

    const hasExponent = this.exp();
    if (hasExponent === "EmptyExponent") {
      return EE;
    }
    if (hasExponent) {
      tokenType = NUM;
    }
    return tokenType;
  }

  int10() {
    let containsDigits = false;
    while (this.pk() != null) {
      const c = this.pk();
      if (dig(c)) {
        containsDigits = true;
        this.p += 1;
      } else if (c === 95) {
        this.p += 1;
      } else {
        break;
      }
    }
    return containsDigits;
  }

  int16() {
    let containsDigits = false;
    while (this.pk() != null) {
      const c = this.pk();
      if (hex(c)) {
        containsDigits = true;
        this.p += 1;
      } else if (c === 95) {
        this.p += 1;
      } else {
        break;
      }
    }
    return containsDigits;
  }

  int8() {
    let containsDigits = false;
    while (this.pk() != null) {
      const c = this.pk();
      if (c >= 48 && c <= 55) {
        containsDigits = true;
        this.p += 1;
      } else if (c === 95) {
        this.p += 1;
      } else {
        break;
      }
    }
    return containsDigits;
  }

  int2() {
    let containsDigits = false;
    while (this.pk() != null) {
      const c = this.pk();
      if (c === 48 || c === 49) {
        containsDigits = true;
        this.p += 1;
      } else if (c === 95) {
        this.p += 1;
      } else {
        break;
      }
    }
    return containsDigits;
  }

  lower() {
    const start = this.p;
    if (!this.ident()) {
      return EE;
    }
    const ident = decode(this.b.subarray(start, this.p));
    if (ident === "and" || ident === "or") {
      return O;
    }
    return KWDS.test(ident) ? K : L;
  }

  ident() {
    let valid = true;
    while (this.p < this.b.length) {
      const c = this.b[this.p];
      if (
        lo(c) ||
        up(c) ||
        dig(c) ||
        c === 95 ||
        c === 33 ||
        c === 36
      ) {
        this.p += 1;
      } else if (c >= 0x80) {
        valid = false;
        this.p += 1;
      } else {
        break;
      }
    }
    return valid;
  }

  integer() {
    while (this.p < this.b.length && dig(this.b[this.p])) {
      this.p += 1;
    }
  }

  escape(quoteChar) {
    const c = this.pk() ?? 0;

    if (c === 92 || c === 34 || c === 39 || c === 110 || c === 114 || c === 116 || c === 36) {
      this.p += 1;
      return true;
    }

    if (c === 117) {
      this.p += 1;
      if (this.pk() === 40) {
        this.p += 1;
      } else {
        return "InvalidUnicodeEscapeSequence";
      }

      const hexStart = this.p;
      while (true) {
        if (this.pk() === 41) {
          if (this.p === hexStart) {
            this.p += 1;
            return "InvalidUnicodeEscapeSequence";
          }
          this.p += 1;
          break;
        } else if (this.pk() != null) {
          const next = this.pk();
          if (hex(next)) {
            this.p += 1;
          } else {
            while (this.p < this.b.length) {
              const nextChar = this.pk() ?? 0;
              if (nextChar === 41 || nextChar === 10) {
                break;
              }
              if (quoteChar != null && nextChar === quoteChar) {
                break;
              }
              this.p += 1;
            }
            if (this.p < this.b.length && this.pk() === 41) {
              this.p += 1;
            }
            return "InvalidUnicodeEscapeSequence";
          }
        } else {
          return "InvalidUnicodeEscapeSequence";
        }
      }

      const hexCode = decode(this.b.subarray(hexStart, this.p - 1));
      const codepoint = Number.parseInt(hexCode, 16);
      if (!Number.isFinite(codepoint) || !validCp(codepoint)) {
        return "InvalidUnicodeEscapeSequence";
      }

      return true;
    }

    return "InvalidEscapeSequence";
  }

  single() {
    this.p += 1;
    let state = "Empty";

    while (this.p < this.b.length) {
      const c = this.b[this.p];
      if (c === 10) {
        break;
      }

      this.p += 1;

      if (state === "Empty") {
        if (c === 39) {
          return EE;
        }
        if (c === 92) {
          state = "Enough";
          if (this.escape(39) !== true) {
            state = "Invalid";
          }
        } else {
          this.p -= 1;
          this.utf8();
          state = "Enough";
        }
      } else if (state === "Enough") {
        if (c === 39) {
          return SE;
        }
        state = "TooLong";
      } else if (state === "TooLong") {
        if (c === 39) {
          return EE;
        }
      } else if (state === "Invalid" && c === 39) {
        return EE;
      }
    }

    return EE;
  }

  utf8() {
    const c = this.b[this.p];

    if (c < 0x80) {
      this.p += 1;
      return c;
    }

    const utf8Len = u8len(c);
    if (utf8Len == null || this.p + utf8Len > this.b.length) {
      this.p += 1;
      return null;
    }

    let codepoint;
    if (utf8Len === 2) {
      codepoint = ((c & 0x1f) << 6) | (this.b[this.p + 1] & 0x3f);
    } else if (utf8Len === 3) {
      codepoint =
        ((c & 0x0f) << 12) |
        ((this.b[this.p + 1] & 0x3f) << 6) |
        (this.b[this.p + 2] & 0x3f);
    } else {
      codepoint =
        ((c & 0x07) << 18) |
        ((this.b[this.p + 1] & 0x3f) << 12) |
        ((this.b[this.p + 2] & 0x3f) << 6) |
        (this.b[this.p + 3] & 0x3f);
    }

    this.p += utf8Len;
    return codepoint;
  }
  last() {
    for (let i = this.t.length - 1; i >= 0; i -= 1) {
      const tag = this.t[i][0];
      if (tag !== CM) return tag;
    }
    return null;
  }

  push(tag, start) {
    this.t.push([tag, start, this.p]);
  }

  symbol(start, b) {
    const next = this.at(1);
    if (next != null) {
      const pairTag = TWO_BYTE_TOKENS[(b << 8) | next];
      if (pairTag != null) {
        this.p += 2;
        this.push(pairTag, start);
        return true;
      }
    }

    const tag = ONE_BYTE_TOKENS[b];
    if (tag != null) {
      this.p += 1;
      this.push(tag, start);
      return true;
    }

    return false;
  }

  tokenize() {
    let sawWhitespace = true;

    while (this.p < this.b.length) {
      const start = this.p;
      const sp = sawWhitespace;
      sawWhitespace = false;
      const b = this.b[this.p];

      if (b <= 32 || b === 35) {
        this.trivia();
        sawWhitespace = true;
      } else if (b === 46) {
        this.dot(start, sp);
      } else if (b === 45) {
        this.minus(start, sp);
      } else if (b === 92) {
        if (this.at(1) === 92) {
          this.multiline();
        } else {
          this.p += 1;
          this.push(O, start);
        }
      } else if (b === 125) {
        this.p += 1;
        if (this.s.length > 0) {
          const last = this.s.pop();
          this.push(KE, start);
          this.stringBody(last);
        } else {
          this.push(PE, start);
        }
      } else if (this.symbol(start, b)) {
        continue;
      } else if (b === 95) {
        this.under(start);
      } else if (b === 64) {
        this.opaque(start);
      } else if (b === 36) {
        this.dollar(start);
      } else if (dig(b)) {
        const tag = this.number();
        this.push(tag, start);
      } else if (lo(b)) {
        const tag = this.lower();
        this.push(tag, start);
      } else if (up(b)) {
        let tag = U;
        if (!this.ident()) {
          tag = EE;
        }
        this.push(tag, start);
      } else if (b === 39) {
        const tag = this.single();
        this.push(tag, start);
      } else if (b === 34) {
        this.string();
      } else if (b >= 0x80) {
        this.ident();
        this.push(EE, start);
      } else {
        this.p += 1;
        this.push(ER, start);
      }
    }

    this.push(Z, this.p);
    return {
      t: this.t,
      b: this.b,
    };
  }

  dot(start, sp) {
    const next = this.at(1);
    if (next == null) {
      this.p += 1;
      this.push(P, start);
    } else if (next === 46) {
      if (this.at(2) === 46) {
        this.p += 3;
        this.push(P, start);
      } else if (this.at(2) === 60) {
        this.p += 3;
        this.push(DD, start);
      } else if (this.at(2) === 61) {
        this.p += 3;
        this.push(DD, start);
      } else {
        this.p += 2;
        this.push(P, start);
      }
    } else if (dig(next)) {
      this.p += 1;
      this.integer();
      this.push(DN, start);
    } else if (lo(next)) {
      let tag = DL;
      this.p += 1;
      if (!this.ident()) {
        tag = DER;
      }
      this.push(tag, start);
    } else if (up(next)) {
      let tag = DU;
      this.p += 1;
      if (!this.ident()) {
        tag = DER;
      }
      this.push(tag, start);
    } else if (next >= 0x80 && next <= 0xff) {
      this.p += 1;
      this.ident();
      this.push(DER, start);
    } else if (next === 123) {
      this.p += 1;
      this.push(P, start);
    } else if (next === 42) {
      this.p += 2;
      this.push(DO, start);
    } else {
      this.p += 1;
      this.push(P, start);
    }
  }

  minus(start, sp) {
    const next = this.at(1);
    if (next == null) {
      this.p += 1;
      this.push(O, start);
    } else if (next === 62) {
      this.p += 2;
      this.push(O, start);
    } else if (next === 32 || next === 9 || next === 10 || next === 13 || next === 35) {
      this.p += 1;
      this.push(O, start);
    } else if (dig(next)) {
      const prev = this.last();
      if (!sp && prev != null && (prev & X) !== 0) {
        this.p += 1;
        this.push(O, start);
      } else {
        this.p += 1;
        const tag = this.number();
        this.push(tag, start);
      }
    } else {
      this.p += 1;
      this.push(O, start);
    }
  }

  under(start) {
    const next = this.at(1);
    if (next != null && (lo(next) || up(next) || dig(next))) {
      let tag = L;
      this.p += 2;
      if (!this.ident()) {
        tag = EE;
      }
      this.push(tag, start);
    } else {
      this.p += 1;
      this.push(Z, start);
    }
  }

  opaque(start) {
    let tok = U;
    const next = this.at(1);
    if (
      next != null &&
      (lo(next) || up(next) || dig(next) || next === 95 || next >= 0x80)
    ) {
      this.p += 1;
      if (!this.ident()) {
        tok = EE;
      }
    } else {
      tok = ER;
      this.p += 1;
    }
    this.push(tok, start);
  }

  dollar(start) {
    const next = this.at(1);
    if (next != null && lo(next)) {
      let tag = L;
      this.p += 1;
      if (!this.ident()) {
        tag = EE;
      }
      this.push(tag, start);
    } else if (next != null && up(next)) {
      let tag = U;
      this.p += 1;
      if (!this.ident()) {
        tag = EE;
      }
      this.push(tag, start);
    } else {
      this.p += 1;
      this.push(ER, start);
    }
  }

  string() {
    const start = this.p;
    this.p += 1;
    let kind = "single_line";
    if (this.pk() === 34 && this.at(1) === 34) {
      this.p += 2;
      kind = "multi_line";
      this.push(S, start);
    } else {
      this.push(S, start);
    }
    this.stringBody(kind);
  }

  multiline() {
    const start = this.p;
    this.p += 2;
    this.push(S, start);
    this.stringBody("multi_line");
  }

  stringBody(kind) {
    const start = this.p;
    let stringPartTag = S;
    while (this.p < this.b.length) {
      const c = this.b[this.p];
      if (c === 36 && this.at(1) === 123) {
        this.push(stringPartTag, start);
        const dollarStart = this.p;
        this.p += 2;
        this.push(K, dollarStart);
        this.s.push(kind);
        return;
      } else if (c === 10) {
        this.push(stringPartTag, start);
        if (kind === "single_line") {
          this.push(SE, this.p);
        }
        return;
      } else if (kind === "single_line" && c === 34) {
        this.push(stringPartTag, start);
        const stringPartEnd = this.p;
        this.p += 1;
        this.push(SE, stringPartEnd);
        return;
      } else {
        this.utf8();
        if (c === 92 && this.escape(34) !== true) {
          stringPartTag = ER;
        }
      }
    }
    this.push(stringPartTag, start);
  }
}

const ROC_HIGHLIGHT_TYPES = "u v n s k p d o e c f".split(" ");
const rocHighlightRoots = new Map();
const rocHighlightObjects = new Map();
let rocHighlightRootId = 0;

function byteOffsetsForText(text, bytes) {
  const offsets = new Array(bytes.length + 1);
  let byteIndex = 0;

  for (let index = 0; index < text.length;) {
    const codepoint = text.codePointAt(index);
    const codeUnits = codepoint > 0xffff ? 2 : 1;
    const bytesForCodepoint =
      codepoint <= 0x7f ? 1 :
      codepoint <= 0x7ff ? 2 :
      codepoint <= 0xffff ? 3 : 4;

    for (let i = 0; i < bytesForCodepoint; i += 1) {
      offsets[byteIndex + i] = index;
    }

    byteIndex += bytesForCodepoint;
    index += codeUnits;
  }

  offsets[byteIndex] = text.length;
  return offsets;
}

function rocTokenRanges(source) {
  const tokenized = new RocTokenizer(source).tokenize();
  const tokens = tokenized.t.filter(
    (token) => token[0] !== CM && token[1] !== token[2],
  );
  const fields = new Map();

  for (let i = 0; i < tokens.length; i += 1) {
    const previous = tokens[i - 1];
    const token = tokens[i];
    const next = tokens[i + 1];
    if (
      previous != null &&
      next != null &&
      (previous[0] & A) !== 0 &&
      (token[0] & N) !== 0 &&
      (next[0] & H) !== 0 &&
      decode(tokenized.b.subarray(token[2], next[1])).trim() === ""
    ) {
      fields.set(token[1], next[2]);
    }
  }

  const ranges = [];
  const offsets = byteOffsetsForText(source, tokenized.b);
  let lastEnd = 0;

  const add = (start, end, type) => {
    const textStart = offsets[start];
    const textEnd = offsets[end];
    if (textStart != null && textEnd != null && textStart < textEnd) {
      ranges.push({ type, start: textStart, end: textEnd });
    }
    lastEnd = end;
  };

  for (const token of tokenized.t) {
    const tag = token[0];
    let start = token[1];
    let end = token[2];
    if (start === end || start < lastEnd) {
      continue;
    }

    const fieldEnd = fields.get(start);
    let cls = fieldEnd == null ? CL[tag & M] : "f";
    if (cls == null) {
      continue;
    }

    if (fieldEnd != null) {
      end = fieldEnd;
    }

    if (fieldEnd == null && (tag & B) !== 0 && start + 1 < end) {
      add(start, start + 1, "p");
      add(start + 1, end, cls);
    } else if (fieldEnd == null && (tag & G) !== 0 && start + 2 < end) {
      add(start, start + 2, "p");
      add(start + 2, end, cls);
    } else {
      add(start, end, cls);
    }
  }

  return ranges;
}

function syncRocSyntaxHighlights() {
  if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") return;

  for (const type of ROC_HIGHLIGHT_TYPES) {
    const highlight = rocHighlightObjectForType(type);
    highlight.clear();

    for (const rootHighlights of rocHighlightRoots.values()) {
      for (const range of rootHighlights[type]) {
        highlight.add(range);
      }
    }
  }
}

function rocHighlightObjectForType(type) {
  let highlight = rocHighlightObjects.get(type);

  if (!highlight) {
    highlight = new Highlight();
    rocHighlightObjects.set(type, highlight);
    CSS.highlights.set(`roc-${type}`, highlight);
  }

  return highlight;
}

function resetRocHighlightObjects() {
  rocHighlightObjects.clear();

  for (const type of ROC_HIGHLIGHT_TYPES) {
    const highlight = new Highlight();
    rocHighlightObjects.set(type, highlight);
    CSS.highlights.set(`roc-${type}`, highlight);
  }
}

function addRocHighlightRoot(id, grouped) {
  removeRocHighlightRoot(id);
  rocHighlightRoots.set(id, grouped);

  for (const type of ROC_HIGHLIGHT_TYPES) {
    const highlight = rocHighlightObjectForType(type);
    for (const range of grouped[type]) {
      highlight.add(range);
    }
  }
}

function removeRocHighlightRoot(id) {
  const grouped = rocHighlightRoots.get(id);
  if (!grouped) return false;

  for (const type of ROC_HIGHLIGHT_TYPES) {
    const highlight = rocHighlightObjects.get(type);
    if (!highlight) continue;

    for (const range of grouped[type]) {
      highlight.delete(range);
    }
  }

  rocHighlightRoots.delete(id);
  return true;
}

function emptyRocHighlightGroups() {
  const grouped = {};
  for (const type of ROC_HIGHLIGHT_TYPES) {
    grouped[type] = [];
  }

  return grouped;
}

function rocHighlightContainer(container) {
  return container?.nodeType === Node.ELEMENT_NODE
    ? container
    : container?.documentElement ?? document.documentElement;
}

function ensureRocHighlightId(container) {
  const root = rocHighlightContainer(container);

  if (!root.dataset.rocHighlightId) {
    rocHighlightRootId += 1;
    root.dataset.rocHighlightId = String(rocHighlightRootId);
  }

  return root.dataset.rocHighlightId;
}

function addRocTextNodeHighlights(textNode, grouped) {
  for (const token of rocTokenRanges(textNode.nodeValue)) {
    const range = new Range();
    range.setStart(textNode, token.start);
    range.setEnd(textNode, token.end);
    grouped[token.type].push(range);
  }
}

function collectRocSyntaxHighlights(container, grouped) {
  const includeWholeContainer = container?.matches?.(".roc-highlight") ?? false;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (textNode) => {
      if (textNode.nodeValue.length === 0) return NodeFilter.FILTER_REJECT;
      if (includeWholeContainer) return NodeFilter.FILTER_ACCEPT;
      return textNode.parentElement?.closest?.(".roc-highlight")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  let textNode;
  let chars = 0;
  let textNodes = 0;

  while ((textNode = walker.nextNode())) {
    chars += textNode.nodeValue.length;
    textNodes += 1;
    addRocTextNodeHighlights(textNode, grouped);
  }

  return { chars, textNodes };
}

function rocHighlightRootCount(container) {
  let count = container?.matches?.(".roc-highlight") ? 1 : 0;
  count += container?.querySelectorAll?.(".roc-highlight").length ?? 0;
  return count;
}

function buildRocSyntaxHighlights(container) {
  if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") return { chars: 0, textNodes: 0 };

  const id = ensureRocHighlightId(container);
  const grouped = emptyRocHighlightGroups();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let textNode;
  let chars = 0;
  let textNodes = 0;

  while ((textNode = walker.nextNode())) {
    chars += textNode.nodeValue.length;
    textNodes += 1;
    addRocTextNodeHighlights(textNode, grouped);
  }

  addRocHighlightRoot(id, grouped);
  return { chars, textNodes };
}

function applyRocSyntaxHighlights(container) {
  buildRocSyntaxHighlights(container);
}

function clearRocSyntaxHighlights(container, sync = true) {
  if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") return;

  let changed = false;
  const clearOne = (element) => {
    const id = element?.dataset?.rocHighlightId;
    if (!id) return;

    if (sync) {
      removeRocHighlightRoot(id);
    } else {
      rocHighlightRoots.delete(id);
    }
    delete element.dataset.rocHighlightId;
    changed = true;
  };

  clearOne(rocHighlightContainer(container));
  container
    ?.querySelectorAll?.("[data-roc-highlight-id]")
    .forEach(clearOne);

  if (changed && !sync) {
    resetRocHighlightObjects();

    for (const rootHighlights of rocHighlightRoots.values()) {
      for (const type of ROC_HIGHLIGHT_TYPES) {
        const highlight = rocHighlightObjectForType(type);
        for (const range of rootHighlights[type]) {
          highlight.add(range);
        }
      }
    }
  }
}

function highlightRocSyntaxIn(container) {
  if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") return;

  const totalStart = performance.now();
  const rootElements = [];

  if (container?.matches?.(".roc-highlight")) {
    rootElements.push(container);
  }

  container
    ?.querySelectorAll?.(".roc-highlight")
    .forEach((root) => rootElements.push(root));

  if (rootElements.length === 0) return;

  const id = ensureRocHighlightId(container);
  const grouped = emptyRocHighlightGroups();
  const tokenizeStart = performance.now();
  const { chars, textNodes } = collectRocSyntaxHighlights(container, grouped);

  const tokenizingMs = performance.now() - tokenizeStart;

  const syncStart = performance.now();
  addRocHighlightRoot(id, grouped);
  const syncMs = performance.now() - syncStart;
  const totalMs = performance.now() - totalStart;

  // console.log(
  //   `[roc-highlight] roots=${rootElements.length} textNodes=${textNodes} chars=${chars} tokenize=${tokenizingMs.toFixed(1)}ms sync=${syncMs.toFixed(1)}ms total=${totalMs.toFixed(1)}ms`,
  // );
}

function highlightRocSyntaxNodes(nodes) {
  if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") return;

  const nodeList = Array.from(nodes ?? []);
  const containers = nodeList.filter((node) => node.nodeType === Node.ELEMENT_NODE);
  let rootCount = 0;

  for (const container of containers) {
    rootCount += rocHighlightRootCount(container);
  }

  if (rootCount === 0) return;

  const root = containers[0];
  const id = ensureRocHighlightId(root);
  const grouped = emptyRocHighlightGroups();
  const totalStart = performance.now();
  const tokenizeStart = performance.now();
  let chars = 0;
  let textNodes = 0;

  for (const container of containers) {
    const result = collectRocSyntaxHighlights(container, grouped);
    chars += result.chars;
    textNodes += result.textNodes;
  }

  const tokenizingMs = performance.now() - tokenizeStart;

  const syncStart = performance.now();
  addRocHighlightRoot(id, grouped);
  const syncMs = performance.now() - syncStart;
  const totalMs = performance.now() - totalStart;

  // console.log(
  //   `[roc-highlight] chunkNodes=${nodeList.length} roots=${rootCount} textNodes=${textNodes} chars=${chars} tokenize=${tokenizingMs.toFixed(1)}ms sync=${syncMs.toFixed(1)}ms total=${totalMs.toFixed(1)}ms`,
  // );
}

function rocSyntaxRootElements(container) {
  const rootElements = [];

  if (container?.matches?.(".roc-highlight")) {
    rootElements.push(container);
  }

  container
    ?.querySelectorAll?.(".roc-highlight")
    .forEach((root) => rootElements.push(root));

  return rootElements;
}

function unhighlightedRocSyntaxRootElements(container) {
  return rocSyntaxRootElements(container).filter(
    (root) => !root.dataset.rocHighlightId,
  );
}

function highlightFirstRocSyntaxRoots(container, limit = 32) {
  const rootElements = unhighlightedRocSyntaxRootElements(container);
  if (rootElements.length === 0) return;

  highlightRocSyntaxNodes(rootElements.slice(0, limit));
}

function highlightRocSyntaxProgressively(container, initialLimit = 32, batchSize = 64) {
  if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") return;

  const root = rocHighlightContainer(container);
  const rootElements = unhighlightedRocSyntaxRootElements(container);
  let index = 0;

  const highlightNext = (limit) => {
    if (!root.isConnected) return false;

    const batch = rootElements.slice(index, index + limit);
    index += batch.length;
    highlightRocSyntaxNodes(batch);
    return index < rootElements.length;
  };

  if (rootElements.length === 0) return;

  if (initialLimit > 0) {
    highlightNext(initialLimit);
  }

  const scheduleNext = () => {
    requestAnimationFrame(() => {
      if (highlightNext(batchSize)) {
        scheduleNext();
      }
    });
  };

  if (index < rootElements.length) {
    scheduleNext();
  }
}

window.rocSyntax = {
  highlight: highlightRocSyntaxIn,
  highlightNodes: highlightRocSyntaxNodes,
  highlightFirst: highlightFirstRocSyntaxRoots,
  highlightProgressively: highlightRocSyntaxProgressively,
  clear: clearRocSyntaxHighlights,
};

function setupHighlight(textarea, highlight) {
  const updateHighlight = () => {
    highlight.textContent = textarea.value || " ";
    applyRocSyntaxHighlights(highlight);
  };

  const syncScroll = () => {
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  };

  textarea.addEventListener("input", updateHighlight);
  textarea.addEventListener("scroll", syncScroll);

  updateHighlight();
  syncScroll();
}

function setup(div) {
  // The Run button is added statically in the markup (so it shows even before
  // this script loads). Pull it out before reading the source so its label
  // doesn't end up in the Roc code, then reuse it below.
  const runButton = div.querySelector("button.roc-run");
  runButton.remove();

  const source = div.textContent.trim();
  div.textContent = "";

  const textarea = document.createElement("textarea");
  textarea.value = source;
  textarea.rows = Math.min(source.split("\n").length + 2, 18);
  textarea.spellcheck = false;
  textarea.wrap = "off";
  textarea.className = "roc-source";

  const sourceEditor = document.createElement("div");
  sourceEditor.className = "roc-source-editor";

  const sourceHighlight = document.createElement("pre");
  sourceHighlight.className = "roc-source-highlight";
  sourceHighlight.setAttribute("aria-hidden", "true");

  // Keep Tab from leaving the textarea
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.target;
      const s = ta.selectionStart;
      ta.value = ta.value.slice(0, s) + "\t" + ta.value.slice(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = s + 1;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

  runButton.textContent = "Run \u25b6";

  const outputArea = document.createElement("div");
  outputArea.className = "roc-output";

  runButton.addEventListener("click", async () => {
    // ---- 1. lazy-load compiler on first click ----
    if (!inst) {
      outputArea.textContent = "Loading compiler\u2026";
      try {
        await load();
      } catch (err) {
        outputArea.textContent = "Could not load the Roc compiler: " + err;
        return;
      }
    }

    // ---- 2. prepare ----
    outputArea.textContent = "Running\u2026";
    outputArea.classList.add("running");
    runButton.disabled = true;

    const captured = { out: "", err: "" };
    capture = captured;
    let trapped = false;

    try {
      inst.exports.init();

      const encoded = encode(textarea.value);
      const ptr = inst.exports.allocateBuffer(encoded.length);
      if (!ptr) throw new Error("allocateBuffer returned null");
      new Uint8Array(mem.buffer, ptr, encoded.length).set(encoded);

      inst.exports.compileAndRun(ptr, encoded.length);
    } catch (err) {
      captured.err +=
        "\x1b[1;31mCompiler crashed\x1b[0m\n" + String(err) + "\n";
      trapped = true;
    }

    capture = null;

    // ---- 3. display results ----
    let html = "";
    if (captured.err) html += terminal(captured.err);
    if (captured.out) {
      html +=
        '<span class="roc-output-label">Output:\n</span>' +
        terminal(captured.out);
    }
    outputArea.innerHTML = html || "(no output)";
    outputArea.classList.remove("running");

    // ---- 4. recover from trap so later runs work ----
    if (trapped) await recover();

    runButton.disabled = false;
  });

  sourceEditor.appendChild(sourceHighlight);
  sourceEditor.appendChild(textarea);
  div.appendChild(sourceEditor);
  setupHighlight(textarea, sourceHighlight);
  div.appendChild(runButton);
  div.appendChild(outputArea);
}

// run the setup, when the DOM is finished loading
document.addEventListener("DOMContentLoaded", () => {
  const interactiveWidgets = document.querySelectorAll(".roc-interactive");
  interactiveWidgets.forEach(setup);

  const docsContent = document.querySelector("main > .main-content");
  const docsSearch = document.getElementById("module-search-form");
  if (docsContent) {
    highlightRocSyntaxProgressively(docsContent, 32, 64);
    if (docsSearch) {
      requestAnimationFrame(() => {
        highlightRocSyntaxProgressively(docsSearch, 0, 64);
      });
    }
  } else {
    highlightRocSyntaxProgressively(document, 32, 64);
  }

  if (interactiveWidgets.length > 0) preloadCompiler();
});
