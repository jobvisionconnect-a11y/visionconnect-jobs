/**
 * Admin Routes — /admin/*
 * 
 * User management, job approval, and platform monitoring.
 */
const express = require('express');
const router = express.Router();
const { supabase, queryAll, queryOne, runStmt } = require('../db/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireRole('admin'));

// ─────────────────────────────────────────────────────────────
// GET /admin/dashboard
// ─────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
    try {
        const getCount = async (table, filter = {}) => {
            const { count, error } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true })
                .match(filter);
            return count || 0;
        };

        const stats = {
            totalUsers: await getCount('users'),
            totalSeekers: await getCount('users', { role: 'seeker' }),
            totalEmployers: await getCount('users', { role: 'employer' }),
            totalJobs: await getCount('jobs'),
            pendingJobs: await getCount('jobs', { is_approved: false }),
            approvedJobs: await getCount('jobs', { is_approved: true }),
            totalApplications: await getCount('applications'),
        };

        const { data: recentJobs } = await supabase
            .from('jobs')
            .select(`
                *,
                users!inner(name)
            `)
            .order('created_at', { ascending: false })
            .limit(5);

        const { data: recentUsers } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);

        const formattedJobs = (recentJobs || []).map(j => ({
            ...j,
            employer_name: j.users.name
        }));

        res.render('admin/dashboard', {
            title: 'Admin Dashboard — VisionConnect Jobs',
            stats,
            recentJobs: formattedJobs,
            recentUsers
        });
    } catch (err) {
        console.error('Admin dashboard error:', err);
        res.redirect('/');
    }
});

// ─────────────────────────────────────────────────────────────
// GET /admin/users
// ─────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
    const { role } = req.query;
    try {
        let query = supabase.from('users').select('*').order('created_at', { ascending: false });
        
        if (role && ['seeker', 'employer', 'admin'].includes(role)) {
            query = query.eq('role', role);
        }

        const { data: users, error } = await query;
        if (error) throw error;

        res.render('admin/users', {
            title: 'Manage Users — VisionConnect Jobs',
            users,
            filterRole: role || 'all'
        });
    } catch (err) {
        console.error('Admin users error:', err);
        res.redirect('/admin/dashboard');
    }
});

// ─────────────────────────────────────────────────────────────
// POST /admin/users/:id/toggle
// ─────────────────────────────────────────────────────────────
router.post('/users/:id/toggle', async (req, res) => {
    try {
        const user = await queryOne('users', { id: req.params.id }, 'id, is_approved, name');
        if (!user) {
            req.session.error = 'User not found.';
            return res.redirect('/admin/users');
        }

        if (user.id == req.session.user.id) {
            req.session.error = 'You cannot suspend your own account.';
            return res.redirect('/admin/users');
        }

        const newStatus = !user.is_approved;
        await runStmt('update', 'users', { is_approved: newStatus }, { id: user.id });

        req.session.success = !newStatus
            ? `User "${user.name}" has been suspended.`
            : `User "${user.name}" has been activated.`;
        res.redirect('/admin/users');
    } catch (err) {
        console.error('User toggle error:', err);
        res.redirect('/admin/users');
    }
});

// ─────────────────────────────────────────────────────────────
// GET /admin/jobs
// ─────────────────────────────────────────────────────────────
router.get('/jobs', async (req, res) => {
    const { status } = req.query;
    try {
        let query = supabase
            .from('jobs')
            .select(`
                *,
                users!inner(name)
            `)
            .order('created_at', { ascending: false });

        if (status === 'pending') {
            query = query.eq('is_approved', false);
        } else if (status === 'approved') {
            query = query.eq('is_approved', true);
        }

        const { data: jobs, error } = await query;
        if (error) throw error;

        const formattedJobs = (jobs || []).map(j => ({
            ...j,
            employer_name: j.users.name
        }));

        res.render('admin/jobs', {
            title: 'Manage Jobs — VisionConnect Jobs',
            jobs: formattedJobs,
            filterStatus: status || 'all'
        });
    } catch (err) {
        console.error('Admin jobs error:', err);
        res.redirect('/admin/dashboard');
    }
});

// ─────────────────────────────────────────────────────────────
// POST /admin/jobs/:id/approve
// ─────────────────────────────────────────────────────────────
router.post('/jobs/:id/approve', async (req, res) => {
    try {
        await runStmt('update', 'jobs', { is_approved: true }, { id: req.params.id });
        req.session.success = 'Job listing approved and now visible to job seekers.';
        res.redirect('/admin/jobs');
    } catch (err) {
        console.error('Job approve error:', err);
        res.redirect('/admin/jobs');
    }
});

// ─────────────────────────────────────────────────────────────
// POST /admin/jobs/:id/reject
// ─────────────────────────────────────────────────────────────
router.post('/jobs/:id/reject', async (req, res) => {
    try {
        await runStmt('update', 'jobs', { is_approved: false }, { id: req.params.id });
        req.session.success = 'Job listing has been rejected.';
        res.redirect('/admin/jobs');
    } catch (err) {
        console.error('Job reject error:', err);
        res.redirect('/admin/jobs');
    }
});

// ─────────────────────────────────────────────────────────────
// POST /admin/jobs/:id/delete
// ─────────────────────────────────────────────────────────────
router.post('/jobs/:id/delete', async (req, res) => {
    try {
        // FK cascade handles applications
        await runStmt('delete', 'jobs', {}, { id: req.params.id });
        req.session.success = 'Job listing and associated applications have been permanently deleted.';
        res.redirect('/admin/jobs');
    } catch (err) {
        console.error('Job delete error:', err);
        res.redirect('/admin/jobs');
    }
});

module.exports = router;