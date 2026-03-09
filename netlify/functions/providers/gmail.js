import { google } from 'googleapis';
import { EmailProvider } from './base.js';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

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
    from: parseAddress(parseHeader(headers, 'From')),
    to: parseAddressList(parseHeader(headers, 'To')),
    subject: parseHeader(headers, 'Subject'),
    date: parseHeader(headers, 'Date'),
    snippet: msg.snippet || '',
    body: decodeBody(msg.payload || {}),
    threadCount: null,
    hasAttachments: (msg.payload?.parts || []).some((p) => p.filename && p.filename.length > 0),
    labels: msg.labelIds || [],
  };
}

export class GmailProvider extends EmailProvider {
  constructor() {
    super('gmail');
  }

  getAuthUrl(state) {
    const client = getOAuth2Client();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state,
    });
  }

  async authenticate(code) {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const gmail = google.gmail({ version: 'v1', auth: client });
    const profile = await gmail.users.getProfile({ userId: 'me' });

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(tokens.expiry_date).toISOString(),
      email: profile.data.emailAddress,
    };
  }

  async refreshToken(refreshToken) {
    const client = getOAuth2Client();
    client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await client.refreshAccessToken();
    return {
      accessToken: credentials.access_token,
      expiresAt: new Date(credentials.expiry_date).toISOString(),
    };
  }

  async revokeAccess(token) {
    const client = getOAuth2Client();
    await client.revokeToken(token);
  }

  async fetchEmails(accessToken, opts = {}) {
    const { maxResults = 20, query = 'in:inbox' } = opts;
    const client = getOAuth2Client();
    client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: client });

    const list = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: query,
    });

    if (!list.data.messages) return [];

    const messages = await Promise.all(
      list.data.messages.map((m) =>
        gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' })
      )
    );

    return messages.map((m) => normalizeMessage(m.data));
  }

  async getThread(accessToken, threadId) {
    const client = getOAuth2Client();
    client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: client });

    const thread = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
    const messages = (thread.data.messages || []).map(normalizeMessage);
    messages.forEach((m) => (m.threadCount = messages.length));
    return messages;
  }

  async checkReplyExists(accessToken, emailId) {
    const client = getOAuth2Client();
    client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: client });

    const msg = await gmail.users.messages.get({ userId: 'me', id: emailId, format: 'metadata' });
    const threadId = msg.data.threadId;

    const thread = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'metadata' });
    const messages = thread.data.messages || [];

    const profile = await gmail.users.getProfile({ userId: 'me' });
    const userEmail = profile.data.emailAddress;

    const msgIndex = messages.findIndex((m) => m.id === emailId);
    const laterMessages = messages.slice(msgIndex + 1);

    return laterMessages.some((m) => {
      const from = (m.payload?.headers || []).find((h) => h.name.toLowerCase() === 'from');
      return from?.value?.includes(userEmail);
    });
  }
}
