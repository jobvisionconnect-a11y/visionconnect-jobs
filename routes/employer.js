/**
 * Employer Routes — /employer/*
 * 
 * Job posting, applicant management, and candidate communication.
 */
const express = require('express');
const router = express.Router();
const { supabase, queryAll, queryOne, runStmt } = require('../db/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireRole('employer'));

// ─────────────────────────────────────────────────────────────
// GET /employer/dashboard
// ─────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
    const employerId = req.session.user.id;
    try {
        const { data: jobs, error } = await supabase
            .from('jobs')
            .select(`
                *,
                applications(count)
            `)
            .eq('employer_id', employerId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Convert the aggregate count format
        const formattedJobs = (jobs || []).map(j => ({
            ...j,
            application_count: j.applications ? j.applications[0].count : 0
        }));

        const stats = {
            totalJobs: formattedJobs.length,
            activeJobs: formattedJobs.filter(j => j.is_active && j.is_approved).length,
            pendingApproval: formattedJobs.filter(j => !j.is_approved).length,
            totalApplications: formattedJobs.reduce((sum, j) => sum + j.application_count, 0)
        };

        res.render('employer/dashboard', {
            title: 'Employer Dashboard — VisionConnect Jobs',
            jobs: formattedJobs,
            stats
        });
    } catch (err) {
        console.error('Employer dashboard error:', err);
        res.redirect('/');
    }
});

// ─────────────────────────────────────────────────────────────
// GET /employer/jobs/new
// ─────────────────────────────────────────────────────────────
router.get('/jobs/new', (req, res) => {
    res.render('employer/new-job', {
        title: 'Post a New Job — VisionConnect Jobs'
    });
});

// ─────────────────────────────────────────────────────────────
// POST /employer/jobs/new
// ─────────────────────────────────────────────────────────────
router.post('/jobs/new', async (req, res) => {
    const { title, company, location, job_type, description, requirements, salary_range, accessibility_features } = req.body;
    const errors = [];
    if (!title || title.trim().length < 3) errors.push('Job title must be at least 3 characters.');
    if (!company || company.trim().length < 2) errors.push('Company name is required.');
    if (!description || description.trim().length < 20) errors.push('Job description must be at least 20 characters.');

    if (errors.length > 0) {
        req.session.error = errors.join(' ');
        return res.redirect('/employer/jobs/new');
    }

    try {
        await runStmt('insert', 'jobs', {
            employer_id: req.session.user.id,
            title: title.trim(),
            company: company.trim(),
            location: location || '',
            job_type: job_type || 'full-time',
            description: description.trim(),
            requirements: requirements || '',
            salary_range: salary_range || '',
            accessibility_features: accessibility_features || '',
            is_approved: false
        });

        req.session.success = 'Job posted successfully! It will be visible after admin approval.';
        res.redirect('/employer/dashboard');
    } catch (err) {
        console.error('Job post error:', err);
        req.session.error = 'Failed to post job.';
        res.redirect('/employer/jobs/new');
    }
});

// ─────────────────────────────────────────────────────────────
// GET /employer/jobs/:id/applicants
// ─────────────────────────────────────────────────────────────
router.get('/jobs/:id/applicants', async (req, res) => {
    try {
        const job = await queryOne('jobs', { id: req.params.id, employer_id: req.session.user.id });
        if (!job) {
            req.session.error = 'Job not found or you do not have access.';
            return res.redirect('/employer/dashboard');
        }

        const { data: applicants, error } = await supabase
            .from('applications')
            .select(`
                *,
                users!inner(name, email),
                profiles:seeker_id(skills, education, bio, resume_path, phone, location)
            `)
            .eq('job_id', req.params.id)
            .order('applied_at', { ascending: false });

        if (error) throw error;

        // Flatten for template compatibility
        const formattedApplicants = (applicants || []).map(a => ({
            ...a,
            seeker_name: a.users.name,
            seeker_email: a.users.email,
            skills: a.profiles ? a.profiles.skills : '',
            education: a.profiles ? a.profiles.education : '',
            bio: a.profiles ? a.profiles.bio : '',
            resume_path: a.profiles ? a.profiles.resume_path : '',
            phone: a.profiles ? a.profiles.phone : '',
            seeker_location: a.profiles ? a.profiles.location : ''
        }));

        res.render('employer/applicants', {
            title: `Applicants for ${job.title} — VisionConnect Jobs`,
            job,
            applicants: formattedApplicants
        });
    } catch (err) {
        console.error('Applicants view error:', err);
        res.redirect('/employer/dashboard');
    }
});

// ─────────────────────────────────────────────────────────────
// POST /employer/jobs/:jobId/applicants/:appId/status
// ─────────────────────────────────────────────────────────────
router.post('/jobs/:jobId/applicants/:appId/status', async (req, res) => {
    const { status } = req.body;
    const validStatuses = ['applied', 'reviewed', 'shortlisted', 'rejected', 'hired'];
    if (!validStatuses.includes(status)) {
        req.session.error = 'Invalid status value.';
        return res.redirect(`/employer/jobs/${req.params.jobId}/applicants`);
    }

    try {
        const job = await queryOne('jobs', { id: req.params.jobId, employer_id: req.session.user.id }, 'id');
        if (!job) {
            req.session.error = 'Access denied.';
            return res.redirect('/employer/dashboard');
        }

        await runStmt('update', 'applications', { status }, { id: req.params.appId, job_id: req.params.jobId });

        req.session.success = `Application status updated to "${status}".`;
        res.redirect(`/employer/jobs/${req.params.jobId}/applicants`);
    } catch (err) {
        console.error('Status update error:', err);
        res.redirect('/employer/dashboard');
    }
});

// ─────────────────────────────────────────────────────────────
// POST /employer/jobs/:id/toggle
// ─────────────────────────────────────────────────────────────
router.post('/jobs/:id/toggle', async (req, res) => {
    try {
        const job = await queryOne('jobs', { id: req.params.id, employer_id: req.session.user.id }, 'id, is_active');
        if (!job) {
            req.session.error = 'Job not found.';
            return res.redirect('/employer/dashboard');
        }

        const newStatus = !job.is_active;
        await runStmt('update', 'jobs', { is_active: newStatus }, { id: job.id });

        req.session.success = !newStatus ? 'Job deactivated.' : 'Job activated.';
        res.redirect('/employer/dashboard');
    } catch (err) {
        console.error('Toggle job error:', err);
        res.redirect('/employer/dashboard');
    }
});

module.exports = router;