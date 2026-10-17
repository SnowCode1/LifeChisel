import { useId, useMemo, useState, type FormEvent } from 'react';
import {
  categorySelection,
  parseDailyTotal,
  textEntry,
  MAX_CATEGORIES,
  MAX_CATEGORY_LABEL,
  MAX_ENTRY_TEXT,
  type EntryValue,
  type EntryValues,
} from '@onpurpose/core/entries';
import {
  habitType,
  isNumericHabit,
  type Habit,
  type HabitCategory,
} from '@onpurpose/core/habits';
import { recentNumericTotals } from '@onpurpose/core/numericSuggestions';
import { checkmarkColor } from '@onpurpose/core/colors';
import type { Theme } from '@onpurpose/core/theme';
import { AnchoredDialog } from '../ui/AnchoredDialog.tsx';
import type { FillChange } from '../grid/fillWave.ts';

export type EntryTarget = {
  habit: Habit;
  date: string;
  /** Full spoken date, such as "Tuesday 13 October", or a fill's range. */
  label: string;
  anchor: HTMLElement;
  /**
   * Fill mode: Done sets every day of the run (drag order; `date` is its
   * start, whose value prefills the form) to one value as one change. `done`
   * hears what was applied when the popover closes.
   */
  fill?: {
    dates: string[];
    done: (change: FillChange | null) => void;
  };
};

// Typing stays in this draft. Done saves through onSave, which reads the
// current stored value as its precondition; Close, Esc and the backdrop
// discard the draft. New categories stay drafts until Done.
export function EntryDialog({
  target,
  value,
  values,
  theme,
  editable,
  onClose,
  onSave,
  onAddCategories,
}: {
  target: EntryTarget;
  value: EntryValue | undefined;
  values: EntryValues;
  theme: Theme;
  editable: boolean;
  onClose: () => void;
  onSave: (value: EntryValue | null) => boolean;
  onAddCategories: (categories: HabitCategory[]) => boolean;
}) {
  const { habit } = target;
  const titleId = useId();
  const accent = theme.colour(habit.color);
  const kind = isNumericHabit(habit)
    ? 'number'
    : habitType(habit) === 'categorical'
      ? 'categories'
      : 'text';
  const clearHint = target.fill
    ? `Leave blank to clear all ${target.fill.dates.length} days.`
    : 'Leave blank to clear this entry.';
  return (
    <AnchoredDialog
      anchor={target.anchor}
      labelledBy={titleId}
      className={`entry ${kind}`}
      onClose={onClose}
    >
      <header className="entry-header">
        <div>
          <h2 id={titleId} style={{ color: accent }}>
            {habit.name}
          </h2>
          <p>{target.label}</p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close without saving"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>
      {kind === 'number' ? (
        <NumberForm
          habit={habit}
          date={target.date}
          value={typeof value === 'number' ? value : null}
          values={values}
          accent={accent}
          editable={editable}
          clearHint={clearHint}
          onClose={onClose}
          onSave={onSave}
        />
      ) : kind === 'categories' ? (
        <CategoryForm
          habit={habit}
          value={Array.isArray(value) ? value : []}
          accent={accent}
          theme={theme}
          editable={editable}
          onClose={onClose}
          onSave={onSave}
          onAddCategories={onAddCategories}
        />
      ) : (
        <TextForm
          habit={habit}
          value={typeof value === 'string' ? value : ''}
          accent={accent}
          editable={editable}
          clearHint={clearHint}
          onClose={onClose}
          onSave={onSave}
        />
      )}
    </AnchoredDialog>
  );
}

function NumberForm({
  habit,
  date,
  value,
  values,
  accent,
  editable,
  clearHint,
  onClose,
  onSave,
}: {
  habit: Habit;
  date: string;
  value: number | null;
  values: EntryValues;
  accent: string;
  editable: boolean;
  clearHint: string;
  onClose: () => void;
  onSave: (value: EntryValue | null) => boolean;
}) {
  const [input, setInput] = useState(value === null ? '' : String(value));
  const parsed = parseDailyTotal(input);
  const current = parsed.valid ? parsed.value : null;
  const suggestions = useMemo(
    () => recentNumericTotals(values, habit.id, date),
    [values, habit.id, date],
  );
  const unit = habit.unit ? ` ${habit.unit}` : '';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (parsed.valid && editable && onSave(current)) onClose();
  };
  return (
    <form onSubmit={submit}>
      <label className="field">
        <span className="field-label">Daily total{unit && ` in${unit}`}</span>
        <span className="number-input" style={{ borderColor: `${accent}66` }}>
          <input
            data-autofocus
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={input}
            aria-invalid={!parsed.valid}
            onChange={(event) => setInput(event.target.value)}
            style={{ color: accent }}
          />
          {habit.unit && <span className="unit">{habit.unit}</span>}
        </span>
      </label>
      {suggestions.length > 0 && (
        <div className="chips" aria-label="Recent totals">
          {suggestions.map((total) => (
            <button
              key={total}
              type="button"
              aria-pressed={current === total}
              aria-label={`Use recent total ${total}${unit}`}
              onClick={() => setInput(String(total))}
              style={{
                color: accent,
                backgroundColor: current === total ? `${accent}22` : undefined,
              }}
            >
              {total}
            </button>
          ))}
        </div>
      )}
      <p className={parsed.valid ? 'hint' : 'hint error'} role="status">
        {parsed.valid ? clearHint : 'Enter a number of zero or more.'}
      </p>
      <Actions
        accent={accent}
        canSave={parsed.valid && editable}
        shortcut="Enter saves · Esc closes"
        onClose={onClose}
      />
    </form>
  );
}

