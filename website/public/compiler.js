// main.js — Roc interactive examples (lazy-loads compiler on first Run click)
"use strict";

const utf8Decode = (bytes) => new TextDecoder().decode(bytes);
const utf8Encode = (str) => new TextEncoder().encode(str);

// All null until the user clicks "Run" for the first time.

let wasmModule = null; // WebAssembly.Module
let wasmInstance = null; // WebAssembly.Instance
let wasmMemory = null; // WebAssembly.Memory
let loadInProgress = null; // Promise | null — guards against concurrent loads

// Every run creates a fresh { programOutput, compilerMessages } object
// and stashes it here so the import callbacks can write into it.
let runCapture = null;

// Build a fresh imports object (needed for initial load & re-instantiation).
function buildImports() {
  return {
    env: {
      js_echo(ptr, len) {
        if (runCapture) {
          const slice = new Uint8Array(wasmMemory.buffer, ptr, len);
          runCapture.programOutput += utf8Decode(slice);
        }
      },
      js_stderr(ptr, len) {
        if (runCapture) {
          const slice = new Uint8Array(wasmMemory.buffer, ptr, len);
          runCapture.compilerMessages += utf8Decode(slice);
        }
      },
    },
  };
}

async function loadCompiler() {
  if (wasmInstance) return; // already loaded
  if (loadInProgress) return loadInProgress; // another click is loading it

  loadInProgress = (async () => {
    const response = await fetch("echo.wasm", { priority: "low" });
    const { module, instance } = await WebAssembly.instantiateStreaming(
      response,
      buildImports(),
    );
    wasmModule = module;
    wasmInstance = instance;
    wasmMemory = instance.exports.memory;
    wasmInstance.exports.init();
  })();

  await loadInProgress;
  loadInProgress = null;
}

