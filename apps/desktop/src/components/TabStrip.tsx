import { memo, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useT } from '../hooks/use-i18n';
import { TAB_STRIP, scrollOffsetToShowTab, tabWidth } from '../lib/tab-strip';
import type { TabLabel } from '../state/workspace';
import type { Palette } from '../theme';

interface TabStripProps {
  readonly palette: Palette;
  readonly tabs: readonly TabLabel[];
  readonly activeTabId?: string;
  readonly onSelect: (tabId: string) => void;
  /** The tab's ×; an edited tab asks before it closes (the caller's part). */
  readonly onClose: (tabId: string) => void;
}

/**
 * The open documents as tabs under the top bar, as Guitar Pro 8 shows them: the song's title (else the file name), a •
 * while edited, a × to close; the shown tab is lit. Many tabs scroll sideways, the shown one kept in view.
 */
function TabStripView({ palette, tabs, activeTabId, onSelect, onClose }: TabStripProps) {
  const [stripWidth, setStripWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  const width = tabWidth(stripWidth, tabs.length);
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTabId);
  useEffect(() => {
    const offset = scrollOffsetToShowTab(activeIndex, width, scrollX.current, stripWidth);
    if (offset !== undefined) {
      scrollX.current = offset;
      // Not animated: react-native-macos's animated scrolls do not move the view.
      scrollRef.current?.scrollTo({ x: offset, animated: false });
    }
  }, [activeIndex, width, stripWidth]);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollX.current = event.nativeEvent.contentOffset.x;
  };
  return (
    <View
      testID="tab-strip"
      style={[styles.strip, { backgroundColor: palette.chromeDeep, borderColor: palette.chromeBorder }]}
      onLayout={(event: LayoutChangeEvent) => setStripWidth(event.nativeEvent.layout.width)}
    >
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}>
        {tabs.map((tab) => (
          <TabButton key={tab.id} palette={palette} tab={tab} width={width} isActive={tab.id === activeTabId} onSelect={onSelect} onClose={onClose} />
        ))}
      </ScrollView>
    </View>
  );
}

interface TabButtonProps {
  readonly palette: Palette;
  readonly tab: TabLabel;
  readonly width: number;
  readonly isActive: boolean;
  readonly onSelect: (tabId: string) => void;
  readonly onClose: (tabId: string) => void;
}

function TabButton({ palette, tab, width, isActive, onSelect, onClose }: TabButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const background = isActive ? palette.chromeRaised : isHovered ? palette.chrome : 'transparent';
  const color = isActive ? palette.chromeText : palette.chromeMuted;
  const lit = isActive ? palette.chromeAccent : 'transparent';
  const t = useT();
  return (
    <Pressable
      testID={`tab-${tab.id}`}
      onPress={() => onSelect(tab.id)}
      onHoverIn={() => setIsHovered(true)}
      onHoverOut={() => setIsHovered(false)}
      tooltip={tab.fileName}
      accessibilityLabel={tab.isEdited ? t('window.tabs.edited', { title: tab.title }) : tab.title}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      style={[styles.tab, { width, backgroundColor: background, borderColor: palette.chromeBorder }]}
    >
      <View style={[styles.lit, { backgroundColor: lit }]} />
      <Text numberOfLines={1} style={[styles.title, { color }]}>
        {tab.title}
      </Text>
      {tab.isEdited ? <Text style={[styles.edited, { color }]}>•</Text> : null}
      <CloseButton palette={palette} title={tab.title} onPress={() => onClose(tab.id)} testID={`close-${tab.id}`} />
    </Pressable>
  );
}

interface CloseButtonProps {
  readonly palette: Palette;
  /** The tab's title, for the tooltip. */
  readonly title: string;
  readonly onPress: () => void;
  readonly testID: string;
}

function CloseButton({ palette, title, onPress, testID }: CloseButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const background = isHovered ? palette.chromeDeep : 'transparent';
  const t = useT();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onHoverIn={() => setIsHovered(true)}
      onHoverOut={() => setIsHovered(false)}
      tooltip={t('window.tabs.closeTooltip', { title })}
      accessibilityLabel={t('window.tabs.closeAccessibility', { title })}
      accessibilityRole="button"
      style={[styles.close, { backgroundColor: background }]}
    >
      <Text style={[styles.closeText, { color: isHovered ? palette.chromeText : palette.chromeMuted }]}>×</Text>
    </Pressable>
  );
}

export const TabStrip = memo(TabStripView);

const styles = StyleSheet.create({
  strip: { height: TAB_STRIP.height, borderBottomWidth: 1 },
  tab: { height: TAB_STRIP.height - 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 4, borderRightWidth: 1 },
  lit: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  title: { flex: 1, fontSize: 12, fontWeight: '600' },
  edited: { fontSize: 14, fontWeight: '800', marginHorizontal: 3 },
  close: { width: 18, height: 18, borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  closeText: { fontSize: 15, lineHeight: 17, fontWeight: '600' },
});
