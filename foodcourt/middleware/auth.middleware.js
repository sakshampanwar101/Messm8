module.exports.requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({
            status: false,
            message: "Authentication required."
        });
    }
    next();
};

module.exports.requireRole = (roles) => {
    return (req, res, next) => {
        console.log('🔥 requireRole check');
        console.log('Session user:', req.session.user);
        console.log('Allowed roles:', roles);

        if (!req.session.user || !roles.includes(req.session.user.role)) {
            console.log('❌ Blocked by requireRole');
            return res.status(403).json({
                status: false,
                message: "Insufficient permissions."
            });
        }
        console.log('✅ Passed requireRole');
        next();
    };
};
