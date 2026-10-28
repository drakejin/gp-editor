import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TextField } from '../TextField';
import { type Translate, useT } from '../../hooks/use-i18n';
import { type SongWriterDraft, type SongWriterStatus, stepLabel } from '../../hooks/use-song-writer';
import { errorMessage } from '../../lib/errors';
import { TRANSCRIPTION_MODELS } from '../../pdf-import/request';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { SongWriterFields } from './SongWriterFields';

export interface SongWriterPanelProps {
  readonly palette: Palette;
  readonly draft: SongWriterDraft;
  readonly onChangeDraft: (change: Partial<SongWriterDraft>) => void;
  readonly status: SongWriterStatus;
  /** What the open score is, or undefined when there is nothing to build on. */
  readonly reference?: string;
  /** The Anthropic key and model are the PDF import's; undefined until known. */
  readonly hasKey?: boolean;
  readonly model: string;
  readonly onSaveKey: (key: string) => Promise<void>;
  readonly onChooseModel: (model: string) => void;
  readonly onWrite: () => void;
  readonly onCancel: () => void;
  readonly onClose: () => void;
}

/** The model choice, and the key field when no key is saved yet. */
function ClaudeRow({ palette, hasKey, model, onSaveKey, onChooseModel }: Pick<SongWriterPanelProps, 'palette' | 'hasKey' | 'model' | 'onSaveKey' | 'onChooseModel'>) {
  const [draftKey, setDraftKey] = useState('');
  const [message, setMessage] = useState<string | undefined>(undefined);
  const t = useT();
  const save = () => {
    onSaveKey(draftKey)
      .then(() => setDraftKey(''))
      .catch((reason: unknown) => setMessage(errorMessage(reason)));
  };
  return (
    <View style={styles.claude}>
      <Text style={[styles.label, { color: palette.chromeMuted }]}>{t('tools.songWriter.claude')}</Text>
      {TRANSCRIPTION_MODELS.map((candidate) => (
        <ChromeButton key={candidate.id} palette={palette} label={candidate.name} tooltip={t('tools.songWriter.writeWith', { name: candidate.name })} fontSize={11} isActive={candidate.id === model} onPress={() => onChooseModel(candidate.id)} />
      ))}
      {hasKey === true ? (
        <Text style={[styles.note, { color: palette.chromeMuted }]}>{t('tools.songWriter.keySaved')}</Text>
      ) : (
        <>
          <TextField
            accessibilityLabel={t('tools.songWriter.keyLabel')}
            value={draftKey}
            onChangeText={setDraftKey}
            autoCorrect={false}
            spellCheck={false}
            placeholder={t('tools.songWriter.keyPlaceholder')}
            placeholderTextColor={palette.chromeMuted}
            style={[styles.key, { color: palette.chromeText, borderColor: palette.chromeBorder, backgroundColor: palette.chromeDeep }]}
          />
          <ChromeButton palette={palette} label={t('tools.songWriter.saveKey')} tooltip={t('tools.songWriter.saveKeyTooltip')} fontSize={11} isEnabled={draftKey.trim() !== ''} onPress={save} />
        </>
      )}
      {message === undefined ? null : <Text style={[styles.note, { color: palette.danger }]}>{message}</Text>}
    </View>
  );
}

function statusText(status: SongWriterStatus, t: Translate): string {
  return status.kind === 'running' ? stepLabel(status.step) : status.kind === 'failed' ? status.message : t('tools.songWriter.idle');
}

/**
 * Edit ▸ AI Wizard ▸ Song Writer…: a new song for guitar and bass from a title, genre, length, lyrics and description
 * (and the open score's melody and rhythm, when asked), written by Claude.
 */
export function SongWriterPanel(props: SongWriterPanelProps) {
  const { palette, status } = props;
  const isRunning = status.kind === 'running';
  const t = useT();
  return (
    <View style={styles.overlay}>
      <Pressable testID="song-writer-backdrop" style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={props.onClose} />
      <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} accessibilityLabel={t('tools.songWriter.title')}>
        <View style={[styles.header, { borderColor: palette.chromeBorder }]}>
          <View style={styles.titles}>
            <Text style={[styles.title, { color: palette.chromeText }]}>{t('tools.songWriter.title')}</Text>
            <Text style={[styles.subtitle, { color: palette.chromeMuted }]}>{t('tools.songWriter.subtitle')}</Text>
          </View>
          <ChromeButton palette={palette} label={t('common.close')} tooltip={t('tools.songWriter.closeTooltip')} onPress={props.onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <SongWriterFields palette={palette} draft={props.draft} onChangeDraft={props.onChangeDraft} reference={props.reference} />
          <ClaudeRow palette={palette} hasKey={props.hasKey} model={props.model} onSaveKey={props.onSaveKey} onChooseModel={props.onChooseModel} />
        </ScrollView>
        <View style={[styles.footer, { borderColor: palette.chromeBorder }]}>
          <Text style={[styles.status, { color: status.kind === 'failed' ? palette.danger : palette.chromeMuted }]}>{statusText(status, t)}</Text>
          {isRunning ? <ChromeButton palette={palette} label={t('tools.songWriter.stop')} tooltip={t('tools.songWriter.stopTooltip')} onPress={props.onCancel} /> : null}
          <ChromeButton palette={palette} label={t('tools.songWriter.write')} tooltip={t('tools.songWriter.writeTooltip')} isActive isEnabled={!isRunning && props.hasKey === true} onPress={props.onWrite} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  panel: { width: 680, maxHeight: '92%', borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  titles: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 2 },
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  claude: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 8, rowGap: 4 },
  label: { width: 78, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  note: { fontSize: 11, marginLeft: 6 },
  key: { width: 230, height: 24, borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, fontSize: 12, marginHorizontal: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, columnGap: 6 },
  status: { flex: 1, fontSize: 12 },
});
