import {
  chance,
  clamp,
  line,
  step,
  tick,
  type SampleDay,
  type SamplePreset,
} from './kit.ts';

const gratitude = [
  'Sam made me laugh at breakfast',
  'Warm sun on the walk home',
  'Long call with Mum',
  'A real lunch break',
  'Neighbour’s dog said hello',
  'First tomatoes on the balcony',
  'Clean sheets',
  'Rain on the window, tea in hand',
  'Dinner with Priya',
  'Fresh bread from the bakery',
  'A kind email from a colleague',
  'Said no, felt good about it',
  'Bike ride by the river',
  'The cat slept on my feet',
  'Finished a good book',
  'Quiet, early office',
  'Sea swim with Jo',
  'Made it to yoga',
] as const;
// A shared roll for the day's overall mood, so feelings and notes agree.
const brightness = (day: SampleDay) =>
  chance(day.date, 'mood') * 0.75 + day.progress * 0.35;

/** Mental wellbeing: feelings, gentle limits and a default-on checkbox. */
export const wellbeing: SamplePreset = {
  id: 'wellbeing',
  name: 'Mood & wellbeing',
  summary:
    'Looking after mental health: feelings, meditation, gratitude, screen time, alcohol-free days and fortnightly therapy.',
  habits: [
    {
      id: 'wellbeing-feelings',
      name: 'Feelings',
      type: 'categorical',
      color: '#E29CE8',
      icon: 'phosphor:smiley',
      categories: [
        { id: 'calm', label: 'Calm' },
        { id: 'happy', label: 'Happy' },
        { id: 'energised', label: 'Energised', shortLabel: 'Energy' },
        { id: 'tired', label: 'Tired' },
        { id: 'anxious', label: 'Anxious' },
        { id: 'low', label: 'Low' },
        { id: 'irritable', label: 'Irritable', shortLabel: 'Snappy' },
      ],
      goals: [
        {
          rule: {
            kind: 'categories',
            match: 'any',
            ids: ['calm', 'happy', 'energised'],
            exclude: ['low'],
          },
        },
      ],
      at: [21.2, 40],
      value: (day) => {
        if (day.chance('skip') < 0.06) return null;
        const light = brightness(day);
        const first =
          light > 0.75
            ? day.chance('a') < 0.5
              ? 'happy'
              : 'energised'
            : light > 0.45
              ? 'calm'
              : light > 0.25
                ? day.chance('a') < 0.5
                  ? 'tired'
                  : 'anxious'
                : day.chance('a') < 0.6
                  ? 'low'
                  : 'irritable';
        const second =
          day.chance('b') < 0.35
            ? light > 0.45
              ? day.weekend
                ? 'happy'
                : 'calm'
              : 'tired'
            : first;
        return [...new Set([first, second])];
      },
    },
    {
      id: 'wellbeing-meditate',
      name: 'Meditate',
      type: 'number',
      unit: 'minutes',
      color: '#7DDDD9',
      icon: 'phosphor:flower-lotus',
      goals: [{ rule: { kind: 'number', operator: 'atLeast', target: 10 } }],
      at: [7.1, 20],
      value: (day) =>
        day.ago > 6 && day.chance('skip') < 0.22 - day.progress * 0.14
          ? null
          : step(5 + day.chance() * 8 + day.progress * 8, 1),
    },
    {
      id: 'wellbeing-gratitude',
      name: 'Grateful for',
      type: 'text',
      color: '#ED8DC3',
      icon: 'phosphor:hand-heart',
      goals: [{ rule: { kind: 'recorded' } }],
      at: [22.1, 20],
      value: (day) =>
        day.chance('skip') < 0.25 - day.progress * 0.12
          ? null
          : line(gratitude, day),
    },
    {
      id: 'wellbeing-sunlight',
      name: 'Morning sunlight',
      type: 'checkbox',
      color: '#F6D780',
      icon: 'phosphor:sun',
      goals: [{ rule: { kind: 'checked' } }],
      at: [8.2, 25],
      value: (day) =>
        day.ago <= 7 ? 1 : tick(day.chance(), 0.55 + day.progress * 0.3),
    },
    {
      id: 'wellbeing-alcohol',
      name: 'Alcohol-free',
      type: 'checkbox',
      color: '#82E6BC',
      icon: 'phosphor:drop-half',
      description:
        'Checked by default: untick only on days I drink. The goal is most weeknights free, not perfection.',
      goals: [{ rule: { kind: 'checked' }, defaultChecked: true }],
      at: [22.4, 40],
      value: (day) => {
        const odds =
          (day.weekday === 5 ? 0.45 : day.weekday === 6 ? 0.5 : 0.08) -
          day.progress * 0.15;
        // Saved 0 is an explicit Off on a default-on checkbox.
        return day.chance() < odds ? 0 : null;
      },
    },
    {
      id: 'wellbeing-screen',
      name: 'Screen time',
      type: 'number',
      unit: 'hours',
      color: '#8AAEFF',
      icon: 'phosphor:device-mobile',
      goals: [{ rule: { kind: 'number', operator: 'atMost', target: 2.5 } }],
      at: [22.6, 15],
      value: (day) =>
        day.chance('skip') < 0.08
          ? null
          : step(
              clamp(
                4.1 -
                  day.progress * 1.9 +
                  day.chance() * 1.4 +
                  (day.weekend ? 0.6 : 0),
                0.75,
                6,
              ),
              0.25,
            ),
    },
    {
      id: 'wellbeing-caffeine',
      name: 'Coffee',
      type: 'number',
      unit: 'cups',
      color: '#D9C6AA',
      icon: 'phosphor:coffee',
      goals: [{ rule: { kind: 'number', operator: 'atMost', target: 2 } }],
      at: [14.5, 60],
      value: (day) =>
        day.chance('skip') < 0.05
          ? null
          : Math.round(clamp(1 + day.chance() * 3 - day.progress * 0.8, 0, 4)),
    },
    {
      id: 'wellbeing-therapy',
      name: 'Therapy',
      type: 'checkbox',
      color: '#BDA5FF',
      icon: 'phosphor:chats-circle',
      description:
        'Every other Thursday at 5:30.\n\n**Bring up next time:**\n- Sunday-night dread\n- Saying no at work\n- What helped this fortnight',
      goals: [
        {
          rule: { kind: 'checked' },
          weekdays: [4],
          cycle: { unit: 'weeks', on: 1, off: 1 },
        },
      ],
      at: [17.6, 15],
      value: (day) =>
        day.weekday === 4 && day.week % 2 === 0
          ? tick(day.chance(), day.ago < 28 ? 1 : 0.9)
          : null,
    },
  ],
};
