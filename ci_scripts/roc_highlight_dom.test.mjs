import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const compiler = readFileSync(new URL('../website/public/compiler.js', import.meta.url), 'utf8');
class Element {
  nodeType = 1;
  dataset = {};
  isConnected = true;
  constructor(marked = false, children = []) {
    this.marked = marked;
    this.children = children.map(child => typeof child === 'string' ? { nodeValue: child } : child);
    for (const child of this.children) child.parentElement = this;
  }
  matches(selector) { return selector === '.roc-highlight' && this.marked; }
  querySelectorAll(selector) {
    return this.children.flatMap(child => child instanceof Element
      ? [...(selector === '.roc-highlight' ? child.marked : child.dataset.rocHighlightId) ? [child] : [], ...child.querySelectorAll(selector)]
      : []);
  }
}
function fixture() {
  const calls = [];
  const frames = [];
  const events = new Map();
  const document = {
    documentElement: new Element(),
    addEventListener(name, callback) { events.set(name, callback); },
    querySelector() { return null; },
    getElementById() { return null; },
    createTreeWalker(root) {
      const collect = element => element.children.flatMap(child => child instanceof Element ? collect(child) : [child]);
      const nodes = collect(root);
      return { nextNode: () => nodes.shift() ?? null };
    },
  };
  const highlights = new Map();
  const context = vm.createContext({
    document, navigator: {}, CSS: { highlights }, Highlight: Set,
    Node: { ELEMENT_NODE: 1 }, NodeFilter: { SHOW_TEXT: 4 },
    TextEncoder, TextDecoder, performance,
    requestAnimationFrame: callback => frames.push(callback),
    Range: class {
      setStart(node, offset) { assert.ok(offset >= 0 && offset <= node.nodeValue.length); this.start = { node, offset }; }
      setEnd(node, offset) { assert.ok(offset >= 0 && offset <= node.nodeValue.length); this.end = { node, offset }; }
    },
    // Semantic classification is tested separately. Here a token can deliberately
    // cross multiple DOM nodes, so the renderer's source/range contract is tested.
    rocSemanticTokens(source) {
      calls.push(source);
      return [...source.matchAll(/parameter/g)].map(match => ({ start: match.index, end: match.index + 9, type: 'parameter', modifiers: [] }));
    },
  });
  context.window = context;
  vm.runInContext(compiler, context);
  return { context, highlights, calls, frames, events };
}

test('whole-snippet analysis maps a semantic span across a link without changing markup', () => {
  const { context, highlights, calls } = fixture();
  const link = new Element(false, ['meter']);
  const code = new Element(true, ['fn = |parameter| para', link]);
  context.rocSyntax.highlight(code);
  assert.deepEqual(calls, ['fn = |parameter| parameter']);
  const ranges = [...highlights.get('roc-parameter')];
  assert.equal(ranges.length, 2);
  assert.equal(ranges[1].start.node, code.children[0]);
  assert.equal(ranges[1].start.offset, 17);
  assert.equal(ranges[1].end.node, link.children[0]);
  assert.equal(ranges[1].end.offset, 5);
  assert.equal(code.children[1], link);
});

test('independent snippets and nested markers are analyzed once; repeat and clear replace ranges', () => {
  const { context, highlights, calls } = fixture();
  const first = new Element(true, ['parameter', new Element(true, ['parameter'])]);
  const second = new Element(true, ['parameter']);
  const page = new Element(false, ['not code', first, second]);
  context.rocSyntax.highlightNodes([page, first]);
  assert.deepEqual(calls, ['parameterparameter', 'parameter']);
  assert.equal(highlights.get('roc-parameter').size, 3);
  context.rocSyntax.highlight(page);
  assert.equal(highlights.get('roc-parameter').size, 3);
  context.rocSyntax.clear(first);
  assert.equal(highlights.get('roc-parameter').size, 1);
  context.rocSyntax.clear(page, false);
  assert.equal(highlights.get('roc-parameter').size, 0);
});

test('progressive batches mark every root and do not revisit completed snippets', () => {
  const { context, calls, frames } = fixture();
  const page = new Element(false, Array.from({ length: 5 }, () => new Element(true, ['parameter'])));
  context.rocSyntax.highlightProgressively(page, 2, 2);
  assert.equal(calls.length, 2);
  while (frames.length) frames.shift()();
  assert.equal(calls.length, 5);
  context.rocSyntax.highlightProgressively(page, 2, 2);
  assert.equal(calls.length, 5);
});

test('re-highlighting edited source replaces old ranges', () => {
  const { context, highlights } = fixture();
  const editor = new Element(true, ['parameter']);
  context.rocSyntax.highlight(editor);
  assert.equal(highlights.get('roc-parameter').size, 1);
  editor.children = [{ nodeValue: '', parentElement: editor }];
  context.rocSyntax.highlight(editor);
  assert.equal(highlights.get('roc-parameter').size, 0);
});

test('Roc Markdown samples are selected without highlighting shell commands or diagnostics', () => {
  const { context, events } = fixture();
  const candidate = (language, compactTokens) => ({
    marked: false,
    matches: () => language === 'roc',
    querySelector: () => compactTokens,
    classList: { add() { this.owner.marked = true; } },
  });
  const samples = [candidate('roc', false), candidate('', true), candidate('shell', false), candidate('diagnostic', false)];
  for (const sample of samples) sample.classList.owner = sample;
  context.document.querySelectorAll = selector => selector.startsWith('pre > samp') ? samples : [];
  events.get('DOMContentLoaded')();
  assert.deepEqual(samples.map(sample => sample.marked), [true, true, false, false]);
});

test('public tokens uses the production lexer and forwards snippet metadata', () => {
  const { context } = fixture();
  context.rocSemanticTokens = (source, options) => options;
  const modules = { Example: { transform: { kind: 'function' } } };
  const options = context.rocSyntax.tokens('name = 1', { modules });
  assert.equal(options.modules, modules);
  assert.ok(options.lexicalTokens.some(token => token.type === 'n'));
});
