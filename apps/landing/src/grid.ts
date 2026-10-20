/**
 * The decorative habit grid beside "See your whole week at a glance", drawn
 * from fictional habits and dated so the rightmost column is always the
 * visitor's Today. Hidden from screen readers: the text beside it says what it
 * shows.
 */
type Value = number | string | null;
type Habit = {
  name: string;
  sub: string;
  colour: string;
  kind: 'check' | 'number' | 'text';
  goal?: number;
  /** Oldest first; the last value is Today. For checkboxes 1 is ticked, 0 open and 'x' missed. */
  values: Value[];
};

const HABITS: Habit[] = [
  {
    name: 'Go for a walk',
    sub: 'Every day',
    colour: '#49de78',
    kind: 'check',
    values: [1, 1, 'x', 1, 1, 1, 1, 1],
  },
  {
    name: 'Read',
    sub: 'At least 20 min',
    colour: '#bda5ff',
    kind: 'number',
    goal: 20,
    values: [45, null, 20, 35, 12, 40, 30, 25],
  },
  {
    name: 'Stretch',
    sub: 'Mon, Wed, Fri',
    colour: '#fdbe45',
    kind: 'check',
    values: [1, 0, 0, 1, 0, 'x', 0, 1],
  },
  {
    name: 'Workout',
    sub: 'Run, gym or swim',
    colour: '#2bdbbe',
    kind: 'text',
    values: ['', 'Gym', 'Run', '', 'Swim', 'Run', 'Gym', ''],
  },
  {
    name: 'Water',
    sub: 'Glasses',
    colour: '#7db8ff',
    kind: 'number',
    values: [8, 7, 8, 5, 8, 7, 9, 4],
  },
  {
    name: 'Wind down',
    sub: 'Every evening',
    colour: '#ff8fa3',
    kind: 'check',
    values: ['x', 1, 1, 1, 1, 'x', 1, 0],
  },
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function cellHtml(habit: Habit, values: Value[], index: number): string {
  const value = values[index];
  const classes = ['cell'];
  if (index === values.length - 1) classes.push('today');
  let inner = '';
  if (habit.kind === 'check') {
    if (value === 1) {
      inner = '<span class="box on"></span>';
      if (values[index - 1] === 1) classes.push('jl');
      if (values[index + 1] === 1) classes.push('jr');
    } else if (value === 'x') inner = '<span class="cross"></span>';
    else inner = '<span class="box"></span>';
  } else {
    const blank = value === null || value === '';
    if (blank) classes.push('blank');
    else if (habit.goal !== undefined && Number(value) >= habit.goal)
      classes.push('met');
    inner = `<span class="val">${blank ? '–' : value}</span>`;
  }
  return `<span class="${classes.join(' ')}">${inner}</span>`;
}

export function renderGrids(today = new Date()): void {
  for (const element of document.querySelectorAll<HTMLElement>('[data-grid]')) {
    const count = Number(element.dataset.grid);
    const heads = [];
    for (let back = count - 1; back >= 0; back--) {
      const date = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - back,
      );
      heads.push(
        `<span class="head${back === 0 ? ' today' : ''}"><small>${back === 0 ? 'Today' : WEEKDAYS[date.getDay()]}</small>${date.getDate()}</span>`,
      );
    }
    const rows = HABITS.map((habit) => {
      const values = habit.values.slice(-count);
      const cells = values
        .map((_, index) => cellHtml(habit, values, index))
        .join('');
      return `<div class="row" style="--c: ${habit.colour}"><span class="name"><b>${habit.name}</b><small>${habit.sub}</small></span>${cells}</div>`;
    });
    element.style.setProperty('--days', String(count));
    element.innerHTML = `<div class="row heads"><span></span>${heads.join('')}</div>${rows.join('')}`;
  }
  const month = today.toLocaleString('en', { month: 'long', year: 'numeric' });
  for (const element of document.querySelectorAll('[data-month]'))
    element.textContent = month;
}
