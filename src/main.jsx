/**
 * Genesis Error - Application Entry Point
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '@ui/App';
import ErrorBoundary from '@ui/components/ErrorBoundary';

// Remove loading screen
const loadingScreen = document.getElementById('loading');
if (loadingScreen) {
  loadingScreen.style.transition = 'opacity 0.5s ease';
  loadingScreen.style.opacity = '0';
  setTimeout(() => loadingScreen.remove(), 500);
}

// Mount React app with error boundary (prevents raw stack traces in UI)
const root = createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

// Hot module replacement for development
if (module.hot) {
  module.hot.accept();
}
