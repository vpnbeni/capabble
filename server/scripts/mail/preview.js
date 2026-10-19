// Writes every email as an HTML file you can open in a browser. Sends nothing.
//   npm run mail:preview                  into server/tmp/mail-preview
//   npm run mail:preview -- --out <dir>
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { samples } = require('../../src/mail/samples');
const { LOGO_CID, LOGO_PATH } = require('../../src/mail/brand');

const outArg = process.argv.indexOf('--out');
const defaultDir = path.join(__dirname, '..', '..', 'tmp', 'mail-preview');
const outDir = path.resolve(outArg > -1 ? process.argv[outArg + 1] : defaultDir);
fs.mkdirSync(outDir, { recursive: true });

// Mail clients get the logo as an attachment; a browser needs it inline.
const logo = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`;

const links = Object.entries(samples).map(([name, build]) => {
  const { subject, html, text } = build();
  fs.writeFileSync(path.join(outDir, `${name}.html`), html.split(`cid:${LOGO_CID}`).join(logo));
  fs.writeFileSync(path.join(outDir, `${name}.txt`), `Subject: ${subject}\n\n${text}\n`);
  return `<li><a href="${name}.html">${name}</a> · <a href="${name}.txt">text</a> — ${subject}</li>`;
});

fs.writeFileSync(
  path.join(outDir, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Capabble emails</title>
<body style="font-family:system-ui;padding:24px"><h1>Capabble emails</h1><ul>${links.join('')}</ul></body>`
);
console.log(`[mail:preview] ${links.length} emails → ${path.join(outDir, 'index.html')}`);
