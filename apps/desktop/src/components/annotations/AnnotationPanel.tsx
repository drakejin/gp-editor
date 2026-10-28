import { type HandledKeyEvent, type KeyEvent, StyleSheet, Text, View } from 'react-native';
import type { AnnotationPlacement } from '@gp-editor/core';
import { useT } from '../../hooks/use-i18n';
import type { AnnotationDraft } from '../../lib/annotation-draft';
import type { TrackBeat } from '../../state/song-actions';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { TextField } from '../TextField';

export interface AnnotationPanelProps {
  readonly palette: Palette;
  readonly draft: AnnotationDraft;
  /** The beat has an annotation in the song (Delete takes it away). */
  readonly hasAnnotation: boolean;
  /** An annotation that can come to this beat (Move here). */
  readonly movable?: { readonly at: TrackBeat; readonly excerpt: string };
  readonly onChangeText: (text: string) => void;
  readonly onChangePlacement: (placement: AnnotationPlacement) => void;
  readonly onApply: () => void;
  readonly onDelete: () => void;
  readonly onMoveHere: () => void;
  readonly onClose: () => void;
}

/** Lines of text the field shows before it scrolls. */
const TEXT_LINES = 4;
const LINE_HEIGHT = 17;
/** ⌘↩ applies; ↩ alone starts a new line. */
// i18n-exempt: a key's name (react-native's KeyEvent.key)
const APPLY_KEYS: HandledKeyEvent[] = [{ key: 'Enter', metaKey: true }];

/**
 * Edit ▸ Annotation… (J, the palette's ✎): the annotation of the cursor's beat — a musician's note drawn in a box over or
 * under the staves —, above the score. It follows the cursor; what was typed is written by Apply (⌘↩) or when the
 * cursor goes to another beat or the panel closes (useAnnotationEditor).
 */
export function AnnotationPanel(props: AnnotationPanelProps) {
  const { palette, draft, hasAnnotation, movable, onChangeText, onChangePlacement, onApply, onDelete, onMoveHere, onClose } = props;
  const t = useT();
  const onKeyDown = (event: KeyEvent) => {
    if (event.nativeEvent.key === 'Enter' && event.nativeEvent.metaKey === true) {
      onApply();
    }
  };
  return (
    <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} accessibilityLabel={t('tools.annotation.title')}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: palette.chromeText }]}>{t('tools.annotation.title')}</Text>
        <Text style={[styles.where, { color: palette.chromeMuted }]}>{t('tools.annotation.where', { bar: draft.at.measureIndex + 1, beat: draft.at.beatIndex + 1 })}</Text>
        <Text style={[styles.label, styles.spaced, { color: palette.chromeMuted }]}>{t('tools.annotation.placement')}</Text>
        <ChromeButton palette={palette} label={t('tools.annotation.above')} tooltip={t('tools.annotation.aboveTooltip')} fontSize={11} isActive={draft.placement === 'above'} onPress={() => onChangePlacement('above')} />
        <ChromeButton palette={palette} label={t('tools.annotation.below')} tooltip={t('tools.annotation.belowTooltip')} fontSize={11} isActive={draft.placement === 'below'} onPress={() => onChangePlacement('below')} />
        <View style={styles.gap} />
        <ChromeButton palette={palette} label={t('tools.annotation.apply')} tooltip={t('tools.annotation.applyTooltip')} fontSize={11} isEnabled={draft.isEdited} onPress={onApply} />
        <ChromeButton palette={palette} label={t('tools.annotation.delete')} tooltip={t('tools.annotation.deleteTooltip')} fontSize={11} isEnabled={hasAnnotation} onPress={onDelete} />
        {movable === undefined ? null : (
          <ChromeButton
            palette={palette}
            label={t('tools.annotation.moveHere', { excerpt: movable.excerpt })}
            tooltip={t('tools.annotation.moveHereTooltip', { bar: movable.at.measureIndex + 1, beat: movable.at.beatIndex + 1 })}
            fontSize={11}
            onPress={onMoveHere}
          />
        )}
        <View style={styles.fill} />
        <ChromeButton palette={palette} label={t('common.close')} tooltip={t('tools.annotation.closeTooltip')} fontSize={11} onPress={onClose} />
      </View>
      <TextField
        accessibilityLabel={t('tools.annotation.textLabel')}
        value={draft.text}
        onChangeText={onChangeText}
        multiline
        autoFocus
        keyDownEvents={APPLY_KEYS}
        onKeyDown={onKeyDown}
        placeholder={t('tools.annotation.placeholder')}
        placeholderTextColor={palette.chromeMuted}
        style={[styles.text, { color: palette.chromeText, borderColor: palette.chromeBorder, backgroundColor: palette.chromeDeep }]}
      />
      <Text style={[styles.hint, { color: draft.isEdited ? palette.chromeText : palette.chromeMuted }]}>
        {draft.isEdited ? t('tools.annotation.edited') : t('tools.annotation.hint')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, borderBottomWidth: 1, rowGap: 5 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, columnGap: 2 },
  title: { fontSize: 13, fontWeight: '800', marginRight: 10 },
  where: { fontSize: 12, fontWeight: '600' },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginRight: 4 },
  spaced: { marginLeft: 14 },
  gap: { width: 12 },
  fill: { flex: 1 },
  text: { height: TEXT_LINES * LINE_HEIGHT + 10, borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 4, fontSize: 13 },
  hint: { fontSize: 11 },
});
