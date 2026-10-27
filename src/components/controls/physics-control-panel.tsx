import { PHYSICS_SETTING_RANGES, type PhysicsPreset, type PhysicsSettings } from '@/domain/physics/physics-settings';
import { usePhysicsState } from '@/state/physics-state';
import { physicsStatusLabel, usePhysicsTelemetry } from '@/state/physics-telemetry-state';

const controls: { key: keyof PhysicsSettings; label: string; description: string; unit: string }[] = [
  { key: 'gravityAcceleration', label: 'Gravity', unit: 'm/s²', description: 'Acceleration downward along the face scene’s recorded vertical axis. Set to zero to turn gravity off.' },
  { key: 'skinPoseStiffness', label: 'Skin pose stiffness', unit: 'N/m', description: 'Higher values keep the skin closer to the expression.' },
  { key: 'innerPoseStiffness', label: 'Inner-layer pose stiffness', unit: 'N/m', description: 'Keeps the inner layer close to the expression with a stiffer, soft target.' },
  { key: 'edgeStiffness', label: 'Edge stiffness', unit: 'N/m', description: 'Higher values resist changes to the expression’s edge lengths.' },
  { key: 'damping', label: 'Damping', unit: 's⁻¹', description: 'Higher values reduce motion more quickly.' },
];
export default function PhysicsControlPanel() {
  const enabled = usePhysicsState(state => state.enabled);
  const runtimeStatus = usePhysicsTelemetry(state => state.status);
  const status = enabled ? runtimeStatus : { active: false as const, reason: 'Physics disabled' };
  const active = enabled && status.active;
  const preset = usePhysicsState(state => state.preset);
  const setPreset = usePhysicsState(state => state.setPreset);
  const settings = usePhysicsState(state => state.settings);
  const setEnabled = usePhysicsState(state => state.setEnabled);
  const setSetting = usePhysicsState(state => state.setSetting);
  const resetSimulation = usePhysicsState(state => state.resetSimulation);
  return (
    <section aria-labelledby="physics-panel-title" data-testid="physics-control-panel" className="grid gap-4 rounded-md border border-border bg-secondary/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="physics-panel-title" className="text-sm font-medium">Soft-tissue physics</h3>
        <button type="button" role="switch" aria-checked={active} aria-label="Enable soft-tissue physics" aria-describedby="physics-panel-status"
          className="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-telemetry-cyan/50"
          onClick={() => setEnabled(!enabled)}>{active ? 'On' : enabled ? 'Inactive' : 'Off'}</button>
      </div>
      <p id="physics-panel-status" data-testid="physics-panel-status" role="status" className="font-mono text-xs text-muted-foreground">{physicsStatusLabel(status)}</p>
      <div className="grid gap-1.5">
        <label htmlFor="physics-preset" className="text-xs">Physics preset</label>
        <select id="physics-preset" value={preset} aria-describedby="physics-preset-help"
          className="min-h-9 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-telemetry-cyan/50"
          onChange={event => setPreset(event.currentTarget.value as PhysicsPreset)}>
          <option value="physical">Physical (default)</option>
          <option value="visible-demonstration">Visible demonstration</option>
          <option value="custom" disabled>Custom</option>
        </select>
        <p id="physics-preset-help" className="text-xs text-muted-foreground">
          {preset === 'visible-demonstration'
            ? 'Exaggerated demonstration — not physically accurate.'
            : preset === 'physical'
              ? 'Physical SI defaults.'
              : 'Custom settings. Select a preset to restore its values.'}
        </p>
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
