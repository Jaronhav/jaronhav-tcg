// api-inventory.js
// Serverless function for Vercel to fetch Shopify product inventory

export default async function handler(req, res) {
  try {
    const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
    const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'Missing Shopify environment variables' });
    }

    // You can pass a product ID as a query param, e.g., ?id=7801249464398
    const productId = req.query.id;
    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required as query parameter "id"' });
    }

    // Fetch product data from Shopify
    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2026-01/products/${productId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: 'Shopify API error', details: text });
    }

    const data = await response.json();

    // Extract inventory info for each variant
    const inventory = data.product.variants.map(variant => ({
      id: variant.id,
      title: variant.title,
      available: variant.inventory_quantity,
    }));

    res.status(200).json({ inventory });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
