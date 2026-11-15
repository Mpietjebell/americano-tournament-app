import { useEffect } from "react";
import { Outlet, useRevalidator } from "@remix-run/react";
import nopaStyles from "../styles/nopa-theme.css?url";

export const links = () => [{ rel: "stylesheet", href: nopaStyles }];

/**
 * Public layout shell — NO Shopify admin auth required.
 * This is accessible to anyone with the URL.
 */
export default function PlayLayout() {
    const { revalidate, state } = useRevalidator();

    // A home-screen app has no reload button and is usually reopened from the
    // background, so fetch fresh data whenever it comes back into view.
    useEffect(() => {
        const refresh = () => { if (document.visibilityState === "visible" && state === "idle") revalidate(); };
        // pageshow also fires on a normal load; only a page restored from the
        // back/forward cache is stale.
        const restored = (e) => { if (e.persisted) refresh(); };
        document.addEventListener("visibilitychange", refresh);
        window.addEventListener("pageshow", restored);
        return () => {
            document.removeEventListener("visibilitychange", refresh);
            window.removeEventListener("pageshow", restored);
        };
    }, [revalidate, state]);

    return (
        <div className="nopa-app">
            <Outlet />
        </div>
    );
}
