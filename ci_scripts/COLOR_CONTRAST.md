# Rendered color contrast audit

This is a local development tool. It adds no JavaScript or dependencies to the
website. Build and serve the website first (see the root README), then run with
Node.js 24 and an installed Chrome/Chromium:

```sh
node ci_scripts/check_color_contrast.mjs --base-url http://localhost:8080
node ci_scripts/check_color_contrast.mjs --all-pages --json website/.cache/color-contrast.json
node --test ci_scripts/color_contrast.test.mjs
COLOR_CONTRAST_BROWSER_TESTS=1 node --test ci_scripts/color_contrast.test.mjs
```

The default checks the homepage, List documentation, and RandomNumbers example
in **both light and dark themes**. `--all-pages` discovers every `.html` file in
`website/build`, including older documentation, rather than sampling that build.
Use `--build-dir PATH` for another build directory. Repeat `--page /path` to choose
specific pages, or use `--chrome /path/to/chrome` / `CHROME_BIN` for the browser.
The browser runs headless with a temporary profile and is closed after the audit.

The exit status is **0** for no measured text-contrast failures, **1** for contrast
failures, and **2** for a browser, HTTP, or script error. Human output names each
failing page, theme, element/semantic role, foreground/background pair, actual
ratio, and required ratio. `--json PATH` keeps full passing and failing results,
occurrence counts, and manual-review items. Ratios are compared before rounding.
Results deduplicate repeated color/role pairs per page, retaining one example.

## What is measured

The script reads real computed browser styles, so CSS variables, media queries,
font sizes/weights, linked stylesheets, nested backgrounds, alpha transparency,
and ancestor opacity are included. It reads regular visible text, input values,
and placeholders. The invisible textarea text used by the interactive editor is
excluded; its visible highlighted overlay is checked instead.

Every CSS Custom Highlight role is checked against each actual code surface,
including roles absent from that particular example. This catches a bad palette
color before a future code sample happens to use it. Underlying lexical spans
inside semantic code roots are not counted again as ordinary visible text.

[WCAG 2.2 AA SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)
requires **4.5:1** for ordinary text and **3:1** for large text. The script treats
24 CSS pixels as large, or 18⅔ CSS pixels with font weight at least 700. It uses
relative sRGB luminance with the 0.04045 channel threshold and alpha-composited
foreground/background colors. It does not measure anti-aliased screenshot pixels.

## What still needs review

A successful run is a text-color check, **not a claim of full WCAG conformance**.
Manual-review items are listed separately and are never counted as passes:

- Gradient/image backgrounds, filters, blending, and unsupported color spaces.
- Meaningful icons/graphics and logos, whose contextual exemptions cannot be inferred.
- Generated `::before`/`::after` content and text shadows.
- Control boundaries, hover/focus/disabled states, and whether a visual cue is
  essential to identify a control. [SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast)
  requires **3:1** for meaningful non-text cues; simply testing every decorative
  border against that threshold would produce misleading failures.

Hidden text and inactive controls are excluded from text contrast, as required
by SC 1.4.3's incidental-content exceptions. Off-screen page text is included;
this is a page audit rather than a viewport-only screenshot test. Text from
iframes, canvas, images, and SVG is not measured as ordinary HTML text. Dynamic
states not present after the page loads require a separate interaction review.
