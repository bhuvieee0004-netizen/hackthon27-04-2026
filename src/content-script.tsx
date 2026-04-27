import React from 'react';
import ReactDOM from 'react-dom/client';
import { MirrorBreakerShell } from './MirrorBreakerShell';
import './index.css';
import { MediaPipeEngine } from './MediaPipeEngine';

let engine: MediaPipeEngine | null = null;

const startEngine = async () => {
  if (!engine) {
    engine = new MediaPipeEngine();
    await engine.initialize();
  }
};

const findAndAttachVideo = () => {
  if (!engine) return;
  const videos = document.querySelectorAll('video');
  // Simplistic approach: find the largest playing video (or just the first one)
  let bestVideo: HTMLVideoElement | null = null;
  let maxArea = 0;
  
  videos.forEach(v => {
    if (v.readyState >= 2) { // HAVE_CURRENT_DATA or better
      const area = v.clientWidth * v.clientHeight;
      if (area > maxArea) {
        maxArea = area;
        bestVideo = v;
      }
    }
  });

  if (bestVideo) {
    const video = bestVideo as HTMLVideoElement;
    if ((window as any).updateUI) {
      (window as any).updateUI(100, ["Attached to video: " + video.clientWidth + "x" + video.clientHeight]);
    }
    engine.attachToVideo(video);
  }
};

const observeDOM = () => {
  const observer = new MutationObserver(() => {
    findAndAttachVideo();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Try periodically as well, since video dimensions can change
  setInterval(findAndAttachVideo, 2000);
};

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
  styleTag.href = chrome.runtime.getURL('assets/index.css');
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
  startEngine().then(observeDOM);
} else {
  window.addEventListener('DOMContentLoaded', () => {
    injectApp();
    startEngine().then(observeDOM);
  });
}
