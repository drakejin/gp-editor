import { StyleSheet, Text, View } from 'react-native';
import { type Translate, useT } from '../../hooks/use-i18n';
import { type AiEditDraft, MAX_AI_EDIT_SEMITONES } from '../../hooks/use-ai-edit';
import type { MessageKey } from '../../lib/i18n/en';
import { describeTransposition } from '../../state/transposition';
import type { Palette } from '../../theme';
import { WizardField, WizardRow } from '../ai-wizard/WizardFields';
import { ChromeButton } from '../chrome/ChromeButton';

/** Lines the request field shows. */
const PROMPT_LINES = 4;

/** Instructions the Ideas row writes into the request. */
const IDEAS: readonly MessageKey[] = ['aiEdit.idea.easierRiff', 'aiEdit.idea.twelfthPosition', 'aiEdit.idea.simplerChords'];

export interface AiEditFieldsProps {
  readonly palette: Palette;
  readonly draft: AiEditDraft;
  readonly onChangeDraft: (change: Partial<AiEditDraft>) => void;
  /** The selection's bars, 1-based; undefined when nothing is selected. */
  readonly selectionBars?: { readonly first: number; readonly last: number };
  /** "1. Lead": the track the cursor is on. */
  readonly currentTrack: string;
}

function selectionLabel(t: Translate, bars: AiEditFieldsProps['selectionBars']): string {
  if (bars === undefined) {
    return t('aiEdit.noSelection');
  }
  return bars.first === bars.last ? t('aiEdit.selectionOneBar', { bar: bars.first }) : t('aiEdit.selection', { first: bars.first, last: bars.last });
}

/** The selection, the cursor's track or all tracks. */
function ScopeRow({ palette, draft, onChangeDraft, selectionBars, currentTrack }: AiEditFieldsProps) {
  const t = useT();
  return (
    <WizardRow palette={palette} label={t('aiEdit.scope')}>
      <View style={styles.inline}>
        <ChromeButton
          palette={palette}
          label={selectionLabel(t, selectionBars)}
          tooltip={t(selectionBars === undefined ? 'aiEdit.noSelectionTooltip' : 'aiEdit.selectionTooltip')}
          fontSize={11}
          isEnabled={selectionBars !== undefined}
          isActive={draft.target === 'selection'}
          onPress={() => onChangeDraft({ target: 'selection' })}
        />
        <ChromeButton
          palette={palette}
          label={t('aiEdit.currentTrack', { name: currentTrack })}
          tooltip={t('aiEdit.currentTrackTooltip')}
          fontSize={11}
          isActive={draft.target === 'track'}
          onPress={() => onChangeDraft({ target: 'track' })}
        />
        <ChromeButton palette={palette} label={t('aiEdit.allTracks')} tooltip={t('aiEdit.allTracksTooltip')} fontSize={11} isActive={draft.target === 'song'} onPress={() => onChangeDraft({ target: 'song' })} />
      </View>
    </WizardRow>
  );
}

/** The presets: lower the key and make it easy to play, or the user's own instruction. */
function KindRow({ palette, draft, onChangeDraft }: AiEditFieldsProps) {
  const t = useT();
  return (
    <WizardRow palette={palette} label={t('aiEdit.edit')}>
      <View style={styles.inline}>
        <ChromeButton palette={palette} label={t('aiEdit.lowerKey')} tooltip={t('aiEdit.lowerKeyTooltip')} fontSize={11} isActive={draft.kind === 'lowerKey'} onPress={() => onChangeDraft({ kind: 'lowerKey' })} />
        <ChromeButton palette={palette} label={t('aiEdit.instruction')} tooltip={t('aiEdit.instructionTooltip')} fontSize={11} isActive={draft.kind === 'instruction'} onPress={() => onChangeDraft({ kind: 'instruction' })} />
      </View>
    </WizardRow>
  );
}

