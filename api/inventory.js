// /api/inventory.js
export default async function handler(req, res) {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const shop = 'jaronhav-tcg.myshopify.com';

  // Get access token
  const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  // Fetch product inventory
  const query = `
    {
      productByHandle(handle: "charizard-upc") {
        title
        variants(first: 10) {
          edges {
            node {
              id
              title
              quantityAvailable
            }
          }
        }
      }
    }
  `;

  const productResponse = await fetch(`https://${shop}/admin/api/2026-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query }),
  });

  const productData = await productResponse.json();
  res.status(200).json(productData);
}
