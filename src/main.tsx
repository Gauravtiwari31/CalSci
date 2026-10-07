import '@fontsource/bricolage-grotesque/400.css';
import '@fontsource/bricolage-grotesque/500.css';
import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/instrument-serif/400-italic.css';
import 'mathlive/fonts.css';
import 'mathlive/static.css';
import './app/styles.css';

import { MathfieldElement } from 'mathlive';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { isNative } from './platform';
import { useStore } from './store';

// Fonts are bundled through mathlive/fonts.css; sounds are not used.
MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void useStore.getState().init();

// §9: service worker on the web build only; native assets are already local.
if (!__NATIVE__ && !isNative() && import.meta.env.PROD && 'serviceWorker' in navigator) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}
