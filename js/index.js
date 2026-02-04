/**
 * CricSynthesis Landing Page - Form Handling & Interactions
 * Enterprise-grade JavaScript with form validation and state management
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
    }

    /**
     * Google Sheets Web App URL
     * IMPORTANT: Replace this with your actual Google Apps Script deployment URL
     */
    const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzNnnjXv9PULjH5_tL3dfbB2DsLJkVaVzO9EFPg-TFxAR8pumlUxlAE1i8zUTGKlQ/exec';

    /**
     * Handle form submission
     * @param {Event} event - Submit event
     */
    async function handleFormSubmit(event) {
        event.preventDefault();

        const formData = new FormData(registrationForm);
        const data = Object.fromEntries(formData.entries());

        // Validate form
        if (!validateForm(data)) {
            return;
        }

        // Show loading state
        const submitButton = registrationForm.querySelector('.form-submit');
        const originalText = submitButton.innerHTML;
        submitButton.innerHTML = '<span>Processing...</span>';
        submitButton.disabled = true;

        try {
            // Add source URL to data
            data.source = window.location.href;

            // Send data to Google Sheets
            const response = await fetch(GOOGLE_SHEETS_URL, {
                method: 'POST',
                mode: 'no-cors', // Required for Google Apps Script
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            // Store locally as backup
            storeRegistration(data);

            // Show success message
            registrationForm.classList.add('hidden');
            successMessage.classList.add('active');

            console.log('Registration submitted successfully:', data);

        } catch (error) {
            console.error('Error submitting registration:', error);

            // Still store locally if API fails
            storeRegistration(data);

            // Show success anyway (data is saved locally)
            registrationForm.classList.add('hidden');
            successMessage.classList.add('active');
        } finally {
            // Reset button state
            submitButton.innerHTML = originalText;
            submitButton.disabled = false;
        }
    }

    /**
     * Validate form data
     * @param {Object} data - Form data object
     * @returns {boolean} - Validation result
     */
    function validateForm(data) {
        let isValid = true;

        // Check name
        if (!data.name || data.name.length < 2) {
            showFieldError('name', 'Please enter a valid name');
            isValid = false;
        } else {
            clearFieldError('name');
        }

        // Check email
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
     * @param {HTMLElement} input - Input element
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
     * @param {string} fieldName - Field name
     * @param {string} message - Error message
     */
    function showFieldError(fieldName, message) {
        const input = document.getElementById(fieldName);
        if (!input) return;

        input.classList.add('error');
        input.style.borderColor = '#ef4444';

        // Remove existing error message
        const existingError = input.parentElement.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }

        // Add error message
        const errorElement = document.createElement('span');
        errorElement.className = 'error-message';
        errorElement.style.cssText = 'color: #ef4444; font-size: 0.75rem; margin-top: 0.25rem;';
        errorElement.textContent = message;
        input.parentElement.appendChild(errorElement);
    }

    /**
     * Clear field error
     * @param {string} fieldName - Field name
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
     * Store registration in localStorage (temporary solution)
     * Replace with actual API endpoint in production
     * @param {Object} data - Registration data
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
     * @param {Function} func - Function to throttle
     * @param {number} limit - Time limit in ms
     * @returns {Function} - Throttled function
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
