'use strict';

// ── Shared site-wide nav and footer ──────────────────────────────────────────

// Make sure the theme stylesheet is present on every page (add the <link> to
// each page's <head> too, to avoid a flash of the old styles).
(function () {
    if (!document.querySelector('link[href$="css/theme.css"]')) {
        var l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = 'css/theme.css';
        document.head.appendChild(l);
    }
    if (!document.querySelector('link[rel="icon"]')) {
        var f = document.createElement('link');
        f.rel = 'icon';
        f.type = 'image/svg+xml';
        f.href = 'assets/favicon.svg';
        document.head.appendChild(f);
    }
})();

// Prompt-wicket mark: ">" prompt + three stumps; the third stump blinks like a cursor.
const LOGO_MARK = `
<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4" aria-hidden="true">
    <path d="M4 15L13 24L4 33" stroke-linecap="square"/>
    <path d="M22 15V40M30 15V40M20 11H29M31 11H40"/>
    <path class="cs-cursor" d="M38 15V40"/>
</svg>`;

const BRAND = `<a href="index.html" class="cs-brand" aria-label="CricSynthesis home">${LOGO_MARK}<span>Cric<b>Synthesis</b></span></a>`;

const NAV_HTML = `
<nav class="nav" id="mainNav">
    <div class="nav-container">
        <div class="nav-logo">${BRAND}</div>
        <div class="nav-links">
            <a href="index.html#products" class="nav-link">Products</a>
            <a href="index.html#how-it-works" class="nav-link">How it works</a>
            <a href="mcp.html" class="nav-link">MCP</a>
            <a href="docs.html" class="nav-link">Docs</a>
            <a href="playground.html" class="nav-link">Playground</a>
            <a href="login.html" class="nav-link nav-cta">Sign in</a>
        </div>
        <div class="mobile-nav">
            <a href="docs.html" class="mobile-nav-link">Docs</a>
            <a href="mcp.html" class="mobile-nav-link">MCP</a>
            <a href="login.html" class="mobile-nav-cta">Sign in</a>
            <button type="button" class="cs-burger" id="csBurger" aria-label="Open menu" aria-expanded="false" aria-controls="csDrawer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><path class="b1" d="M4 7h16"/><path class="b2" d="M4 12h16"/><path class="b3" d="M4 17h16"/></svg>
            </button>
        </div>
    </div>
    <div class="cs-drawer" id="csDrawer" hidden>
        <a href="index.html#products">Products</a>
        <a href="index.html#how-it-works">How it works</a>
        <a href="playground.html">Playground</a>
        <a href="contact.html">Contact</a>
    </div>
</nav>`;

const FOOTER_HTML = `
<footer class="footer">
    <div class="footer-container">
        <div class="footer-main">
            <div class="footer-brand">
                ${BRAND}
                <p class="footer-tagline">Cricket intelligence APIs</p>
            </div>
            <div class="footer-links">
                <div class="footer-column">
                    <h4 class="footer-heading">Products</h4>
                    <a href="index.html#products" class="footer-link">CricVeda</a>
                    <a href="index.html#products" class="footer-link">MatchSynth</a>
                    <a href="index.html#products" class="footer-link">GraphSynth</a>
                </div>
                <div class="footer-column">
                    <h4 class="footer-heading">Developers</h4>
                    <a href="docs.html" class="footer-link">API docs</a>
                    <a href="playground.html" class="footer-link">Playground</a>
                    <a href="login.html" class="footer-link">Dashboard</a>
                </div>
                <div class="footer-column">
                    <h4 class="footer-heading">Company</h4>
                    <a href="careers.html" class="footer-link">Careers</a>
                    <a href="contact.html" class="footer-link">Contact</a>
                    <a href="privacy.html" class="footer-link">Privacy policy</a>
                    <a href="terms.html" class="footer-link">Terms of service</a>
                </div>
            </div>
        </div>
        <div class="footer-bottom">
            <p class="footer-copyright">&copy; 2026 CricSynthesis. All rights reserved.</p>
            <div class="footer-social">
                <a href="#" class="social-link" aria-label="LinkedIn">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </a>
                <a href="#" class="social-link" aria-label="X">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
            </div>
        </div>
    </div>
</footer>`;

document.addEventListener('DOMContentLoaded', function () {
    if (document.body.hasAttribute('data-no-layout')) return;

    var existingNav = document.querySelector('nav.nav, nav#mainNav');
    if (existingNav) {
        existingNav.outerHTML = NAV_HTML;
    } else {
        var noiseOverlay = document.querySelector('.noise-overlay');
        if (noiseOverlay) noiseOverlay.insertAdjacentHTML('afterend', NAV_HTML);
        else document.body.insertAdjacentHTML('afterbegin', NAV_HTML);
    }

    var existingFooter = document.querySelector('footer.footer');
    if (existingFooter) existingFooter.outerHTML = FOOTER_HTML;
    else document.body.insertAdjacentHTML('beforeend', FOOTER_HTML);

    // Push page content below the fixed nav (64px tall) on inner pages
    var page = window.location.pathname.split('/').pop() || 'index.html';
    if (page !== 'index.html') {
        var contentSelectors = ['#pg-page-header', '.docs-layout'];
        var pushed = false;
        for (var i = 0; i < contentSelectors.length; i++) {
            var el = document.querySelector(contentSelectors[i]);
            if (el) { el.style.marginTop = '88px'; pushed = true; break; }
        }
        if (!pushed) document.body.style.paddingTop = '88px';
    }

    var burger = document.getElementById('csBurger');
    var drawer = document.getElementById('csDrawer');
    if (burger && drawer) {
        var setOpen = function (open) {
            drawer.hidden = !open;
            burger.setAttribute('aria-expanded', String(open));
            burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        };
        burger.addEventListener('click', function () { setOpen(drawer.hidden); });
        drawer.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
        window.addEventListener('resize', function () { if (window.innerWidth > 860) setOpen(false); });
    }

    var nav = document.getElementById('mainNav');
    if (nav) {
        window.addEventListener('scroll', function () {
            nav.classList.toggle('scrolled', window.scrollY > 50);
        }, { passive: true });
    }

    document.querySelectorAll('#mainNav .nav-link:not(.nav-cta)').forEach(function (link) {
        var linkPage = (link.getAttribute('href') || '').split('/').pop().split('#')[0];
        if (linkPage && linkPage === page && page !== 'index.html') link.classList.add('active');
    });
});
