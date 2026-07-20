import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DataPanel,
  DataPanelBody,
  DataPanelHeader,
  DataPanelTitle,
} from '@/components/ui/data-panel';

export default function App() {
  return (
    <main
      className="min-h-screen bg-background px-6 py-8 text-foreground"
      aria-labelledby="app-title"
    >
      <div className="mx-auto grid w-full max-w-5xl gap-5">
        <Card>
          <CardHeader>
            <CardDescription>Research dashboard shell</CardDescription>
            <CardTitle id="app-title" className="text-2xl normal-case">
              Beneath the Skin
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Tailwind, shadcn/ui conventions, and shared dashboard primitives are
            ready for feature modules.
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <DataPanel tone="cyan">
            <DataPanelHeader>
              <DataPanelTitle>Viewport</DataPanelTitle>
            </DataPanelHeader>
            <DataPanelBody className="text-2xl font-semibold">
              Idle
            </DataPanelBody>
          </DataPanel>
          <DataPanel tone="green">
            <DataPanelHeader>
              <DataPanelTitle>Controls</DataPanelTitle>
            </DataPanelHeader>
            <DataPanelBody className="text-2xl font-semibold">
              Ready
            </DataPanelBody>
          </DataPanel>
          <DataPanel tone="amber">
            <DataPanelHeader>
              <DataPanelTitle>Telemetry</DataPanelTitle>
            </DataPanelHeader>
            <DataPanelBody className="text-2xl font-semibold">
              0.00
            </DataPanelBody>
          </DataPanel>
        </div>
      </div>
    </main>
  );
}
