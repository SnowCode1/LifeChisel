import type { HabitIcon } from './habitIcons.ts';
import type { HabitGoal } from './habitGoals.ts';
export type HabitType = 'checkbox' | 'number' | 'categorical' | 'text';
export type HabitCategory = {
  id: string;
  label: string;
  shortLabel?: string;
  archived?: boolean;
};
export type Habit = {
  id: string;
  startDate?: string;
  name: string;
  description?: string;
  color: string;
  unit?: string;
  type?: HabitType;
  categories?: HabitCategory[];
  goals?: HabitGoal[];
  archived?: boolean;
  icon?: HabitIcon;
};
export const habitType = (habit: Habit): HabitType =>
  habit.type ?? (habit.unit ? 'number' : 'checkbox');
export const isNumericHabit = (habit: Habit) => habitType(habit) === 'number';
export const habitTypeLabel = (habit: Habit) =>
  ({
    checkbox: 'Checkbox',
    number: 'Daily total',
    categorical: 'Categories',
    text: 'Free text',
  })[habitType(habit)];

export const habitColors = [
  { name: 'Mint', value: '#82E6BC' },
  { name: 'Lavender', value: '#BDA5FF' },
  { name: 'Sky', value: '#84C9FF' },
  { name: 'Peach', value: '#FFB38A' },
  { name: 'Rose', value: '#FF9ABD' },
  { name: 'Lime', value: '#C5E788' },
  { name: 'Aqua', value: '#7DDDD9' },
  { name: 'Gold', value: '#F6D780' },
  { name: 'Coral', value: '#FF8F86' },
  { name: 'Orange', value: '#FFAB63' },
  { name: 'Lemon', value: '#EBE36F' },
  { name: 'Leaf', value: '#9CD978' },
  { name: 'Jade', value: '#64D7A2' },
  { name: 'Teal', value: '#56CBC4' },
  { name: 'Cyan', value: '#6CDCF2' },
  { name: 'Blue', value: '#8AAEFF' },
  { name: 'Periwinkle', value: '#A6ACFF' },
  { name: 'Violet', value: '#C394F5' },
  { name: 'Orchid', value: '#E29CE8' },
  { name: 'Pink', value: '#ED8DC3' },
  { name: 'Sand', value: '#D9C6AA' },
  { name: 'Silver', value: '#BFC8D4' },
  { name: 'Cloud', value: '#E3E7EE' },
  { name: 'White', value: '#FFFFFF' },
];

// Presets are seeded once. Existing stores receive missing preset icons through
// normal undoable edits in storage/presetIcons.ts, never by replacing the seed.
export const demoHabits: Habit[] = [
  {
    id: 'walk',
    name: 'Go for a walk',
    color: '#82E6BC',
    icon: 'phosphor:person-simple-walk',
  },
  {
    id: 'read',
    name: 'Read',
    unit: 'minutes',
    color: '#BDA5FF',
    icon: 'phosphor:book-open',
  },
  {
    id: 'water',
    name: 'Drink water',
    unit: 'glasses',
    color: '#84C9FF',
    icon: 'phosphor:drop',
  },
  {
    id: 'stretch',
    name: 'Stretch',
    color: '#FFB38A',
    icon: 'tabler:stretching',
  },
  {
    id: 'journal',
    name: 'Write a little',
    color: '#FF9ABD',
    icon: 'phosphor:pencil-simple',
  },
  {
    id: 'outside',
    name: 'Get outside',
    color: '#C5E788',
    icon: 'phosphor:tree',
  },
  { id: 'meditate', name: 'Meditate', color: '#7DDDD9', icon: 'tabler:yoga' },
  {
    id: 'cook',
    name: 'Cook a meal',
    color: '#F6D780',
    icon: 'phosphor:fork-knife',
  },
  { id: 'tidy', name: 'Tidy up', color: '#82E6BC', icon: 'phosphor:broom' },
  {
    id: 'connect',
    name: 'Call someone',
    color: '#BDA5FF',
    icon: 'phosphor:phone',
  },
  {
    id: 'learn',
    name: 'Learn something',
    color: '#84C9FF',
    icon: 'phosphor:graduation-cap',
  },
  { id: 'sleep', name: 'Wind down', color: '#FFB38A', icon: 'phosphor:moon' },
];
