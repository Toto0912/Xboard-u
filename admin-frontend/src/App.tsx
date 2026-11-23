import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { router } from '@/router';
import { applyThemeToDocument, useUiStore } from '@/stores/ui';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ThemeSync() {
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    applyThemeToDocument(theme);
    if (theme !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyThemeToDocument('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeSync />
        <RouterProvider router={router} />
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
