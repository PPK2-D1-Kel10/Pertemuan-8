import { useNow, wibParts } from '@/utils/sessionTime';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { subscribeClasses } from '@/services/classService';
import type { PracticumClass, CloudSession } from '@/types/cloud';
import { Button, Card } from './UI';
import { Field } from './Field';
import { SessionClassField } from './SessionClassField';
import { SessionDateTimeField } from './SessionDateTimeField';
import { useApp } from '@/context/AppContext';
import { ds } from '@/styles/dashboard';

export function SessionEditor({ session, onClose }: { session?: CloudSession; onClose: () => void }) {
  const { saveSession, profile, busy, offline } = useApp();
  const now = useNow();
  const minimum = wibParts(Math.ceil((now + 1) / 60000) * 60000);
  const [practicalName, setName] = useState(session?.practicalName ?? '');
  const [className, setClass] = useState(session?.className ?? '');
  const [date, setDate] = useState(session?.date ?? minimum.date);
  const [startTime, setStart] = useState(session?.startTime ?? '');
  const [endTime, setEnd] = useState(session?.endTime ?? '');
  const [assistantId, setAssistantId] = useState(session?.assistantId ?? profile?.uid ?? '');
  const [classes, setClasses] = useState<PracticumClass[]>([]);
  const [classId, setClassId] = useState(session?.classId ?? '');
  const [classError, setClassError] = useState('');
  useEffect(() => {
    if (!profile?.uid) return;
    return subscribeClasses(setClasses, profile.uid, err => setClassError(err.message));
  }, [profile?.uid]);
  const past = !!startTime && Date.parse(`${date}T${startTime}:00+07:00`) <= now;
  return <Card>
    <Text style={ds.cardTitle}>{session ? 'Ubah sesi' : 'Tambah sesi'}</Text>
    {classes.length > 0 && !session && <View style={ds.filters}>
      <Pressable onPress={() => setClassId('')} style={[ds.filter, !classId && ds.filterActive]}><Text style={ds.filterText}>Isi manual</Text></Pressable>
      {classes.map(item => <Pressable key={item.id} onPress={() => { setClassId(item.id); setClass(item.name); setName(item.practicumName); }} style={[ds.filter, classId === item.id && ds.filterActive]}><Text style={ds.filterText}>{item.practicumName} / {item.name}</Text></Pressable>)}
    </View>}
    {classError ? <Text style={ds.noticeText}>{classError}</Text> : null}
    {classId ? <Text style={ds.small}>Kelas terpilih: {practicalName} / {className}. Nama mengikuti data Kelola kelas.</Text> : <>
    <Field label="Nama praktikum" value={practicalName} onChangeText={setName} maxLength={120} />
    <SessionClassField value={className} onChange={setClass} />
    </>}
    <SessionDateTimeField label="Tanggal" mode="date" value={date} min={minimum.date} onChange={setDate} />
    <SessionDateTimeField label="Mulai (WIB)" mode="time" value={startTime} min={date === minimum.date ? minimum.time : undefined} onChange={setStart} />
    <SessionDateTimeField label="Selesai (WIB)" mode="time" value={endTime} min={startTime || undefined} onChange={setEnd} />
    <Field label="UID Asprak / kode gabung kelas" value={assistantId} onChangeText={setAssistantId} maxLength={128} />
    {past && <Text style={ds.noticeText}>Jam mulai sudah lewat. Pilih waktu yang akan datang.</Text>}
    <Text style={ds.small}>Gunakan UID akun Asprak sendiri. Bagikan UID ini kepada Praktikan untuk bergabung ke kelas. Jadwal menggunakan WIB.</Text>
    <Button label={busy ? 'Menyimpan…' : 'Simpan sesi'} disabled={busy || offline || past} onPress={async () => {
      if (await saveSession({ practicalName, className, date, startTime, endTime, assistantId: assistantId.trim(), ...(classId ? { classId } : {}) }, session?.id)) onClose();
    }} />
    <Button label="Batal" variant="secondary" disabled={busy} onPress={onClose} />
  </Card>;
}
