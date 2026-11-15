import { useEffect, useRef, useState } from "react";

const COLORS = ["#C5A55A", "#E8D49A", "#F2EDE4", "#FFFFFF", "#2E7D55", "#1C4F35"];

const reducedMotion = () =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Full-screen confetti burst. Each time `fire` changes to a new non-zero
 * value, two cannons go off from the bottom corners and a shower follows
 * from the top. Drawn on one canvas that removes itself when the last piece
 * has fallen; skipped entirely for people who asked for reduced motion.
 */
export function Confetti({ fire }) {
    const canvasRef = useRef(null);
    const [active, setActive] = useState(false);

    useEffect(() => {
        if (!fire || reducedMotion()) return;
        setActive(true);
    }, [fire]);

    useEffect(() => {
        if (!active) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = window.innerWidth, H = window.innerHeight;
        canvas.width = W * dpr; canvas.height = H * dpr;
        ctx.scale(dpr, dpr);

        const rand = (a, b) => a + Math.random() * (b - a);
        const piece = (x, y, vx, vy, delay = 0) => ({
            x, y, vx, vy, delay,
            w: rand(6, 11), h: rand(8, 16), rot: rand(0, Math.PI * 2), spin: rand(-0.25, 0.25),
            wobble: rand(0, Math.PI * 2), color: COLORS[Math.floor(Math.random() * COLORS.length)],
            round: Math.random() < 0.25,
        });
        const pieces = [];
        for (let i = 0; i < 70; i++) {
            pieces.push(piece(0, H * 0.92, rand(3, 11), rand(-19, -9)));
            pieces.push(piece(W, H * 0.92, rand(-11, -3), rand(-19, -9)));
        }
        for (let i = 0; i < 60; i++) pieces.push(piece(rand(0, W), rand(-H * 0.3, -10), rand(-1, 1), rand(1.5, 4), rand(20, 70)));

        let frame = 0, raf;
        const tick = () => {
            frame++;
            ctx.clearRect(0, 0, W, H);
            let alive = 0;
            for (const p of pieces) {
                if (frame < p.delay) { alive++; continue; }
                p.vy += 0.32; p.vx *= 0.985; p.vy = Math.min(p.vy, 7.5);
                p.x += p.vx + Math.sin(p.wobble += 0.08) * 0.9; p.y += p.vy; p.rot += p.spin;
                if (p.y > H + 30) continue;
                alive++;
                ctx.save();
                ctx.translate(p.x, p.y); ctx.rotate(p.rot);
                ctx.scale(1, Math.cos(p.wobble));       // flutter
                ctx.fillStyle = p.color;
                if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
                else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            }
            if (alive > 0 && frame < 420) raf = requestAnimationFrame(tick);
            else setActive(false);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [active, fire]);

    if (!active) return null;
    return <canvas ref={canvasRef} aria-hidden="true" style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 200 }} />;
}

/** Counts up to `value` whenever `run` changes — for the podium scores. */
export function CountUp({ value, run, duration = 1400, delay = 0 }) {
    const [shown, setShown] = useState(value);
    useEffect(() => {
        if (!run || reducedMotion()) { setShown(value); return; }
        let raf; let start;
        setShown(0);
        const timer = setTimeout(() => {
            const step = (now) => {
                start ??= now;
                const t = Math.min(1, (now - start) / duration);
                setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
                if (t < 1) raf = requestAnimationFrame(step);
            };
            raf = requestAnimationFrame(step);
        }, delay);
        return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
    }, [value, run, duration, delay]);
    return <>{shown}</>;
}
