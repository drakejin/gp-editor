import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | undefined>(undefined);
  const save = () => {
    onSaveKey(draft)
      .then(() => {
        setDraft('');
        setMessage('Key saved on this Mac.');
      })
      .catch((reason: unknown) => setMessage(errorMessage(reason)));
  };
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: palette.text }]}>Import PDF → tab</Text>
        <Text style={[styles.hint, { color: palette.muted }]}>
          Claude reads the sheet music page by page; each import becomes a folder in Documents/GP Editor Projects.
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.text }]}>Anthropic API key</Text>
        {hasKey === true ? (
          <>
            <Text style={[styles.hint, { color: palette.muted }]}>saved on this Mac</Text>
            <BarButton label="Remove key" palette={palette} onPress={onRemoveKey} />
          </>
        ) : null}
        <TextField
          value={draft}
          onChangeText={setDraft}
          secureTextEntry
          placeholder={hasKey === true ? 'Replace with another key' : 'sk-ant-…'}
          placeholderTextColor={palette.muted}
          style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.paper }]}
        />
        <BarButton label="Save key" palette={palette} isEnabled={draft.trim().length > 0} onPress={save} />
        {message === undefined ? null : <Text style={[styles.hint, { color: palette.muted }]}>{message}</Text>}
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.text }]}>Model</Text>
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
        <BarButton label="Choose PDF…" palette={palette} isAccent isEnabled={hasKey === true} onPress={onStart} />
        <BarButton label="Close" palette={palette} onPress={onClose} />
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
