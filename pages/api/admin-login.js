// pages/api/admin-login.js

const crypto = require('crypto');

const COOKIE_NAME = 'admin_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function signSession(expiry) {
  return crypto
    .createHmac('sha256', process.env.ADMIN_PASSWORD || '')
    .update(String(expiry))
    .digest('hex');
}

function isValidSession(cookieHeader) {
  if (!cookieHeader) return false;
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;

  const [expiryStr, signature] = match[1].split('.');
  const expiry = Number(expiryStr);
  if (!expiry || !signature || Date.now() > expiry) return false;

  const expected = signSession(expiry);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Silent session check — used by admin.html to skip the login form
    // when a valid 7-day session cookie is already present.
    if (!process.env.ADMIN_PASSWORD) {
      return res.status(500).json({ error: 'Missing ADMIN_PASSWORD' });
    }
    if (!isValidSession(req.headers.cookie)) {
      return res.status(401).json({ error: 'Not logged in' });
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    res.setHeader(
      'Set-Cookie',
      `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
    );
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Missing ADMIN_PASSWORD' });
  }

  const { password } = req.body || {};

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }

  const expiry = Date.now() + SESSION_MS;
  const signature = signSession(expiry);
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${expiry}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}`
  );
  return res.status(200).json({ ok: true });
}
