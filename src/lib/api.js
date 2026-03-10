const API_BASE = '/.netlify/functions';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

export function getAuthUrl(provider = 'gmail') {
  return request(`/auth-login?provider=${provider}`);
}

export function syncEmails(email, provider = 'gmail', opts = {}) {
  const params = new URLSearchParams({ email, provider, ...opts });
  return request(`/emails-sync?${params}`);
}

export function getConfig(email) {
  return request(`/config-get?email=${encodeURIComponent(email)}`);
}

export function saveConfig(email, config) {
  return request('/config-update', {
    method: 'POST',
    body: JSON.stringify({ email, config }),
  });
}

export function analyzeEmails(email, provider = 'gmail', opts = {}) {
  const params = new URLSearchParams({ email, provider, ...opts });
  return request(`/emails-analyze?${params}`);
}

export function listDecisions(email, status) {
  const params = new URLSearchParams({ email });
  if (status) params.set('status', status);
  return request(`/decisions-list?${params}`);
}

export function checkDecisions(email, provider = 'gmail') {
  const params = new URLSearchParams({ email, provider });
  return request(`/decisions-check?${params}`);
}
