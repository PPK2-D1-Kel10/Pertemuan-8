import { createElement } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { Text, View } from 'react-native';
import { ds } from '@/styles/dashboard';

const inputStyle: CSSProperties = {
  backgroundColor: 'transparent',
  border: 0,
  boxSizing: 'border-box',
  color: '#FFFFFF',
  colorScheme: 'dark',
  flex: 1,
  fontFamily: 'inherit',
  fontSize: 15,
  minHeight: 50,
  outline: 'none',
  padding: '14px 18px',
  width: '100%',
};

export function SessionDateTimeField({
  label, mode, value, onChange, min,
}: {
  min?: string;
  label: string;
  mode: 'date' | 'time';
  value: string;
  onChange: (value: string) => void;
}) {
  return <View style={{ gap: 8 }}>
    <Text style={ds.loginLabel}>{label}</Text>
    <View style={ds.passwordRow}>
      {createElement('input', {
        'aria-label': label,
        min,
        onChange: (event: ChangeEvent<HTMLInputElement>) => (!min || event.currentTarget.value >= min) && onChange(event.currentTarget.value),
        step: mode === 'time' ? 60 : undefined,
        style: inputStyle,
        type: mode,
        value,
      })}
    </View>
  </View>;
}
