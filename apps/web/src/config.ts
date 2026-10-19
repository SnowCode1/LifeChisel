/**
 * Where the OnPurpose brand links: the landing page, at the site root with
 * this app under `/app/` (docs/WEB.md, Hosting). In development it is the
 * landing page's own development server.
 */
export const LANDING_URL = import.meta.env.DEV ? 'http://localhost:5175/' : '/';
