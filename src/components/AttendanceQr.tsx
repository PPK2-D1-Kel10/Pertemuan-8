import { useState } from 'react';
import { Modal, Text, View, useWindowDimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Button, Card } from './UI';
import { useApp } from '@/context/AppContext';
import { generateQr, type AttendanceQr as Qr } from '@/services/repository';
import { errorMessage } from '@/services/errors';
import { sessionInTime, useNow } from '@/utils/sessionTime';
import type { CloudSession } from '@/types/cloud';
import { ds } from '@/styles/dashboard';

export function AttendanceQr({ session }: { session: CloudSession }) {
  const { profile, offline } = useApp();
  const [qr, setQr] = useState<(Qr & { offset: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [large, setLarge] = useState(false);
  const now = useNow();
  const { width, height } = useWindowDimensions();
  const serverNow = now + (qr?.offset ?? 0);
  const live = !session.deleted && session.status === 'Berlangsung' && sessionInTime(session, serverNow);
  const remaining = qr ? Math.max(0, Math.ceil((qr.expiresAt - serverNow) / 1000)) : 0;
  const visible = live && remaining > 0 && qr;
  if (profile?.role !== 'Asisten' || profile.uid !== session.assistantId) return null;
  const generate = async () => {
    setBusy(true); setError('');
    try { const result = await generateQr(session.id); setQr({ ...result, offset: result.serverNow - Date.now() }); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };
  const timer = `Berlaku ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} lagi`;
  return <Card>
    <Text style={ds.cardTitle}>QR presensi</Text>
    <Text style={ds.small}>QR berlaku maksimal 15 menit dan berhenti saat sesi berakhir. Generate ulang membatalkan QR sebelumnya.</Text>
    {visible && <View style={{ alignItems: 'center', gap: 16 }}>
      <QRCode value={qr.payload} size={Math.max(140, Math.min(260, width - 120))} quietZone={16} />
      <Text style={ds.subtitle}>{timer}</Text>
      <Button label="Tampilkan besar untuk TV" onPress={() => setLarge(true)} />
    </View>}
    {!live && <Text style={ds.noticeText}>QR hanya tersedia pada jam sesi berlangsung setelah sesi dibuka.</Text>}
    {live && qr && !remaining && <Text style={ds.noticeText}>QR sudah kedaluwarsa. Generate QR baru.</Text>}
    {error ? <Text accessibilityRole="alert" style={ds.noticeText}>{error}</Text> : null}
    <Button label={busy ? 'Membuat QR…' : qr ? 'Generate QR baru' : 'Generate QR presensi'} disabled={!live || busy || offline} onPress={generate} />
    <Modal visible={large && !!visible} onRequestClose={() => setLarge(false)} animationType="fade">
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>
        <Text style={{ color: '#15233B', fontSize: 24, fontWeight: '700', textAlign: 'center' }}>{session.practicalName} / {session.className}</Text>
        {visible && <QRCode value={qr.payload} size={Math.max(100, Math.min(width - 80, height - 250, 650))} quietZone={20} />}
        <Text style={{ color: '#15233B', fontSize: 24 }}>{timer}</Text>
        <Text style={{ color: '#15233B' }}>Pindai melalui halaman presensi PraktiKu</Text>
        <Button label="Tutup tampilan TV" onPress={() => setLarge(false)} />
      </View>
    </Modal>
  </Card>;
}
