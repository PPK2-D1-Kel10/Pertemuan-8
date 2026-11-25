import { useState } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundDecor, Button } from '@/components/UI';
import { Field } from '@/components/Field';
import { useApp } from '@/context/AppContext';
import { ds } from '@/styles/dashboard';
import { useEmulators } from '@/services/firebase';

export default function LoginScreen({ initialRegistering = false }: { initialRegistering?: boolean }) {
  const app = useApp();
  const [registering, setRegistering] = useState(initialRegistering);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [name, setName] = useState('');
  const [nim, setNim] = useState('');
  const [notice, setNotice] = useState('');
  if (app.ready && app.profile && !app.busy) return <Redirect href="/home" />;
  const completing = !!app.user;
  const disabled = app.busy || !app.ready || !app.configured || app.offline;
  return <SafeAreaView style={ds.loginPage}>
    <BackgroundDecor />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={ds.loginContent} keyboardShouldPersistTaps="handled">
        <View style={ds.glass}>
          <Text accessibilityRole="header" style={ds.loginTitle}>{completing ? 'Lengkapi profil' : registering ? 'Daftar Praktikan' : 'Selamat datang'}</Text>
          <Text style={ds.loginSubtitle}>{completing ? 'Akun sudah tersedia. Lengkapi profil untuk melanjutkan.' : 'Masuk dengan akun PraktiKu milikmu.'}</Text>
          {!app.configured && <Text style={ds.noticeText}>Firebase belum dikonfigurasi. Ikuti FIREBASE_SETUP.md, isi .env.local, kemudian restart Expo.</Text>}
          {useEmulators && <Text style={ds.noticeText}>Mode emulator lokal. Jalankan npm run emulators terlebih dahulu.</Text>}
          {!app.ready && <ActivityIndicator color="#FFFFFF" />}
          {app.offline && <Text style={ds.noticeText}>Koneksi internet terputus. Sambungkan kembali untuk masuk.</Text>}
          {!completing && <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" />}
          {(registering || completing) && <><Field label="Nama lengkap" value={name} onChangeText={setName} maxLength={100} /><Field label="NIM" value={nim} onChangeText={setNim} maxLength={30} /></>}
          {!completing && <Field label="Kata sandi" value={password} onChangeText={setPassword} secureTextEntry autoComplete={registering ? 'new-password' : 'current-password'} />}
          {registering && !completing && <Field label="Konfirmasi kata sandi" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoComplete="new-password" />}
          {app.error ? <Text accessibilityRole="alert" style={ds.loginError}>{app.error}</Text> : null}
          {notice ? <Text accessibilityLiveRegion="polite" style={ds.noticeText}>{notice}</Text> : null}
          <Button label={app.busy ? 'Memproses…' : completing ? 'Simpan profil' : registering ? 'Daftar' : 'Masuk'} disabled={disabled} onPress={async () => {
            setNotice('');
            if (registering && !completing && password !== confirmation) { setNotice('Konfirmasi kata sandi tidak cocok.'); return; }
            const ok = completing ? await app.completeProfile(name, nim) : registering ? await app.register(email, password, name, nim) : await app.login(email, password);
            if (ok) { setPassword(''); setConfirmation(''); }
          }} />
          {!completing ? <>
            <Button label={registering ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar'} disabled={app.busy} variant="secondary" onPress={() => { setRegistering(!registering); setNotice(''); }} />
            {!registering && <Button label="Lupa kata sandi" disabled={disabled} variant="secondary" onPress={async () => { if (await app.resetPassword(email)) setNotice('Jika email terdaftar, tautan reset kata sandi dikirim. Periksa inbox dan spam.'); }} />}
          </> : <Button label="Keluar" disabled={app.busy} variant="secondary" onPress={() => { void app.dispatch({ type: 'logout' }); }} />}
          {(registering || completing) && <Text style={ds.small}>Akun baru terdaftar sebagai Praktikan. Hak akses Asisten ditetapkan oleh pengelola.</Text>}
          {app.error && <Button label="Coba sambungkan ulang" disabled={app.busy} variant="secondary" onPress={app.retry} />}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
