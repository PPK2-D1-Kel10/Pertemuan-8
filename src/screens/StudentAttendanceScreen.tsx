import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { Button, Card, EmptyState, Screen, SessionCard, StatusBadge } from '@/components/UI';
import { useApp } from '@/context/AppContext';
import { ds } from '@/styles/dashboard';
import { glassTheme } from '@/styles/theme';
import { LAB, validateAttendance, validateLabRadius, type Coordinates } from '@/utils/attendanceValidation';

type Checked = ReturnType<typeof validateLabRadius> & { coords: Coordinates; accuracy: number | null };

// Every failure becomes a message the student can act on: denied permission, location off/unavailable, or mocked GPS.
async function currentPosition() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error(permission.canAskAgain
    ? 'Izin lokasi ditolak. Izinkan akses lokasi agar kehadiranmu dapat divalidasi.'
    : 'Izin lokasi ditolak permanen. Aktifkan izin lokasi untuk aplikasi ini di pengaturan perangkat.');
  if (!(await Location.hasServicesEnabledAsync())) throw new Error('Layanan lokasi perangkat mati. Aktifkan GPS/lokasi lalu coba lagi.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const position = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    new Promise<never>((_, reject) => { timer = setTimeout(reject, 20000); }),
  ]).catch(() => { throw new Error('Lokasi tidak tersedia. Pastikan GPS aktif dan sinyal memadai, lalu coba lagi.'); })
    .finally(() => clearTimeout(timer));
  if (position.mocked) throw new Error('Lokasi palsu terdeteksi. Matikan aplikasi pemalsu lokasi lalu coba lagi.');
  return position.coords;
}

export default function StudentAttendanceScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, profile, dispatch, busy, offline, error } = useApp();
  const [locating, setLocating] = useState(false);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [locationError, setLocationError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const session = state.sessions.find((item) => item.id === id);
  const mine = state.attendance.find((record) => record.sessionId === id && record.studentId === state.username);
  const validation = validateAttendance({ studentId: state.username, role: state.role, session, attendance: state.attendance });
  const blocked = !validation.valid || busy || offline || !!session?.deleted;

  const check = async () => {
    setLocating(true); setLocationError(''); setChecked(null);
    try {
      const coords = await currentPosition();
      const result = { ...validateLabRadius(coords), coords: { latitude: coords.latitude, longitude: coords.longitude }, accuracy: coords.accuracy };
      setChecked(result);
      if (result.valid) setConfirming(true);
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : 'Lokasi tidak tersedia. Coba lagi.');
    } finally {
      setLocating(false);
    }
  };
  const close = () => setConfirming(false);
  const confirm = async () => {
    if (!session || !checked?.valid || blocked) return;
    if (await dispatch({ type: 'attend', sessionId: session.id, location: checked.coords })) close();
  };

  return <Screen title="Presensi praktikum" subtitle={`Kehadiran tercatat hanya saat sesi dibuka dan kamu berada maksimal ${LAB.radiusMeters} m dari ${LAB.name}.`}>
    {session ? <>
      <SessionCard session={session} />
      <Card>
        <Text style={ds.cardTitle}>Presensi saya</Text>
        <Text style={ds.small}>NIM {profile?.nim}</Text>
        {mine ? <View style={ds.success} accessibilityLiveRegion="polite">
          <Text style={ds.successText}>Kehadiran berhasil tercatat</Text>
          <Text style={ds.successText}>NIM {mine.studentNumber} / {mine.attendanceTime} WIB</Text>
        </View> : <>
          <StatusBadge status={session.status === 'Selesai' ? 'Tidak presensi' : 'Belum presensi'} />
          <Text style={ds.subtitle}>{validation.valid ? 'Ambil lokasi perangkat untuk memvalidasi bahwa kamu berada di laboratorium.' : validation.message}</Text>
          {checked && <View style={checked.valid ? ds.success : ds.notice} accessibilityLiveRegion="polite">
            <Text style={checked.valid ? ds.successText : ds.noticeText}>{checked.valid ? `Lokasi valid: ${checked.distance} m dari ${LAB.name}.` : checked.message}</Text>
            {checked.accuracy != null && <Text style={ds.small}>Akurasi GPS ±{Math.round(checked.accuracy)} m</Text>}
          </View>}
          {locationError ? <Text accessibilityRole="alert" style={ds.loginError}>{locationError}</Text> : null}
          <Button label={locating ? 'Mengambil lokasi…' : checked || locationError ? 'Cek lokasi lagi' : 'Cek lokasi & presensi'} disabled={blocked || locating} onPress={check} />
        </>}
      </Card>
      <Modal visible={confirming} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.overlay}>
          <Pressable style={ds.scrim} accessibilityRole="button" accessibilityLabel="Batalkan presensi" onPress={close} />
          <View style={styles.dialog} accessibilityViewIsModal>
            <ScrollView contentContainerStyle={styles.dialogContent}>
              <Text accessibilityRole="header" style={ds.cardTitle}>Konfirmasi presensi</Text>
              <Text style={ds.subtitle}>{session.practicalName} / {session.className}</Text>
              <Text style={ds.small}>NIM {profile?.nim} / Status sesi: {session.status} / {checked?.distance} m dari {LAB.name}</Text>
              <Text style={ds.noticeText} accessibilityLiveRegion="polite">{validation.valid ? 'Catat kehadiran sekarang? Waktu presensi dicatat saat kamu mengonfirmasi.' : validation.message}</Text>
              {error ? <Text accessibilityRole="alert" style={ds.loginError}>{error}</Text> : null}
              <Button label={busy ? 'Menyimpan…' : 'Ya, catat kehadiran'} disabled={blocked} onPress={confirm} />
              <Button label="Batal" variant="secondary" onPress={close} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </> : <EmptyState message="Sesi praktikum tidak ditemukan." />}
    <Button label="Kembali" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/schedule'))} />
  </Screen>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 440, maxHeight: '90%', backgroundColor: glassTheme.drawer, borderRadius: 28, borderWidth: 1, borderColor: glassTheme.border },
  dialogContent: { padding: 24, gap: 16 },
});
