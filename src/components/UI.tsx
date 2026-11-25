import { useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, usePathname } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { ds } from '@/styles/dashboard';
import { glassTheme } from '@/styles/theme';
import type { PracticalSession } from '@/types';
import { useEmulators } from '@/services/firebase';
import { SessionStatusBadge } from '@/components/SessionStatusBadge';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export function Icon({ name, size = 22, color = glassTheme.icon }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}
export function BackgroundDecor() {
  return <><View pointerEvents="none" style={ds.orbOne} /><View pointerEvents="none" style={ds.orbTwo} /></>;
}
export function Button({ label, onPress, disabled = false, variant = 'primary', loading = false }: { label: string; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' | 'danger'; loading?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || loading }} disabled={disabled || loading} onPress={onPress}
    style={({ pressed }) => [ds.button, variant === 'secondary' && ds.secondaryButton, variant === 'danger' && ds.dangerButton, (disabled || loading) && ds.disabled, pressed && ds.pressed]}>
    {loading && <ActivityIndicator color="#FFFFFF" />}<Text style={[ds.buttonText, variant === 'secondary' && ds.secondaryText]}>{label}</Text>
  </Pressable>;
}

function Sidebar({ visible, close }: { visible: boolean; close: () => void }) {
  const { state, profile, dispatch, busy } = useApp();
  const pathname = usePathname();
  const assistant = state.role === 'Asisten';
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [visible, close]);
  const items: { label: string; href: '/classes' | '/home' | '/schedule' | '/history' | '/role' | '/permissions'; icon: IconName }[] = [
    ...(assistant ? [{ label: 'Kelola kelas', href: '/classes' as const, icon: 'library-outline' as const }] : []),
    { label: 'Dashboard', href: '/home', icon: 'grid-outline' },
    { label: assistant ? 'Kelola sesi' : 'Jadwal & presensi', href: '/schedule', icon: 'calendar-outline' },
    { label: assistant ? 'Rekap kehadiran' : 'Riwayat kehadiran', href: '/history', icon: 'bar-chart-outline' },
    { label: assistant ? 'Periksa izin' : 'Pengajuan izin', href: '/permissions', icon: 'document-text-outline' },
    { label: 'Akun saya', href: '/role', icon: 'person-outline' },
  ];
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
    <View style={ds.menuOverlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Tutup menu" onPress={close} style={ds.scrim} />
      <SafeAreaView style={ds.drawer}>
        <View style={ds.drawerTop}><Text style={ds.brandText}>PraktiKu</Text><Pressable accessibilityRole="button" accessibilityLabel="Tutup sidebar" onPress={close} style={ds.iconButton}><Icon name="close" /></Pressable></View>
        <View style={ds.row}><View style={ds.avatar}><Icon name="person-outline" /></View><View style={ds.grow}><Text numberOfLines={1} style={ds.cardTitle}>{profile?.name}</Text><Text style={ds.small}>{state.role}</Text></View></View>
        <View style={ds.divider} />
        <ScrollView contentContainerStyle={{ gap: 8 }}>
          {items.filter((item) => state.role || item.href === '/role').map((item) => <Pressable key={item.href} accessibilityRole="button" accessibilityState={{ selected: pathname === item.href }}
            style={[ds.menuItem, pathname === item.href && ds.menuActive]} onPress={() => { close(); router.replace(item.href); }}>
            <Icon name={item.icon} color={pathname === item.href ? glassTheme.text : glassTheme.icon} /><Text style={[ds.menuText, pathname === item.href && ds.menuActiveText]}>{item.label}</Text>
          </Pressable>)}
        </ScrollView>
        <Button label="Keluar" disabled={busy} variant="secondary" onPress={async () => { if (await dispatch({ type: 'logout' })) { close(); router.replace('/'); } }} />
      </SafeAreaView>
    </View>
  </Modal>;
}

export function Screen({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle?: string }>) {
  const { state, ready, loading, busy, error, offline, cached, retry } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!ready) return <View style={[ds.page, { justifyContent: 'center' }]}><ActivityIndicator color={glassTheme.text} accessibilityLabel="Memuat data" /></View>;
  if (!state.username) return <Redirect href="/" />;
  if (!state.role) return <Redirect href="/" />;
  return <SafeAreaView style={ds.page}>
    <BackgroundDecor />
    <View style={ds.header}><View style={ds.headerInner}>
      <Pressable accessibilityRole="button" accessibilityLabel="Buka menu" accessibilityState={{ expanded: menuOpen }} onPress={() => setMenuOpen(true)} style={ds.iconButton}><Icon name="menu-outline" /></Pressable>
      <View style={ds.brand}><View style={ds.brandIcon}><Icon name="school-outline" size={21} color="white" /></View><Text style={ds.brandText}>PraktiKu</Text></View>
      <View style={ds.avatar}><Text style={ds.avatarText}>{state.role === 'Asisten' ? 'AS' : 'PR'}</Text></View>
    </View></View>
    <ScrollView contentContainerStyle={ds.content}>
      <View style={ds.column}>
        <View><Text accessibilityRole="header" style={ds.title}>{title}</Text>{subtitle ? <Text style={ds.subtitle}>{subtitle}</Text> : null}</View>
        {useEmulators && <Text style={ds.noticeText}>Mode emulator lokal — data ini terpisah dari Firebase cloud.</Text>}
        {(offline || cached) && <View style={ds.notice}><Text style={ds.noticeText}>{offline ? 'Koneksi terputus. Data mungkin belum terbaru. Sambungkan internet sebelum menyimpan perubahan.' : 'Menghubungkan ke server. Data yang tampil mungkin belum terbaru.'}</Text></View>}
        {error ? <View style={ds.notice}><Text accessibilityRole="alert" style={ds.noticeText}>{error}</Text><Button label="Muat ulang data" disabled={busy} variant="secondary" onPress={retry} /></View> : null}
        {busy && <Text accessibilityLiveRegion="polite" style={ds.noticeText}>Memproses… Tunggu konfirmasi server sebelum meninggalkan halaman.</Text>}
        {loading ? <ActivityIndicator color="#FFFFFF" accessibilityLabel="Memuat data praktikum" /> : children}
        <Text style={ds.small}>PraktiKu / Presensi praktikum</Text>
      </View>
    </ScrollView>
    <Sidebar visible={menuOpen} close={() => setMenuOpen(false)} />
  </SafeAreaView>;
}
export function Card({ children }: PropsWithChildren) { return <View style={ds.card}>{children}</View>; }
export function EmptyState({ message }: { message: string }) { return <Card><Icon name="file-tray-outline" size={30} /><Text style={ds.subtitle}>{message}</Text></Card>; }
export function StatusBadge({ status }: { status: string }) {
  const live = status === 'Berlangsung' || status === 'Hadir';
  const done = status === 'Selesai';
  return <View style={[ds.badge, live ? ds.liveBadge : done ? ds.doneBadge : ds.pendingBadge]}><Text style={[ds.badgeText, live && ds.liveText, done && ds.doneText]}>{status}</Text></View>;
}
export function SessionCard({ session, onPress }: { session: PracticalSession; onPress?: () => void }) {
  return <Card>
    <View style={ds.sessionHeader}><View style={ds.iconButton}><Icon name="code-slash-outline" /></View><View style={ds.grow}><Text style={ds.cardTitle}>{session.practicalName}</Text><Text style={ds.small}>{session.className}</Text></View></View>
    <SessionStatusBadge status={session.status} />
    <View style={ds.wrap}><View style={ds.row}><Icon name="calendar-outline" size={16} /><Text style={ds.small}>{session.date}</Text></View><View style={ds.row}><Icon name="time-outline" size={16} /><Text style={ds.small}>{session.startTime} - {session.endTime} WIB</Text></View></View>
    {onPress ? <Button label="Lihat detail sesi" onPress={onPress} variant="secondary" /> : null}
  </Card>;
}
