import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SCALES, type ScaleChoice, type ScaleMatch, scaleTitle, searchScales } from '@gp-editor/core';
import { type Translate, useT } from '../../hooks/use-i18n';
import type { Palette } from '../../theme';
import { TextField } from '../TextField';

/** Rows shown at once; the list scrolls for more. */
const LIST_HEIGHT = 140;

export interface ScaleListRowProps {
  readonly palette: Palette;
  readonly label: string;
  /** A second, smaller line (a match's fit and other names). */
  readonly detail?: string;
  readonly isSelected: boolean;
  readonly onPress: () => void;
}

/** One scale (or match) of the list; the chosen one lit. */
export function ScaleListRow({ palette, label, detail, isSelected, onPress }: ScaleListRowProps) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.row, isSelected ? { backgroundColor: palette.chromeAccent } : null]}>
      <Text numberOfLines={1} style={[styles.rowLabel, { color: isSelected ? palette.chromeAccentText : palette.chromeText }]}>
        {label}
      </Text>
      {detail === undefined ? null : (
        <Text numberOfLines={1} style={[styles.rowDetail, { color: isSelected ? palette.chromeAccentText : palette.chromeMuted }]}>
          {detail}
        </Text>
      )}
    </Pressable>
  );
}

interface ScaleListProps {
  readonly palette: Palette;
  readonly query: string;
  readonly onChangeQuery: (query: string) => void;
  readonly selectedScaleIndex?: number;
  readonly onChooseScale: (scaleIndex: number) => void;
}

/** A search field over TuxGuitar's scales (any words of the name, in any case), then the scales it finds. */
export function ScaleList({ palette, query, onChangeQuery, selectedScaleIndex, onChooseScale }: ScaleListProps) {
  const found = useMemo(() => searchScales(query), [query]);
  const t = useT();
  return (
    <View>
      <TextField
        accessibilityLabel={t('tools.scales.search')}
        value={query}
        onChangeText={onChangeQuery}
        placeholder={t('tools.scales.searchPlaceholder', { count: SCALES.length })}
        placeholderTextColor={palette.chromeMuted}
        style={[styles.search, { color: palette.chromeText, borderColor: palette.chromeBorder, backgroundColor: palette.chromeDeep }]}
      />
      <ScrollView style={[styles.list, { borderColor: palette.chromeBorder }]}>
        {found.length === 0 ? <Text style={[styles.empty, { color: palette.chromeMuted }]}>{t('tools.scales.noScale')}</Text> : null}
        {found.map((scaleIndex) => (
          <ScaleListRow key={scaleIndex} palette={palette} label={SCALES[scaleIndex]?.name ?? ''} isSelected={scaleIndex === selectedScaleIndex} onPress={() => onChooseScale(scaleIndex)} />
        ))}
      </ScrollView>
    </View>
  );
}

interface MatchListProps {
  readonly palette: Palette;
  readonly matches: readonly ScaleMatch[];
  readonly choice?: ScaleChoice;
  readonly onChoose: (choice: ScaleChoice) => void;
}

/** "every note used · root 33%", "2 notes unused · root 0% · also Aeolian Mode" (scale names as TuxGuitar writes them). */
function matchDetail(match: ScaleMatch, t: Translate): string {
  const fit = match.unusedNotes === 0 ? t('tools.scales.everyNote') : t('tools.scales.unused', { count: match.unusedNotes });
  const aliases = match.aliases.length === 0 ? '' : t('tools.scales.also', { names: `${match.aliases.slice(0, 2).join(', ')}${match.aliases.length > 2 ? '…' : ''}` });
  return t('tools.scales.matchDetail', { fit, percent: Math.round(match.rootShare * 100), aliases });
}

/** The scale finder's answer: the scales and keys that hold the notes, best first. */
export function MatchList({ palette, matches, choice, onChoose }: MatchListProps) {
  const t = useT();
  return (
    <ScrollView style={[styles.list, styles.matches, { borderColor: palette.chromeBorder }]}>
      {matches.map((match) => {
        const isSelected = choice?.rootIndex === match.choice.rootIndex && choice.scaleIndex === match.choice.scaleIndex;
        const key = `${match.choice.rootIndex}:${match.choice.scaleIndex}`;
        return <ScaleListRow key={key} palette={palette} label={scaleTitle(match.choice)} detail={matchDetail(match, t)} isSelected={isSelected} onPress={() => onChoose(match.choice)} />;
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  search: { height: 24, borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, fontSize: 12, marginBottom: 4 },
  list: { height: LIST_HEIGHT, borderWidth: 1, borderRadius: 5 },
  matches: { height: LIST_HEIGHT + 24 },
  row: { paddingHorizontal: 8, paddingVertical: 3 },
  rowLabel: { fontSize: 12 },
  rowDetail: { fontSize: 10, marginTop: 1 },
  empty: { fontSize: 11, padding: 8 },
});
