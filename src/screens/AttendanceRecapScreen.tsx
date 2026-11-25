import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SessionStatusBadge } from '@/components/SessionStatusBadge';
import { Button, Card, EmptyState, Screen, StatusBadge } from '@/components/UI';
import { useApp } from '@/context/AppContext';
import { ds } from '@/styles/dashboard';

export default function AttendanceRecapScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const { state, permissions, enrollments } = useApp();
  const selectedId = Array.isArray(id) ? id[0] : id;
  const sessions = state.sessions.filter((session) => !selectedId || session.id === selectedId);
  const sessionIds = new Set(sessions.map((session) => session.id));
  const records = state.attendance.filter((record) => sessionIds.has(record.sessionId));

  return (
    <Screen title="Rekap kehadiran" subtitle="Lihat jumlah peserta, NIM, dan waktu presensi setiap sesi.">
      {state.role !== 'Asisten' ? (
        <EmptyState message="Rekap peserta hanya tersedia untuk asisten." />
      ) : (
        <>
          <View style={ds.stats}>
            <View style={ds.stat}>
              <Text style={ds.statNumber}>{records.length}</Text>
              <Text style={ds.statLabel}>Catatan kehadiran</Text>
            </View>
            <View style={ds.stat}>
              <Text style={ds.statNumber}>{sessions.length}</Text>
              <Text style={ds.statLabel}>Sesi ditampilkan</Text>
            </View>
          </View>
          <Text style={ds.sectionTitle}>Pilih sesi</Text>
          <View style={ds.filters}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: !selectedId }}
              onPress={() => router.setParams({ id: undefined })}
              style={[ds.filter, !selectedId && ds.filterActive]}
            >
              <Text style={[ds.filterText, !selectedId && ds.filterActiveText]}>Semua sesi</Text>
            </Pressable>
            {state.sessions.map((session) => (
              <Pressable
                key={session.id}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedId === session.id }}
                onPress={() => router.setParams({ id: session.id })}
                style={[ds.filter, selectedId === session.id && ds.filterActive]}
              >
                <Text style={[ds.filterText, selectedId === session.id && ds.filterActiveText]}>
                  {session.practicalName} / {session.className}
                </Text>
              </Pressable>
            ))}
          </View>
          {sessions.length ? sessions.map((session) => {
            const participants = records.filter((record) => record.sessionId === session.id);
            const end = Date.parse(`${session.date}T${session.endTime}:00+07:00`);
            const members = enrollments.filter(member => member.assistantId === session.assistantId && (member.createdAt?.toMillis() ?? Infinity) < end);
            const memberIds = [...new Set([...members.map(member => member.studentId), ...participants.map(record => record.studentId)])];
            const missing = memberIds.filter(uid => !participants.some(record => record.studentId === uid));
            return (
              <Card key={session.id}>
                <Text style={ds.cardTitle}>{session.practicalName}</Text>
                <Text style={ds.small}>{session.className} / {session.date}</Text>
                <Text style={ds.small}>{session.startTime} - {session.endTime} WIB</Text>
                <SessionStatusBadge status={session.status} />
                <Text style={ds.sectionTitle}>Peserta hadir ({participants.length})</Text>
                {participants.length ? participants.map((record) => (
                  <View key={record.id} style={ds.column}>
                    <View style={ds.divider} />
                    <View style={ds.wrap}>
                      <View style={ds.grow}>
                        <Text style={ds.cardTitle}>{record.studentName}</Text>
                        <Text style={ds.small}>NIM {record.studentNumber}</Text>
                      </View>
                      <StatusBadge status="Hadir" />
                    </View>
                    <Text style={ds.small}>Presensi pukul {record.attendanceTime} WIB</Text>
                  </View>
                )) : (
                  <Text style={ds.subtitle}>Belum ada peserta yang melakukan presensi pada sesi ini.</Text>
                )}
                <Text style={ds.sectionTitle}>Peserta lainnya ({missing.length})</Text>
                {missing.map((uid) => {
                  const permission = permissions.find((p) => p.sessionId === session.id && p.studentId === uid);
                  const member = members.find(item => item.studentId === uid);
                  return <View key={uid} style={ds.column}>
                    <Text selectable style={ds.small}>{member ? `${member.studentName} / ${member.studentNumber}` : permission ? `${permission.studentName} / ${permission.studentNumber}` : `UID: ${uid}`}</Text>
                    <StatusBadge status={permission?.status === 'Diterima' ? 'Izin diterima' : permission ? `Izin: ${permission.status}` : session.status === 'Selesai' ? 'Tidak presensi' : 'Belum presensi'} />
                  </View>;
                })}
                <Text style={ds.small}>{participants.length} hadir dari {memberIds.length} peserta terdaftar.</Text>
                <Button label="Lihat detail sesi" variant="secondary" onPress={() => router.push({
                  pathname: '/detail', params: { id: session.id },
                })} />
              </Card>
            );
          }) : <EmptyState message={selectedId ? 'Sesi praktikum tidak ditemukan. Pilih sesi lain atau semua sesi.' : 'Belum ada sesi praktikum untuk direkap.'} />}
          <Text style={ds.small}>Rekap menampilkan peserta terdaftar, presensi, dan status pengajuan izin. Identitas peserta tanpa catatan ditampilkan sebagai UID.</Text>
          <Button label="Kembali ke kelola sesi" variant="secondary" onPress={() => router.replace('/schedule')} />
        </>
      )}
    </Screen>
  );
}
