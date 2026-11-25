import { JoinClass } from '@/components/JoinClass';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { EmptyState, Screen, SessionCard } from '@/components/UI';
import { useApp } from '@/context/AppContext';
import { ds } from '@/styles/dashboard';
import type { SessionStatus } from '@/types';

const filters: ('Semua' | SessionStatus)[] = ['Semua', 'Belum Dibuka', 'Berlangsung', 'Selesai'];
export default function ScheduleScreen() {
  const { state } = useApp();
  const [filter, setFilter] = useState<typeof filters[number]>('Semua');
  const sessions = state.sessions.filter((session) => !session.deleted && (filter === 'Semua' || session.status === filter));
  return <Screen title={state.role === 'Asisten' ? 'Kelola sesi' : 'Jadwal praktikum'} subtitle="Pilih sesi untuk melihat detail dan aktivitas yang tersedia.">
    {state.role === 'Praktikan' && <JoinClass />}
    <View style={ds.filters}>{filters.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: filter === item }} onPress={() => setFilter(item)} style={[ds.filter, filter === item && ds.filterActive]}><Text style={[ds.filterText, filter === item && ds.filterActiveText]}>{item}</Text></Pressable>)}</View>
    {sessions.length ? sessions.map((session) => <SessionCard key={session.id} session={session} onPress={() => router.push({ pathname: '/detail', params: { id: session.id } })} />) : <EmptyState message="Tidak ada sesi dengan status ini." />}
  </Screen>;
}
