import ProjectFooter from '@/components/footer/project-footer';
import { appConfig } from '@/config/env';
import {
  ControlPanelRegion,
  DashboardHeader,
  DeformationCurveRegion,
  LiveReadoutRegion,
  ViewportRegion,
} from '@/layout/dashboard-regions';

export default function DashboardLayout() {
  return (
    <main
      className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 lg:px-8"
      aria-labelledby="app-title"
    >
      <div className="mx-auto grid w-full max-w-[90rem] gap-5">
        <DashboardHeader config={appConfig} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="grid min-w-0 gap-5">
            <ViewportRegion config={appConfig} />
            <DeformationCurveRegion />
          </div>
          <aside className="grid content-start gap-5">
            <ControlPanelRegion config={appConfig} />
            <LiveReadoutRegion />
          </aside>
        </div>

        <ProjectFooter />
      </div>
    </main>
  );
}
