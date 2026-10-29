import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const context = vm.createContext({
  TextEncoder, TextDecoder, window: {}, document: { addEventListener() {} },
});
vm.runInContext(readFileSync(new URL('../website/public/compiler.js', import.meta.url), 'utf8'), context);
function spans(source) {
  return Array.from(context.rocLexicalTokens(source), ({ start, end }) => [start, end, source.slice(start, end)]);
}

test('lexical byte offsets map astral characters and CRLF to exact UTF-16 ranges', () => {
  assert.deepEqual(spans('😀\r\nvalue = "é😀"'), [
    [0, 2, '😀'], [4, 9, 'value'], [10, 11, '='],
    [12, 13, '"'], [13, 16, 'é😀'], [16, 17, '"'],
  ]);
  // TextEncoder replaces lone surrogates with U+FFFD, but DOM offsets still
  // refer to the original one-code-unit source characters.
  assert.deepEqual(spans('\ud800 = "\udfff😀"'), [
    [0, 1, '\ud800'], [2, 3, '='], [4, 5, '"'],
    [5, 8, '\udfff😀'], [8, 9, '"'],
  ]);
});

test('offset cursor stays aligned through interpolation and unfinished strings', () => {
  assert.deepEqual(spans('x="é${name}😀"\r\ny=1'), [
    [0, 1, 'x'], [1, 2, '='], [2, 3, '"'], [3, 4, 'é'],
    [4, 6, '${'], [6, 10, 'name'], [10, 11, '}'],
    [11, 13, '😀'], [13, 14, '"'], [16, 17, 'y'], [17, 18, '='], [18, 19, '1'],
  ]);
  assert.deepEqual(spans('value="unfinished😀'), [
    [0, 5, 'value'], [5, 6, '='], [6, 7, '"'], [7, 19, 'unfinished😀'],
  ]);
});
