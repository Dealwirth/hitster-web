import { chromium } from 'playwright-core';
import fs from 'node:fs';
const axeSource = fs.readFileSync('node_modules/axe-core/axe.min.js','utf8');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport:{width:1440,height:1000}, bypassCSP: true });
const page = await ctx.newPage();
await page.goto('http://localhost:12000/?play=1', { waitUntil:'networkidle' });
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
const start = await ctx.newPage();
await start.goto('http://localhost:12000/?start=1', { waitUntil:'networkidle' });
await start.waitForTimeout(600);
await start.addScriptTag({ content: axeSource });
const result3 = await start.evaluate(async () => await axe.run(document, { runOnly: { type:'tag', values:['wcag2a','wcag2aa','wcag21a','wcag21aa'] } }));
console.log('\nstart violations:', result3.violations.length);
for (const v of result3.violations) {
  console.log(`[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
  for (const n of v.nodes.slice(0,4)) console.log('   -', n.target.join(' '), '|', (n.failureSummary||'').split('\n').slice(0,2).join(' '));
}
const online = await ctx.newPage();
await online.goto('http://localhost:12000/?online=1&localonline=1', { waitUntil:'networkidle' });
await online.waitForFunction(() => window.HITSTER?.state?.ready, { timeout:30000 });
await online.waitForTimeout(400);
await online.addScriptTag({ content: axeSource });
const result4 = await online.evaluate(async () => await axe.run(document, { runOnly: { type:'tag', values:['wcag2a','wcag2aa','wcag21a','wcag21aa'] } }));
console.log('\nonline violations:', result4.violations.length);
for (const v of result4.violations) {
  console.log(`[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
  for (const n of v.nodes.slice(0,4)) console.log('   -', n.target.join(' '), '|', (n.failureSummary||'').split('\n').slice(0,2).join(' '));
}
await browser.close();
