import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { ErrorBoundary, RouteErrorFallback } from '@/components/ui/error-boundary';
import { PageLoader } from '@/components/ui/page-loader';
import { ToastContainer } from '@/components/ui/toast';

// Lazy load all page components
const DashboardPage = lazy(() =>
  import('@/pages/dashboard').then((m) => ({ default: m.DashboardPage }))
);
const GuidelinesPage = lazy(() =>
  import('@/pages/guidelines').then((m) => ({ default: m.GuidelinesPage }))
);
const KnowledgePage = lazy(() =>
  import('@/pages/knowledge').then((m) => ({ default: m.KnowledgePage }))
);
const ToolsPage = lazy(() => import('@/pages/tools').then((m) => ({ default: m.ToolsPage })));
const ExperiencesPage = lazy(() =>
  import('@/pages/experiences').then((m) => ({ default: m.ExperiencesPage }))
);
const SessionsPage = lazy(() =>
  import('@/pages/sessions').then((m) => ({ default: m.SessionsPage }))
);
const TranscriptsPage = lazy(() =>
  import('@/pages/transcripts').then((m) => ({ default: m.TranscriptsPage }))
);
const ProjectorPage = lazy(() =>
  import('@/pages/projector').then((m) => ({ default: m.ProjectorPage }))
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    errorElement: <RouteErrorFallback />,
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<PageLoader />}>
            <DashboardPage />
          </Suspense>
        ),
      },
      {
        path: 'guidelines',
        element: (
          <Suspense fallback={<PageLoader />}>
            <GuidelinesPage />
          </Suspense>
        ),
      },
      {
        path: 'knowledge',
        element: (
          <Suspense fallback={<PageLoader />}>
            <KnowledgePage />
          </Suspense>
        ),
      },
      {
        path: 'tools',
        element: (
          <Suspense fallback={<PageLoader />}>
            <ToolsPage />
          </Suspense>
        ),
      },
      {
        path: 'experiences',
        element: (
          <Suspense fallback={<PageLoader />}>
            <ExperiencesPage />
          </Suspense>
        ),
      },
      {
        path: 'sessions',
        element: (
          <Suspense fallback={<PageLoader />}>
            <SessionsPage />
          </Suspense>
        ),
      },
      {
        path: 'transcripts',
        element: (
          <Suspense fallback={<PageLoader />}>
            <TranscriptsPage />
          </Suspense>
        ),
      },
      {
        path: 'projector',
        element: (
          <Suspense fallback={<PageLoader />}>
            <ProjectorPage />
          </Suspense>
        ),
      },
    ],
  },
]);

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ToastContainer />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
