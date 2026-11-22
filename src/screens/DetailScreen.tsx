import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, EmptyState, Screen, SessionCard, StatusBadge } from '@/components/UI';
import { useApp } from '@/context/AppContext';
import { ds } from '@/styles/dashboard';

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, dispatch, busy, offline } = useApp();
  const [confirmClose, setConfirmClose] = useState(false);
  const session = state.sessions.find((item) => item.id === id);
  const records = state.attendance.filter((record) => record.sessionId === id);
  const assistant = state.role === 'Asisten';
  return <Screen title="Detail sesi" subtitle="Informasi praktikum dan status kehadiran.">
    {session ? <>
      <SessionCard session={session} />
      {session.deleted && <Text style={ds.noticeText}>Sesi sudah dihapus dari jadwal. Riwayat tetap tersedia.</Text>}
      {!assistant && !session.deleted && <Button label="Ajukan izin / lihat status izin" variant="secondary" onPress={() => router.push({ pathname: '/permissions', params: { sessionId: session.id } })} />}
      {assistant && !session.deleted ? <Card>
        <Text style={ds.cardTitle}>Kontrol sesi</Text>
        <Text style={ds.subtitle}>{session.status === 'Belum Dibuka' ? 'Buka sesi agar praktikan dapat mencatat kehadiran.' : session.status === 'Berlangsung' ? 'Presensi sedang dibuka. Tutup sesi setelah kegiatan selesai.' : 'Sesi sudah ditutup. Rekap kehadiran tetap dapat dilihat.'}</Text>
        {session.status === 'Belum Dibuka' && <Button label="Buka sesi presensi" disabled={busy || offline} onPress={() => { void dispatch({ type: 'open', sessionId: session.id }); }} />}
        {session.status === 'Berlangsung' && (!confirmClose ? <Button label="Tutup sesi" variant="danger" disabled={busy || offline} onPress={() => setConfirmClose(true)} /> : <View style={{ gap: 12 }}><Text style={ds.noticeText}>Tutup sesi sekarang? Praktikan tidak dapat presensi lagi setelah sesi ditutup.</Text><Button label="Ya, tutup sesi" disabled={busy || offline} variant="danger" onPress={async () => { if (await dispatch({ type: 'close', sessionId: session.id })) setConfirmClose(false); }} /><Button label="Batal" variant="secondary" onPress={() => setConfirmClose(false)} /></View>)}
      </Card> : !assistant && <Button label={records.some((record) => record.studentId === state.username) ? 'Lihat status presensi' : 'Buka halaman presensi'} onPress={() => router.push({ pathname: '/attendance', params: { id: session.id } })} />}
      {assistant && <><Text style={ds.sectionTitle}>Peserta hadir ({records.length})</Text>{records.length ? records.map((record) => <Card key={record.id}><View style={ds.row}><View style={ds.grow}><Text style={ds.cardTitle}>{record.studentName}</Text><Text style={ds.small}>NIM {record.studentNumber}</Text></View><StatusBadge status="Hadir" /></View><Text style={ds.small}>Presensi pukul {record.attendanceTime} WIB</Text></Card>) : <EmptyState message="Belum ada peserta yang melakukan presensi pada sesi ini." />}</>}
    </> : <EmptyState message="Sesi praktikum tidak ditemukan." />}
    <Button label="Kembali ke jadwal" variant="secondary" onPress={() => router.replace('/schedule')} />
  </Screen>;
}
