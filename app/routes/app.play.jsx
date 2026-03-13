import { Outlet } from "@remix-run/react";
import nopaStyles from "../styles/nopa-theme.css?url";

export const links = () => [{ rel: "stylesheet", href: nopaStyles }];

/**
 * Public layout shell — NO Shopify admin auth required.
 * This is accessible to anyone with the URL.
 */
export default function PlayLayout() {
    return (
        <div className="nopa-app">
            <Outlet />
        </div>
    );
}
