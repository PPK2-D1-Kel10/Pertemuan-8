import { classifyLeaveReason, getBackendBaseUrl } from '@/services/aiService';
import { firebase } from '@/services/firebase';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, EmptyState, Screen, StatusBadge } from '@/components/UI';
import { Field } from '@/components/Field';
import { useApp } from '@/context/AppContext';
import { ds } from '@/styles/dashboard';
import type { PermissionStatus } from '@/types/cloud';

const statuses = ['Semua', 'Menunggu Pemeriksaan', 'Diterima', 'Ditolak'] as const;
export default function PermissionsScreen() {
  const { sessionId: initialSession } = useLocalSearchParams<{ sessionId?: string }>();
  const { state, permissions, submitPermission, reviewPermission, retryClassification, busy, offline } = useApp();
  const assistant = state.role === 'Asisten';
  const [sessionId, setSessionId] = useState(initialSession ?? '');
  const [reviewNotes, setReviewNotes] = useState('');
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState('');
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<PermissionStatus | 'Semua'>('Semua');
  const [category, setCategory] = useState('Semua');
  const [decision, setDecision] = useState<{ id: string; status: 'Diterima' | 'Ditolak' } | null>(null);
  const categories = ['Semua', ...new Set(permissions.map((p) => p.aiCategory ?? 'Belum tersedia'))];
  const eligible = state.sessions.filter((s) => !s.deleted && !permissions.some((p) => p.sessionId === s.id) && !state.attendance.some(record => record.sessionId === s.id));
  const filtered = permissions.filter((p) => (filter === 'Semua' || p.status === filter) && (category === 'Semua' || (p.aiCategory ?? 'Belum tersedia') === category));
  return <Screen title={assistant ? 'Pemeriksaan izin' : 'Pengajuan & riwayat izin'} subtitle="Klasifikasi AI membantu membaca alasan. Keputusan akhir tetap dibuat Asisten.">
    {aiNotice ? <Text style={ds.noticeText}>{aiNotice}</Text> : null}
    {!assistant && <Card>
      <Text style={ds.cardTitle}>Ajukan izin</Text>
      <Text style={ds.small}>Pilih sesi praktikum</Text>
      <View style={ds.filters}>{eligible.map((s) => <Pressable key={s.id} accessibilityRole="button" accessibilityState={{ selected: s.id === sessionId }} onPress={() => setSessionId(s.id)} style={[ds.filter, s.id === sessionId && ds.filterActive]}><Text style={ds.filterText}>{s.practicalName} / {s.className} / {s.date}</Text></Pressable>)}</View>
      {!eligible.length && <Text style={ds.subtitle}>Tidak ada sesi yang tersedia untuk pengajuan baru. Gabung melalui UID Asprak terlebih dahulu. Sesi yang sudah dihadiri atau sudah diajukan izin tidak tersedia.</Text>}
      <Field label="Alasan ketidakhadiran" multiline value={reason} onChangeText={setReason} maxLength={2000} />
      <Text style={ds.small}>{reason.length}/2000 karakter. Alasan dianalisis oleh model klasifikasi; sertakan informasi yang relevan saja.</Text>
      <Button label={busy ? 'Menyimpan…' : 'Kirim pengajuan'} disabled={busy || offline || !eligible.some((s) => s.id === sessionId)} onPress={async () => {
        if (await submitPermission(sessionId, reason)) { setReason(''); setSessionId(''); setNotice('Pengajuan tersimpan dan menunggu pemeriksaan Asisten.'); }
      }} />
      {notice ? <Text accessibilityLiveRegion="polite" style={ds.successText}>{notice}</Text> : null}
    </Card>}
    <Text style={ds.sectionTitle}>Filter status</Text>
    <View style={ds.filters}>{statuses.map((s) => <Pressable accessibilityRole="button" accessibilityState={{ selected: filter === s }} key={s} onPress={() => setFilter(s)} style={[ds.filter, filter === s && ds.filterActive]}><Text style={ds.filterText}>{s}</Text></Pressable>)}</View>
    {assistant && <><Text style={ds.sectionTitle}>Filter kategori AI</Text><View style={ds.filters}>{categories.map((c) => <Pressable key={c} accessibilityRole="button" accessibilityState={{ selected: category === c }} onPress={() => setCategory(c)} style={[ds.filter, category === c && ds.filterActive]}><Text style={ds.filterText}>{c}</Text></Pressable>)}</View></>}
    {!filtered.length && <EmptyState message="Belum ada pengajuan yang cocok dengan filter." />}
    {filtered.map((p) => {
      const session = state.sessions.find((s) => s.id === p.sessionId);
      return <Card key={p.id}>
        <Text style={ds.cardTitle}>{p.studentName} / {p.studentNumber}</Text>
        <Text style={ds.subtitle}>{session ? `${session.practicalName} / ${session.className} / ${session.date}${session.deleted ? ' (dihapus dari jadwal)' : ''}` : `Sesi ${p.sessionId}`}</Text>
        <StatusBadge status={p.status} />
        <Text style={ds.small}>Diajukan: {p.createdAt?.toDate().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) ?? 'Menunggu server'} WIB</Text>
        <Text style={ds.subtitle}>Alasan: {p.reason}</Text>
        <Text style={ds.noticeText}>AI: {p.aiStatus === 'completed' ? p.aiCategory : p.aiStatus === 'failed' ? 'Klasifikasi gagal. Pengajuan tetap dapat diperiksa.' : 'Menunggu klasifikasi. Pengajuan tetap dapat diperiksa.'}</Text>
        <Text style={ds.small}>Model: {p.aiModelVersion ?? 'baseline'}. Kategori adalah saran, bukan keputusan izin.</Text>
        {p.aiConfidence != null && <Text style={ds.small}>Keyakinan model: {Math.round(p.aiConfidence * 100)}%</Text>}
        {p.aiExplanation ? <Text style={ds.small}>{p.aiExplanation}</Text> : null}
        {p.reviewNotes ? <Text style={ds.small}>Catatan Asprak: {p.reviewNotes}</Text> : null}
        {getBackendBaseUrl() && <Button label={aiBusy === p.id ? 'Menganalisis…' : 'Analisis dengan Gemini'} disabled={busy || offline || !!aiBusy} variant="secondary" onPress={async () => {
          setAiBusy(p.id); setAiNotice('');
          try {
            const idToken = await firebase().auth.currentUser?.getIdToken();
            const result = await classifyLeaveReason(p.reason, { leaveId: p.id, idToken });
            setAiNotice(result.status === 'success' && result.persistedByBackend ? 'Analisis Gemini tersimpan. Keputusan tetap oleh Asprak.' : 'Gemini belum tersedia atau hasil belum tersimpan. Klasifikasi yang tersimpan tetap dipakai.');
          } catch { setAiNotice('Gemini belum dapat dihubungi. Pengajuan tetap tersimpan.'); }
          finally { setAiBusy(null); }
        }} />}
        {p.aiStatus !== 'completed' && <Button label="Coba klasifikasi AI" variant="secondary" disabled={busy || offline} onPress={() => { void retryClassification(p.id); }} />}
        {p.reviewedBy && <Text selectable style={ds.small}>Diperiksa oleh {p.reviewedBy}, {p.reviewedAt?.toDate().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) ?? 'Menunggu server'} WIB</Text>}
        {assistant && p.status === 'Menunggu Pemeriksaan' && (decision?.id === p.id ? <View style={ds.column}>
          <Field label="Catatan Asprak (opsional)" value={reviewNotes} onChangeText={setReviewNotes} multiline maxLength={1000} />
          <Text style={ds.noticeText}>Tetapkan pengajuan ini sebagai {decision.status}? Keputusan tidak dapat diubah dari aplikasi.</Text>
          <Button label="Konfirmasi keputusan" disabled={busy || offline} onPress={async () => { if (await reviewPermission(p.id, decision.status, reviewNotes)) { setDecision(null); setReviewNotes(''); } }} />
          <Button label="Batal" variant="secondary" disabled={busy} onPress={() => setDecision(null)} />
        </View> : <View style={ds.wrap}>
          <Button label="Terima izin" disabled={busy || offline} onPress={() => { setReviewNotes(''); setDecision({ id: p.id, status: 'Diterima' }); }} />
          <Button label="Tolak izin" disabled={busy || offline} variant="danger" onPress={() => { setReviewNotes(''); setDecision({ id: p.id, status: 'Ditolak' }); }} />
        </View>)}
      </Card>;
    })}
  </Screen>;
}
