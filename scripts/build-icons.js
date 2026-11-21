import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SVG = fs.readFileSync(path.join(ROOT, 'public/icons/icon.svg'), 'utf8');
const DATA = `data:image/svg+xml;base64,${Buffer.from(SVG).toString('base64')}`;
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
for (const size of [180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0b0b0d}img{width:100%;height:100%;display:block}</style><img src="${DATA}">`);
  await page.screenshot({ path: path.join(ROOT, `public/icons/icon-${size}.png`) });
  await page.close();
}
await browser.close();
console.log('Icons: 180, 192, 512');
