// main.js — Roc interactive examples (lazy-loads compiler on first Run click)
"use strict";

const decode = (bytes) => new TextDecoder().decode(bytes);
const encode = (str) => new TextEncoder().encode(str);

// All null until the user clicks "Run" for the first time.

let mod = null; // WebAssembly.Module
let inst = null; // WebAssembly.Instance
let mem = null; // WebAssembly.Memory
let loading = null; // Promise | null — guards against concurrent loads

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

async function load() {
  if (inst) return; // already loaded
  if (loading) return loading; // another click is loading it

  loading = (async () => {
    const response = await fetch("echo.wasm", { priority: "low" });
    const { module, instance } = await WebAssembly.instantiateStreaming(
      response,
      imports(),
    );
    mod = module;
    inst = instance;
    mem = instance.exports.memory;
    inst.exports.init();
  })();

  await loading;
  loading = null;
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

const TOK_CLASS = [
  null,
  "u",
  "v",
  "n",
  "s",
  "k",
  "p",
  "d",
  "o",
  "e",
];
const C_MASK = 15;
const C_UPPER = 1;
const C_LOWER = 2;
const C_LITERAL = 3;
const C_STRING = 4;
const C_KEYWORD = 5;
const C_PUNCT = 6;
const C_DELIM = 7;
const C_OP = 8;
const C_ERROR = 9;
const F_EXPR_END = 16;
const F_FIELD_PREFIX = 32;
const F_FIELD_NAME = 64;
const F_DOT_PREFIX = 128;
const F_DOTDOT_PREFIX = 256;
const F_COLON = 512;

const T_NONE = 0;
const T_ERROR = C_ERROR;
const T_ERROR_END = C_ERROR | F_EXPR_END;
const T_UPPER = C_UPPER | F_EXPR_END;
const T_LOWER = C_LOWER | F_EXPR_END | F_FIELD_NAME;
const T_LITERAL = C_LITERAL | F_EXPR_END;
const T_STRING = C_STRING;
const T_STRING_END = C_STRING | F_EXPR_END;
const T_KEYWORD = C_KEYWORD;
const T_KEYWORD_END = C_KEYWORD | F_EXPR_END;
const T_PUNCT = C_PUNCT;
const T_PUNCT_END = C_PUNCT | F_EXPR_END;
const T_FIELD_PREFIX = C_PUNCT | F_FIELD_PREFIX;
const T_DELIM = C_DELIM;
const T_DELIM_END = C_DELIM | F_EXPR_END;
const T_OP = C_OP;
const T_OP_FIELD_PREFIX = C_OP | F_FIELD_PREFIX;
const T_COLON = C_OP | F_COLON;
const T_DOT_LOWER = C_LOWER | F_EXPR_END | F_DOT_PREFIX;
const T_DOT_UPPER = C_UPPER | F_EXPR_END | F_DOT_PREFIX;
const T_DOT_LITERAL = C_LITERAL | F_EXPR_END | F_DOT_PREFIX;
const T_DOT_OP = C_OP | F_DOT_PREFIX;
const T_DOT_ERROR = C_ERROR | F_EXPR_END | F_DOT_PREFIX;
const T_DOTDOT_OP = C_OP | F_DOTDOT_PREFIX;

const TWO_BYTE_TOKENS = {
  0x213d: T_OP, // !=
  0x3f3f: T_OP, // ??
  0x7c3e: T_OP, // |>
  0x2f2f: T_OP, // //
  0x3e3d: T_OP, // >=
  0x3c3d: T_OP, // <=
  0x3c2d: T_OP_FIELD_PREFIX, // <-
  0x3d3d: T_OP, // ==
  0x3d3e: T_OP, // =>
  0x3a3d: T_OP, // :=
  0x3a3a: T_OP, // ::
};

const ONE_BYTE_TOKENS = {
  33: T_OP, // !
  38: T_OP_FIELD_PREFIX, // &
  44: T_FIELD_PREFIX, // ,
  63: T_OP, // ?
  124: T_OP, // |
  43: T_OP, // +
  42: T_OP, // *
  47: T_OP, // /
  37: T_OP, // %
  94: T_OP, // ^
  62: T_OP, // >
  60: T_OP, // <
  61: T_OP, // =
  58: T_COLON, // :
  40: T_PUNCT, // (
  91: T_DELIM, // [
  123: T_FIELD_PREFIX, // {
  41: T_PUNCT_END, // )
  93: T_DELIM_END, // ]
};

const ROC_KEYWORDS =
  " app as crash dbg else expect exposes exposing for generates has hosted if implements import imports in interface match module package packages platform provides requires return targets var where while with break ";
const ROC_NUMBER_SUFFIXES = " dec f32 f64 i128 i16 i32 i64 i8 nat u128 u16 u32 u64 u8 ";

function tokenError(tok) {
  return (tok & C_MASK) === C_ERROR;
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

class RocCursor {
  constructor(text) {
    this.b = encode(text);
    this.p = 0;
    this.r = [];
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
        this.r.push({ s: start, e: this.p, c: "c" });
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

    let tok = T_LITERAL;
    if (initialDigit === 48) {
      while (true) {
        const c = this.pk() ?? 0;
        if (c === 120 || c === 88) {
          this.p += 1;
          if (!this.int16()) {
            tok = T_ERROR_END;
          }
          tok = this.suffix(tok);
          break;
        } else if (c === 111 || c === 79) {
          this.p += 1;
          if (!this.int8()) {
            tok = T_ERROR_END;
          }
          tok = this.suffix(tok);
          break;
        } else if (c === 98 || c === 66) {
          this.p += 1;
          if (!this.int2()) {
            tok = T_ERROR_END;
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
      return keepError(hypothesis, T_ERROR_END);
    }
    const suffix = decode(this.b.subarray(start, this.p));
    if (!ROC_NUMBER_SUFFIXES.includes(" " + suffix + " ")) {
      return keepError(hypothesis, T_ERROR_END);
    }
    return hypothesis;
  }

  num10() {
    let tokenType = T_LITERAL;
    this.int10();
    if (
      (this.pk() ?? 0) === 46 &&
      (this.inRange(1, 48, 57) ||
        this.at(1) === 101 ||
        this.at(1) === 69)
    ) {
      this.p += 1;
      this.int10();
      tokenType = T_LITERAL;
    }

    const hasExponent = this.exp();
    if (hasExponent === "EmptyExponent") {
      return T_ERROR_END;
    }
    if (hasExponent) {
      tokenType = T_LITERAL;
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
      return T_ERROR_END;
    }
    const ident = decode(this.b.subarray(start, this.p));
    if (ident === "and" || ident === "or") {
      return T_OP;
    }
    return ROC_KEYWORDS.includes(" " + ident + " ") ? T_KEYWORD : T_LOWER;
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
          return T_ERROR_END;
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
          return T_STRING_END;
        }
        state = "TooLong";
      } else if (state === "TooLong") {
        if (c === 39) {
          return T_ERROR_END;
        }
      } else if (state === "Invalid" && c === 39) {
        return T_ERROR_END;
      }
    }

    return T_ERROR_END;
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
}

class RocTokenizer {
  constructor(text) {
    this.c = new RocCursor(text);
    this.t = [];
    this.s = [];
  }

  last() {
    return this.t.length === 0 ? null : this.t[this.t.length - 1].t;
  }

  push(tag, start) {
    this.t.push({ t: tag, s: start, e: this.c.p });
  }

  symbol(start, b) {
    const next = this.c.at(1);
    if (next != null) {
      const pairTag = TWO_BYTE_TOKENS[(b << 8) | next];
      if (pairTag != null) {
        this.c.p += 2;
        this.push(pairTag, start);
        return true;
      }
    }

    const tag = ONE_BYTE_TOKENS[b];
    if (tag != null) {
      this.c.p += 1;
      this.push(tag, start);
      return true;
    }

    return false;
  }

  tokenize() {
    let sawWhitespace = true;

    while (this.c.p < this.c.b.length) {
      const start = this.c.p;
      const sp = sawWhitespace;
      sawWhitespace = false;
      const b = this.c.b[this.c.p];

      if (b <= 32 || b === 35) {
        this.c.trivia();
        sawWhitespace = true;
      } else if (b === 46) {
        this.dot(start, sp);
      } else if (b === 45) {
        this.minus(start, sp);
      } else if (b === 92) {
        if (this.c.at(1) === 92) {
          this.multiline();
        } else {
          this.c.p += 1;
          this.push(T_OP, start);
        }
      } else if (b === 125) {
        this.c.p += 1;
        if (this.s.length > 0) {
          const last = this.s.pop();
          this.push(T_KEYWORD_END, start);
          this.stringBody(last);
        } else {
          this.push(T_PUNCT_END, start);
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
        const tag = this.c.number();
        this.push(tag, start);
      } else if (lo(b)) {
        const tag = this.c.lower();
        this.push(tag, start);
      } else if (up(b)) {
        let tag = T_UPPER;
        if (!this.c.ident()) {
          tag = T_ERROR_END;
        }
        this.push(tag, start);
      } else if (b === 39) {
        const tag = this.c.single();
        this.push(tag, start);
      } else if (b === 34) {
        this.string();
      } else if (b >= 0x80) {
        this.c.ident();
        this.push(T_ERROR_END, start);
      } else {
        this.c.p += 1;
        this.push(T_ERROR, start);
      }
    }

    this.push(T_NONE, this.c.p);
    return {
      t: this.t,
      c: this.c.r,
      b: this.c.b,
    };
  }

  dot(start, sp) {
    const next = this.c.at(1);
    if (next == null) {
      this.c.p += 1;
      this.push(T_PUNCT, start);
    } else if (next === 46) {
      if (this.c.at(2) === 46) {
        this.c.p += 3;
        this.push(T_PUNCT, start);
      } else if (this.c.at(2) === 60) {
        this.c.p += 3;
        this.push(T_DOTDOT_OP, start);
      } else if (this.c.at(2) === 61) {
        this.c.p += 3;
        this.push(T_DOTDOT_OP, start);
      } else {
        this.c.p += 2;
        this.push(T_PUNCT, start);
      }
    } else if (dig(next)) {
      this.c.p += 1;
      this.c.integer();
      this.push(T_DOT_LITERAL, start);
    } else if (lo(next)) {
      let tag = T_DOT_LOWER;
      this.c.p += 1;
      if (!this.c.ident()) {
        tag = T_DOT_ERROR;
      }
      this.push(tag, start);
    } else if (up(next)) {
      let tag = T_DOT_UPPER;
      this.c.p += 1;
      if (!this.c.ident()) {
        tag = T_DOT_ERROR;
      }
      this.push(tag, start);
    } else if (next >= 0x80 && next <= 0xff) {
      this.c.p += 1;
      this.c.ident();
      this.push(T_DOT_ERROR, start);
    } else if (next === 123) {
      this.c.p += 1;
      this.push(T_PUNCT, start);
    } else if (next === 42) {
      this.c.p += 2;
      this.push(T_DOT_OP, start);
    } else {
      this.c.p += 1;
      this.push(T_PUNCT, start);
    }
  }

  minus(start, sp) {
    const next = this.c.at(1);
    if (next == null) {
      this.c.p += 1;
      this.push(T_OP, start);
    } else if (next === 62) {
      this.c.p += 2;
      this.push(T_OP, start);
    } else if (next === 32 || next === 9 || next === 10 || next === 13 || next === 35) {
      this.c.p += 1;
      this.push(T_OP, start);
    } else if (dig(next)) {
      const prev = this.last();
      if (!sp && prev != null && (prev & F_EXPR_END) !== 0) {
        this.c.p += 1;
        this.push(T_OP, start);
      } else {
        this.c.p += 1;
        const tag = this.c.number();
        this.push(tag, start);
      }
    } else {
      this.c.p += 1;
      this.push(T_OP, start);
    }
  }

  under(start) {
    const next = this.c.at(1);
    if (next != null && (lo(next) || up(next) || dig(next))) {
      let tag = T_LOWER;
      this.c.p += 2;
      if (!this.c.ident()) {
        tag = T_ERROR_END;
      }
      this.push(tag, start);
    } else {
      this.c.p += 1;
      this.push(T_NONE, start);
    }
  }

  opaque(start) {
    let tok = T_UPPER;
    const next = this.c.at(1);
    if (
      next != null &&
      (lo(next) || up(next) || dig(next) || next === 95 || next >= 0x80)
    ) {
      this.c.p += 1;
      if (!this.c.ident()) {
        tok = T_ERROR_END;
      }
    } else {
      tok = T_ERROR;
      this.c.p += 1;
    }
    this.push(tok, start);
  }

  dollar(start) {
    const next = this.c.at(1);
    if (next != null && lo(next)) {
      let tag = T_LOWER;
      this.c.p += 1;
      if (!this.c.ident()) {
        tag = T_ERROR_END;
      }
      this.push(tag, start);
    } else if (next != null && up(next)) {
      let tag = T_UPPER;
      this.c.p += 1;
      if (!this.c.ident()) {
        tag = T_ERROR_END;
      }
      this.push(tag, start);
    } else {
      this.c.p += 1;
      this.push(T_ERROR, start);
    }
  }

  string() {
    const start = this.c.p;
    this.c.p += 1;
    let kind = "single_line";
    if (this.c.pk() === 34 && this.c.at(1) === 34) {
      this.c.p += 2;
      kind = "multi_line";
      this.push(T_STRING, start);
    } else {
      this.push(T_STRING, start);
    }
    this.stringBody(kind);
  }

  multiline() {
    const start = this.c.p;
    this.c.p += 2;
    this.push(T_STRING, start);
    this.stringBody("multi_line");
  }

  stringBody(kind) {
    const start = this.c.p;
    let stringPartTag = T_STRING;
    while (this.c.p < this.c.b.length) {
      const c = this.c.b[this.c.p];
      if (c === 36 && this.c.at(1) === 123) {
        this.push(stringPartTag, start);
        const dollarStart = this.c.p;
        this.c.p += 2;
        this.push(T_KEYWORD, dollarStart);
        this.s.push(kind);
        return;
      } else if (c === 10) {
        this.push(stringPartTag, start);
        if (kind === "single_line") {
          this.push(T_STRING_END, this.c.p);
        }
        return;
      } else if (kind === "single_line" && c === 34) {
        this.push(stringPartTag, start);
        const stringPartEnd = this.c.p;
        this.c.p += 1;
        this.push(T_STRING_END, stringPartEnd);
        return;
      } else {
        this.c.utf8();
        if (c === 92 && this.c.escape(34) !== true) {
          stringPartTag = T_ERROR;
        }
      }
    }
    this.push(stringPartTag, start);
  }
}

function rocTokens(source) {
  return new RocTokenizer(source).tokenize();
}

function tokenClass(tag) {
  return TOK_CLASS[tag & C_MASK];
}

function addToken(ranges, token) {
  const cls = tokenClass(token.t);
  if (cls == null) {
    return;
  }

  if ((token.t & F_DOT_PREFIX) !== 0 && token.s + 1 < token.e) {
    ranges.push({ s: token.s, e: token.s + 1, c: "p" });
    ranges.push({ s: token.s + 1, e: token.e, c: cls });
  } else if ((token.t & F_DOTDOT_PREFIX) !== 0 && token.s + 2 < token.e) {
    ranges.push({ s: token.s, e: token.s + 2, c: "p" });
    ranges.push({ s: token.s + 2, e: token.e, c: cls });
  } else {
    ranges.push({ s: token.s, e: token.e, c: cls });
  }
}

function highlightRoc(source) {
  const tokenized = rocTokens(source);
  const ranges = [...tokenized.c];
  const tokens = tokenized.t.filter((token) => token.s !== token.e);

  for (let i = 0; i < tokens.length; i += 1) {
    const previous = tokens[i - 1];
    const token = tokens[i];
    const next = tokens[i + 1];
    if (
      previous != null &&
      next != null &&
      (previous.t & F_FIELD_PREFIX) !== 0 &&
      (token.t & F_FIELD_NAME) !== 0 &&
      (next.t & F_COLON) !== 0 &&
      decode(tokenized.b.subarray(token.e, next.s)).trim() === ""
    ) {
      ranges.push({ s: token.s, e: next.e, c: "f" });
      i += 1;
    } else {
      addToken(ranges, token);
    }
  }

  ranges.sort((a, b) => a.s - b.s || a.e - b.e);

  let html = "";
  let lastEnd = 0;
  for (const range of ranges) {
    if (range.s < lastEnd) {
      continue;
    }
    html += htmlEscape(decode(tokenized.b.subarray(lastEnd, range.s)));
    html += `<span class="${range.c}">`;
    html += htmlEscape(decode(tokenized.b.subarray(range.s, range.e)));
    html += "</span>";
    lastEnd = range.e;
  }
  html += htmlEscape(decode(tokenized.b.subarray(lastEnd)));
  return html || " ";
}

function setupHighlight(textarea, highlight) {
  const updateHighlight = () => {
    highlight.innerHTML = highlightRoc(textarea.value);
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
  setupHighlight(textarea, sourceHighlight);

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
  div.appendChild(runButton);
  div.appendChild(outputArea);
}

// run the setup, when the DOM is finished loading
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".roc-interactive").forEach(setup);

  // Pre-download the compiler in the background at low priority so the first
  // Run click is instant. Errors are ignored here — the click handler retries.
  const preload = () => load().catch(() => {});
  if ("requestIdleCallback" in window) {
    requestIdleCallback(preload);
  } else {
    preload();
  }
});
