#!/usr/bin/env node
// Local development audit: no code or dependencies are added to the website.
import { spawn } from 'node:child_process';
import { accessSync, constants as fsConstants } from 'node:fs';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as math from './color_contrast.mjs';

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(Error('Chrome debugging connection closed'));
      }
      this.pending.clear();
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new CDP(socket);
  }
  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error(`Chrome timed out: ${method}`)); }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression, retryNavigation = false) {
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description);
        return result.result.value;
      } catch (error) {
        // A new document can replace the execution context between Page.navigate
        // and Runtime.evaluate. Retry only that browser lifecycle condition.
        if (!retryNavigation || attempt >= 20 || !/navigated or closed|Execution context|Cannot find context|Promise was collected/.test(error.message)) throw error;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
  close() { this.socket.close(); }
}

// Serialized into Chrome with the WCAG math functions. It reads computed styles,
// including CSS Custom Highlight pseudo styles, rather than parsing CSS text.
function auditPage() {
  const pairs = new Map(), manual = new Map();
  const canvasProbe = document.createElement('span');
  canvasProbe.style.cssText = 'position:fixed;visibility:hidden;background-color:Canvas';
  document.documentElement.append(canvasProbe);
  const canvas = parseColor(getComputedStyle(canvasProbe).backgroundColor);
  canvasProbe.remove();
  if (!canvas || canvas[3] !== 1) throw Error('Cannot resolve the browser canvas color');
  const styleCache = new WeakMap();
  const styleOf = element => {
    if (!styleCache.has(element)) styleCache.set(element, getComputedStyle(element));
    return styleCache.get(element);
  };
  const identify = element => {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const classes = [...element.classList].slice(0, 3).map(c => `.${CSS.escape(c)}`).join('');
    return element.localName + classes;
  };
  const review = (reason, element) => {
    const key = reason + ':' + identify(element);
    const item = manual.get(key) || { reason, element: identify(element), occurrences: 0 };
    item.occurrences++;
    manual.set(key, item);
  };
  const visible = element => element instanceof HTMLElement && element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !element.closest(':disabled,[aria-disabled="true"],script,style,template,noscript');
  function surfaces(element, foreground, highlightBackground) {
    let ink = parseColor(foreground), paper = [0, 0, 0, 0];
    if (!ink) return { reason: `Unsupported foreground ${foreground}` };
    if (!ink[3]) return { transparent: true };
    if (highlightBackground) {
      const background = parseColor(highlightBackground);
      if (!background) return { reason: `Unsupported highlight background ${highlightBackground}` };
      ink = composite(ink, background);
      paper = background;
    }
    for (let node = element; node; node = node.parentElement) {
      const style = styleOf(node);
      if (style.backgroundImage !== 'none' || style.mixBlendMode !== 'normal' || style.filter !== 'none' || (style.backdropFilter && style.backdropFilter !== 'none')) return { reason: 'Image, gradient, filter, or blending requires visual review' };
      const background = parseColor(style.backgroundColor);
      if (!background) return { reason: `Unsupported background ${style.backgroundColor}` };
      ink = composite(ink, background);
      paper = composite(paper, background);
      const opacity = Number(style.opacity);
      ink[3] *= opacity;
      paper[3] *= opacity;
    }
    return { ink: composite(ink, canvas), paper: composite(paper, canvas) };
  }
  function record(element, label, color, style, text, highlightBackground) {
    const colors = surfaces(element, color, highlightBackground);
    if (colors.transparent) return;
    if (colors.reason) { review(colors.reason, element); return; }
    if (style.textShadow && style.textShadow !== 'none') review('Text shadow may affect contrast; shadow excluded from calculation', element);
    const fontSize = parseFloat(style.fontSize), fontWeight = Number(style.fontWeight) || 400;
    const required = requiredTextContrast(fontSize, fontWeight);
    const ratio = contrast(colors.ink, colors.paper);
    const hex = color => '#' + color.slice(0, 3).map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
    const foreground = hex(colors.ink), background = hex(colors.paper);
    // Keep fractional computed channels in the identity: rounding to hex before
    // deduplication could merge colors on opposite sides of the AA threshold.
    const key = [label, ...colors.ink, ...colors.paper, required].join(':');
    const result = pairs.get(key) || {
      role: label, foreground, background, ratio, required, pass: passes(ratio, required),
      foregroundRGBA: colors.ink, backgroundRGBA: colors.paper,
      element: identify(element), fontSize, fontWeight, text: text.trim().slice(0, 100), occurrences: 0,
    };
    result.occurrences++;
    pairs.set(key, result);
  }
  const roots = [...document.querySelectorAll('.roc-highlight,.roc-source-highlight')].filter(visible);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let text;
  while ((text = walker.nextNode())) {
    const element = text.parentElement;
    if (!text.nodeValue.trim() || !visible(element)) continue;
    // Custom highlights paint over the underlying text. Audit all their roles
    // separately on each actual code surface, instead of double-counting spans.
    if (element.closest('.roc-highlight,.roc-source-highlight')) continue;
    const style = styleOf(element);
    if ((style.backgroundClip === 'text' || style.webkitBackgroundClip === 'text') && style.backgroundImage !== 'none') {
      review('Image or gradient clipped to text requires visual review', element);
      continue;
    }
    record(element, 'text', style.webkitTextFillColor || style.color, style, text.nodeValue);
  }
  const highlightNames = new Set(CSS.highlights ? [...CSS.highlights.keys()] : []);
  function rules(list) {
    for (const rule of list) {
      for (const match of rule.selectorText?.matchAll(/::highlight\(([^)]+)\)/g) || []) highlightNames.add(match[1]);
      if (rule.cssRules) rules(rule.cssRules);
    }
  }
  for (const sheet of document.styleSheets) {
    try { rules(sheet.cssRules); } catch { review('Cross-origin stylesheet cannot be enumerated', document.documentElement); }
  }
  for (const root of roots) {
    const base = styleOf(root);
    record(root, 'code base', base.color, base, root.textContent);
    for (const name of highlightNames) {
      const style = getComputedStyle(root, `::highlight(${name})`);
      record(root, `::highlight(${name})`, style.color, base, root.textContent, style.backgroundColor);
    }
  }
  for (const element of document.querySelectorAll('input,textarea,select,button,[role="button"]')) {
    if (!visible(element)) continue;
    const style = styleOf(element);
    if ('value' in element && element.value) record(element, 'input text', style.color, style, element.value);
    if (element.placeholder) {
      const placeholder = getComputedStyle(element, '::placeholder');
      // Pseudo-element opacity is additional to element/group opacity.
      const color = parseColor(placeholder.color);
      if (color) color[3] *= Number(placeholder.opacity);
      const value = color ? `rgba(${color.join(',')})` : placeholder.color;
      record(element, 'placeholder', value, style, element.placeholder);
    }
    review('Control boundary, focus, hover, and disabled-state cues require non-text contrast review (SC 1.4.11)', element);
  }
  for (const element of document.querySelectorAll('body *')) {
    if (!visible(element)) continue;
    for (const pseudo of ['::before', '::after']) {
      const content = getComputedStyle(element, pseudo).content;
      if (content && !['none', 'normal', '""', "''"].includes(content)) review(`Generated ${pseudo} text/icon content requires review`, element);
    }
  }
  for (const element of document.querySelectorAll('svg,img')) if (element.getClientRects().length) review('Logo/graphical content needs contextual review; decorative and logo exemptions are not inferred', element);
  return { pairs: [...pairs.values()], manualReview: [...manual.values()], codeSurfaces: roots.length, highlightRoles: [...highlightNames].sort() };
}

