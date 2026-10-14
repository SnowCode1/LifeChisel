import { APP_URL } from './config.ts';
import './styles.css';

for (const link of document.querySelectorAll<HTMLAnchorElement>(
  'a[data-app-link]',
))
  link.href = APP_URL;

const year = document.querySelector('[data-year]');
if (year) year.textContent = String(new Date().getFullYear());
