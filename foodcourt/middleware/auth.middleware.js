module.exports.requireAuth = (req, res, next) => {
    // if (!req.session.user) {
    //     return res.status(401).json({
    //         status: false,
    //         message: "Authentication required."
    //     });
    // }
    next();
};

module.exports.requireRole = (roles) => {
    return (req, res, next) => {
        // if (!req.session.user || !roles.includes(req.session.user.role)) {
        //     return res.status(403).json({
        //         status: false,
        //         message: "Insufficient permissions."
        //     });
        // }
        next();
    };
};

