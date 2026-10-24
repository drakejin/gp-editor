import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useT } from '../hooks/use-i18n';
import { TextField } from './TextField';
import { TRANSCRIPTION_MODELS } from '../pdf-import/request';
import type { Palette } from '../theme';
import { BarButton } from './BarButton';
import { errorMessage } from '../lib/errors';

interface ImportPanelProps {
  readonly palette: Palette;
  readonly hasKey?: boolean;
  readonly model: string;
  readonly onSaveKey: (key: string) => Promise<void>;
  readonly onRemoveKey: () => void;
  readonly onChooseModel: (model: string) => void;
  readonly onStart: () => void;
  readonly onClose: () => void;
}

/**
 * PDF import settings: the Anthropic API key (stored by the app on this Mac, never shown again) and the model, then
 * Choose PDF… to start. Each import becomes a project in Documents/GP Editor Projects.
 */
export function ImportPanel({ palette, hasKey, model, onSaveKey, onRemoveKey, onChooseModel, onStart, onClose }: ImportPanelProps) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | undefined>(undefined);
  const save = () => {
    onSaveKey(draft)
      .then(() => {
        setDraft('');
        setMessage(t('window.import.keySaved'));
      })
      .catch((reason: unknown) => setMessage(errorMessage(reason)));
  };
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: palette.text }]}>{t('window.import.title')}</Text>
        <Text style={[styles.hint, { color: palette.muted }]}>
          {t('window.import.intro')}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.text }]}>{t('window.import.apiKey')}</Text>
        {hasKey === true ? (
          <>
            <Text style={[styles.hint, { color: palette.muted }]}>{t('window.import.keyStored')}</Text>
            <BarButton label={t('window.import.removeKey')} palette={palette} onPress={onRemoveKey} />
          </>
        ) : null}
        <TextField
          value={draft}
          onChangeText={setDraft}
          secureTextEntry
          // i18n-exempt: the start of an Anthropic key, as the key is written
          placeholder={hasKey === true ? t('window.import.replaceKey') : 'sk-ant-…'}
          placeholderTextColor={palette.muted}
          style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.paper }]}
        />
        <BarButton label={t('window.import.saveKey')} palette={palette} isEnabled={draft.trim().length > 0} onPress={save} />
        {message === undefined ? null : <Text style={[styles.hint, { color: palette.muted }]}>{message}</Text>}
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.text }]}>{t('window.import.model')}</Text>
        {TRANSCRIPTION_MODELS.map((candidate) => (
          <BarButton
            key={candidate.id}
            label={candidate.name}
            palette={palette}
            isActive={candidate.id === model}
            onPress={() => onChooseModel(candidate.id)}
          />
        ))}
      </View>
      <View style={styles.row}>
        <BarButton label={t('window.import.choosePdf')} palette={palette} isAccent isEnabled={hasKey === true} onPress={onStart} />
        <BarButton label={t('common.close')} palette={palette} onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, marginBottom: 8 },
  title: { fontSize: 13, fontWeight: '700', marginRight: 12 },
  label: { fontSize: 12, fontWeight: '600', marginRight: 8 },
  hint: { fontSize: 11, marginRight: 8 },
  input: { width: 280, height: 24, borderWidth: StyleSheet.hairlineWidth, borderRadius: 5, paddingHorizontal: 6, marginRight: 6, fontSize: 12 },
});
