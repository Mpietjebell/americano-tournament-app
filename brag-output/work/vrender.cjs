const { chromium } = require("playwright");
const fs = require("fs");
const [v, mode, ...rest] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto("file://" + __dirname + "/vertical.html?v=" + v);
  await p.evaluate(() => window.ready);
  if (mode === "stills") {
    const dir = `vstills-${v}`; fs.mkdirSync(dir, { recursive: true });
    for (const t of rest.map(Number)) { await p.evaluate(t => render(t), t); await p.screenshot({ path: `${dir}/t${t.toFixed(2)}.jpg`, type: "jpeg", quality: 85 }); }
  } else {
    const dir = `vframes-${v}`; fs.mkdirSync(dir, { recursive: true });
    const from = +(rest[0] || 0), to = rest[1] ? +rest[1] : Math.round((await p.evaluate(() => window.DURATION)) * 30) + 1;
    for (let f = from; f < to; f++) { await p.evaluate(t => render(t), f / 30); await p.screenshot({ path: `${dir}/f${String(f).padStart(4, "0")}.jpg`, type: "jpeg", quality: 94 }); }
  }
  console.log(v, "errors:", errs);
  await b.close();
})();
