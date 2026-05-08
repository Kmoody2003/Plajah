import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message, '\n', error.stack));
  
  await page.goto('http://localhost:3000');
  
  // Wait for the app to load
  await new Promise(r => setTimeout(r, 2000));
  
  console.log("Navigating around...");
  // Find all buttons in the dock and click them
  const buttons = await page.$$('button');
  for (let b of buttons) {
      try {
          await b.click();
          await new Promise(r => setTimeout(r, 500));
      } catch (e) {}
  }
  
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
})();
