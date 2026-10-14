import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { loadEmbeddedFonts } from './lib/fonts.ts';
import './styles.css';

loadEmbeddedFonts()
  .catch((e) => console.warn('Falha ao carregar fontes', e))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
