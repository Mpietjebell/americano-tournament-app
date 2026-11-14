/**
 * NOPA photography, served from the store's own Shopify Files CDN.
 * Shopify resizes on the fly (`width`), so each hero asks for what it needs.
 */
const CDN = "https://cdn.shopify.com/s/files/1/0878/5277/7636/files";
const file = (name, width = 1400) => `${CDN}/nopa-email-${name}.jpg?v=1793631322&width=${width}`;

export const PHOTOS = {
    sunsetCourt: file("hero-sunsetCourt"),       // empty court at sunset, racquet and balls on a bench
    duskSilhouette: file("hero-duskSilhouette"), // player in silhouette on a green court at dusk
    nightCourt: file("hero-nightCourt"),         // racquet against the glass under floodlights
    villaCourt: file("hero-villaCourt"),         // court among pines beside a villa at twilight
    womanCourt: file("lifestyle-womanCourt"),    // player resting courtside at golden hour
    lockerRoom: file("detail-lockerRoom"),       // racquet on a bench in a walnut locker room
    overheadCircle: file("hero-overheadCircle"), // eight racquets in a circle on linen
};

/**
 * CSS `background-image` value: the store photo on top, the bundled image
 * underneath, so a hero is never empty if the CDN image fails to load.
 */
export function heroImage(key, fallback = "/hero-court.png") {
    return `url("${PHOTOS[key]}"), url(${fallback})`;
}
