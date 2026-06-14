/**
 * VisionConnect Job Portal — Main Server
 * 
 * Entry point for the accessible job portal application.
 * Configures Express with security, sessions, templating,
 * and all route modules.
 */
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const session = require('express-session');
const { injectUser } = require('./middleware/auth');
const app = express();
const PORT = process.env.PORT || 3000;
// ---------------------------------------------------------------------------
// Security & performance middleware
// ---------------------------------------------------------------------------
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "blob:"],
        }
    }
}));
app.use(compression());
// ---------------------------------------------------------------------------
// Body parsing & static files
// ---------------------------------------------------------------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// ---------------------------------------------------------------------------
// Session configuration
// ---------------------------------------------------------------------------
app.use(session({
    secret: process.env.SESSION_SECRET || 'visionconnect-a11y-portal-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax'
    }
}));
// ---------------------------------------------------------------------------
// Templating — EJS for server-rendered, accessible HTML
// ---------------------------------------------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Make user & flash messages available in all templates
app.use(injectUser);

// Trailing slash normalization (Standardizes routes for deployment)
app.use((req, res, next) => {
    if (req.path.length > 1 && req.path.endsWith('/')) {
        const query = req.url.slice(req.path.length);
        const safepath = req.path.slice(0, -1) + query;
        res.redirect(301, safepath);
    } else {
        next();
    }
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const seekerRoutes = require('./routes/seeker');
const employerRoutes = require('./routes/employer');
const adminRoutes = require('./routes/admin');
app.use('/auth', authRoutes);
app.use('/jobs', jobRoutes);
app.use('/seeker', seekerRoutes);
app.use('/employer', employerRoutes);
app.use('/admin', adminRoutes);

// Database client for landing page stats
const { supabase } = require('./db/supabase');

// Landing page
app.get('/', async (req, res) => {
    try {
        const getCount = async (table, filter = {}) => {
            const { count, error } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true })
                .match(filter);
            return count || 0;
        };

        const jobCount = await getCount('jobs', { is_approved: true, is_active: true });
        
        // Count distinct employers
        const { data: employers } = await supabase
            .from('jobs')
            .select('employer_id');
        const employerCount = new Set((employers || []).map(j => j.employer_id)).size;

        const applicationCount = await getCount('applications');

        const { data: jobs, error } = await supabase
            .from('jobs')
            .select(`
                *,
                users!inner(name)
            `)
            .eq('is_approved', true)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(6);

        if (error) throw error;

        // Format for template compatibility
        const latestJobs = (jobs || []).map(j => ({
            ...j,
            employer_name: j.users ? j.users.name : 'Unknown'
        }));

        res.render('index', {
            title: 'VisionConnect Jobs — Accessible Job Portal',
            jobCount,
            employerCount,
            applicationCount,
            latestJobs
        });
    } catch (err) {
        console.error('Landing page error:', err);
        res.render('index', {
            title: 'VisionConnect Jobs — Accessible Job Portal',
            jobCount: 0,
            employerCount: 0,
            applicationCount: 0,
            latestJobs: []
        });
    }
});
// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------
app.use((req, res) => {
    res.status(404).render('error', {
        title: 'Page Not Found — VisionConnect Jobs',
        message: 'The page you are looking for does not exist.',
        code: 404
    });
});
// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).render('error', {
        title: 'Server Error — VisionConnect Jobs',
        message: 'An unexpected error occurred. Please try again later.',
        code: 500
    });
});
// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`\n🌐 VisionConnect Job Portal running at http://localhost:${PORT}`);
    console.log(`   Supabase Backend • Accessibility-first • Keyboard navigable\n`);
});

module.exports = app;
