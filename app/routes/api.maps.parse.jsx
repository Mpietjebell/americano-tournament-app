import { json } from "@remix-run/node";

const COUNTRY_TO_CURRENCY = {
    QA: "QAR", AE: "AED", SA: "SAR", KW: "KWD", BH: "BHD", OM: "OMR",
    GB: "GBP", US: "USD", CA: "CAD", AU: "AUD", NZ: "NZD", CH: "CHF",
    SE: "SEK", NO: "NOK", DK: "DKK",
    JP: "JPY", CN: "CNY", IN: "INR", BR: "BRL", MX: "MXN",
    SG: "SGD", HK: "HKD", TH: "THB", MY: "MYR", ID: "IDR",
    PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON",
    ZA: "ZAR", EG: "EGP", NG: "NGN", KE: "KES",
};

const EUR_COUNTRIES = new Set([
    "DE","FR","IT","ES","PT","NL","BE","AT","FI","IE","GR",
    "LU","MT","CY","SK","SI","EE","LV","LT","HR",
]);

function getCurrency(cc) {
    if (!cc) return "EUR";
    const c = cc.toUpperCase();
    if (COUNTRY_TO_CURRENCY[c]) return COUNTRY_TO_CURRENCY[c];
    if (EUR_COUNTRIES.has(c)) return "EUR";
    return "EUR";
}

function extractCoordsFromUrl(urlStr) {
    try {
        const full = urlStr;
        // @lat,lng,zoom
        const m = full.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
        // ?q=lat,lng
        const u = new URL(urlStr);
        const q = u.searchParams.get("q") || u.searchParams.get("center");
        if (q) {
            const qc = q.match(/^(-?\d+\.\d+),(-?\d+\.\d+)$/);
            if (qc) return { lat: parseFloat(qc[1]), lng: parseFloat(qc[2]) };
        }
    } catch { /* ignore */ }
    return null;
}

function extractPlaceNameFromUrl(urlStr) {
    try {
        const u = new URL(urlStr);
        const m = u.pathname.match(/\/maps\/place\/([^/@?]+)/);
        if (m) return decodeURIComponent(m[1].replace(/\+/g, " "));
    } catch { /* ignore */ }
    return null;
}

async function reverseGeocode(lat, lng) {
    try {
        const res = await fetch(
            `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1&lang=en`,
            { headers: { "User-Agent": "nopa-americano-app/1.0" }, signal: AbortSignal.timeout(4000) }
        );
        if (!res.ok) return null;
        const data = await res.json();
        const f = data.features?.[0];
        if (!f) return null;
        const p = f.properties || {};
        return {
            venueName: p.name || null,
            city: p.city || p.district || p.county || null,
            district: p.district || null,
            country: (p.countrycode || "").toUpperCase() || null,
        };
    } catch { return null; }
}

export async function loader({ request }) {
    const url = new URL(request.url);
    const mapsUrl = (url.searchParams.get("url") || "").trim();
    if (!mapsUrl) return json({ ok: false, error: "url required" }, { status: 400 });

    let finalUrl = mapsUrl;

    // Follow redirects server-side (handles maps.app.goo.gl short links)
    try {
        const res = await fetch(mapsUrl, {
            method: "GET",
            redirect: "follow",
            headers: { "User-Agent": "Mozilla/5.0 (compatible; nopa-app/1.0)" },
            signal: AbortSignal.timeout(6000),
        });
        finalUrl = res.url || mapsUrl;
    } catch { /* use original */ }

    const coords = extractCoordsFromUrl(finalUrl) || extractCoordsFromUrl(mapsUrl);
    const placeName = extractPlaceNameFromUrl(finalUrl) || extractPlaceNameFromUrl(mapsUrl);

    if (!coords && !placeName) {
        return json({ ok: false, error: "Could not extract location from this URL" });
    }

    let geo = null;
    if (coords) {
        geo = await reverseGeocode(coords.lat, coords.lng);
    }

    const country = geo?.country || null;
    const currency = getCurrency(country);

    return json({
        ok: true,
        venueName: geo?.venueName || placeName || null,
        placeName: placeName || null,
        city: geo?.city || null,
        district: geo?.district || null,
        country,
        currency,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
    });
}
