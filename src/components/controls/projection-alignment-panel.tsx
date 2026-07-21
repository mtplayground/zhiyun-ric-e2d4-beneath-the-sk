import type { ProjectionAlignmentConfig } from '@/config/env';

type ProjectionAlignmentPanelProps = {
  value: ProjectionAlignmentConfig;
  onChange: (value: ProjectionAlignmentConfig) => void;
  onReset: () => void;
};

type SliderSpec = {
  key: keyof ProjectionAlignmentConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
};

const sliderSpecs: SliderSpec[] = [
  { key: 'offsetX', label: 'Offset X', min: -0.35, max: 0.35, step: 0.005 },
  { key: 'offsetY', label: 'Offset Y', min: -0.35, max: 0.35, step: 0.005 },
  { key: 'scale', label: 'Scale', min: 0.65, max: 1.35, step: 0.005 },
  {
    key: 'rotationYDegrees',
    label: 'Vertical Rotation',
    min: -35,
    max: 35,
    step: 0.5,
    unit: '°',
  },
];

function formatValue(value: number, unit = '') {
  return `${value.toFixed(unit ? 1 : 3)}${unit}`;
}

export default function ProjectionAlignmentPanel({
  value,
  onChange,
  onReset,
}: ProjectionAlignmentPanelProps) {
  return (
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-sm font-medium">Projection Alignment</p>
          <p className="font-mono text-xs text-muted-foreground">
            Offset {value.offsetX.toFixed(3)}, {value.offsetY.toFixed(3)} |
            Scale {value.scale.toFixed(3)} | Y{' '}
            {value.rotationYDegrees.toFixed(1)}°
          </p>
        </div>
        <button
          type="button"
          className="rounded-sm border border-border px-2 py-1 font-mono text-[0.68rem] uppercase leading-none text-muted-foreground hover:text-foreground"
          onClick={onReset}
        >
          Reset
        </button>
      </div>

      <div className="grid gap-3">
        {sliderSpecs.map((slider) => {
          const sliderValue = value[slider.key];

          return (
            <label key={slider.key} className="grid min-w-0 gap-1.5">
              <span className="flex min-w-0 items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-foreground">
                  {slider.label}
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatValue(sliderValue, slider.unit)}
                </span>
              </span>
              <input
                aria-label={`Projection ${slider.label}`}
                type="range"
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={sliderValue}
                className="h-2 w-full cursor-pointer accent-telemetry-cyan"
                onChange={(event) => {
                  onChange({
                    ...value,
                    [slider.key]: Number.parseFloat(event.target.value),
                  });
                }}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
