/**
 * Job Seeker Routes — /seeker/*
 * 
 * Dashboard, profile management, resume upload, and application tracking.
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { supabase, queryAll, queryOne, runStmt } = require('../db/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');

// Configure resume uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '..', 'uploads', 'resumes'));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `resume_${req.session.user.id}_${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.doc', '.docx', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF, DOC, DOCX, and TXT files are allowed.'));
        }
    }
});

// Apply auth middleware
router.use(requireAuth, requireRole('seeker'));

// ─────────────────────────────────────────────────────────────
// GET /seeker/dashboard
// ─────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
    const userId = req.session.user.id;
    try {
        const { data: applications, error: appError } = await supabase
            .from('applications')
            .select(`
                *,
                jobs!inner(title, company, location)
            `)
            .eq('seeker_id', userId)
            .order('applied_at', { ascending: false });

        if (appError) throw appError;

        const profile = await queryOne('profiles', { user_id: userId });

        // Format applications for template compatibility
        const formattedApps = (applications || []).map(a => ({
            ...a,
            job_title: a.jobs.title,
            company: a.jobs.company,
            location: a.jobs.location
        }));

        const stats = {
            total: formattedApps.length,
            applied: formattedApps.filter(a => a.status === 'applied').length,
            reviewed: formattedApps.filter(a => a.status === 'reviewed').length,
            shortlisted: formattedApps.filter(a => a.status === 'shortlisted').length,
            rejected: formattedApps.filter(a => a.status === 'rejected').length,
            hired: formattedApps.filter(a => a.status === 'hired').length,
        };

        res.render('seeker/dashboard', {
            title: 'My Dashboard — VisionConnect Jobs',
            applications: formattedApps,
            profile,
            stats
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.redirect('/');
    }
});

// ─────────────────────────────────────────────────────────────
// GET /seeker/profile
// ─────────────────────────────────────────────────────────────
router.get('/profile', async (req, res) => {
    try {
        const profile = await queryOne('profiles', { user_id: req.session.user.id });
        res.render('seeker/profile', {
            title: 'My Profile — VisionConnect Jobs',
            profile: profile || {}
        });
    } catch (err) {
        console.error('Profile view error:', err);
        res.redirect('/seeker/dashboard');
    }
});

// ─────────────────────────────────────────────────────────────
// POST /seeker/profile
// ─────────────────────────────────────────────────────────────
router.post('/profile', upload.single('resume'), async (req, res) => {
    const userId = req.session.user.id;
    const { bio, skills, education, disability_type, phone, location, name } = req.body;
    let resumePath = '';
    if (req.file) {
        resumePath = `/uploads/resumes/${req.file.filename}`;
    }

    try {
        const existing = await queryOne('profiles', { user_id: userId }, 'id, resume_path');

        if (existing) {
            const finalResume = resumePath || existing.resume_path;
            await runStmt('update', 'profiles', {
                bio: bio || '',
                skills: skills || '',
                education: education || '',
                disability_type: disability_type || '',
                phone: phone || '',
                location: location || '',
                resume_path: finalResume
            }, { user_id: userId });
        } else {
            await runStmt('insert', 'profiles', {
                user_id: userId,
                bio: bio || '',
                skills: skills || '',
                education: education || '',
                disability_type: disability_type || '',
                phone: phone || '',
                location: location || '',
                resume_path: resumePath
            });
        }

        if (name) {
            await runStmt('update', 'users', { name: name.trim() }, { id: userId });
            req.session.user.name = name.trim();
        }

        req.session.success = 'Profile updated successfully!';
        res.redirect('/seeker/profile');
    } catch (err) {
        console.error('Profile update error:', err);
        req.session.error = 'Failed to update profile.';
        res.redirect('/seeker/profile');
    }
});

// ─────────────────────────────────────────────────────────────
// GET /seeker/applications
// ─────────────────────────────────────────────────────────────
router.get('/applications', async (req, res) => {
    try {
        const { data: applications, error } = await supabase
            .from('applications')
            .select(`
                *,
                jobs!inner(title, company, location, job_type)
            `)
            .eq('seeker_id', req.session.user.id)
            .order('applied_at', { ascending: false });

        if (error) throw error;

        const formattedApps = (applications || []).map(a => ({
            ...a,
            job_title: a.jobs.title,
            company: a.jobs.company,
            location: a.jobs.location,
            job_type: a.jobs.job_type
        }));

        res.render('seeker/applications', {
            title: 'My Applications — VisionConnect Jobs',
            applications: formattedApps
        });
    } catch (err) {
        console.error('Applications view error:', err);
        res.redirect('/seeker/dashboard');
    }
});

// ─────────────────────────────────────────────────────────────
// SAVED JOBS (New Feature)
// ─────────────────────────────────────────────────────────────

// GET /seeker/saved-jobs
router.get('/saved-jobs', async (req, res) => {
    try {
        const { data: saved, error } = await supabase
            .from('saved_jobs')
            .select(`
                *,
                jobs!inner(id, title, company, location, job_type, description)
            `)
            .eq('user_id', req.session.user.id)
            .order('saved_at', { ascending: false });

        if (error) throw error;

        const formattedJobs = (saved || []).map(s => ({
            ...s.jobs,
            saved_id: s.id,
            saved_at: s.saved_at
        }));

        res.render('seeker/saved-jobs', {
            title: 'Saved Jobs — VisionConnect Jobs',
            jobs: formattedJobs
        });
    } catch (err) {
        console.error('Saved jobs error:', err);
        res.redirect('/seeker/dashboard');
    }
});

// POST /seeker/saved-jobs/toggle — Toggle save/unsave
router.post('/saved-jobs/toggle', async (req, res) => {
    const { job_id } = req.body;
    const user_id = req.session.user.id;

    try {
        const existing = await queryOne('saved_jobs', { user_id, job_id });
        
        if (existing) {
            await runStmt('delete', 'saved_jobs', {}, { user_id, job_id });
            return res.json({ status: 'removed', message: 'Job removed from saved list.' });
        } else {
            await runStmt('insert', 'saved_jobs', { user_id, job_id });
            return res.json({ status: 'saved', message: 'Job saved successfully!' });
        }
    } catch (err) {
        console.error('Toggle save error:', err);
        res.status(500).json({ error: 'Failed to toggle save state.' });
    }
});

module.exports = router;