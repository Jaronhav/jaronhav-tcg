// pages/api/shopify-oauth-callback.js
// One-time bootstrap: completes the OAuth install for the Shopify CLI-based
// app so we can capture a real Admin API access token to paste into
// SHOPIFY_ADMIN_TOKEN. Not used by any other part of the site — delete this
// file once the token has been captured.
//
// Set this exact URL as BOTH the app's "App URL" and its "Allowed
// redirection URL(s)" in Shopify: https://<your-domain>/api/shopify-oauth-callback
// Requires SHOPIFY_APP_CLIENT_ID and SHOPIFY_APP_CLIENT_SECRET env vars
// (from the app's Settings page — NOT the same as SHOPIFY_ADMIN_TOKEN).
//
// No admin-cookie gate here on purpose: Shopify embeds the App URL in an
// iframe after install, and cross-site iframes don't carry the admin_session
// cookie (browser third-party cookie rules), which blocked this endpoint
// entirely. Safety instead comes from Shopify's HMAC-signed callback (only
// a real completed install using our client secret produces a valid one)
// and the single-use, short-lived authorization code — adequate for a
// temporary endpoint deleted right after use.

const crypto = require('crypto');

const SHOPIFY_DOMAIN = 'pxq5yx-ka.myshopify.com';
const SCOPES = 'read_products,write_products,read_inventory,write_inventory';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlPage(body) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="robots" content="noindex, nofollow">
<style>body{font-family:sans-serif; max-width:600px; margin:60px auto; padding:0 20px; line-height:1.5;}
textarea{width:100%; height:70px; font-family:monospace; font-size:14px; padding:10px;}
code{background:#eee; padding:2px 6px; border-radius:3px;}</style>
</head><body>${body}</body></html>`;
}

function verifyHmac(query) {
  const { hmac, signature, ...rest } = query;
  if (!hmac) return false;
  const message = Object.keys(rest)
    .sort()
    .map((key) => {
      const value = Array.isArray(rest[key]) ? rest[key].join(',') : rest[key];
      return `${key}=${value}`;
    })
    .join('&');
  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_APP_CLIENT_SECRET || '')
    .update(message)
    .digest('hex');
  const a = Buffer.from(digest);
  const b = Buffer.from(String(hmac));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html');

  if (!process.env.SHOPIFY_APP_CLIENT_ID || !process.env.SHOPIFY_APP_CLIENT_SECRET) {
    return res
      .status(500)
      .send(htmlPage('<p>Missing SHOPIFY_APP_CLIENT_ID / SHOPIFY_APP_CLIENT_SECRET env vars.</p>'));
  }

  const { code, shop } = req.query;

  if (!code) {
    // Leg 1: no code yet — kick off the OAuth authorize redirect.
    const redirectUri = `https://${req.headers.host}/api/shopify-oauth-callback`;
    const authorizeUrl =
      `https://${SHOPIFY_DOMAIN}/admin/oauth/authorize` +
      `?client_id=${encodeURIComponent(process.env.SHOPIFY_APP_CLIENT_ID)}` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;
    res.writeHead(302, { Location: authorizeUrl });
    return res.end();
  }

  // Leg 2: Shopify redirected back with a code — verify and exchange it.
  if (!verifyHmac(req.query)) {
    return res.status(400).send(htmlPage('<p>Invalid request signature — this callback did not come from Shopify as expected.</p>'));
  }

  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_APP_CLIENT_ID,
        client_secret: process.env.SHOPIFY_APP_CLIENT_SECRET,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return res.status(500).send(htmlPage(`<h2>Token exchange failed</h2><p>${escapeHtml(errText)}</p>`));
    }

    const data = await tokenRes.json();

    return res.status(200).send(
      htmlPage(`
        <h2>Success</h2>
        <p>Copy this into Vercel as <code>SHOPIFY_ADMIN_TOKEN</code>:</p>
        <textarea readonly onclick="this.select()">${escapeHtml(data.access_token)}</textarea>
        <p>Scopes granted: ${escapeHtml(data.scope || '')}</p>
        <p>You can delete this endpoint (pages/api/shopify-oauth-callback.js) once you've copied the token.</p>
      `)
    );
  } catch (err) {
    return res.status(500).send(htmlPage(`<p>Error: ${escapeHtml(err.message)}</p>`));
  }
}
