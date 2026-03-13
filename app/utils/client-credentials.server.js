/**
 * Server-Side Utility: Automated Client Credentials Manager
 * 
 * This file automatically fetches, caches, and refreshes your Client Credentials 
 * offline access token in the background. It ensures you never have to manually 
 * run a script to refresh the token every 24 hours.
 */

const CLIENT_ID = process.env.SHOPIFY_API_KEY;
const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET;

// In-memory cache variables
let cachedToken = null;
let tokenExpiresAt = null;

/**
 * Automatically retrieves a valid access token. 
 * If the current token is missing or expires in less than 5 minutes, 
 * it seamlessly fetches a new one in the background.
 */
export async function getValidAccessToken(shopDomain = '6xdp7q-bt.myshopify.com') {
    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error("Missing SHOPIFY_API_KEY or SHOPIFY_API_SECRET");
    }

    // Check if we have a valid token that doesn't expire in the next 5 minutes
    const fiveMinutesInMs = 5 * 60 * 1000;
    if (cachedToken && tokenExpiresAt && Date.now() < (tokenExpiresAt - fiveMinutesInMs)) {
        return cachedToken;
    }

    // Ensure domain format is clean
    const sanitizedShop = shopDomain.replace('https://', '').replace('http://', '').replace(/\/$/, "");
    const url = `https://${sanitizedShop}/admin/oauth/access_token`;

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);

    console.log(`[OAuth] Refreshing Client Credentials Token for ${sanitizedShop}...`);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(`Failed to refresh Shopify Access Token: ${JSON.stringify(data)}`);
    }

    // Update Cache
    cachedToken = data.access_token;
    // expires_in is seconds (86399 = 24hrs), convert to future timestamp in milliseconds
    tokenExpiresAt = Date.now() + (data.expires_in * 1000);

    console.log(`[OAuth] Token successfully cached! Expires in ${data.expires_in} seconds.`);

    return cachedToken;
}

/**
 * Example Usage Anywhere in your Backend:
 * 
 * import { getValidAccessToken } from '~/utils/client-credentials.server.js';
 * 
 * export async function loader() {
 *    const token = await getValidAccessToken();
 *    
 *    const response = await fetch('https://6xdp7q-bt.myshopify.com/admin/api/2024-01/graphql.json', {
 *       headers: { 'X-Shopify-Access-Token': token }
 *    });
 *    // ...
 * }
 */
