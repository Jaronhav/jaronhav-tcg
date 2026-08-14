// pages/api/ebay-lookup.js
// Looks up a public eBay listing by item ID or listing URL using the Browse API.
// Uses an application access token (client_credentials) — no user OAuth needed,
// since this only reads public listing data.

const crypto = require('crypto');

const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;

function isValidSession(cookieHeader) {
  if (!cookieHeader) return false;
  const match = cookieHeader.match(/admin_session=([^;]+)/);
  if (!match) return false;

  const [expiryStr, signature] = match[1].split('.');
  const expiry = Number(expiryStr);
  if (!expiry || !signature || Date.now() > expiry) return false;

  const expected = crypto
    .createHmac('sha256', process.env.ADMIN_PASSWORD || '')
    .update(String(expiry))
    .digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res) {
  if (!process.env.ADMIN_PASSWORD) {
    res.status(500).json({ error: 'Missing ADMIN_PASSWORD' });
    return false;
  }
  if (!isValidSession(req.headers.cookie)) {
    res.status(401).json({ error: 'Not logged in' });
    return false;
  }
  return true;
}

function extractLegacyItemId(input) {
  const trimmed = (input || '').trim();

  // Plain numeric item ID
  if (/^\d{9,15}$/.test(trimmed)) return trimmed;

  // URL forms: ebay.com/itm/276481039215 or ebay.com/itm/some-title/276481039215
  const urlMatch = trimmed.match(/\/itm\/(?:[^/?]+\/)?(\d{9,15})/);
  if (urlMatch) return urlMatch[1];

  // Fallback: last run of 9-15 digits anywhere in the string
  const digitsMatch = trimmed.match(/(\d{9,15})/);
  if (digitsMatch) return digitsMatch[1];

  return null;
}

function findAspect(aspects, patterns) {
  for (const { name, value } of aspects) {
    if (patterns.some((re) => re.test(name))) return value;
  }
  return '';
}

// "Professional Grader" contains the substring "grade" (via "grader"), so
// matching must use word boundaries — otherwise a company aspect ("PSA")
// shadows the actual numeric grade aspect ("10"). Combine both into the
// "PSA 10" / "CGC 9.5" format already used across the site.
function guessGradeAndSet(aspects) {
  const company = findAspect(aspects, [/professional grader/i, /grading company/i, /graded by/i]);
  const numericGrade = findAspect(aspects, [/\bgrade\b/i]);
  const grade = [company, numericGrade].filter(Boolean).join(' ').trim();
  const set = findAspect(aspects, [/\bset\b/i, /\bseries\b/i]);
  return { grade, set };
}

async function getAppToken() {
  const basicAuth = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');

  const tokenRes = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`eBay token request failed: ${errText}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Missing EBAY_CLIENT_ID / EBAY_CLIENT_SECRET' });
  }

  const { input } = req.body || {};
  const legacyItemId = extractLegacyItemId(input);

  if (!legacyItemId) {
    return res.status(400).json({ error: 'Could not find an eBay item ID in that input' });
  }

  try {
    const accessToken = await getAppToken();

    const itemRes = await fetch(
      `https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${legacyItemId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        },
      }
    );

    if (!itemRes.ok) {
      const errText = await itemRes.text();
      return res.status(itemRes.status).json({ error: 'eBay item lookup failed', details: errText });
    }

    const item = await itemRes.json();

    const aspects = (item.localizedAspects || []).map((a) => ({ name: a.name, value: a.value }));
    const images = [
      item.image?.imageUrl,
      ...(item.additionalImages || []).map((i) => i.imageUrl),
    ].filter(Boolean);

    return res.status(200).json({
      ebayItemId: legacyItemId,
      title: item.title || '',
      price: item.price ? `$${item.price.value}` : '',
      images,
      aspects,
      guesses: guessGradeAndSet(aspects),
      itemWebUrl: item.itemWebUrl || '',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Unexpected error', details: err.message });
  }
}
