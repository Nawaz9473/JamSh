import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { useAuthStore } from '@jamsh/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

if (typeof window !== 'undefined') {
  (window as any).__jamsh_auth_store = useAuthStore;
  (window as any).__jamsh_query_client = queryClient;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
