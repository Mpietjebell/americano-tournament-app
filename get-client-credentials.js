/**
 * Helper Script: Get Client Credentials Token
 * 
 * As requested, this manually implements the Client Credentials grant type 
 * to acquire an offline access token for trusted server-to-server integrations.
 * 
 * Usage:
 *    node get-client-credentials.js <your-shop-name>.myshopify.com
 */

const CLIENT_ID = process.env.SHOPIFY_API_KEY;
const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET;

async function getAccessToken(shopDomain) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("Missing SHOPIFY_API_KEY or SHOPIFY_API_SECRET in your environment");
    process.exit(1);
  }

  if (!shopDomain) {
    console.error("❌ Please provide a shop domain. Example: node get-client-credentials.js my-store.myshopify.com");
    process.exit(1);
  }

  // Ensure it has myshopify.com and no protocol
  const sanitizedShop = shopDomain.replace('https://', '').replace('http://', '').replace(/\/$/, "");

  console.log(`\n🔄 Requesting Client Credentials Access Token for: ${sanitizedShop}...`);

  const url = `https://${sanitizedShop}/admin/oauth/access_token`;
  
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString()
    });

    const data = await response.json();

    if (!response.ok) {
        console.error("\n❌ Failed to get access token:");
        console.error(data);
        process.exit(1);
    }

    console.log("\n✅ Success! Here is your token response:");
    console.log("-----------------------------------------");
    console.log(`Access Token: ${data.access_token}`);
    console.log(`Granted Scopes: ${data.scope}`);
    console.log(`Expires In: ${data.expires_in} seconds (24 hours)`);
    console.log("-----------------------------------------");
    
    console.log("\n⚠️ IMPORTANT: Access tokens are valid for 24 hours. You must run this script again or automate this POST request to refresh it.");

  } catch (error) {
    console.error("\n❌ Network Error:", error.message);
  }
}

// Get the shop argument from the command line
const shopArg = process.argv[2];
getAccessToken(shopArg);
