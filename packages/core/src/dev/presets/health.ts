import {
  chance,
  clamp,
  step,
  tick,
  type SampleDay,
  type SamplePreset,
} from './kit.ts';

// The story: a dose adjustment about four months ago, after which blood
// pressure, pain and symptoms ease over six weeks. Purely fictional.
const ADJUSTED_AGO = 122;
const eased = (day: SampleDay) => clamp((ADJUSTED_AGO - day.ago) / 42, 0, 1);
// One shared "how the body felt" roll so pain, symptoms and notes agree.
const rough = (day: SampleDay) =>
  chance(day.date, 'rough') < 0.32 - eased(day) * 0.22;

const symptomNotes = [
  'Headache eased after water and rest',
  'Stiff joints in the morning, better by noon',
  'Tired by 3 pm, short nap helped',
  'Slept badly, woke at 3 am',
  'Dizzy standing up, ask at appointment',
  'Knees sore after the stairs',
  'Queasy after the evening dose',
  'Foggy morning, cleared after lunch',
  'Warm compress helped the ache',
  'Rested most of the afternoon',
] as const;
const goodNotes = [
  'Good day, walked to the shops',
  'Steady day, no complaints',
  'Gardened for an hour, felt fine',
  'Swim felt easy today',
  'Lunch with Anna, lots of energy',
  'Slept right through',
  'Busy day and still okay',
  'Played with the grandkids',
  'Yoga class, felt loose after',
  'Long walk by the lake',
] as const;

