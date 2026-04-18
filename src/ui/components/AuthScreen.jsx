/**
 * AuthScreen - Login / Register / Play Offline screen shown at startup.
 */
import React, { useState, useEffect } from 'react';
import {
  register, login, forgotPassword, isLoggedIn, getUser, logout,
  checkServerOnline, getServerUrl, setServerUrl,
} from '@services/apiService';
import './AuthScreen.css';

const AuthScreen = ({ onAuthenticated, onOffline }) => {
  const [mode, setMode] = useState('login'); // login | register | forgot | settings
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverOnline, setServerOnline] = useState(null);
  const [serverUrl, setServerUrlState] = useState(getServerUrl());

  useEffect(() => {
    checkServerOnline().then(setServerOnline);
    if (isLoggedIn()) {
      const user = getUser();
      if (user) onAuthenticated(user);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'register') {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }
        const user = await register(username, password, email);
        onAuthenticated(user);
      } else if (mode === 'login') {
        const user = await login(username, password);
        onAuthenticated(user);
      } else if (mode === 'forgot') {
        await forgotPassword(email);
        setSuccess('If that email is registered, a reset link has been sent. Check your inbox.');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    }
    setLoading(false);
  };

  const handleSaveServerUrl = () => {
    setServerUrl(serverUrl);
    setServerUrlState(serverUrl);
    setSuccess('Server URL updated');
    checkServerOnline().then(setServerOnline);
  };

  return (
    <div className="auth-backdrop">
      <div className="auth-stars" />
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-icon">&#x2728;</span>
          <h1>Genesis Error</h1>
          <p className="auth-tagline">Central Terminal</p>
        </div>

        {/* Server status */}
        <div className="auth-server-status">
          <span className={`status-dot ${serverOnline === null ? 'checking' : serverOnline ? 'online' : 'offline'}`} />
          <span className="status-text">
            {serverOnline === null ? 'Checking server...' : serverOnline ? 'Server online' : 'Server offline'}
          </span>
          <button className="settings-btn" onClick={() => setMode(mode === 'settings' ? 'login' : 'settings')} title="Server settings">
            &#9881;
          </button>
        </div>

        {mode === 'settings' && (
          <div className="auth-settings">
            <label>Server URL</label>
            <div className="server-url-row">
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrlState(e.target.value)}
                placeholder="http://localhost:4000"
              />
              <button onClick={handleSaveServerUrl}>Save</button>
            </div>
          </div>
        )}

        {mode !== 'settings' && (
          <form onSubmit={handleSubmit} className="auth-form">
            {/* Tab buttons */}
            <div className="auth-tabs">
              <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); setSuccess(''); }}>
                Log In
              </button>
              <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); setSuccess(''); }}>
                Register
              </button>
            </div>

            {mode === 'forgot' ? (
              <>
                <p className="auth-hint">Enter the email you registered with. We'll send a reset link.</p>
                <input type="email" placeholder="Email address" value={email}
                  onChange={(e) => setEmail(e.target.value)} required autoFocus />
                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
                <button type="button" className="auth-link" onClick={() => setMode('login')}>
                  Back to Login
                </button>
              </>
            ) : (
              <>
                <input type="text" placeholder="Username" value={username}
                  onChange={(e) => setUsername(e.target.value)} required autoFocus
                  autoComplete="username" minLength={3} maxLength={30} />

                <input type="password" placeholder="Password" value={password}
                  onChange={(e) => setPassword(e.target.value)} required
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  minLength={6} />

                {mode === 'register' && (
                  <>
                    <input type="password" placeholder="Confirm password" value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)} required
                      autoComplete="new-password" minLength={6} />
                    <input type="email" placeholder="Email (optional — for password recovery)"
                      value={email} onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email" />
                  </>
                )}

                <button type="submit" className="auth-submit" disabled={loading || !serverOnline}>
                  {loading ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
                </button>

                {mode === 'login' && (
                  <button type="button" className="auth-link" onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}>
                    Forgot password?
                  </button>
                )}
              </>
            )}
          </form>
        )}

        {error && <div className="auth-msg error">{error}</div>}
        {success && <div className="auth-msg success">{success}</div>}

        <div className="auth-divider"><span>or</span></div>

        <button className="auth-offline-btn" onClick={onOffline}>
          Play Offline
          <span className="offline-hint">No account needed — data saved locally only</span>
        </button>
      </div>
    </div>
  );
};

export default AuthScreen;
