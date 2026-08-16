/**
 * Reconstructs the public-facing origin (scheme + host) for a request.
 *
 * Railway (like most PaaS reverse proxies) terminates TLS at its edge and
 * forwards the request to the app container over plain HTTP. `request.url`
 * as seen by the Node process therefore reports `http://...` even when the
 * visitor's browser is on `https://...`. Any link built from
 * `new URL(request.url).origin` inherits that wrong scheme — this is why
 * "Copy Join Link" and printed/PDF join URLs were coming out as
 * `http://...` in production despite the site being served over https.
 *
 * The proxy still tells the truth via the standard forwarding headers, so
 * prefer those when present.
 */
export function getRequestOrigin(request) {
    const url = new URL(request.url);

    const forwardedProto = request.headers.get("x-forwarded-proto");
    const protocol = forwardedProto ? forwardedProto.split(",")[0].trim() : url.protocol.replace(":", "");

    const forwardedHost = request.headers.get("x-forwarded-host");
    const host = forwardedHost ? forwardedHost.split(",")[0].trim() : url.host;

    return `${protocol}://${host}`;
}
