import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { loadCompiler, sha256, validateManifest } from './prepare_compiler_wasm.mjs';

const release = 'nightly-2026-10-01-a932c65';
const raw = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
const archive = zstdCompressSync(raw);
const manifest = { release, sha256: sha256(archive) };

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'roc-wasm-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('reject mismatched releases and malformed checksums before downloading', () => {
  validateManifest(manifest, release);
  assert.throws(() => validateManifest(manifest, 'nightly-2026-09-03-62fcb65'), /must match/);
  assert.throws(() => validateManifest({ ...manifest, sha256: 'abc' }, release), /SHA256/);
  assert.throws(() => validateManifest({ ...manifest, release: '../bad' }, release), /must match/);
});

test('download, verify, decompress, reuse cache, and replace corrupt cache', async t => {
  const dir = await fixture(t);
  let calls = 0;
  const download = async url => {
    assert.equal(url, `https://github.com/roc-lang/nightlies/releases/download/${release}/echo.wasm.zst`);
    calls++;
    return archive;
  };
  assert.deepEqual(await loadCompiler(dir, manifest, download), raw);
  assert.deepEqual(await loadCompiler(dir, manifest, download), raw);
  assert.equal(calls, 1);
  await writeFile(join(dir, '.cache/browser-compiler', `${manifest.sha256}.wasm.zst`), 'corrupt');
  assert.deepEqual(await loadCompiler(dir, manifest, download), raw);
  assert.equal(calls, 2);
  const nextRaw = Buffer.concat([raw, Buffer.from('changed')]);
  const nextArchive = zstdCompressSync(nextRaw);
  assert.deepEqual(await loadCompiler(dir, { ...manifest, sha256: sha256(nextArchive) }, async () => nextArchive), nextRaw);
});

test('bad downloads, missing artifacts, and corrupt archives fail without legacy fallback', async t => {
  const dir = await fixture(t);
  await assert.rejects(loadCompiler(dir, manifest, async () => Buffer.from('bad')), /checksum/);
  await assert.rejects(loadCompiler(dir, manifest, async () => { throw new Error('HTTP 404'); }), /404/);
  const bad = Buffer.from('not a zstd archive');
  await assert.rejects(loadCompiler(dir, { ...manifest, sha256: sha256(bad) }, async () => bad));
});

test('legacy bootstrap is explicit and checksum verified', async t => {
  const dir = await fixture(t);
  await mkdir(join(dir, 'public'));
  await writeFile(join(dir, 'public/echo.wasm'), raw);
  const legacy = { release: null, sha256: sha256(raw) };
  validateManifest(legacy, release);
  assert.deepEqual(await loadCompiler(dir, legacy, () => { throw new Error('must not download'); }), raw);
  await writeFile(join(dir, 'public/echo.wasm'), 'changed');
  await assert.rejects(loadCompiler(dir, legacy), /checksum/);
});
