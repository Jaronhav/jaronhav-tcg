// shopify.js
import fetch from "node-fetch";

// Shopify store handle
const SHOPIFY_STORE = "jaronhav-tcg";

// Admin API token stored in Vercel environment variable
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

// Fetch all products
async function getProducts() {
  const url = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2026-01/products.json`;

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
  return data.products; // array of products
}

// Fetch variants for a specific product ID
async function getVariants(productId) {
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
  return data.variants; // array of variants
}

// Example usage
async function main() {
  try {
    const products = await getProducts();
    console.log("Products:", products);

    // Fetch variants for the first product as an example
    if (products.length > 0) {
      const firstProductId = products[0].id;
      const variants = await getVariants(firstProductId);
      console.log(`Variants for product ${firstProductId}:`, variants);
    }
  } catch (err) {
    console.error(err);
  }
}

main();
