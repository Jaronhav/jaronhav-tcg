// pages/api/shopify-create-checkout.js
// Creates a real Shopify product for a specific card (on-demand, per buyer
// request — not automatic) and returns a direct checkout link. Inventory is
// tracked at quantity 1 so the product sells out the moment one buyer pays,
// preventing a double-sale if more than one person requested the same card.

const crypto = require('crypto');

const SHOPIFY_DOMAIN = 'pxq5yx-ka.myshopify.com';
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

function parsePrice(priceStr) {
  const numeric = Number(String(priceStr || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) && numeric > 0 ? numeric.toFixed(2) : null;
}

async function githubRequest(path, options = {}) {
  return fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

// Moves the card to the front of cards.json and stamps its checkoutUrl, so
// the homepage shows a real "Buy Now" button in the most visible slot.
// Best-effort: the checkout link itself is already valid and returned to the
// caller regardless of whether this promotion succeeds.
async function promoteCardToFront(ebayItemId, checkoutUrl, title) {
  if (!process.env.GITHUB_TOKEN) {
    return 'Missing GITHUB_TOKEN — card was not moved to the homepage.';
  }
  try {
    const currentRes = await githubRequest(`/contents/${FILE_PATH}?ref=${BRANCH}`);
    if (!currentRes.ok) {
      return `Could not read cards.json (${currentRes.status}) — card was not moved to the homepage.`;
    }
    const currentFile = await currentRes.json();
    const cards = JSON.parse(Buffer.from(currentFile.content, 'base64').toString('utf-8'));

    const index = cards.findIndex((c) => c.ebayItemId === String(ebayItemId));
    if (index === -1) {
      return 'Card not found in cards.json — checkout link still works, but nothing was moved.';
    }

    const [card] = cards.splice(index, 1);
    card.checkoutUrl = checkoutUrl;
    cards.unshift(card);

    const updatedContent = JSON.stringify(cards, null, 2) + '\n';
    const updateRes = await githubRequest(`/contents/${FILE_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Checkout ready: ${title}`,
        content: Buffer.from(updatedContent, 'utf-8').toString('base64'),
        sha: currentFile.sha,
        branch: BRANCH,
      }),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      return `Could not commit cards.json (${updateRes.status}): ${errText}`;
    }

    return null;
  } catch (err) {
    return `Unexpected error moving card to homepage: ${err.message}`;
  }
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.SHOPIFY_ADMIN_TOKEN) {
    return res.status(500).json({ error: 'Missing SHOPIFY_ADMIN_TOKEN' });
  }

  const { title, price, image, ebayItemId } = req.body || {};
  const formattedPrice = parsePrice(price);

  if (!title || !formattedPrice) {
    return res.status(400).json({ error: 'title and a valid price are required' });
  }

  try {
    const productPayload = {
      product: {
        title,
        status: 'active',
        images: image ? [{ src: image }] : [],
        variants: [
          {
            price: formattedPrice,
            inventory_management: 'shopify',
            inventory_policy: 'deny',
          },
        ],
      },
    };

    const createRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2026-01/products.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(productPayload),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      return res.status(createRes.status).json({ error: 'Failed to create Shopify product', details: errText });
    }

    const created = await createRes.json();
    const product = created.product;
    const variant = product?.variants?.[0];

    if (!variant) {
      return res.status(500).json({ error: 'Product created but no variant returned', details: JSON.stringify(created) });
    }

    // Set the starting inventory to exactly 1 at the variant's default location.
    // Surfaced as a warning (not a hard failure) since the product itself was
    // created fine — but the checkout link is useless until this succeeds.
    const inventoryItemId = variant.inventory_item_id;
    let inventoryWarning = null;

    const locationsRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2026-01/locations.json`, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN },
    });

    if (!locationsRes.ok) {
      inventoryWarning = `Could not fetch locations (${locationsRes.status}): ${await locationsRes.text()}`;
    } else {
      const locationsData = await locationsRes.json();
      const locationId = locationsData.locations?.[0]?.id;
      if (!locationId || !inventoryItemId) {
        inventoryWarning = 'No location or inventory item ID available — inventory not set.';
      } else {
        const inventoryRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2026-01/inventory_levels/set.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            location_id: locationId,
            inventory_item_id: inventoryItemId,
            available: 1,
          }),
        });
        if (!inventoryRes.ok) {
          inventoryWarning = `Inventory set failed (${inventoryRes.status}): ${await inventoryRes.text()}`;
        }
      }
    }

    const checkoutUrl = `https://${SHOPIFY_DOMAIN}/cart/${variant.id}:1`;
    const productAdminUrl = `https://admin.shopify.com/store/${SHOPIFY_DOMAIN.split('.')[0]}/products/${product.id}`;

    // Only promote to the homepage if inventory is actually confirmed usable —
    // an inventoryWarning means the checkout link may not work yet.
    let cardsJsonWarning = null;
    if (!inventoryWarning && ebayItemId) {
      cardsJsonWarning = await promoteCardToFront(ebayItemId, checkoutUrl, title);
    }

    return res.status(200).json({ checkoutUrl, productAdminUrl, inventoryWarning, cardsJsonWarning });
  } catch (err) {
    return res.status(500).json({ error: 'Unexpected error', details: err.message });
  }
}
