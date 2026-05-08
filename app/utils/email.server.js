const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = "NOPA Padel <tournaments@tournaments.nopabrand.com>";

async function send({ to, subject, html }) {
    try {
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ from: FROM, to: [to], subject, html }),
        });
        if (!res.ok) {
            const err = await res.text();
            console.error("[email] resend error:", err);
        }
    } catch (e) {
        console.error("[email] send failed:", e);
    }
}

export async function sendSignupConfirmation({ to, name, tournament, position }) {
    const venueName = tournament.venue?.name || tournament.location || "";
    const city = tournament.city || tournament.venue?.city || "";
    const locationLine = [venueName, city].filter(Boolean).join(", ");
    const dateStr = tournament.scheduledAt
        ? new Date(tournament.scheduledAt).toLocaleString("en-GB", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
              hour: "2-digit", minute: "2-digit",
          })
        : "";
    const spotsLine = tournament.maxPlayers
        ? `You are spot <strong>${position}</strong> of ${tournament.maxPlayers}.`
        : "You are signed up.";

    await send({
        to,
        subject: `You're in — ${tournament.name}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr><td style="background:#1C4F35;padding:28px 28px 24px;text-align:center">
          <div style="font-size:1.5rem;font-weight:800;color:white;letter-spacing:0.15em">NOPA</div>
          <div style="font-size:0.78rem;color:rgba(255,255,255,0.7);margin-top:4px;letter-spacing:0.1em;text-transform:uppercase">Padel Tournaments</div>
        </td></tr>
        <tr><td style="padding:28px 28px 8px">
          <div style="font-size:1.3rem;font-weight:700;color:#1a1a1a;margin-bottom:6px">You're in, ${name}! 🎾</div>
          <div style="font-size:0.9rem;color:#666;line-height:1.6">${spotsLine}</div>
        </td></tr>
        <tr><td style="padding:16px 28px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f7;border-radius:12px;overflow:hidden">
            <tr><td style="padding:16px 18px;border-bottom:1px solid #eee">
              <div style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.1em;color:#999;font-weight:700;margin-bottom:4px">Tournament</div>
              <div style="font-weight:700;font-size:1rem;color:#1a1a1a">${tournament.name}</div>
            </td></tr>
            ${dateStr ? `<tr><td style="padding:14px 18px;border-bottom:1px solid #eee">
              <div style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.1em;color:#999;font-weight:700;margin-bottom:4px">Date & Time</div>
              <div style="font-weight:600;font-size:0.92rem;color:#1a1a1a">${dateStr}</div>
            </td></tr>` : ""}
            ${locationLine ? `<tr><td style="padding:14px 18px${tournament.googleMapsUrl ? ";border-bottom:1px solid #eee" : ""}">
              <div style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.1em;color:#999;font-weight:700;margin-bottom:4px">Location</div>
              <div style="font-weight:600;font-size:0.92rem;color:#1a1a1a">${locationLine}</div>
            </td></tr>` : ""}
            ${tournament.googleMapsUrl ? `<tr><td style="padding:14px 18px">
              <a href="${tournament.googleMapsUrl}" style="color:#1C4F35;font-weight:600;font-size:0.88rem;text-decoration:none">📍 Open in Google Maps →</a>
            </td></tr>` : ""}
          </table>
        </td></tr>
        <tr><td style="padding:8px 28px 28px">
          <div style="font-size:0.82rem;color:#999;line-height:1.6;background:#fff7ed;border-left:3px solid #f59e0b;padding:12px 14px;border-radius:0 8px 8px 0">
            ⚠️ By signing up you commit to showing up. No-shows will be banned from future NOPA tournaments.
          </div>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f0f0f0;text-align:center">
          <div style="font-size:0.72rem;color:#bbb">Powered by <strong style="color:#1C4F35">NOPA Padel</strong></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
}

export async function sendStandbyPromoted({ to, name, tournament }) {
    const venueName = tournament.venue?.name || tournament.location || "";
    const city = tournament.city || tournament.venue?.city || "";
    const locationLine = [venueName, city].filter(Boolean).join(", ");
    const dateStr = tournament.scheduledAt
        ? new Date(tournament.scheduledAt).toLocaleString("en-GB", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
              hour: "2-digit", minute: "2-digit",
          })
        : "";

    await send({
        to,
        subject: `A spot opened — you're in! ${tournament.name}`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:white;border-radius:16px;overflow:hidden">
        <tr><td style="background:#1C4F35;padding:24px;text-align:center">
          <div style="font-size:1.4rem;font-weight:800;color:white;letter-spacing:0.15em">NOPA</div>
        </td></tr>
        <tr><td style="padding:24px">
          <div style="font-size:1.2rem;font-weight:700;color:#1a1a1a;margin-bottom:8px">Good news, ${name}!</div>
          <p style="font-size:0.9rem;color:#666;line-height:1.6">A spot opened up in <strong>${tournament.name}</strong> and you're first on the standby list — you're now confirmed!</p>
          ${locationLine ? `<p style="font-size:0.88rem;color:#1C4F35;font-weight:600">📍 ${locationLine}</p>` : ""}
          ${dateStr ? `<p style="font-size:0.88rem;color:#333;font-weight:600">📅 ${dateStr}</p>` : ""}
          ${tournament.googleMapsUrl ? `<p><a href="${tournament.googleMapsUrl}" style="color:#1C4F35;font-weight:600;font-size:0.88rem">Open in Google Maps →</a></p>` : ""}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #f0f0f0;text-align:center">
          <div style="font-size:0.72rem;color:#bbb">Powered by <strong style="color:#1C4F35">NOPA Padel</strong></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    });
}

