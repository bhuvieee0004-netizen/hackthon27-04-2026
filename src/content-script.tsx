import React from 'react';
import ReactDOM from 'react-dom/client';
import { MirrorBreakerShell } from './MirrorBreakerShell';
import './index.css';

const injectApp = () => {
  // Create a container for the shadow DOM
  const container = document.createElement('div');
  container.id = 'mirrorbreaker-root';
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.right = '0';
  container.style.zIndex = '2147483647';
  document.body.appendChild(container);

  // Create shadow root
  const shadowRoot = container.attachShadow({ mode: 'open' });

  // Create a style element for Tailwind and custom CSS
  // In a real build, Vite will output a CSS file which we'd need to inject here.
  // For this "Shell" implementation, we'll assume the CSS is injected via the manifest
  // or we can manually inject the styles into the shadow root.
  
  const styleTag = document.createElement('link');
  styleTag.rel = 'stylesheet';
  styleTag.href = chrome.runtime.getURL('assets/content.css');
  shadowRoot.appendChild(styleTag);

  // Create app container inside shadow root
  const appRoot = document.createElement('div');
  appRoot.className = 'mirrorbreaker-app-container';
  shadowRoot.appendChild(appRoot);

  // Render React app
  ReactDOM.createRoot(appRoot).render(
    <React.StrictMode>
      <MirrorBreakerShell />
    </React.StrictMode>
  );
};

// Delay slightly to ensure body exists
if (document.body) {
  injectApp();
} else {
  window.addEventListener('DOMContentLoaded', injectApp);
}
