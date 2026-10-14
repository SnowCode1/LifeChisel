import { useId, useState } from 'react';
import {
  checkboxChecked,
  defaultSuccessRule,
  goalAt,
  ruleSummary,
  timingSummary,
  validGoalTimeline,
  withCheckboxDefault,
  type HabitGoal,
} from '@onpurpose/core/habitGoals';
import {
  habitType,
  habitTypeLabel,
  type Habit,
  type HabitCategory,
  type HabitType,
} from '@onpurpose/core/habits';
import {
  MAX_CATEGORIES,
  MAX_CATEGORY_LABEL,
  MAX_CATEGORY_SHORT_LABEL,
} from '@onpurpose/core/entries';
import { habitIconLabel, type HabitIcon } from '@onpurpose/core/habitIcons';
import { normalizeHex } from '@onpurpose/core/colors';
import { validDate } from '@onpurpose/core/storage/model';
import type { Theme } from '@onpurpose/core/theme';
import { Modal } from '../ui/Modal.tsx';
import { HabitSymbol } from '../ui/HabitSymbol.tsx';
import { ColourPicker } from './ColourPicker.tsx';
import { IconPicker } from './IconPicker.tsx';
import { GoalEditor } from './GoalEditor.tsx';
import type { WeekStart } from '@onpurpose/core/displayPreferences';

const TYPES: HabitType[] = ['checkbox', 'number', 'categorical', 'text'];

