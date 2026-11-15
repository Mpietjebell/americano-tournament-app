import { useEffect, useState } from "react";

const DISMISS_KEY = "nopa_install_hint_dismissed";

/**
 * "Add to Home Screen" nudge. Only rendered after mount (it depends on the
 * browser), only on phones, and never once the app is already installed.
 *  - Android/Chrome: a real Install button.
 *  - iPhone/iPad in Safari: there is no install API, so the three taps are
 *    spelled out with the Share icon people have to look for.
 *  - iPhone inside another app's browser (Instagram, Facebook…): Add to Home
 *    Screen isn't offered there, so point people to Safari first.
 */
export function InstallHint() {
    const [mode, setMode] = useState(null); // null | "prompt" | "ios" | "ios-inapp"
    const [promptEvent, setPromptEvent] = useState(null);

    useEffect(() => {
        let dismissed = false;
        try { dismissed = localStorage.getItem(DISMISS_KEY) === "1"; } catch { /* private mode */ }
        const standalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
        if (dismissed || standalone) return;

        const ua = window.navigator.userAgent;
        const isIos = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
        const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|LinkedInApp/i.test(ua);
        if (isIos) setMode(inApp ? "ios-inapp" : "ios");

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
                <div className="club-eyebrow">Keep it on your phone</div>
                <strong>Add the Clubhouse to your home screen</strong>
                {mode === "ios" && (
                    <ol className="nopa-install-steps">
                        <li><span>1</span>Tap <ShareIcon /> <b>Share</b> in Safari</li>
                        <li><span>2</span>Choose <b>Add to Home Screen</b></li>
                        <li><span>3</span>Tap <b>Add</b> — it opens like an app</li>
                    </ol>
                )}
                {mode === "ios-inapp" && (
                    <p>Open this page in <b>Safari</b> first (tap <b>···</b>, then <b>Open in Safari</b>). There you can add it to your home screen.</p>
                )}
                {mode === "prompt" && <p>It opens full-screen like an app. No store needed.</p>}
            </div>
            {mode === "prompt" && <button type="button" onClick={install} className="nopa-install-btn">Install</button>}
            <button type="button" onClick={dismiss} className="nopa-install-close" aria-label="Dismiss">×</button>
        </div>
    );
}

function ShareIcon() {
    return (
        <svg className="nopa-install-share" width="15" height="18" viewBox="0 0 15 18" fill="none" aria-hidden="true">
            <path d="M7.5 11.5V1.5M7.5 1.5L4.2 4.8M7.5 1.5l3.3 3.3" stroke="currentColor" strokeWidth="1.3" />
            <path d="M4.5 7.5H2v9h11v-9h-2.5" stroke="currentColor" strokeWidth="1.3" />
        </svg>
    );
}
