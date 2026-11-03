import NetInfo from '@react-native-community/netinfo';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Switch, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { createApi } from './src/api';
import { SyncEngine, SyncReport } from './src/core/engine';
import { LocalInspection, LocalPhoto, OutboxOp, Store } from './src/core/types';
import { openStore } from './src/db/sqliteStore';
import { loadSettings, saveSettings } from './src/platform/settings';
import { space, useTheme } from './src/theme';
import { Banner, Button, Card, Field, IconButton, Label, Snackbar } from './src/ui/components';
import { InspectionDetail } from './src/ui/InspectionDetail';
import { InspectionList } from './src/ui/InspectionList';

const DEFAULTS = {
  url: process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000',
  user: 'technician-1',
  token: process.env.EXPO_PUBLIC_API_TOKEN ?? '',
};

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const t = useTheme();
  const [store, setStore] = useState<Store | null>(null);
  const [settings, setSettings] = useState<typeof DEFAULTS | null>(null);
  const [online, setOnline] = useState(true);
  const [report, setReport] = useState<SyncReport>({ status: 'idle', pushed: 0, conflicts: 0, photosFailed: 0 });
  const [items, setItems] = useState<LocalInspection[]>([]);
  const [outbox, setOutbox] = useState<OutboxOp[]>([]);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [simulateOffline, setSimulateOffline] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const simOffline = useRef(false);
  simOffline.current = simulateOffline;

  useEffect(() => {
    openStore().then(setStore);
    loadSettings(DEFAULTS).then(setSettings);
  }, []);

  const engine = useMemo(() => {
    if (!store || !settings) return null;
    const api = createApi(settings.url, settings.user, settings.token);
    // Demo switch: force "offline" without touching the device network.
    const guarded = new Proxy(api, {
      get:
        (target, k) =>
        (...a: unknown[]) =>
          simOffline.current
            ? Promise.reject(new TypeError('Network request failed (simulated)'))
            : (target as any)[k](...a),
    });
    return new SyncEngine(store, guarded);
  }, [store, settings]);

  const reload = useCallback(async () => {
    if (!store) return;
    setItems(await store.listInspections());
    setOutbox(await store.listOutbox());
    setPhotos(await store.listPhotos());
  }, [store]);

  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false)), []);
  useEffect(() => engine?.subscribe(setReport), [engine]);

  const sync = useCallback(async () => {
    if (engine) {
      await engine.sync();
      await reload();
    }
  }, [engine, reload]);

  // Auto-sync: on start, on reconnect, and with a retry timer while online.
  useEffect(() => {
    if (online && !simulateOffline) sync();
    const timer = setInterval(() => online && !simOffline.current && sync(), 15000);
    return () => clearInterval(timer);
  }, [online, simulateOffline, sync]);

  if (!store || !engine || !settings)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.muted }}>Opening local database…</Text>
      </SafeAreaView>
    );

  const offline = !online || simulateOffline || report.status === 'offline';
  const pending = outbox.length;
  const errorKey = report.status === 'error' ? (report.error ?? 'error') : null;

  const banner = offline
    ? {
        tone: 'neutral' as const,
        icon: 'cloud-offline-outline' as const,
        text: pending
          ? `Offline · ${pending} change(s) saved on this device`
          : 'Offline · changes are saved on this device',
      }
    : report.status === 'syncing'
      ? { tone: 'primary' as const, icon: 'sync' as const, text: 'Syncing…', busy: true }
      : errorKey && dismissed !== errorKey
        ? {
            tone: 'danger' as const,
            icon: 'alert-circle-outline' as const,
            text: `Sync problem: ${report.error}`,
            retry: true,
          }
        : report.photosFailed
          ? {
              tone: 'warning' as const,
              icon: 'image-outline' as const,
              text: `${report.photosFailed} photo(s) could not be uploaded. Open the inspection to retry.`,
            }
          : report.conflicts
            ? {
                tone: 'danger' as const,
                icon: 'git-compare-outline' as const,
                text: `${report.conflicts} conflict(s) need your decision`,
              }
            : pending
              ? {
                  tone: 'warning' as const,
                  icon: 'time-outline' as const,
                  text: `${pending} change(s) waiting to sync`,
                  retry: true,
                }
              : { tone: 'success' as const, icon: 'checkmark-circle-outline' as const, text: 'All changes synced' };

  const doDelete = async (id: string) => {
    await engine.deleteInspection(id);
    setOpenId(null);
    setUndo(id);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
    await reload();
  };
  const doRestore = async (id: string) => {
    await engine.restoreInspection(id);
    setUndo(null);
    await reload();
  };

  const auth: Record<string, string> = {
    'x-user-id': settings.user,
    ...(settings.token ? { Authorization: `Bearer ${settings.token}` } : {}),
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style="auto" />
      <View style={{ flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.sm }}>
          <Text accessibilityRole="header" style={{ flex: 1, color: t.text, fontSize: 26, fontWeight: '800' }}>
            Field<Text style={{ color: t.primary }}>Sync</Text>
          </Text>
          <IconButton icon="sync-outline" label="Sync now" onPress={sync} />
          <IconButton icon="settings-outline" label="Settings" onPress={() => setShowSettings(true)} />
        </View>
        <Banner
          tone={banner.tone}
          icon={banner.icon}
          text={banner.text}
          busy={'busy' in banner ? banner.busy : false}
          action={
            'retry' in banner
              ? {
                  label: banner.tone === 'danger' ? 'Dismiss' : 'Sync now',
                  onPress: banner.tone === 'danger' ? () => setDismissed(errorKey) : sync,
                }
              : undefined
          }
        />
        {openId ? (
          <InspectionDetail
            id={openId}
            store={store}
            engine={engine}
            api={createApi(settings.url, settings.user, settings.token)}
            url={settings.url}
            auth={auth}
            online={!offline}
            onChange={reload}
            onBack={() => {
              setOpenId(null);
              reload();
            }}
            onDelete={doDelete}
          />
        ) : (
          <InspectionList
            items={items}
            outbox={outbox}
            photos={photos}
            onOpen={setOpenId}
            onDelete={doDelete}
            onRestore={doRestore}
            onCreate={async () => {
              const id = await engine.createInspection({
                title: 'New inspection',
                location: '',
                status: 'draft',
                notes: '',
              });
              await reload();
              setOpenId(id);
            }}
          />
        )}
        {!openId && (
          <View style={{ position: 'absolute', right: space.lg, bottom: space.xl + (undo ? 64 : 0) }}>
            <Button
              label="New inspection"
              icon="add"
              onPress={async () => {
                const id = await engine.createInspection({
                  title: 'New inspection',
                  location: '',
                  status: 'draft',
                  notes: '',
                });
                await reload();
                setOpenId(id);
              }}
            />
          </View>
        )}
        {undo && <Snackbar message="Inspection deleted" actionLabel="Undo" onAction={() => doRestore(undo)} />}
      </View>

      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <View style={{ flex: 1, backgroundColor: t.overlay, justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: t.bg,
              padding: space.lg,
              gap: space.md,
              maxWidth: 760,
              width: '100%',
              alignSelf: 'center',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
            }}
          >
            <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>Settings</Text>
            <SettingsForm
              initial={settings}
              onSave={(s) => {
                setSettings(s);
                saveSettings(s);
                setShowSettings(false);
              }}
            />
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: '600' }}>Simulate offline</Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>
                    Demo switch: blocks sync without touching your network.
                  </Text>
                </View>
                <Switch value={simulateOffline} onValueChange={setSimulateOffline} />
              </View>
            </Card>
            <Button label="Close" variant="ghost" onPress={() => setShowSettings(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SettingsForm({ initial, onSave }: { initial: typeof DEFAULTS; onSave: (s: typeof DEFAULTS) => void }) {
  const s = useRef(initial);
  const set = (patch: Partial<typeof DEFAULTS>) => (s.current = { ...s.current, ...patch });
  return (
    <Card>
      <Label>Server URL</Label>
      <Field value={initial.url} onCommit={(url) => set({ url })} autoCapitalize="none" autoCorrect={false} />
      <Label>User</Label>
      <Field value={initial.user} onCommit={(user) => set({ user })} autoCapitalize="none" autoCorrect={false} />
      <Label>API token</Label>
      <Field value={initial.token} onCommit={(token) => set({ token })} autoCapitalize="none" secureTextEntry />
      <Button label="Save and sync" icon="save-outline" onPress={() => setTimeout(() => onSave(s.current), 700)} />
    </Card>
  );
}
