// shopify.js
import fetch from "node-fetch";

// Shopify store handle
const SHOPIFY_STORE = "jaronhav-tcg";

// Admin API token stored in Vercel environment variables (server-side only)
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

if (!SHOPIFY_TOKEN) {
  throw new Error(
    "Missing Shopify Admin token. Make sure SHOPIFY_ADMIN_TOKEN is set in Vercel env."
  );
}

/**
 * Fetch a single product by product ID
 * @param {string} productId
 * @returns {object} product object
 */
export async function getProductById(productId) {
  const url = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2026-01/products/${productId}.json`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API error: ${res.status} - ${text}`);
  }

  const data = await res.json();
  return data.product;
}

/**
 * Fetch all variants for a specific product ID
 * @param {string} productId
 * @returns {array} variants
 */
export async function getVariants(productId) {
  const url = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2026-01/products/${productId}/variants.json`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API error: ${res.status} - ${text}`);
  }

  const data = await res.json();
  return data.variants;
}

/**
 * Fetch inventory quantity for a specific variant SKU
 * @param {string} productId
 * @param {string} sku
 * @returns {number} inventory quantity
 */
export async function getQuantityBySKU(productId, sku) {
  const variants = await getVariants(productId);
  const variant = variants.find((v) => v.sku === sku);

  if (!variant) {
    throw new Error(`Variant with SKU "${sku}" not found`);
  }

  return variant.inventory_quantity;
}

