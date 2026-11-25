import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ds } from '@/styles/dashboard';
import { glassTheme } from '@/styles/theme';
import { Icon } from './UI';

const classes = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2', 'e1', 'e2', 'f1', 'f2'];

export function SessionClassField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  return <View style={{ gap: 8 }}>
    <Text style={ds.loginLabel}>Kelas</Text>
    <Pressable
      accessibilityLabel={`Kelas: ${value || 'Pilih kelas'}`}
      accessibilityRole="button"
      onPress={() => setVisible(true)}
      style={ds.passwordRow}
    >
      <Text style={[ds.loginInput, { color: value ? glassTheme.text : '#CCD5E5' }]}>{value || 'Pilih kelas'}</Text>
      <Icon name="chevron-down-outline" size={18} />
    </Pressable>
    <Modal animationType="fade" onRequestClose={() => setVisible(false)} transparent visible={visible}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Pressable
          accessibilityLabel="Tutup pilihan kelas"
          onPress={() => setVisible(false)}
          style={{ backgroundColor: 'rgba(12,22,45,0.65)', ...StyleSheet.absoluteFill }}
        />
        <View style={{ backgroundColor: glassTheme.drawer, borderColor: glassTheme.border, borderRadius: 24, borderWidth: 1, gap: 12, maxHeight: '80%', padding: 20 }}>
          <Text style={ds.cardTitle}>Pilih kelas</Text>
          <ScrollView>
            {classes.map((className) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: value === className }}
                key={className}
                onPress={() => { onChange(className); setVisible(false); }}
                style={{ backgroundColor: value === className ? glassTheme.primary : 'transparent', borderRadius: 12, padding: 14 }}
              >
                <Text style={{ color: glassTheme.text, fontSize: 15 }}>{className}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}
