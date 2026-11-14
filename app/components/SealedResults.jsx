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

/**
 * A simply drawn NOPA racquet, after the real one: a round white head,
 * green bands running the full length of the face, large holes, an
 * open white throat and a terracotta grip.
 */
function Paddle({ side }) {
    const clip = `sealed-face-${side}`;
    const holes = [];
    for (let row = 0; row < 5; row++) {
        const y = 10 + row * 7.4;
        const offset = row % 2 ? 5.25 : 0;
        for (let x = 10.25 + offset; x <= 45; x += 10.5) {
            const dx = (x - 26) / 18, dy = (y - 25) / 19.5;
            if (dx * dx + dy * dy <= 1) holes.push([x, y]);
        }
    }
    return (
        <svg className={`sealed-paddle sealed-paddle-${side}`} width="52" height="100" viewBox="0 0 52 100" fill="none">
            <defs>
                <clipPath id={clip}><ellipse cx="26" cy="25" rx="20.6" ry="21.6" /></clipPath>
            </defs>
            {/* open throat */}
            <path d="M8 38 C13 50 20 56 22.4 66 H29.6 C32 56 39 50 44 38 Z" fill="#FBFAF7" />
            <path d="M19.5 50.5 H32.5 L26 61.5 Z" fill="#1C4F35" />
            {/* head */}
            <ellipse cx="26" cy="25" rx="23.4" ry="24.4" fill="#FBFAF7" />
            <ellipse cx="26" cy="25" rx="23.4" ry="24.4" stroke="#E4DFD6" strokeWidth="0.6" />
            {/* green bands running the full length of the face */}
            <g clipPath={`url(#${clip})`}>
                {[7.5, 18, 28.5, 39].map((x) => <rect key={x} x={x} y="0" width="5.5" height="50" fill="#1F5A3D" />)}
            </g>
            {holes.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.35" fill="#EFECE6" />)}
            {/* collar and grip */}
            <rect x="21.8" y="65" width="8.4" height="5" fill="#FBFAF7" />
            <rect x="22.4" y="70" width="7.2" height="27" fill="#C96A43" />
            <path d="M22.4 76 L29.6 73.5 M22.4 82 L29.6 79.5 M22.4 88 L29.6 85.5 M22.4 94 L29.6 91.5" stroke="#A9542F" strokeWidth="0.7" />
            <rect x="21.6" y="96" width="8.8" height="3" fill="#C96A43" />
        </svg>
    );
}
