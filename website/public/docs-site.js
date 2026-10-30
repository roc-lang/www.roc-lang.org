// The shared header can wrap on narrow screens or when text is zoomed.
// Size the mobile content area to the viewport space below the header.
(() => {
  const header = document.getElementById("top-bar");
  if (!header) return;
  const update = () => document.documentElement.style.setProperty(
    "--site-header-height", `${header.getBoundingClientRect().height}px`,
  );
  update();
  new ResizeObserver(update).observe(header);
})();
