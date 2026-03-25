import { EmailProvider } from './base.js';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

function parseHeader(headers, name) {
  const h = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

function parseAddress(raw) {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2], domain: match[2].split('@')[1] };
  }
  return { name: raw, email: raw, domain: raw.split('@')[1] || '' };
}

function parseAddressList(raw) {
  if (!raw) return [];
  return raw.split(',').map((s) => parseAddress(s.trim()));
}

function decodeBody(part) {
  if (part.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf8');
  }
  if (part.parts) {
    const textPart = part.parts.find((p) => p.mimeType === 'text/plain');
    if (textPart) return decodeBody(textPart);
    const htmlPart = part.parts.find((p) => p.mimeType === 'text/html');
    if (htmlPart) return decodeBody(htmlPart);
    for (const sub of part.parts) {
      const result = decodeBody(sub);
      if (result) return result;
    }
  }
  return '';
}

function normalizeMessage(msg) {
  const headers = msg.payload?.headers || [];
  return {
    id: msg.id,
    threadId: msg.threadId,
    messageId: parseHeader(headers, 'Message-ID') || parseHeader(headers, 'Message-Id'),
    from: parseAddress(parseHeader(headers, 'From')),
    to: parseAddressList(parseHeader(headers, 'To')),
    subject: parseHeader(headers, 'Subject'),
    date: parseHeader(headers, 'Date'),
    snippet: msg.snippet || '',
    body: decodeBody(msg.payload || {}),
    labels: msg.labelIds || [],
    threadCount: null,
    hasAttachments: (msg.payload?.parts || []).some((p) => p.filename && p.filename.length > 0),
  };
}

async function gmailFetch(accessToken, path, opts = {}) {
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    if (res.status === 403 && err.includes('SCOPE_INSUFFICIENT')) {
      throw new Error('Permissions insuffisantes. Déconnectez-vous et reconnectez-vous.');
    }
    throw new Error(`Gmail API error (${res.status}): ${err}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export class GmailProvider extends EmailProvider {
  constructor() {
    super('gmail');
  }

  getAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async authenticate(code) {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed (${tokenRes.status})`);
    }

    const tokens = await tokenRes.json();

    const profile = await gmailFetch(tokens.access_token, '/profile');

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      email: profile.emailAddress,
    };
  }

  async refreshToken(refreshToken) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) {
      throw new Error(`Token refresh failed (${res.status})`);
    }
    const tokens = await res.json();
    return {
      accessToken: tokens.access_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    };
  }

  async revokeAccess(token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' });
  }

  async fetchEmails(accessToken, opts = {}) {
    const { maxResults = 20, query = 'in:inbox' } = opts;

    const params = new URLSearchParams({ maxResults: String(maxResults), q: query });
    const list = await gmailFetch(accessToken, `/messages?${params}`);

    if (!list.messages) return [];

    const messages = await Promise.all(
      list.messages.map((m) =>
        gmailFetch(accessToken, `/messages/${m.id}?format=full`)
      )
    );

    return messages.map(normalizeMessage);
  }

  async getThread(accessToken, threadId) {
    const data = await gmailFetch(accessToken, `/threads/${threadId}?format=full`);
    const messages = (data.messages || []).map(normalizeMessage);
    messages.forEach((m) => (m.threadCount = messages.length));
    return messages;
  }

  _buildRfc2822({ to, subject, body, from, inReplyTo, references }) {
    const lines = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      `Content-Type: text/plain; charset=utf-8`,
      `MIME-Version: 1.0`,
    ];
    if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
    if (references) lines.push(`References: ${references}`);
    lines.push('', body);
    return Buffer.from(lines.join('\r\n')).toString('base64url');
  }

  async createDraft(accessToken, { to, subject, body, threadId, inReplyTo, references, from }) {
    const raw = this._buildRfc2822({
      to,
      subject: subject.startsWith('Re: ') ? subject : `Re: ${subject}`,
      body,
      from,
      inReplyTo,
      references,
    });

    const data = await gmailFetch(accessToken, '/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { raw, threadId } }),
    });

    return { draftId: data.id, messageId: data.message?.id };
  }

  async sendDraft(accessToken, draftId) {
    const data = await gmailFetch(accessToken, '/drafts/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: draftId }),
    });

    return { messageId: data.id, threadId: data.threadId };
  }

  async deleteDraft(accessToken, draftId) {
    const res = await fetch(`${GMAIL_API}/drafts/${draftId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Erreur suppression brouillon (${res.status})`);
    }
  }

  async checkReplyExists(accessToken, emailId) {
    const msg = await gmailFetch(accessToken, `/messages/${emailId}?format=metadata`);
    const threadId = msg.threadId;

    const thread = await gmailFetch(accessToken, `/threads/${threadId}?format=metadata`);
    const messages = thread.messages || [];

    const profile = await gmailFetch(accessToken, '/profile');
    const userEmail = profile.emailAddress;

    const msgIndex = messages.findIndex((m) => m.id === emailId);
    const laterMessages = messages.slice(msgIndex + 1);

    return laterMessages.some((m) => {
      const from = (m.payload?.headers || []).find((h) => h.name.toLowerCase() === 'from');
      return from?.value?.includes(userEmail);
    });
  }
}
