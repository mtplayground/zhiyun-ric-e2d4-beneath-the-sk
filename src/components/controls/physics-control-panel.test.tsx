import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import PhysicsControlPanel from './physics-control-panel';
import { ControlPanelRegion } from '@/layout/dashboard-regions';
import { loadAppConfig } from '@/config/env';

it('labels all physics controls and exposes the on/off switch and reset action', () => {
  const html=renderToStaticMarkup(<PhysicsControlPanel />);
  for(const label of ['Tissue compliance','Pose-following compliance','Damping','Gravity strength','Reset simulation']) expect(html).toContain(label);
  expect(html).toContain('role="switch"');
  expect(html.match(/type="range"/g)).toHaveLength(4);
});
it('uses the optional-panel feature flag', () => {
  const hidden=loadAppConfig({VITE_ENABLE_PRECOMPUTE_PANEL:'false'});
  expect(renderToStaticMarkup(<ControlPanelRegion config={hidden} />)).not.toContain('physics-control-panel');
  const shown=loadAppConfig({VITE_ENABLE_PRECOMPUTE_PANEL:'false',VITE_ENABLE_PHYSICS_PANEL:'true'});
  expect(renderToStaticMarkup(<ControlPanelRegion config={shown} />)).toContain('physics-control-panel');
});
