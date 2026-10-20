/**
 * The statistics example: a year of fictional reading minutes, ending on the
 * visitor's Today, shown the way the apps' statistics screen shows it (range
 * tabs, headline, tiles, six charts with one reading line). Every figure is
 * worked out from the generated days, so the tiles and charts always agree.
 * It is a demonstration only; the apps' real calculations live in core.
 */
type Day = {
  date: Date;
  value: number | null;
  hour: number | null;
  met: boolean;
};
type Run = { start: number; end: number; length: number };
type ChartId =
  'totals' | 'success' | 'streaks' | 'calendar' | 'weekday' | 'time';

const GOAL = 20;
const HISTORY_DAYS = 365;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MET = '#bda5ff';
const MISSED = '#5b4f7d';

const CHARTS: { id: ChartId; name: string; help: string }[] = [
  {
    id: 'totals',
    name: 'Daily totals',
    help: 'One bar per day, in the habit colour when the day met the goal and faded when it did not. The dashed line is the goal. Over a year, each bar is a week’s average per day, brighter when more of its days met the goal.',
  },
  {
    id: 'success',
    name: 'Success over time',
    help: 'The faint columns show the share of each week’s days that met the goal. The line is a smoothed trend that weighs about two weeks either side of each day, so one off day doesn’t swing it.',
  },
  {
    id: 'streaks',
    name: 'Streaks',
    help: 'Each bar is a run of successful days, so a 5-day streak and a 50-day streak are easy to compare. The brightest one is still going.',
  },
  {
    id: 'calendar',
    name: 'Calendar',
    help: 'Each day in the colour of its result, with the amount recorded. In the app you can tap a day to edit its entry.',
  },
  {
    id: 'weekday',
    name: 'By day of the week',
    help: 'The share of each weekday in this range that met the goal.',
  },
  {
    id: 'time',
    name: 'Time of day',
    help: 'When entries were recorded, by hour of the day.',
  },
];

const short = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const full = (d: Date) => `${WEEKDAYS[d.getDay()]} ${short(d)}`;
const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);
const hourName = (h: number) =>
  `${h % 12 === 0 ? 12 : h % 12} ${h % 24 < 12 ? 'am' : 'pm'}`;

/** Blends the faded and full habit colour by `t` (0–1). */
function shade(t: number): string {
  const from = [0x2b, 0x25, 0x40];
  const to = [0xbd, 0xa5, 0xff];
  return `rgb(${from.map((x, i) => Math.round(x + (to[i] - x) * t)).join(',')})`;
}

function makeHistory(today: Date): Day[] {
  let seed = 11;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const history: Day[] = [];
  for (let back = HISTORY_DAYS - 1; back >= 0; back--) {
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - back,
    );
    const progress = (HISTORY_DAYS - 1 - back) / (HISTORY_DAYS - 1);
    let value: number | null = null;
    let hour: number | null = null;
    if (random() >= 0.24 - 0.14 * progress) {
      let base = 13 + 14 * progress + (random() * 26 - 9);
      if (date.getDay() === 0) base += 10;
      value = Math.max(5, Math.round(base / 5) * 5);
      const when = random();
      hour =
        when < 0.62
          ? random() < 0.55
            ? 21
            : 22
          : when < 0.8
            ? 7
            : 12 + Math.floor(random() * 8);
    }
    if (back === 0) {
      value = 25;
      hour = 8;
    }
    history.push({ date, value, hour, met: value !== null && value >= GOAL });
  }
  return history;
}

function findRuns(history: Day[]): Run[] {
  const runs: Run[] = [];
  let start = -1;
  for (let i = 0; i <= history.length; i++) {
    const met = i < history.length && history[i].met;
    if (met && start < 0) start = i;
    if (!met && start >= 0) {
      runs.push({ start, end: i - 1, length: i - start });
      start = -1;
    }
  }
  return runs;
}

