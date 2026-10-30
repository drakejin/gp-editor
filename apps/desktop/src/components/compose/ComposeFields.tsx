import { MAX_COMPOSED_BARS } from '@gp-editor/core';
import { StyleSheet, Text, View } from 'react-native';
import { useT } from '../../hooks/use-i18n';
import type { ComposeDraft } from '../../hooks/use-compose';
import type { Palette } from '../../theme';
import { WizardField, WizardRow } from '../ai-wizard/WizardFields';
import { ChromeButton } from '../chrome/ChromeButton';
import { TextField } from '../TextField';

/** Lines the request field shows. */
const PROMPT_LINES = 5;

export interface ComposeFieldsProps {
  readonly palette: Palette;
  readonly draft: ComposeDraft;
  readonly onChangeDraft: (change: Partial<ComposeDraft>) => void;
  /** The shown score's bars: the start bar runs from 1 to one after the last. */
  readonly barCount: number;
  /** The bar the cursor is on, 1-based. */
  readonly cursorBar: number;
  /** "1. Lead": the track the cursor is on, as the scope's button names it. */
  readonly currentTrack: string;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** The start bar: − / + and a field for its number, how many bars there are (or "after the last bar"), the cursor's bar. */
function StartRow({
  palette,
  draft,
  onChangeDraft,
  barCount,
  cursorBar,
}: ComposeFieldsProps) {
  const t = useT();
  const lastStart = barCount + 1;
  const setStart = (bar: number) =>
    onChangeDraft({ startBar: clamp(bar, 1, lastStart) });
  return (
    <WizardRow palette={palette} label={t('tools.compose.start')}>
      <View style={styles.inline}>
        <ChromeButton
          palette={palette}
          label="−"
          tooltip={t('tools.compose.earlier')}
          isEnabled={draft.startBar > 1}
          onPress={() => setStart(draft.startBar - 1)}
        />
        <TextField
          accessibilityLabel={t('tools.compose.startLabel')}
          value={String(draft.startBar)}
          onChangeText={text => {
            const typed = Number.parseInt(text.replace(/\D/g, ''), 10);
            if (Number.isFinite(typed)) {
              setStart(typed);
            }
          }}
          style={[
            styles.number,
            {
              color: palette.chromeText,
              borderColor: palette.chromeBorder,
              backgroundColor: palette.chromeDeep,
            },
          ]}
        />
        <ChromeButton
          palette={palette}
          label="+"
          tooltip={t('tools.compose.later')}
          isEnabled={draft.startBar < lastStart}
          onPress={() => setStart(draft.startBar + 1)}
        />
        <Text style={[styles.note, { color: palette.chromeMuted }]}>
          {draft.startBar > barCount
            ? t('tools.compose.afterEnd')
            : t('tools.compose.startOf', { bars: barCount })}
        </Text>
        <ChromeButton
          palette={palette}
          label={t('tools.compose.atCursor')}
          tooltip={t('tools.compose.atCursorTooltip')}
          fontSize={11}
          isActive={draft.startBar === cursorBar}
          onPress={() => setStart(cursorBar)}
        />
      </View>
    </WizardRow>
  );
}

/** The current track or all tracks, and whether new tracks may be added. */
function TracksRow({
  palette,
  draft,
  onChangeDraft,
  currentTrack,
}: ComposeFieldsProps) {
  const t = useT();
  return (
    <WizardRow palette={palette} label={t('tools.compose.tracks')}>
      <View style={styles.inline}>
        <ChromeButton
          palette={palette}
          label={t('tools.compose.currentTrack', { name: currentTrack })}
          tooltip={t('tools.compose.currentTrackTooltip')}
          fontSize={11}
          isActive={draft.scope === 'track'}
          onPress={() => onChangeDraft({ scope: 'track' })}
        />
        <ChromeButton
          palette={palette}
          label={t('tools.compose.allTracks')}
          tooltip={t('tools.compose.allTracksTooltip')}
          fontSize={11}
          isActive={draft.scope === 'all'}
          onPress={() => onChangeDraft({ scope: 'all' })}
        />
        <ChromeButton
          palette={palette}
          label={`${draft.allowsNewTracks ? '☑' : '☐'} ${t(
            'tools.compose.newTracks',
          )}`}
          tooltip={t('tools.compose.newTracksTooltip')}
          fontSize={11}
          isActive={draft.allowsNewTracks}
          onPress={() =>
            onChangeDraft({ allowsNewTracks: !draft.allowsNewTracks })
          }
        />
      </View>
    </WizardRow>
  );
}

/** As many bars as the music needs, or at most a number of them (− / +). */
function LengthRow({ palette, draft, onChangeDraft }: ComposeFieldsProps) {
  const t = useT();
  const setLimit = (bars: number) =>
    onChangeDraft({
      isLimited: true,
      barLimit: clamp(bars, 1, MAX_COMPOSED_BARS),
    });
  return (
    <WizardRow palette={palette} label={t('tools.compose.length')}>
      <View style={styles.inline}>
        <ChromeButton
          palette={palette}
          label={t('tools.compose.asNeeded')}
          tooltip={t('tools.compose.asNeededTooltip')}
          fontSize={11}
          isActive={!draft.isLimited}
          onPress={() => onChangeDraft({ isLimited: false })}
        />
        <ChromeButton
          palette={palette}
          label={t('tools.compose.atMost', { count: draft.barLimit })}
          tooltip={t('tools.compose.atMostTooltip')}
          fontSize={11}
          isActive={draft.isLimited}
          onPress={() => setLimit(draft.barLimit)}
        />
        <ChromeButton
          palette={palette}
          label="−"
          tooltip={t('tools.compose.fewer')}
          isEnabled={draft.barLimit > 1}
          onPress={() => setLimit(draft.barLimit - 1)}
        />
        <ChromeButton
          palette={palette}
          label="+"
          tooltip={t('tools.compose.more')}
          isEnabled={draft.barLimit < MAX_COMPOSED_BARS}
          onPress={() => setLimit(draft.barLimit + 1)}
        />
      </View>
    </WizardRow>
  );
}

/** What Compose from Here asks for: where, which tracks, how many bars, and the user's words. */
export function ComposeFields(props: ComposeFieldsProps) {
  const t = useT();
  const { palette, draft, onChangeDraft } = props;
  return (
    <>
      <StartRow {...props} />
      <TracksRow {...props} />
      <LengthRow {...props} />
      <WizardRow palette={palette} label={t('tools.compose.request')}>
        <WizardField
          palette={palette}
          label={t('tools.compose.promptLabel')}
          value={draft.prompt}
          placeholder={t('tools.compose.promptPlaceholder')}
          lines={PROMPT_LINES}
          onChange={prompt => onChangeDraft({ prompt })}
        />
      </WizardRow>
    </>
  );
}

const styles = StyleSheet.create({
  inline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: 2,
  },
  number: {
    width: 52,
    height: 24,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    fontSize: 13,
    textAlign: 'center',
    marginHorizontal: 2,
  },
  note: { fontSize: 11, marginHorizontal: 6 },
});
