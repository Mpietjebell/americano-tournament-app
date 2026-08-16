import { json } from "@remix-run/node";
import { getCurrencyForCountry } from "../utils/currency";

function extractCoordsFromUrl(urlStr) {
    try {
        // !3d{lat}!4d{lng} — actual venue pin (most accurate)
        const pinMatch = urlStr.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
        if (pinMatch) return { lat: parseFloat(pinMatch[1]), lng: parseFloat(pinMatch[2]) };
        // @lat,lng,zoom — map view center (fallback)
        const viewMatch = urlStr.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (viewMatch) return { lat: parseFloat(viewMatch[1]), lng: parseFloat(viewMatch[2]) };
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
    const currency = getCurrencyForCountry(country);
    const city = geo?.city || null;
    // URL place name is more accurate than reverse-geocode name
    const venueName = placeName || geo?.venueName || null;
    const addressParts = [city, country].filter(Boolean);
    const address = addressParts.length ? addressParts.join(", ") : null;

    return json({
        ok: true,
        venueName,
        placeName: placeName || null,
        address,
        city,
        district: geo?.district || null,
        country,
        currency,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
    });
}
