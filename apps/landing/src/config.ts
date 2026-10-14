/**
 * Where "Open the web app" points: the only setting the page has. Hosting is
 * not chosen yet; `/app/` assumes the web app is served under the same site.
 * In development it is the web app's own development server.
 */
export const APP_URL = import.meta.env.DEV ? 'http://localhost:5173/' : '/app/';