export async function sendStandbyHostNotification({ to, tournament, standbyCount }) {
    await send({
        to,
        subject: `${standbyCount} players on standby — ${tournament.name}`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:white;border-radius:16px;overflow:hidden">
        <tr><td style="background:#1C4F35;padding:24px;text-align:center">
          <div style="font-size:1.4rem;font-weight:800;color:white;letter-spacing:0.15em">NOPA</div>
        </td></tr>
        <tr><td style="padding:24px">
          <div style="font-size:1.2rem;font-weight:700;color:#1a1a1a;margin-bottom:8px">Standby list update</div>
          <p style="font-size:0.9rem;color:#666;line-height:1.6"><strong>${standbyCount} players</strong> are now on the standby list for <strong>${tournament.name}</strong>. Consider adding more slots or letting them know.</p>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #f0f0f0;text-align:center">
          <div style="font-size:0.72rem;color:#bbb">Powered by <strong style="color:#1C4F35">NOPA Padel</strong></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    });
}

export async function sendLocationChanged({ participants, tournament }) {
    const venueName = tournament.venue?.name || tournament.location || "";
    const city = tournament.city || "";
    const locationLine = [venueName, city].filter(Boolean).join(", ");

    await Promise.all(participants.map(({ email, name }) =>
        send({
            to: email,
            subject: `Venue update — ${tournament.name}`,
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:white;border-radius:16px;overflow:hidden">
        <tr><td style="background:#1C4F35;padding:24px;text-align:center">
          <div style="font-size:1.4rem;font-weight:800;color:white">NOPA</div>
        </td></tr>
        <tr><td style="padding:24px">
          <div style="font-size:1.1rem;font-weight:700;color:#1a1a1a;margin-bottom:8px">Venue updated, ${name || "player"}</div>
          <p style="font-size:0.9rem;color:#666;line-height:1.6">The venue for <strong>${tournament.name}</strong> has been updated.</p>
          <p style="font-size:0.95rem;color:#1C4F35;font-weight:600">📍 ${locationLine}</p>
          ${tournament.googleMapsUrl ? `<p><a href="${tournament.googleMapsUrl}" style="color:#1C4F35;font-weight:600">Open in Google Maps →</a></p>` : ""}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #f0f0f0;text-align:center">
          <div style="font-size:0.72rem;color:#bbb">Powered by <strong style="color:#1C4F35">NOPA Padel</strong></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
        })
    ));
}

