
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { GlobalPlayerProvider } from './contexts/GlobalPlayerContext';
// @ts-ignore
import { registerSW } from 'virtual:pwa-register';

if ('serviceWorker' in navigator) {
  registerSW({
    onNeedRefresh() {
      console.log('Update available - keeping current version to avoid interruption.');
    },
    onOfflineReady() {
      console.log('App ready for offline use.');
    }
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <GlobalPlayerProvider>
        <App />
      </GlobalPlayerProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
