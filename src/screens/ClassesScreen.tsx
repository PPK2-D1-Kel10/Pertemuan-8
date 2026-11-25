import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, EmptyState, Icon, Screen } from '@/components/UI';
import { useApp } from '@/context/AppContext';
import { createClass, deleteClass, subscribeClasses, updateClass } from '@/services/classService';
import { ds } from '@/styles/dashboard';
import { glassTheme } from '@/styles/theme';
import type { PracticumClass } from '@/types/cloud';

export default function ClassesScreen() {
  const { user, profile, offline } = useApp();
  const isAssistant = profile?.role === 'Asisten';
  const [classes, setClasses] = useState<PracticumClass[]>([]);
  const [loading, setLoading] = useState(isAssistant);
  const [errorMessage, setErrorMessage] = useState('');

  // Modals state
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalClass, setEditModalClass] = useState<PracticumClass | null>(null);
  const [deleteModalClass, setDeleteModalClass] = useState<PracticumClass | null>(null);

  // Form inputs
  const [classNameInput, setClassNameInput] = useState('');
  const [practicumNameInput, setPracticumNameInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user || !isAssistant) {
      return;
    }

    const unsubscribe = subscribeClasses(
      (liveClasses) => {
        setClasses(liveClasses);
        setLoading(false);
      },
      user.uid,
      (err) => {
        setErrorMessage(`Gagal memuat kelas: ${err.message}`);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, isAssistant]);

  const handleAddClass = async () => {
    if (offline) { setErrorMessage('Sambungkan internet untuk mengelola kelas.'); return; }
    if (!classNameInput.trim() || !practicumNameInput.trim()) {
      setErrorMessage('Isi nama kelas dan nama praktikum.');
      return;
    }
    setSubmitting(true);
    setErrorMessage('');
    try {
      await createClass({
        name: classNameInput.trim(),
        practicumName: practicumNameInput.trim(),
        assistantUid: user?.uid || 'asisten_demo',
        assistantName: profile?.name || 'Asisten',
      });
      setClassNameInput('');
      setPracticumNameInput('');
      setAddModalVisible(false);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menambahkan kelas.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateClass = async () => {
    if (!editModalClass) return;
    if (offline) { setErrorMessage('Sambungkan internet untuk mengelola kelas.'); return; }
    if (!classNameInput.trim() || !practicumNameInput.trim()) {
      setErrorMessage('Isi nama kelas dan nama praktikum.');
      return;
    }
    setSubmitting(true);
    setErrorMessage('');
    try {
      await updateClass(editModalClass.id, {
        name: classNameInput.trim(),
        practicumName: practicumNameInput.trim(),
      });
      setEditModalClass(null);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal mengubah data kelas.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClass = async () => {
    if (!deleteModalClass) return;
    setSubmitting(true);
    setErrorMessage('');
    try {
      await deleteClass(deleteModalClass.id);
      setDeleteModalClass(null);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menghapus kelas.');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (c: PracticumClass) => {
    setEditModalClass(c);
    setClassNameInput(c.name);
    setPracticumNameInput(c.practicumName);
    setErrorMessage('');
  };

  if (!isAssistant) {
    return (
      <Screen title="Kelola Kelas" subtitle="Manajemen kelas praktikum.">
        <EmptyState message="Halaman manajemen kelas hanya dapat diakses oleh Asisten Praktikum." />
      </Screen>
    );
  }

  return (
    <Screen title="Kelola Kelas" subtitle="Buat, edit, dan pantau daftar kelas praktikum secara real-time.">
      <View style={ds.stats}>
        <View style={ds.stat}>
          <Text style={ds.statNumber}>{classes.length}</Text>
          <Text style={ds.statLabel}>Total Kelas Praktikum</Text>
        </View>
        <View style={[ds.stat, { justifyContent: 'center' }]}>
          <Button
            label="+ Tambah Kelas Baru"
            onPress={() => {
              setClassNameInput('');
              setPracticumNameInput('');
              setErrorMessage('');
              setAddModalVisible(true);
            }}
          />
        </View>
      </View>

      {errorMessage ? (
        <View style={ds.notice}>
          <Text style={ds.noticeText}>{errorMessage}</Text>
        </View>
      ) : null}

      {classes.length ? (
        classes.map((cls) => (
          <Card key={cls.id}>
            <View style={ds.sessionHeader}>
              <View style={ds.iconButton}>
                <Icon name="library-outline" />
              </View>
              <View style={ds.grow}>
                <Text style={ds.cardTitle}>{cls.practicumName}</Text>
                <Text style={ds.small}>{cls.name}</Text>
              </View>
            </View>

            <View style={ds.row}>
              <Button label="Edit Kelas" variant="secondary" onPress={() => openEditModal(cls)} />
              <Button label="Hapus" variant="danger" onPress={() => setDeleteModalClass(cls)} />
              <Button
                label="Kelola Sesi"
                onPress={() => router.push('/schedule')}
              />
            </View>
          </Card>
        ))
      ) : (
        <EmptyState message={loading ? 'Memuat daftar kelas...' : 'Belum ada kelas praktikum. Tekan "+ Tambah Kelas Baru" untuk membuat kelas pertama.'} />
      )}

      {/* Add Class Modal */}
      <Modal visible={addModalVisible} transparent animationType="fade" onRequestClose={() => setAddModalVisible(false)}>
        <View style={styles.overlay}>
          <Pressable style={ds.scrim} onPress={() => setAddModalVisible(false)} />
          <View style={styles.dialog}>
            <ScrollView contentContainerStyle={styles.dialogContent}>
              <Text style={ds.cardTitle}>Tambah Kelas Praktikum Baru</Text>
              <View style={ds.loginField}>
                <Text style={ds.loginLabel}>Nama Praktikum</Text>
                <View style={ds.passwordRow}>
                  <TextInput
                    style={ds.loginInput}
                    placeholder="Contoh: Praktikum Pemrograman Bergerak"
                    placeholderTextColor="#E0E5F4"
                    value={practicumNameInput}
                    onChangeText={setPracticumNameInput}
                  />
                </View>
              </View>
              <View style={ds.loginField}>
                <Text style={ds.loginLabel}>Nama / Kode Kelas</Text>
                <View style={ds.passwordRow}>
                  <TextInput
                    style={ds.loginInput}
                    placeholder="Contoh: Kelas A / Reguler Pagi"
                    placeholderTextColor="#E0E5F4"
                    value={classNameInput}
                    onChangeText={setClassNameInput}
                  />
                </View>
              </View>
              <Button label="Simpan Kelas" onPress={handleAddClass} loading={submitting} disabled={submitting} />
              <Button label="Batal" variant="secondary" onPress={() => setAddModalVisible(false)} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Class Modal */}
      <Modal visible={!!editModalClass} transparent animationType="fade" onRequestClose={() => setEditModalClass(null)}>
        <View style={styles.overlay}>
          <Pressable style={ds.scrim} onPress={() => setEditModalClass(null)} />
          <View style={styles.dialog}>
            <ScrollView contentContainerStyle={styles.dialogContent}>
              <Text style={ds.cardTitle}>Edit Data Kelas Praktikum</Text>
              <View style={ds.loginField}>
                <Text style={ds.loginLabel}>Nama Praktikum</Text>
                <View style={ds.passwordRow}>
                  <TextInput
                    style={ds.loginInput}
                    value={practicumNameInput}
                    onChangeText={setPracticumNameInput}
                  />
                </View>
              </View>
              <View style={ds.loginField}>
                <Text style={ds.loginLabel}>Nama / Kode Kelas</Text>
                <View style={ds.passwordRow}>
                  <TextInput
                    style={ds.loginInput}
                    value={classNameInput}
                    onChangeText={setClassNameInput}
                  />
                </View>
              </View>
              <Button label="Perbarui Data" onPress={handleUpdateClass} loading={submitting} disabled={submitting} />
              <Button label="Batal" variant="secondary" onPress={() => setEditModalClass(null)} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={!!deleteModalClass} transparent animationType="fade" onRequestClose={() => setDeleteModalClass(null)}>
        <View style={styles.overlay}>
          <Pressable style={ds.scrim} onPress={() => setDeleteModalClass(null)} />
          <View style={styles.dialog}>
            <ScrollView contentContainerStyle={styles.dialogContent}>
              <Text style={ds.cardTitle}>Hapus Kelas Praktikum?</Text>
              <Text style={ds.subtitle}>
                Apakah Anda yakin ingin menghapus kelas &quot;{deleteModalClass?.name}&quot;? Kelas yang memiliki sesi praktikum tidak dapat dihapus.
              </Text>
              <Button label="Ya, Hapus Kelas" variant="danger" onPress={handleDeleteClass} loading={submitting} disabled={submitting} />
              <Button label="Batal" variant="secondary" onPress={() => setDeleteModalClass(null)} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  dialog: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    backgroundColor: glassTheme.drawer,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: glassTheme.border,
  },
  dialogContent: { padding: 24, gap: 16 },
});
