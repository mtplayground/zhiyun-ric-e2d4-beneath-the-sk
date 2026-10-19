/* global document, getComputedStyle */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
(async () => {
  const url = fs.existsSync('.deploy_url') ? fs.readFileSync('.deploy_url', 'utf8').trim() : '';
  if (!url) throw new Error('.deploy_url empty or missing; run bash scripts/capture-deploy-url.sh');
  const errors = [];
  const browser = await chromium.launch({args:['--no-sandbox','--disable-setuid-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1080},permissions:['clipboard-read','clipboard-write']});
    const page = await context.newPage();
    page.on('pageerror', e => errors.push('Browser runtime error: '+e.message));
    page.on('console', m => {if(m.type()==='error') errors.push('Console error: '+m.text());});
    page.on('requestfailed', r => errors.push('Failed network request: '+new URL(r.url()).pathname));
    page.on('response', r => {if(r.status()>=400) errors.push('HTTP '+r.status()+': '+new URL(r.url()).pathname);});
    await page.addInitScript(()=>Object.defineProperty(navigator,'share',{value:undefined,configurable:true}));
    const response = await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
    assert(response?.ok(),'Root page failed');
    await page.getByRole('heading',{name:'Beneath the Skin',exact:true}).waitFor();
    await page.getByText('52 blendshapes',{exact:true}).waitFor({timeout:90000});
    assert((await page.locator('body').innerText()).trim().length>100,'Page lacks meaningful content');
    assert(await page.evaluate(()=>document.styleSheets.length>0 && parseFloat(getComputedStyle(document.querySelector('h1')).fontSize)>=30),'Styling not applied');
    // This single-screen dashboard has no internal navigation or login flow.
    for(const label of ['Paper','Video','Code']) assert.equal(await page.getByRole('button',{name:new RegExp(label)}).getAttribute('aria-disabled'),'true');
    assert.equal(await page.getByRole('button',{name:/log\s*out|sign\s*out/i}).count(),0,'Unexpected auth UI');
    const pose=async(name)=>page.getByText(new RegExp('Current Pose: '+name+' \\| Frame:')).waitFor();
    await page.getByRole('combobox',{name:/Expressions \/ Emotions/i}).selectOption('expression-smile'); await pose('Smile');
    await page.getByTestId('physics-toggle').click();
    await page.getByText('Physics Active',{exact:true}).waitFor({timeout:90000});
    const telemetry=page.getByTestId('physics-telemetry'); await telemetry.waitFor();
    assert(!/NaN|Infinity/.test(await telemetry.innerText()),'Non-finite physics telemetry');
    await page.getByRole('combobox',{name:/Expressions \/ Emotions/i}).selectOption('expression-frown'); await pose('Frown');
    await page.getByText(/Mode: preset \| Activations: 5/).waitFor({timeout:15000});
    await page.getByTestId('physics-toggle').click(); await telemetry.waitFor({state:'detached'});
    await page.getByRole('button',{name:'Reset to Neutral (Reopen Rest Pose)'}).click(); await pose('Neutral');
    await page.getByLabel('Enable keyboard mode').check(); await page.locator('canvas').first().click(); await page.keyboard.press('a'); await pose('AA');
    await page.getByRole('button',{name:'Reset to Neutral (Reopen Rest Pose)'}).click(); await pose('Neutral');
    const watermark=page.locator('#mctai-watermark'); assert.equal(await watermark.count(),1);
    assert.equal(await watermark.getByRole('link').getAttribute('href'),'https://ideavibes.ai');
    await watermark.getByRole('button',{name:'Share',exact:true}).click();
    await watermark.getByRole('button',{name:'Copied',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),page.url());
    assert.equal(await page.locator('#mctai-preview-banner,[data-mctai-preview-banner]').count(),0);
    await page.screenshot({path:'verify-screenshot.png',fullPage:true});
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
  console.log('UI_VERIFY: PASS');
})().catch(e=>{console.log('UI_VERIFY: FAIL | '+e.message.split('\n')[0]);process.exitCode=1;});
