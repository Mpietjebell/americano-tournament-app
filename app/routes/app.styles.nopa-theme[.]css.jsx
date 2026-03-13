/* Re-export the CSS file as a raw text route so the browser can load it */
import { readFileSync } from "fs";
import { resolve } from "path";

export const loader = async () => {
    const cssPath = resolve("app/styles/nopa-theme.css");
    const css = readFileSync(cssPath, "utf-8");
    return new Response(css, {
        headers: {
            "Content-Type": "text/css",
            "Cache-Control": "public, max-age=3600",
        },
    });
};
