/**
 * CricSynthesis Landing Page — Production-Grade Interactions
 * Scroll reveals, animated counters, particle canvas, and form handling
 */

(function () {
    'use strict';

    // DOM Elements
    const registrationForm = document.getElementById('registrationForm');
    const successMessage = document.getElementById('successMessage');

    // Form Validation Rules
    const validationRules = {
        name: {
            required: true,
            minLength: 2,
            pattern: /^[a-zA-Z\s'-]+$/
        },
        email: {
            required: true,
            pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        },
        organization: {
            required: false
        },
        segment: {
            required: false
        }
    };

    /**
     * Initialize the application
     */
    function init() {
        if (registrationForm) {
            registrationForm.addEventListener('submit', handleFormSubmit);
            setupInputValidation();
        }

        setupSmoothScroll();
        setupNavHighlight();
        setupNavScroll();
        setupMobileMenu();
        setupScrollReveal();
        setupCounterAnimation();
        setupParticleCanvas();
    }

    // ========================================
    //  Nav Scroll Shrink
    // ========================================
    function setupNavScroll() {
        const nav = document.getElementById('mainNav');
        if (!nav) return;

        let ticking = false;
        window.addEventListener('scroll', function () {
            if (!ticking) {
                requestAnimationFrame(function () {
                    if (window.scrollY > 60) {
                        nav.classList.add('scrolled');
                    } else {
                        nav.classList.remove('scrolled');
                    }
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    // ========================================
    //  Mobile Menu Toggle
    // ========================================
    function setupMobileMenu() {
        const menuBtn = document.getElementById('mobileMenuBtn');
        const menu = document.getElementById('mobileMenu');
        if (!menuBtn || !menu) return;

        menuBtn.addEventListener('click', function () {
            const isOpen = menu.classList.contains('open');
            menuBtn.classList.toggle('active');
            menu.classList.toggle('open');
            menuBtn.setAttribute('aria-expanded', !isOpen);
        });

        // Close when a link is clicked
        menu.querySelectorAll('.mobile-menu-link').forEach(function (link) {
            link.addEventListener('click', function () {
                menu.classList.remove('open');
                menuBtn.classList.remove('active');
                menuBtn.setAttribute('aria-expanded', 'false');
            });
        });

        // Close on scroll
        window.addEventListener('scroll', function () {
            if (menu.classList.contains('open')) {
                menu.classList.remove('open');
                menuBtn.classList.remove('active');
                menuBtn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // ========================================
    //  Scroll Reveal (IntersectionObserver)
    // ========================================
    function setupScrollReveal() {
        const revealElements = document.querySelectorAll('[data-reveal]');
        if (!revealElements.length) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('revealed');
                        observer.unobserve(entry.target); // Reveal only once
                    }
                });
            },
            {
                threshold: 0,
                rootMargin: '0px 0px -40px 0px'
            }
        );

        revealElements.forEach((el) => observer.observe(el));
    }

    // ========================================
    //  Animated Number Counters
    // ========================================
    function setupCounterAnimation() {
        const metrics = document.getElementById('heroMetrics');
        if (!metrics) return;

        const counters = metrics.querySelectorAll('.metric-value[data-count]');
        let animated = false;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && !animated) {
                        animated = true;
                        counters.forEach(animateCounter);
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.3 }
        );

        observer.observe(metrics);
    }

    function animateCounter(element) {
        const target = parseInt(element.getAttribute('data-count'), 10);
        const suffix = element.getAttribute('data-suffix') || '';
        const prefix = element.getAttribute('data-prefix') || '';
        const duration = 2000;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(eased * target);

            // Format number with commas
            const formatted = current.toLocaleString();
            element.textContent = prefix + formatted + suffix;

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent = prefix + target.toLocaleString() + suffix;
            }
        }

        requestAnimationFrame(update);
    }

    // ========================================
    //  Particle Canvas Animation
    // ========================================
    function setupParticleCanvas() {
        const canvas = document.getElementById('particleCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let particles = [];
        let animationId;
        let width, height;

        // Reduce particles on mobile
        const isMobile = window.innerWidth < 768;
        const PARTICLE_COUNT = isMobile ? 30 : 60;
        const CONNECTION_DISTANCE = isMobile ? 100 : 150;

        function resize() {
            width = canvas.width = canvas.offsetWidth;
            height = canvas.height = canvas.offsetHeight;
        }

        function createParticles() {
            particles = [];
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: (Math.random() - 0.5) * 0.4,
                    size: Math.random() * 2 + 0.5,
                    opacity: Math.random() * 0.5 + 0.15
                });
            }
        }

        function draw() {
            ctx.clearRect(0, 0, width, height);

            // Draw connections
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < CONNECTION_DISTANCE) {
                        const alpha = (1 - dist / CONNECTION_DISTANCE) * 0.12;
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
                        ctx.lineWidth = 0.5;
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }

            // Draw particles
            particles.forEach((p) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(129, 140, 248, ${p.opacity})`;
                ctx.fill();
            });
        }

        function update() {
            particles.forEach((p) => {
                p.x += p.vx;
                p.y += p.vy;

                // Wrap around edges
                if (p.x < -10) p.x = width + 10;
                if (p.x > width + 10) p.x = -10;
                if (p.y < -10) p.y = height + 10;
                if (p.y > height + 10) p.y = -10;
            });
        }

        function animate() {
            update();
            draw();
            animationId = requestAnimationFrame(animate);
        }

        // Only animate when hero is visible
        const heroSection = document.querySelector('.hero');
        const heroObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        if (!animationId) animate();
                    } else {
                        if (animationId) {
                            cancelAnimationFrame(animationId);
                            animationId = null;
                        }
                    }
                });
            },
            { threshold: 0 }
        );

        resize();
        createParticles();
        heroObserver.observe(heroSection);

        // Debounced resize handler
        let resizeTimer;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                resize();
                createParticles();
            }, 250);
        });
    }

    // ========================================
    //  Google Sheets Web App URL
    // ========================================
    const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbxLxYswUwhcZThYQLRCnjBcRLw9EIXmjyXJL5Yz6cN6yFesjvvUu2fScPfXgofVLoDi/exec';

    /**
     * Handle form submission
     */
    async function handleFormSubmit(event) {
        event.preventDefault();

        const formData = new FormData(registrationForm);
        const data = Object.fromEntries(formData.entries());

        if (!validateForm(data)) {
            return;
        }

        const submitButton = registrationForm.querySelector('.form-submit');
        const originalText = submitButton.innerHTML;
        submitButton.innerHTML = '<span>Processing...</span>';
        submitButton.disabled = true;

        try {
            data.source = window.location.href;

            const response = await fetch(GOOGLE_SHEETS_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            storeRegistration(data);

            registrationForm.classList.add('hidden');
            successMessage.classList.add('active');

            console.log('Registration submitted successfully:', data);

        } catch (error) {
            console.error('Error submitting registration:', error);
            storeRegistration(data);
            registrationForm.classList.add('hidden');
            successMessage.classList.add('active');
        } finally {
            submitButton.innerHTML = originalText;
            submitButton.disabled = false;
        }
    }

    /**
     * Validate form data
     */
    function validateForm(data) {
        let isValid = true;

        if (!data.name || data.name.length < 2) {
            showFieldError('name', 'Please enter a valid name');
            isValid = false;
        } else {
            clearFieldError('name');
        }

        if (!data.email || !validationRules.email.pattern.test(data.email)) {
            showFieldError('email', 'Please enter a valid email address');
            isValid = false;
        } else {
            clearFieldError('email');
        }

        return isValid;
    }

    /**
     * Setup real-time input validation
     */
    function setupInputValidation() {
        const inputs = registrationForm.querySelectorAll('.form-input');

        inputs.forEach(input => {
            input.addEventListener('blur', () => {
                validateField(input);
            });

            input.addEventListener('input', () => {
                if (input.classList.contains('error')) {
                    validateField(input);
                }
            });
        });
    }

    /**
     * Validate a single field
     */
    function validateField(input) {
        const name = input.name;
        const value = input.value.trim();
        const rules = validationRules[name];

        if (!rules) return;

        if (rules.required && !value) {
            showFieldError(name, 'This field is required');
            return;
        }

        if (rules.minLength && value.length < rules.minLength) {
            showFieldError(name, `Minimum ${rules.minLength} characters required`);
            return;
        }

        if (rules.pattern && value && !rules.pattern.test(value)) {
            showFieldError(name, 'Please enter a valid value');
            return;
        }

        clearFieldError(name);
    }

    /**
     * Show field error
     */
    function showFieldError(fieldName, message) {
        const input = document.getElementById(fieldName);
        if (!input) return;

        input.classList.add('error');
        input.style.borderColor = '#ef4444';

        const existingError = input.parentElement.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }

        const errorElement = document.createElement('span');
        errorElement.className = 'error-message';
        errorElement.style.cssText = 'color: #ef4444; font-size: 0.75rem; margin-top: 0.25rem; display: block;';
        errorElement.textContent = message;
        input.parentElement.appendChild(errorElement);
    }

    /**
     * Clear field error
     */
    function clearFieldError(fieldName) {
        const input = document.getElementById(fieldName);
        if (!input) return;

        input.classList.remove('error');
        input.style.borderColor = '';

        const existingError = input.parentElement.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }
    }

    /**
     * Store registration in localStorage (backup)
     */
    function storeRegistration(data) {
        const registrations = JSON.parse(localStorage.getItem('cricsynthesis_registrations') || '[]');

        const registration = {
            ...data,
            timestamp: new Date().toISOString(),
            source: window.location.href
        };

        registrations.push(registration);
        localStorage.setItem('cricsynthesis_registrations', JSON.stringify(registrations));
    }

    /**
     * Setup smooth scrolling for anchor links
     */
    function setupSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                const href = this.getAttribute('href');
                if (href === '#') return;

                e.preventDefault();
                const target = document.querySelector(href);

                if (target) {
                    const navHeight = document.querySelector('.nav').offsetHeight;
                    const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight;

                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }

    /**
     * Setup navigation highlight on scroll
     */
    function setupNavHighlight() {
        const sections = document.querySelectorAll('section[id]');
        const navLinks = document.querySelectorAll('.nav-link');

        function highlightNav() {
            const scrollPos = window.scrollY + 100;

            sections.forEach(section => {
                const sectionTop = section.offsetTop;
                const sectionHeight = section.offsetHeight;
                const sectionId = section.getAttribute('id');

                if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
                    navLinks.forEach(link => {
                        link.classList.remove('active');
                        if (link.getAttribute('href') === `#${sectionId}`) {
                            link.classList.add('active');
                        }
                    });
                }
            });
        }

        window.addEventListener('scroll', throttle(highlightNav, 100));
    }

    /**
     * Throttle function for performance
     */
    function throttle(func, limit) {
        let inThrottle;
        return function () {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
