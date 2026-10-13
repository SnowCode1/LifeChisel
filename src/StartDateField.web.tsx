import { TextInput, Text } from './Typography';
import { View } from 'react-native';
import { validDate } from '@onpurpose/core/storage/model';
import type { StartDateFieldProps } from './StartDateField';
import { useTheme } from './ThemeContext';

export function StartDateField({
  value,
  onChange,
  colour,
  label = 'Start date',
  help = 'Choose an earlier date to fill in old records. Statistics begin here.',
}: StartDateFieldProps) {
  const theme = useTheme();
  const valid = validDate(value);
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: theme.ink(0xaa), fontSize: 12 }}>
        {label} · YYYY-MM-DD
      </Text>
      <TextInput
        accessibilityLabel={
          label === 'Start date' ? 'Habit start date, YYYY-MM-DD' : label
        }
        value={value}
        onChangeText={onChange}
        maxLength={10}
        autoCorrect={false}
        selectionColor={theme.colour(colour)}
        style={{
          minHeight: 44,
          borderRadius: 12,
          padding: 14,
          color: theme.ink(0xe5),
          backgroundColor: theme.ink(0x1c),
          fontSize: 17,
        }}
      />
      {(!valid || !!help) && (
        <Text
          style={{
            color: valid ? theme.ink(0x99) : theme.colour('#F0A798'),
            fontSize: 12,
            lineHeight: 18,
          }}
        >
          {valid ? help : 'Enter a valid date, for example 2026-10-04.'}
        </Text>
      )}
    </View>
  );
}
