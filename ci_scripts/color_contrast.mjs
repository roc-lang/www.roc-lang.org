// WCAG 2.2 contrast math. Channels are sRGB bytes; alpha is 0..1.
export function parseColor(value) {
  if (value === 'transparent') return [0, 0, 0, 0];
  const hex = /^#([a-f\d]{6}|[a-f\d]{3})$/i.exec(value);
  if (hex) {
    const full = hex[1].length === 3 ? [...hex[1]].map(x => x + x).join('') : hex[1];
    return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)).concat(1);
  }
  const srgb = /^color\(srgb\s+([^)]*)\)$/.exec(value);
  if (srgb) {
    const parts = srgb[1].trim().split(/[\s/]+/).map(Number);
    if (parts.length < 3 || parts.length > 4 || !parts.every(Number.isFinite)) return null;
    return parts.slice(0, 3).map(c => Math.min(255, Math.max(0, c * 255))).concat(parts[3] ?? 1);
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(value);
  if (!rgb) return null;
  const parts = rgb[1].trim().split(/[\s,/]+/);
  if (parts.length < 3 || parts.length > 4 || parts.some(x => x.endsWith('%'))) return null;
  const numbers = parts.map(Number);
  return numbers.every(Number.isFinite) ? [...numbers.slice(0, 3), numbers[3] ?? 1] : null;
}
export function composite(foreground, background) {
  const alpha = foreground[3] + background[3] * (1 - foreground[3]);
  if (!alpha) return [0, 0, 0, 0];
  return foreground.slice(0, 3).map((c, i) =>
    (c * foreground[3] + background[i] * background[3] * (1 - foreground[3])) / alpha,
  ).concat(alpha);
}
export function luminance(color) {
  const linear = color.slice(0, 3).map(channel => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
export function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function requiredTextContrast(fontSize, fontWeight) {
  return fontSize >= 24 || (fontSize >= 56 / 3 && fontWeight >= 700) ? 3 : 4.5;
}
export function passes(ratio, required) { return ratio >= required; }
