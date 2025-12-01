const mongoose = require('mongoose');

const User = mongoose.model('User');

const sanitizeUser = (user) => ({
    id: user._id,
    identifier: user.identifier,
    name: user.name,
    role: user.role,
    profile: user.profile
});

module.exports.register = async(req, res, next) => {
    try {
        const { identifier, name, password, role, profile } = req.body;
        if (!identifier || !name || !password) {
            return res.status(422).json({
                status: false,
                message: "Identifier, name and password are required."
            });
        }
        if (role && role !== 'student') {
            return res.status(403).json({
                status: false,
                message: "Only student self-registration is allowed."
            });
        }

        const existing = await User.findOne({ identifier });
        if (existing) {
            return res.status(409).json({
                status: false,
                message: "Identifier already exists."
            });
        }

        const passwordHash = await User.hashPassword(password);
        const newUser = new User({
            identifier,
            name,
            role: role || 'student',
            passwordHash,
            profile
        });
        await newUser.save();
        return res.status(201).json(sanitizeUser(newUser));
    } catch (err) {
        return next(err);
    }
};

module.exports.login = async(req, res, next) => {
    try {
        const { identifier, password, role } = req.body;
        if (!identifier || !password) {
            return res.status(422).json({
                status: false,
                message: "Identifier and password are required."
            });
        }

        const user = await User.findOne({ identifier });
        if (!user) {
            return res.status(401).json({
                status: false,
                message: "Invalid credentials."
            });
        }

        if (role && role !== user.role) {
            return res.status(403).json({
                status: false,
                message: "Role mismatch for this account."
            });
        }

        const valid = await user.verifyPassword(password);
        if (!valid) {
            return res.status(401).json({
                status: false,
                message: "Invalid credentials."
            });
        }
        const safeUser = sanitizeUser(user);
        req.session.user = safeUser;
        // ensure session is persisted before sending response to avoid race conditions
        req.session.save((err) => {
            if (err) return next(err);
            return res.status(200).json({
                status: true,
                user: safeUser
            });
        });
    } catch (err) {
        return next(err);
    }
};

module.exports.me = (req, res) => {
    if (!req.session.user) {
        return res.status(200).json(null);
    }
    return res.status(200).json(req.session.user);
};

module.exports.logout = (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('fcSession');
        return res.status(204).send();
    });
};

