import { defineConfig } from 'vite';

// A static page: plain HTML and CSS, no framework. Port 5175 keeps it clear of
// the web app's development server (5173).
export default defineConfig({
  server: { port: 5175 },
  preview: { port: 4175 },
});
