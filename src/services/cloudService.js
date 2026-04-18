/**
 * CloudService — API client for Genesis Error Central Terminal.
 * Manages authentication (JWT) and cloud save/load.
 * Falls back gracefully when the server is unreachable.
 */

const STORAGE_TOKEN_KEY = 'genesiserror-cloud-token';
const STORAGE_USER_KEY = 'genesiserror-cloud-user';
const STORAGE_SERVER_KEY = 'genesiserror-server-url';

// Production URL — set this to your VPS address once deployed.
// Users can override via localStorage for development/testing.
const DEFAULT_SERVER_URL = 'https://genesis-error-terminal.duckdns.org';

let _serverUrl = DEFAULT_SERVER_URL;
let _token = null;
let _user = null;
let _listeners = [];

// ---------------------------------------------------------------------------
//  Initialization
// ---------------------------------------------------------------------------
function init(serverUrl) {
  const stored = localStorage.getItem(STORAGE_SERVER_KEY);
  if (serverUrl) _serverUrl = serverUrl.replace(/\/+$/, '');
  else if (stored) _serverUrl = stored;
  else _serverUrl = DEFAULT_SERVER_URL;
  _token = localStorage.getItem(STORAGE_TOKEN_KEY) || null;
  try {
    const u = localStorage.getItem(STORAGE_USER_KEY);
    _user = u ? JSON.parse(u) : null;
  } catch { _user = null; }
}

// ---------------------------------------------------------------------------
//  State
// ---------------------------------------------------------------------------
function getUser() { return _user; }
function getToken() { return _token; }
function isLoggedIn() { return !!_token && !!_user; }

function subscribe(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

function _notify() { _listeners.forEach(fn => fn({ user: _user, loggedIn: isLoggedIn() })); }

function _setAuth(token, user) {
  _token = token;
  _user = user;
  if (token) {
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
  }
  _notify();
}

// ---------------------------------------------------------------------------
//  HTTP helpers
// ---------------------------------------------------------------------------
async function _fetch(endpoint, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const res = await fetch(`${_serverUrl}/api${endpoint}`, {
    ...opts,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ---------------------------------------------------------------------------
//  Auth
// ---------------------------------------------------------------------------
async function register(username, password, email) {
  const data = await _fetch('/auth/register', {
    method: 'POST',
    body: { username, password, email: email || undefined },
  });
  _setAuth(data.token, data.user);
  return data.user;
}

async function login(username, password) {
  const data = await _fetch('/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  _setAuth(data.token, data.user);
  return data.user;
}

async function loginWithGoogle(googleData) {
  const data = await _fetch('/auth/google', {
    method: 'POST',
    body: googleData,
  });
  _setAuth(data.token, data.user);
  return data.user;
}

async function forgotPassword(email) {
  return _fetch('/auth/forgot', { method: 'POST', body: { email } });
}

async function resetPassword(token, newPassword) {
  return _fetch('/auth/reset', { method: 'POST', body: { token, newPassword } });
}

function logout() {
  _setAuth(null, null);
}

async function verifySession() {
  if (!_token) return false;
  try {
    const data = await _fetch('/auth/me');
    _user = data.user;
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(_user));
    _notify();
    return true;
  } catch {
    _setAuth(null, null);
    return false;
  }
}

// ---------------------------------------------------------------------------
//  Cloud saves
// ---------------------------------------------------------------------------
async function getCloudSaves() {
  if (!isLoggedIn()) return [];
  const data = await _fetch('/saves');
  return data.saves || [];
}

async function cloudSave(slotName, simData, bodyCount, simTime) {
  if (!isLoggedIn()) throw new Error('Not logged in');
  return _fetch('/saves', {
    method: 'POST',
    body: { slotName, simData, bodyCount, simTime },
  });
}

async function cloudLoad(saveId) {
  if (!isLoggedIn()) throw new Error('Not logged in');
  const data = await _fetch(`/saves/${saveId}`);
  return data.save;
}

async function cloudDelete(saveId) {
  if (!isLoggedIn()) throw new Error('Not logged in');
  return _fetch(`/saves/${saveId}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
//  Server health
// ---------------------------------------------------------------------------
async function isServerReachable() {
  try {
    const res = await fetch(`${_serverUrl}/api/terminal/stats`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch { return false; }
}

function getServerUrl() { return _serverUrl; }

function setServerUrl(url) {
  _serverUrl = url.replace(/\/+$/, '');
  localStorage.setItem(STORAGE_SERVER_KEY, _serverUrl);
}

// ---------------------------------------------------------------------------
//  Export
// ---------------------------------------------------------------------------
export default {
  init, getUser, getToken, isLoggedIn, subscribe,
  getServerUrl, setServerUrl,
  register, login, loginWithGoogle, forgotPassword, resetPassword, logout, verifySession,
  getCloudSaves, cloudSave, cloudLoad, cloudDelete,
  isServerReachable,
};
