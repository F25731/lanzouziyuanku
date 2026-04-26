require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const { RedisStore } = require('connect-redis');
const { createClient } = require('redis');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const { testDbConnection } = require('./config/db');
const { runMigrations } = require("./scripts/run_migrations");
const { ensurePersonalResourceSchema } = require('./services/schemaService');
const { ensureAdminUser, getUserById } = require('./services/userService');
const { requireAdminPage } = require('./middleware/auth');
const apiRouter = require('./routes/api');
const adminRouter = require('./routes/admin');
const localAdminRouter = require('./routes/localAdmin');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = Number(process.env.PORT || 3000);

const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379)
  },
  password: process.env.REDIS_PASSWORD || undefined
});
redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.connect().catch((err) => console.error('Redis Connect Error', err));

const redisStore = new RedisStore({
  client: redisClient,
  prefix: 'lanzou:sess:'
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: redisStore,
  name: 'lanzou.sid',
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 7 * 24 * 3600 * 1000
  }
}));

app.use(async (req, res, next) => {
  if (req.session?.user?.id) {
    const dbUser = await getUserById(req.session.user.id);
    if (!dbUser || dbUser.status !== 1) {
      delete req.session.user;
    } else {
      req.session.user = {
        id: dbUser.id,
        role: dbUser.role,
        username: dbUser.username
      };
    }
  }

  if (req.session?.admin?.id) {
    const dbAdmin = await getUserById(req.session.admin.id);
    if (!dbAdmin || dbAdmin.status !== 1 || dbAdmin.role !== 'admin') {
      delete req.session.admin;
    } else {
      req.session.admin = {
        id: dbAdmin.id,
        role: dbAdmin.role
      };
    }
  }

  next();
});

app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));
app.use('/api', apiRouter);
app.use('/api/admin', adminRouter);
app.use('/api/local-admin', localAdminRouter);

app.get('/admin', (req, res) => {
  res.redirect('/admin/login');
});

app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});

app.get('/admin/dashboard', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html'));
});

app.get('/admin/dashboard-v2', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard-v2.html'));
});


app.get('/front-v2', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index-v2.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(errorHandler);

async function start() {
  await testDbConnection();
  await runMigrations();
  await ensurePersonalResourceSchema();
  await ensureAdminUser();

  app.listen(PORT, () => {
    console.log(`[OK] Server started: http://127.0.0.1:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[FATAL] Startup failed:', err);
  process.exit(1);
});
