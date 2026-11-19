// Decorative triangle-lattice background. It follows the system color scheme
// and is purely visual: without JavaScript the page keeps its plain background.
(() => {
  'use strict';

  const CONFIG = {
    minSide: 170,          // triangle side length, clamped (CSS px)
    maxSide: 280,
    sidePerWidth: 1 / 4,   // side = viewport width * this, then clamped
    starDensity: 0.34,     // share of grid nodes that glow
    fillDensity: 0.10,     // share of triangles with a faint tint
    subdivideChance: 0.3,  // share of triangles split into four smaller ones
    nestedChance: 0.3,     // share of those smaller ones that are split again
    subdivideDepth: 1,     // how many times a triangle can be split
    subdivideWeight: 0.15, // opacity of the subdivision lines
    fadeSides: 0.3         // share of triangle sides that fade to nothing at one end
  };

  // Colours are "r, g, b" strings; glow and vignette entries are [rgb, alpha].
  // The base colour is read from site.css's --body-bg-color.
  const THEMES = {
    dark: {
      glowA: ['22, 32, 110', 0.24],
      glowB: ['44, 32, 124', 0.16],
      vignette: ['3, 4, 12', 0.6],
      lineColor: '72, 96, 255',
      lineAlpha: 1,
      lineMax: 0.85,
      starColor: '150, 80, 255',
      flareColor: '190, 140, 255',
      coreColor: '214, 180, 255',
      glowAlpha: [0.5, 0.2],
      flareAlpha: 0.4,
      coreAlpha: 0.55,
      starBlend: 'lighter'
    },
    light: {
      glowA: ['214, 206, 255', 0.22],
      glowB: ['198, 220, 255', 0.2],
      vignette: ['250, 250, 255', 0.55],
      lineColor: '128, 136, 226',
      lineAlpha: 0.75,
      lineMax: 0.5,
      starColor: '139, 92, 246',
      flareColor: '139, 92, 246',
      coreColor: '109, 40, 217',
      glowAlpha: [0.28, 0.1],
      flareAlpha: 0.45,
      coreAlpha: 0.9,
      starBlend: 'source-over'
    }
  };

  const ROW = Math.sqrt(3) / 2;
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  let backdrop, bctx, canvas, ctx;
  let T = THEMES.light;
  let background = '#ffffff';
  let W = 0, H = 0;
  let side = 0, rowH = 0;
  let ox = 0, oy = 0;

  // Deterministic hash of two integers and a seed, in [0, 1).
  function hash(a, b, seed) {
    let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(seed, 1274126177);
    n = Math.imul(n ^ (n >>> 13), 1103515245);
    n = Math.imul(n ^ (n >>> 15), 2246822519);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  }

  // Smooth 2D value noise in [0, 1].
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const top = hash(xi, yi, 7) + (hash(xi + 1, yi, 7) - hash(xi, yi, 7)) * u;
    const bot = hash(xi, yi + 1, 7) + (hash(xi + 1, yi + 1, 7) - hash(xi, yi + 1, 7)) * u;
    return top + (bot - top) * v;
  }

  // Brightness field: where the grid fades in and out.
  function field(x, y) {
    const f = 1 / 460;
    const n = 0.6 * noise(x * f, y * f + 3.1)
            + 0.4 * noise(x * f * 2.3, y * f * 2.3 + 11.7);
    return 0.25 + 1.7 * n * n;
  }

  const rgba = (rgb, alpha) => 'rgba(' + rgb + ',' + alpha.toFixed(4) + ')';
  const nodeX = (a, b) => ox + a * side + b * side / 2;
  const nodeY = (b) => oy + b * rowH;

  // Brightness of the star at a node, 0 if the node has no star.
  function star(a, b) {
    if (hash(a, b, 11) >= CONFIG.starDensity) return 0;
    return 0.62 + 0.38 * Math.sin(hash(a, b, 14) * Math.PI * 2);
  }

  // Star at a point halfway along a grid side, keyed on a half-step lattice so
  // it is the same whichever neighbouring triangle produced it.
  function cornerStar(x, y) {
    const b2f = 2 * (y - oy) / rowH;
    const a2f = 2 * (x - ox) / side - b2f / 2;
    const a2 = Math.round(a2f), b2 = Math.round(b2f);
    if (Math.abs(a2f - a2) > 1e-4 || Math.abs(b2f - b2) > 1e-4) return null;
    if (!(a2 & 1) && !(b2 & 1)) return null;
    if (hash(a2, b2, 15) >= CONFIG.starDensity) return null;
    return {
      key: a2 + ',' + b2, x, y,
      level: 0.62 + 0.38 * Math.sin(hash(a2, b2, 17) * Math.PI * 2),
      size: hash(a2, b2, 16)
    };
  }
  const cornerStars = new Map();

  // Every second line is a "major" line, so larger triangles read through.
  function lineWeight(family, k) {
    const base = (k & 1) ? 0.12 : 0.27;
    return base * (0.6 + 0.8 * hash(k, family, 21));
  }

  // Stroke one straight line whose opacity varies node to node.
  // pts is a flat list: x, y, alpha, x, y, alpha, ...
  function strokeLine(pts) {
    const n = pts.length / 3;
    if (n < 2) return;
    const x0 = pts[0], y0 = pts[1];
    const x1 = pts[pts.length - 3], y1 = pts[pts.length - 2];
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    for (let i = 0; i < n; i++) {
      const alpha = Math.min(T.lineMax, pts[i * 3 + 2] * T.lineAlpha);
      grad.addColorStop(i / (n - 1), rgba(T.lineColor, alpha));
    }
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // 0 drawn normally, 1 fades out towards its far end, -1 towards its near end.
  function sideFade(a, b, family) {
    if (hash(a, b, 50 + family) >= CONFIG.fadeSides) return 0;
    return hash(a, b, 60 + family) < 0.5 ? 1 : -1;
  }

  const segment = [];
  function strokeFaded(x0, y0, alpha0, x1, y1, alpha1, fade) {
    segment.length = 0;
    segment.push(x0, y0, fade < 0 ? 0 : alpha0, x1, y1, fade > 0 ? 0 : alpha1);
    strokeLine(segment);
  }

  function strokeSegment(x0, y0, x1, y1, weight, fade) {
    const alpha = (x, y) => {
      const s = cornerStar(x, y);
      return weight * field(x, y) + (s ? s.level * 0.3 : 0);
    };
    strokeFaded(x0, y0, alpha(x0, y0), x1, y1, alpha(x1, y1), fade);
  }

  // Split a triangle into four by joining the midpoints of its sides.
  function subdivide(x0, y0, x1, y1, x2, y2, id, depth) {
    const ax = (x0 + x1) / 2, ay = (y0 + y1) / 2;
    const bx = (x1 + x2) / 2, by = (y1 + y2) / 2;
    const cx = (x2 + x0) / 2, cy = (y2 + y0) / 2;
    const weight = CONFIG.subdivideWeight * Math.pow(0.8, depth - 1) * (0.6 + 0.8 * hash(id, depth, 42));
    const fade = (j) => hash(id, depth * 3 + j, 44) >= CONFIG.fadeSides ? 0
                      : hash(id, depth * 3 + j, 45) < 0.5 ? 1 : -1;
    strokeSegment(ax, ay, bx, by, weight, fade(0));
    strokeSegment(bx, by, cx, cy, weight, fade(1));
    strokeSegment(cx, cy, ax, ay, weight, fade(2));
    for (const [px, py] of [[ax, ay], [bx, by], [cx, cy]]) {
      const s = cornerStar(px, py);
      if (s) cornerStars.set(s.key, s);
    }
    if (depth >= CONFIG.subdivideDepth) return;

    const kids = [
      [x0, y0, ax, ay, cx, cy],
      [ax, ay, x1, y1, bx, by],
      [cx, cy, bx, by, x2, y2],
      [ax, ay, bx, by, cx, cy]
    ];
    for (let i = 0; i < 4; i++) {
      const kid = (Math.imul(id, 31) + i + 1) | 0;
      if (hash(kid, depth, 43) >= CONFIG.nestedChance) continue;
      const k = kids[i];
      subdivide(k[0], k[1], k[2], k[3], k[4], k[5], kid, depth + 1);
    }
  }

  function drawStar(x, y, level, size) {
    const radius = 8.5 + 8.5 * size;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, rgba(T.starColor, T.glowAlpha[0] * level));
    glow.addColorStop(0.3, rgba(T.starColor, T.glowAlpha[1] * level));
    glow.addColorStop(1, rgba(T.starColor, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Four-point sparkle.
    const arm = 3 + 4 * size * level;
    for (let i = 0; i < 2; i++) {
      const dx = i === 0 ? arm : 0, dy = i === 0 ? 0 : arm;
      const flare = ctx.createLinearGradient(x - dx, y - dy, x + dx, y + dy);
      flare.addColorStop(0, rgba(T.flareColor, 0));
      flare.addColorStop(0.5, rgba(T.flareColor, T.flareAlpha * level));
      flare.addColorStop(1, rgba(T.flareColor, 0));
      ctx.strokeStyle = flare;
      ctx.beginPath();
      ctx.moveTo(x - dx, y - dy);
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
    }

    ctx.fillStyle = rgba(T.coreColor, T.coreAlpha * level);
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + 0.5 * size, 0, Math.PI * 2);
    ctx.fill();
  }

  // Radial gradient used to shade the edges of the viewport.
  function edgeGradient(c, rgb, alpha) {
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    g.addColorStop(0, rgba(rgb, 0));
    g.addColorStop(1, rgba(rgb, alpha));
    return g;
  }

  function drawBackdrop() {
    const span = Math.max(W, H);
    bctx.fillStyle = background;
    bctx.fillRect(0, 0, W, H);
    const glowA = bctx.createRadialGradient(W * 0.5, H * 0.32, 0, W * 0.5, H * 0.32, span * 0.75);
    glowA.addColorStop(0, rgba(T.glowA[0], T.glowA[1]));
    glowA.addColorStop(1, rgba(T.glowA[0], 0));
    bctx.fillStyle = glowA;
    bctx.fillRect(0, 0, W, H);
    const glowB = bctx.createRadialGradient(W * 0.86, H * 0.9, 0, W * 0.86, H * 0.9, span * 0.55);
    glowB.addColorStop(0, rgba(T.glowB[0], T.glowB[1]));
    glowB.addColorStop(1, rgba(T.glowB[0], 0));
    bctx.fillStyle = glowB;
    bctx.fillRect(0, 0, W, H);
    bctx.fillStyle = edgeGradient(bctx, T.vignette[0], T.vignette[1]);
    bctx.fillRect(0, 0, W, H);
  }

  function draw() {
    drawBackdrop();
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    const bMin = Math.floor(-oy / rowH) - 1;
    const bMax = Math.ceil((H - oy) / rowH) + 1;
    const half = side / 2;
    const rowStart = (b) => Math.floor((-ox - b * half) / side) - 1;
    const rowEnd = (b) => Math.ceil((W - ox - b * half) / side) + 1;

    // Visit every lattice triangle on screen, one pointing up and one down per cell.
    const eachTriangle = (fn) => {
      for (let b = bMin; b < bMax; b++) {
        const aEnd = rowEnd(b);
        for (let a = rowStart(b); a < aEnd; a++) {
          for (let down = 0; down < 2; down++) {
            fn(a * 2 + down, b,
               nodeX(a + down, b), nodeY(b),
               nodeX(a + 1, b + down), nodeY(b + down),
               nodeX(a, b + 1), nodeY(b + 1));
          }
        }
      }
    };

    // Faintly tinted triangles.
    eachTriangle((col, row, x0, y0, x1, y1, x2, y2) => {
      if (hash(col, row, 31) >= CONFIG.fillDensity) return;
      const level = field((x0 + x1 + x2) / 3, (y0 + y1 + y2) / 3);
      const alpha = (0.008 + 0.03 * hash(col, row, 32)) * level * T.lineAlpha;
      ctx.fillStyle = rgba(T.lineColor, alpha);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.closePath();
      ctx.fill();
    });

    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';

    cornerStars.clear();
    eachTriangle((col, row, x0, y0, x1, y1, x2, y2) => {
      if (hash(col, row, 41) >= CONFIG.subdivideChance) return;
      subdivide(x0, y0, x1, y1, x2, y2, Math.imul(col, 73856093) ^ Math.imul(row, 19349663), 1);
    });

    // Grid lines in three families, brightening towards a star.
    const pts = [];
    const gridLine = (family, weight, from, to, nodeAt) => {
      pts.length = 0;
      let prevA = 0, prevB = 0, prevX = 0, prevY = 0, prevAlpha = 0;
      for (let i = from; i <= to; i++) {
        const [a, b] = nodeAt(i);
        const x = nodeX(a, b), y = nodeY(b);
        const alpha = weight * field(x, y) + star(a, b) * 0.4;
        const fade = i > from ? sideFade(prevA, prevB, family) : 0;
        if (fade !== 0) {
          strokeLine(pts);
          pts.length = 0;
          strokeFaded(prevX, prevY, prevAlpha, x, y, alpha, fade);
        }
        pts.push(x, y, alpha);
        prevA = a; prevB = b; prevX = x; prevY = y; prevAlpha = alpha;
      }
      strokeLine(pts);
    };

    for (let b = bMin; b <= bMax; b++) {
      gridLine(0, lineWeight(0, b), rowStart(b), rowEnd(b), (a) => [a, b]);
    }
    const aMin = Math.floor((-ox - bMax * half) / side) - 1;
    const aMax = Math.ceil((W - ox - bMin * half) / side) + 1;
    for (let a = aMin; a <= aMax; a++) {
      gridLine(1, lineWeight(1, a), bMin, bMax, (b) => [a, b]);
    }
    const cMin = Math.floor((-ox + bMin * half) / side) - 1;
    const cMax = Math.ceil((W - ox + bMax * half) / side) + 1;
    for (let c = cMin; c <= cMax; c++) {
      gridLine(2, lineWeight(2, c), bMin, bMax, (b) => [c - b, b]);
    }

    // Fade the lines out towards the edges.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = edgeGradient(ctx, '0, 0, 0', T.vignette[1]);
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = T.starBlend;
    for (let b = bMin; b <= bMax; b++) {
      const aEnd = rowEnd(b);
      for (let a = rowStart(b); a <= aEnd; a++) {
        const level = star(a, b);
        if (level > 0) drawStar(nodeX(a, b), nodeY(b), level, hash(a, b, 12));
      }
    }
    for (const s of cornerStars.values()) drawStar(s.x, s.y, s.level, s.size);
    ctx.globalCompositeOperation = 'source-over';
  }

  function applyTheme() {
    T = darkQuery.matches ? THEMES.dark : THEMES.light;
    background = getComputedStyle(document.documentElement)
      .getPropertyValue('--body-bg-color').trim() || background;
  }

  // The canvases are as tall as the largest viewport (see site.css), so mobile
  // browsers showing or hiding their toolbars don't trigger a repaint.
  function render() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.round(rect.width), height = Math.round(rect.height);
    if (width === W && height === H) return;
    W = width;
    H = height;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const [c, cx] of [[backdrop, bctx], [canvas, ctx]]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    side = Math.max(CONFIG.minSide, Math.min(CONFIG.maxSide, W * CONFIG.sidePerWidth));
    rowH = side * ROW;
    ox = W / 2;
    oy = rowH * 0.42;

    draw();
  }

  function init() {
    backdrop = document.createElement('canvas');
    canvas = document.createElement('canvas');
    backdrop.id = 'bg-backdrop';
    canvas.id = 'bg-pattern';
    for (const c of [backdrop, canvas]) {
      c.setAttribute('aria-hidden', 'true');
      document.body.prepend(c);
    }
    bctx = backdrop.getContext('2d');
    ctx = canvas.getContext('2d');
    if (!bctx || !ctx) return;

    applyTheme();
    render();

    let pending = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(render);
    });
    darkQuery.addEventListener('change', () => {
      applyTheme();
      draw();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
