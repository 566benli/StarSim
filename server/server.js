/**
 * Genesis Error Central Terminal - Express server (production-ready)
 *
 * Provides:
 *  - User registration & login (username/password)
 *  - Google OAuth sign-in
 *  - Password reset via email
 *  - Cloud save / load for simulation data
 *  - Central Terminal dashboard (static HTML)
 *  - Global stats API for the dashboard
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3777;
const JWT_SECRET = process.env.JWT_SECRET || 'genesis-error-dev-secret-CHANGE-ME';
const SALT_ROUNDS = 10;

// ---------------------------------------------------------------------------
//  Security & performance middleware
// ---------------------------------------------------------------------------
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(compression());

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : null;

app.use(cors({
  origin: allowedOrigins || true,
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const saveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many save requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', generalLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgot', authLimiter);
app.use('/api/saves', saveLimiter);

app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() | 0 });
});

// ---------------------------------------------------------------------------
//  Auth middleware
// ---------------------------------------------------------------------------
function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email, isAdmin: !!user.is_admin },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function adminRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user = db.one('SELECT * FROM users WHERE id = ?', [payload.id]);
    if (!user || !user.is_admin) return res.status(403).json({ error: 'Admin access required' });
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ---------------------------------------------------------------------------
//  AUTH ROUTES
// ---------------------------------------------------------------------------

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = db.one('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    if (email) {
      const existEmail = db.one('SELECT id FROM users WHERE email = ?', [email]);
      if (existEmail) return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { lastId } = db.run(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email || null, hash]
    );

    const user = db.one('SELECT * FROM users WHERE id = ?', [lastId]);
    const token = signToken(user);
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const user = db.one(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, username]
    );
    if (!user || !user.password) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    db.run('UPDATE users SET last_login = datetime("now") WHERE id = ?', [user.id]);
    const token = signToken(user);
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken, email, name, googleId, avatarUrl } = req.body;
    if (!googleId || !email) return res.status(400).json({ error: 'Google auth data required' });

    let user = db.one('SELECT * FROM users WHERE google_id = ?', [googleId]);
    if (!user) {
      user = db.one('SELECT * FROM users WHERE email = ?', [email]);
      if (user) {
        db.run('UPDATE users SET google_id = ?, avatar_url = ? WHERE id = ?',
          [googleId, avatarUrl || null, user.id]);
        user = db.one('SELECT * FROM users WHERE id = ?', [user.id]);
      } else {
        const username = name?.replace(/\s+/g, '_').toLowerCase() || 'user_' + Date.now();
        let finalName = username;
        let attempt = 0;
        while (db.one('SELECT id FROM users WHERE username = ?', [finalName])) {
          attempt++;
          finalName = `${username}_${attempt}`;
        }
        db.run(
          'INSERT INTO users (username, email, google_id, avatar_url) VALUES (?, ?, ?, ?)',
          [finalName, email, googleId, avatarUrl || null]
        );
        user = db.one('SELECT * FROM users WHERE google_id = ?', [googleId]);
      }
    }

    db.run('UPDATE users SET last_login = datetime("now") WHERE id = ?', [user.id]);
    const token = signToken(user);
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/forgot', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const user = db.one('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.json({ message: 'If that email exists, a reset link was sent.' });

    const token = uuidv4();
    const expires = new Date(Date.now() + 3600000).toISOString();
    db.run('INSERT INTO reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, token, expires]);

    sendResetEmail(email, token).catch(e => console.error('Email send failed:', e));
    res.json({ message: 'If that email exists, a reset link was sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const row = db.one(
      "SELECT * FROM reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')",
      [token]
    );
    if (!row) return res.status(400).json({ error: 'Invalid or expired token' });

    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    db.run('UPDATE users SET password = ? WHERE id = ?', [hash, row.user_id]);
    db.run('UPDATE reset_tokens SET used = 1 WHERE id = ?', [row.id]);

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const user = db.one('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: sanitizeUser(user) });
});

app.put('/api/auth/profile', authRequired, async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;
    const user = db.one('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (email && email !== user.email) {
      const dup = db.one('SELECT id FROM users WHERE email = ? AND id != ?', [email, user.id]);
      if (dup) return res.status(409).json({ error: 'Email already in use' });
      db.run('UPDATE users SET email = ? WHERE id = ?', [email, user.id]);
    }

    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'Current password required' });
      if (user.password) {
        const match = await bcrypt.compare(currentPassword, user.password);
        if (!match) return res.status(401).json({ error: 'Current password incorrect' });
      }
      const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      db.run('UPDATE users SET password = ? WHERE id = ?', [hash, user.id]);
    }

    const updated = db.one('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({ user: sanitizeUser(updated) });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
//  SAVES ROUTES
// ---------------------------------------------------------------------------

app.get('/api/saves', authRequired, (req, res) => {
  const saves = db.all(
    'SELECT id, slot_name, body_count, sim_time, preview, created_at, updated_at FROM saves WHERE user_id = ? ORDER BY updated_at DESC',
    [req.user.id]
  );
  res.json({ saves });
});

app.post('/api/saves', authRequired, (req, res) => {
  try {
    const { slotName, simData, bodyCount, simTime, preview } = req.body;
    if (!slotName || !simData) return res.status(400).json({ error: 'Slot name and data required' });

    const dataStr = typeof simData === 'string' ? simData : JSON.stringify(simData);

    const existing = db.one(
      'SELECT id FROM saves WHERE user_id = ? AND slot_name = ?',
      [req.user.id, slotName]
    );

    if (existing) {
      db.run(
        'UPDATE saves SET sim_data = ?, body_count = ?, sim_time = ?, preview = ?, updated_at = datetime("now") WHERE id = ?',
        [dataStr, bodyCount || 0, simTime || 0, preview || null, existing.id]
      );
      res.json({ id: existing.id, message: 'Save updated' });
    } else {
      const { lastId } = db.run(
        'INSERT INTO saves (user_id, slot_name, sim_data, body_count, sim_time, preview) VALUES (?, ?, ?, ?, ?, ?)',
        [req.user.id, slotName, dataStr, bodyCount || 0, simTime || 0, preview || null]
      );
      res.json({ id: lastId, message: 'Save created' });
    }
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/saves/:id', authRequired, (req, res) => {
  const save = db.one(
    'SELECT * FROM saves WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id]
  );
  if (!save) return res.status(404).json({ error: 'Save not found' });
  res.json({ save });
});

app.delete('/api/saves/:id', authRequired, (req, res) => {
  const { changes } = db.run(
    'DELETE FROM saves WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id]
  );
  if (changes === 0) return res.status(404).json({ error: 'Save not found' });
  res.json({ message: 'Save deleted' });
});

// ---------------------------------------------------------------------------
//  TERMINAL / STATS (public)
// ---------------------------------------------------------------------------
app.get('/api/terminal/stats', (req, res) => {
  const userCount = db.one('SELECT COUNT(*) AS n FROM users')?.n || 0;
  const saveCount = db.one('SELECT COUNT(*) AS n FROM saves')?.n || 0;
  const totalBodies = db.one('SELECT COALESCE(SUM(body_count), 0) AS n FROM saves')?.n || 0;

  const topCreators = db.all(`
    SELECT u.username, u.avatar_url, COUNT(s.id) AS save_count,
           COALESCE(SUM(s.body_count), 0) AS total_bodies
    FROM users u LEFT JOIN saves s ON u.id = s.user_id
    GROUP BY u.id ORDER BY total_bodies DESC LIMIT 10
  `);

  const recentSaves = db.all(`
    SELECT s.slot_name, s.body_count, s.sim_time, s.updated_at, u.username
    FROM saves s JOIN users u ON s.user_id = u.id
    ORDER BY s.updated_at DESC, s.id DESC LIMIT 10
  `);

  res.json({ userCount, saveCount, totalBodies, topCreators, recentSaves });
});

app.get('/api/terminal/my-stats', authRequired, (req, res) => {
  const saves = db.all(
    'SELECT id, slot_name, body_count, sim_time, preview, updated_at FROM saves WHERE user_id = ? ORDER BY updated_at DESC',
    [req.user.id]
  );
  const totalBodies = saves.reduce((sum, s) => sum + (s.body_count || 0), 0);
  const totalSimTime = saves.reduce((sum, s) => sum + (s.sim_time || 0), 0);
  res.json({ saves, totalBodies, totalSimTime, saveCount: saves.length });
});

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
function sanitizeUser(u) {
  return {
    id: u.id,
    username: u.username,
    email: u.email || null,
    avatar_url: u.avatar_url || null,
    created_at: u.created_at,
    last_login: u.last_login,
    hasPassword: !!u.password,
    hasGoogle: !!u.google_id,
    isAdmin: !!u.is_admin,
  };
}

async function sendResetEmail(email, token) {
  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) {
    console.log(`[PASSWORD RESET] Token for ${email}: ${token}`);
    console.log('  (Configure SMTP_HOST / SMTP_USER / SMTP_PASS env vars to send real emails)');
    return;
  }

  // Resolve SMTP host via OS DNS (bypasses VPN/libuv DNS issues),
  // then connect directly to the IP for reliability.
  const dns = require('dns');
  const smtpIp = await new Promise((resolve, reject) => {
    dns.lookup(smtpHost, { family: 4 }, (err, addr) => err ? reject(err) : resolve(addr));
  });

  const transporter = nodemailer.createTransport({
    host: smtpIp,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
    tls: { servername: smtpHost, rejectUnauthorized: false },
  });

  const resetUrl = `${process.env.APP_URL || `http://localhost:${PORT}`}/reset?token=${token}`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"Genesis Error" <noreply@genesiserror.app>',
    to: email,
    subject: 'Genesis Error (创世错误) - Password Reset',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0a0a1a;color:#e0e0e0;border-radius:12px;">
        <h2 style="color:#00ccff;text-align:center;">Genesis Error Password Reset</h2>
        <p>Click the button below to reset your password. This link expires in 1 hour.</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${resetUrl}" style="display:inline-block;padding:12px 32px;background:#4a9eff;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">Reset Password</a>
        </div>
        <p style="color:#888;font-size:12px;">If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}

// ---------------------------------------------------------------------------
//  ADMIN / TERMINAL API (operator-only)
// ---------------------------------------------------------------------------
app.get('/api/admin/users', adminRequired, (req, res) => {
  const users = db.all(`
    SELECT u.id, u.username, u.email, u.avatar_url, u.is_admin, u.created_at, u.last_login,
           COUNT(s.id) AS save_count, COALESCE(SUM(s.body_count), 0) AS total_bodies
    FROM users u LEFT JOIN saves s ON u.id = s.user_id
    GROUP BY u.id ORDER BY u.id DESC
  `);
  res.json({ users });
});

app.get('/api/admin/saves', adminRequired, (req, res) => {
  const saves = db.all(`
    SELECT s.id, s.slot_name, s.body_count, s.sim_time, s.created_at, s.updated_at,
           u.username, u.id AS user_id
    FROM saves s JOIN users u ON s.user_id = u.id
    ORDER BY s.updated_at DESC LIMIT 100
  `);
  res.json({ saves });
});

app.delete('/api/admin/users/:id', adminRequired, (req, res) => {
  const userId = parseInt(req.params.id);
  if (userId === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  db.run('DELETE FROM saves WHERE user_id = ?', [userId]);
  db.run('DELETE FROM reset_tokens WHERE user_id = ?', [userId]);
  const { changes } = db.run('DELETE FROM users WHERE id = ?', [userId]);
  if (changes === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ message: 'User deleted' });
});

app.put('/api/admin/users/:id/promote', adminRequired, (req, res) => {
  const userId = parseInt(req.params.id);
  const { changes } = db.run('UPDATE users SET is_admin = 1 WHERE id = ?', [userId]);
  if (changes === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ message: 'User promoted to admin' });
});

app.put('/api/admin/users/:id/demote', adminRequired, (req, res) => {
  const userId = parseInt(req.params.id);
  if (userId === req.user.id) return res.status(400).json({ error: 'Cannot demote yourself' });
  const { changes } = db.run('UPDATE users SET is_admin = 0 WHERE id = ?', [userId]);
  if (changes === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ message: 'Admin privileges removed' });
});

// ---------------------------------------------------------------------------
//  Page routes
// ---------------------------------------------------------------------------
app.get('/terminal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terminal.html'));
});
app.get('/terminal/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terminal.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------------------------------------------------------------
//  Start
// ---------------------------------------------------------------------------
(async () => {
  await db.init();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  * Genesis Error Central Terminal running at http://0.0.0.0:${PORT}`);
    console.log(`     Dashboard:  http://localhost:${PORT}`);
    console.log(`     API:        http://localhost:${PORT}/api`);
    console.log(`     Mode:       ${process.env.NODE_ENV || 'development'}\n`);
  });
})();
