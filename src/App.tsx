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
import { appConfig } from '@/config/env';

const enabledPanelCount = Object.values(appConfig.features).filter(
  Boolean,
).length;

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
            Environment-driven asset paths, provider selection, and optional
            panel flags are ready for feature modules.
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <DataPanel tone="cyan">
            <DataPanelHeader>
              <DataPanelTitle>Face Mesh</DataPanelTitle>
            </DataPanelHeader>
            <DataPanelBody className="truncate font-mono text-sm text-muted-foreground">
              {appConfig.assets.faceMeshUrl}
            </DataPanelBody>
          </DataPanel>
          <DataPanel tone="green">
            <DataPanelHeader>
              <DataPanelTitle>Provider</DataPanelTitle>
            </DataPanelHeader>
            <DataPanelBody className="font-mono text-sm">
              {appConfig.deformationProvider}
            </DataPanelBody>
          </DataPanel>
          <DataPanel tone="amber">
            <DataPanelHeader>
              <DataPanelTitle>Optional Panels</DataPanelTitle>
            </DataPanelHeader>
            <DataPanelBody className="text-2xl font-semibold">
              {enabledPanelCount}/3
            </DataPanelBody>
          </DataPanel>
        </div>
      </div>
    </main>
  );
}
