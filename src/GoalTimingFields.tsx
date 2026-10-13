import { GoalChoice } from './GoalEditorControls';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text, TextInput } from './Typography';
import { StartDateField } from './StartDateField';
import { allWeekdays } from '@onpurpose/core/habitGoals';
import {
  weekAnchor,
  validTimingDate,
  type GoalTiming,
  type GoalPeriod,
} from '@onpurpose/core/goalTiming';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import { themedStyles, useTheme } from './ThemeContext';

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const styles = useStyles();
  return (
    <View style={{ flex: 1, minWidth: 85, gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={Number.isFinite(value) ? String(value) : ''}
        keyboardType="number-pad"
        maxLength={3}
        style={styles.input}
        onChangeText={(next) => {
          onChange(/^\d+$/.test(next) ? Number(next) : NaN);
        }}
      />
    </View>
  );
}
export function GoalTimingFields({
  value,
  onChange,
  section,
  from,
  weekStart,
  today,
  colour,
}: {
  section: 'frequency' | 'cycle';
  value: GoalTiming;
  onChange: (value: GoalTiming) => void;
  from: string;
  weekStart: WeekStart;
  today: string;
  colour: string;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const display = theme.colour(colour);
  const { period, cycle } = value;
  const anchorDate = validTimingDate(from) ? from : today;
  const [customCycle, setCustomCycle] = useState(
    !!cycle &&
      !['5:2:days', '3:1:weeks', '1:1:weeks'].includes(
        `${cycle.on}:${cycle.off}:${cycle.unit}`,
      ),
  );
  const [selectedDays, setSelectedDays] = useState(
    !period && value.weekdays.length < 7,
  );
  function choices(
    label: string,
    options: [string, string][],
    selected: string,
    change: (key: string) => void,
  ) {
    return (
      <GoalChoice
        direct={label === 'How often' || label === 'Pattern'}
        label={label}
        options={options}
        value={selected}
        onChange={change}
        colour={display}
      />
    );
  }

  const changePeriod = (patch: Partial<GoalPeriod>) =>
    onChange({ ...value, period: { ...period!, ...patch } });
  return (
    <View style={{ gap: 16 }}>
      {section === 'frequency' && (
        <>
          {choices(
            'How often',
            [
              ['daily', 'Every day'],
              ['weekdays', 'Selected days'],
              ['period', 'Per period'],
            ],
            period ? 'period' : selectedDays ? 'weekdays' : 'daily',
            (key) => {
              setSelectedDays(key === 'weekdays');
              const { period: _period, ...base } = value;
              onChange({
                ...base,
                weekdays:
                  key === 'weekdays' ? [1, 2, 3, 4, 5] : [...allWeekdays],
                ...(key === 'period'
                  ? {
                      period: {
                        unit: 'week',
                        days: 7,
                        anchor: weekAnchor(anchorDate, weekStart),
                        operator: 'atLeast',
                        target: 3,
                      } as GoalPeriod,
                    }
                  : {}),
              });
            },
          )}
          {!period && selectedDays && (
            <View style={styles.wrap}>
              {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                <Pressable
                  key={day}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Applies on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]}`}
                  accessibilityState={{ checked: value.weekdays.includes(day) }}
                  onPress={() =>
                    onChange({
                      ...value,
                      weekdays: value.weekdays.includes(day)
                        ? value.weekdays.filter((item) => item !== day)
                        : [...value.weekdays, day].sort((a, b) => a - b),
                    })
                  }
                  style={[
                    styles.day,
                    {
                      backgroundColor: value.weekdays.includes(day)
                        ? theme.mix(display, 0.18)
                        : theme.ink(0x22),
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.text,
                      {
                        color: value.weekdays.includes(day)
                          ? display
                          : theme.ink(0x99),
                      },
                    ]}
                  >
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'][day]}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {!!period && (
            <View style={{ gap: 12 }}>
              {choices(
                'Period',
                [
                  ['week', 'Week'],
                  ['days', 'Custom days'],
                ],
                period.unit,
                (unit) =>
                  changePeriod({
                    unit: unit as GoalPeriod['unit'],
                    days: unit === 'week' ? 7 : period.days,
                    anchor:
                      unit === 'week'
                        ? weekAnchor(anchorDate, weekStart)
                        : anchorDate,
                  }),
              )}
              {period.unit === 'days' && (
                <NumberField
                  label="Days per period"
                  value={period.days}
                  onChange={(days) => changePeriod({ days })}
                />
              )}
              {choices(
                'Successful days',
                [
                  ['atLeast', 'At least'],
                  ['atMost', 'At most'],
                  ['between', 'Between'],
                ],
                period.operator,
                (operator) => {
                  const { upper: _upper, ...base } = period;
                  onChange({
                    ...value,
                    period: {
                      ...base,
                      operator: operator as GoalPeriod['operator'],
                      ...(operator === 'between'
                        ? {
                            upper: Math.max(
                              period.target,
                              Math.min(period.days, 5),
                            ),
                          }
                        : {}),
                    },
                  });
                },
              )}
              <View style={styles.wrap}>
                <NumberField
                  label={
                    period.operator === 'between'
                      ? 'Minimum days'
                      : 'Successful day count'
                  }
                  value={period.target}
                  onChange={(target) => changePeriod({ target })}
                />
                {period.operator === 'between' && (
                  <NumberField
                    label="Maximum days"
                    value={period.upper!}
                    onChange={(upper) => changePeriod({ upper })}
                  />
                )}
              </View>
            </View>
          )}
        </>
      )}
      {section === 'cycle' && (
        <>
          {choices(
            'Pattern',
            [
              ['none', 'None'],
              ['5:2:days', '5 days on / 2 off'],
              ['3:1:weeks', '3 weeks on / 1 off'],
              ['1:1:weeks', 'Alternate weeks'],
              ['custom', 'Custom'],
            ],
            !cycle
              ? 'none'
              : customCycle
                ? 'custom'
                : `${cycle.on}:${cycle.off}:${cycle.unit}`,
            (key) => {
              const { cycle: _cycle, ...base } = value;
              if (key === 'none') {
                onChange(base);
                return;
              }
              setCustomCycle(key === 'custom');
              if (key === 'custom') {
                if (!cycle)
                  onChange({
                    ...base,
                    cycle: { unit: 'days', on: 5, off: 2, anchor: anchorDate },
                  });
                return;
              }
              const [on, off, unit] = key.split(':');
              onChange({
                ...base,
                cycle: {
                  unit: unit as 'days' | 'weeks',
                  on: Number(on),
                  off: Number(off),
                  anchor: cycle?.anchor ?? anchorDate,
                },
              });
            },
          )}
          {!!cycle && (
            <View style={{ gap: 12 }}>
              {customCycle && (
                <>
                  {choices(
                    'Cycle unit',
                    [
                      ['days', 'Days'],
                      ['weeks', 'Weeks'],
                    ],
                    cycle.unit,
                    (unit) =>
                      onChange({
                        ...value,
                        cycle: { ...cycle, unit: unit as 'days' | 'weeks' },
                      }),
                  )}
                  <View style={styles.wrap}>
                    <NumberField
                      label="On"
                      value={cycle.on}
                      onChange={(on) =>
                        onChange({ ...value, cycle: { ...cycle, on } })
                      }
                    />
                    <NumberField
                      label="Off"
                      value={cycle.off}
                      onChange={(off) =>
                        onChange({ ...value, cycle: { ...cycle, off } })
                      }
                    />
                  </View>
                </>
              )}
              <StartDateField
                label="Cycle starts on"
                help="First day of an on period"
                value={cycle.anchor}
                onChange={(anchor) =>
                  onChange({ ...value, cycle: { ...cycle, anchor } })
                }
                colour={display}
                weekStart={weekStart}
              />
            </View>
          )}
        </>
      )}
    </View>
  );
}
const useStyles = themedStyles((t) => ({
  label: { fontSize: 12, color: t.ink(0x99) },
  text: { fontSize: 14, color: t.ink(0xdd) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  day: {
    minWidth: 44,
    minHeight: 44,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  input: {
    minHeight: 44,
    padding: 12,
    borderRadius: 10,
    backgroundColor: t.ink(0x22),
    fontSize: 17,
    color: t.ink(0xee),
  },
}));
