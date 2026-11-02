import 'dotenv/config';
import { chromium } from 'playwright';

const AVANTURE_USER = process.env.AVANTURE_USER;
const AVANTURE_PASS = process.env.AVANTURE_PASS;

async function main() {
  if (!AVANTURE_USER || !AVANTURE_PASS) {
    console.error('Missing credentials: set AVANTURE_USER and AVANTURE_PASS (e.g. in .env).');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://www.avanture.net/');
  await page.fill('#input_edit_user_login_email', AVANTURE_USER);
  await page.fill('#input_edit_user_login_password', AVANTURE_PASS);
  await page.click('input[name="submit"][value="Prijava"]');
  await page.waitForLoadState('domcontentloaded');
  await page.goto('https://www.avanture.net/classifieds/create');
  await page.waitForLoadState('domcontentloaded');

  const countryOpts = await page.$$eval('select[name*="country"] option', opts => opts.map(o => ({ value: o.value, text: o.textContent.trim() })));
  const slovenia = countryOpts.find(c => c.text.toLowerCase().includes('sloven'));
  console.log('Slovenia option:', JSON.stringify(slovenia));

  if (slovenia) {
    await page.selectOption('select[name*="country"]', slovenia.value);
    await page.waitForTimeout(2500);
    const stateOpts = await page.$$eval('select[name*="state"] option', opts => opts.map(o => ({ value: o.value, text: o.textContent.trim() })));
    console.log('State options for Slovenia:', JSON.stringify(stateOpts));

    const osrednje = stateOpts.find(s => s.text.toLowerCase().includes('osredn'));
    console.log('Osrednjeslovenska option:', JSON.stringify(osrednje));
    if (osrednje) {
      await page.selectOption('select[name*="state"]', osrednje.value);
      await page.waitForTimeout(2500);
      const cityOpts = await page.$$eval('select[name*="city"] option', opts => opts.map(o => ({ value: o.value, text: o.textContent.trim() })));
      console.log('City options for Osrednjeslovenska count:', cityOpts.length);
      const ljubljana = cityOpts.find(c => c.text.toLowerCase().includes('ljubljan'));
      console.log('Ljubljana option:', JSON.stringify(ljubljana));
    }
  }

  const catOpts = await page.$$eval('select[name*="category"] option', opts => opts.map(o => ({ value: o.value, text: o.textContent.trim() })));
  console.log('Category options:', JSON.stringify(catOpts));

  await browser.close();
}

main().catch(console.error);
