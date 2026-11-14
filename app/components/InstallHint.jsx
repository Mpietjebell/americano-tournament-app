import { useEffect, useState } from "react";

const DISMISS_KEY = "nopa_install_hint_dismissed";

/**
 * "Add to Home Screen" nudge. Only rendered after mount (it depends on the
 * browser), only on phones, and never once the app is already installed.
 * Android/Chrome gets a real install button; iOS Safari has no install API,
 * so it gets the two-tap instruction instead.
 */
export function InstallHint() {
    const [mode, setMode] = useState(null); // null | "prompt" | "ios"
    const [promptEvent, setPromptEvent] = useState(null);

    useEffect(() => {
        let dismissed = false;
        try { dismissed = localStorage.getItem(DISMISS_KEY) === "1"; } catch { /* private mode */ }
        const standalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
        if (dismissed || standalone) return;

        const ua = window.navigator.userAgent;
        const isIos = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
        if (isIos) setMode("ios");

        const onPrompt = (e) => { e.preventDefault(); setPromptEvent(e); setMode("prompt"); };
        window.addEventListener("beforeinstallprompt", onPrompt);
        return () => window.removeEventListener("beforeinstallprompt", onPrompt);
    }, []);

    if (!mode) return null;

    const dismiss = () => {
        try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
        setMode(null);
    };

    const install = async () => {
        if (!promptEvent) return;
        promptEvent.prompt();
        await promptEvent.userChoice.catch(() => {});
        setMode(null);
    };

    return (
        <div className="nopa-install">
            <div className="nopa-install-copy">
                <strong>Install the Clubhouse</strong>
                {mode === "ios"
                    ? <span>Tap <b>Share</b>, then <b>Add to Home Screen</b> — it opens like an app, no App Store needed.</span>
                    : <span>Add it to your home screen — it opens like an app, no store needed.</span>}
            </div>
            {mode === "prompt" && <button type="button" onClick={install} className="nopa-install-btn">Install</button>}
            <button type="button" onClick={dismiss} className="nopa-install-close" aria-label="Dismiss">×</button>
        </div>
    );
}
