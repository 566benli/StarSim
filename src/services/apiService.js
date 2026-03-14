/**
 * API service for communicating with the StarSim Central Terminal server.
 * Handles authentication tokens and cloud simulation storage.
 */

const SERVER_URL_KEY = 'starsim-server-url';
const AUTH_TOKEN_KEY = 'starsim-auth-token';
const AUTH_USER_KEY  = 'starsim-auth-user';

function getServerUrl() {
  return localStorage.getItem(SERVER_URL_KEY) || 'http://localhost:4000';
}

function setServerUrl(url) {
  localStorage.setItem(SERVER_URL_KEY, url);
}

function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function getUser() {
  try {
    const s = localStorage.getItem(AUTH_USER_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

function setAuth(token, user) {
  if (token && user) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  }
}

function isLoggedIn() {
  return !!getToken();
}

function logout() {
  setAuth(null, null);
}

async function apiFetch(path, options = {}) {
  const url = getServerUrl() + path;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
  return data;
}

// ───── Auth ─────

async function register(username, password, email) {
  const data = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, email: email || undefined }),
  });
  setAuth(data.token, data.user);
  return data.user;
}

async function login(username, password) {
  const data = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setAuth(data.token, data.user);
  return data.user;
}

async function getProfile() {
  return apiFetch('/api/auth/me');
}

async function forgotPassword(email) {
  return apiFetch('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

// ───── Cloud Simulations ─────

async function cloudSave(slotName, simName, bodyCount, simTime, saveData) {
  return apiFetch('/api/simulations', {
    method: 'POST',
    body: JSON.stringify({
      slotName,
      simName: simName || slotName,
      bodyCount,
      simTime,
      data: typeof saveData === 'string' ? saveData : JSON.stringify(saveData),
    }),
  });
}

async function cloudListMine() {
  return apiFetch('/api/simulations/mine');
}

async function cloudLoad(simId) {
  return apiFetch(`/api/simulations/${simId}`);
}

async function cloudDelete(simId) {
  return apiFetch(`/api/simulations/${simId}`, { method: 'DELETE' });
}

async function checkServerOnline() {
  try {
    const url = getServerUrl() + '/api/stats';
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch { return false; }
}

export {
  getServerUrl, setServerUrl,
  getToken, getUser, setAuth, isLoggedIn, logout,
  register, login, getProfile, forgotPassword,
  cloudSave, cloudListMine, cloudLoad, cloudDelete,
  checkServerOnline,
};
