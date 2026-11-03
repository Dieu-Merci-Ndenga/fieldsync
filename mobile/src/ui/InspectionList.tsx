import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { LocalInspection, LocalPhoto, OutboxOp } from '../core/types';
import { radius, space, useTheme } from '../theme';
import { Badge, Card, Chip, EmptyState, IconButton, Button, relativeTime, confirmAction } from './components';

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'In progress',
  completed: 'Completed',
};

const STATUS_TONE = { draft: 'neutral', in_progress: 'primary', completed: 'success' } as const;
const SYNC_TONE = { synced: 'success', pending: 'warning', conflict: 'danger' } as const;
const SYNC_ICON = { synced: 'checkmark-circle', pending: 'time', conflict: 'alert-circle' } as const;

const statusOf = (i: LocalInspection) => String(i.fields.status || 'draft');

export const checklistOf = (f: Record<string, unknown>) =>
  Object.entries(f).filter(([k, v]) => k.startsWith('item:') && v) as [string, { label: string; checked: boolean }][];
export const photoIdsOf = (f: Record<string, unknown>) =>
  Object.entries(f)
    .filter(([k, v]) => k.startsWith('photo:') && v)
    .map(([k]) => k.slice(6));

type StatusFilter = 'all' | 'draft' | 'in_progress' | 'completed';
type SyncFilter = 'all' | 'pending' | 'conflict';

export function InspectionList(props: {
  items: LocalInspection[];
  outbox: OutboxOp[];
  photos: LocalPhoto[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const t = useTheme();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sync, setSync] = useState<SyncFilter>('all');
  const [showDeleted, setShowDeleted] = useState(false);

  const live = props.items.filter((i) => !i.fields.deleted);
  const deletedCount = props.items.length - live.length;

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    return props.items
      .filter((i) => (showDeleted ? !!i.fields.deleted : !i.fields.deleted))
      .filter((i) => status === 'all' || statusOf(i) === status)
      .filter((i) => sync === 'all' || i.syncState === sync)
      .filter(
        (i) =>
          !q || `${i.fields.title ?? ''} ${i.fields.location ?? ''} ${i.fields.notes ?? ''}`.toLowerCase().includes(q),
      );
  }, [props.items, query, status, sync, showDeleted]);

  const count = (s: StatusFilter) => (s === 'all' ? live.length : live.filter((i) => statusOf(i) === s).length);
  const filtered = query || status !== 'all' || sync !== 'all';

  return (
    <FlatList
      data={data}
      keyExtractor={(i) => i.id}
      contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 120 }}
      ListHeaderComponent={
        <View style={{ gap: space.md }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.border,
              borderRadius: radius.md,
              paddingHorizontal: space.md,
            }}
          >
            <Ionicons name="search" size={18} color={t.muted} />
            <TextInput
              accessibilityLabel="Search inspections"
              placeholder="Search title, location, notes"
              placeholderTextColor={t.muted}
              value={query}
              onChangeText={setQuery}
              style={{ flex: 1, color: t.text, paddingVertical: 11, fontSize: 15 }}
            />
            {!!query && <IconButton icon="close-circle" label="Clear search" size={18} onPress={() => setQuery('')} />}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {(['all', 'draft', 'in_progress', 'completed'] as const).map((s) => (
              <Chip
                key={s}
                label={s === 'all' ? 'All' : STATUS_LABEL[s]}
                count={count(s)}
                selected={status === s}
                onPress={() => setStatus(s)}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' }}>
            <Chip label="Any sync state" selected={sync === 'all'} onPress={() => setSync('all')} />
            <Chip label="Pending" selected={sync === 'pending'} onPress={() => setSync('pending')} />
            <Chip label="Conflicts" selected={sync === 'conflict'} onPress={() => setSync('conflict')} />
          </View>
          {deletedCount > 0 || showDeleted ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Switch accessibilityLabel="Show deleted" value={showDeleted} onValueChange={setShowDeleted} />
              <Text style={{ color: t.muted }}>Show deleted ({deletedCount})</Text>
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        filtered || showDeleted ? (
          <EmptyState
            icon="funnel-outline"
            title={showDeleted ? 'Nothing deleted' : 'No match'}
            hint={showDeleted ? 'Deleted inspections can be restored from here.' : 'Try a different search or filter.'}
          />
        ) : (
          <EmptyState
            icon="clipboard-outline"
            title="No inspections yet"
            hint="Everything you create works offline and syncs when you are back online."
            action={<Button label="New inspection" icon="add" onPress={props.onCreate} />}
          />
        )
      }
      renderItem={({ item }) => {
        const f = item.fields;
        const items = checklistOf(f);
        const done = items.filter(([, c]) => c.checked).length;
        const photos = photoIdsOf(f).length;
        const failed = props.photos.filter((p) => p.inspectionId === item.id && !p.uploaded && p.error).length;
        const queued = props.outbox.filter((o) => o.inspectionId === item.id).length;
        const deleted = !!f.deleted;
        return (
          <Card style={{ opacity: deleted ? 0.8 : 1 }}>
            <View style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${String(f.title ?? 'inspection')}`}
                  onPress={() => (deleted ? undefined : props.onOpen(item.id))}
                  style={{ flex: 1, gap: 2 }}
                >
                  <Text numberOfLines={1} style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>
                    {String(f.title || 'Untitled')}
                  </Text>
                  <Text numberOfLines={1} style={{ color: t.muted }}>
                    {String(f.location || 'No location')} · {relativeTime(item.updatedAt)}
                  </Text>
                </Pressable>
                {deleted ? (
                  <Button
                    label="Restore"
                    icon="arrow-undo"
                    variant="secondary"
                    onPress={() => props.onRestore(item.id)}
                  />
                ) : (
                  <IconButton
                    icon="trash-outline"
                    label="Delete inspection"
                    color={t.danger}
                    onPress={() =>
                      confirmAction(
                        'Delete inspection?',
                        'It will be hidden everywhere. You can restore it later.',
                        'Delete',
                        () => props.onDelete(item.id),
                      )
                    }
                  />
                )}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                <Badge
                  label={STATUS_LABEL[String(f.status)] ?? 'Draft'}
                  tone={STATUS_TONE[String(f.status) as keyof typeof STATUS_TONE] ?? 'neutral'}
                />
                <Badge
                  label={item.syncState === 'pending' && queued ? `Pending · ${queued}` : item.syncState}
                  tone={SYNC_TONE[item.syncState]}
                  icon={SYNC_ICON[item.syncState]}
                />
                {items.length > 0 && <Badge label={`${done}/${items.length} checks`} icon="checkbox-outline" />}
                {photos > 0 && <Badge label={`${photos}`} icon="image-outline" />}
                {failed > 0 && <Badge label={`${failed} photo issue`} tone="warning" icon="warning-outline" />}
              </View>
            </View>
          </Card>
        );
      }}
    />
  );
}