async function recoverCompiler() {
  try {
    const instance = await WebAssembly.instantiate(wasmModule, buildImports());
    wasmInstance = instance;
    wasmMemory = instance.exports.memory;
    wasmInstance.exports.init();
  } catch (_) {
    // best-effort — if recovery fails the next run will show the error
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const ANSI_COLOR_CLASSES = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
];

function renderAnsiTerminal(text) {
  const state = { bold: false, dim: false, italic: false, underline: false, fg: null };

  const classes = () => {
    const result = [];
    if (state.bold) result.push("ansi-bold");
    if (state.dim) result.push("ansi-dim");
    if (state.italic) result.push("ansi-italic");
    if (state.underline) result.push("ansi-underline");
    if (state.fg) result.push(`ansi-fg-${state.fg}`);
    return result.join(" ");
  };

  const span = (chunk) => {
    if (!chunk) return "";
    const cls = classes();
    const escaped = escapeHtml(chunk);
    return cls ? `<span class="${cls}">${escaped}</span>` : escaped;
  };

  const applySgr = (body) => {
    const params = body === "" ? [0] : body.split(";").map(Number);
    for (const code of params) {
      if (!Number.isInteger(code)) continue;

      if (code === 0) {
        state.bold = false;
        state.dim = false;
        state.italic = false;
        state.underline = false;
        state.fg = null;
      } else if (code === 1) {
        state.bold = true;
      } else if (code === 2) {
        state.dim = true;
      } else if (code === 3) {
        state.italic = true;
      } else if (code === 4) {
        state.underline = true;
      } else if (code === 22) {
        state.bold = false;
        state.dim = false;
      } else if (code === 23) {
        state.italic = false;
      } else if (code === 24) {
        state.underline = false;
      } else if (code === 39) {
        state.fg = null;
      } else if (code >= 30 && code <= 37) {
        state.fg = ANSI_COLOR_CLASSES[code - 30];
      } else if (code >= 90 && code <= 97) {
        state.fg = `bright-${ANSI_COLOR_CLASSES[code - 90]}`;
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
      html += escapeHtml(text.slice(esc));
      break;
    }

    const body = text.slice(esc + 2, end);
    if (/^[0-9;]*$/.test(body)) {
      applySgr(body);
    } else {
      html += escapeHtml(text.slice(esc, end + 1));
    }
    index = end + 1;
  }
  return html;
}

function renderTerminalBlock(text) {
  return `<pre class="roc-terminal">${renderAnsiTerminal(text)}</pre>`;
}

const TOK_CLASS = [
  null,
  "upperident",
  "lowerident",
  "literal",
  "string",
  "keyword",
  "punctuation",
  "delimiter",
  "op",
  "error",
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

const ROC_KEYWORDS = new Map([
  ["and", T_OP],
  ["or", T_OP],
  ..."app as crash dbg else expect exposes exposing for generates has hosted if implements import imports in interface match module package packages platform provides requires return targets var where while with break"
    .split(/\s+/)
    .map((word) => [word, T_KEYWORD]),
]);

const ROC_NUMBER_SUFFIXES = new Set("dec f32 f64 i128 i16 i32 i64 i8 nat u128 u16 u32 u64 u8".split(" "));

function isRocTokenError(tok) {
  return (tok & C_MASK) === C_ERROR;
}

function updateIfNotMalformed(tok, next) {
  return isRocTokenError(tok) ? tok : next;
}

function isAsciiLower(c) {
  return c >= 97 && c <= 122;
}

function isAsciiUpper(c) {
  return c >= 65 && c <= 90;
}

function isAsciiDigit(c) {
  return c >= 48 && c <= 57;
}

function isHexDigit(c) {
  return isAsciiDigit(c) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);
}

function canFollowUnaryMinus(c) {
  return isAsciiLower(c) || isAsciiUpper(c) || c === 95 || c === 40 || c >= 0x80;
}

function utf8SequenceLength(c) {
  if (c < 0x80) return 1;
  if (c >= 0xc2 && c <= 0xdf) return 2;
  if (c >= 0xe0 && c <= 0xef) return 3;
  if (c >= 0xf0 && c <= 0xf4) return 4;
  return null;
}

function isValidUnicodeCodepoint(codepoint) {
  return codepoint <= 0x10ffff && !(codepoint >= 0xd800 && codepoint <= 0xdfff);
}

class RocCursor {
  constructor(text) {
    this.buf = utf8Encode(text);
    this.pos = 0;
    this.commentRanges = [];
  }

  peek() {
    return this.pos < this.buf.length ? this.buf[this.pos] : null;
  }

  peekAt(lookahead) {
    const idx = this.pos + lookahead;
    return idx < this.buf.length ? this.buf[idx] : null;
  }

  isPeekedCharInRange(lookahead, start, end) {
    const peeked = this.peekAt(lookahead);
    return peeked != null && peeked >= start && peeked <= end;
  }

  chompTrivia() {
    while (this.pos < this.buf.length) {
      const b = this.buf[this.pos];
      if (b === 32 || b === 9 || b === 10) {
        this.pos += 1;
      } else if (b === 13) {
        this.pos += 1;
        if (this.pos < this.buf.length && this.buf[this.pos] === 10) {
          this.pos += 1;
        }
      } else if (b === 35) {
        const start = this.pos;
        this.pos += 1;
        while (
          this.pos < this.buf.length &&
          this.buf[this.pos] !== 10 &&
          this.buf[this.pos] !== 13
        ) {
          this.pos += 1;
        }
        this.commentRanges.push({ start, end: this.pos, className: "comment" });
      } else if (b >= 0 && b <= 31) {
        this.pos += 1;
      } else {
        break;
      }
    }
  }

  chompNumber() {
    const initialDigit = this.buf[this.pos];
    this.pos += 1;

    let tok = T_LITERAL;
    if (initialDigit === 48) {
      while (true) {
        const c = this.peek() ?? 0;
        if (c === 120 || c === 88) {
          this.pos += 1;
          if (!this.chompIntegerBase16()) {
            tok = T_ERROR_END;
          }
          tok = this.chompNumberSuffix(tok);
          break;
        } else if (c === 111 || c === 79) {
          this.pos += 1;
          if (!this.chompIntegerBase8()) {
            tok = T_ERROR_END;
          }
          tok = this.chompNumberSuffix(tok);
          break;
        } else if (c === 98 || c === 66) {
          this.pos += 1;
          if (!this.chompIntegerBase2()) {
            tok = T_ERROR_END;
          }
          tok = this.chompNumberSuffix(tok);
          break;
        } else if (isAsciiDigit(c)) {
          tok = this.chompNumberBase10();
          tok = this.chompNumberSuffix(tok);
          break;
        } else if (c === 95) {
          this.pos += 1;
        } else if (c === 46) {
          this.pos -= 1;
          tok = this.chompNumberBase10();
          tok = this.chompNumberSuffix(tok);
          break;
        } else {
          tok = this.chompNumberSuffix(tok);
          break;
        }
      }
    } else {
      tok = this.chompNumberBase10();
      tok = this.chompNumberSuffix(tok);
    }
    return tok;
  }

  chompExponent() {
    const c = this.peek() ?? 0;
    if (c === 101 || c === 69) {
      this.pos += 1;
      const sign = this.peek() ?? 0;
      if (sign === 43 || sign === 45) {
        this.pos += 1;
      }
      if (!this.chompIntegerBase10()) {
        return "EmptyExponent";
      }
      return true;
    }
    return false;
  }

  chompNumberSuffix(hypothesis) {
    const c = this.peek();
    if (c == null) {
      return hypothesis;
    }
    const isIdentChar =
      isAsciiLower(c) ||
      isAsciiUpper(c) ||
      isAsciiDigit(c) ||
      c === 95 ||
      c === 36 ||
      c >= 0x80;
    if (!isIdentChar) {
      return hypothesis;
    }

    const start = this.pos;
    if (!this.chompIdentGeneral()) {
      return updateIfNotMalformed(hypothesis, T_ERROR_END);
    }
    const suffix = utf8Decode(this.buf.subarray(start, this.pos));
    if (!ROC_NUMBER_SUFFIXES.has(suffix)) {
      return updateIfNotMalformed(hypothesis, T_ERROR_END);
    }
    return hypothesis;
  }

  chompNumberBase10() {
    let tokenType = T_LITERAL;
    this.chompIntegerBase10();
    if (
      (this.peek() ?? 0) === 46 &&
      (this.isPeekedCharInRange(1, 48, 57) ||
        this.peekAt(1) === 101 ||
        this.peekAt(1) === 69)
    ) {
      this.pos += 1;
      this.chompIntegerBase10();
      tokenType = T_LITERAL;
    }

    const hasExponent = this.chompExponent();
    if (hasExponent === "EmptyExponent") {
      return T_ERROR_END;
    }
    if (hasExponent) {
      tokenType = T_LITERAL;
    }
    return tokenType;
  }

  chompIntegerBase10() {
    let containsDigits = false;
    while (this.peek() != null) {
      const c = this.peek();
      if (isAsciiDigit(c)) {
        containsDigits = true;
        this.pos += 1;
      } else if (c === 95) {
        this.pos += 1;
      } else {
        break;
      }
    }
    return containsDigits;
  }

  chompIntegerBase16() {
    let containsDigits = false;
    while (this.peek() != null) {
      const c = this.peek();
      if (isHexDigit(c)) {
        containsDigits = true;
        this.pos += 1;
      } else if (c === 95) {
        this.pos += 1;
      } else {
        break;
      }
    }
    return containsDigits;
  }

  chompIntegerBase8() {
    let containsDigits = false;
    while (this.peek() != null) {
      const c = this.peek();
      if (c >= 48 && c <= 55) {
        containsDigits = true;
        this.pos += 1;
      } else if (c === 95) {
        this.pos += 1;
      } else {
        break;
      }
    }
    return containsDigits;
  }

  chompIntegerBase2() {
    let containsDigits = false;
    while (this.peek() != null) {
      const c = this.peek();
      if (c === 48 || c === 49) {
        containsDigits = true;
        this.pos += 1;
      } else if (c === 95) {
        this.pos += 1;
      } else {
        break;
      }
    }
    return containsDigits;
  }

  chompIdentLower() {
    const start = this.pos;
    if (!this.chompIdentGeneral()) {
      return T_ERROR_END;
    }
    const ident = utf8Decode(this.buf.subarray(start, this.pos));
    return ROC_KEYWORDS.get(ident) ?? T_LOWER;
  }

  chompIdentGeneral() {
    let valid = true;
    while (this.pos < this.buf.length) {
      const c = this.buf[this.pos];
      if (
        isAsciiLower(c) ||
        isAsciiUpper(c) ||
        isAsciiDigit(c) ||
        c === 95 ||
        c === 33 ||
        c === 36
      ) {
        this.pos += 1;
      } else if (c >= 0x80) {
        valid = false;
        this.pos += 1;
      } else {
        break;
      }
    }
    return valid;
  }

  chompInteger() {
    while (this.pos < this.buf.length && isAsciiDigit(this.buf[this.pos])) {
      this.pos += 1;
    }
  }

  chompEscapeSequenceWithQuote(quoteChar) {
    const c = this.peek() ?? 0;

    if (c === 92 || c === 34 || c === 39 || c === 110 || c === 114 || c === 116 || c === 36) {
      this.pos += 1;
      return true;
    }

    if (c === 117) {
      this.pos += 1;
      if (this.peek() === 40) {
        this.pos += 1;
      } else {
        return "InvalidUnicodeEscapeSequence";
      }

      const hexStart = this.pos;
      while (true) {
        if (this.peek() === 41) {
          if (this.pos === hexStart) {
            this.pos += 1;
            return "InvalidUnicodeEscapeSequence";
          }
          this.pos += 1;
          break;
        } else if (this.peek() != null) {
          const next = this.peek();
          if (isHexDigit(next)) {
            this.pos += 1;
          } else {
            while (this.pos < this.buf.length) {
              const nextChar = this.peek() ?? 0;
              if (nextChar === 41 || nextChar === 10) {
                break;
              }
              if (quoteChar != null && nextChar === quoteChar) {
                break;
              }
              this.pos += 1;
            }
            if (this.pos < this.buf.length && this.peek() === 41) {
              this.pos += 1;
            }
            return "InvalidUnicodeEscapeSequence";
          }
        } else {
          return "InvalidUnicodeEscapeSequence";
        }
      }

      const hexCode = utf8Decode(this.buf.subarray(hexStart, this.pos - 1));
      const codepoint = Number.parseInt(hexCode, 16);
      if (!Number.isFinite(codepoint) || !isValidUnicodeCodepoint(codepoint)) {
        return "InvalidUnicodeEscapeSequence";
      }

      return true;
    }

    return "InvalidEscapeSequence";
  }

  chompSingleQuoteLiteral() {
    this.pos += 1;
    let state = "Empty";

    while (this.pos < this.buf.length) {
      const c = this.buf[this.pos];
      if (c === 10) {
        break;
      }

      this.pos += 1;

      if (state === "Empty") {
        if (c === 39) {
          return T_ERROR_END;
        }
        if (c === 92) {
          state = "Enough";
          if (this.chompEscapeSequenceWithQuote(39) !== true) {
            state = "Invalid";
          }
        } else {
          this.pos -= 1;
          this.chompUTF8CodepointWithValidation();
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

  chompUTF8CodepointWithValidation() {
    const c = this.buf[this.pos];

    if (c < 0x80) {
      this.pos += 1;
      return c;
    }

    const utf8Len = utf8SequenceLength(c);
    if (utf8Len == null || this.pos + utf8Len > this.buf.length) {
      this.pos += 1;
      return null;
    }

    let codepoint;
    if (utf8Len === 2) {
      codepoint = ((c & 0x1f) << 6) | (this.buf[this.pos + 1] & 0x3f);
    } else if (utf8Len === 3) {
      codepoint =
        ((c & 0x0f) << 12) |
        ((this.buf[this.pos + 1] & 0x3f) << 6) |
        (this.buf[this.pos + 2] & 0x3f);
    } else {
      codepoint =
        ((c & 0x07) << 18) |
        ((this.buf[this.pos + 1] & 0x3f) << 12) |
        ((this.buf[this.pos + 2] & 0x3f) << 6) |
        (this.buf[this.pos + 3] & 0x3f);
    }

    this.pos += utf8Len;
    return codepoint;
  }
}

class RocTokenizer {
  constructor(text) {
    this.cursor = new RocCursor(text);
    this.tokens = [];
    this.stringInterpolationStack = [];
  }

  lastTokenTag() {
    return this.tokens.length === 0 ? null : this.tokens[this.tokens.length - 1].tag;
  }

  pushToken(tag, start) {
    this.tokens.push({ tag, start, end: this.cursor.pos });
  }

  tokenize() {
    let sawWhitespace = true;

    while (this.cursor.pos < this.cursor.buf.length) {
      const start = this.cursor.pos;
      const sp = sawWhitespace;
      sawWhitespace = false;
      const b = this.cursor.buf[this.cursor.pos];

      if (b <= 32 || b === 35) {
        this.cursor.chompTrivia();
        sawWhitespace = true;
      } else if (b === 46) {
        this.tokenizeDot(start, sp);
      } else if (b === 45) {
        this.tokenizeMinus(start, sp);
      } else if (b === 33) {
        if (this.cursor.peekAt(1) === 61) {
          this.cursor.pos += 2;
          this.pushToken(T_OP, start);
        } else {
          this.cursor.pos += 1;
          this.pushToken(T_OP, start);
        }
      } else if (b === 38) {
        this.cursor.pos += 1;
        this.pushToken(T_OP_FIELD_PREFIX, start);
      } else if (b === 44) {
        this.cursor.pos += 1;
        this.pushToken(T_FIELD_PREFIX, start);
      } else if (b === 63) {
        if (this.cursor.peekAt(1) === 63) {
          this.cursor.pos += 2;
          this.pushToken(T_OP, start);
        } else {
          this.cursor.pos += 1;
          this.pushToken(T_OP, start);
        }
      } else if (b === 124) {
        if (this.cursor.peekAt(1) === 62) {
          this.cursor.pos += 2;
          this.pushToken(T_OP, start);
        } else {
          this.cursor.pos += 1;
          this.pushToken(T_OP, start);
        }
      } else if (b === 43) {
        this.cursor.pos += 1;
        this.pushToken(T_OP, start);
      } else if (b === 42) {
        this.cursor.pos += 1;
        this.pushToken(T_OP, start);
      } else if (b === 47) {
        if (this.cursor.peekAt(1) === 47) {
          this.cursor.pos += 2;
          this.pushToken(T_OP, start);
        } else {
          this.cursor.pos += 1;
          this.pushToken(T_OP, start);
        }
      } else if (b === 92) {
        if (this.cursor.peekAt(1) === 92) {
          this.tokenizeMultilineStringLiteral();
        } else {
          this.cursor.pos += 1;
          this.pushToken(T_OP, start);
        }
      } else if (b === 37) {
        this.cursor.pos += 1;
        this.pushToken(T_OP, start);
      } else if (b === 94) {
        this.cursor.pos += 1;
        this.pushToken(T_OP, start);
      } else if (b === 62) {
        if (this.cursor.peekAt(1) === 61) {
          this.cursor.pos += 2;
          this.pushToken(T_OP, start);
        } else {
          this.cursor.pos += 1;
          this.pushToken(T_OP, start);
        }
      } else if (b === 60) {
        if (this.cursor.peekAt(1) === 61) {
          this.cursor.pos += 2;
          this.pushToken(T_OP, start);
        } else if (this.cursor.peekAt(1) === 45) {
          this.cursor.pos += 2;
          this.pushToken(T_OP_FIELD_PREFIX, start);
        } else {
          this.cursor.pos += 1;
          this.pushToken(T_OP, start);
        }
      } else if (b === 61) {
        if (this.cursor.peekAt(1) === 61) {
          this.cursor.pos += 2;
          this.pushToken(T_OP, start);
        } else if (this.cursor.peekAt(1) === 62) {
          this.cursor.pos += 2;
          this.pushToken(T_OP, start);
        } else {
          this.cursor.pos += 1;
          this.pushToken(T_OP, start);
        }
      } else if (b === 58) {
        if (this.cursor.peekAt(1) === 61) {
          this.cursor.pos += 2;
          this.pushToken(T_OP, start);
        } else if (this.cursor.peekAt(1) === 58) {
          this.cursor.pos += 2;
          this.pushToken(T_OP, start);
        } else {
          this.cursor.pos += 1;
          this.pushToken(T_COLON, start);
        }
      } else if (b === 40) {
        this.cursor.pos += 1;
        this.pushToken(T_PUNCT, start);
      } else if (b === 91) {
        this.cursor.pos += 1;
        this.pushToken(T_DELIM, start);
      } else if (b === 123) {
        this.cursor.pos += 1;
        this.pushToken(T_FIELD_PREFIX, start);
      } else if (b === 41) {
        this.cursor.pos += 1;
        this.pushToken(T_PUNCT_END, start);
      } else if (b === 93) {
        this.cursor.pos += 1;
        this.pushToken(T_DELIM_END, start);
      } else if (b === 125) {
        this.cursor.pos += 1;
        if (this.stringInterpolationStack.length > 0) {
          const last = this.stringInterpolationStack.pop();
          this.pushToken(T_KEYWORD_END, start);
          this.tokenizeStringLikeLiteralBody(last);
        } else {
          this.pushToken(T_PUNCT_END, start);
        }
      } else if (b === 95) {
        this.tokenizeUnderscore(start);
      } else if (b === 64) {
        this.tokenizeOpaqueName(start);
      } else if (b === 36) {
        this.tokenizeDollar(start);
      } else if (isAsciiDigit(b)) {
        const tag = this.cursor.chompNumber();
        this.pushToken(tag, start);
      } else if (isAsciiLower(b)) {
        const tag = this.cursor.chompIdentLower();
        this.pushToken(tag, start);
      } else if (isAsciiUpper(b)) {
        let tag = T_UPPER;
        if (!this.cursor.chompIdentGeneral()) {
          tag = T_ERROR_END;
        }
        this.pushToken(tag, start);
      } else if (b === 39) {
        const tag = this.cursor.chompSingleQuoteLiteral();
        this.pushToken(tag, start);
      } else if (b === 34) {
        this.tokenizeStringLikeLiteral();
      } else if (b >= 0x80) {
        this.cursor.chompIdentGeneral();
        this.pushToken(T_ERROR_END, start);
      } else {
        this.cursor.pos += 1;
        this.pushToken(T_ERROR, start);
      }
    }

    this.pushToken(T_NONE, this.cursor.pos);
    return {
      tokens: this.tokens,
      comments: this.cursor.commentRanges,
      bytes: this.cursor.buf,
    };
  }

  tokenizeDot(start, sp) {
    const next = this.cursor.peekAt(1);
    if (next == null) {
      this.cursor.pos += 1;
      this.pushToken(T_PUNCT, start);
    } else if (next === 46) {
      if (this.cursor.peekAt(2) === 46) {
        this.cursor.pos += 3;
        this.pushToken(T_PUNCT, start);
      } else if (this.cursor.peekAt(2) === 60) {
        this.cursor.pos += 3;
        this.pushToken(T_DOTDOT_OP, start);
      } else if (this.cursor.peekAt(2) === 61) {
        this.cursor.pos += 3;
        this.pushToken(T_DOTDOT_OP, start);
      } else {
        this.cursor.pos += 2;
        this.pushToken(T_PUNCT, start);
      }
    } else if (isAsciiDigit(next)) {
      this.cursor.pos += 1;
      this.cursor.chompInteger();
      this.pushToken(T_DOT_LITERAL, start);
    } else if (isAsciiLower(next)) {
      let tag = T_DOT_LOWER;
      this.cursor.pos += 1;
      if (!this.cursor.chompIdentGeneral()) {
        tag = T_DOT_ERROR;
      }
      this.pushToken(tag, start);
    } else if (isAsciiUpper(next)) {
      let tag = T_DOT_UPPER;
      this.cursor.pos += 1;
      if (!this.cursor.chompIdentGeneral()) {
        tag = T_DOT_ERROR;
      }
      this.pushToken(tag, start);
    } else if (next >= 0x80 && next <= 0xff) {
      this.cursor.pos += 1;
      this.cursor.chompIdentGeneral();
      this.pushToken(T_DOT_ERROR, start);
    } else if (next === 123) {
      this.cursor.pos += 1;
      this.pushToken(T_PUNCT, start);
    } else if (next === 42) {
      this.cursor.pos += 2;
      this.pushToken(T_DOT_OP, start);
    } else {
      this.cursor.pos += 1;
      this.pushToken(T_PUNCT, start);
    }
  }

  tokenizeMinus(start, sp) {
    const next = this.cursor.peekAt(1);
    if (next == null) {
      this.cursor.pos += 1;
      this.pushToken(T_OP, start);
    } else if (next === 62) {
      this.cursor.pos += 2;
      this.pushToken(T_OP, start);
    } else if (next === 32 || next === 9 || next === 10 || next === 13 || next === 35) {
      this.cursor.pos += 1;
      this.pushToken(T_OP, start);
    } else if (isAsciiDigit(next)) {
      const prev = this.lastTokenTag();
      if (!sp && prev != null && (prev & F_EXPR_END) !== 0) {
        this.cursor.pos += 1;
        this.pushToken(T_OP, start);
      } else {
        this.cursor.pos += 1;
        const tag = this.cursor.chompNumber();
        this.pushToken(tag, start);
      }
    } else {
      this.cursor.pos += 1;
      this.pushToken(T_OP, start);
    }
  }

  tokenizeUnderscore(start) {
    const next = this.cursor.peekAt(1);
    if (next != null && (isAsciiLower(next) || isAsciiUpper(next) || isAsciiDigit(next))) {
      let tag = T_LOWER;
      this.cursor.pos += 2;
      if (!this.cursor.chompIdentGeneral()) {
        tag = T_ERROR_END;
      }
      this.pushToken(tag, start);
    } else {
      this.cursor.pos += 1;
      this.pushToken(T_NONE, start);
    }
  }

  tokenizeOpaqueName(start) {
    let tok = T_UPPER;
    const next = this.cursor.peekAt(1);
    if (
      next != null &&
      (isAsciiLower(next) || isAsciiUpper(next) || isAsciiDigit(next) || next === 95 || next >= 0x80)
    ) {
      this.cursor.pos += 1;
      if (!this.cursor.chompIdentGeneral()) {
        tok = T_ERROR_END;
      }
    } else {
      tok = T_ERROR;
      this.cursor.pos += 1;
    }
    this.pushToken(tok, start);
  }

  tokenizeDollar(start) {
    const next = this.cursor.peekAt(1);
    if (next != null && isAsciiLower(next)) {
      let tag = T_LOWER;
      this.cursor.pos += 1;
      if (!this.cursor.chompIdentGeneral()) {
        tag = T_ERROR_END;
      }
      this.pushToken(tag, start);
    } else if (next != null && isAsciiUpper(next)) {
      let tag = T_UPPER;
      this.cursor.pos += 1;
      if (!this.cursor.chompIdentGeneral()) {
        tag = T_ERROR_END;
      }
      this.pushToken(tag, start);
    } else {
      this.cursor.pos += 1;
      this.pushToken(T_ERROR, start);
    }
  }

  tokenizeStringLikeLiteral() {
    const start = this.cursor.pos;
    this.cursor.pos += 1;
    let kind = "single_line";
    if (this.cursor.peek() === 34 && this.cursor.peekAt(1) === 34) {
      this.cursor.pos += 2;
      kind = "multi_line";
      this.pushToken(T_STRING, start);
    } else {
      this.pushToken(T_STRING, start);
    }
    this.tokenizeStringLikeLiteralBody(kind);
  }

  tokenizeMultilineStringLiteral() {
    const start = this.cursor.pos;
    this.cursor.pos += 2;
    this.pushToken(T_STRING, start);
    this.tokenizeStringLikeLiteralBody("multi_line");
  }

  tokenizeStringLikeLiteralBody(kind) {
    const start = this.cursor.pos;
    let stringPartTag = T_STRING;
    while (this.cursor.pos < this.cursor.buf.length) {
      const c = this.cursor.buf[this.cursor.pos];
      if (c === 36 && this.cursor.peekAt(1) === 123) {
        this.pushToken(stringPartTag, start);
        const dollarStart = this.cursor.pos;
        this.cursor.pos += 2;
        this.pushToken(T_KEYWORD, dollarStart);
        this.stringInterpolationStack.push(kind);
        return;
      } else if (c === 10) {
        this.pushToken(stringPartTag, start);
        if (kind === "single_line") {
          this.pushToken(T_STRING_END, this.cursor.pos);
        }
        return;
      } else if (kind === "single_line" && c === 34) {
        this.pushToken(stringPartTag, start);
        const stringPartEnd = this.cursor.pos;
        this.cursor.pos += 1;
        this.pushToken(T_STRING_END, stringPartEnd);
        return;
      } else {
        this.cursor.chompUTF8CodepointWithValidation();
        if (c === 92 && this.cursor.chompEscapeSequenceWithQuote(34) !== true) {
          stringPartTag = T_ERROR;
        }
      }
    }
    this.pushToken(stringPartTag, start);
  }
}

function tokenizeRocSource(source) {
  return new RocTokenizer(source).tokenize();
}

function classForRocToken(tag) {
  return TOK_CLASS[tag & C_MASK];
}

function appendRocTokenHighlight(ranges, token) {
  const className = classForRocToken(token.tag);
  if (className == null) {
    return;
  }

  if ((token.tag & F_DOT_PREFIX) !== 0 && token.start + 1 < token.end) {
    ranges.push({ start: token.start, end: token.start + 1, className: "punctuation" });
    ranges.push({ start: token.start + 1, end: token.end, className });
  } else if ((token.tag & F_DOTDOT_PREFIX) !== 0 && token.start + 2 < token.end) {
    ranges.push({ start: token.start, end: token.start + 2, className: "punctuation" });
    ranges.push({ start: token.start + 2, end: token.end, className });
  } else {
    ranges.push({ start: token.start, end: token.end, className });
  }
}

function renderHighlightedRocSource(source) {
  const tokenized = tokenizeRocSource(source);
  const ranges = [...tokenized.comments];
  const tokens = tokenized.tokens.filter((token) => token.start !== token.end);

  for (let i = 0; i < tokens.length; i += 1) {
    const previous = tokens[i - 1];
    const token = tokens[i];
    const next = tokens[i + 1];
    if (
      previous != null &&
      next != null &&
      (previous.tag & F_FIELD_PREFIX) !== 0 &&
      (token.tag & F_FIELD_NAME) !== 0 &&
      (next.tag & F_COLON) !== 0 &&
      utf8Decode(tokenized.bytes.subarray(token.end, next.start)).trim() === ""
    ) {
      ranges.push({ start: token.start, end: next.end, className: "field" });
      i += 1;
    } else {
      appendRocTokenHighlight(ranges, token);
    }
  }

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);

  let html = "";
  let lastEnd = 0;
  for (const range of ranges) {
    if (range.start < lastEnd) {
      continue;
    }
    html += escapeHtml(utf8Decode(tokenized.bytes.subarray(lastEnd, range.start)));
    html += `<span class="${range.className}">`;
    html += escapeHtml(utf8Decode(tokenized.bytes.subarray(range.start, range.end)));
    html += "</span>";
    lastEnd = range.end;
  }
  html += escapeHtml(utf8Decode(tokenized.bytes.subarray(lastEnd)));
  return html || " ";
}

function setupHighlightedSource(textarea, highlight) {
  const updateHighlight = () => {
    highlight.innerHTML = renderHighlightedRocSource(textarea.value);
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

function setupExample(div) {
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
  setupHighlightedSource(textarea, sourceHighlight);

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
    if (!wasmInstance) {
      outputArea.textContent = "Loading compiler\u2026";
      try {
        await loadCompiler();
      } catch (err) {
        outputArea.textContent = "Could not load the Roc compiler: " + err;
        return;
      }
    }

    // ---- 2. prepare ----
    outputArea.textContent = "Running\u2026";
    outputArea.classList.add("running");
    runButton.disabled = true;

    const captured = { programOutput: "", compilerMessages: "" };
    runCapture = captured;
    let trapped = false;

    try {
      wasmInstance.exports.init();

      const encoded = utf8Encode(textarea.value);
      const ptr = wasmInstance.exports.allocateBuffer(encoded.length);
      if (!ptr) throw new Error("allocateBuffer returned null");
      new Uint8Array(wasmMemory.buffer, ptr, encoded.length).set(encoded);

      wasmInstance.exports.compileAndRun(ptr, encoded.length);
    } catch (err) {
      captured.compilerMessages +=
        "\x1b[1;31mCompiler crashed\x1b[0m\n" + String(err) + "\n";
      trapped = true;
    }

    runCapture = null;

    // ---- 3. display results ----
    let html = "";
    if (captured.compilerMessages) html += renderTerminalBlock(captured.compilerMessages);
    if (captured.programOutput) {
      html +=
        '<span class="roc-output-label">Output:\n</span>' +
        renderTerminalBlock(captured.programOutput);
    }
    outputArea.innerHTML = html || "(no output)";
    outputArea.classList.remove("running");

    // ---- 4. recover from trap so later runs work ----
    if (trapped) await recoverCompiler();

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
  document.querySelectorAll(".roc-interactive").forEach(setupExample);

  // Pre-download the compiler in the background at low priority so the first
  // Run click is instant. Errors are ignored here — the click handler retries.
  const preload = () => loadCompiler().catch(() => {});
  if ("requestIdleCallback" in window) {
    requestIdleCallback(preload);
  } else {
    preload();
  }
});
