import { Text, useAppWindowDimensions } from './Typography';
import { Icon } from './Icon';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import {
  Alert,
  ActivityIndicator,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  View,
  type TextProps,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  MAX_DESCRIPTION_LENGTH,
  normalizeDescription,
} from '@onpurpose/core/description';
import RichDescription, { type RichDescriptionRef } from './RichDescription';
import { openDescriptionLink } from './descriptionLinks';
import {
  descriptionPositionKey,
  validDescriptionPosition,
  type DescriptionPosition,
} from '@onpurpose/core/descriptionPosition';
import {
  descriptionResume,
  rememberDescriptionPosition,
} from '@onpurpose/core/storage/descriptionBookmarks';
import { draftsFor } from './descriptionDrafts';
import { editorPalette } from './richText/editorTheme';
import { themedStyles, useTheme } from './ThemeContext';

// SDK 57 hosts DOM components in @expo/dom-webview, but Expo Go on Android
// ships its module without the registered view, so opening the editor crashed.
// Fall back to react-native-webview only where that view is missing.
const expoDomWebView =
  Platform.OS === 'web' ||
  !!(
    globalThis as { expo?: { getViewConfig?: (name: string) => unknown } }
  ).expo?.getViewConfig?.('ExpoDomWebViewModule');

export function DescriptionEditor({
  title,
  subtitle = 'Note',
  placeholder,
  colour,
  initialValue,
  baseValue = initialValue,
  draftKey,
  temporary,
  keepDraftOnApply = false,
  editable,
  Heading,
  onApply,
  onClose,
}: {
  title: string;
  /** Under the title: the note's name. */
  subtitle?: string;
  /** The empty note's prompt. */
  placeholder?: string;
  colour: string;
  initialValue: string;
  baseValue?: string;
  draftKey: string;
  temporary: boolean;
  keepDraftOnApply?: boolean;
  editable: boolean;
  Heading: ComponentType<TextProps>;
  onApply: (text: string | undefined) => boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialValue),
    [editorInitial, setEditorInitial] = useState(initialValue),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [requesting, setRequesting] = useState(false),
    [loading, setLoading] = useState(true),
    [status, setStatus] = useState('');
  const [initialPosition, setInitialPosition] = useState<DescriptionPosition>();
  const position = useRef<DescriptionPosition | undefined>(undefined);
  const editor = useRef<RichDescriptionRef>(null);
  const { fontScale } = useAppWindowDimensions();
  const theme = useTheme();
  const styles = useStyles();
  const palette = useMemo(() => editorPalette(theme), [theme]);
  const display = theme.colour(colour);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleReady = useCallback(async () => setReady(true), []);
  const handleLimit = useCallback(
    async () =>
      setStatus(
        '20,000 character limit reached. Undo or shorten the note to keep writing.',
      ),
    [],
  );
  const latest = useRef(initialValue),
    finished = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drafts = draftsFor(temporary);
  const persist = useCallback(
    (value: string) =>
      drafts.put(draftKey, {
        version: 2,
        base: baseValue,
        text: value,
        ...(position.current ? { position: position.current } : {}),
      }),
    [drafts, draftKey, baseValue],
  );
  useEffect(() => {
    let active = true;
    void Promise.all([
      drafts.get(draftKey),
      drafts.get(descriptionPositionKey(draftKey)),
    ])
      .then(([saved, bookmark]) => {
        if (!active) return;
        const resume = descriptionResume(
          saved,
          bookmark,
          initialValue,
          baseValue,
        );
        if (resume.position) {
          position.current = resume.position;
          setInitialPosition(resume.position);
        }
        const pending = resume.draft;
        if (!pending) return;
        const recover = () => {
          if (!active) return;
          position.current =
            pending.version === 2 ? pending.position : undefined;
          setInitialPosition(position.current);
          latest.current = pending.text;
          setText(pending.text);
          setEditorInitial(pending.text);
          setReady(false);
          setStatus('Recovered unsaved draft');
        };
        if (pending.base !== baseValue)
          Alert.alert(
            'A draft from an earlier version',
            'The saved note has changed since this draft was written.',
            [
              {
                text: 'Use saved note',
                onPress: () => {
                  void drafts.remove(draftKey).catch(() => {
                    if (active) setStatus('Couldn’t discard the older draft');
                  });
                },
              },
              { text: 'Recover draft', onPress: recover },
            ],
          );
        else recover();
      })
      .catch(() => {
        if (active)
          setStatus(
            'Draft recovery unavailable. Applied notes are still saved normally.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && !finished.current) {
        // Ask for exact DOM text as well as saving the last acknowledged copy.
        // This does not depend on a pending quiet-period bridge timer firing.
        editor.current?.requestSnapshot('draft');
        if (latest.current === initialValue && !position.current) return;
        void drafts
          .put(draftKey, {
            version: 2,
            base: baseValue,
            text: latest.current,
            ...(position.current ? { position: position.current } : {}),
          })
          .catch(() => {
            if (active)
              setStatus('Draft couldn’t be kept. Use Done to apply it.');
          });
      }
    });
    return () => {
      active = false;
      subscription.remove();
      if (timer.current) clearTimeout(timer.current);
      if (requestTimer.current) clearTimeout(requestTimer.current);
      if (
        !finished.current &&
        (latest.current !== initialValue || !!position.current)
      )
        void drafts
          .put(draftKey, {
            version: 2,
            base: baseValue,
            text: latest.current,
            ...(position.current ? { position: position.current } : {}),
          })
          .catch(() => {});
    };
  }, [drafts, draftKey, initialValue, baseValue]);
  const queueDraft = useCallback(
    (value: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void persist(value)
          .then(() => setStatus(''))
          .catch(() =>
            setStatus('Draft couldn’t be kept. Use Done to apply it.'),
          );
      }, 350);
    },
    [persist],
  );
  const update = useCallback(
    (value: string, location?: DescriptionPosition) => {
      if (finished.current) return;
      if (validDescriptionPosition(location)) position.current = location;
      latest.current = value;
      setText(value);
      queueDraft(value);
    },
    [queueDraft],
  );
  const handleChange = useCallback(
    async (value: string, location: DescriptionPosition) =>
      update(value, location),
    [update],
  );
  const handlePosition = useCallback(
    async (location: DescriptionPosition) => {
      if (finished.current || !validDescriptionPosition(location)) return;
      position.current = location;
      queueDraft(latest.current);
    },
    [queueDraft],
  );
  function finish(discard: boolean, value: string, applied = false) {
    const rememberedText = applied
      ? (normalizeDescription(value) ?? '')
      : value;
    Keyboard.dismiss();
    finished.current = true;
    if (timer.current) clearTimeout(timer.current);
    if (discard) void drafts.remove(draftKey).catch(() => {});
    else if (keepDraftOnApply) void persist(rememberedText).catch(() => {});
    else {
      void rememberDescriptionPosition(
        drafts,
        draftKey,
        rememberedText,
        position.current,
      ).catch(() => {});
      void drafts.remove(draftKey).catch(() => {});
    }
    onClose();
  }
  function close(value: string) {
    if (value === initialValue) {
      finish(false, value);
      return;
    }
    Alert.alert(
      'Discard note changes?',
      'The saved note will stay as it was.',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard changes',
          style: 'destructive',
          onPress: () => finish(true, value),
        },
      ],
    );
  }
  function requestSnapshot(action: 'close' | 'done') {
    if (requesting) return;
    if (!ready) {
      if (action === 'close') close(latest.current);
      return;
    }
    setRequesting(true);
    requestTimer.current = setTimeout(() => {
      setRequesting(false);
      setStatus('The editor didn’t respond. Please try again.');
    }, 5000);
    editor.current?.requestSnapshot(action);
  }
  async function snapshot(
    action: string,
    value: string,
    location: DescriptionPosition,
  ) {
    if (action === 'draft') {
      if (finished.current || value.length > MAX_DESCRIPTION_LENGTH) return;
      if (validDescriptionPosition(location)) position.current = location;
      latest.current = value;
      setText(value);
      if (timer.current) clearTimeout(timer.current);
      void persist(value).catch(() =>
        setStatus('Draft couldn’t be kept. Use Done to apply it.'),
      );
      return;
    }
    if (requestTimer.current) clearTimeout(requestTimer.current);
    setRequesting(false);
    if (finished.current) return;
    if (value.length > MAX_DESCRIPTION_LENGTH) {
      setStatus('The note is too long to apply.');
      return;
    }
    update(value, location);
    if (action === 'close') close(value);
    else if (
      action === 'done' &&
      editable &&
      onApply(normalizeDescription(value))
    )
      finish(false, value, true);
  }
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
      onRequestClose={() => requestSnapshot('close')}
    >
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.header}>
              <EditorAction
                label="Close"
                onPress={() => requestSnapshot('close')}
                colour={display}
                disabled={requesting}
              />
              <View
                style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}
              >
                <Heading numberOfLines={1} style={styles.title}>
                  {title || 'New habit'}
                </Heading>
                <Text style={styles.subtitle}>{subtitle}</Text>
              </View>
              <EditorAction
                label="Done"
                colour={display}
                disabled={!editable || loading || !ready || requesting}
                onPress={() => requestSnapshot('done')}
              />
            </View>
            {status ? (
              <Text accessibilityLiveRegion="polite" style={styles.status}>
                {status}
              </Text>
            ) : null}
            {!loading && (
              <RichDescription
                key={editorInitial}
                ref={editor}
                initialValue={editorInitial}
                initialPosition={initialPosition}
                colour={display}
                fontScale={fontScale}
                editable={editable}
                onOpenLink={openDescriptionLink}
                onReady={handleReady}
                onChange={handleChange}
                onPosition={handlePosition}
                onSnapshot={snapshot}
                onLimit={handleLimit}
                placeholder={placeholder}
                palette={palette}
                dom={{
                  useExpoDOMWebView: expoDomWebView,
                  style: { flex: 1, backgroundColor: theme.background },
                  containerStyle: { flex: 1 },
                  scrollEnabled: false,
                  keyboardDisplayRequiresUserAction: false,
                  hideKeyboardAccessoryView: false,
                  onError: () => {
                    setReady(false);
                    setFailed(true);
                    setStatus(
                      'The editor could not load. Close and reopen to recover your draft.',
                    );
                  },
                }}
              />
            )}
            {!failed && (loading || !ready) && (
              <View style={styles.loading} pointerEvents="none">
                <ActivityIndicator color={theme.ink(0x92)} />
                <Text
                  accessibilityLiveRegion="polite"
                  style={styles.loadingText}
                >
                  Opening editor…
                </Text>
              </View>
            )}
            {text.length >= MAX_DESCRIPTION_LENGTH - 500 && (
              <Text style={styles.status}>
                {text.length.toLocaleString()} /{' '}
                {MAX_DESCRIPTION_LENGTH.toLocaleString()} characters
              </Text>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function EditorAction({
  label,
  onPress,
  colour,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  colour: string;
  disabled?: boolean;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 },
      ]}
    >
      {label === 'Close' ? (
        <Icon name="close" />
      ) : (
        <Text
          style={[styles.actionText, label === 'Done' && { color: colour }]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  action: {
    minWidth: 60,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  actionText: { color: t.ink(0xbb), fontSize: 15, fontWeight: '500' },
  title: { color: t.ink(0xda), fontSize: 15, fontWeight: '600' },
  subtitle: { color: t.ink(0x77), fontSize: 12, marginTop: 3 },
  status: {
    color: t.ink(0xaf),
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  loading: {
    position: 'absolute',
    top: 80,
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: { color: t.ink(0x92), fontSize: 13 },
}));
