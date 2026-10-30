import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Translate, useT } from '../../hooks/use-i18n';
import type {
  ComposeDraft,
  ComposeResultView,
  ComposeStatus,
} from '../../hooks/use-compose';
import type { Palette } from '../../theme';
import { ClaudeRow } from '../ai-wizard/ClaudeRow';
import { ChromeButton } from '../chrome/ChromeButton';
import { ComposeFields } from './ComposeFields';

/** Warnings the result lists before "…". */
const MAX_SHOWN_WARNINGS = 6;
const SECOND_MS = 1000;

export interface ComposePanelProps {
  readonly palette: Palette;
  readonly draft: ComposeDraft;
  readonly onChangeDraft: (change: Partial<ComposeDraft>) => void;
  readonly status: ComposeStatus;
  /** The shown score's bars; undefined when no score is open. */
  readonly barCount?: number;
  readonly cursorBar: number;
  /** "1. Lead": the cursor's track. */
  readonly currentTrack: string;
  /** The Anthropic key and model are the PDF import's; undefined until known. */
  readonly hasKey?: boolean;
  readonly model: string;
  readonly onSaveKey: (key: string) => Promise<void>;
  readonly onChooseModel: (model: string) => void;
  readonly onCompose: () => void;
  readonly onCancel: () => void;
  readonly onClose: () => void;
}

/** Seconds since `startedAt` while it is set, counted once a second (only this panel re-renders). */
function useElapsedSeconds(startedAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === undefined) {
      return undefined;
    }
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), SECOND_MS);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt === undefined
    ? 0
    : Math.max(0, Math.floor((now - startedAt) / SECOND_MS));
}

function statusText(
  status: ComposeStatus,
  seconds: number,
  hasScore: boolean,
  t: Translate,
): string {
  switch (status.kind) {
    case 'running':
      return status.attempt > 1
        ? t('tools.compose.askingAgain', { attempt: status.attempt, seconds })
        : t('tools.compose.asking', { seconds });
    case 'failed':
      return status.message;
    case 'done':
      return t('tools.compose.undoHint');
    case 'idle':
      return hasScore ? t('tools.compose.idle') : t('tools.compose.noScore');
  }
}

/** What was written: the summary, what Claude read, the tokens, and the warnings. */
function ComposeResult({
  palette,
  result,
}: {
  readonly palette: Palette;
  readonly result: ComposeResultView;
}) {
  const t = useT();
  const shown = result.warnings.slice(0, MAX_SHOWN_WARNINGS);
  return (
    <View
      style={[styles.result, { borderColor: palette.chromeBorder }]}
      accessibilityLabel={result.summary}
    >
      <Text style={[styles.summary, { color: palette.chromeText }]}>
        {result.summary}
      </Text>
      <Text style={[styles.detail, { color: palette.chromeMuted }]}>
        {`${result.reading} · ${t('tools.compose.tokens', {
          input: result.usage.inputTokens,
          output: result.usage.outputTokens,
        })}`}
      </Text>
      {shown.map((warning, index) => (
        <Text
          key={index}
          style={[styles.detail, { color: palette.chromeMuted }]}
        >{`• ${warning}`}</Text>
      ))}
      {result.warnings.length > shown.length ? (
        <Text style={[styles.detail, { color: palette.chromeMuted }]}>…</Text>
      ) : null}
    </View>
  );
}

/**
 * Edit ▸ AI Wizard ▸ Compose from Here…: Claude writes bars of the open score from a start bar — the current track or all
 * tracks, maybe new tracks, as many bars as the music needs or at most a number — from the user's words.
 */
export function ComposePanel(props: ComposePanelProps) {
  const { palette, status } = props;
  const t = useT();
  const isRunning = status.kind === 'running';
  const seconds = useElapsedSeconds(isRunning ? status.startedAt : undefined);
  const hasScore = props.barCount !== undefined;
  return (
    <View style={styles.overlay}>
      <Pressable
        testID="compose-backdrop"
        style={[StyleSheet.absoluteFill, styles.backdrop]}
        onPress={isRunning ? undefined : props.onClose}
      />
      <View
        style={[
          styles.panel,
          {
            backgroundColor: palette.chrome,
            borderColor: palette.chromeBorder,
          },
        ]}
        accessibilityLabel={t('tools.compose.title')}
      >
        <View style={[styles.header, { borderColor: palette.chromeBorder }]}>
          <View style={styles.titles}>
            <Text style={[styles.title, { color: palette.chromeText }]}>
              {t('tools.compose.title')}
            </Text>
            <Text style={[styles.subtitle, { color: palette.chromeMuted }]}>
              {t('tools.compose.subtitle')}
            </Text>
          </View>
          <ChromeButton
            palette={palette}
            label={t('common.close')}
            tooltip={t('tools.compose.closeTooltip')}
            onPress={props.onClose}
          />
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <ComposeFields
            palette={palette}
            draft={props.draft}
            onChangeDraft={props.onChangeDraft}
            barCount={props.barCount ?? 0}
            cursorBar={props.cursorBar}
            currentTrack={props.currentTrack}
          />
          <ClaudeRow
            palette={palette}
            hasKey={props.hasKey}
            model={props.model}
            onSaveKey={props.onSaveKey}
            onChooseModel={props.onChooseModel}
          />
          {status.kind === 'done' ? (
            <ComposeResult palette={palette} result={status.result} />
          ) : null}
        </ScrollView>
        <View style={[styles.footer, { borderColor: palette.chromeBorder }]}>
          <Text
            style={[
              styles.status,
              {
                color:
                  status.kind === 'failed'
                    ? palette.danger
                    : palette.chromeMuted,
              },
            ]}
          >
            {statusText(status, seconds, hasScore, t)}
          </Text>
          {isRunning ? (
            <ChromeButton
              palette={palette}
              label={t('tools.compose.stop')}
              tooltip={t('tools.compose.stopTooltip')}
              onPress={props.onCancel}
            />
          ) : null}
          <ChromeButton
            palette={palette}
            label={t('tools.compose.compose')}
            tooltip={t('tools.compose.composeTooltip')}
            isActive
            isEnabled={!isRunning && hasScore && props.hasKey === true}
            onPress={props.onCompose}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  panel: {
    width: 680,
    maxHeight: '92%',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  titles: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 2 },
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  result: { borderTopWidth: 1, paddingTop: 8, marginBottom: 8, rowGap: 3 },
  summary: { fontSize: 13, fontWeight: '700' },
  detail: { fontSize: 11 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    columnGap: 6,
  },
  status: { flex: 1, fontSize: 12 },
});
