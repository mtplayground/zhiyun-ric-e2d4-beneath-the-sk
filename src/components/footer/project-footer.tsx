const authors = 'Zhiyun Peng, Michael Tao, Eugene Fiume';

export default function ProjectFooter() {
  return (
    <footer className="border-t border-border pt-5 text-sm text-muted-foreground">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.45fr)] lg:items-start">
        <div className="grid gap-2">
          <p className="font-mono text-xs uppercase text-telemetry-cyan">
            Citation
          </p>
          <p className="leading-6">
            <cite className="not-italic text-foreground">
              {authors}. Beneath the Skin.
            </cite>{' '}
            Research project citation; formal publication metadata pending.
          </p>
        </div>

        <div className="grid gap-2">
          <p className="font-mono text-xs uppercase text-telemetry-cyan">
            Credits
          </p>
          <p className="leading-6">
            Beneath the Skin research project by {authors}. Interactive
            dashboard interface for facial deformation inspection and telemetry
            review.
          </p>
        </div>
      </div>
    </footer>
  );
}
