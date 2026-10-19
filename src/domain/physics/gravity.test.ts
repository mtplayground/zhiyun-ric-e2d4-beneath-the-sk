import { expect, it } from 'vitest';
import { gravityFromMetadata } from './gravity';
it('converts SI acceleration along the full signed recorded vertical vector',()=>{
  const metadata={normalization:{scale:200},units:{metresPerSourceUnit:0.001,verticalAxis:[0,0.6,-0.8]}};
  const gravity=gravityFromMetadata(metadata);
  expect(gravity[0]).toBe(0);expect(gravity[1]).toBeCloseTo(-29.43);expect(gravity[2]).toBeCloseTo(39.24);
  expect(Math.hypot(...gravity)*0.2).toBeCloseTo(9.81);
});
