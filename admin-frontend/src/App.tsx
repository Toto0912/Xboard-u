import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { router } from '@/router';
import { useAuthStore } from '@/stores/auth';
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

useAuthStore.subscribe((state, previous) => {
  if (state.token !== previous.token) queryClient.clear();
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
  const theme = useUiStore((s) => s.theme);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeSync />
        <RouterProvider router={router} />
        <Toaster
          richColors
          theme={theme}
          position="top-center"
          duration={2500}
          offset={{ top: 12 }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
