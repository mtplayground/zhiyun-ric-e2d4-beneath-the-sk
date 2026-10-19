import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhysicsTelemetryReadout } from './live-numeric-readout';
import { toChartData, createChartOptions } from './deformation-curve-panel';

it('shows solver telemetry with units and the numerical reset count',()=>{
  const html=renderToStaticMarkup(<PhysicsTelemetryReadout telemetry={{solverTimeMs:2.5,simulationRateHz:59.9,maxDisplacement:0.125,meanPoseError:0.01,nonFiniteResets:3,nodePoseDistancesMetres:new Float64Array([0.125,0.01])}} />);
  for(const text of ['Solver time / step','2.50 ms','59.9 Hz','0.12500 m', '0.125000 m', 'Pose distance node index','Mean pose-following error (all nodes)','Non-finite resets']) expect(html).toContain(text);
});
it('plots activation energy and displacement on distinct scales with missing-data gaps',()=>{
  expect(toChartData([{frameIndex:1,energy:0.5,displacement:null},{frameIndex:2,energy:0.5,displacement:0.0123}])).toEqual([[1,2],[0.5,0.5],[null,0.0123]]);
  const options=createChartOptions(400);
  expect(options.series[2].scale).toBe('displacement');
  expect(options.scales?.y.range).toEqual([0,1]);
  expect(options.series[2].spanGaps).toBe(false);
});

it('shows an explicit unavailable state for an empty node sample',()=>{
  const html=renderToStaticMarkup(<PhysicsTelemetryReadout telemetry={{solverTimeMs:0,simulationRateHz:0,maxDisplacement:0,meanPoseError:0,nonFiniteResets:0,nodePoseDistancesMetres:new Float64Array()}} />);
  expect(html).toContain('No node sample');
  expect(html).not.toMatch(/NaN|Infinity/);
});
