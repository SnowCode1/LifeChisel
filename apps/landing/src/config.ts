/**
 * Where the page's links go: the page's only settings. Hosting is not chosen
 * yet; `/app/` assumes the web app is served under the same site. In
 * development it is the web app's own development server.
 */
export const APP_URL = import.meta.env.DEV ? 'http://localhost:5173/' : '/app/';

/**
 * Store listings. Empty until the apps are published; the iPhone and Android
 * links point at the page's closing section until then.
 */
export const STORE_URLS = { ios: '', android: '' };
