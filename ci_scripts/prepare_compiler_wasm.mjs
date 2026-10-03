// Fetch and optimize the browser compiler at build time; never fetch a moving tag.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, copyFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zstdDecompressSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const MAX_ASSET_SIZE = 26_214_400;
const MAX_RAW_SIZE = 256 * 1024 * 1024;
const FLAGS = ['--enable-bulk-memory', '--enable-nontrapping-float-to-int', '-Oz', '--converge'];

export function validateManifest(manifest, compilerTag) {
  if (!/^[0-9a-f]{64}$/.test(manifest.sha256)) throw new Error('Invalid browser compiler SHA256');
  if (manifest.release !== null && (
    !/^nightly-\d{4}-\d{2}-\d{2}-[0-9a-f]+$/.test(manifest.release) ||
    manifest.release !== compilerTag
  )) throw new Error('Browser compiler release must match the website Roc pin');
}

export async function verifiedBytes(path, digest) {
  try {
    const bytes = await readFile(path);
    if (sha256(bytes) === digest) return bytes;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return null;
}

export async function loadCompiler(website, manifest, download = async url => {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Browser compiler download failed: HTTP ${response.status} (${url})`);
  return Buffer.from(await response.arrayBuffer());
}) {
  if (manifest.release === null) {
    // Temporary, explicit bootstrap until nightlies publish echo.wasm.zst.
    const bytes = await verifiedBytes(resolve(website, 'public/echo.wasm'), manifest.sha256);
    if (!bytes) throw new Error('Bootstrap echo.wasm checksum mismatch');
    console.log('Using the pinned legacy browser compiler (nightly publication pending).');
    return bytes;
  }
  const cache = resolve(website, '.cache/browser-compiler');
  await mkdir(cache, { recursive: true });
  const archive = resolve(cache, `${manifest.sha256}.wasm.zst`);
  let bytes = await verifiedBytes(archive, manifest.sha256);
  if (!bytes) {
    const url = `https://github.com/roc-lang/nightlies/releases/download/${manifest.release}/echo.wasm.zst`;
    bytes = await download(url);
    if (sha256(bytes) !== manifest.sha256) throw new Error('Downloaded echo.wasm.zst checksum mismatch');
    await atomicWrite(archive, bytes);
  }
  return zstdDecompressSync(bytes, { maxOutputLength: MAX_RAW_SIZE });
}

async function atomicWrite(path, bytes) {
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function prepare(website, optimizer) {
  const manifest = JSON.parse(await readFile(resolve(website, 'compiler-wasm.json'), 'utf8'));
  const buildSource = await readFile(resolve(website, 'build_website.roc'), 'utf8');
  const compilerTag = buildSource.match(/roc: "([^"]+)"/)?.[1];
  validateManifest(manifest, compilerTag);
  const raw = await loadCompiler(website, manifest);
  // Also invalidate optimized output if Binaryen, flags, or preparation code changes.
  const key = sha256(Buffer.concat([
    raw, await readFile(optimizer), await readFile(resolve(dirname(optimizer), 'wasm-opt.wasm')),
    await readFile(fileURLToPath(import.meta.url)), Buffer.from(JSON.stringify(FLAGS)),
  ]));
  const cache = resolve(website, '.cache/browser-compiler');
  await mkdir(cache, { recursive: true });
  const optimized = resolve(cache, `${key}.wasm`);
  let digest;
  try { digest = (await readFile(`${optimized}.sha256`, 'utf8')).trim(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let bytes = digest && await verifiedBytes(optimized, digest);
  if (!bytes) {
    const input = `${optimized}.input`;
    const output = `${optimized}.output`;
    try {
      await writeFile(input, raw);
      execFileSync(process.execPath, [optimizer, ...FLAGS, input, '-o', output], { stdio: 'inherit' });
      bytes = await readFile(output);
      await atomicWrite(optimized, bytes);
      await atomicWrite(`${optimized}.sha256`, sha256(bytes));
    } finally {
      await rm(input, { force: true });
      await rm(output, { force: true });
    }
  }
  if (bytes.length > MAX_ASSET_SIZE) throw new Error(`Browser compiler exceeds Cloudflare's 25 MiB limit: ${bytes.length} bytes`);
  // Verify the actual homepage ABI, including cached and optimized artifacts.
  const module = await WebAssembly.compile(bytes);
  const exports = WebAssembly.Module.exports(module);
  for (const [name, kind] of [['memory', 'memory'], ['init', 'function'], ['allocateBuffer', 'function'], ['compileAndRun', 'function']]) {
    if (!exports.some(item => item.name === name && item.kind === kind)) throw new Error(`Browser compiler missing export: ${name}`);
  }
  const imports = WebAssembly.Module.imports(module);
  if (imports.some(item => item.module !== 'env' || item.kind !== 'function' || !['js_echo', 'js_stderr'].includes(item.name))) {
    throw new Error('Browser compiler has incompatible imports');
  }
  await mkdir(resolve(website, 'build'), { recursive: true });
  await copyFile(optimized, resolve(website, 'build/echo.wasm'));
  console.log(`Browser compiler ready: ${manifest.release ?? 'legacy bootstrap'} (${bytes.length} bytes)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const website = resolve(dirname(fileURLToPath(import.meta.url)), '../website');
  prepare(website, resolve(process.argv[2])).catch(error => { console.error(error); process.exitCode = 1; });
}
