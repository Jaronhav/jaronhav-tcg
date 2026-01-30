// api/inventory.js
export default async function handler(req, res) {
  const store = process.env.SHOPIFY_STORE;
  const token = process.env.SHOPIFY_TOKEN;

  const productId = req.query.id; // e.g., product ID you pass from frontend

  try {
    const response = await fetch(`https://${store}/admin/api/2026-01/products/${productId}.json`, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });
    const data = await response.json();
    res.status(200).json({ inventory: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
}

