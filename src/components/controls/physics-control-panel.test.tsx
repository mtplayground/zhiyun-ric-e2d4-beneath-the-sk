import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import PhysicsControlPanel from './physics-control-panel';
import { usePhysicsState } from '@/state/physics-state';
import { usePhysicsTelemetry } from '@/state/physics-telemetry-state';
// SSR normally reads Zustand's immutable initial snapshot. These component
// cases intentionally render the current runtime snapshot, as a browser does.
vi.mock('@/state/physics-state',async importOriginal=>{
  const actual=await importOriginal<typeof import('@/state/physics-state')>();
  return {...actual,usePhysicsState:Object.assign((select:(state:ReturnType<typeof actual.usePhysicsState.getState>)=>unknown)=>select(actual.usePhysicsState.getState()),actual.usePhysicsState)};
});
vi.mock('@/state/physics-telemetry-state',async importOriginal=>{
  const actual=await importOriginal<typeof import('@/state/physics-telemetry-state')>();
  return {...actual,usePhysicsTelemetry:Object.assign((select:(state:ReturnType<typeof actual.usePhysicsTelemetry.getState>)=>unknown)=>select(actual.usePhysicsTelemetry.getState()),actual.usePhysicsTelemetry)};
});
const initial=usePhysicsState.getState();
afterEach(()=>{usePhysicsState.setState(initial);usePhysicsTelemetry.getState().clear();vi.restoreAllMocks();});
it('exposes SI gravity, separate pose stiffness, edge stiffness and damping with retuned defaults',()=>{
  const html=renderToStaticMarkup(<PhysicsControlPanel />).replace(/<!--.*?-->/g,'');
  for(const text of ['Gravity','9.81 m/s²','Skin pose stiffness','Inner-layer pose stiffness','Edge stiffness','50 N/m','50,000 N/m','10,000 N/m','12.0 s⁻¹']) expect(html).toContain(text);
  expect((html.match(/type="range"/g)??[]).length).toBe(5);
  expect(html).not.toMatch(/jaw|skull|compliance|×/i);
});

it('shows actual backend readiness and the inactive reason rather than the requested toggle state',()=>{
  initial.setEnabled(true);
  const telemetry=usePhysicsTelemetry.getState();
  for(const reason of ['Starting physics','Invalid or mismatched proxy asset','Missing face mesh','Worker startup failure']) {
    telemetry.inactive(reason);
    const html=renderToStaticMarkup(<PhysicsControlPanel />);
    expect(html).toContain(`Inactive · ${reason}`);
    expect(html).toContain('aria-checked="false"');
    expect(html).not.toContain('>On</button>');
  }
  for(const [code,label] of [['worker','worker'],['fallback','main-thread fallback']] as const) {
    telemetry.diagnose({code,message:'Ready'});
    const html=renderToStaticMarkup(<PhysicsControlPanel />);
    expect(html).toContain(`Active · ${label}`);
    expect(html).toContain('aria-checked="true"');
  }
  initial.setEnabled(false);
  expect(renderToStaticMarkup(<PhysicsControlPanel />)).toContain('Inactive · Physics disabled');
});
