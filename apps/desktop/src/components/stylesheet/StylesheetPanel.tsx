import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DEFAULT_STYLESHEET, type Stylesheet, isDefaultStylesheet } from '@gp-editor/core';
import { COMMON_FONT_FAMILIES, STYLESHEET_TABS, type StylesheetTab } from '../../lib/stylesheet-draft';
import { fontFamilies } from '../../native/stylesheet';
import type { Palette } from '../../theme';
import { BarButton } from '../BarButton';
import { HeaderTab, PageTab, SystemsTab } from './PageTabs';
import { NotationTab, TextsTab } from './TextTabs';

interface StylesheetPanelProps {
  readonly palette: Palette;
  /** The shown song's stylesheet. */
  readonly sheet: Stylesheet;
  /** One value changed: the song's new stylesheet, one undo step, shown on the score at once. */
  readonly onChange: (sheet: Stylesheet) => void;
  readonly onClose: () => void;
  /** The tab shown first. */
  readonly initialTab?: StylesheetTab;
}

/** The installed font families, the common ones until they are known. */
function useFontFamilies(): readonly string[] {
  const [families, setFamilies] = useState<readonly string[]>(COMMON_FONT_FAMILIES);
  useEffect(() => {
    let isMounted = true;
    fontFamilies()
      .then((found) => isMounted && found.length > 0 && found !== COMMON_FONT_FAMILIES && setFamilies(found))
      // Without the native list the common families stay.
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, []);
  return families;
}

/**
 * File ▸ Stylesheet… (F7): Guitar Pro 8's Stylesheet in its five tabs — Page & Score Format, Systems & Staves,
 * Header & Footer, Texts & Styles, Notation. Every change is one undo step and the score (and the PDF) follow it at
 * once; the song keeps it (a .gp file saves it, GP3–GP5 and MusicXML cannot).
 */
export function StylesheetPanel({ palette, sheet, onChange, onClose, initialTab = 'page' }: StylesheetPanelProps) {
  const [tab, setTab] = useState<StylesheetTab>(initialTab);
  const families = useFontFamilies();
  const props = { palette, sheet, onChange };
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]} accessibilityLabel="Stylesheet">
      <View style={styles.row}>
        <Text style={[styles.title, { color: palette.text }]}>Stylesheet</Text>
        {STYLESHEET_TABS.map(([id, name]) => (
          <BarButton key={id} label={name} palette={palette} isActive={id === tab} onPress={() => setTab(id)} />
        ))}
      </View>
      {tab === 'page' ? <PageTab {...props} /> : null}
      {tab === 'systems' ? <SystemsTab {...props} /> : null}
      {tab === 'header' ? <HeaderTab {...props} /> : null}
      {tab === 'texts' ? <TextsTab {...props} families={families} /> : null}
      {tab === 'notation' ? <NotationTab {...props} /> : null}
      <View style={styles.row}>
        <BarButton label="Default Stylesheet" palette={palette} isEnabled={!isDefaultStylesheet(sheet)} onPress={() => onChange(DEFAULT_STYLESHEET)} />
        <BarButton label="Close" palette={palette} onPress={onClose} />
        <Text style={[styles.hint, { color: palette.muted }]}>Each change is one undo step; the score, the PDF and print follow it. A .gp file keeps it.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, marginBottom: 8 },
  title: { fontSize: 13, fontWeight: '700', marginRight: 12 },
  hint: { fontSize: 11, marginLeft: 4, marginRight: 8 },
});
