import { useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { ds } from '@/styles/dashboard';

type PickerMode = 'date' | 'time';

function toPickerDate(mode: PickerMode, value: string) {
  if (mode === 'date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match) {
      const [, year, month, day] = match;
      const parsed = new Date(Number(year), Number(month) - 1, Number(day));
      if (parsed.getFullYear() === Number(year) && parsed.getMonth() === Number(month) - 1 && parsed.getDate() === Number(day)) return parsed;
    }
    return new Date();
  }

  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  const date = new Date();
  if (match) date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date;
}

function fromPickerDate(mode: PickerMode, value: Date) {
  if (mode === 'date') {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

export function SessionDateTimeField({
  label, mode, value, onChange, min,
}: {
  min?: string;
  label: string;
  mode: PickerMode;
  value: string;
  onChange: (value: string) => void;
}) {
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState(() => toPickerDate(mode, value));

  const openPicker = () => {
    setDraft(toPickerDate(mode, value));
    setVisible(true);
  };
  const commit = (date: Date) => {
    const value = fromPickerDate(mode, date);
    if (min && value < min) { setError('Pilih tanggal atau jam yang belum lewat.'); setVisible(false); return; }
    setError('');
    onChange(value);
    setVisible(false);
  };

  return <View style={{ gap: 8 }}>
    <Text style={ds.loginLabel}>{label}</Text>
    {error ? <Text style={ds.noticeText}>{error}</Text> : null}
    <Pressable
      accessibilityLabel={`${label}: ${value || 'Pilih'}`}
      accessibilityRole="button"
      onPress={openPicker}
      style={ds.passwordRow}
    >
      <Text style={[ds.loginInput, { color: value ? '#FFFFFF' : '#CCD5E5' }]}>{value || (mode === 'date' ? 'Pilih tanggal' : 'Pilih jam')}</Text>
    </Pressable>
    {visible && Platform.OS === 'android' && (
      <DateTimePicker
        is24Hour
        minimumDate={mode === 'date' && min ? toPickerDate('date', min) : undefined}
        mode={mode}
        onDismiss={() => setVisible(false)}
        onValueChange={(_, selectedDate) => commit(selectedDate)}
        value={draft}
      />
    )}
    {Platform.OS === 'ios' && (
      <Modal animationType="fade" onRequestClose={() => setVisible(false)} transparent visible={visible}>
        <View style={{ backgroundColor: 'rgba(12,22,45,0.65)', flex: 1, justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 24, gap: 12, padding: 16 }}>
            <DateTimePicker
              display="spinner"
              is24Hour
              minimumDate={mode === 'date' && min ? toPickerDate('date', min) : undefined}
              mode={mode}
              onValueChange={(_, selectedDate) => setDraft(selectedDate)}
              themeVariant="light"
              value={draft}
            />
            <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'flex-end' }}>
              <Pressable accessibilityRole="button" onPress={() => setVisible(false)} style={{ padding: 12 }}>
                <Text style={{ color: '#15233B', fontWeight: '700' }}>Batal</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => commit(draft)} style={{ backgroundColor: '#1465CF', borderRadius: 18, padding: 12 }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Pilih</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    )}
  </View>;
}
