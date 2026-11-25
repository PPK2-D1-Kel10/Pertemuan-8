import { createElement } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { Text, View } from 'react-native';
import { ds } from '@/styles/dashboard';

const classes = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2', 'e1', 'e2', 'f1', 'f2'];

const selectStyle: CSSProperties = {
  appearance: 'none',
  backgroundColor: 'rgba(255,255,255,0.13)',
  border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: 25,
  boxSizing: 'border-box',
  color: '#FFFFFF',
  colorScheme: 'dark',
  fontSize: 15,
  minHeight: 50,
  padding: '14px 18px',
  width: '100%',
};

export function SessionClassField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const options = [
    createElement('option', { disabled: true, style: { backgroundColor: '#FFFFFF', color: '#667085' }, value: '' }, 'Pilih kelas'),
    ...classes.map((className) => createElement('option', {
      key: className,
      style: { backgroundColor: '#FFFFFF', color: '#15233B' },
      value: className,
    }, className)),
  ];

  return <View style={{ gap: 8 }}>
    <Text style={ds.loginLabel}>Kelas</Text>
    {createElement('select', {
      'aria-label': 'Kelas',
      onChange: (event: ChangeEvent<HTMLSelectElement>) => onChange(event.currentTarget.value),
      style: { ...selectStyle, color: value ? '#FFFFFF' : '#CBD5E1' },
      value,
    }, options)}
  </View>;
}