function TextForm({
  habit,
  value,
  accent,
  editable,
  clearHint,
  onClose,
  onSave,
}: {
  habit: Habit;
  value: string;
  accent: string;
  editable: boolean;
  clearHint: string;
  onClose: () => void;
  onSave: (value: EntryValue | null) => boolean;
}) {
  const [text, setText] = useState(value);
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (editable && onSave(textEntry(text))) onClose();
  };
  return (
    <form onSubmit={submit}>
      <textarea
        data-autofocus
        aria-label={`Daily text for ${habit.name}`}
        placeholder="Write an entry…"
        maxLength={MAX_ENTRY_TEXT}
        value={text}
        disabled={!editable}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // Enter starts a new line; Ctrl or ⌘ with Enter saves.
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey))
            submit();
        }}
        style={{ caretColor: accent }}
      />
      <p className="hint">{clearHint}</p>
      <Actions
        accent={accent}
        canSave={editable}
        shortcut="Ctrl Enter saves · Esc closes"
        onClose={onClose}
      />
    </form>
  );
}

function CategoryForm({
  habit,
  value,
  accent,
  theme,
  editable,
  onClose,
  onSave,
  onAddCategories,
}: {
  habit: Habit;
  value: string[];
  accent: string;
  theme: Theme;
  editable: boolean;
  onClose: () => void;
  onSave: (value: EntryValue | null) => boolean;
  onAddCategories: (categories: HabitCategory[]) => boolean;
}) {
  const [selected, setSelected] = useState<string[]>(value);
  const [added, setAdded] = useState<HabitCategory[]>([]);
  const [newLabel, setNewLabel] = useState('');
  // Archived options stay listed only while this day still uses them.
  const options = [
    ...(habit.categories ?? []).filter(
      (option) => !option.archived || value.includes(option.id),
    ),
    ...added,
  ];
  const canAdd =
    editable && (habit.categories?.length ?? 0) + added.length < MAX_CATEGORIES;
  const toggle = (id: string) =>
    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id],
    );
  const addCategory = () => {
    const label = newLabel.trim();
    if (!label) return;
    const existing = options.find(
      (option) =>
        !option.archived && option.label.toLowerCase() === label.toLowerCase(),
    );
    const id = existing?.id ?? crypto.randomUUID();
    if (!existing) setAdded((previous) => [...previous, { id, label }]);
    setSelected((previous) =>
      previous.includes(id) ? previous : [...previous, id],
    );
    setNewLabel('');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!editable) return;
    // Only drafts that are still selected join the habit.
    const used = added.filter((option) => selected.includes(option.id));
    if (used.length && !onAddCategories(used)) return;
    const kept = selected.filter(
      (id) =>
        !added.some((option) => option.id === id) ||
        used.some((option) => option.id === id),
    );
    if (onSave(categorySelection(kept))) onClose();
  };
  return (
    <form onSubmit={submit}>
      <fieldset className="options" disabled={!editable}>
        <legend className="field-label">Choose any that apply</legend>
        {options.map((option, index) => {
          const checked = selected.includes(option.id);
          return (
            <label
              key={option.id}
              className="option"
              style={{
                borderColor: checked ? `${accent}66` : undefined,
                backgroundColor: checked ? theme.mix(accent, 0.15) : undefined,
                color: checked ? accent : undefined,
              }}
            >
              <input
                type="checkbox"
                data-autofocus={index === 0 || undefined}
                checked={checked}
                onChange={() => toggle(option.id)}
                style={{ accentColor: accent }}
              />
              {option.label}
              {option.archived && <span className="muted"> · archived</span>}
            </label>
          );
        })}
      </fieldset>
      {canAdd && (
        <div className="new-option">
          <input
            aria-label="New category name"
            placeholder="New category"
            maxLength={MAX_CATEGORY_LABEL}
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addCategory();
              }
            }}
          />
          <button
            type="button"
            disabled={!newLabel.trim()}
            onClick={addCategory}
          >
            Add
          </button>
        </div>
      )}
      <Actions
        accent={accent}
        canSave={editable}
        shortcut="Space toggles · Esc closes"
        onClose={onClose}
      />
    </form>
  );
}

function Actions({
  accent,
  canSave,
  shortcut,
  onClose,
}: {
  accent: string;
  canSave: boolean;
  shortcut: string;
  onClose: () => void;
}) {
  return (
    <div className="entry-actions">
      <span className="shortcut">{shortcut}</span>
      <button type="button" className="secondary" onClick={onClose}>
        Close
      </button>
      <button
        type="submit"
        className="primary"
        disabled={!canSave}
        style={{ backgroundColor: accent, color: checkmarkColor(accent) }}
      >
        Done
      </button>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
