import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { z } from 'zod';
import { App } from './app/App';
import './app/app.css';

// Mensagens de validação dos formulários (mesmos schemas da API) em português.
z.config(z.locales.ptBR());

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado em index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: o service worker só é registrado em produção — em desenvolvimento ele cachearia os módulos
// do Vite e atrapalharia o hot reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