export async function sendPriceChanged({ participants, tournament }) {
    await Promise.all(participants.map(({ email, name }) =>
        send({
            to: email,
            subject: `Price update — ${tournament.name}`,
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:white;border-radius:16px;overflow:hidden">
        <tr><td style="background:#1C4F35;padding:24px;text-align:center">
          <div style="font-size:1.4rem;font-weight:800;color:white">NOPA</div>
        </td></tr>
        <tr><td style="padding:24px">
          <div style="font-size:1.1rem;font-weight:700;color:#1a1a1a;margin-bottom:8px">Price updated, ${name || "player"}</div>
          <p style="font-size:0.9rem;color:#666;line-height:1.6">The entry price for <strong>${tournament.name}</strong> has been updated to <strong>${tournament.price ? `${tournament.price} ${tournament.currency || ""}` : "Free"}</strong>.</p>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #f0f0f0;text-align:center">
          <div style="font-size:0.72rem;color:#bbb">Powered by <strong style="color:#1C4F35">NOPA Padel</strong></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
        })
    ));
}

export async function sendTournamentConfirmed({ participants, tournament }) {
    const venueName = tournament.venue?.name || tournament.location || "";
    const city = tournament.city || tournament.venue?.city || "";
    const locationLine = [venueName, city].filter(Boolean).join(", ");
    const dateStr = tournament.scheduledAt
        ? new Date(tournament.scheduledAt).toLocaleString("en-GB", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
              hour: "2-digit", minute: "2-digit",
          })
        : "";

    await Promise.all(
        participants.map(({ email, name }) =>
            send({
                to: email,
                subject: `It's on — ${tournament.name} is full!`,
                html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr><td style="background:#1C4F35;padding:28px 28px 24px;text-align:center">
          <div style="font-size:1.5rem;font-weight:800;color:white;letter-spacing:0.15em">NOPA</div>
          <div style="font-size:0.78rem;color:rgba(255,255,255,0.7);margin-top:4px;letter-spacing:0.1em;text-transform:uppercase">Padel Tournaments</div>
        </td></tr>
        <tr><td style="padding:28px 28px 8px">
          <div style="font-size:1.3rem;font-weight:700;color:#1a1a1a;margin-bottom:6px">It's on, ${name || "player"}! 🙌</div>
          <div style="font-size:0.9rem;color:#666;line-height:1.6"><strong>${tournament.name}</strong> is now full and confirmed. Get ready to play!</div>
        </td></tr>
        <tr><td style="padding:16px 28px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f7;border-radius:12px;overflow:hidden">
            ${dateStr ? `<tr><td style="padding:14px 18px;border-bottom:1px solid #eee">
              <div style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.1em;color:#999;font-weight:700;margin-bottom:4px">Date & Time</div>
              <div style="font-weight:600;font-size:0.92rem;color:#1a1a1a">${dateStr}</div>
            </td></tr>` : ""}
            ${locationLine ? `<tr><td style="padding:14px 18px${tournament.googleMapsUrl ? ";border-bottom:1px solid #eee" : ""}">
              <div style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.1em;color:#999;font-weight:700;margin-bottom:4px">Location</div>
              <div style="font-weight:600;font-size:0.92rem;color:#1a1a1a">${locationLine}</div>
            </td></tr>` : ""}
            ${tournament.googleMapsUrl ? `<tr><td style="padding:14px 18px">
              <a href="${tournament.googleMapsUrl}" style="color:#1C4F35;font-weight:600;font-size:0.88rem;text-decoration:none">📍 Open in Google Maps →</a>
            </td></tr>` : ""}
          </table>
        </td></tr>
        <tr><td style="padding:8px 28px 28px">
          <div style="font-size:0.82rem;color:#999;line-height:1.6;background:#f0fdf4;border-left:3px solid #1C4F35;padding:12px 14px;border-radius:0 8px 8px 0;color:#1C4F35">
            See you on the court. Don't forget to warm up! 🎾
          </div>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f0f0f0;text-align:center">
          <div style="font-size:0.72rem;color:#bbb">Powered by <strong style="color:#1C4F35">NOPA Padel</strong></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
            })
        )
    );
}
