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

function Paddle({ side }) {
    return (
        <svg className={`sealed-paddle sealed-paddle-${side}`} width="34" height="62" viewBox="0 0 34 62" fill="none">
            <ellipse cx="17" cy="19" rx="15" ry="18" stroke="currentColor" strokeWidth="1.2" />
            <path d="M12 35.5 L15 44 M22 35.5 L19 44" stroke="currentColor" strokeWidth="1.2" />
            <rect x="14.5" y="44" width="5" height="16" stroke="currentColor" strokeWidth="1.2" />
            {[[11, 13], [17, 13], [23, 13], [8, 20], [14, 20], [20, 20], [26, 20], [11, 27], [17, 27], [23, 27]].map(([x, y]) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r="1.1" fill="currentColor" />
            ))}
        </svg>
    );
}
