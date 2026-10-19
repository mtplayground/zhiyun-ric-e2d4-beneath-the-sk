import { expect, test, type Page } from '@playwright/test';
import { servePhysicsFixture } from './physics-fixture';

async function metric(page:Page,label:string) {
  return page.getByTestId('physics-telemetry').locator('div').filter({has:page.getByText(label,{exact:true})}).locator('dd').innerText();
}
async function setSlider(page:Page,label:string,value:number) {
  const slider=page.getByRole('slider',{name:label,exact:true});
  await slider.evaluate((element,value)=>{
    const input=element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,String(value));
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
  },value);
  await expect(slider).toHaveValue(String(value));
}
async function load(page:Page) {
  await page.goto('/');
  await expect(page.getByText('3 blendshapes',{exact:true})).toBeVisible();
  await expect(page.getByTestId('physics-control-panel')).toBeVisible();
}

test('worker physics supports reference poses, live tuning, overlay, reset and repeated enable/disable without mesh reload',async({page},testInfo)=>{
  const requests=await servePhysicsFixture(page);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await load(page);
  const baseline=await page.locator('canvas').first().screenshot();
  const toggle=page.getByRole('switch',{name:'Enable soft-tissue physics'});
  await toggle.click();
  await expect(page.getByText('Physics Active',{exact:true})).toBeVisible();
  await expect(page.getByTestId('physics-telemetry')).toBeVisible();
  await setSlider(page,'Gravity strength',10);
  await setSlider(page,'Pose-following compliance',0.05);
  await setSlider(page,'Tissue compliance',0.005);
  await setSlider(page,'Damping',8);
  await expect.poll(async()=>parseFloat(await metric(page,'Maximum simulated displacement'))).toBeGreaterThan(0);
  const simulated=await page.locator('canvas').first().screenshot();
  expect(simulated.equals(baseline)).toBe(false);
  await testInfo.attach('kinematic-face',{body:baseline,contentType:'image/png'});
  await testInfo.attach('simulated-face',{body:simulated,contentType:'image/png'});
  for(const [label,id,pose] of [['Expressions / Emotions','expression-smile','Smile'],['Phoneme','phoneme-aa','AA'],['Phoneme','phoneme-neutral','neutral']]) {
    await page.getByRole('combobox',{name:label,exact:true}).selectOption(id);
    await expect(page.getByText(new RegExp(`Current Pose: ${pose} \\| Frame:`))).toBeVisible();
    await expect(page.getByTestId('physics-telemetry')).toBeVisible();
  }
  await page.getByTestId('physics-debug-toggle').click();
  await expect(page.getByTestId('physics-debug-legend')).toContainText('Skull-attached');
  await expect(page.getByLabel('Max displacement (right axis, face extents)')).toBeChecked();
  await page.getByRole('button',{name:'Reset simulation',exact:true}).click();
  await expect.poll(()=>metric(page,'Non-finite resets')).toBe('0');
  await page.getByLabel('Enable keyboard mode').check();await page.locator('canvas').first().click();await page.keyboard.press('a');
  await expect(page.getByText(/Current Pose: AA \| Frame:/)).toBeVisible();
  await setSlider(page,'AU 12 Smile',0.5);
  await expect(page.getByText(/Current Pose: Slider Mix \| Frame:/)).toBeVisible();
  for(let cycle=0;cycle<2;cycle++) {
    await toggle.click();
    await expect(page.getByTestId('physics-telemetry')).toHaveCount(0);
    await expect.poll(()=>page.evaluate(()=>((window as unknown as {__physicsWorkers:{active:number}}).__physicsWorkers.active))).toBe(0);
    await toggle.click();await expect(page.getByText('Physics Active',{exact:true})).toBeVisible();
  }
  expect(requests.mesh).toBe(1);expect(requests.proxy).toBe(1);
  expect(errors).toEqual([]);
  await page.goto('about:blank'); // Worker lifetime must end with its document.
});
test('falls back when workers are unavailable and continues reporting finite telemetry',async({page})=>{
  await servePhysicsFixture(page,false,true);
  await load(page);await page.getByRole('switch',{name:'Enable soft-tissue physics'}).click();
  await expect(page.getByText('Physics Fallback',{exact:true})).toBeVisible();
  await expect(page.getByTestId('physics-telemetry')).toBeVisible();
  await expect.poll(async()=>parseFloat(await metric(page,'Effective simulation rate'))).toBeGreaterThan(0);
  await expect(page.getByTestId('physics-telemetry')).not.toContainText(/NaN|Infinity/);
});
test('reports a mismatched proxy and keeps the kinematic controls usable',async({page})=>{
  await servePhysicsFixture(page,true);await load(page);
  await page.getByRole('switch',{name:'Enable soft-tissue physics'}).click();
  await expect(page.getByText('Simulation asset does not match the render face mesh',{exact:true})).toBeVisible();
  await expect(page.getByTestId('physics-telemetry')).toHaveCount(0);
  await page.getByLabel('Expressions / Emotions').selectOption('expression-smile');
  await expect(page.getByText(/Current Pose: Smile \| Frame:/)).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>((window as unknown as {__physicsWorkers:{created:number}}).__physicsWorkers.created))).toBe(0);
});
