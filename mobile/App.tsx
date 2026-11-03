import NetInfo from '@react-native-community/netinfo';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  FlatList,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { createApi } from './src/api';
import { SyncEngine, SyncReport } from './src/core/engine';
import { ChecklistItem, HistoryItem, LocalInspection, LocalPhoto, OutboxOp, Store } from './src/core/types';
import { openStore } from './src/db/sqliteStore';

const DEFAULT_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000';
const STATUSES = ['draft', 'in_progress', 'completed'];
const COLORS = { synced: '#2e7d32', pending: '#ef6c00', conflict: '#c62828' } as const;

export default function App() {
  const [store, setStore] = useState<Store | null>(null);
  const [url, setUrl] = useState(DEFAULT_URL);
  const [user, setUser] = useState('technician-1');
  const [token, setToken] = useState(process.env.EXPO_PUBLIC_API_TOKEN ?? '');
  const [online, setOnline] = useState(true);
  const [report, setReport] = useState<SyncReport>({ status: 'idle', pushed: 0, conflicts: 0 });
  const [items, setItems] = useState<LocalInspection[]>([]);
  const [pending, setPending] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [simulateOffline, setSimulateOffline] = useState(false);

  useEffect(() => {
    openStore().then(setStore);
  }, []);

  const engine = useMemo(() => {
    if (!store) return null;
    const api = createApi(url, user, token);
    // Demo switch: force "offline" without touching the device network.
    const guarded = new Proxy(api, {
      get:
        (t, k) =>
        (...a: unknown[]) =>
          simOffline.current
            ? Promise.reject(new TypeError('Network request failed (simulated)'))
            : (t as any)[k](...a),
    });
    return new SyncEngine(store, guarded);
  }, [store, url, user, token]);
  const simOffline = useRef(false);
  simOffline.current = simulateOffline;

  const reload = useCallback(async () => {
    if (!store) return;
    setItems(await store.listInspections());
    setPending((await store.listOutbox()).length);
  }, [store]);

  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => NetInfo.addEventListener((s) => setOnline(!!s.isConnected)), []);

  const sync = useCallback(async () => {
    if (engine) {
      await engine.sync();
      await reload();
    }
  }, [engine, reload]);

  useEffect(() => engine?.subscribe(setReport), [engine]);
  // Auto-sync: on start, on reconnect, and with a retry timer while work is pending.
  useEffect(() => {
    if (online && !simulateOffline) sync();
  }, [online, simulateOffline, sync]);
  useEffect(() => {
    const t = setInterval(() => {
      if (online && !simulateOffline) sync();
    }, 15000);
    return () => clearInterval(t);
  }, [online, simulateOffline, sync]);

  if (!store || !engine)
    return (
      <SafeAreaView style={s.screen}>
        <Text style={s.pad}>Opening local database…</Text>
      </SafeAreaView>
    );

  const offline = !online || simulateOffline || report.status === 'offline';
  const banner = offline
    ? '● Offline — changes are saved locally'
    : report.status === 'syncing'
      ? '↻ Syncing…'
      : report.status === 'error'
        ? `⚠ Sync error: ${report.error}`
        : pending
          ? `${pending} change(s) waiting to sync`
          : '✓ All changes synced';

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="auto" />
      <View
        style={[
          s.banner,
          { backgroundColor: offline ? '#555' : report.status === 'error' ? COLORS.conflict : COLORS.synced },
        ]}
      >
        <Text style={s.bannerText}>{banner}</Text>
        <Button title="Sync now" color="#fff" onPress={sync} />
      </View>
      {openId ? (
        <Detail
          id={openId}
          store={store}
          engine={engine}
          api={createApi(url, user, token)}
          url={url}
          online={!offline}
          onChange={reload}
          onBack={() => {
            setOpenId(null);
            reload();
          }}
        />
      ) : (
        <View style={{ flex: 1 }}>
          <View style={s.row}>
            <Text style={s.h1}>Inspections</Text>
            <Button title="Settings" onPress={() => setShowSettings(!showSettings)} />
            <Button
              title="+ New"
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
          {showSettings && (
            <View style={s.card}>
              <Text>Server URL</Text>
              <TextInput style={s.input} value={url} onChangeText={setUrl} autoCapitalize="none" />
              <Text>User</Text>
              <TextInput style={s.input} value={user} onChangeText={setUser} autoCapitalize="none" />
              <Text>API token</Text>
              <TextInput style={s.input} value={token} onChangeText={setToken} autoCapitalize="none" secureTextEntry />
              <View style={s.row}>
                <Text>Simulate offline</Text>
                <Switch value={simulateOffline} onValueChange={setSimulateOffline} />
              </View>
            </View>
          )}
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            ListEmptyComponent={<Text style={s.pad}>No inspections yet.</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.card} onPress={() => setOpenId(item.id)}>
                <Text style={s.title}>{String(item.fields.title ?? 'Untitled')}</Text>
                <Text>
                  {String(item.fields.location ?? '')} · {String(item.fields.status ?? '')}
                </Text>
                <Text style={{ color: COLORS[item.syncState], fontWeight: '600' }}>● {item.syncState}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function Detail(props: {
  id: string;
  store: Store;
  engine: SyncEngine;
  api: ReturnType<typeof createApi>;
  url: string;
  online: boolean;
  onChange: () => void;
  onBack: () => void;
}) {
  const { id, store, engine, api, url, online, onChange, onBack } = props;
  const [insp, setInsp] = useState<LocalInspection | null>(null);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [newItem, setNewItem] = useState('');

  const load = useCallback(async () => {
    setInsp(await store.getInspection(id));
    setPhotos(await store.listPhotos(id));
    setOps((await store.listOutbox()).filter((o) => o.inspectionId === id));
    onChange();
  }, [store, id, onChange]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(
    () =>
      engine.subscribe(() => {
        load();
      }),
    [engine, load],
  );

  if (!insp) return null;
  const f = insp.fields;
  const edit = async (patch: Record<string, unknown>) => {
    await engine.edit(id, patch);
    await load();
  };
  const checklist = Object.entries(f).filter(([k]) => k.startsWith('item:')) as [string, ChecklistItem][];
  const photoIds = Object.keys(f)
    .filter((k) => k.startsWith('photo:'))
    .map((k) => k.slice(6));
  const conflictOps = ops.filter((o) => o.conflicts);

  const pick = async (camera: boolean) => {
    const perm = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission required');
    const res = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({
      quality: 0.6,
      mediaTypes: ['images'],
    });
    if (res.canceled) return;
    const a = res.assets[0];
    await engine.addPhoto(id, a.uri, a.mimeType === 'image/png' ? 'image/png' : 'image/jpeg');
    load();
  };

  const loadHistory = async () => {
    try {
      setHistory(await api.history(id));
    } catch {
      Alert.alert('History unavailable offline');
    }
  };

  return (
    <ScrollView contentContainerStyle={s.pad}>
      <Button title="← Back" onPress={onBack} />
      <Text style={{ color: COLORS[insp.syncState], fontWeight: '600' }}>
        ● {insp.syncState} (server v{insp.baseVersion}, {ops.length} queued)
      </Text>

      {conflictOps.map((op) => (
        <View key={op.opId} style={[s.card, { borderColor: COLORS.conflict, borderWidth: 2 }]}>
          <Text style={s.title}>Conflict — a colleague changed the same data</Text>
          {op.conflicts!.map((c) => (
            <Text key={c.field}>
              {label(c.field)}: mine “{show(c.mine)}” vs theirs “{show(c.theirs)}”
            </Text>
          ))}
          <View style={s.row}>
            <Button
              title="Keep mine"
              onPress={async () => {
                await engine.resolveKeepMine(op.opId);
                await engine.sync();
                load();
              }}
            />
            <Button
              title="Keep theirs"
              onPress={async () => {
                await engine.resolveKeepTheirs(op.opId);
                await engine.sync();
                load();
              }}
            />
          </View>
        </View>
      ))}
      {ops
        .filter((o) => !o.conflicts && o.lastError)
        .map((o) => (
          <Text key={o.opId} style={{ color: COLORS.conflict }}>
            Error: {o.lastError}
          </Text>
        ))}

      <Text style={s.label}>Title</Text>
      <TextInput
        style={s.input}
        defaultValue={String(f.title ?? '')}
        onEndEditing={(e) => edit({ title: e.nativeEvent.text })}
      />
      <Text style={s.label}>Location</Text>
      <TextInput
        style={s.input}
        defaultValue={String(f.location ?? '')}
        onEndEditing={(e) => edit({ location: e.nativeEvent.text })}
      />
      <Text style={s.label}>Status: {String(f.status)}</Text>
      <View style={s.row}>
        {STATUSES.map((st) => (
          <Button key={st} title={st} onPress={() => edit({ status: st })} />
        ))}
      </View>
      <Text style={s.label}>Notes / report</Text>
      <TextInput
        style={[s.input, { height: 90 }]}
        multiline
        defaultValue={String(f.notes ?? '')}
        onEndEditing={(e) => edit({ notes: e.nativeEvent.text })}
      />

      <Text style={s.h1}>Checklist</Text>
      {checklist.map(([k, it]) => (
        <View key={k} style={s.row}>
          <Switch value={it.checked} onValueChange={(v) => edit({ [k]: { ...it, checked: v } })} />
          <Text style={{ flex: 1 }}>{it.label}</Text>
        </View>
      ))}
      <View style={s.row}>
        <TextInput
          style={[s.input, { flex: 1 }]}
          placeholder="New check item"
          value={newItem}
          onChangeText={setNewItem}
        />
        <Button
          title="Add"
          onPress={() => {
            if (!newItem.trim()) return;
            edit({
              [`item:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`]: {
                label: newItem.trim(),
                checked: false,
              },
            });
            setNewItem('');
          }}
        />
      </View>

      <Text style={s.h1}>Photos</Text>
      <View style={s.row}>
        <Button title="Camera" onPress={() => pick(true)} />
        <Button title="Library" onPress={() => pick(false)} />
      </View>
      <View style={s.row}>
        {photoIds.map((pid) => {
          const local = photos.find((p) => p.id === pid);
          const uri = local?.uri ?? (online ? `${url}/photos/${pid}` : null);
          return (
            <View key={pid}>
              {uri ? (
                <Image source={{ uri }} style={s.photo} />
              ) : (
                <View style={[s.photo, { backgroundColor: '#ccc' }]} />
              )}
              <Text style={{ fontSize: 11 }}>
                {local ? (local.uploaded ? 'uploaded' : 'waiting upload') : 'remote'}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={s.h1}>History</Text>
      <Button title="Load change history" onPress={loadHistory} />
      {ops.map((o) => (
        <Text key={o.opId}>⏳ (local) {Object.keys(o.patch).map(label).join(', ')}</Text>
      ))}
      {history?.map((h) => (
        <Text key={h.id}>
          v{h.version} · {h.userId} · {new Date(h.createdAt).toLocaleString()} ·{' '}
          {Object.keys(h.changes).map(label).join(', ')}
          {h.merged ? ' (auto-merged)' : ''}
        </Text>
      ))}
    </ScrollView>
  );
}

const label = (k: string) => (k.startsWith('item:') ? 'checklist item' : k.startsWith('photo:') ? 'photo' : k);
const show = (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f5' },
  pad: { padding: 16, gap: 8 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  bannerText: { color: '#fff', flex: 1, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: 4,
    flexWrap: 'wrap',
  },
  h1: { fontSize: 20, fontWeight: '700', marginTop: 8 },
  title: { fontSize: 16, fontWeight: '700' },
  label: { fontWeight: '600', marginTop: 6 },
  card: { backgroundColor: '#fff', margin: 8, padding: 12, borderRadius: 8, gap: 4 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8 },
  photo: { width: 90, height: 90, borderRadius: 6 },
});
