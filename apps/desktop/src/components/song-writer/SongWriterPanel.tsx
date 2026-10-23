import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TextField } from '../TextField';
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
  const save = () => {
    onSaveKey(draftKey)
      .then(() => setDraftKey(''))
      .catch((reason: unknown) => setMessage(errorMessage(reason)));
  };
  return (
    <View style={styles.claude}>
      <Text style={[styles.label, { color: palette.chromeMuted }]}>CLAUDE</Text>
      {TRANSCRIPTION_MODELS.map((candidate) => (
        <ChromeButton key={candidate.id} palette={palette} label={candidate.name} tooltip={`Write with ${candidate.name}`} fontSize={11} isActive={candidate.id === model} onPress={() => onChooseModel(candidate.id)} />
      ))}
      {hasKey === true ? (
        <Text style={[styles.note, { color: palette.chromeMuted }]}>API key saved on this Mac</Text>
      ) : (
        <>
          <TextField
            accessibilityLabel="Anthropic API key"
            value={draftKey}
            onChangeText={setDraftKey}
            secureTextEntry
            placeholder="Anthropic API key (sk-ant-…)"
            placeholderTextColor={palette.chromeMuted}
            style={[styles.key, { color: palette.chromeText, borderColor: palette.chromeBorder, backgroundColor: palette.chromeDeep }]}
          />
          <ChromeButton palette={palette} label="Save key" tooltip="Save the key on this Mac" fontSize={11} isEnabled={draftKey.trim() !== ''} onPress={save} />
        </>
      )}
      {message === undefined ? null : <Text style={[styles.note, { color: palette.danger }]}>{message}</Text>}
    </View>
  );
}

function statusText(status: SongWriterStatus): string {
  return status.kind === 'running' ? stepLabel(status.step) : status.kind === 'failed' ? status.message : 'Claude plans the song, then writes it section by section; it opens as a new score.';
}

/**
 * Edit ▸ AI Wizard ▸ Song Writer…: a new song for guitar and bass from a title, genre, length, lyrics and description
 * (and the open score's melody and rhythm, when asked), written by Claude.
 */
export function SongWriterPanel(props: SongWriterPanelProps) {
  const { palette, status } = props;
  const isRunning = status.kind === 'running';
  return (
    <View style={styles.overlay}>
      <Pressable testID="song-writer-backdrop" style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={props.onClose} />
      <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} accessibilityLabel="Song Writer">
        <View style={[styles.header, { borderColor: palette.chromeBorder }]}>
          <View style={styles.titles}>
            <Text style={[styles.title, { color: palette.chromeText }]}>Song Writer</Text>
            <Text style={[styles.subtitle, { color: palette.chromeMuted }]}>AI Wizard · a new song for guitar and bass, written by Claude</Text>
          </View>
          <ChromeButton palette={palette} label="Close" tooltip="Close the Song Writer" onPress={props.onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <SongWriterFields palette={palette} draft={props.draft} onChangeDraft={props.onChangeDraft} reference={props.reference} />
          <ClaudeRow palette={palette} hasKey={props.hasKey} model={props.model} onSaveKey={props.onSaveKey} onChooseModel={props.onChooseModel} />
        </ScrollView>
        <View style={[styles.footer, { borderColor: palette.chromeBorder }]}>
          <Text style={[styles.status, { color: status.kind === 'failed' ? palette.danger : palette.chromeMuted }]}>{statusText(status)}</Text>
          {isRunning ? <ChromeButton palette={palette} label="Stop" tooltip="Stop writing" onPress={props.onCancel} /> : null}
          <ChromeButton palette={palette} label="Write song" tooltip="Write the song" isActive isEnabled={!isRunning && props.hasKey === true} onPress={props.onWrite} />
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
