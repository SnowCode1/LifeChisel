import { Text, TextInput } from './Typography';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { localDateKey } from '@onpurpose/core/calendar';
import { DateCalendar } from './DateCalendar';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import { useTheme } from './ThemeContext';

export type StartDateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  colour: string;
  label?: string;
  help?: string;
  weekStart?: WeekStart;
};
export function StartDateField({
  value,
  onChange,
  colour,
  label = 'Start date',
  help = 'Choose an earlier date to fill in old records. Statistics begin here.',
  weekStart,
}: StartDateFieldProps) {
  const theme = useTheme();
  const displayColour = theme.colour(colour);
  // Android opens our calendar inline beneath the field, inside this editor.
  const [open, setOpen] = useState(false);
  const date = new Date(`${value}T12:00:00`);
  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Text style={{ color: theme.ink(0xaa), fontSize: 12 }}>{label}</Text>
        {Platform.OS === 'web' ? (
          <TextInput
            accessibilityLabel={label}
            value={value}
            onChangeText={onChange}
            maxLength={10}
            placeholder="YYYY-MM-DD"
            style={{
              color: displayColour,
              minHeight: 44,
              paddingHorizontal: 12,
              fontSize: 15,
              backgroundColor: theme.ink(0x1c),
              borderRadius: 10,
            }}
          />
        ) : Platform.OS === 'ios' ? (
          <DateTimePicker
            accessibilityLabel={
              label === 'Start date' ? 'Habit start date' : label
            }
            value={date}
            mode="date"
            display="compact"
            themeVariant={theme.scheme}
            accentColor={displayColour}
            onValueChange={(_, selected) => onChange(localDateKey(selected))}
            style={{ minHeight: 44 }}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${date.toLocaleDateString()}`}
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((shown) => !shown)}
            style={{
              minHeight: 44,
              justifyContent: 'center',
              paddingHorizontal: 12,
              backgroundColor: theme.ink(0x1c),
              borderRadius: 10,
            }}
          >
            <Text style={{ color: displayColour, fontSize: 15 }}>
              {date.toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </Text>
          </Pressable>
        )}
      </View>
      {open && Platform.OS === 'android' && (
        <DateCalendar
          value={value}
          today={localDateKey(new Date())}
          accent={displayColour}
          weekStart={weekStart}
          onChange={(day) => {
            onChange(day);
            setOpen(false);
          }}
        />
      )}
      {!!help && (
        <Text style={{ color: theme.ink(0x99), fontSize: 12, lineHeight: 18 }}>
          {help}
        </Text>
      )}
    </View>
  );
}
