import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { createApi } from '../api';
import { SyncEngine } from '../core/engine';
import { HistoryItem, LocalInspection, LocalPhoto, OutboxOp, Store } from '../core/types';
import { persistPhoto } from '../platform/photoStorage';
import { radius, space, useTheme } from '../theme';
import {
  Badge,
  Button,
  Card,
  Field,
  IconButton,
  Label,
  Segmented,
  SectionTitle,
  confirmAction,
  notify,
} from './components';
import { checklistOf, photoIdsOf, STATUS_LABEL } from './InspectionList';
import { PhotoSource, PhotoViewer } from './PhotoViewer';

const label = (k: string) => (k.startsWith('item:') ? 'checklist item' : k.startsWith('photo:') ? 'photo' : k);
const show = (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));

export function InspectionDetail(props: {
  id: string;
  store: Store;
  engine: SyncEngine;
  api: ReturnType<typeof createApi>;
  url: string;
  auth: Record<string, string>;
  online: boolean;
  onChange: () => void;
  onBack: () => void;
  onDelete: (id: string) => void;
}) {
  const { id, store, engine, api, url, auth, online, onChange, onBack } = props;
  const t = useTheme();
  const [viewer, setViewer] = useState<PhotoSource | null>(null);
  const [insp, setInsp] = useState<LocalInspection | null>(null);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
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
  useEffect(() => engine.subscribe(() => void load()), [engine, load]);

  if (!insp) return null;
  const f = insp.fields;
  const edit = async (patch: Record<string, unknown>) => {
    await engine.edit(id, patch);
    await load();
  };
  const checklist = checklistOf(f);
  const done = checklist.filter(([, c]) => c.checked).length;
  const conflictOps = ops.filter((o) => o.conflicts);

  const addItem = () => {
    if (!newItem.trim()) return;
    edit({
      [`item:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`]: {
        label: newItem.trim(),
        checked: false,
      },
    });
    setNewItem('');
  };

  const pick = async (camera: boolean) => {
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return notify('Camera permission required');
    }
    const res = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({
      quality: 0.6,
      mediaTypes: ['images'],
    });
    if (res.canceled) return;
    const a = res.assets[0];
    const mime = a.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    try {
      await engine.addPhoto(id, await persistPhoto(a.uri, mime), mime);
    } catch (e) {
      notify('Could not save photo', (e as Error).message);
    }
    load();
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      setHistory(await api.history(id));
    } catch {
      notify('History unavailable', 'Connect to the server to load the full change history.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleted = !!f.deleted;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, gap: space.xs }}>
        <IconButton icon="chevron-back" label="Back" onPress={onBack} />
        <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 18, fontWeight: '700' }}>
          {String(f.title || 'Untitled')}
        </Text>
        <Badge
          label={insp.syncState === 'pending' && ops.length ? `Pending · ${ops.length}` : insp.syncState}
          tone={insp.syncState === 'synced' ? 'success' : insp.syncState === 'conflict' ? 'danger' : 'warning'}
        />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 80 }}
        keyboardShouldPersistTaps="handled"
      >
        {deleted && (
          <Card tone="warning">
            <Text style={{ color: t.warning, fontWeight: '700' }}>This inspection is deleted</Text>
            <Button
              label="Restore"
              icon="arrow-undo"
              variant="secondary"
              onPress={async () => {
                await engine.restoreInspection(id);
                await load();
              }}
            />
          </Card>
        )}

        {conflictOps.map((op) => (
          <Card key={op.opId} tone="danger">
            <Text style={{ color: t.danger, fontSize: 16, fontWeight: '700' }}>
              Conflict: a colleague changed the same data
            </Text>
            {op.conflicts!.map((c) => (
              <View key={c.field} style={{ gap: 2 }}>
                <Label>{label(c.field)}</Label>
                <Text style={{ color: t.text }}>Mine: “{show(c.mine)}”</Text>
                <Text style={{ color: t.text }}>Theirs: “{show(c.theirs)}”</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button
                style={{ flex: 1 }}
                label="Keep mine"
                onPress={async () => {
                  await engine.resolveKeepMine(op.opId);
                  await engine.sync();
                  load();
                }}
              />
              <Button
                style={{ flex: 1 }}
                variant="secondary"
                label="Keep theirs"
                onPress={async () => {
                  await engine.resolveKeepTheirs(op.opId);
                  await engine.sync();
                  load();
                }}
              />
            </View>
          </Card>
        ))}
        {ops
          .filter((o) => !o.conflicts && o.lastError)
          .map((o) => (
            <Text key={o.opId} style={{ color: t.danger }}>
              Error: {o.lastError}
            </Text>
          ))}

        <Card>
          <Label>Title</Label>
          <Field value={String(f.title ?? '')} onCommit={(v) => edit({ title: v })} accessibilityLabel="Title" />
          <Label>Location</Label>
          <Field
            value={String(f.location ?? '')}
            onCommit={(v) => edit({ location: v })}
            accessibilityLabel="Location"
          />
          <Label>Status</Label>
          <Segmented
            value={String(f.status ?? 'draft')}
            options={Object.entries(STATUS_LABEL).map(([value, l]) => ({ value, label: l }))}
            onChange={(v) => edit({ status: v })}
          />
          <Label>Notes / report</Label>
          <Field
            multiline
            value={String(f.notes ?? '')}
            onCommit={(v) => edit({ notes: v })}
            accessibilityLabel="Notes"
          />
        </Card>

        <SectionTitle
          right={<Text style={{ color: t.muted }}>{checklist.length ? `${done}/${checklist.length}` : ''}</Text>}
        >
          Checklist
        </SectionTitle>
        <Card>
          {checklist.length > 0 && (
            <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surfaceAlt, overflow: 'hidden' }}>
              <View style={{ height: 6, width: `${(done / checklist.length) * 100}%`, backgroundColor: t.success }} />
            </View>
          )}
          {checklist.map(([k, it]) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Switch
                accessibilityLabel={`Mark ${it.label} as checked`}
                value={it.checked}
                onValueChange={(v) => edit({ [k]: { ...it, checked: v } })}
              />
              <Text style={{ flex: 1, color: t.text, textDecorationLine: it.checked ? 'line-through' : 'none' }}>
                {it.label}
              </Text>
              <IconButton
                icon="close"
                label={`Remove ${it.label}`}
                color={t.muted}
                size={18}
                onPress={async () => {
                  await engine.removeChecklistItem(id, k);
                  load();
                }}
              />
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <TextInput
              accessibilityLabel="New checklist item"
              placeholder="Add a check item"
              placeholderTextColor={t.muted}
              value={newItem}
              onChangeText={setNewItem}
              onSubmitEditing={addItem}
              style={{
                flex: 1,
                color: t.text,
                backgroundColor: t.surface,
                borderWidth: 1,
                borderColor: t.border,
                borderRadius: radius.md,
                paddingHorizontal: space.md,
                minHeight: 44,
              }}
            />
            <Button label="Add" icon="add" variant="secondary" onPress={addItem} />
          </View>
        </Card>

        <SectionTitle>Photos</SectionTitle>
        <Card>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button
              style={{ flex: 1 }}
              variant="secondary"
              icon="camera-outline"
              label="Camera"
              onPress={() => pick(true)}
            />
            <Button
              style={{ flex: 1 }}
              variant="secondary"
              icon="images-outline"
              label="Library"
              onPress={() => pick(false)}
            />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            {photoIdsOf(f).map((pid) => {
              const local = photos.find((p) => p.id === pid);
              const source: PhotoSource | null = local
                ? { uri: local.uri }
                : online
                  ? { uri: `${url}/photos/${pid}`, headers: auth }
                  : null;
              return (
                <View key={pid} style={{ width: 104, gap: 4 }}>
                  {source ? (
                    <Pressable
                      accessibilityRole="imagebutton"
                      accessibilityLabel="Open photo full screen"
                      onPress={() => setViewer(source)}
                    >
                      <Image
                        source={source}
                        style={{ width: 104, height: 104, borderRadius: radius.md, backgroundColor: t.surfaceAlt }}
                      />
                    </Pressable>
                  ) : (
                    <View style={{ width: 104, height: 104, borderRadius: radius.md, backgroundColor: t.surfaceAlt }} />
                  )}
                  {local?.error ? (
                    <>
                      <Badge label="Upload failed" tone="warning" icon="warning-outline" />
                      <Button
                        label="Retry"
                        variant="secondary"
                        onPress={async () => {
                          await engine.retryPhoto(pid);
                          engine.sync();
                        }}
                      />
                    </>
                  ) : (
                    <Badge
                      label={local ? (local.uploaded ? 'Uploaded' : 'Waiting') : 'On server'}
                      tone={local && !local.uploaded ? 'warning' : 'success'}
                      icon={local && !local.uploaded ? 'cloud-upload-outline' : 'cloud-done-outline'}
                    />
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    onPress={() =>
                      confirmAction(
                        'Remove photo?',
                        'The photo will be removed from this inspection.',
                        'Remove',
                        async () => {
                          await engine.removePhoto(id, pid);
                          load();
                        },
                      )
                    }
                  >
                    <Text style={{ color: t.danger, fontSize: 12, fontWeight: '600' }}>Remove</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
          {photoIdsOf(f).length === 0 && <Text style={{ color: t.muted }}>No photos yet.</Text>}
        </Card>
        <PhotoViewer source={viewer} onClose={() => setViewer(null)} />

        <SectionTitle>History</SectionTitle>
        <Card>
          {ops.map((o) => (
            <Text key={o.opId} style={{ color: t.warning }}>
              Queued locally: {Object.keys(o.patch).map(label).join(', ')}
            </Text>
          ))}
          {history?.map((h) => (
            <Text key={h.id} style={{ color: t.text }}>
              v{h.version} · {h.userId} · {new Date(h.createdAt).toLocaleString()} ·{' '}
              {Object.keys(h.changes).map(label).join(', ')}
              {h.merged ? ' (auto-merged)' : ''}
            </Text>
          ))}
          <Button
            label={history ? 'Refresh history' : 'Load change history'}
            variant="secondary"
            icon="time-outline"
            loading={loadingHistory}
            onPress={loadHistory}
          />
        </Card>

        {!deleted && (
          <Button
            variant="danger"
            icon="trash-outline"
            label="Delete inspection"
            onPress={() =>
              confirmAction(
                'Delete inspection?',
                'It will be hidden everywhere. You can restore it later.',
                'Delete',
                () => props.onDelete(id),
              )
            }
          />
        )}
      </ScrollView>
    </View>
  );
}
