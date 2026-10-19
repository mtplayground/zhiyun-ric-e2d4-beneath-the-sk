import { PHYSICS_SETTING_RANGES, type PhysicsSettings } from '@/domain/physics/physics-settings';
import { usePhysicsState } from '@/state/physics-state';

const controls: { key: keyof PhysicsSettings; label: string; description: string; unit: string }[] = [
  { key: 'gravityAcceleration', label: 'Gravity', unit: 'm/s²', description: 'Acceleration downward along the face scene’s recorded vertical axis. Set to zero to turn gravity off.' },
  { key: 'skinPoseStiffness', label: 'Skin pose stiffness', unit: 'N/m', description: 'Higher values keep the skin closer to the expression.' },
  { key: 'innerPoseStiffness', label: 'Inner-layer pose stiffness', unit: 'N/m', description: 'Keeps the inner layer close to the expression with a stiffer, soft target.' },
  { key: 'edgeStiffness', label: 'Edge stiffness', unit: 'N/m', description: 'Higher values resist changes to the expression’s edge lengths.' },
  { key: 'damping', label: 'Damping', unit: 's⁻¹', description: 'Higher values reduce motion more quickly.' },
];
export default function PhysicsControlPanel() {
  const enabled = usePhysicsState(state => state.enabled);
  const settings = usePhysicsState(state => state.settings);
  const setEnabled = usePhysicsState(state => state.setEnabled);
  const setSetting = usePhysicsState(state => state.setSetting);
  const resetSimulation = usePhysicsState(state => state.resetSimulation);
  return (
    <section aria-labelledby="physics-panel-title" data-testid="physics-control-panel" className="grid gap-4 rounded-md border border-border bg-secondary/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="physics-panel-title" className="text-sm font-medium">Soft-tissue physics</h3>
        <button type="button" role="switch" aria-checked={enabled} aria-label="Enable soft-tissue physics"
          className="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-telemetry-cyan/50"
          onClick={() => setEnabled(!enabled)}>{enabled ? 'On' : 'Off'}</button>
      </div>
      {controls.map(({ key, label, description, unit }) => {
        const id = `physics-${key}`;
        const value = settings[key];
        return (
          <div key={key} className="grid gap-1.5">
            <div className="flex justify-between gap-2 text-xs">
              <label htmlFor={id}>{label}</label>
              <output htmlFor={id} className="font-mono text-telemetry-cyan">{key === 'gravityAcceleration' ? value.toFixed(2) : key === 'damping' ? value.toFixed(1) : value.toLocaleString('en-US', { maximumFractionDigits: 0 })} {unit}</output>
            </div>
            <input id={id} type="range" {...PHYSICS_SETTING_RANGES[key]} value={value}
              aria-describedby={`${id}-help`} aria-valuetext={`${value} ${unit}`} className="w-full accent-cyan-400"
              onChange={event => setSetting(key, Number(event.currentTarget.value))} />
            <p id={`${id}-help`} className="text-xs text-muted-foreground">{description}</p>
          </div>
        );
      })}
      <button type="button" disabled={!enabled} onClick={resetSimulation}
        className="min-h-9 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-telemetry-cyan/50 disabled:cursor-not-allowed disabled:opacity-50">Reset simulation</button>
      <p className="text-xs text-muted-foreground">Settings apply live. Reset returns the tissue to the current pose without changing your settings.</p>
    </section>
  );
}
