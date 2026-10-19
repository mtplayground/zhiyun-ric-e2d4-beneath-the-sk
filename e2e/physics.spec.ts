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
  await setSlider(page,'Gravity',98.1);
  await setSlider(page,'Skin pose stiffness',20);
  await setSlider(page,'Edge stiffness',200);
  await setSlider(page,'Damping',8);
  await setSlider(page,'Inner-layer pose stiffness',50000);
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
  await expect(page.getByTestId('physics-debug-legend')).toContainText('Inner · label 1');
  await expect(page.getByTestId('physics-debug-legend')).not.toContainText(/attached/i);
  await page.getByRole('spinbutton',{name:'Pose distance node index'}).fill('7');
  await expect(page.getByTestId('node-pose-distance')).toContainText(' m');
  await expect(page.getByLabel('Max displacement (right axis, m)')).toBeChecked();
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

// This test intentionally does not call servePhysicsFixture or intercept GLB/proxy
// responses. A stale/failed real asset is an acceptance failure, never a skip.
test('real FaceCap: every expression, Smile and AA retain zero-gravity kinematic pixels and mesh identity',async({page},testInfo)=>{
  test.setTimeout(600_000);
  const errors:string[]=[],webglMessages:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{
    if(message.type()==='error') errors.push(message.text());
    if(/webgl|gl_invalid|context lost|shader error/i.test(message.text())&&['warning','error'].includes(message.type())) webglMessages.push(message.text());
  });
  let faceRequests=0;
  page.on('request',request=>{if(request.url().endsWith('/facecap.glb')) faceRequests++;});
  await page.goto('/');
  await expect(page.getByText(/\d+ blendshapes/)).toBeVisible({timeout:90_000});
  // Vite serves this test-only helper, resolving the same Three/R3F/store modules
  // as the application. No production test hooks or alternative renderer exist.
  const probePath='/e2e/physics-browser-probe.ts';
  const identity=await page.evaluate(async path=>{
    const probe=await import(/* @vite-ignore */ path);return probe.rememberFace();
  },probePath);
  expect(identity.vertices).toBe(2694);expect(identity.morphs).toBeGreaterThan(3);
  await setSlider(page,'Gravity',0);
  const toggle=page.getByRole('switch',{name:'Enable soft-tissue physics'});
  await toggle.click();
  await expect(page.getByText('Physics Active',{exact:true}),
    'Real FaceCap acceptance requires the generated, source-validated version 3 proxy at the full 12 mm thickness; fixtures cannot satisfy this case.').toBeVisible({timeout:30_000});
  const expressions=await page.getByRole('combobox',{name:'Expressions / Emotions',exact:true}).locator('option').evaluateAll(options=>options.map(option=>({id:(option as HTMLOptionElement).value,label:option.textContent??''})).filter(option=>option.id));
  const poses=[...expressions.map(p=>({...p,control:'Expressions / Emotions'})),{id:'phoneme-neutral',label:'Neutral',control:'Phoneme'},{id:'expression-smile',label:'Smile',control:'Expressions / Emotions'},{id:'phoneme-aa',label:'AA',control:'Phoneme'}];
  for(const pose of poses) {
    await test.step(pose.label,async()=>{
      await page.getByRole('combobox',{name:pose.control,exact:true}).selectOption(pose.id);
      await expect.poll(()=>page.evaluate(async({path,id})=>(await import(/* @vite-ignore */ path)).poseReady(id),{path:probePath,id:pose.id})).toBe(true);
      await page.getByRole('button',{name:'Reset simulation',exact:true}).click();
      await expect.poll(()=>page.evaluate(async path=>{
        const sample=(await import(/* @vite-ignore */ path)).sample();return sample.ready&&sample.finite&&sample.maxDistance<=1e-9;
      },probePath)).toBe(true);
      const sample=await page.evaluate(async path=>(await import(/* @vite-ignore */ path)).sample(),probePath);
      expect(sample.webglError).toBe(0);expect(sample.resets).toBe(0);expect(sample.boundRatio).toBeLessThanOrEqual(1);
      const simulated=await page.evaluate(async path=>(await import(/* @vite-ignore */ path)).pixels(),probePath);
      await testInfo.attach(`${pose.id}-physics`,{body:await page.locator('canvas').first().screenshot(),contentType:'image/png'});
      const active=await page.evaluate(async path=>(await import(/* @vite-ignore */ path)).integrity(true),probePath);
      expect(active).toMatchObject({sameMesh:true,sameGeometry:true,sameBase:true,sameMorphs:true,sameBytes:true,offsetAttribute:true});
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked','false');
      const intact=await page.evaluate(async path=>(await import(/* @vite-ignore */ path)).integrity(false),probePath);
      expect(intact).toMatchObject({sameMesh:true,sameGeometry:true,sameBase:true,sameMorphs:true,sameBytes:true,originalMaterial:true,cullingRestored:true,offsetAttribute:false});
      const kinematic=await page.evaluate(async path=>(await import(/* @vite-ignore */ path)).pixels(),probePath);
      await testInfo.attach(`${pose.id}-kinematic`,{body:await page.locator('canvas').first().screenshot(),contentType:'image/png'});
      let changed=0,total=0;const colors=new Set<number>();
      for(let i=0;i<kinematic.length;i+=4) {
        colors.add((kinematic[i]<<16)|(kinematic[i+1]<<8)|kinematic[i+2]);
        const diff=Math.max(...[0,1,2].map(c=>Math.abs(kinematic[i+c]-simulated[i+c])));
        if(diff>2) changed++;total+=diff;
      }
      // At most 0.1% pixels may differ by >2/255; mean max-channel error <=0.1/255.
      expect(colors.size).toBeGreaterThan(32); // an empty/background-only canvas cannot pass
      expect(changed/(kinematic.length/4)).toBeLessThanOrEqual(0.001);
      expect(total/(kinematic.length/4)).toBeLessThanOrEqual(0.1);
      expect(errors).toEqual([]);expect(webglMessages).toEqual([]);
      await toggle.click();await expect(page.getByText('Physics Active',{exact:true})).toBeVisible();
    });
  }
  expect(expressions.length).toBeGreaterThan(0);expect(faceRequests).toBe(1);
  expect(errors).toEqual([]);expect(webglMessages).toEqual([]);
});
