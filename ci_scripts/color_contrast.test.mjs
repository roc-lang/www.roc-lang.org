import test from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, composite, luminance, contrast, requiredTextContrast, passes } from './color_contrast.mjs';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

test('WCAG contrast math and sRGB threshold', () => {
  assert.equal(contrast([0, 0, 0], [255, 255, 255]), 21);
  assert.equal(contrast([255, 255, 255], [0, 0, 0]), 21);
  assert.equal(contrast([10, 10, 10], [10, 10, 10]), 1);
  assert.ok(Math.abs(luminance([10, 10, 10]) - 10 / 255 / 12.92) < 1e-12);
  assert.ok(Math.abs(contrast([119, 119, 119], [255, 255, 255]) - 4.478089453577214) < 1e-10);
  assert.equal(passes(4.49999, 4.5), false);
  assert.equal(passes(4.5, 4.5), true);
});
test('alpha compositing and computed CSS colors', () => {
  assert.deepEqual(parseColor('rgba(0, 0, 0, 0.5)'), [0, 0, 0, 0.5]);
  assert.deepEqual(parseColor('rgb(1 2 3 / 0.4)'), [1, 2, 3, 0.4]);
  assert.deepEqual(parseColor('#abc'), [170, 187, 204, 1]);
  assert.deepEqual(parseColor('color(srgb 1 0.5 0 / 0.8)'), [255, 127.5, 0, 0.8]);
  assert.deepEqual(composite([0, 0, 0, 0.5], [255, 255, 255, 1]), [127.5, 127.5, 127.5, 1]);
  assert.equal(parseColor('color(display-p3 1 0 0)'), null);
});
test('large text uses CSS pixel thresholds without rounding', () => {
  assert.equal(requiredTextContrast(23.999, 400), 4.5);
  assert.equal(requiredTextContrast(24, 400), 3);
  assert.equal(requiredTextContrast(56 / 3, 700), 3);
  assert.equal(requiredTextContrast(18.66, 700), 4.5);
  assert.equal(requiredTextContrast(20, 600), 4.5);
});

test('browser audit catches custom highlights, alpha, and both themes', {
  skip: process.env.COLOR_CONTRAST_BROWSER_TESTS !== '1',
}, async () => {
  const html = `<!doctype html><html><head><style>
    html { background:white; color:black; font:16px sans-serif; }
    .roc-highlight { color:black; background:white; }
    ::highlight(roc-parameter) { color:#777; }
    .faded { opacity:.5; }
    .large { color:#777; font-size:24px; }
    @media(prefers-color-scheme:dark) {
      html,.roc-highlight { background:black; color:white; }
      ::highlight(roc-parameter) { color:white; }
    }
  </style></head><body>
    <pre class="roc-highlight">lambda parameter</pre>
    <p class="faded">Faded text</p><p class="large">Large text</p>
    <p hidden>Invisible text</p><input disabled value="Inactive text">
  </body></html>`;
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(request.url === '/redirect.html' ? '<meta http-equiv="refresh" content="0;url=/">' : html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const work = await mkdtemp(join(tmpdir(), 'roc-contrast-test-'));
  const output = join(work, 'report.json');
  try {
    let status;
    try {
      await promisify(execFile)(process.execPath, [
        new URL('./check_color_contrast.mjs', import.meta.url).pathname,
        '--base-url', `http://127.0.0.1:${server.address().port}`, '--page', '/', '--page', '/redirect.html', '--json', output,
      ], { timeout: 30000 });
      status = 0;
    } catch (error) { status = error.code; }
    assert.equal(status, 1);
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(report.pages, 4);
    assert.ok(report.reports.filter(row => row.path === '/redirect.html').every(row => new URL(row.finalURL).pathname === '/'));
    const light = report.reports.find(row => row.theme === 'light');
    const dark = report.reports.find(row => row.theme === 'dark');
    assert.ok(light.pairs.some(pair => pair.role === '::highlight(roc-parameter)' && !pair.pass));
    assert.ok(dark.pairs.some(pair => pair.role === '::highlight(roc-parameter)' && pair.pass));
    assert.ok(light.pairs.some(pair => pair.element === 'p.faded' && !pair.pass));
    assert.ok(light.pairs.some(pair => pair.element === 'p.large' && pair.pass && pair.required === 3));
    assert.ok(!report.reports.some(row => row.pairs.some(pair => /Invisible|Inactive/.test(pair.text))));
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(work, { recursive: true, force: true });
  }
});
