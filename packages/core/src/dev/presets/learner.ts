import {
  chance,
  line,
  step,
  tick,
  type SampleDay,
  type SamplePreset,
} from './kit.ts';

const words = [
  'madrugar · to get up early',
  'sobremesa · chatting after a meal',
  'estrenar · to use for the first time',
  'friolero · always feeling cold',
  'trasnochar · to stay up late',
  'ojalá · hopefully',
  'chapuza · a botched job',
  'aprovechar · to make the most of',
  'merienda · afternoon snack',
  'empalagoso · sickly sweet',
  'tutear · to say tú, not usted',
  'puente · a long weekend',
  'anteayer · the day before yesterday',
  'quedar · to arrange to meet',
  'atardecer · dusk',
  'golosina · a sweet treat',
  'tocayo · someone with your name',
  'echar de menos · to miss someone',
  'acurrucarse · to curl up',
  'despistado · absent-minded',
  'cursi · corny, twee',
  'manitas · a handy person',
  'mimar · to pamper',
  'pereza · can’t-be-bothered',
  'agobiado · overwhelmed',
  'chiringuito · a beach bar',
  'desvelarse · to lie awake',
  'antojo · a craving',
  'vale · OK, sure',
  'resaca · a hangover',
  'ponerse las pilas · to get going',
  'cotilla · a gossip',
] as const;

// Piano and Practised share one decision so a practice type always has minutes.
const practised = (day: SampleDay) =>
  chance(day.date, 'piano') <
  (day.weekday === 0 ? 0.35 : 0.72 + day.progress * 0.2);

/** Learning a language and an instrument alongside study. */
export const learner: SamplePreset = {
  id: 'learner',
  name: 'Learning & practice',
  summary:
    'A student learning Spanish and piano: practice minutes, a word a day, focus sessions and a phone-free morning.',
  habits: [
    {
      id: 'learner-spanish',
      name: 'Spanish',
      type: 'number',
      unit: 'minutes',
      color: '#FFAB63',
      icon: 'phosphor:translate',
      description:
        '## Valencia in March\n\nAim: order dinner and chat with my host family without switching to English.\n\n- Mornings: a lesson on the train\n- Thursdays: conversation class\n\n> Poco a poco se va lejos.',
      goals: [
        { rule: { kind: 'number', operator: 'atLeast', target: 10 } },
        {
          rule: { kind: 'number', operator: 'atLeast', target: 15 },
          fromAgo: 60,
        },
      ],
      at: [7.9, 20],
      value: (day) =>
        day.ago > 4 && day.chance('skip') < 0.14 - day.progress * 0.1
          ? null
          : step(
              8 +
                day.chance() * 14 +
                day.progress * 8 +
                (day.weekday === 4 ? 45 : 0),
              5,
            ),
    },
    {
      id: 'learner-word',
      name: 'Word of the day',
      type: 'text',
      color: '#F6D780',
      icon: 'phosphor:chat-circle-text',
      goals: [{ rule: { kind: 'recorded' } }],
      at: [8.2, 20],
      value: (day) =>
        day.ago > 2 && day.chance('skip') < 0.15 ? null : line(words, day),
    },
    {
      id: 'learner-piano',
      name: 'Piano',
      type: 'number',
      unit: 'minutes',
      color: '#BDA5FF',
      icon: 'phosphor:piano-keys',
      goals: [
        {
          rule: { kind: 'number', operator: 'atLeast', target: 20 },
          weekdays: [1, 2, 3, 4, 5, 6],
        },
      ],
      at: [18.6, 50],
      value: (day) =>
        practised(day)
          ? step(15 + day.chance() * 30 + day.progress * 10, 5)
          : null,
    },
    {
      id: 'learner-practised',
      name: 'Practised',
      type: 'categorical',
      color: '#C394F5',
      icon: 'phosphor:music-notes',
      categories: [
        { id: 'scales', label: 'Scales' },
        { id: 'pieces', label: 'Pieces' },
        { id: 'sight', label: 'Sight-reading', shortLabel: 'Sight' },
        { id: 'theory', label: 'Theory' },
        { id: 'ear', label: 'Ear training', shortLabel: 'Ear' },
      ],
      at: [18.9, 50],
      value: (day) => {
        if (!practised(day)) return null;
        const chosen = ['scales', 'pieces', 'sight', 'theory', 'ear'].filter(
          (id, index) => day.chance(id) < [0.55, 0.8, 0.3, 0.15, 0.2][index],
        );
        return chosen.length ? chosen : ['pieces'];
      },
    },
    {
      id: 'learner-focus',
      name: 'Focus sessions',
      type: 'number',
      unit: 'sessions',
      color: '#84C9FF',
      icon: 'phosphor:timer',
      description: '25 minutes, phone in another room, then a 5 minute break.',
      goals: [
        {
          rule: { kind: 'number', operator: 'atLeast', target: 4 },
          weekdays: [1, 2, 3, 4, 5],
        },
      ],
      at: [17, 60],
      value: (day) =>
        day.weekend
          ? day.chance() < 0.4
            ? 1 + Math.floor(day.chance('n') * 3)
            : null
          : 2 + Math.floor(day.chance() * 4 + day.progress * 1.5),
    },
    {
      id: 'learner-phone',
      name: 'No phone before 9',
      type: 'checkbox',
      color: '#82E6BC',
      icon: 'phosphor:device-mobile-slash',
      goals: [{ rule: { kind: 'checked' } }],
      at: [9, 10],
      value: (day) =>
        day.ago <= 5 ? 1 : tick(day.chance(), 0.5 + day.progress * 0.38),
    },
  ],
};
