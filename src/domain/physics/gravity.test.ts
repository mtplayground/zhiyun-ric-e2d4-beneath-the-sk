import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { gravityFromMetadata } from './gravity';
it('converts SI acceleration along the full signed recorded vertical vector',()=>{
  const metadata={normalization:{scale:200},units:{metresPerSourceUnit:0.001,verticalAxis:[0,0.6,-0.8]}};
  const gravity=gravityFromMetadata(metadata);
  expect(gravity[0]).toBe(0);expect(gravity[1]).toBeCloseTo(-29.43);expect(gravity[2]).toBeCloseTo(39.24);
  expect(Math.hypot(...gravity)*0.2).toBeCloseTo(9.81);
});

it('uses the exact recorded FaceCap scale and signed vertical axis without an assumed local up',()=>{
  const bytes=readFileSync(new URL('../../../public/data/facecap-soft-tissue.bin',import.meta.url));
  const metadata=JSON.parse(bytes.toString('utf8',8,8+bytes.readUInt32LE(4)));
  const gravity=gravityFromMetadata(metadata);
  const metresPerProxy=metadata.units.metresPerSourceUnit*metadata.normalization.scale;
  gravity.forEach((value,axis)=>expect(value*metresPerProxy).toBeCloseTo(-9.81*metadata.units.verticalAxis[axis],12));
  expect(Math.hypot(...gravity)*metresPerProxy).toBeCloseTo(9.81,12);
});