/** Medication adherence and symptoms: private, reliable, low-friction. */
export const health: SamplePreset = {
  id: 'health',
  name: 'Medication & health',
  summary:
    'Someone managing a long-term condition: doses, a weekly injection, blood pressure, pain, symptoms, sleep and notes for appointments.',
  habits: [
    {
      id: 'health-morning',
      name: 'Morning medication',
      type: 'checkbox',
      color: '#84C9FF',
      icon: 'phosphor:pill',
      goals: [{ rule: { kind: 'checked' } }],
      at: [8, 20],
      value: (day) =>
        day.ago <= 14 ? 1 : tick(day.chance(), 0.92 + day.progress * 0.06),
    },
    {
      id: 'health-evening',
      name: 'Evening medication',
      type: 'checkbox',
      color: '#C394F5',
      icon: 'phosphor:pill',
      description:
        'Take **with food**.\n\n- Refill from the pharmacy on the 1st\n- Dose adjusted at the spring appointment\n- Avoid grapefruit juice',
      goals: [{ rule: { kind: 'checked' } }],
      at: [20.75, 30],
      value: (day) =>
        day.ago <= 8 ? 1 : tick(day.chance(), 0.85 + day.progress * 0.1),
    },
    {
      id: 'health-injection',
      name: 'Weekly injection',
      type: 'checkbox',
      color: '#7DDDD9',
      icon: 'phosphor:syringe',
      goals: [{ rule: { kind: 'checked' }, weekdays: [0] }],
      at: [10, 30],
      value: (day) => (day.weekday === 0 ? tick(day.chance(), 0.96) : null),
    },
    {
      id: 'health-vitamin',
      name: 'Vitamin D',
      type: 'checkbox',
      color: '#F6D780',
      icon: 'phosphor:sun',
      goals: [{ rule: { kind: 'checked' } }],
      at: [8.1, 20],
      value: (day) => tick(day.chance(), 0.7 + day.progress * 0.2),
    },
    {
      id: 'health-pressure',
      name: 'Blood pressure',
      type: 'number',
      unit: 'mmHg',
      color: '#FF8F86',
      icon: 'phosphor:heartbeat',
      description:
        'Systolic, seated, before the morning dose. Bring the chart to appointments.',
      goals: [{ rule: { kind: 'number', operator: 'atMost', target: 130 } }],
      at: [7.6, 15],
      value: (day) =>
        day.chance('skip') < 0.15
          ? null
          : Math.round(141 - eased(day) * 15 + day.chance() * 9 - 4),
    },
    {
      id: 'health-pain',
      name: 'Pain level',
      type: 'number',
      unit: 'out of 10',
      color: '#FFAB63',
      icon: 'phosphor:thermometer',
      goals: [{ rule: { kind: 'number', operator: 'atMost', target: 3 } }],
      at: [20, 45],
      value: (day) =>
        day.chance('skip') < 0.08
          ? null
          : Math.round(
              clamp(
                4.2 -
                  eased(day) * 2.4 +
                  day.chance() * 2 +
                  (rough(day) ? 2.5 : 0),
                0,
                9,
              ),
            ),
    },
    {
      id: 'health-symptoms',
      name: 'Symptoms',
      type: 'categorical',
      color: '#E29CE8',
      icon: 'phosphor:clipboard-text',
      categories: [
        { id: 'none', label: 'None' },
        { id: 'fatigue', label: 'Fatigue', shortLabel: 'Tired' },
        { id: 'headache', label: 'Headache', shortLabel: 'Head' },
        { id: 'joints', label: 'Joint pain', shortLabel: 'Joints' },
        { id: 'dizzy', label: 'Dizziness', shortLabel: 'Dizzy' },
        { id: 'nausea', label: 'Nausea' },
      ],
      goals: [
        {
          rule: {
            kind: 'categories',
            match: 'any',
            ids: ['none'],
            exclude: [],
          },
        },
      ],
      at: [20.3, 45],
      value: (day) => {
        if (day.chance('skip') < 0.07) return null;
        const worse = rough(day) ? 0.35 : 0;
        const ease = eased(day);
        const odds: [string, number][] = [
          ['fatigue', 0.2 - ease * 0.12 + worse],
          ['joints', 0.18 - ease * 0.1 + worse],
          ['headache', 0.12 - ease * 0.06 + worse / 2],
          ['dizzy', 0.06 - ease * 0.03],
          ['nausea', 0.05 - ease * 0.03],
        ];
        const felt = odds
          .filter(([id, odd]) => day.chance(id) < odd)
          .map(([id]) => id);
        return felt.length ? felt : ['none'];
      },
    },
    {
      id: 'health-sleep',
      name: 'Sleep',
      type: 'number',
      unit: 'hours',
      color: '#A6ACFF',
      icon: 'phosphor:bed',
      goals: [{ rule: { kind: 'number', operator: 'atLeast', target: 7 } }],
      at: [8.3, 15],
      value: (day) =>
        day.chance('skip') < 0.08
          ? null
          : step(
              clamp(
                6 +
                  eased(day) * 0.8 +
                  day.chance() * 1.8 -
                  (rough(day) ? 1.2 : 0),
                4,
                9,
              ),
              0.25,
            ),
    },
    {
      id: 'health-water',
      name: 'Water',
      type: 'number',
      unit: 'glasses',
      color: '#6CDCF2',
      icon: 'phosphor:drop',
      goals: [{ rule: { kind: 'number', operator: 'atLeast', target: 8 } }],
      at: [19.6, 40],
      value: (day) =>
        day.chance('skip') < 0.1
          ? null
          : Math.round(clamp(5 + day.chance() * 4 + day.progress * 1.5, 3, 11)),
    },
    {
      id: 'health-steps',
      name: 'Steps',
      type: 'number',
      unit: 'steps',
      color: '#9CD978',
      icon: 'phosphor:footprints',
      goals: [{ rule: { kind: 'number', operator: 'atLeast', target: 6000 } }],
      at: [21.8, 20],
      value: (day) =>
        day.chance('skip') < 0.06
          ? null
          : step(
              3200 +
                eased(day) * 2600 +
                day.chance() * 3800 -
                (rough(day) ? 1800 : 0),
              10,
            ),
    },
    {
      id: 'health-notes',
      name: 'Notes for my doctor',
      type: 'text',
      color: '#E3E7EE',
      icon: 'phosphor:notebook',
      at: [21.5, 40],
      value: (day) => {
        if (day.ago === ADJUSTED_AGO)
          return 'Appointment: evening dose adjusted';
        if (rough(day))
          return day.chance('note') < 0.85
            ? symptomNotes[
                Math.floor(day.chance('which') * symptomNotes.length)
              ]
            : null;
        return day.chance('note') < 0.5
          ? goodNotes[Math.floor(day.chance('which') * goodNotes.length)]
          : null;
      },
    },
  ],
};
