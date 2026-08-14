// pages/api/cards-update.js
// Updates an existing card's fields in cards.json via the GitHub Contents API.
// The eBay item ID identifies which card to update and is not itself editable
// here — editing it would just mean adding a different card.

const crypto = require('crypto');

const OWNER = 'Jaronhav';
const REPO = 'jaronhav-tcg';
const FILE_PATH = 'cards.json';
const BRANCH = 'main';

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

async function githubRequest(path, options = {}) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return res;
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.GITHUB_TOKEN) {
    return res.status(500).json({ error: 'Missing GITHUB_TOKEN' });
  }

  const { ebayItemId, title, price, grade, set, image } = req.body || {};

  if (!ebayItemId || !title || !price) {
    return res.status(400).json({ error: 'ebayItemId, title, and price are required' });
  }

  try {
    const currentRes = await githubRequest(`/contents/${FILE_PATH}?ref=${BRANCH}`);
    if (!currentRes.ok) {
      const errText = await currentRes.text();
      return res.status(currentRes.status).json({ error: 'Failed to read cards.json', details: errText });
    }
    const currentFile = await currentRes.json();
    const currentContent = Buffer.from(currentFile.content, 'base64').toString('utf-8');
    const cards = JSON.parse(currentContent);

    const index = cards.findIndex((c) => c.ebayItemId === String(ebayItemId));
    if (index === -1) {
      return res.status(404).json({ error: 'No card with this eBay item ID found in cards.json' });
    }

    cards[index] = {
      title,
      price,
      grade: grade || '',
      set: set || '',
      image: image || '',
      ebayItemId: String(ebayItemId),
    };
    const updatedContent = JSON.stringify(cards, null, 2) + '\n';

    const updateRes = await githubRequest(`/contents/${FILE_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Update card: ${title}`,
        content: Buffer.from(updatedContent, 'utf-8').toString('base64'),
        sha: currentFile.sha,
        branch: BRANCH,
      }),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      return res.status(updateRes.status).json({ error: 'Failed to commit cards.json', details: errText });
    }

    const updateData = await updateRes.json();
    return res.status(200).json({ ok: true, commitUrl: updateData.commit?.html_url });
  } catch (err) {
    return res.status(500).json({ error: 'Unexpected error', details: err.message });
  }
}
