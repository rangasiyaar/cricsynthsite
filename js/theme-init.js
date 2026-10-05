// Runs in <head> before first paint so the page never flashes the wrong theme.
// Stored choice ('light' | 'dark') wins; otherwise follow the OS setting.
(function () {
    var t = null;
    try { t = localStorage.getItem('cs-theme'); } catch (e) {}
    if (t !== 'light' && t !== 'dark') {
        t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
})();
