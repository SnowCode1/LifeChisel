import '@fontsource-variable/instrument-sans';
import { setUpCarousel } from './carousel.ts';
import { APP_URL, STORE_URLS } from './config.ts';
import { renderGrids } from './grid.ts';
import { setUpStats } from './stats.ts';
import './styles.css';

for (const link of document.querySelectorAll<HTMLAnchorElement>(
  'a[data-app-link]',
))
  link.href = APP_URL;
for (const link of document.querySelectorAll<HTMLAnchorElement>(
  'a[data-store]',
)) {
  const url = STORE_URLS[link.dataset.store as keyof typeof STORE_URLS];
  if (url) link.href = url;
}

const year = document.querySelector('[data-year]');
if (year) year.textContent = String(new Date().getFullYear());

renderGrids();
setUpCarousel();
setUpStats();
