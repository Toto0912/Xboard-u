import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import '@/i18n';
import '@/index.css';
import { applyTheme, useThemeStore } from '@/stores/useThemeStore';

applyTheme(useThemeStore.getState().mode);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
