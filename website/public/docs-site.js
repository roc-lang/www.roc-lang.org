// The shared header can wrap on narrow screens or when text is zoomed.
// Keep the mobile sidebar/search below its actual height.
(() => {
  const header = document.getElementById("top-bar");
  if (!header) return;
  const update = () => document.documentElement.style.setProperty(
    "--site-header-height", `${header.getBoundingClientRect().height}px`,
  );
  update();
  new ResizeObserver(update).observe(header);
})();
