// Shared country -> currency mapping. Used both server-side (Google Maps
// URL geocoding) and client-side (manual country selection / venue
// autocomplete) so a tournament's currency actually follows its location
// however that location was set, not just when a Maps link was pasted.
export const COUNTRY_TO_CURRENCY = {
    QA: "QAR", AE: "AED", SA: "SAR", KW: "KWD", BH: "BHD", OM: "OMR",
    GB: "GBP", US: "USD", CA: "CAD", AU: "AUD", NZ: "NZD", CH: "CHF",
    SE: "SEK", NO: "NOK", DK: "DKK",
    JP: "JPY", CN: "CNY", IN: "INR", BR: "BRL", MX: "MXN",
    SG: "SGD", HK: "HKD", TH: "THB", MY: "MYR", ID: "IDR",
    PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON",
    ZA: "ZAR", EG: "EGP", NG: "NGN", KE: "KES",
};

export const EUR_COUNTRIES = new Set([
    "DE", "FR", "IT", "ES", "PT", "NL", "BE", "AT", "FI", "IE", "GR",
    "LU", "MT", "CY", "SK", "SI", "EE", "LV", "LT", "HR",
]);

// Every currency code the map above (or the EUR fallback) can produce —
// used to build the currency <select> so an auto-detected currency is
// always a real, selectable option rather than silently falling back to
// a blank/mismatched dropdown value.
export const SUPPORTED_CURRENCIES = [
    "EUR", ...new Set(Object.values(COUNTRY_TO_CURRENCY)),
].sort((a, b) => (a === "EUR" ? -1 : b === "EUR" ? 1 : a.localeCompare(b)));

export function getCurrencyForCountry(countryCode) {
    if (!countryCode) return "EUR";
    const c = countryCode.toUpperCase();
    if (COUNTRY_TO_CURRENCY[c]) return COUNTRY_TO_CURRENCY[c];
    if (EUR_COUNTRIES.has(c)) return "EUR";
    return "EUR";
}
