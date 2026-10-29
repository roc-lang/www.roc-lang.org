// Compare shared website JS with the production minifier. Compress each HTTP
// resource separately: concatenating first would understate today's transfer size.
// Usage: node ci_scripts/measure_highlight_size.mjs --baseline REF --minifier PATH
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const option = name => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const baseline = option('--baseline');
if (!baseline) throw Error('Specify --baseline REF (before semantic highlighting: 56b8dbc)');
const minifier = option('--minifier') || 'minify';
const assets = ['compiler.js', 'roc-syntax.js', 'roc-builtin-metadata.js'];
const pathFor = name => `website/public/${name}`;
const git = args => execFileSync('git', args, { cwd: root });
const baselineFiles = new Set(git(['ls-tree', '--name-only', baseline, '--',
  ...assets.map(pathFor)]).toString().trim().split('\n'));
const work = mkdtempSync(join(tmpdir(), 'roc-js-size-'));
const statistics = (name, source) => {
  const path = join(work, name);
  writeFileSync(path, source);
  const minified = execFileSync(minifier, [path]);
  return {
    asset: name,
    source: source.length,
    minified: minified.length,
    gzip9: gzipSync(minified, { level: 9 }).length,
    brotli11: brotliCompressSync(minified, { params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
    } }).length,
  };
};
const total = rows => Object.fromEntries(['source', 'minified', 'gzip9', 'brotli11']
  .map(key => [key, rows.reduce((sum, row) => sum + row[key], 0)]));
try {
  const before = assets.filter(name => baselineFiles.has(pathFor(name)))
    .map(name => statistics(name, git(['show', `${baseline}:${pathFor(name)}`])));
  const after = assets.map(name => statistics(name, readFileSync(join(root, pathFor(name)))));
  const beforeTotal = total(before), afterTotal = total(after);
  const delta = Object.fromEntries(Object.keys(beforeTotal).map(key => [key, {
    bytes: afterTotal[key] - beforeTotal[key],
    percent: Number(((afterTotal[key] / beforeTotal[key] - 1) * 100).toFixed(1)),
  }]));

  console.log(JSON.stringify({
    baseline: git(['rev-parse', baseline]).toString().trim(),
    head: git(['rev-parse', 'HEAD']).toString().trim(),
    minifier: execFileSync(minifier, ['--version']).toString().trim(),
    productionMinifier: readFileSync(join(root, 'build_cloudflare.sh'), 'utf8')
      .match(/go install (github\.com\/tdewolff\/minify[^\s]+)/)?.[1],
    node: process.version,
    compressionLibraries: { zlib: process.versions.zlib, brotli: process.versions.brotli },
    scope: 'shared website JS only; excludes unchanged documentation search JS and browser compiler WASM',
    units: 'bytes; gzip level 9 and Brotli quality 11, each minified resource independently',
    before, after, beforeTotal, afterTotal, delta,
  }, null, 2));
} finally {
  rmSync(work, { recursive: true, force: true });
}
