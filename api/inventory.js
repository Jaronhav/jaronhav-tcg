export default async function handler(req, res) {
  const domain = process.env.SHOPIFY_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  const productId = "7801249464398";

  if (!domain || !token) {
    return res.status(500).json({ error: "Missing Shopify environment variables" });
  }

  const headers = {
    "X-Shopify-Admin-Token": token,
    "Content-Type": "application/json",
  };

  try {
    // 1️⃣ Get product to find inventory_item_id
    const productRes = await fetch(
      `https://${domain}/admin/api/2024-01/products/${productId}.json`,
      { headers }
    );

    if (!productRes.ok) {
      const text = await productRes.text();
      throw new Error(text);
    }

    const productData = await productRes.json();
    const inventoryItemId =
      productData.product.variants[0].inventory_item_id;

    // 2️⃣ Get inventory level
    const inventoryRes = await fetch(
      `https://${domain}/admin/api/2024-01/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
      { headers }
    );

    if (!inventoryRes.ok) {
      const text = await inventoryRes.text();
      throw new Error(text);
    }

    const inventoryData = await inventoryRes.json();
    const available =
      inventoryData.inventory_levels[0]?.available ?? 0;

    return res.status(200).json({
      available,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Shopify API error",
      details: err.message,
    });
  }
}
