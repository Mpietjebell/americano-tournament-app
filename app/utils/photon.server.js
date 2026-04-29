const PHOTON = "https://photon.komoot.io/api";

export async function search(q) {
    const url = `${PHOTON}/?q=${encodeURIComponent(q)}&limit=6&lang=en`;
    const res = await fetch(url, { headers: { "User-Agent": "nopa-americano-app/1.0" } });
    if (!res.ok) throw new Error(`Photon search error: ${res.status}`);
    const data = await res.json();
    return (data.features || []).map(featureToVenue).filter(Boolean);
}

export function featureToVenue(f) {
    const p = f.properties || {};
    const [lng, lat] = f.geometry?.coordinates || [];
    if (lat == null || lng == null) return null;

    const osmId = `${p.osm_type || "N"}${p.osm_id}`;
    const city = p.city || p.district || p.county || null;
    const address = [p.housenumber, p.street, p.postcode, city, p.country]
        .filter(Boolean)
        .join(", ");

    return {
        osmId,
        name: p.name || address,
        address: address || p.name || "",
        city: city || null,
        country: p.countrycode || null,
        latitude: lat,
        longitude: lng,
        mainText: p.name || address,
        secondaryText: [city, p.country].filter(Boolean).join(", "),
    };
}
