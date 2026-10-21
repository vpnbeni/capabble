import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const [,, html, outdir, dur, fps] = process.argv;
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: +(process.env.W || 1920), height: +(process.env.H || 1080) } });
pg.on('pageerror', e => console.error('PAGEERR', e.message));
await pg.goto('file://' + html);
await pg.evaluate(() => window.ready);
const n = Math.round(+dur * +fps);
for (let i = 0; i < n; i++) {
  await pg.evaluate(t => window.render(t), i / +fps);
  await pg.screenshot({ path: `${outdir}/f${String(i).padStart(4, '0')}.png` });
}
await b.close();
console.log('frames', n);
