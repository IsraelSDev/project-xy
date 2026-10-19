import { chromium } from '@playwright/test';
const browser = await chromium.launch();
for (const [model, gender] of [['character_male','male'],['character_female','female']]) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:5173/viewer3dx.html?model=${model}&outfit=all`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `C:/Users/israe/AppData/Local/Temp/opencode/top6-${gender}.png` });
  console.log(gender, errors);
  await page.close();
}
await browser.close();
