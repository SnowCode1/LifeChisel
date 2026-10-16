/**
 * The example carousel: a sideways scroll-snap track that works on its own by
 * swiping or scrolling, with the name pills and arrows moving it a slide at a
 * time. The pill for the slide in view is marked pressed.
 */
export function setUpCarousel(): void {
  const track = document.querySelector<HTMLElement>('[data-carousel-track]');
  const tabs = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[data-carousel-tabs] button',
    ),
  ];
  if (!track) return;
  const slides = [...track.children] as HTMLElement[];
  let current = 0;

  const show = (index: number) => {
    const next = (index + slides.length) % slides.length;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollTo({
      left: slides[next].offsetLeft - track.offsetLeft,
      behavior: reduce ? 'auto' : 'smooth',
    });
  };
  // The track takes the height of the slide in view, so a short example
  // leaves no gap before the next section.
  const fit = () => {
    track.style.height = `${slides[current].offsetHeight}px`;
  };
  const mark = (index: number) => {
    current = index;
    tabs.forEach((tab, i) =>
      tab.setAttribute('aria-pressed', String(i === index)),
    );
    fit();
  };
  new ResizeObserver(fit).observe(slides[0]);

  tabs.forEach((tab, index) =>
    tab.addEventListener('click', () => show(index)),
  );
  document
    .querySelector('[data-carousel="prev"]')
    ?.addEventListener('click', () => show(current - 1));
  document
    .querySelector('[data-carousel="next"]')
    ?.addEventListener('click', () => show(current + 1));
  track.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') show(current + 1);
    else if (event.key === 'ArrowLeft') show(current - 1);
    else return;
    event.preventDefault();
  });

  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting)
          mark(slides.indexOf(entry.target as HTMLElement));
    },
    { root: track, threshold: 0.6 },
  );
  slides.forEach((slide) => seen.observe(slide));
}
