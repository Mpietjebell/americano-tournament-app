import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3100";
const activeId = process.env.ACTIVE_ID;
const finishedId = process.env.FINISHED_ID;
const activeCode = process.env.ACTIVE_CODE;

if (!activeId || !finishedId || !activeCode) {
  throw new Error("ACTIVE_ID, FINISHED_ID, and ACTIVE_CODE are required");
}

const shots = [
  { path: "/app/play", file: "home.png", width: 1440, height: 1080 },
  { path: `/app/play/tournament/${activeId}`, file: "host-active.png", width: 1440, height: 1400 },
  { path: `/app/play/tournament/${finishedId}/final`, file: "final-results.png", width: 1200, height: 1800 },
  { path: `/app/play/tournament/${activeId}/overview`, file: "overview.png", width: 1200, height: 1800 },
  { path: `/app/play/join/${activeCode}`, file: "join-flow.png", width: 900, height: 1500 },
  { path: `/app/play/tournament/${activeId}/player`, file: "player-live.png", width: 900, height: 1700 },
];

const browser = await chromium.launch({ headless: true });

try {
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
    await page.goto(`${baseUrl}${shot.path}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `screenshots/${shot.file}`, fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
}
