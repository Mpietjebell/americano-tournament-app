import { useRef, useState } from "react";

const TONES = [
    ["#1C4F35", "#E7F0EA"], ["#8B7340", "#F6EFDD"], ["#7A3E2B", "#F6E6DF"], ["#2F5D7C", "#E3EEF5"],
    ["#5B4A7A", "#ECE7F4"], ["#3F6B4E", "#E4F0E7"], ["#8A4B6B", "#F5E6EE"], ["#4A5560", "#E8ECEF"],
];

function initials(name) {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function tone(name) {
    let hash = 0;
    for (const ch of (name || "").toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return TONES[hash % TONES.length];
}

/**
 * A person or club. Shows their photo when they have one, otherwise their
 * initials on a colour derived from the name — so everyone gets a face,
 * and the same name always gets the same colour.
 */
export function Avatar({ name, src, size = 32, square = false, style }) {
    const [fg, bg] = tone(name);
    const base = {
        width: size, height: size, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: square ? Math.round(size * 0.26) : "50%", overflow: "hidden",
        background: bg, color: fg, fontWeight: 700, fontSize: Math.max(10, Math.round(size * 0.38)), letterSpacing: "0.02em",
        lineHeight: 1, userSelect: "none", ...style,
    };
    if (src) {
        return <span style={base}><img src={src} alt="" width={size} height={size} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></span>;
    }
    return <span style={base} aria-hidden="true">{initials(name)}</span>;
}

/** Shrinks a chosen photo to a centred 256px square JPEG so uploads stay tiny. */
function resizeToDataUrl(file, size = 256) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const side = Math.min(img.naturalWidth, img.naturalHeight);
            const canvas = document.createElement("canvas");
            canvas.width = size; canvas.height = size;
            canvas.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image.")); };
        img.src = url;
    });
}

/**
 * Avatar with a "change photo" control. The resized image travels in a
 * hidden field named `fieldName` with the rest of the form.
 */
export function AvatarPicker({ name, src, size = 88, square = false, fieldName = "avatar", label = "Change photo" }) {
    const input = useRef(null);
    const [preview, setPreview] = useState(null);
    const [error, setError] = useState(null);

    const onPick = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try { setPreview(await resizeToDataUrl(file)); setError(null); } catch (err) { setError(err.message); }
    };

    return (
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar name={name} src={preview || src} size={size} square={square} />
            <div>
                <button type="button" className="nopa-btn nopa-btn-ghost nopa-btn-small" onClick={() => input.current?.click()}>{label}</button>
                <input ref={input} type="file" accept="image/*" onChange={onPick} hidden />
                <input type="hidden" name={fieldName} value={preview || ""} />
                <div style={{ fontSize: "0.7rem", color: error ? "#991b1b" : "var(--label-3)", marginTop: 6 }}>
                    {error || (preview ? "New photo selected — save to keep it." : "Square photos work best.")}
                </div>
            </div>
        </div>
    );
}
