import { useEffect, useLayoutEffect, useRef, useState } from "react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * True for `ms` after `value` changes while the component is mounted.
 * The first render never counts, so nothing replays on page load.
 */
export function useJustChanged(value, ms = 1800) {
    const prev = useRef(value);
    const [active, setActive] = useState(false);
    useEffect(() => {
        if (prev.current === value) return;
        prev.current = value;
        setActive(true);
        const t = setTimeout(() => setActive(false), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return active;
}

/** The round still being played: the first one with an unfinished match. */
export function liveRoundNumber(rounds) {
    const live = rounds.find((r) => r.matches.length === 0 || r.matches.some((m) => m.status !== "completed"));
    return live ? live.roundNumber : null;
}

/**
 * A short full-screen curtain announcing the next round (or full time).
 * Shows only when the round changes while the page is open.
 */
export function RoundCurtain({ rounds, finished }) {
    const round = liveRoundNumber(rounds);
    const stage = finished ? "done" : round == null ? "idle" : `round-${round}`;
    const prev = useRef(stage);
    const [shown, setShown] = useState(null);

    useEffect(() => {
        if (prev.current === stage) return;
        // Let the score stamp on the last court land before the curtain drops.
        const wait = prev.current === "idle" ? 0 : 1200;
        prev.current = stage;
        if (stage === "idle") return;
        const open = setTimeout(() => setShown(stage), wait);
        const close = setTimeout(() => setShown(null), wait + 2300);
        return () => { clearTimeout(open); clearTimeout(close); };
    }, [stage]);

    if (!shown) return null;
    const done = shown === "done";
    return (
        <div className="club-curtain" role="status" onClick={() => setShown(null)}>
            <div className="club-curtain-inner">
                <div className="club-curtain-rule" />
                <div className="club-curtain-eyebrow">{done ? "Tournament complete" : "Next up"}</div>
                <div className="club-curtain-title">{done ? "Full time" : `Round ${shown.replace("round-", "")}`}</div>
                <div className="club-curtain-sub">{done ? "All scores are in." : "Find your court."}</div>
                <div className="club-curtain-rule" />
            </div>
        </div>
    );
}

/**
 * Rows glide to their new place when the order of `keys` changes.
 * Put `data-flip={id}` on each row inside the returned ref's element.
 */
export function useFlipList(keys) {
    const ref = useRef(null);
    const boxes = useRef(new Map());
    const signature = keys.join("|");

    useIsoLayoutEffect(() => {
        const root = ref.current;
        if (!root) return;
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        const next = new Map();
        root.querySelectorAll("[data-flip]").forEach((el) => {
            const id = el.getAttribute("data-flip");
            const top = el.offsetTop;
            next.set(id, top);
            const before = boxes.current.get(id);
            if (reduce || before == null || before === top || !el.animate) return;
            const up = before > top;
            el.style.position = "relative";
            el.style.zIndex = up ? "2" : "1";
            const anim = el.animate(
                [
                    { transform: `translateY(${before - top}px)`, background: up ? "rgba(28,79,53,0.10)" : "transparent" },
                    { transform: "translateY(0)", background: "transparent" },
                ],
                { duration: 620, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
            );
            anim.onfinish = () => { el.style.zIndex = ""; };
        });
        boxes.current = next;
    }, [signature]);

    return ref;
}

/** A number that ticks over when it changes. */
export function Tick({ value, style }) {
    const changed = useJustChanged(value, 900);
    return <span className={changed ? "club-tick" : undefined} style={{ display: "inline-block", ...style }}>{value}</span>;
}

/** The "score confirmed" stamp shown on a court card right after its score lands. */
export function ScoreStamp() {
    return (
        <div className="club-stamp" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8.5l3.2 3.2L13 4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
            </svg>
            <span>Score confirmed</span>
        </div>
    );
}
