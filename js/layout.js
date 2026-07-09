'use strict';

// ── Shared site-wide nav and footer ──────────────────────────────────────────
// Pixel-for-pixel copy of index.html nav/footer.
// Edit here once — all pages update automatically.

const NAV_HTML = `
<nav class="nav" id="mainNav">
    <div class="nav-container">
        <div class="nav-logo">
            <a href="index.html">
                <img src="assets/logo New.png" alt="CricSynthesis" class="logo-image">
            </a>
        </div>
        <div class="nav-links">
            <a href="index.html#products" class="nav-link">Products</a>
            <a href="index.html#how-it-works" class="nav-link">How It Works</a>
            <a href="docs.html" class="nav-link">Docs</a>
            <a href="playground.html" class="nav-link">Playground</a>
            <a href="login.html" class="nav-link nav-cta">Get API Key</a>
        </div>
        <!-- Mobile nav -->
        <div class="mobile-nav">
            <a href="docs.html" class="nav-link" style="font-size:0.85rem">Docs</a>
            <a href="login.html" class="mobile-cta">Get API Key</a>
        </div>
    </div>
</nav>`;

const FOOTER_HTML = `
<footer class="footer">
    <div class="footer-container">
        <div class="footer-main">
            <div class="footer-brand">
                <a href="index.html">
                    <img src="assets/logo New.png" alt="CricSynthesis" class="footer-logo">
                </a>
                <p class="footer-tagline">Cricket Intelligence APIs</p>
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
                    <a href="docs.html" class="footer-link">API Docs</a>
                    <a href="playground.html" class="footer-link">Playground</a>
                    <a href="login.html" class="footer-link">Dashboard</a>
                    <a href="docs.html#authentication" class="footer-link">Authentication</a>
                </div>
                <div class="footer-column">
                    <h4 class="footer-heading">Company</h4>
                    <a href="index.html#request-access" class="footer-link">Request Invite</a>
                    <a href="privacy.html" class="footer-link">Privacy Policy</a>
                    <a href="terms.html" class="footer-link">Terms of Service</a>
                </div>
            </div>
        </div>

        <div class="footer-bottom">
            <p class="footer-copyright">&copy; 2026 CricSynthesis. All rights reserved.</p>
            <div class="footer-social">
                <a href="#" class="social-link" aria-label="LinkedIn">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                </a>
                <a href="#" class="social-link" aria-label="Twitter">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                </a>
            </div>
        </div>
    </div>
</footer>`;

document.addEventListener('DOMContentLoaded', function () {
    // Pages with data-no-layout opt out entirely (e.g. login.html)
    if (document.body.dataset.noLayout) return;

    // ── Inject nav ──────────────────────────────────────────────────────────
    // Replace existing nav if present (so index.html gets the logo-link fix),
    // otherwise insert after .noise-overlay or at top of body.
    var existingNav = document.querySelector('nav.nav, nav#mainNav');
    if (existingNav) {
        existingNav.outerHTML = NAV_HTML;
    } else {
        var noiseOverlay = document.querySelector('.noise-overlay');
        if (noiseOverlay) {
            noiseOverlay.insertAdjacentHTML('afterend', NAV_HTML);
        } else {
            document.body.insertAdjacentHTML('afterbegin', NAV_HTML);
        }
    }

    // ── Inject footer ───────────────────────────────────────────────────────
    var existingFooter = document.querySelector('footer.footer');
    if (existingFooter) {
        existingFooter.outerHTML = FOOTER_HTML;
    } else {
        document.body.insertAdjacentHTML('beforeend', FOOTER_HTML);
    }

    // ── Sticky nav scroll effect (same as index.js) ─────────────────────────
    var nav = document.getElementById('mainNav');
    if (nav) {
        window.addEventListener('scroll', function () {
            if (window.scrollY > 50) {
                nav.classList.add('nav--scrolled');
            } else {
                nav.classList.remove('nav--scrolled');
            }
        }, { passive: true });
    }

    // ── Active page highlight ────────────────────────────────────────────────
    var page = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('#mainNav .nav-link:not(.nav-cta)').forEach(function (link) {
        var href = link.getAttribute('href') || '';
        var linkPage = href.split('/').pop().split('#')[0];
        if (linkPage && linkPage === page) {
            link.style.color = 'var(--color-text-primary)';
        }
    });
});
