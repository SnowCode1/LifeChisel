import { presetDescriptions } from '../presetDescriptions.ts';

// Isolated, fictional notes for opening/reading/editing on the phone. Never
// installed into the persistent habits or their history.
const scenarios = {
  walk: {
    size: 2200,
    heading: 'Making room for a walk',
    paragraph:
      'I can make this easy by choosing a familiar route and leaving without planning the whole outing. Some days I want quiet; other days I enjoy noticing what has changed along the street. A short walk still gives me a useful break.',
  },
  read: {
    size: 8000,
    heading: 'Returning to a book',
    paragraph:
      'I want reading to feel like time spent with an interesting idea. I can leave a book somewhere convenient, write down a question, and return to the page without needing to remember everything. Short sessions count towards the daily total too.',
  },
  meditate: {
    size: 18000,
    heading: 'Practising a small pause',
    paragraph:
      'The point of this practice is to return gently when my attention moves. I can notice a sound, the feeling of sitting, or a single breath. There is no need to judge a session by how quiet it felt. I want the reminder to make starting easier.',
  },
} as const;
export const sampleDescriptions = { ...presetDescriptions };
for (const [id, scenario] of Object.entries(scenarios)) {
  let note = presetDescriptions[id];
  for (let section = 1; ; section++) {
    const next = `\n\n## ${scenario.heading} · ${section}\n\n${scenario.paragraph}\n\n**A reminder:** choose the smallest useful version today.\n\n- Make starting easy.\n- Leave room to change the plan.\n- Notice one thing I would like to remember.\n\n> Progress can be ordinary.\n\n=={green}Return to what matters.== [My notes](https://example.com/#${id}-${section})`;
    if (note.length + next.length > scenario.size) break;
    note += next;
  }
  sampleDescriptions[id] = note;
}
