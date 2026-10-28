import { type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TextField } from '../TextField';
import type { Palette } from '../../theme';

/** A titled block of the inspector ("INFORMATION", "MUSICAL NOTATION" …), as Guitar Pro groups its settings. */
export function InspectorSection({ palette, title, children }: { readonly palette: Palette; readonly title: string; readonly children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: palette.chromeText }]}>{title}</Text>
      {children}
    </View>
  );
}

/** "Label   control" on one line. */
export function InspectorField({ palette, label, children }: { readonly palette: Palette; readonly label: string; readonly children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: palette.chromeMuted }]}>{label}</Text>
      <View style={styles.control}>{children}</View>
    </View>
  );
}

interface InspectorTextFieldProps {
  readonly palette: Palette;
  readonly label: string;
  readonly value: string;
  readonly placeholder?: string;
  /** Called when editing ends (Return or leaving the field) with a changed value. */
  readonly onCommit: (value: string) => void;
}

/** A text field that edits the song when the user is done typing, not on every key (one undo step per change). */
export function InspectorTextField({ palette, label, value, placeholder, onCommit }: InspectorTextFieldProps) {
  const [draft, setDraft] = useState(value);
  // Counts commits: the field shows the value again after one the edit kept otherwise (a blank name, a short name
  // the name already gives), even when the value itself did not change.
  const [commits, setCommits] = useState(0);
  useEffect(() => setDraft(value), [value, commits]);
  const commit = () => {
    if (draft !== value) {
      onCommit(draft);
      setCommits((count) => count + 1);
    }
  };
  return (
    <InspectorField palette={palette} label={label}>
      <TextField
        value={draft}
        placeholder={placeholder}
        placeholderTextColor={palette.chromeMuted}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        accessibilityLabel={label}
        style={[styles.input, { color: palette.chromeText, backgroundColor: palette.chromeDeep, borderColor: palette.chromeBorder }]}
      />
    </InspectorField>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '800', marginBottom: 8, letterSpacing: 0.4 },
  field: { flexDirection: 'row', alignItems: 'center', minHeight: 26, marginBottom: 4 },
  label: { width: 78, fontSize: 11, textAlign: 'right', marginRight: 8 },
  control: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  input: { flex: 1, height: 22, fontSize: 12, paddingHorizontal: 6, borderRadius: 4, borderWidth: 1 },
});
