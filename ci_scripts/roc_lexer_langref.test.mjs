import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const context = vm.createContext({
  TextEncoder, TextDecoder, window: {}, document: { addEventListener() {} },
});
for (const file of ['roc-syntax.js', 'compiler.js']) {
  vm.runInContext(readFileSync(new URL(`../website/public/${file}`, import.meta.url), 'utf8'), context);
}
const lexical = source => Array.from(context.rocLexicalTokens(source), t => ({
  text: source.slice(t.start, t.end), type: t.type,
}));
const semantic = source => Array.from(context.rocSemanticTokens(source), t => ({
  text: source.slice(t.start, t.end), type: t.type,
}));

test('langref effectful for! loops have a keyword rather than a function identifier', () => {
  const actual = lexical('for! line in lines { dbg line }\nbefore!()');
  assert.deepEqual(actual.filter(t => t.text === 'for!'), [{ text: 'for!', type: 'k' }]);
  assert.deepEqual(actual.filter(t => t.text === 'before!'), [{ text: 'before!', type: 'v' }]);
});

test('langref interpolation braces belong to their expression until nesting closes', () => {
  const source = 'render = |name| "hello ${{ name: name }.name}"';
  const actual = lexical(source);
  assert.deepEqual(actual.filter(t => t.text === '}').map(t => t.type), ['p', 'k']);
  assert.deepEqual(semantic(source).filter(t => t.text === 'name').map(t => t.type), [
    'parameter', 'property', 'parameter', 'property',
  ]);
  const nested = 'render = |name| "${{ value: "${name}" }.value}"';
  assert.deepEqual(lexical(nested).filter(t => t.text === '}').map(t => t.type), ['k', 'p', 'k']);
  assert.deepEqual(semantic(nested).filter(t => t.text === 'name').map(t => t.type), ['parameter', 'parameter']);
  assert.deepEqual(lexical('text = "${{ value: \'{\' }.value}"').filter(t => t.text === '}').map(t => t.type), ['p', 'k']);
});

test('langref dotted numeric suffixes remain numeric without swallowing method access', () => {
  for (const number of ['250.U8', '-12.34.Dec', '0.1.F64', '0xff.U16', '1.Money', '1e5.U64']) {
    assert.deepEqual(lexical(`n = ${number}`).slice(2), [{ text: number, type: 'n' }]);
    assert.deepEqual(semantic(`n = ${number}`).slice(2), [{ text: number, type: 'number' }]);
  }
  assert.deepEqual(lexical('n = 250.U8.to_str()').slice(2, 5), [
    { text: '250.U8', type: 'n' }, { text: '.', type: 'p' }, { text: 'to_str', type: 'v' },
  ]);
  assert.deepEqual(lexical('n = 250u8').slice(2), [{ text: '250u8', type: 'n' }]);
});

test('langref ranges and spreads are whole operators followed by ordinary rest bindings', () => {
  for (const op of ['..', '...', '..<', '..=']) {
    assert.ok(lexical(`xs = [first, ${op}rest]`).some(t => t.text === op && t.type === 'o'));
    assert.ok(semantic(`xs = [first, ${op}rest]`).some(t => t.text === op && t.type === 'operator'));
  }
  assert.deepEqual(lexical('f = |[first, ..rest]| rest').filter(t => t.text === 'rest').map(t => t.type), ['v', 'v']);
  assert.deepEqual(semantic('f = |[first, ..rest]| rest').filter(t => t.text === 'rest').map(t => t.type), ['parameter', 'parameter']);
});
