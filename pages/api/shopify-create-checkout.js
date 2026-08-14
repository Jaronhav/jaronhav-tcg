// pages/api/shopify-create-checkout.js
// Creates a real Shopify product for a specific card (on-demand, per buyer
// request — not automatic) and returns a direct checkout link. Inventory is
// tracked at quantity 1 so the product sells out the moment one buyer pays,
// preventing a double-sale if more than one person requested the same card.

const crypto = require('crypto');

const SHOPIFY_DOMAIN = 'pxq5yx-ka.myshopify.com';

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

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.SHOPIFY_ADMIN_TOKEN) {
    return res.status(500).json({ error: 'Missing SHOPIFY_ADMIN_TOKEN' });
  }

  const { title, price, image } = req.body || {};
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
    const inventoryItemId = variant.inventory_item_id;
    const locationsRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2026-01/locations.json`, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN },
    });
    if (locationsRes.ok) {
      const locationsData = await locationsRes.json();
      const locationId = locationsData.locations?.[0]?.id;
      if (locationId && inventoryItemId) {
        await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2026-01/inventory_levels/set.json`, {
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
      }
    }

    const checkoutUrl = `https://${SHOPIFY_DOMAIN}/cart/${variant.id}:1`;
    const productAdminUrl = `https://admin.shopify.com/store/${SHOPIFY_DOMAIN.split('.')[0]}/products/${product.id}`;

    return res.status(200).json({ checkoutUrl, productAdminUrl });
  } catch (err) {
    return res.status(500).json({ error: 'Unexpected error', details: err.message });
  }
}