/** The preset's semitones (− / +, an octave either way) and Claude's polish. */
function KeyRows({ palette, draft, onChangeDraft }: AiEditFieldsProps) {
  const t = useT();
  const { semitones } = draft;
  const step = (delta: number) => onChangeDraft({ semitones: Math.max(-MAX_AI_EDIT_SEMITONES, Math.min(MAX_AI_EDIT_SEMITONES, semitones + delta)) });
  return (
    <>
      <WizardRow palette={palette} label={t('aiEdit.key')}>
        <View style={styles.inline}>
          <ChromeButton palette={palette} label="−" tooltip={t('aiEdit.lower')} isEnabled={semitones > -MAX_AI_EDIT_SEMITONES} onPress={() => step(-1)} />
          <Text style={[styles.amount, { color: palette.chromeText, borderColor: palette.chromeBorder, backgroundColor: palette.chromeDeep }]} accessibilityLabel={t('aiEdit.semitonesLabel')}>
            {`${semitones > 0 ? '+' : ''}${semitones}`}
          </Text>
          <ChromeButton palette={palette} label="+" tooltip={t('aiEdit.higher')} isEnabled={semitones < MAX_AI_EDIT_SEMITONES} onPress={() => step(1)} />
          <Text style={[styles.note, { color: palette.chromeMuted }]}>{semitones === 0 ? t('aiEdit.sameKey') : describeTransposition({ mode: 'chromatic', amount: semitones })}</Text>
        </View>
      </WizardRow>
      <WizardRow palette={palette} label="">
        <View style={styles.inline}>
          <ChromeButton
            palette={palette}
            label={`${draft.isPolished ? '☑' : '☐'} ${t('aiEdit.polish')}`}
            tooltip={t('aiEdit.polishTooltip')}
            fontSize={11}
            isActive={draft.isPolished}
            onPress={() => onChangeDraft({ isPolished: !draft.isPolished })}
          />
        </View>
      </WizardRow>
    </>
  );
}

/** The user's words, and ideas that fill them in. */
function RequestRows({ palette, draft, onChangeDraft }: AiEditFieldsProps) {
  const t = useT();
  return (
    <>
      <WizardRow palette={palette} label={t('aiEdit.request')}>
        <WizardField palette={palette} label={t('aiEdit.promptLabel')} value={draft.prompt} placeholder={t('aiEdit.promptPlaceholder')} lines={PROMPT_LINES} onChange={(prompt) => onChangeDraft({ prompt })} />
      </WizardRow>
      <WizardRow palette={palette} label={t('aiEdit.ideas')}>
        <View style={styles.inline}>
          {IDEAS.map((key) => (
            <ChromeButton key={key} palette={palette} label={t(key)} tooltip={t('aiEdit.ideaTooltip')} fontSize={11} isActive={draft.prompt === t(key)} onPress={() => onChangeDraft({ prompt: t(key) })} />
          ))}
        </View>
      </WizardRow>
      <WizardRow palette={palette} label="">
        <View style={styles.inline}>
          <ChromeButton
            palette={palette}
            label={`${draft.mayAddBars ? '☑' : '☐'} ${t('aiEdit.mayAddBars')}`}
            tooltip={t('aiEdit.mayAddBarsTooltip')}
            fontSize={11}
            isActive={draft.mayAddBars}
            onPress={() => onChangeDraft({ mayAddBars: !draft.mayAddBars })}
          />
        </View>
      </WizardRow>
    </>
  );
}

/** What AI Edit is asked: the scope, the preset or an instruction, and their settings. */
export function AiEditFields(props: AiEditFieldsProps) {
  return (
    <>
      <ScopeRow {...props} />
      <KindRow {...props} />
      {props.draft.kind === 'lowerKey' ? <KeyRows {...props} /> : <RequestRows {...props} />}
    </>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 2 },
  amount: { minWidth: 40, height: 24, lineHeight: 22, borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, fontSize: 13, textAlign: 'center', marginHorizontal: 2, overflow: 'hidden' },
  note: { fontSize: 11, marginHorizontal: 6 },
});
