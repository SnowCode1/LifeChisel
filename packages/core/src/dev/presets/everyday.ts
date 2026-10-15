import { clamp, line, step, tick, type SamplePreset } from './kit.ts';

const goodThings = [
  'Coffee on the balcony',
  'Mia read me her story',
  'Lunch in the park',
  'Finished the jigsaw',
  'Long chat with Dad',
  'New running shoes',
  'Rain stopped for the walk',
  'Fixed the leaky tap',
  'Pancakes for breakfast',
  'Quiet train home',
  'Got the tickets!',
  'Sunset from the bridge',
  'Inbox zero, briefly',
  'Tomatoes are ripening',
  'Board games with Sam',
  'Bought fresh flowers',
  'Nailed the presentation',
  'Swim before work',
  'Friday pizza night',
  'A letter from Gran',
  'Cleared the spare room',
  'Lovely bakery find',
] as const;

/** Ordinary weekday routines: the broadest, most relatable screenshot. */
export const everyday: SamplePreset = {
  id: 'everyday',
  name: 'Everyday',
  summary:
    'Five habits, the free tier: a morning walk, water, reading, dinners and one good thing a day.',
  habits: [
    {
      id: 'everyday-walk',
      name: 'Morning walk',
      type: 'checkbox',
      color: '#82E6BC',
      icon: 'phosphor:person-simple-walk',
      description:
        'Out the door before coffee.\n\n- Weekdays: the **canal loop** (25 min)\n- Weekends: the long way through the park',
      goals: [{ rule: { kind: 'checked' } }],
      at: [7.4, 20],
      value: (day) =>
        day.ago <= 9
          ? 1
          : tick(
              day.chance(),
              0.6 + day.progress * 0.28 - (day.weekday === 0 ? 0.15 : 0),
            ),
    },
    {
      id: 'everyday-water',
      name: 'Drink water',
      type: 'number',
      unit: 'glasses',
      color: '#84C9FF',
      icon: 'phosphor:drop',
      goals: [
        {
          rule: { kind: 'number', operator: 'atLeast', target: 8 },
        },
      ],
      at: [19.5, 45],
      value: (day) =>
        day.chance('skip') < 0.06
          ? null
          : Math.round(clamp(5 + day.chance() * 5 + day.progress, 4, 11)),
    },
    {
      id: 'everyday-read',
      name: 'Read',
      type: 'number',
      unit: 'minutes',
      color: '#BDA5FF',
      icon: 'phosphor:book-open',
      goals: [{ rule: { kind: 'number', operator: 'atLeast', target: 20 } }],
      at: [22, 30],
      value: (day) =>
        day.chance('skip') < 0.1 - day.progress * 0.05
          ? null
          : step(
              10 +
                day.chance() * 30 +
                day.progress * 8 +
                (day.weekend ? 15 : 0),
              5,
            ),
    },
    {
      id: 'everyday-dinner',
      name: 'Dinner',
      type: 'categorical',
      color: '#F6D780',
      icon: 'phosphor:fork-knife',
      categories: [
        { id: 'cooked', label: 'Cooked' },
        { id: 'leftovers', label: 'Leftovers', shortLabel: 'Leftover' },
        { id: 'out', label: 'Ate out', shortLabel: 'Out' },
        { id: 'takeaway', label: 'Takeaway' },
        { id: 'friends', label: 'With friends', shortLabel: 'Friends' },
      ],
      goals: [
        {
          rule: {
            kind: 'categories',
            match: 'any',
            ids: ['cooked', 'leftovers'],
            exclude: [],
          },
        },
      ],
      at: [19.2, 25],
      value: (day) => {
        if (day.chance('skip') < 0.05) return null;
        const roll = day.chance();
        const friday = day.weekday === 5 || day.weekday === 6;
        const cook = 0.45 + day.progress * 0.2 - (friday ? 0.25 : 0);
        const meal =
          roll < cook
            ? 'cooked'
            : roll < cook + 0.18
              ? 'leftovers'
              : roll < cook + 0.32
                ? 'out'
                : 'takeaway';
        const company =
          meal !== 'leftovers' &&
          day.chance('friends') < (day.weekend ? 0.45 : 0.1);
        return company ? [meal, 'friends'] : [meal];
      },
    },
    {
      id: 'everyday-good',
      name: 'One good thing',
      type: 'text',
      color: '#ED8DC3',
      icon: 'phosphor:sparkle',
      goals: [{ rule: { kind: 'recorded' } }],
      at: [21.6, 25],
      value: (day) =>
        day.chance('skip') < 0.18 - day.progress * 0.1
          ? null
          : line(goodThings, day),
    },
  ],
};
