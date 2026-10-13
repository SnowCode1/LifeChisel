import { TextInput, Text } from './Typography';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, View, useWindowDimensions } from 'react-native';
import {
  habitIconLabel,
  habitIconPackLabel,
  isSingleEmoji,
  type HabitIcon,
} from '@onpurpose/core/habitIcons';
import {
  searchHabitIcons,
  packIconCount,
} from '@onpurpose/core/searchHabitIcons';
import { HabitSymbol } from './HabitSymbol';
import { themedStyles, useTheme } from './ThemeContext';

const emojiChoices = [
  '🚶',
  '🏃',
  '🏋️',
  '🚴',
  '🧘',
  '💧',
  '☕',
  '🥗',
  '🍎',
  '💊',
  '🪥',
  '🛏️',
  '🌙',
  '☀️',
  '🌿',
  '📖',
  '✍️',
  '📓',
  '🎓',
  '🧠',
  '🎵',
  '🎹',
  '🎨',
  '💻',
  '🎯',
  '🧹',
  '🏠',
  '📞',
  '💬',
  '❤️',
  '🐾',
  '💰',
];
type Choice = { value: HabitIcon; label: string };
export function HabitIconPicker({
  icon,
  colour,
  onChange,
}: {
  icon?: HabitIcon;
  colour: string;
  onChange: (icon: HabitIcon | undefined | null) => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const accent = theme.colour(colour);
  const { height } = useWindowDimensions();
  const [width, setWidth] = useState(280);
  const [tab, setTab] = useState<'icons' | 'emoji' | 'none'>('icons');
  const [selected, setSelected] = useState(icon);
  const [emoji, setEmoji] = useState(
    icon?.startsWith('emoji:') ? icon.slice(6) : '',
  );
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'common' | 'all' | 'phosphor' | 'tabler'>(
    'common',
  );
  const searching = search.trim().length > 0;
  const validEmoji = isSingleEmoji(emoji.trim());
  const columns = Math.max(1, Math.floor((width + 8) / 56));
  const choices = useMemo<Choice[]>(
    () =>
      tab === 'icons'
        ? searchHabitIcons(
            search,
            scope !== 'common',
            scope === 'phosphor' || scope === 'tabler' ? scope : 'all',
          ).map((item) => ({
            value: item.value,
            label: `${item.label}, ${item.pack === 'phosphor' ? 'Phosphor' : 'Tabler'}`,
          }))
        : tab === 'emoji'
          ? emojiChoices.map((value) => ({
              value: `emoji:${value}`,
              label: `Use ${value}`,
            }))
          : [],
    [tab, search, scope],
  );
  const rows = useMemo(() => {
    const result: Choice[][] = [];
    for (let i = 0; i < choices.length; i += columns)
      result.push(choices.slice(i, i + columns));
    return result;
  }, [choices, columns]);
  function choose(value: HabitIcon | undefined) {
    setSelected(value);
    onChange(value);
  }
  return (
    <View
      style={{ height: Math.min(440, height * 0.5), flexShrink: 1 }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <FlatList
        style={{ flex: 1 }}
        data={rows}
        keyExtractor={(row) => row[0].value}
        extraData={selected}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews={false}
        contentContainerStyle={{ paddingBottom: 4 }}
        ListHeaderComponent={
          <View style={{ gap: 12, paddingBottom: 16 }}>
            <View style={styles.tabs}>
              {(['icons', 'emoji', 'none'] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === value }}
                  onPress={() => {
                    setTab(value);
                    if (value === 'none') choose(undefined);
                    else if (value === 'emoji' && validEmoji)
                      choose(`emoji:${emoji.trim()}`);
                    else onChange(selected);
                  }}
                  style={[styles.tab, tab === value && styles.active]}
                >
                  <Text style={styles.text}>
                    {value === 'none'
                      ? 'None'
                      : value === 'icons'
                        ? 'Icons'
                        : 'Emoji'}
                  </Text>
                </Pressable>
              ))}
            </View>
            {tab === 'none' ? (
              <View style={styles.empty}>
                <Text style={styles.text}>Just the habit name</Text>
                <Text style={styles.description}>
                  Icons are optional. Choose one whenever it helps you recognise
                  a habit.
                </Text>
              </View>
            ) : tab === 'icons' ? (
              <>
                <TextInput
                  accessibilityLabel="Search all icons in both Phosphor and Tabler"
                  placeholder={`Search all ${packIconCount.toLocaleString()} icons`}
                  placeholderTextColor={theme.ink(0x77)}
                  value={search}
                  onChangeText={setSearch}
                  autoCorrect={false}
                  autoCapitalize="none"
                  clearButtonMode="while-editing"
                  style={styles.input}
                />
                {searching ? (
                  <View
                    style={styles.searchScope}
                    accessibilityLiveRegion="polite"
                  >
                    <Text style={styles.text}>Searching all icons</Text>
                    <Text style={styles.description}>
                      Both packs · {choices.length} results
                    </Text>
                  </View>
                ) : (
                  <View style={styles.scopeRow}>
                    {(['common', 'all', 'phosphor', 'tabler'] as const).map(
                      (value) => (
                        <Pressable
                          key={value}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: scope === value }}
                          accessibilityLabel={
                            value === 'common'
                              ? 'Common icons from both packs'
                              : value === 'all'
                                ? 'All icons from both packs'
                                : `Browse ${value} icons`
                          }
                          onPress={() => setScope(value)}
                          style={[
                            styles.scope,
                            scope === value && styles.active,
                          ]}
                        >
                          <Text style={styles.scopeText}>
                            {value === 'common'
                              ? 'Common'
                              : value === 'all'
                                ? 'All'
                                : value === 'phosphor'
                                  ? 'Phosphor'
                                  : 'Tabler'}
                          </Text>
                        </Pressable>
                      ),
                    )}
                  </View>
                )}
                <Text style={styles.description}>
                  {selected
                    ? `${habitIconLabel(selected)} · ${habitIconPackLabel(selected)}`
                    : 'No icon selected'}
                </Text>
                {choices.length === 0 && (
                  <Text style={styles.description}>
                    No matching icons. Try another word.
                  </Text>
                )}
              </>
            ) : (
              <>
                <TextInput
                  accessibilityLabel="Habit emoji"
                  placeholder="Type or paste one emoji"
                  placeholderTextColor={theme.ink(0x77)}
                  value={emoji}
                  maxLength={64}
                  onChangeText={(text) => {
                    setEmoji(text);
                    const value = text.trim();
                    if (isSingleEmoji(value)) setSelected(`emoji:${value}`);
                    onChange(isSingleEmoji(value) ? `emoji:${value}` : null);
                  }}
                  autoCorrect={false}
                  style={[styles.input, { fontSize: 22 }]}
                />
                <Text style={styles.description}>
                  {emoji && !validEmoji
                    ? 'Choose a single emoji, including a skin tone or joined emoji if you like.'
                    : 'Use your emoji keyboard, or choose one below.'}
                </Text>
              </>
            )}
          </View>
        }
        renderItem={({ item: row }) => (
          <View style={styles.gridRow}>
            {row.map(({ value, label }) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: selected === value }}
                onPress={() => {
                  if (value.startsWith('emoji:')) setEmoji(value.slice(6));
                  choose(value);
                }}
                style={[
                  styles.choice,
                  { borderColor: selected === value ? accent : 'transparent' },
                ]}
              >
                <HabitSymbol icon={value} colour={accent} size={25} />
              </Pressable>
            ))}
          </View>
        )}
      />
    </View>
  );
}
const useStyles = themedStyles((t) => ({
  tabs: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    backgroundColor: t.ink(0x1a),
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  active: { backgroundColor: t.ink(0x34) },
  text: { color: t.ink(0xdd), fontSize: 14, fontWeight: '500' },
  description: { color: t.ink(0x99), fontSize: 12, lineHeight: 18 },
  empty: { paddingVertical: 22, gap: 12 },
  input: {
    backgroundColor: t.ink(0x1c),
    borderRadius: 12,
    padding: 12,
    color: t.ink(0xee),
    fontSize: 16,
    minHeight: 48,
  },
  scopeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  searchScope: { minHeight: 44, justifyContent: 'center', gap: 3 },
  scopeText: { color: t.ink(0xdd), fontSize: 12, fontWeight: '500' },
  scope: {
    minHeight: 44,
    paddingHorizontal: 9,
    justifyContent: 'center',
    borderRadius: 10,
  },
  gridRow: { flexDirection: 'row', gap: 8, paddingBottom: 8 },
  choice: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: t.ink(0x1c),
    borderWidth: 1.5,
  },
}));
