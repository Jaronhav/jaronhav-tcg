export default async function handler(req, res) {
  const { SHOPIFY_DOMAIN, SHOPIFY_ACCESS_TOKEN } = process.env;

  if (!SHOPIFY_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({
      error: "Missing Shopify environment variables",
    });
  }

  // OPTIONAL: filter by product handle or SKU later
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/inventory_levels.json?limit=50`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: "Shopify API error",
        details: text,
      });
    }

    const data = await response.json();

    return res.status(200).json({
      inventory_levels: data.inventory_levels,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      message: err.message,
    });
  }
}
