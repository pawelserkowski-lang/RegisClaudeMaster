import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './i18n';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/globals.css';

const queryClient = new QueryClient();
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary
        fallback={<div className="p-6 text-center text-emerald-100">Ups! Coś się wywaliło w matriksie.</div>}
      >
        <Suspense fallback={<div className="p-6 text-center text-emerald-100">Ładuję tłumaczenia...</div>}>
          <App />
        </Suspense>
      </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>
);
