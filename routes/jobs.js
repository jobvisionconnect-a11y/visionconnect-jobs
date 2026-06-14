/**
 * Job Routes — /jobs/*
 * 
 * Public job browsing, search with filters, and application submission.
 * 
 * ACCESSIBILITY DECISIONS:
 * - Search results have aria-live region for dynamic updates
 * - Each job card is a semantic <article> with heading hierarchy
 * - Filters use <fieldset> and <legend> for screen reader grouping
 * - "Quick Apply" uses minimal form fields for faster application
 */
const express = require('express');
const router = express.Router();
const { supabase, queryAll, queryOne, runStmt } = require('../db/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────
// GET /jobs — Browse & search jobs (public)
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    const { q, type, location } = req.query;
    
    try {
        let query = supabase
            .from('jobs')
            .select(`
                *,
                users!inner(name)
            `)
            .eq('is_approved', 1)
            .eq('is_active', 1);

        if (q && q.trim()) {
            const term = `%${q.trim()}%`;
            query = query.or(`title.ilike.${term},company.ilike.${term},description.ilike.${term}`);
        }

        if (type && type !== 'all') {
            query = query.eq('job_type', type);
        }

        if (location && location.trim()) {
            query = query.ilike('location', `%${location.trim()}%`);
        }

        query = query.order('created_at', { ascending: false });

        const { data: jobs, error } = await query;
        if (error) throw error;

        // Convert the Postgres join format for template compatibility
        const formattedJobs = (jobs || []).map(j => ({
            ...j,
            employer_name: j.users ? j.users.name : 'Unknown'
        }));

        // If logged in as seeker, also check for saved status
        let savedJobIds = [];
        if (req.session.user && req.session.user.role === 'seeker') {
            const { data: saved } = await supabase
                .from('saved_jobs')
                .select('job_id')
                .eq('user_id', req.session.user.id);
            if (saved) savedJobIds = saved.map(s => s.job_id);
        }

        res.render('jobs/search', {
            title: 'Find Jobs — VisionConnect Jobs',
            jobs: formattedJobs.map(j => ({ ...j, is_saved: savedJobIds.includes(j.id) })),
            filters: { q: q || '', type: type || 'all', location: location || '' },
            resultCount: jobs.length
        });
    } catch (err) {
        console.error('Search error:', err);
        res.render('jobs/search', {
            title: 'Find Jobs — VisionConnect Jobs',
            jobs: [],
            filters: { q: q || '', type: type || 'all', location: location || '' },
            resultCount: 0
        });
    }
});

// ─────────────────────────────────────────────────────────────
// GET /jobs/:id — Job detail page
// ─────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const { data: job, error } = await supabase
            .from('jobs')
            .select(`
                *,
                users!inner(name, email)
            `)
            .eq('id', req.params.id)
            .eq('is_approved', 1)
            .eq('is_active', 1)
            .maybeSingle();

        if (error || !job) {
            req.session.error = 'Job listing not found or no longer available.';
            return res.redirect('/jobs');
        }

        // Format for template compatibility
        const formattedJob = {
            ...job,
            employer_name: job.users.name,
            employer_email: job.users.email
        };

        let hasApplied = false;
        let isSaved = false;
        
        if (req.session.user && req.session.user.role === 'seeker') {
            // Check application
            const { data: app } = await supabase
                .from('applications')
                .select('id')
                .eq('job_id', job.id)
                .eq('seeker_id', req.session.user.id)
                .maybeSingle();
            hasApplied = !!app;

            // Check saved status
            const { data: saved } = await supabase
                .from('saved_jobs')
                .select('id')
                .eq('job_id', job.id)
                .eq('user_id', req.session.user.id)
                .maybeSingle();
            isSaved = !!saved;
        }

        res.render('jobs/detail', {
            title: `${job.title} at ${job.company} — VisionConnect Jobs`,
            job: formattedJob,
            hasApplied,
            isSaved
        });
    } catch (err) {
        console.error('Detail error:', err);
        res.redirect('/jobs');
    }
});

// ─────────────────────────────────────────────────────────────
// POST /jobs/:id/apply — Standard apply
// ─────────────────────────────────────────────────────────────
router.post('/:id/apply', requireAuth, requireRole('seeker'), async (req, res) => {
    const { cover_letter } = req.body;
    const jobId = req.params.id;
    const seekerId = req.session.user.id;

    try {
        const job = await queryOne('jobs', { id: jobId, is_approved: 1, is_active: 1 }, 'id, title');
        if (!job) {
            req.session.error = 'This job listing is no longer available.';
            return res.redirect('/jobs');
        }

        const existing = await queryOne('applications', { job_id: jobId, seeker_id: seekerId }, 'id');
        if (existing) {
            req.session.error = 'You have already applied for this position.';
            return res.redirect(`/jobs/${jobId}`);
        }

        await runStmt('insert', 'applications', {
            job_id: jobId,
            seeker_id: seekerId,
            cover_letter: cover_letter || '',
            is_quick_apply: false
        });

        req.session.success = `Application submitted successfully for "${job.title}"! You can track it on your dashboard.`;
        res.redirect('/seeker/dashboard');
    } catch (err) {
        console.error('Apply error:', err);
        res.redirect('/jobs');
    }
});

// ─────────────────────────────────────────────────────────────
// POST /jobs/:id/quick-apply — One-click apply
// ─────────────────────────────────────────────────────────────
router.post('/:id/quick-apply', requireAuth, requireRole('seeker'), async (req, res) => {
    const jobId = req.params.id;
    const seekerId = req.session.user.id;

    try {
        const job = await queryOne('jobs', { id: jobId, is_approved: 1, is_active: 1 }, 'id, title');
        if (!job) {
            req.session.error = 'This job listing is no longer available.';
            return res.redirect('/jobs');
        }

        const existing = await queryOne('applications', { job_id: jobId, seeker_id: seekerId }, 'id');
        if (existing) {
            req.session.error = 'You have already applied for this position.';
            return res.redirect(`/jobs/${jobId}`);
        }

        await runStmt('insert', 'applications', {
            job_id: jobId,
            seeker_id: seekerId,
            cover_letter: 'Quick Apply — please review my profile for details.',
            is_quick_apply: true
        });

        req.session.success = `Quick Apply successful for "${job.title}"! The employer will review your profile directly.`;
        res.redirect('/seeker/dashboard');
    } catch (err) {
        console.error('Quick Apply error:', err);
        res.redirect('/jobs');
    }
});

module.exports = router;
