import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin=process.env.PLAJAH_TEST_ORIGIN || 'http://localhost:3000';
const albumId=process.env.PLAJAH_TEST_ALBUM || 'album_1785105443953_pxisg';
const browser=await chromium.launch({headless:true});
try {
  for(const mobile of [true,false]) {
    const context=await browser.newContext({viewport:mobile?{width:412,height:892}:{width:1440,height:1000},isMobile:mobile});
    await context.addInitScript(()=>{localStorage.setItem('chora_next_ui','1');localStorage.setItem('chora_next_mode','night');});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${origin}/?type=album&id=${encodeURIComponent(albumId)}`,{waitUntil:'domcontentloaded',timeout:60000});
    const select=page.getByRole('button',{name:'Select',exact:true});
    await select.waitFor({state:'visible',timeout:60000});
    assert.equal(await page.getByText('SYSTEM INTERRUPTION',{exact:true}).count(),0,'Album must render without the error boundary');
    await select.click();
    const selectAll=page.getByRole('button',{name:'Select all',exact:true});
    await selectAll.waitFor({state:'visible'});
    await selectAll.click();
    await page.getByRole('button',{name:'Clear all',exact:true}).waitFor({state:'visible'});
    await page.getByRole('button',{name:'Done',exact:true}).click();
    await select.waitFor({state:'visible'});
    await select.click();
    await selectAll.waitFor({state:'visible'});
    assert.equal(await page.getByRole('button',{name:'Clear all',exact:true}).count(),0,'Re-entering selection must start empty');
    await page.getByRole('button',{name:'Done',exact:true}).click();
    assert.deepEqual(errors.filter(e=>/toggleSelectMode|ReferenceError|is not defined/.test(e)),[]);
    console.log(`${mobile?'mobile':'desktop'}: album opens; Select, Select all, Done and selection reset pass`);
    await context.close();
  }
} finally { await browser.close(); }
