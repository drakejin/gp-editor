import { StyleSheet, Text, View } from 'react-native';
import type { Palette } from '../theme';

interface DocumentTabProps {
  readonly palette: Palette;
  readonly title: string;
  readonly fileName: string;
  readonly isEdited: boolean;
}

/** The thin bar under the top bar naming the open document ("Blur - Song 2"), as Guitar Pro's document tab. */
export function DocumentTab({ palette, title, fileName, isEdited }: DocumentTabProps) {
  const name = title.length > 0 && title !== fileName ? `${title} — ${fileName}` : fileName;
  return (
    <View style={[styles.bar, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]}>
      <Text numberOfLines={1} style={[styles.name, { color: palette.chromeText }]}>
        {isEdited ? `${name}  •` : name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 22, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1 },
  name: { fontSize: 11, fontWeight: '700' },
});