async function htmlPages(directory, prefix = '') {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) paths.push(...await htmlPages(join(directory, entry.name), path + '/'));
    else if (entry.isFile() && entry.name.endsWith('.html')) paths.push('/' + path);
  }
  return paths.sort();
}
function chromeBinary(explicit) {
  for (const candidate of [explicit, process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean)) {
    try { accessSync(candidate, fsConstants.X_OK); return candidate; } catch {}
  }
  throw Error('Chrome not found. Pass --chrome /path/to/chrome or set CHROME_BIN.');
}
async function launchChrome(binary, profile) {
  const child = spawn(binary, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const address = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(Error('Chrome did not start: ' + stderr.slice(-1500))); }, 15000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); reject(Error(`Chrome exited ${code}: ${stderr.slice(-1500)}`)); });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(new URL(match[1])); }
    });
  });
  return { child, address };
}
async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(['--all-pages', '--help']);
  const options = new Set(['--base-url', '--page', '--build-dir', '--chrome', '--json']);
  for (let index = 0; index < args.length; index++) {
    if (flags.has(args[index])) continue;
    if (!options.has(args[index])) throw Error(`Unknown argument: ${args[index]}`);
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw Error(`Missing value: ${args[index]}`);
    index++;
  }
  const value = (name, fallback) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1]; };
  if (args.includes('--help')) {
    console.log('node ci_scripts/check_color_contrast.mjs [--base-url URL] [--page /path ...] [--all-pages] [--build-dir website/build] [--chrome PATH] [--json PATH]');
    return;
  }
  const base = new URL(value('--base-url', 'http://localhost:8080'));
  let pages = args.flatMap((argument, index) => argument === '--page' ? [args[index + 1]] : []);
  if (args.includes('--all-pages')) pages = await htmlPages(resolve(value('--build-dir', 'website/build')));
  if (!pages.length) pages = ['/', '/docs/main/List/', '/examples/RandomNumbers/README.html'];
  if (pages.some(page => !page || new URL(page, base).origin !== base.origin)) throw Error('Every page must be on the base URL origin.');
  const profile = await mkdtemp(join(tmpdir(), 'roc-color-audit-'));
  let browser, connection;
  const reports = [];
  try {
    browser = await launchChrome(chromeBinary(value('--chrome')), profile);
    const origin = `http://${browser.address.host}`;
    const response = await fetch(`${origin}/json/new?about:blank`, { method: 'PUT' });
    if (!response.ok) throw Error('Could not create Chrome audit tab');
    connection = await CDP.connect((await response.json()).webSocketDebuggerUrl);
    await connection.send('Page.enable');
    await connection.send('Runtime.enable');
    await connection.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    const definitions = ['parseColor', 'composite', 'luminance', 'contrast', 'requiredTextContrast', 'passes'].map(name => `const ${name}=${math[name].toString()};`).join('\n');
    for (const theme of ['light', 'dark']) {
      await connection.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
      for (const path of [...new Set(pages)]) {
        const url = new URL(path, base).href;
        const check = await fetch(url);
        if (!check.ok) throw Error(`${url}: HTTP ${check.status}`);
        const previousTimeOrigin = await connection.evaluate('performance.timeOrigin');
        const navigation = await connection.send('Page.navigate', { url });
        if (navigation.errorText) throw Error(`${url}: ${navigation.errorText}`);
        await connection.evaluate(`(async()=>{
          const expected=new URL(${JSON.stringify(url)});
          while(document.readyState!=='complete'||performance.timeOrigin===${previousTimeOrigin})await new Promise(r=>setTimeout(r,25));
          if(location.origin!==expected.origin)throw Error('Navigation left the audit origin: '+location.href);
          await document.fonts.ready;await new Promise(r=>setTimeout(r,200));return true;
        })()`, true);
        const result = await connection.evaluate(`(()=>{${definitions}\nreturn {finalURL:location.href,...(${auditPage.toString()})()};})()`, true);
        reports.push({ path, theme, ...result });
        const failed = result.pairs.filter(pair => !pair.pass);
        console.log(`${theme.padEnd(5)} ${path}: ${result.pairs.length} color/role pairs, ${failed.length} failures, ${result.manualReview.length} manual-review groups`);
        for (const pair of failed) console.log(`  FAIL ${pair.role} ${pair.foreground} on ${pair.background}: ${pair.ratio.toFixed(3)}:1 < ${pair.required}:1 (${pair.element}; ${JSON.stringify(pair.text.slice(0,60))})`);
      }
    }
    const failures = reports.flatMap(report => report.pairs.filter(pair => !pair.pass).map(pair => ({ path: report.path, theme: report.theme, ...pair })));
    const report = { standard: 'WCAG 2.2 AA SC 1.4.3', baseURL: base.href, pages: reports.length, failures: failures.length, reports };
    if (value('--json')) await writeFile(resolve(value('--json')), JSON.stringify(report, null, 2) + '\n');
    console.log(`\n${failures.length ? 'FAIL' : 'PASS'}: ${failures.length} failing text color/role pairs across ${reports.length} page/theme checks. Manual-review items are not passes.`);
    process.exitCode = failures.length ? 1 : 0;
  } finally {
    connection?.close();
    if (browser) {
      const stopped = new Promise(resolve => browser.child.once('exit', resolve));
      browser.child.kill();
      await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 2000))]);
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 2; });
