// pages/api/inventory.js

const SHOPIFY_STORE = "jaronhav-tcg";
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

export default async function handler(req, res) {
  // 1️⃣ Check token
  if (!SHOPIFY_TOKEN) {
    return res.status(500).json({ error: "Missing Shopify Admin token" });
  }

  const { id, sku } = req.query;

  // 2️⃣ Validate product ID
  if (!id) {
    return res.status(400).json({ error: "Missing product ID" });
  }

  try {
    // 3️⃣ Fetch product variants from Shopify Admin API
    const url = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2026-01/products/${id}/variants.json`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
        "Content-Type": "application/json",
      },
    });

    // 4️⃣ Handle Shopify API errors
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }

    const data = await response.json();
    const variants = data.variants;

    // 5️⃣ If SKU is provided, return quantity only
    if (sku) {
      const variant = variants.find((v) => v.sku === sku);
      if (!variant) {
        return res
          .status(404)
          .json({ error: `Variant with SKU "${sku}" not found` });
      }
      return res.status(200).json({ quantity: variant.inventory_quantity });
    }

    // 6️⃣ No SKU provided → return all variants
    return res.status(200).json({ variants });
  } catch (err) {
    console.error("Shopify fetch error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}


