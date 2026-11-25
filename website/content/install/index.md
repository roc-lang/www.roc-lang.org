# Install Roc

<script>
// Send visitors on a desktop OS to its guide, once per browser session so the
// Install link can still reach this page with all the options.
(function () {
    try {
        if (location.search.includes("all")) return;
        if (sessionStorage.getItem("installRedirected")) return;
        const ua = navigator.userAgent;
        if (/Android|iPhone|iPad|iPod|CrOS/.test(ua)) return;
        const platform =
            (navigator.userAgentData && navigator.userAgentData.platform) ||
            navigator.platform ||
            "";
        let target = null;
        if (/Win/i.test(platform)) target = "windows";
        else if (/Mac/i.test(platform) && !(navigator.maxTouchPoints > 1)) target = "macos";
        else if (/Linux|X11/i.test(platform)) target = "linux";
        if (!target) return;
        sessionStorage.setItem("installRedirected", "1");
        location.replace("/install/" + target);
    } catch (e) {}
})();
</script>

<!-- TODO detect current OS with browser and show that one first  -->
<!-- TODO docker release  -->
<div class="btn-row">
<a class="btn-small" href="/install/linux">Linux</a>
<a class="btn-small" href="/install/macos">macOS</a>
<a class="btn-small" href="/install/windows">Windows</a>
<a class="btn-small" href="/install/other">Other</a>
</div>

<!-- TODO mention editor plugins once they are up to date  -->

