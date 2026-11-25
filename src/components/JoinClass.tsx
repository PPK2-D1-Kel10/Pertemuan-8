import { useState } from 'react';
import { Text } from 'react-native';
import { Button, Card } from './UI';
import { Field } from './Field';
import { useApp } from '@/context/AppContext';
import { ds } from '@/styles/dashboard';
export function JoinClass() {
  const { joinClass, busy, offline } = useApp();
  const [code, setCode] = useState('');
  const [joined, setJoined] = useState(false);
  return <Card>
    <Text style={ds.cardTitle}>Gabung kelas Asprak</Text>
    <Text style={ds.small}>Tempel UID yang dibagikan Asprak. Seluruh jadwal Asprak akan muncul setelah kamu bergabung.</Text>
    <Field label="UID Asprak" value={code} onChangeText={value => { setCode(value); setJoined(false); }} autoCapitalize="none" maxLength={128} />
    <Button label={busy ? 'Memproses…' : 'Gabung kelas'} disabled={busy || offline || !code.trim()} onPress={async () => { if (await joinClass(code)) setJoined(true); }} />
    {joined && <Text accessibilityLiveRegion="polite" style={ds.successText}>Berhasil bergabung. Jadwal kelas diperbarui otomatis.</Text>}
  </Card>;
}
