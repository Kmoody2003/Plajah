const {chromium}=require('playwright');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1300,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.resolve('public/template-review.html')).href);
 await page.locator('.design').last().waitFor();
 if(await page.locator('.design').count()!==42)throw Error('Expected 42 designs');
 await page.screenshot({path:'public/template-review-assets/gallery-overview.png',fullPage:true});
 for(const kind of ['ticket','evite','promo']){
  await page.locator(`[data-filter="${kind}"]`).click();
  const ids=await page.locator('.design').evaluateAll(nodes=>nodes.map(n=>n.dataset.id));
  for(const id of ids){
   await page.locator(`[data-id="${id}"]`).click();
   if(await page.locator('.stage svg').count()!==1)throw Error('Missing SVG '+id);
   await page.locator('.motion').click();
   if(await page.locator('.motion').getAttribute('aria-pressed')!=='true')throw Error('Motion not running '+id);
   await page.waitForTimeout(80);
   await page.locator('.motion').click();
   if(id===ids[0])await page.screenshot({path:`public/template-review-assets/${kind}-detail.png`,fullPage:true});
   await page.locator('.back').click();
  }
 }
 await page.setViewportSize({width:375,height:812});
 await page.locator('[data-filter="all"]').click();
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
 await page.locator('.design').first().click();
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.locator('.motion').click();
 if(await page.locator('.motion').getAttribute('aria-pressed')!=='false')throw Error('Reduced motion ignored');
 await page.screenshot({path:'public/template-review-assets/mobile-detail.png',fullPage:true});
 await browser.close();if(errors.length)throw Error(errors.join('\n'));console.log('PASS: 42 details, motion controls, filters, mobile width, reduced motion, no browser errors.');
})().catch(e=>{console.error(e);process.exit(1)});
