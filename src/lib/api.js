const API_BASE = '/.netlify/functions';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Erreur serveur (${res.status})`);
  }
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('account');
      window.location.reload();
    }
    throw new Error(data.error || `Erreur serveur (${res.status})`);
  }
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

export function dismissEmail(userId, emailId, provider = 'gmail') {
  return request('/email-dismiss', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, email_id: emailId, provider }),
  });
}

export function launchProfileGeneration(userId, provider = 'gmail') {
  return request('/profile-generate', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, provider }),
  });
}

export function pollProfileStatus(email) {
  return request(`/profile-generate?email=${encodeURIComponent(email)}`);
}

export function getEmailThread(email, threadId, provider = 'gmail') {
  const params = new URLSearchParams({ email, threadId, provider });
  return request(`/email-thread?${params}`);
}

export function generateDraft(userId, emailId, provider = 'gmail') {
  return request('/draft-generate', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, email_id: emailId, provider }),
  });
}

export function sendDraft(userId, draftId, emailId, provider = 'gmail') {
  return request('/draft-send', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, draft_id: draftId, email_id: emailId, provider }),
  });
}

export function refineDraft(userId, emailId, draftId, instruction, currentBody, currentSubject, currentTone, provider = 'gmail') {
  return request('/draft-refine', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      email_id: emailId,
      draft_id: draftId,
      instruction,
      current_body: currentBody,
      current_subject: currentSubject,
      current_tone: currentTone,
      provider,
    }),
  });
}

export function getDailyQuestion(email) {
  return request(`/daily-question?email=${encodeURIComponent(email)}`);
}

export function answerDailyQuestion(userId, type, answer, senderEmail = null, contextAddition = null) {
  return request('/daily-answer', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      type,
      answer,
      sender_email: senderEmail,
      context_addition: contextAddition,
    }),
  });
}

export function getCalendarEvents(email, provider = 'gmail', days = 7) {
  const params = new URLSearchParams({ email, provider, days: String(days) });
  return request(`/calendar-events?${params}`);
}

export function getFreeBusy(email, provider = 'gmail', days = 5, duration = 60) {
  const params = new URLSearchParams({ email, provider, days: String(days), duration: String(duration) });
  return request(`/calendar-freebusy?${params}`);
}

export function updateDraft(userId, draftId, provider = 'gmail', { emailId, body, subject, to, threadId, inReplyTo, references }) {
  return request('/draft-update', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      draft_id: draftId,
      email_id: emailId,
      provider,
      body,
      subject,
      to,
      thread_id: threadId,
      in_reply_to: inReplyTo,
      references,
    }),
  });
}
