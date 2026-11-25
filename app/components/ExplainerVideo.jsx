import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Short vertical explainer videos: one for hosting, one for joining.
 * The files live in /public/videos and load only when someone taps play,
 * so pages stay light on mobile data.
 */
export const EXPLAINERS = {
    host: {
        src: "/videos/how-hosting-works.mp4",
        poster: "/videos/how-hosting-works.jpg",
        title: "How hosting works",
        length: "23 sec",
        blurb: "Host from your own phone: set it up, share one code, enter scores, release the results.",
    },
    player: {
        src: "/videos/how-joining-works.mp4",
        poster: "/videos/how-joining-works.jpg",
        title: "How joining works",
        length: "22 sec",
        blurb: "Type the code, add your email and name, and follow the live table. No account needed.",
    },
};

function PlayIcon({ size = 18 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
        </svg>
    );
}

/** Full-screen player. Opening it is a tap, so playback with sound is allowed. */
function VideoModal({ kind, onClose }) {
    const video = EXPLAINERS[kind];
    const ref = useRef(null);
    const closeRef = useRef(null);

    useEffect(() => {
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        closeRef.current?.focus();
        ref.current?.play().catch(() => { /* the controls are there if autoplay is refused */ });
        return () => {
            document.body.style.overflow = prevOverflow;
            window.removeEventListener("keydown", onKey);
        };
    }, [onClose]);

    return (
        <div className="nopa-video-modal" role="dialog" aria-modal="true" aria-label={video.title} onClick={onClose}>
            <div className="nopa-video-frame" onClick={(e) => e.stopPropagation()}>
                <video
                    ref={ref}
                    src={video.src}
                    poster={video.poster}
                    controls
                    playsInline
                    preload="auto"
                    onEnded={onClose}
                />
            </div>
            <button ref={closeRef} type="button" className="nopa-video-close" onClick={onClose}>Close</button>
        </div>
    );
}

function useVideoModal() {
    const [open, setOpen] = useState(null);
    const close = useCallback(() => setOpen(null), []);
    const modal = open ? <VideoModal kind={open} onClose={close} /> : null;
    return [setOpen, modal];
}

/** Home screen: both explainers side by side. */
export function ExplainerTiles() {
    const [openVideo, modal] = useVideoModal();
    return (
        <section className="nopa-explainers" aria-label="How it works">
            <div className="club-eyebrow">See how it works</div>
            <div className="nopa-explainer-tiles">
                {["host", "player"].map((kind) => {
                    const v = EXPLAINERS[kind];
                    return (
                        <button key={kind} type="button" className="nopa-explainer-tile" onClick={() => openVideo(kind)} aria-label={`Play: ${v.title}, ${v.length}`}>
                            <img src={v.poster} alt="" loading="lazy" width="540" height="960" />
                            <span className="nopa-explainer-label">
                                <strong><span className="nopa-explainer-dot"><PlayIcon size={12} /></span>{kind === "host" ? "Hosting" : "Joining"}</strong>
                                <span>{v.length}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
            {modal}
        </section>
    );
}

/** Create and join pages: one compact row with a thumbnail. */
export function ExplainerCard({ kind, lead }) {
    const [openVideo, modal] = useVideoModal();
    const v = EXPLAINERS[kind];
    return (
        <>
            <button type="button" className="nopa-explainer-card" onClick={() => openVideo(kind)}>
                <span className="nopa-explainer-thumb">
                    <img src={v.poster} alt="" loading="lazy" width="540" height="960" />
                    <span className="nopa-explainer-play small"><PlayIcon size={14} /></span>
                </span>
                <span className="nopa-explainer-text">
                    <strong>{lead || v.title}</strong>
                    <span>{v.blurb}</span>
                    <em>Watch · {v.length}</em>
                </span>
            </button>
            {modal}
        </>
    );
}
