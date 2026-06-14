/**
 * Authentication Routes — /auth/*
 * 
 * Handles user registration and login with role selection.
 * 
 * ACCESSIBILITY DECISIONS:
 * - All form fields have explicit <label> elements (not just placeholders)
 * - Error messages use aria-live="assertive" so screen readers announce them
 * - Role selection uses radio buttons (keyboard-navigable) instead of dropdowns
 * - Success/error feedback is always textual, never just color-based
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { queryOne, runStmt } = require('../db/supabase');

// ─────────────────────────────────────────────────────────────
// GET /auth/register — Show registration form
// ─────────────────────────────────────────────────────────────
router.get('/register', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('auth/register', { title: 'Create Account — VisionConnect Jobs' });
});

// ─────────────────────────────────────────────────────────────
// POST /auth/register — Handle registration
// ─────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
    const { name, email, password, confirmPassword, role } = req.body;
    const errors = [];

    if (!name || name.trim().length < 2) {
        errors.push('Please enter your full name (at least 2 characters).');
    }
    if (!email || !email.includes('@')) {
        errors.push('Please enter a valid email address.');
    }
    if (!password || password.length < 6) {
        errors.push('Password must be at least 6 characters long.');
    }
    if (password !== confirmPassword) {
        errors.push('Passwords do not match. Please re-enter.');
    }
    if (!role || !['seeker', 'employer'].includes(role)) {
        errors.push('Please select your account type: Job Seeker or Employer.');
    }

    if (errors.length > 0) {
        req.session.error = errors.join(' ');
        return res.status(400).redirect('/auth/register');
    }

    try {
        // Check if email already registered
        const existing = await queryOne('users', { email: email.toLowerCase() }, 'id');
        if (existing) {
            req.session.error = 'An account with this email already exists. Please log in instead.';
            return res.redirect('/auth/register');
        }

        // Create user
        const hash = bcrypt.hashSync(password, 10);
        const result = await runStmt('insert', 'users', {
            email: email.toLowerCase(),
            password_hash: hash,
            name: name.trim(),
            role: role
        });

        // Create empty profile for job seekers
        if (role === 'seeker') {
            await runStmt('insert', 'profiles', { user_id: result.lastInsertRowid });
        }

        req.session.success = 'Account created successfully! Please log in.';
        res.redirect('/auth/login');
    } catch (err) {
        console.error('Registration error:', err);
        req.session.error = 'An error occurred during registration. Please try again.';
        res.redirect('/auth/register');
    }
});

// ─────────────────────────────────────────────────────────────
// GET /auth/login — Show login form
// ─────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('auth/login', { title: 'Log In — VisionConnect Jobs' });
});

// ─────────────────────────────────────────────────────────────
// POST /auth/login — Handle login
// ─────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.session.error = 'Please enter both email and password.';
        return res.redirect('/auth/login');
    }

    try {
        const user = await queryOne('users', { email: email.toLowerCase() });

        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            req.session.error = 'Invalid email or password. Please try again.';
            return res.redirect('/auth/login');
        }

        if (!user.is_approved) {
            req.session.error = 'Your account has been suspended. Please contact support.';
            return res.redirect('/auth/login');
        }

        // Set session
        req.session.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
        };

        req.session.success = `Welcome back, ${user.name}!`;

        switch (user.role) {
            case 'seeker': return res.redirect('/seeker/dashboard');
            case 'employer': return res.redirect('/employer/dashboard');
            case 'admin': return res.redirect('/admin/dashboard');
            default: return res.redirect('/');
        }
    } catch (err) {
        console.error('Login error:', err);
        req.session.error = 'An error occurred during login. Please try again.';
        res.redirect('/auth/login');
    }
});

// ─────────────────────────────────────────────────────────────
// GET /auth/logout
// ─────────────────────────────────────────────────────────────
router.get('/logout', (req, res) => {
    req.session.destroy(() => { res.redirect('/'); });
});

module.exports = router;