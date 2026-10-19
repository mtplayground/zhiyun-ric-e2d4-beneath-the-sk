import { afterEach, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import PhysicsControlPanel from './physics-control-panel';
import { usePhysicsState } from '@/state/physics-state';
const initial=usePhysicsState.getState();
afterEach(()=>usePhysicsState.setState(initial));
it('exposes SI gravity, separate pose stiffness, edge stiffness and damping with retuned defaults',()=>{
  const html=renderToStaticMarkup(<PhysicsControlPanel />).replace(/<!--.*?-->/g,'');
  for(const text of ['Gravity','9.81 m/s²','Skin pose stiffness','Inner-layer pose stiffness','Edge stiffness','50 N/m','50,000 N/m','10,000 N/m','12.0 s⁻¹']) expect(html).toContain(text);
  expect((html.match(/type="range"/g)??[]).length).toBe(5);
  expect(html).not.toMatch(/jaw|skull|compliance|×/i);
});
