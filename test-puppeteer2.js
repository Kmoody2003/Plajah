import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  let failed = false;

  page.on('console', msg => {
      const text = msg.text();
      console.log('PAGE LOG:', text);
      if (text.includes("Cannot read properties of undefined")) failed = true;
  });
  page.on('pageerror', error => {
      console.log('PAGE ERROR:', error.message);
      if (error.message.includes("Cannot read properties of undefined")) failed = true;
  });
  
  await page.goto('http://localhost:3000');
  await new Promise(r => setTimeout(r, 2000));
  
  // Get all buttons and their texts
  const buttons = await page.evaluate(() => {
     return Array.from(document.querySelectorAll('button')).map((b, i) => ({ id: i, text: b.innerText }));
  });
  
  for (const b of buttons) {
     console.log("Clicking:", b.text.replace(/\n/g, ' '));
     await page.evaluate((index) => {
         const btns = document.querySelectorAll('button');
         if (btns[index]) btns[index].click();
     }, b.id);
     await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log("Failed:", failed);
  await browser.close();
})();
