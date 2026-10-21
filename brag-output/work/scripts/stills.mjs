import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const [,, html, outdir, ...times] = process.argv;
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: +(process.env.W || 1920), height: +(process.env.H || 1080) } });
pg.on('pageerror', e => console.error('PAGEERR', e.message));
await pg.goto('file://' + html);
await pg.evaluate(() => window.ready);
for (const t of times) {
  await pg.evaluate(t => window.render(t), +t);
  await pg.screenshot({ path: `${outdir}/still-${t}.png` });
}
await b.close();
