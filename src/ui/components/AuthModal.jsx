/**
 * AuthModal — Login / Register / Forgot-password overlay for StarSim.
 * Appears on first launch and is accessible from the toolbar.
 */
import React, { useState } from 'react';
import cloud from '@services/cloudService';

const AuthModal = ({ onClose, onAuth }) => {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot'
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(''); setLoading(true);
    try {
      const user = await cloud.login(username, password);
      onAuth?.(user);
      onClose?.();
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleRegister = async () => {
    setError(''); setLoading(true);
    try {
      const user = await cloud.register(username, password, email);
      onAuth?.(user);
      onClose?.();
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleForgot = async () => {
    setError(''); setInfo(''); setLoading(true);
    try {
      await cloud.forgotPassword(email);
      setInfo('If that email exists, a reset link was sent.');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (mode === 'login') handleLogin();
      else if (mode === 'register') handleRegister();
      else handleForgot();
    }
    e.stopPropagation();
  };

  const switchMode = (m) => { setMode(m); setError(''); setInfo(''); };

  return (
    <div className="auth-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="auth-modal">
        {mode === 'login' && (
          <>
            <h2 className="auth-title">Log In</h2>
            <p className="auth-subtitle">Connect to the Central Terminal</p>
            <div className="auth-field">
              <label>Username or Email</label>
              <input value={username} onChange={e => setUsername(e.target.value)}
                     onKeyDown={handleKeyDown} autoFocus autoComplete="username" />
            </div>
            <div className="auth-field">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                     onKeyDown={handleKeyDown} autoComplete="current-password" />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button className="auth-btn primary" onClick={handleLogin} disabled={loading}>
              {loading ? 'Logging in...' : 'Log In'}
            </button>
            <div className="auth-switch">
              No account? <span onClick={() => switchMode('register')}>Create one</span>
            </div>
            <div className="auth-switch">
              <span onClick={() => switchMode('forgot')}>Forgot password?</span>
            </div>
          </>
        )}

        {mode === 'register' && (
          <>
            <h2 className="auth-title">Create Account</h2>
            <p className="auth-subtitle">Join the StarSim explorer network</p>
            <div className="auth-field">
              <label>Username</label>
              <input value={username} onChange={e => setUsername(e.target.value)}
                     onKeyDown={handleKeyDown} autoFocus autoComplete="username" />
            </div>
            <div className="auth-field">
              <label>Email <span style={{opacity:.5}}>(optional — for password recovery)</span></label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                     onKeyDown={handleKeyDown} autoComplete="email" />
            </div>
            <div className="auth-field">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                     onKeyDown={handleKeyDown} autoComplete="new-password" />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button className="auth-btn primary" onClick={handleRegister} disabled={loading}>
              {loading ? 'Creating...' : 'Create Account'}
            </button>
            <div className="auth-switch">
              Already have an account? <span onClick={() => switchMode('login')}>Log in</span>
            </div>
          </>
        )}

        {mode === 'forgot' && (
          <>
            <h2 className="auth-title">Reset Password</h2>
            <p className="auth-subtitle">Enter your registered email</p>
            <div className="auth-field">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                     onKeyDown={handleKeyDown} autoFocus autoComplete="email" />
            </div>
            {error && <div className="auth-error">{error}</div>}
            {info && <div className="auth-info">{info}</div>}
            <button className="auth-btn primary" onClick={handleForgot} disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            <div className="auth-switch">
              <span onClick={() => switchMode('login')}>Back to login</span>
            </div>
          </>
        )}

        <div className="auth-divider">or</div>
        <button className="auth-btn secondary" onClick={() => onClose?.()}>
          Play Offline (skip)
        </button>
      </div>
    </div>
  );
};

export default AuthModal;
