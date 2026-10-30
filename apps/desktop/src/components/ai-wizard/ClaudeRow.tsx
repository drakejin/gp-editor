import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useT } from '../../hooks/use-i18n';
import { errorMessage } from '../../lib/errors';
import { TRANSCRIPTION_MODELS } from '../../pdf-import/request';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { TextField } from '../TextField';

export interface ClaudeRowProps {
  readonly palette: Palette;
  /** The Anthropic key and model are the PDF import's; undefined until known. */
  readonly hasKey?: boolean;
  readonly model: string;
  readonly onSaveKey: (key: string) => Promise<void>;
  readonly onChooseModel: (model: string) => void;
}

/** The AI Wizard panels' model choice, and the key field when no key is saved yet. */
export function ClaudeRow({ palette, hasKey, model, onSaveKey, onChooseModel }: ClaudeRowProps) {
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

const styles = StyleSheet.create({
  claude: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 8, rowGap: 4 },
  label: { width: 78, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  note: { fontSize: 11, marginLeft: 6 },
  key: { width: 230, height: 24, borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, fontSize: 12, marginHorizontal: 4 },
});
