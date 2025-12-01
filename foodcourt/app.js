require('./config/config');
require('./models/db');

const mongoose = require('mongoose');
const bodyparser = require('body-parser');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const MongoStore = require('connect-mongo')(session);

const rtsIndex = require('./routes/index.router');

var app = express();

// CORS - allow requests from configured client URL and localhost dev port
const corsOrigins = [process.env.CLIENT_URL || 'http://localhost:5173'];
app.use(cors({
    origin: corsOrigins,
    credentials: true
}));

// If running behind a proxy (e.g. in production behind a load balancer), enable trust proxy
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

app.use(bodyparser.json());

// Session configuration using environment values from config
const SESSION_NAME = process.env.SESSION_NAME || 'fcSession';
const SESSION_SECRET = process.env.EXPRESS_SESSION_SECRET || 'fcSession';
const SESS_LIFETIME = parseInt(process.env.SESS_LIFETIME || process.env.SESS_LIFETIME || '2592000000'); // default 30 days

const isProd = process.env.NODE_ENV === 'production';

app.use(session({
    name: SESSION_NAME,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new MongoStore({
        mongooseConnection: mongoose.connection
    }),
    cookie: {
        maxAge: SESS_LIFETIME,
        // For deployed frontend on different origin, cookie must be sent cross-site
        // In production set sameSite to 'none' and secure to true. In development keep 'lax'.
        sameSite: isProd ? 'none' : 'lax',
        secure: isProd
    }
}));

app.use(function(req, res, next) {
    res.locals.session = req.session;
    next();
})

// error handler
app.use((err, req, res, next) => {
    if (err.name === 'ValidationError') {
        var valErrors = [];
        Object.keys(err.errors).forEach(key => valErrors.push(err.errors[key].message));
        res.status(422).send(valErrors)
    }
});

app.use('/api', rtsIndex);

app.listen(process.env.PORT, () => console.log('Server started at port :' + process.env.PORT));