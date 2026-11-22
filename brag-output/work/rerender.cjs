const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto("file://" + __dirname + "/video.html"); await p.evaluate(() => window.ready);
  for (let f = 495; f < 540; f++) { await p.evaluate(t => render(t), f / 30); await p.screenshot({ path: `frames/f${String(f).padStart(4,"0")}.jpg`, type: "jpeg", quality: 94 }); }
  await b.close();
})();
