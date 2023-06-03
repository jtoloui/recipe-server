import express, { Express } from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import https from 'https';
import expressWinston from 'express-winston';

import authRoutes from './src/routes/authRoutes';
import { isAuthenticated } from './src/middleware/isAdmin';
import jwtCheck from './src/middleware/jwtCheck';
import assignId from './src/middleware/requestId';
import logger from './src/logger/winston';
import { connectDB } from './src/db';
import recipeRoutes from './src/routes/recipeRoutes';
import { corsOptions } from './src/utils/cors';

import passport, { session } from 'passport';
import Auth0Strategy from 'passport-auth0';
import expressSession from 'express-session';
import cookieParser from 'cookie-parser';
import QueryString from 'qs';
import { authenticationClient } from './src/auth/auth0Client';

dotenv.config();

let strategy = new Auth0Strategy(
  {
    domain: process.env.AUTH0_DOMAIN || '',
    clientID: process.env.AUTH0_CLIENT_ID || '',
    clientSecret: process.env.AUTH0_CLIENT_SECRET || '',
    callbackURL: 'https://localhost:3001/auth/callback',
  },
  function (accessToken, refreshToken, extraParams, profile, done) {
    // accessToken is the JWT
    return done(null, { accessToken, profile });
  }
);

connectDB();
passport.use(strategy);

// You need to configure Passport to use session cookies:
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  // placeholder for custom user deserialization.
  // i don't have a user object to serialize,
  // but since i'm using Auth0, i can use
  // the profile object returned by Auth0
  done(null, user);
});

const app: Express = express();
const port = process.env.PORT;
// winston logger
const logLevel = process.env.LOG_LEVEL || 'info';
const winstonLogger = logger(logLevel);

app.use(cookieParser());
app.use(
  expressSession({
    secret: 'YOUR_SESSION_SECRET',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true }, // Change to true in production if using HTTPS
  })
);

app.use(passport.initialize());
app.use(passport.session());
// Configure express-session

// middleware - custom
app.use(jwtCheck);
app.use(assignId);

// middleware - third party
app.use(helmet());
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  expressWinston.logger({
    winstonInstance: winstonLogger,
    meta: false,
    msg: (req, res) =>
      `UserId: ${req.user.sub} - Request ID: ${req.id} - HTTP ${req.method} ${req.url} - Status: ${res.statusCode} - ${res.statusMessage}`,
  })
);

app.get(
  '/auth/callback',
  passport.authenticate('auth0', { failureRedirect: '/login' }),
  function (req, res) {
    if (!req.user) {
      throw new Error('user null');
    }

    // Set JWT in HttpOnly cookie
    res.cookie('jwt', req.user.accessToken, { httpOnly: true });

    // Redirect to the React app
    res.redirect(`${process.env.WEB_APP_URI}/`);
  }
);

app.get('/auth/authenticated', function (req, res) {
  console.log(req.user);

  console.log(req.session.);
  
  if (req.user !== undefined) {
    // User is authenticated
    res.json({ isAuthenticated: true });
  } else {
    // User is not authenticated
    res.json({ isAuthenticated: false });
  }
});

app.get(
  '/auth/login',
  //@ts-ignore
  passport.authenticate('auth0', {
    // Specify the scope of the data you want to access
    scope: 'openid email profile',
    audience: process.env.AUTH0_AUDIENCE,
    session: true,
  }),
  function (req, res) {
    res.redirect('/');
  }
);

app.get('/auth/logout', function (req, res, next) {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }

    res.clearCookie('jwt');
    res.redirect(
      `https://${process.env.AUTH0_DOMAIN}/v2/logout?returnTo=${process.env.WEB_APP_URI}&client_id=obnLFqEjKW26S1BuflpBmc3h4abPhzyw`
    );
  });
});

// Routes
app.use('/auth', authRoutes);
app.use('/api', recipeRoutes);

if (process.env.NODE_ENV !== 'production') {
  const key = fs.readFileSync('./certs/localhost-key.pem');
  const cert = fs.readFileSync('./certs/localhost.pem');

  https.createServer({ key, cert }, app).listen(port, () => {
    console.log(`⚡️[server]: Server is running at https://localhost:${port}`);
  });
} else {
  app.listen(port, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
  });
}
