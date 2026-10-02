// Execute the deployed artifact's browser ABI, not the native Roc executable.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const module = await WebAssembly.compile(await readFile(process.argv[2]));
let memory;
let stdout = '';
let stderr = '';
const decode = (ptr, len) => new TextDecoder().decode(new Uint8Array(memory.buffer, ptr, len));
const instance = await WebAssembly.instantiate(module, { env: {
  js_echo: (ptr, len) => { stdout += decode(ptr, len); },
  js_stderr: (ptr, len) => { stderr += decode(ptr, len); },
} });
memory = instance.exports.memory;
function run(source) {
  stdout = stderr = '';
  instance.exports.init();
  const bytes = new TextEncoder().encode(source);
  const ptr = instance.exports.allocateBuffer(bytes.length);
  assert.ok(ptr, 'source allocation failed');
  new Uint8Array(memory.buffer, ptr, bytes.length).set(bytes);
  const code = instance.exports.compileAndRun(ptr, bytes.length);
  return { code, stdout, stderr };
}
const homepage = await readFile(fileURLToPath(new URL('../website/content/index.md', import.meta.url)), 'utf8');
const blocks = [...homepage.matchAll(/<div class="roc-interactive[^\"]*">([\s\S]*?)<\/div>/g)];
assert.equal(blocks.length, 1, 'Update the expected outputs when adding homepage widgets');
const source = blocks[0][1].replace(/<button[^>]*>[\s\S]*?<\/button>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<\/?pre[^>]*>/g, '');
function checkExample() {
  const result = run(source);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '- Write blog post\n- Call mom\n');
  assert.equal(result.stderr, '');
}
checkExample();
checkExample();
const invalid = run('main! = |_args| { missing_function!() }');
assert.notEqual(invalid.code, 0);
assert.ok(invalid.stderr.length > 0, 'invalid program must produce diagnostics');
checkExample();
console.log('Browser compiler passed: homepage output, repeated runs, diagnostics, and recovery.');