export function setUpStats(today = new Date()): void {
  const found = document.querySelector<HTMLElement>('[data-stats]');
  if (!found) return;
  const root: HTMLElement = found;
  const history = makeHistory(today);
  const runs = findRuns(history);
  const N = history.length;
  const last = runs[runs.length - 1];
  const currentStreak = last && last.end === N - 1 ? last.length : 0;
  const longestStreak = Math.max(0, ...runs.map((r) => r.length));
  const state = {
    range: 30,
    chart: 'totals' as ChartId,
    selected: null as number | null,
  };

  function render(): void {
    const W = state.range;
    const base = N - W;
    const view = history.slice(base);
    const metDays = view.filter((d) => d.met).length;
    const total = view.reduce((sum, d) => sum + (d.value ?? 0), 0);
    const best = view.reduce<Day | null>(
      (b, d) => (d.value !== null && (!b || d.value >= (b.value ?? 0)) ? d : b),
      null,
    );

    // Daily totals: a bar per day up to 90 days, a week's average per day for a year.
    type Bar = { value: number; fill: string; label: string };
    const bars: Bar[] = [];
    if (W <= 90) {
      for (const d of view)
        bars.push({
          value: d.value ?? 0,
          fill: d.met ? MET : MISSED,
          label: `${full(d.date)} · ${d.value === null ? 'nothing recorded' : `${d.value} min, ${d.met ? 'goal met' : 'below the goal'}`}`,
        });
    } else {
      for (let end = W; end >= 7; end -= 7) {
        const week = view.slice(end - 7, end);
        const average = Math.round(
          week.reduce((s, d) => s + (d.value ?? 0), 0) / 7,
        );
        const met = week.filter((d) => d.met).length;
        bars.unshift({
          value: average,
          fill: shade(0.25 + 0.75 * (met / 7)),
          label: `Week of ${short(week[0].date)} · ${average} min a day, goal met on ${met} of 7 days`,
        });
      }
    }
    const top = 10 * Math.ceil(Math.max(60, ...bars.map((b) => b.value)) / 10);
    const selected =
      state.chart === 'totals' &&
      state.selected !== null &&
      state.selected < bars.length
        ? state.selected
        : null;
    const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
    const axis = (labels: [number, string][]) =>
      labels
        .map(
          ([at, text]) =>
            `<i class="gridline" style="top:${pct(at)}"></i><span class="ylabel" style="top:${pct(at)}">${text}</span>`,
        )
        .join('');
    const xLabels = `<div class="xlabels"><span>${short(view[0].date)}</span><span>Today</span></div>`;

    let chart = '';
    let reading = '';
    if (state.chart === 'totals') {
      const goalAt = 1 - GOAL / top;
      chart = `<div class="plot">${axis([
        [0, String(top)],
        [goalAt, String(GOAL)],
        [1, '0'],
      ])}<i class="goal" style="top:${pct(goalAt)}"></i>${bars
        .map(
          (b, i) =>
            `<button type="button" class="slot${i === selected ? ' selected' : ''}" data-select="${i}" style="left:${pct(i / bars.length)};width:${pct(1 / bars.length)}" aria-label="${b.label}" tabindex="-1"><i style="height:${pct(b.value / top)};background:${b.fill}"></i></button>`,
        )
        .join('')}</div>${xLabels}`;
      reading =
        selected !== null
          ? bars[selected].label
          : W <= 90
            ? 'Minutes read each day. Select a bar for its value.'
            : 'Average minutes per day, by week. Select a bar for its value.';
    } else if (state.chart === 'success') {
      const columns: string[] = [];
      for (let end = W; end > 0; end -= 7) {
        const part = view.slice(Math.max(0, end - 7), end);
        const share = part.filter((d) => d.met).length / part.length;
        columns.push(
          `<i class="column" style="left:${pct(Math.max(0, end - 7) / W)};width:${pct(part.length / W)};height:${pct(share)}"></i>`,
        );
      }
      const points: string[] = [];
      let trend = 0;
      for (let i = 0; i < W; i++) {
        const at = base + i;
        let num = 0;
        let den = 0;
        for (let j = Math.max(0, at - 21); j <= Math.min(N - 1, at + 21); j++) {
          const w = Math.exp(-((j - at) ** 2) / 98);
          num += w * (history[j].met ? 1 : 0);
          den += w;
        }
        trend = num / den;
        points.push(
          `${(((i + 0.5) * 1000) / W).toFixed(1)},${(200 - trend * 200).toFixed(1)}`,
        );
      }
      chart = `<div class="plot">${axis([
        [0, '100%'],
        [0.5, '50%'],
        [1, '0%'],
      ])}${columns.join('')}<svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true"><path d="M${points.join(' L')}" /></svg></div>${xLabels}`;
      reading = `Trend now: ${Math.round(trend * 100)}% of days meet the goal`;
    } else if (state.chart === 'streaks') {
      const inView = runs.filter((r) => r.end >= base);
      const longestHere = Math.max(
        0,
        ...inView.map((r) => r.end - Math.max(r.start, base) + 1),
      );
      const bestThree = [...runs]
        .sort((a, b) => b.length - a.length)
        .slice(0, 3);
      const runTitle = (r: Run) =>
        `${days(r.length)}, ${short(history[r.start].date)} – ${short(history[r.end].date)}`;
      let timeline: string;
      if (W <= 42) {
        // One full-width row for short ranges.
        timeline = `<div class="streak-row">${inView
          .map((r) => {
            const start = Math.max(r.start, base);
            const width = (r.end - start + 1) / W;
            return `<i class="run${r.end === N - 1 ? ' ongoing' : ''}" style="left:${pct((start - base) / W)};width:${pct(width)}" title="${runTitle(r)}">${width > 0.05 ? r.length : ''}</i>`;
          })
          .join('')}</div>${xLabels}`;
      } else {
        // A row per month with days 1–31 lined up, as in the apps.
        const rows: string[] = [];
        let year = -1;
        for (let a = base; a < N;) {
          const first = history[a].date;
          let b = a;
          while (
            b + 1 < N &&
            history[b + 1].date.getMonth() === first.getMonth()
          )
            b++;
          if (first.getFullYear() !== year) {
            year = first.getFullYear();
            rows.push(`<span class="streak-year">${year}</span>`);
          }
          const monthDays = new Date(
            first.getFullYear(),
            first.getMonth() + 1,
            0,
          ).getDate();
          const parts = inView
            .filter((r) => r.end >= a && r.start <= b)
            .map((r) => {
              const s = Math.max(r.start, a);
              const e = Math.min(r.end, b);
              const width = (e - s + 1) / 31;
              const label = e === r.end && width > 0.07 ? r.length : '';
              return `<i class="run${r.end === N - 1 ? ' ongoing' : ''}" style="left:${pct((history[s].date.getDate() - 1) / 31)};width:${pct(width)}" title="${runTitle(r)}">${label}</i>`;
            })
            .join('');
          rows.push(
            `<div class="streak-month"><span>${MONTHS[first.getMonth()]}</span><div class="streak-track"><b style="width:${pct(monthDays / 31)}"></b>${parts}</div></div>`,
          );
          a = b + 1;
        }
        timeline = `<div class="streak-months">${rows.join('')}</div><div class="xlabels"><span>1</span><span>15</span><span>31</span></div>`;
      }
      chart = `${timeline}<div class="best"><span>Best streaks of all time</span>${bestThree
        .map(
          (r) =>
            `<div><b>${days(r.length)}</b><span>${short(history[r.start].date)} – ${short(history[r.end].date)}${r.end === N - 1 ? ' (ongoing)' : ''}</span></div>`,
        )
        .join('')}</div>`;
      reading = `Longest streak in this range: ${days(longestHere)}`;
    } else if (state.chart === 'calendar') {
      const lead = (view[0].date.getDay() + 6) % 7;
      const title = (d: Day) =>
        `${full(d.date)}: ${d.value === null ? 'nothing' : `${d.value} min`}`;
      if (W <= 30) {
        chart = `<div class="calendar"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>${'<i></i>'.repeat(lead)}${view
          .map(
            (d) =>
              `<i class="${d.met ? 'met' : 'missed'}" title="${title(d)}"><small>${d.date.getDate()}</small>${d.value ?? ''}</i>`,
          )
          .join('')}</div>`;
      } else {
        chart = `<div class="calendar small">${'<i></i>'.repeat(lead)}${view.map((d) => `<i class="${d.met ? 'met' : 'missed'}" title="${title(d)}"></i>`).join('')}</div>`;
      }
      reading = `${metDays} of ${W} days met the goal`;
    } else if (state.chart === 'weekday') {
      const order = [1, 2, 3, 4, 5, 6, 0];
      const shares = order.map((k) => {
        const all = view.filter((d) => d.date.getDay() === k);
        return all.length ? all.filter((d) => d.met).length / all.length : 0;
      });
      const bestIndex = shares.indexOf(Math.max(...shares));
      chart = `<div class="plot">${axis([
        [0, '100%'],
        [0.5, '50%'],
        [1, '0%'],
      ])}${shares
        .map(
          (s, i) =>
            `<span class="slot wide" style="left:${pct(i / 7)};width:${pct(1 / 7)}" title="${WEEKDAY_NAMES[order[i]]}: ${Math.round(s * 100)}%"><i style="height:${pct(s)};background:${MET}"></i></span>`,
        )
        .join(
          '',
        )}</div><div class="xlabels even">${order.map((k) => `<span>${WEEKDAYS[k]}</span>`).join('')}</div>`;
      reading = `Most successful on ${WEEKDAY_NAMES[order[bestIndex]]}s: ${Math.round(shares[bestIndex] * 100)}%`;
    } else {
      const hours = Array.from({ length: 24 }, () => 0);
      for (const d of view) if (d.hour !== null) hours[d.hour]++;
      const most = Math.max(1, ...hours);
      const peak = hours.indexOf(most);
      chart = `<div class="plot">${hours
        .map(
          (n, h) =>
            `<span class="slot" style="left:${pct(h / 24)};width:${pct(1 / 24)}" title="${hourName(h)}: ${n} entries"><i style="height:${pct(n / most)};background:${MET}"></i></span>`,
        )
        .join(
          '',
        )}</div><div class="xlabels"><span>12 am</span><span>6 am</span><span>12 pm</span><span>6 pm</span><span>12 am</span></div>`;
      reading = `Most often ${hourName(peak)}–${hourName(peak + 1)}`;
    }

    const info = CHARTS.find((c) => c.id === state.chart)!;
    const stepper =
      state.chart === 'totals'
        ? `<div class="stepper"><button type="button" class="icon-button" data-step="-1" aria-label="Previous"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg></button><button type="button" class="icon-button" data-step="1" aria-label="Next"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>${selected !== null ? '<button type="button" class="icon-button" data-clear aria-label="Clear selection"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>' : ''}</div>`
        : '';

    root.innerHTML = `
      <div class="stats-top">
        <div class="stats-habit"><b>Read</b><span>At least 20 minutes a day</span></div>
        <div class="pills" role="group" aria-label="Range">${[30, 90, 365]
          .map(
            (n) =>
              `<button type="button" class="pill" data-range="${n}" aria-pressed="${n === W}">${n === 365 ? 'Year' : `${n} days`}</button>`,
          )
          .join('')}</div>
      </div>
      <div class="stats-summary">
        <div class="headline"><span>${short(view[0].date)}${view[0].date.getFullYear() !== today.getFullYear() ? ` ${view[0].date.getFullYear()}` : ''} – ${short(view[W - 1].date)} ${view[W - 1].date.getFullYear()}</span><b>${metDays} of ${W} days</b><span>${Math.round((100 * metDays) / W)}% met the goal</span></div>
        <div class="tiles">
          <div class="tile"><span>Average per day</span><b>${Math.round(total / W)} min</b></div>
          <div class="tile"><span>Best day</span><b>${best ? `${best.value} min` : '–'}</b><small>${best ? full(best.date) : ''}</small></div>
          <div class="tile"><span>Current streak</span><b>${days(currentStreak)}</b></div>
          <div class="tile"><span>Longest streak</span><b>${days(longestStreak)}</b></div>
        </div>
      </div>
      <div class="stats-body">
        <div class="chart-list" role="group" aria-label="Charts">${CHARTS.map(
          (c) =>
            `<button type="button" data-chart="${c.id}" aria-pressed="${c.id === state.chart}">${c.name}</button>`,
        ).join(
          '',
        )}<p>Number habits can show totals, averages, highs or lows. Category and text habits add category counts and a full entry log.</p></div>
        <div class="chart">
          <h3>${info.name}</h3>
          ${chart}
          <div class="reading"><span aria-live="polite">${reading}</span>${stepper}</div>
          <details class="more"><summary>How this chart works</summary><p>${info.help}</p></details>
        </div>
      </div>`;

    const step = (dir: number) => {
      const at =
        selected === null
          ? dir < 0
            ? bars.length - 1
            : 0
          : Math.min(bars.length - 1, Math.max(0, selected + dir));
      state.selected = at;
      render();
    };
    root.querySelectorAll<HTMLButtonElement>('[data-range]').forEach((b) =>
      b.addEventListener('click', () => {
        state.range = Number(b.dataset.range);
        state.selected = null;
        render();
        root
          .querySelector<HTMLButtonElement>(`[data-range="${state.range}"]`)
          ?.focus();
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-chart]').forEach((b) =>
      b.addEventListener('click', () => {
        state.chart = b.dataset.chart as ChartId;
        state.selected = null;
        render();
        root
          .querySelector<HTMLButtonElement>(`[data-chart="${state.chart}"]`)
          ?.focus();
      }),
    );
    root.querySelectorAll<HTMLElement>('[data-select]').forEach((b) => {
      const pick = () => {
        state.selected = Number(b.dataset.select);
        render();
      };
      b.addEventListener('click', pick);
    });
    root.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) =>
      b.addEventListener('click', () => {
        step(Number(b.dataset.step));
        root
          .querySelector<HTMLButtonElement>(`[data-step="${b.dataset.step}"]`)
          ?.focus();
      }),
    );
    root.querySelector('[data-clear]')?.addEventListener('click', () => {
      state.selected = null;
      render();
    });
  }

  render();
}
