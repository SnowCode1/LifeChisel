import { useMemo, useState } from 'react';
import {
  commonHabitEmoji,
  isSingleEmoji,
  type HabitIcon,
} from '@onpurpose/core/habitIcons';
import {
  packIconCount,
  searchHabitIcons,
} from '@onpurpose/core/searchHabitIcons';
import { HabitSymbol } from '../ui/HabitSymbol.tsx';

const PAGE = 240;
type Scope = 'common' | 'all' | 'phosphor' | 'tabler';

// Icons are optional. A search covers both packs; browsing filters resume
// when it is cleared. Large lists render in pages to stay responsive.
export function IconPicker({
  icon,
  colour,
  onChange,
}: {
  icon?: HabitIcon;
  colour: string;
  onChange: (icon: HabitIcon | undefined) => void;
}) {
  const [tab, setTab] = useState<'icons' | 'emoji' | 'none'>(
    !icon ? 'icons' : icon.startsWith('emoji:') ? 'emoji' : 'icons',
  );
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<Scope>('common');
  const [shown, setShown] = useState(PAGE);
  const [emoji, setEmoji] = useState(
    icon?.startsWith('emoji:') ? icon.slice(6) : '',
  );
  const choices = useMemo(
    () =>
      searchHabitIcons(
        search,
        scope !== 'common',
        scope === 'phosphor' || scope === 'tabler' ? scope : 'all',
      ),
    [search, scope],
  );
  const searching = search.trim().length > 0;
  const emojiValid = isSingleEmoji(emoji.trim());
  const option = (
    value: HabitIcon,
    label: string,
    pick = () => onChange(value),
  ) => (
    <button
      key={value}
      type="button"
      role="radio"
      aria-checked={icon === value}
      aria-label={label}
      title={label}
      className="icon-choice"
      onClick={pick}
    >
      <HabitSymbol icon={value} colour={colour} size={24} />
    </button>
  );
  return (
    <div className="icon-picker">
      <div className="segmented" role="tablist" aria-label="Icon type">
        {(['icons', 'emoji', 'none'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => {
              setTab(value);
              if (value === 'none') onChange(undefined);
              if (value === 'emoji' && emojiValid)
                onChange(`emoji:${emoji.trim()}`);
            }}
          >
            {value === 'icons' ? 'Icons' : value === 'emoji' ? 'Emoji' : 'None'}
          </button>
        ))}
      </div>
      {tab === 'none' ? (
        <p className="hint">
          Just the habit name. Choose an icon whenever it helps you recognise a
          habit.
        </p>
      ) : tab === 'icons' ? (
        <>
          <input
            type="search"
            className="text-input"
            aria-label="Search all icons in both Phosphor and Tabler"
            placeholder={`Search all ${packIconCount.toLocaleString()} icons`}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setShown(PAGE);
            }}
          />
          {searching ? (
            <p className="hint" role="status">
              Both packs · {choices.length.toLocaleString()} results
            </p>
          ) : (
            <div className="chips" role="tablist" aria-label="Browse icons">
              {(['common', 'all', 'phosphor', 'tabler'] as const).map(
                (value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={scope === value}
                    onClick={() => {
                      setScope(value);
                      setShown(PAGE);
                    }}
                  >
                    {value[0].toUpperCase() + value.slice(1)}
                  </button>
                ),
              )}
            </div>
          )}
          <div className="icon-grid" role="radiogroup" aria-label="Icons">
            {choices
              .slice(0, shown)
              .map((choice) =>
                option(
                  choice.value,
                  `${choice.label}, ${choice.pack === 'phosphor' ? 'Phosphor' : 'Tabler'}`,
                ),
              )}
          </div>
          {choices.length > shown && (
            <button
              type="button"
              className="text-button"
              onClick={() => setShown((count) => count + PAGE)}
            >
              Show more ({(choices.length - shown).toLocaleString()} left)
            </button>
          )}
        </>
      ) : (
        <>
          <input
            className="text-input"
            aria-label="Habit emoji"
            placeholder="Type or paste one emoji"
            value={emoji}
            onChange={(event) => {
              const value = event.target.value;
              setEmoji(value);
              if (isSingleEmoji(value.trim()))
                onChange(`emoji:${value.trim()}`);
            }}
          />
          {emoji && !emojiValid && (
            <p className="hint error">Use a single emoji.</p>
          )}
          <div className="icon-grid" role="radiogroup" aria-label="Emoji">
            {commonHabitEmoji.map((value) =>
              option(`emoji:${value}`, `Use ${value}`, () => {
                setEmoji(value);
                onChange(`emoji:${value}`);
              }),
            )}
          </div>
        </>
      )}
    </div>
  );
}
