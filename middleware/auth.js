/**
 * Authentication & authorization middleware.
 * 
 * ACCESSIBILITY NOTE: All redirects go to accessible pages with
 * proper ARIA announcements. Error states are communicated via
 * flash messages readable by screen readers.
 */
/**
 * Injects user data into all EJS templates.
 * This allows every page to show/hide elements based on auth state.
 */
function injectUser(req, res, next) {
    res.locals.user = req.session.user || null;
    res.locals.success = req.session.success || null;
    res.locals.error = req.session.error || null;
    // Clear flash messages after reading
    delete req.session.success;
    delete req.session.error;
    next();
}
/**
 * Require the user to be logged in.
 * Redirects to /login with an accessible error message.
 */
function requireAuth(req, res, next) {
    if (!req.session.user) {
        req.session.error = 'Please log in to access this page.';
        return res.redirect('/auth/login');
    }
    next();
}
/**
 * Require the user to have a specific role.
 * @param {...string} roles - Allowed roles (e.g., 'employer', 'admin')
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.session.user) {
            req.session.error = 'Please log in to access this page.';
            return res.redirect('/auth/login');
        }
        if (!roles.includes(req.session.user.role)) {
            req.session.error = 'You do not have permission to access this page.';
            return res.redirect('/');
        }
        next();
    };
}
module.exports = { injectUser, requireAuth, requireRole };