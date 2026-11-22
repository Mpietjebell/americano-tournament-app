const { chromium } = require("playwright");
const fs = require("fs");
const mode = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto("file://" + __dirname + "/video.html");
  await p.evaluate(() => window.ready);
  if (mode === "stills") {
    fs.mkdirSync("stills", { recursive: true });
    const ts = process.argv.slice(3).map(Number);
    for (const t of ts) { await p.evaluate(t => render(t), t); await p.screenshot({ path: `stills/t${t.toFixed(2)}.jpg`, type: "jpeg", quality: 85 }); }
  } else {
    fs.mkdirSync("frames", { recursive: true });
    const N = 630;
    for (let f = 0; f < N; f++) {
      await p.evaluate(t => render(t), f / 30);
      await p.screenshot({ path: `frames/f${String(f).padStart(4, "0")}.jpg`, type: "jpeg", quality: 94 });
    }
  }
  console.log("errors:", errs);
  await b.close();
})();
