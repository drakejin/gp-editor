import { memo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Palette } from '../../theme';
import { SongInspector, type SongInspectorProps } from './SongInspector';
import { TrackInspector, type TrackInspectorProps } from './TrackInspector';

export type InspectorTab = 'song' | 'track';

export type InspectorProps = SongInspectorProps & TrackInspectorProps;

export const INSPECTOR_WIDTH = 268;

/** The right panel: SONG and TRACK tabs, as in Guitar Pro (opens on TRACK). */
function InspectorView(props: InspectorProps) {
  const { palette } = props;
  const [tab, setTab] = useState<InspectorTab>('track');
  return (
    <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]}>
      <View style={[styles.tabs, { backgroundColor: palette.chromeDeep }]}>
        {(['song', 'track'] as const).map((id) => (
          <TabButton key={id} palette={palette} label={id === 'song' ? 'SONG' : 'TRACK'} isActive={tab === id} onPress={() => setTab(id)} />
        ))}
      </View>
      <ScrollView style={styles.body}>{tab === 'song' ? <SongInspector {...props} /> : <TrackInspector {...props} />}</ScrollView>
    </View>
  );
}

function TabButton({ palette, label, isActive, onPress }: { readonly palette: Palette; readonly label: string; readonly isActive: boolean; readonly onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      tooltip={`${label} settings`}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      style={[styles.tab, isActive ? { backgroundColor: palette.chromeAccent } : null]}
    >
      <Text style={[styles.tabLabel, { color: isActive ? palette.chromeAccentText : palette.chromeMuted }]}>{label}</Text>
    </Pressable>
  );
}

export const Inspector = memo(InspectorView);

const styles = StyleSheet.create({
  panel: { width: INSPECTOR_WIDTH, borderLeftWidth: 1 },
  tabs: { flexDirection: 'row', height: 26 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  body: { flex: 1 },
});
