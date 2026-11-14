/**
 * The Clubhouse hero, following the NOPA Clubhouse design system:
 * a photo is never overlaid with text — it sits above a solid green
 * band that carries the eyebrow label and the title. Without a photo
 * the hero is the system's "cover" graphic: green slab, deep strip
 * with hairline rules, and an inset hairline frame.
 */
export const BRAND_PHOTOS = {
    table: "/images/brand/clubhouse-table.jpg",   // NOPA racquets on a courtside table
    locker: "/images/brand/clubhouse-locker.jpg", // NOPA racquet in the walnut locker room
};

export function ClubHero({ eyebrow, title, sub, photo, photoPosition = "center 62%", frame, card = false, as: Title = "div", children }) {
    return (
        <header className={`club-hero${card ? " club-hero--card" : ""}${photo ? "" : " club-hero--graphic"}`}>
            {photo && (
                <img className="club-hero-photo" src={BRAND_PHOTOS[photo]} alt="" style={{ objectPosition: photoPosition }} />
            )}
            <div className="club-hero-body">
                <div className="club-hero-text">
                    {eyebrow && <div className="club-eyebrow">{eyebrow}</div>}
                    <Title className="club-hero-title">{title}</Title>
                    {sub && <div className="club-hero-sub">{sub}</div>}
                    {children}
                </div>
                {frame && (
                    <div className="club-hero-frame" aria-hidden="true">
                        <img src={BRAND_PHOTOS[frame]} alt="" />
                    </div>
                )}
            </div>
        </header>
    );
}
