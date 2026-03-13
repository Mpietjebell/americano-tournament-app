import { json } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { pathname } = new URL(request.url);

  // `/app/play` is the public tournament surface. It shares the `/app` path
  // prefix because of the Remix route tree, but it must not trigger Shopify
  // embedded admin auth.
  if (pathname.startsWith("/app/play")) {
    return json({
      apiKey: "",
      isPublic: true,
    });
  }

  await authenticate.admin(request);

  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
    isPublic: false,
  });
}

export default function App() {
  const { apiKey, isPublic } = useLoaderData();

  if (isPublic) {
    return <Outlet />;
  }

  return (
    <AppProvider apiKey={apiKey} isEmbeddedApp>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
