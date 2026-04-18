const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('./database');
const { signToken, authRequired } = require('./middleware');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
    if (username.length < 3 || username.length > 30) return res.status(400).json({ error: 'Username must be 3–30 characters' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (db.findUserByUsername(username)) return res.status(409).json({ error: 'Username already taken' });
    if (email && db.findUserByEmail(email)) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const user = db.createUser({ username, email, password: hash });
    const token = signToken({ id: user.id, username: user.username });
    res.status(201).json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) { console.error('Register error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    const user = db.findUserByUsername(username) || db.findUserByEmail(username);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    db.updateUserLogin(user.id);
    const token = signToken({ id: user.id, username: user.username });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) { console.error('Login error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/me', authRequired, (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const sims = db.listSimsByUser(user.id);
  res.json({
    id: user.id, username: user.username, email: user.email,
    avatar_url: user.avatar_url, created_at: user.created_at,
    last_login: user.last_login, simulationCount: sims.length,
  });
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const user = db.findUserByEmail(email);
    if (!user) return res.json({ message: 'If that email is registered, a reset link has been sent.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000).toISOString();
    db.createPasswordReset(user.id, token, expiresAt);

    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${token}`;
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'Genesis Error <noreply@genesiserror.app>', to: email,
        subject: 'Genesis Error (创世错误) - Password Reset',
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:20px;background:#0a0a1a;color:#e0e0ff;border-radius:12px;">
          <h2 style="color:#00ccff;">Genesis Error Password Reset</h2>
          <p>Hello <strong>${user.username}</strong>,</p>
          <p>Click the button below to reset your password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#4488ff;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">Reset Password</a>
          <p style="margin-top:20px;font-size:12px;color:#888;">If you didn't request this, you can safely ignore this email.</p></div>`,
      });
    } else {
      console.log(`[DEV] Password reset token for ${user.username}: ${token}`);
    }
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) { console.error('Forgot password error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const reset = db.findValidReset(token);
    if (!reset) return res.status(400).json({ error: 'Invalid or expired reset token' });

    const hash = await bcrypt.hash(newPassword, 12);
    db.updateUserPassword(reset.user_id, hash);
    db.markResetUsed(reset.id);
    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) { console.error('Reset password error:', err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
