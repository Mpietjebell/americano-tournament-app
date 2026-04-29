import { json } from "@remix-run/node";

const ALLOWED_ORIGINS = [
    "https://nopabrand.com",
    "https://www.nopabrand.com",
];

export function corsHeaders(request) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
    };
}

export function corsJson(request, data, init = {}) {
    return json(data, {
        ...init,
        headers: {
            ...corsHeaders(request),
            ...(init.headers || {}),
        },
    });
}

export function handleOptions(request) {
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    return null;
}
