import { Stack } from 'expo-router';
import { AppProvider } from '@/context/AppContext';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  return (
    <AppProvider><Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Login | Presensi Praktikum' }} />
    </Stack></AppProvider>
  );
}
