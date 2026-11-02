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

  console.log('=== Logged in. URL:', page.url());

  // 1. Inspect top nav links
  const navLinks = await page.$$eval('header a, nav a, #header a', links => links.map(a => ({
    text: a.textContent.trim(),
    href: a.href,
    className: a.className,
    id: a.id,
    outerHTML: a.outerHTML
  })));
  console.log('\n--- Header/Nav Links ---');
  console.log(JSON.stringify(navLinks, null, 2));

  // 2. Click on Classifieds or Profile icon to see what appears
  const classifiedsLink = await page.$('a[href*="classifieds"], a:has-text("Classifieds"), a:has-text("Oglasi")');
  console.log('\nClassifieds link found:', !!classifiedsLink);

  // Check the right side icons
  const rightIcons = await page.$$eval('.header-right a, .top-bar a, ul.nav a, nav li a', els => els.map(e => ({
    text: e.textContent.trim(),
    href: e.href,
    title: e.title,
    html: e.outerHTML
  })));
  console.log('\n--- Right Icons / Nav items ---');
  console.log(JSON.stringify(rightIcons, null, 2));

  await browser.close();
}

main().catch(console.error);
