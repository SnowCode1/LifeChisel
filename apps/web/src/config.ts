/**
 * Where the OnPurpose brand links: the landing page. Hosting is not chosen
 * yet; `/` assumes the landing page is the site root and this app is served
 * under it (see docs/LANDING.md). In development it is the landing page's own
 * development server.
 */
export const LANDING_URL = import.meta.env.DEV ? 'http://localhost:5175/' : '/';
