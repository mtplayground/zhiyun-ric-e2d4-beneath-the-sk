import { describe, expect, it } from 'vitest';
import { metresToProxyUnits, metresPerSecondSquaredToProxyUnits, validatePhysicalUnits } from './physical-units';

describe('physical unit conversions', () => {
  const metadata={normalization:{scale:200},units:{metresPerSourceUnit:0.001,verticalAxis:[0,0,-1]}};
  it('combines source metres and proxy normalization exactly once, preserving signs', () => {
    expect(metresToProxyUnits(0.01,metadata)).toBeCloseTo(0.05);
    expect(metresPerSecondSquaredToProxyUnits(-9.81,metadata)).toBeCloseTo(-49.05);
    expect(metresToProxyUnits(0,metadata)).toBe(0);
  });
  it('rejects absent, invalid or non-unit metadata and non-finite quantities', () => {
    for(const scale of [0,-1,NaN,Infinity]) {
      expect(()=>validatePhysicalUnits({...metadata,normalization:{scale}})).toThrow();
      expect(()=>validatePhysicalUnits({...metadata,units:{...metadata.units,metresPerSourceUnit:scale}})).toThrow();
    }
    for(const verticalAxis of [[0,0,0],[0,2,0],[NaN,0,1],[1,0]]) {
      expect(()=>validatePhysicalUnits({...metadata,units:{...metadata.units,verticalAxis}})).toThrow();
    }
    expect(()=>metresToProxyUnits(Infinity,metadata)).toThrow();
  });
});
