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

  const elements = await page.$$eval('input, textarea, select', els => els.map(e => ({
    tag: e.tagName,
    name: e.name,
    id: e.id,
    type: e.type,
    outerHTML: e.outerHTML
  })));

  console.log('=== FORM ELEMENTS ON /classifieds/create ===');
  console.log(JSON.stringify(elements, null, 2));

  await browser.close();
}

main().catch(console.error);
