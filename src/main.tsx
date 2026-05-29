import * as React from 'react';
import { createRoot } from 'react-dom/client'
import posthog from 'posthog-js'
import App from './App'
import './index.css'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: 'https://eu.i.posthog.com',
    person_profiles: 'identified_only',
    // Только ручные события — никакого автозахвата
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    // Разделение окружений
    loaded: (ph) => {
      if (import.meta.env.DEV) {
        ph.opt_out_capturing();
        console.debug('[posthog] dev mode — capturing disabled');
      }
    },
  });
}

createRoot(document.getElementById("root")!).render(<App />);
