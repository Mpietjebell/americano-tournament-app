import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// This used to render its own bare-bones tournament list backed by a
// legacy /app/tournament/* admin flow that predated the public Clubhouse
// (/app/play/*) — unstyled, unmaintained, and its own "Home" link pointed
// back here, which requires a live Shopify admin session; if that session
// wasn't active (e.g. testing outside the embedded iframe), it bounced
// into Shopify's login instead of anything resembling a normal "go home"
// action. That legacy flow has since been removed.
//
// Opening the app from the Shopify admin sidebar should land on the same
// product everyone else uses, so send merchants straight to the Clubhouse
// once their admin session is confirmed.
export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return redirect("/app/play");
};

// Unreachable — the loader above always redirects before this would render.
// Kept as a trivial default export because Remix route modules expect one.
export default function AppIndexRedirect() {
  return null;
}
