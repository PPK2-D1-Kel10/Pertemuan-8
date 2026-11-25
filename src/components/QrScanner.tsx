import { useState } from 'react';
import { Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button } from './UI';
import { ds } from '@/styles/dashboard';
export function QrScanner({ sessionId, onScan }: { sessionId: string; onScan: (token: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  return <View style={{ gap: 12 }}>
    <Text style={ds.subtitle}>Pindai QR yang ditampilkan Asprak di TV.</Text>
    {scanning && permission?.granted && <CameraView style={{ height: 280, width: '100%' }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      onMountError={() => { setScanning(false); setError('Kamera tidak tersedia. Izinkan kamera dan gunakan HTTPS pada browser.'); }}
      onBarcodeScanned={({ data }) => {
        try {
          const value = JSON.parse(data);
          if (value.kind !== 'praktiku-attendance' || value.sessionId !== sessionId || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token)) throw new Error();
          setScanning(false); setError(''); onScan(value.token);
        } catch { setError('QR tidak sesuai sesi ini. Pindai QR presensi yang benar.'); }
      }} />}
    {error ? <Text style={ds.noticeText}>{error}</Text> : null}
    <Button label={scanning ? 'Batalkan scan' : 'Scan QR Asprak'} onPress={async () => {
      if (scanning) { setScanning(false); return; }
      try {
        const result = permission?.granted ? permission : await requestPermission();
        if (!result.granted) { setError('Izinkan akses kamera pada pengaturan perangkat/browser untuk scan QR.'); return; }
        setError(''); setScanning(true);
      } catch { setError('Kamera tidak dapat diakses. Periksa izin kamera.'); }
    }} />
  </View>;
}