// Create or edit one habit. Everything stays a draft until Done, which saves
// one ordinary, undoable habit change. The type is fixed after creation so
// existing records keep their meaning.
export function HabitEditor({
  habit,
  creating,
  initialStartDate,
  today,
  weekStart,
  theme,
  editable,
  onClose,
  onSave,
}: {
  habit: Habit;
  creating: boolean;
  initialStartDate: string;
  today: string;
  weekStart: WeekStart;
  theme: Theme;
  editable: boolean;
  onClose: () => void;
  onSave: (habit: Habit) => boolean;
}) {
  const titleId = useId();
  const [view, setView] = useState<'form' | 'colour' | 'icon'>('form');
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [name, setName] = useState(habit.name);
  const [type, setType] = useState<HabitType>(habitType(habit));
  const [unit, setUnit] = useState(habit.unit ?? '');
  const [categories, setCategories] = useState<HabitCategory[]>(
    habit.categories ?? [],
  );
  const [goals, setGoals] = useState<HabitGoal[] | undefined>(habit.goals);
  const [startDate, setStartDate] = useState(
    habit.startDate ?? initialStartDate,
  );
  const [colour, setColour] = useState(habit.color);
  const [colourDraft, setColourDraft] = useState<string | null>(habit.color);
  const [icon, setIcon] = useState<HabitIcon | undefined>(habit.icon);
  const [iconDraft, setIconDraft] = useState<HabitIcon | undefined>(habit.icon);
  const accent = normalizeHex(colour) ? theme.colour(colour) : colour;
  const numeric = type === 'number';
  const draft: Habit = {
    ...habit,
    name: name.trim() || 'New habit',
    color: colour,
    icon,
    startDate,
    type,
    unit: numeric ? unit : undefined,
    categories: type === 'categorical' ? categories : undefined,
    goals,
  };
  const categoriesValid =
    categories.length > 0 &&
    categories.some((option) => !option.archived) &&
    categories.every((option) => option.label.trim());
  const valid =
    validDate(startDate) &&
    !!name.trim() &&
    name.trim().length <= 200 &&
    unit.trim().length <= 80 &&
    (!goals || validGoalTimeline(goals, draft)) &&
    (type !== 'categorical' || categoriesValid);
  // A checkbox default starts from the start date for a new habit, today
  // for an existing one, so earlier days keep their meaning.
  const defaultFrom = creating ? startDate : today;
  const goal = goalAt(draft, defaultFrom);

  function save() {
    if (!valid || !editable) return;
    const {
      unit: _unit,
      icon: _icon,
      categories: _categories,
      goals: _goals,
      ...base
    } = habit;
    const after: Habit = {
      ...base,
      name: name.trim(),
      // An inferred start date is saved only once someone changes it.
      ...(startDate !== initialStartDate || habit.startDate || creating
        ? { startDate }
        : {}),
      color: colour,
      ...(icon ? { icon } : {}),
      ...(numeric && unit.trim() ? { unit: unit.trim() } : {}),
      type,
      ...(type === 'categorical'
        ? {
            categories: categories.map(({ shortLabel, ...option }) => ({
              ...option,
              label: option.label.trim(),
              ...(shortLabel?.trim() ? { shortLabel: shortLabel.trim() } : {}),
            })),
          }
        : {}),
      ...(goals ? { goals } : {}),
    };
    if (onSave(after)) onClose();
  }

  const back = (
    <button
      type="button"
      className="text-button"
      onClick={() => setView('form')}
    >
      ‹ {creating ? 'New habit' : 'Edit habit'}
    </button>
  );
  if (view === 'colour')
    return (
      <Modal
        titleId={titleId}
        title="Colour"
        leading={back}
        trailing={
          <button
            type="button"
            className="done-button"
            disabled={!colourDraft}
            onClick={() => {
              if (!colourDraft) return;
              setColour(colourDraft);
              setView('form');
            }}
          >
            Done
          </button>
        }
        onClose={() => setView('form')}
      >
        <ColourPicker colour={colour} theme={theme} onChange={setColourDraft} />
      </Modal>
    );
  if (view === 'icon')
    return (
      <Modal
        titleId={titleId}
        title="Icon"
        leading={back}
        trailing={
          <button
            type="button"
            className="done-button"
            onClick={() => {
              setIcon(iconDraft);
              setView('form');
            }}
          >
            Done
          </button>
        }
        onClose={() => setView('form')}
      >
        <IconPicker icon={iconDraft} colour={accent} onChange={setIconDraft} />
      </Modal>
    );
  return (
    <Modal
      titleId={titleId}
      title={creating ? 'New habit' : 'Edit habit'}
      className="habit-editor"
      leading={
        <button
          type="button"
          className="icon-button"
          aria-label="Close without applying changes"
          onClick={onClose}
        >
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
        </button>
      }
      trailing={
        <button
          type="button"
          className="done-button"
          disabled={!valid || !editable}
          onClick={save}
        >
          Done
        </button>
      }
      onClose={onClose}
    >
      <form
        className="editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label className="field">
          <span className="field-label">Name</span>
          <input
            className="text-input"
            data-autofocus
            maxLength={200}
            placeholder="Read a little"
            value={name}
            onChange={(event) => setName(event.target.value)}
            style={{ caretColor: accent }}
          />
        </label>

        {creating ? (
          <fieldset className="field">
            <legend className="field-label">Record as</legend>
            <div className="type-choices">
              {TYPES.map((value) => (
                <label
                  key={value}
                  className={
                    type === value ? 'type-choice selected' : 'type-choice'
                  }
                >
                  <input
                    type="radio"
                    name="habit-type"
                    checked={type === value}
                    onChange={() => {
                      setType(value);
                      setGoals(undefined);
                    }}
                  />
                  {habitTypeLabel({ ...habit, type: value })}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <p className="hint">
            {habitTypeLabel(draft)} · The type is set when a habit is created.
          </p>
        )}

        {type === 'categorical' && (
          <CategoriesField
            categories={categories}
            accent={accent}
            onChange={setCategories}
          />
        )}

        {numeric && (
          <label className="field">
            <span className="field-label">Unit · optional</span>
            <input
              className="text-input"
              maxLength={80}
              placeholder="minutes, pages, glasses…"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
            />
          </label>
        )}

        {type === 'checkbox' && (
          <label className="switch-row">
            <span>
              Checked by default
              <span className="hint">
                {creating ? 'From the start date' : 'From today'} · untick days
                you missed
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={checkboxChecked(draft, undefined, defaultFrom)}
              onChange={(event) =>
                setGoals(
                  withCheckboxDefault(
                    draft,
                    defaultFrom,
                    event.target.checked,
                    crypto.randomUUID(),
                  ),
                )
              }
              style={{ accentColor: accent }}
            />
          </label>
        )}

        <button
          type="button"
          className="summary-row goal-button"
          disabled={
            !editable ||
            (type === 'categorical' &&
              !categories.some((option) => option.label.trim()))
          }
          onClick={() => setGoalsOpen(true)}
        >
          <span className="field-label">Goal</span>
          <span>
            {ruleSummary(draft, goal?.rule ?? defaultSuccessRule(draft))}
            {' · '}
            {timingSummary(goal ?? { weekdays: [0, 1, 2, 3, 4, 5, 6] })}
          </span>
          <span className="hint">
            Edit the goal, schedule and dated versions
          </span>
        </button>

        <label className="field">
          <span className="field-label">Start date</span>
          <input
            type="date"
            className="text-input"
            value={startDate}
            max="9999-12-31"
            onChange={(event) => setStartDate(event.target.value)}
          />
          <span className="hint">
            Statistics count from this day. Earlier entries are kept.
          </span>
        </label>

        <div className="appearance-row">
          <button
            type="button"
            className="appearance-button"
            aria-label={`Habit icon, ${habitIconLabel(icon)}`}
            onClick={() => {
              setIconDraft(icon);
              setView('icon');
            }}
          >
            <span className="appearance-preview" style={{ color: accent }}>
              {icon ? (
                <HabitSymbol icon={icon} colour={accent} size={24} />
              ) : (
                '+'
              )}
            </span>
            Icon
          </button>
          <button
            type="button"
            className="appearance-button"
            aria-label={`Habit colour, ${colour}`}
            onClick={() => {
              setColourDraft(colour);
              setView('colour');
            }}
          >
            <span className="appearance-preview">
              <span
                className="colour-dot"
                style={{ backgroundColor: accent }}
              />
            </span>
            Colour
          </button>
        </div>
        {/* Enter in a field submits; the visible Done button is in the header. */}
        <button type="submit" hidden />
      </form>
      {goalsOpen && (
        <GoalEditor
          habit={draft}
          today={today}
          weekStart={weekStart}
          creating={creating}
          initialDate={creating ? startDate : today}
          editable={editable}
          theme={theme}
          onClose={() => setGoalsOpen(false)}
          onApply={(next) => {
            // Staged: the habit saves them with everything else on Done.
            setGoals(next);
            return true;
          }}
        />
      )}
    </Modal>
  );
}

// Categories keep stable IDs; archiving hides an option from new entries
// without touching days that used it. Blank new rows can be removed.
function CategoriesField({
  categories,
  accent,
  onChange,
}: {
  categories: HabitCategory[];
  accent: string;
  onChange: (categories: HabitCategory[]) => void;
}) {
  // A newly added row takes focus so its name can be typed straight away.
  const [added, setAdded] = useState<string | null>(null);
  const update = (id: string, fields: Partial<HabitCategory>) =>
    onChange(
      categories.map((option) =>
        option.id === id ? { ...option, ...fields } : option,
      ),
    );
  return (
    <fieldset className="field categories-field">
      <legend className="field-label">Categories</legend>
      {categories.map((option) => (
        <div
          key={option.id}
          className={option.archived ? 'category-row archived' : 'category-row'}
        >
          <input
            className="text-input"
            autoFocus={option.id === added}
            aria-label={`Category name ${option.label || 'new category'}`}
            placeholder="Category name"
            maxLength={MAX_CATEGORY_LABEL}
            value={option.label}
            onChange={(event) =>
              update(option.id, { label: event.target.value })
            }
          />
          <input
            className="text-input short"
            aria-label={`Short grid label for ${option.label || 'new category'}`}
            placeholder="Short"
            title="Optional abbreviation shown in grid cells"
            maxLength={MAX_CATEGORY_SHORT_LABEL}
            value={option.shortLabel ?? ''}
            onChange={(event) =>
              update(option.id, { shortLabel: event.target.value })
            }
          />
          <button
            type="button"
            className="text-button"
            onClick={() =>
              option.label.trim()
                ? update(option.id, { archived: !option.archived })
                : onChange(categories.filter((item) => item.id !== option.id))
            }
          >
            {option.label.trim()
              ? option.archived
                ? 'Restore'
                : 'Archive'
              : 'Remove'}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        disabled={categories.length >= MAX_CATEGORIES}
        style={{ color: accent }}
        onClick={() => {
          const id = crypto.randomUUID();
          setAdded(id);
          onChange([...categories, { id, label: '' }]);
        }}
      >
        + Add category
      </button>
      {!categories.some(
        (option) => !option.archived && option.label.trim(),
      ) && <span className="hint">Add at least one category to record.</span>}
    </fieldset>
  );
}
