import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

export interface PhotoSource {
  uri: string;
  headers?: Record<string, string>;
}

interface Props {
  source: PhotoSource | null;
  caption?: string;
  onClose: () => void;
}

/** Full-screen viewer: "Fit" scales to the screen, "100%" shows the image at its real pixel size (pan by scrolling). */
export function PhotoViewer({ source, caption, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [actual, setActual] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSize(null);
    setActual(false);
    setFailed(false);
    if (!source) return;
    const headers = source.headers;
    const done = (w: number, h: number) => setSize({ w, h });
    const fail = () => setFailed(true);
    if (headers && Image.getSizeWithHeaders) Image.getSizeWithHeaders(source.uri, headers, done, fail);
    else Image.getSize(source.uri, done, fail);
  }, [source]);

  const fitted = size ? Math.min(width / size.w, (height - 140) / size.h) : 1;
  const dims = size
    ? actual
      ? { width: size.w, height: size.h }
      : { width: size.w * fitted, height: size.h * fitted }
    : { width, height: height - 140 };

  return (
    <Modal visible={!!source} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.root}>
        <View style={s.bar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={onClose} hitSlop={12}>
            <Text style={s.btn}>✕ Close</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setActual(!actual)} disabled={!size} hitSlop={12}>
            <Text style={[s.btn, !size && { opacity: 0.4 }]}>{actual ? 'Fit screen' : 'Real size (100%)'}</Text>
          </Pressable>
        </View>
        {failed ? (
          <Text style={s.msg}>Photo unavailable (offline or not uploaded yet).</Text>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.content}
            maximumZoomScale={5}
            minimumZoomScale={1}
            bouncesZoom
            centerContent
          >
            <ScrollView horizontal contentContainerStyle={s.content} nestedScrollEnabled>
              {source && <Image source={source} style={dims} resizeMode="contain" onError={() => setFailed(true)} />}
              {!size && !failed && <ActivityIndicator color="#fff" style={StyleSheet.absoluteFill} />}
            </ScrollView>
          </ScrollView>
        )}
        <Text style={s.msg}>
          {size ? `${size.w} × ${size.h} px` : ''} {caption ?? ''}
        </Text>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', paddingTop: 40 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  btn: { color: '#fff', fontSize: 16, fontWeight: '600' },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  msg: { color: '#ddd', textAlign: 'center', padding: 12 },
});
