import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { radius, space, Theme, useTheme } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'primary';

export function toneColors(t: Theme, tone: Tone) {
  switch (tone) {
    case 'success':
      return { fg: t.success, bg: t.successBg };
    case 'warning':
      return { fg: t.warning, bg: t.warningBg };
    case 'danger':
      return { fg: t.danger, bg: t.dangerBg };
    case 'primary':
      return { fg: t.primary, bg: t.surfaceAlt };
    default:
      return { fg: t.muted, bg: t.neutralBg };
  }
}

/** Cross-platform confirm: Alert.alert with buttons is a no-op on web. */
export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n${message}` : title);
  else Alert.alert(title, message);
}

export function Button(props: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const v = props.variant ?? 'primary';
  const fg = v === 'primary' ? t.onPrimary : v === 'danger' ? t.danger : t.text;
  const bg =
    v === 'primary' ? t.primary : v === 'danger' ? t.dangerBg : v === 'secondary' ? t.surfaceAlt : 'transparent';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled || props.loading}
      onPress={props.onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          minHeight: 44,
          paddingHorizontal: space.lg,
          borderRadius: radius.md,
          backgroundColor: bg,
          opacity: props.disabled ? 0.5 : pressed ? 0.8 : 1,
        },
        props.style,
      ]}
    >
      {props.loading ? (
        <ActivityIndicator color={fg} />
      ) : props.icon ? (
        <Ionicons name={props.icon} size={18} color={fg} />
      ) : null}
      <Text style={{ color: fg, fontWeight: '600', fontSize: 15 }}>{props.label}</Text>
    </Pressable>
  );
}

export function IconButton(props: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      hitSlop={8}
      onPress={props.onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={props.icon} size={props.size ?? 22} color={props.color ?? t.text} />
    </Pressable>
  );
}

export function Card({ children, style, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: Tone }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: tone ? toneColors(t, tone).fg : t.border,
          padding: space.lg,
          gap: space.sm,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm }}>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>
        {children}
      </Text>
      {right}
    </View>
  );
}

export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const t = useTheme();
  const c = toneColors(t, tone);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
        backgroundColor: c.bg,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: radius.pill,
      }}
    >
      {icon && <Ionicons name={icon} size={12} color={c.fg} />}
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function Chip(props: { label: string; selected: boolean; onPress: () => void; count?: number }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      onPress={props.onPress}
      style={{
        paddingHorizontal: space.md,
        paddingVertical: 7,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: props.selected ? t.primary : t.border,
        backgroundColor: props.selected ? t.primary : t.surface,
      }}
    >
      <Text style={{ color: props.selected ? t.onPrimary : t.text, fontSize: 13, fontWeight: '600' }}>
        {props.label}
        {props.count !== undefined ? ` ${props.count}` : ''}
      </Text>
    </Pressable>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.surfaceAlt, borderRadius: radius.md, padding: 3 }}>
      {props.options.map((o) => {
        const on = o.value === props.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => props.onChange(o.value)}
            style={{
              flex: 1,
              paddingVertical: 9,
              alignItems: 'center',
              borderRadius: radius.md - 3,
              backgroundColor: on ? t.surface : 'transparent',
            }}
          >
            <Text style={{ color: on ? t.text : t.muted, fontWeight: '600', fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmptyState(props: { icon: IconName; title: string; hint?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: space.xl * 2, gap: space.sm }}>
      <Ionicons name={props.icon} size={44} color={t.muted} />
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{props.title}</Text>
      {props.hint && <Text style={{ color: t.muted, textAlign: 'center' }}>{props.hint}</Text>}
      {props.action}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ color: t.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{children}</Text>
  );
}

/**
 * Text input that commits after a short idle period and on blur (onEndEditing is unreliable on web),
 * and ignores outside updates while focused so a background sync never overwrites what is being typed.
 */
export function Field({
  value,
  onCommit,
  style,
  ...rest
}: { value: string; onCommit: (v: string) => void } & Omit<TextInputProps, 'value' | 'onChangeText'>) {
  const t = useTheme();
  const [text, setText] = useState(value);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirty = useRef(false);
  const latest = useRef(text);

  useEffect(() => {
    if (!focused.current && !dirty.current) setText(value);
  }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = () => {
    clearTimeout(timer.current);
    if (dirty.current) {
      dirty.current = false;
      if (latest.current !== value) onCommit(latest.current);
    }
  };

  return (
    <TextInput
      {...rest}
      value={text}
      placeholderTextColor={t.muted}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onChangeText={(v) => {
        setText(v);
        latest.current = v;
        dirty.current = true;
        clearTimeout(timer.current);
        timer.current = setTimeout(commit, 600);
      }}
      style={[
        {
          backgroundColor: t.surface,
          color: t.text,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: radius.md,
          paddingHorizontal: space.md,
          paddingVertical: 10,
          fontSize: 15,
          minHeight: 44,
        },
        rest.multiline && { minHeight: 96, textAlignVertical: 'top' },
        style,
      ]}
    />
  );
}

export function Banner(props: {
  tone: Tone;
  icon: IconName;
  text: string;
  action?: { label: string; onPress: () => void };
  busy?: boolean;
}) {
  const t = useTheme();
  const c = toneColors(t, props.tone);
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        backgroundColor: c.bg,
        paddingHorizontal: space.lg,
        paddingVertical: space.sm,
        minHeight: 44,
      }}
    >
      {props.busy ? (
        <ActivityIndicator size="small" color={c.fg} />
      ) : (
        <Ionicons name={props.icon} size={18} color={c.fg} />
      )}
      <Text numberOfLines={2} style={{ flex: 1, color: c.fg, fontWeight: '600', fontSize: 13 }}>
        {props.text}
      </Text>
      {props.action && (
        <Pressable accessibilityRole="button" onPress={props.action.onPress} hitSlop={8}>
          <Text style={{ color: c.fg, fontWeight: '700', fontSize: 13 }}>{props.action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Snackbar(props: { message: string; actionLabel?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View
      style={{
        position: 'absolute',
        left: space.lg,
        right: space.lg,
        bottom: space.xl,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: t.text,
        borderRadius: radius.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        gap: space.md,
      }}
    >
      <Text style={{ flex: 1, color: t.bg, fontWeight: '600' }}>{props.message}</Text>
      {props.actionLabel && (
        <Pressable accessibilityRole="button" onPress={props.onAction} hitSlop={8}>
          <Text style={{ color: t.primary, fontWeight: '700' }}>{props.actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

export const relativeTime = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
};
