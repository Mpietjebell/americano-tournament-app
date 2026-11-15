import { redirect } from "@remix-run/node";

/**
 * The root URL. Shopify opens the embedded admin app with ?shop=…; everyone
 * else is a player, so they go straight to the Clubhouse.
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  throw redirect("/app/play");
};
