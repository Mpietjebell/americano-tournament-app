/**
 * The one place NOPA advertises inside the Clubhouse. The app is free and
 * stands on its own — this strip is how the brand behind it shows up.
 */
export function NopaBanner({ style }) {
    return (
        <a
            href="https://nopabrand.com/?utm_source=clubhouse&utm_medium=app&utm_campaign=banner"
            target="_blank"
            rel="noopener noreferrer"
            className="nopa-banner"
            style={style}
        >
            <img src="/1Logo%20NOPA%20Green.png" alt="NOPA" width="44" height="44" loading="lazy" />
            <span className="nopa-banner-copy">
                <span className="nopa-banner-eyebrow">The Clubhouse is free, thanks to NOPA</span>
                <span className="nopa-banner-title">Vintage-inspired padel racquets &amp; apparel</span>
            </span>
            <span className="nopa-banner-cta">Shop</span>
        </a>
    );
}
