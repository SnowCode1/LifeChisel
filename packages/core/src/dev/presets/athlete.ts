import {
  chance,
  clamp,
  pick,
  step,
  tick,
  type SampleDay,
  type SamplePreset,
} from './kit.ts';

type Session = 'easy' | 'tempo' | 'intervals' | 'long' | 'cross' | 'rest';

// One weekly plan shared by Training, Distance and Session notes so the three
// rows always agree. Every fourth week is an easier recovery week.
function session(day: SampleDay): Session | null {
  const roll = chance(day.date, 'plan');
  if (day.ago > 0 && roll < 0.04) return null; // A day nothing was logged.
  if (day.ago > 3 && roll > 0.95) return 'rest'; // Life got in the way.
  switch (day.weekday) {
    case 1:
      return 'rest';
    case 2:
      return 'intervals';
    case 3:
      return 'easy';
    case 4:
      return 'tempo';
    case 5:
      return roll < 0.55 ? 'easy' : 'rest';
    case 6:
      return 'long';
    default:
      return roll < 0.7 ? 'easy' : 'cross';
  }
}
const recoveryWeek = (day: SampleDay) => day.week % 4 === 3;
function distance(day: SampleDay): number | null {
  const kind = session(day);
  const roll = chance(day.date, 'distance');
  const build = recoveryWeek(day) ? 0.75 : 1;
  switch (kind) {
    case 'easy':
      return step((6 + roll * 4 + day.progress * 2) * build, 0.1);
    case 'tempo':
      return step((9 + roll * 3 + day.progress * 2) * build, 0.1);
    case 'intervals':
      return step(8 + roll * 3, 0.1);
    case 'long':
      return step((16 + day.progress * 16 + roll * 2) * build, 0.5);
    default:
      return null;
  }
}
const pace = (day: SampleDay, base: number) => {
  const seconds = Math.round(base - day.progress * 15 + chance(day.date) * 10);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
const easyNotes = [
  'Easy with the club, chatty pace',
  'Recovery jog, legs heavy',
  'Easy loop, calves a bit tight',
  'Strides at the end felt quick',
  'Trail run, muddy and happy',
  'Easy miles in the rain',
] as const;

/** A marathon build: training mix, volume, recovery and body numbers. */
export const athlete: SamplePreset = {
  id: 'athlete',
  name: 'Marathon training',
  summary:
    'A runner building to a spring marathon: sessions, distance, resting heart rate, sleep and physio.',
  habits: [
    {
      id: 'athlete-training',
      name: 'Training',
      type: 'categorical',
      color: '#9CD978',
      icon: 'phosphor:person-simple-run',
      description:
        '## Spring marathon\n\nGoal: **sub 3:30**.\n\n- Tuesday: intervals on the track\n- Thursday: tempo\n- Saturday: long run, building to 32 km\n- Every fourth week: back off\n\nStrength with the easy run on Wednesdays.',
      categories: [
        { id: 'easy', label: 'Easy run', shortLabel: 'Easy' },
        { id: 'tempo', label: 'Tempo' },
        { id: 'intervals', label: 'Intervals', shortLabel: 'Reps' },
        { id: 'long', label: 'Long run', shortLabel: 'Long' },
        { id: 'strength', label: 'Strength', shortLabel: 'Gym' },
        { id: 'cross', label: 'Cross-training', shortLabel: 'Bike' },
        { id: 'rest', label: 'Rest day', shortLabel: 'Rest' },
      ],
      goals: [
        {
          rule: {
            kind: 'categories',
            match: 'any',
            ids: ['easy', 'tempo', 'intervals', 'long'],
            exclude: [],
          },
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          period: { unit: 'week', days: 7, operator: 'atLeast', target: 4 },
        },
      ],
      at: [18.2, 40],
      value: (day) => {
        const kind = session(day);
        if (!kind) return null;
        return day.weekday === 3 && kind === 'easy'
          ? ['easy', 'strength']
          : [kind];
      },
    },
    {
      id: 'athlete-distance',
      name: 'Distance',
      type: 'number',
      unit: 'km',
      color: '#6CDCF2',
      icon: 'phosphor:path',
      at: [18.4, 40],
      value: distance,
    },
    {
      id: 'athlete-notes',
      name: 'Session notes',
      type: 'text',
      color: '#E3E7EE',
      icon: 'phosphor:notebook',
      at: [19, 40],
      value: (day) => {
        const kind = session(day);
        const km = distance(day);
        if (!kind || chance(day.date, 'note') < 0.2) return null;
        const reps = pick(
          ['6×800 m', '5×1 km', '8×400 m', '4×1600 m'],
          chance(day.date, 'reps'),
        );
        switch (kind) {
          case 'intervals':
            return `${reps} @ ${pace(day, 230)}/km`;
          case 'tempo':
            return `Tempo ${km} km @ ${pace(day, 260)}, smooth`;
          case 'long':
            return recoveryWeek(day)
              ? `Shorter long run, ${km} km, easy`
              : `Long ${km} km, gel every 40 min`;
          case 'easy':
            return pick(easyNotes, chance(day.date, 'easy'));
          case 'cross':
            return 'Bike 45 min, kept it gentle';
          default:
            return chance(day.date, 'rest') < 0.5
              ? 'Full rest, foam roller'
              : null;
        }
      },
    },
    {
      id: 'athlete-legs',
      name: 'Legs',
      type: 'categorical',
      color: '#FFAB63',
      icon: 'phosphor:sneaker-move',
      categories: [
        { id: 'fresh', label: 'Fresh' },
        { id: 'okay', label: 'Okay' },
        { id: 'heavy', label: 'Heavy' },
        { id: 'sore', label: 'Sore' },
        { id: 'niggle', label: 'Niggle', shortLabel: 'Niggle' },
      ],
      goals: [
        {
          rule: {
            kind: 'categories',
            match: 'any',
            ids: ['fresh', 'okay'],
            exclude: ['niggle'],
          },
        },
      ],
      at: [7, 20],
      value: (day) => {
        if (day.chance('skip') < 0.1) return null;
        // Legs feel the day after a long run or a hard session.
        const yesterday = chance(day.ago + 1, 'legs-load');
        const hard =
          day.weekday === 0 || day.weekday === 3 || day.weekday === 5;
        const roll = day.chance() + (hard ? 0.3 : 0) - day.progress * 0.15;
        const feel =
          roll < 0.35
            ? 'fresh'
            : roll < 0.75
              ? 'okay'
              : roll < 1
                ? 'heavy'
                : 'sore';
        return yesterday < 0.05 ? [feel, 'niggle'] : [feel];
      },
    },
    {
      id: 'athlete-heart',
      name: 'Resting heart rate',
      type: 'number',
      unit: 'bpm',
      color: '#FF8F86',
      icon: 'phosphor:heartbeat',
      goals: [{ rule: { kind: 'number', operator: 'atMost', target: 52 } }],
      at: [6.7, 15],
      value: (day) =>
        day.chance('skip') < 0.06
          ? null
          : Math.round(
              57 -
                day.progress * 8 +
                day.chance() * 4 +
                (day.weekday === 0 ? 2 : 0),
            ),
    },
    {
      id: 'athlete-sleep',
      name: 'Sleep',
      type: 'number',
      unit: 'hours',
      color: '#A6ACFF',
      icon: 'phosphor:moon',
      goals: [{ rule: { kind: 'number', operator: 'atLeast', target: 8 } }],
      at: [6.8, 15],
      value: (day) =>
        day.chance('skip') < 0.05
          ? null
          : step(
              clamp(6.9 + day.chance() * 1.8 + day.progress * 0.4, 6, 9.5),
              0.25,
            ),
    },
    {
      id: 'athlete-mobility',
      name: 'Mobility',
      type: 'checkbox',
      color: '#FFB38A',
      icon: 'tabler:stretching',
      goals: [{ rule: { kind: 'checked' } }],
      at: [21, 30],
      value: (day) =>
        day.ago <= 6 ? 1 : tick(day.chance(), 0.68 + day.progress * 0.22),
    },
    {
      id: 'athlete-physio',
      name: 'Physio exercises',
      type: 'checkbox',
      color: '#C394F5',
      icon: 'phosphor:bandaids',
      description:
        'For the IT band flare-up in spring.\n\n1. Clamshells 3×15\n2. Single-leg calf raises 3×12\n3. Hip bridges 3×15\n\nMonday, Wednesday and Friday.',
      goals: [{ rule: { kind: 'checked' }, weekdays: [1, 3, 5] }],
      at: [20.5, 30],
      value: (day) =>
        [1, 3, 5].includes(day.weekday)
          ? tick(day.chance(), 0.82 + day.progress * 0.12)
          : null,
    },
    {
      id: 'athlete-weight',
      name: 'Weight',
      type: 'number',
      unit: 'kg',
      color: '#BFC8D4',
      icon: 'phosphor:barbell',
      at: [6.9, 10],
      value: (day) =>
        day.chance('skip') < 0.35 && day.ago > 0
          ? null
          : step(74.6 - day.progress * 2.4 + day.chance() * 0.8, 0.1),
    },
    {
      id: 'athlete-protein',
      name: 'Protein',
      type: 'number',
      unit: 'g',
      color: '#F6D780',
      icon: 'phosphor:egg',
      goals: [{ rule: { kind: 'number', operator: 'atLeast', target: 140 } }],
      at: [21.4, 20],
      value: (day) =>
        day.chance('skip') < 0.12
          ? null
          : step(112 + day.chance() * 55 + day.progress * 10, 5),
    },
  ],
};
