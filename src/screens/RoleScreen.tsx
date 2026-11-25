import { Redirect } from 'expo-router';
import { Text } from 'react-native';
import { Card, Screen } from '@/components/UI';
import { useApp } from '@/context/AppContext';
import { ds } from '@/styles/dashboard';

export default function RoleScreen() {
  const { profile, ready } = useApp();
  if (ready && !profile) return <Redirect href="/" />;
  return <Screen title="Akun saya" subtitle="Identitas dan hak akses akun.">
    <Card>
      <Text style={ds.cardTitle}>{profile?.name}</Text>
      <Text style={ds.small}>NIM: {profile?.nim}</Text>
      <Text style={ds.small}>Email: {profile?.email}</Text>
      <Text style={ds.subtitle}>Peran: {profile?.role}</Text>
      <Text selectable style={ds.small}>UID: {profile?.uid}</Text>
      <Text style={ds.subtitle}>{profile?.role === 'Asisten' ? 'Bagikan UID ini kepada Praktikan sebagai kode untuk bergabung ke kelasmu.' : 'Gabung kelas melalui Jadwal & presensi dengan menempelkan UID Asprak.'} Peran hanya dapat diubah oleh pengelola.</Text>
    </Card>
  </Screen>;
}
