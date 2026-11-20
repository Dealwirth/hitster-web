import { chromium } from 'playwright-core';
import fs from 'node:fs';
const axeSource = fs.readFileSync('node_modules/axe-core/axe.min.js','utf8');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport:{width:1440,height:1000}, bypassCSP: true });
const page = await ctx.newPage();
await page.goto('http://localhost:12000/', { waitUntil:'networkidle' });
await page.waitForTimeout(800);
await page.addScriptTag({ content: axeSource });
const result = await page.evaluate(async () => await axe.run(document, { runOnly: { type:'tag', values:['wcag2a','wcag2aa','wcag21a','wcag21aa'] } }));
console.log('violations:', result.violations.length);
for (const v of result.violations) {
  console.log(`\n[${v.impact}] ${v.id}: ${v.help}`);
  console.log('  nodes:', v.nodes.length);
  for (const n of v.nodes.slice(0,5)) console.log('   -', n.target.join(' '), '|', (n.failureSummary||'').split('\n').slice(0,2).join(' '));
}
await page.locator('#flipBtn').click();
await page.waitForTimeout(900);
const result2 = await page.evaluate(async () => await axe.run(document, { runOnly: { type:'tag', values:['wcag2a','wcag2aa','wcag21a','wcag21aa'] } }));
console.log('\nback violations:', result2.violations.length);
for (const v of result2.violations) {
  console.log(`[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
  for (const n of v.nodes.slice(0,4)) console.log('   -', n.target.join(' '), '|', (n.failureSummary||'').split('\n').slice(0,2).join(' '));
}
await browser.close();
