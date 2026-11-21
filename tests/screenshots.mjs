import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport:{width:1440,height:1000}, deviceScaleFactor:1 });
await page.goto('http://localhost:12000/', { waitUntil:'networkidle' });
await page.waitForFunction(() => window.HITSTER?.state?.songs?.length > 1000);
const pick = async (title) => {
  await page.evaluate(async (t) => {
    const d = await (await fetch('/api/catalog')).json();
    const s = d.songs.find(x => x.title === t) || d.songs[0];
    window.HITSTER.loadCard(s);
  }, title);
  await page.waitForTimeout(900);
};
await pick('Dancing Queen');
await page.screenshot({ path:'docs/screenshot-front.png', fullPage:false });
await page.locator('#flipBtn').click();
await page.waitForTimeout(1000);
await page.screenshot({ path:'docs/screenshot-back.png', fullPage:false });
await page.locator('#helpBtn').click();
await page.waitForTimeout(400);
await page.screenshot({ path:'docs/screenshot-help.png', fullPage:false });
await page.keyboard.press('Escape');
await page.locator('#spotifyBtn').click();
await page.waitForTimeout(700);
await page.screenshot({ path:'docs/screenshot-spotify.png', fullPage:false });
await page.keyboard.press('Escape');

await page.locator('.mode-btn[data-mode="extension"]').click();
await page.waitForTimeout(300);
await page.evaluate(() => window.HITSTER.applyYear(1984));
await page.waitForTimeout(900);
await page.screenshot({ path:'docs/screenshot-extension.png', fullPage:false });

await page.evaluate(() => { window.print = () => {}; window.HITSTER.openPrint(); });
await page.waitForTimeout(300);
await page.selectOption('#printCount', '9');
await page.locator('#printGo').click();
await page.waitForTimeout(1200);
await page.emulateMedia({ media:'print' });
await page.setViewportSize({ width: 794, height: 1123 });
await page.waitForTimeout(300);
await page.locator('#printRoot .print-sheet.fronts').screenshot({ path:'docs/screenshot-print.png' });
await page.emulateMedia({ media:'screen' });
await page.setViewportSize({ width: 1440, height: 1000 });

const m = await browser.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
await m.goto('http://localhost:12000/', { waitUntil:'networkidle' });
await m.waitForFunction(() => window.HITSTER?.state?.songs?.length > 1000);
await m.evaluate(async () => {
  const d = await (await fetch('/api/catalog')).json();
  window.HITSTER.loadCard(d.songs.find(x => x.title === 'Dancing Queen') || d.songs[0]);
});
await m.waitForTimeout(900);
await m.screenshot({ path:'docs/screenshot-mobile-front.png', fullPage:false });
await m.locator('#flipBtn').tap();
await m.waitForTimeout(1000);
await m.screenshot({ path:'docs/screenshot-mobile-back.png', fullPage:false });
console.log('screenshots written to docs/');
await browser.close();
