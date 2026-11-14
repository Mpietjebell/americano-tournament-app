import { useEffect, useState } from "react";

/**
 * The wait between the last match and the host releasing the results.
 * A padel ball rallies back and forth over the net while facts about
 * the tournament rotate underneath. No standings are used here, so
 * nothing can leak.
 */
export function SealedResults({ tournament, yourScore }) {
    const matches = tournament.rounds.reduce((n, r) => n + r.matches.length, 0);
    const rounds = tournament.rounds.length;
    const playerCount = tournament.players.length;
    const contested = matches * tournament.pointsPerMatch;
    const facts = [
        `${matches} matches played`,
        `${contested} points contested`,
        `${playerCount} players, one winner`,
        `${rounds} rounds, all scores in`,
        "Every point is being checked",
    ];

    const [fact, setFact] = useState(0);

    useEffect(() => {
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
        const factTimer = setInterval(() => setFact((i) => i + 1), 2800);
        return () => clearInterval(factTimer);
    }, []);

    return (
        <section className="sealed" aria-label="Results not released yet">
            <div className="club-eyebrow sealed-eyebrow">The results are sealed</div>

            <div className="sealed-rally" aria-hidden="true">
                <Paddle side="left" />
                <Paddle side="right" />
                <div className="sealed-net" />
                <div className="sealed-ground" />
                <div className="sealed-shadow-x"><div className="sealed-shadow" /></div>
                <div className="sealed-ball-x"><div className="sealed-ball" /></div>
            </div>

            <h2 className="sealed-title">Waiting on the host to finalise the scores</h2>

            <div className="sealed-fact" key={fact}>{facts[fact % facts.length]}</div>
            <div className="sealed-drum" aria-hidden="true"><i /><i /><i /></div>

            {yourScore != null && (
                <div className="sealed-yours">
                    <span>Your score</span>
                    <strong>{yourScore}</strong>
                </div>
            )}
            <p className="sealed-note">This opens by itself the moment the host releases the results.</p>
        </section>
    );
}

/** A simply drawn NOPA racquet: white frame, green stripes, tan grip. */
function Paddle({ side }) {
    const clip = `sealed-face-${side}`;
    const holes = [[14, 12], [21, 12], [28, 12], [10.5, 19], [17.5, 19], [24.5, 19], [31.5, 19], [14, 26], [21, 26], [28, 26], [17.5, 33], [24.5, 33]];
    return (
        <svg className={`sealed-paddle sealed-paddle-${side}`} width="42" height="78" viewBox="0 0 42 78" fill="none">
            <defs>
                <clipPath id={clip}><ellipse cx="21" cy="22" rx="16.5" ry="19.5" /></clipPath>
            </defs>
            {/* throat and frame */}
            <path d="M12 38 L18.5 54 H23.5 L30 38 Z" fill="#F5F0E8" />
            <path d="M17.5 41 L21 50 L24.5 41 Z" fill="#1C4F35" />
            <ellipse cx="21" cy="22" rx="19" ry="22" fill="#F5F0E8" />
            {/* striped face */}
            <g clipPath={`url(#${clip})`}>
                <rect x="0" y="0" width="42" height="44" fill="#FFFFFF" />
                {[8, 15.5, 23, 30.5].map((y) => <rect key={y} x="0" y={y} width="42" height="4.2" fill="#2A6B49" />)}
            </g>
            {holes.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.15" fill="#143A28" opacity="0.55" />)}
            {/* grip */}
            <rect x="18.2" y="54" width="5.6" height="21" fill="#C9743F" />
            <path d="M18.2 59 L23.8 57 M18.2 64 L23.8 62 M18.2 69 L23.8 67" stroke="#A55A2C" strokeWidth="0.8" />
            <rect x="17.6" y="74.5" width="6.8" height="2.5" fill="#F5F0E8" />
        </svg>
    );
}
