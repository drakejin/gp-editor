import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { STYLESHEET_LIMITS, SYMBOL_LABELS, type SymbolLabel, TEXT_ELEMENTS, type TextElement } from '@gp-editor/core';
import { useT } from '../../hooks/use-i18n';
import {
  matchingFamilies,
  stepNumber,
  symbolLabelName,
  textElementName,
  textStyleText,
  withLabel,
  withNotation,
  withText,
} from '../../lib/stylesheet-draft';
import { BarButton } from '../BarButton';
import { TextField } from '../TextField';
import type { StylesheetTabProps } from './PageTabs';
import { Choice, ControlHint, ControlLabel, ControlRow, Spacer, Stepper, Toggle } from './StylesheetControls';

/** Families offered at once under the font filter. */
const SHOWN_FAMILIES = 8;

interface TextsTabProps extends StylesheetTabProps {
  /** The font families installed on the Mac. */
  readonly families: readonly string[];
}

/** Texts & Styles: a font for each text of the score, where the lyrics and bar numbers go, the tempo's decimals. */
export function TextsTab({ palette, sheet, onChange, families }: TextsTabProps) {
  const t = useT();
  const [element, setElement] = useState<TextElement>('title');
  const [filter, setFilter] = useState('');
  const style = sheet.texts[element];
  const shown = matchingFamilies(families, filter, style.family, SHOWN_FAMILIES);
  return (
    <>
      <ControlRow>
        <Choice palette={palette} label={t('stylesheet.texts.text')} options={TEXT_ELEMENTS.map((each) => [each, textElementName(each)] as const)} value={element} onChoose={setElement} />
      </ControlRow>
      <ControlRow>
        <ControlLabel palette={palette} text={t('stylesheet.texts.font')} />
        <BarButton label={t('stylesheet.texts.systemFont')} palette={palette} isActive={style.family === ''} onPress={() => onChange(withText(sheet, element, { family: '' }))} />
        {shown.map((family) => (
          <BarButton key={family} label={family} palette={palette} isActive={family === style.family} onPress={() => onChange(withText(sheet, element, { family }))} />
        ))}
        <TextField
          testID="stylesheet-font-filter"
          value={filter}
          placeholder={t('stylesheet.texts.findFont')}
          placeholderTextColor={palette.muted}
          onChangeText={setFilter}
          accessibilityLabel={t('stylesheet.texts.findFont')}
          style={[styles.field, { color: palette.text, borderColor: palette.border }]}
        />
      </ControlRow>
      <ControlRow>
        <Stepper palette={palette} label={t('stylesheet.texts.size')} isSpaced={false} value={`${style.size} pt`} onStep={(delta) => onChange(withText(sheet, element, { size: stepNumber(style.size, delta, 1, STYLESHEET_LIMITS.textSize, 1) }))} />
        <Spacer />
        <Toggle palette={palette} label={t('stylesheet.texts.bold')} isOn={style.isBold} onToggle={(isBold) => onChange(withText(sheet, element, { isBold }))} />
        <Toggle palette={palette} label={t('stylesheet.texts.italic')} isOn={style.isItalic} onToggle={(isItalic) => onChange(withText(sheet, element, { isItalic }))} />
        <ControlHint palette={palette} text={t('stylesheet.texts.style', { element: textElementName(element), style: textStyleText(style) })} />
      </ControlRow>
      <ControlRow>
        <Choice
          palette={palette}
          label={t('stylesheet.texts.lyrics')}
          options={[
            ['below', t('stylesheet.texts.lyrics.below')],
            ['above', t('stylesheet.texts.lyrics.above')],
            ['hidden', t('stylesheet.texts.lyrics.hidden')],
          ]}
          value={sheet.lyrics}
          onChoose={(lyrics) => onChange({ ...sheet, lyrics })}
        />
        <Choice
          palette={palette}
          label={t('stylesheet.texts.barNumbers')}
          options={[
            ['all', t('stylesheet.texts.barNumbers.all')],
            ['systemStart', t('stylesheet.texts.barNumbers.systemStart')],
            ['hidden', t('stylesheet.texts.barNumbers.hidden')],
          ]}
          value={sheet.barNumbers}
          onChoose={(barNumbers) => onChange({ ...sheet, barNumbers })}
          isSpaced
        />
        <Spacer />
        <Toggle palette={palette} label={t('stylesheet.texts.tempoDecimals')} isOn={sheet.notation.showsTempoDecimals} onToggle={(isOn) => onChange(withNotation(sheet, { showsTempoDecimals: isOn }))} />
      </ControlRow>
    </>
  );
}

/** Notation: the technique labels renamed (Set: one undo step), and the options of the score's symbols. */
export function NotationTab({ palette, sheet, onChange }: StylesheetTabProps) {
  const t = useT();
  const [label, setLabel] = useState<SymbolLabel>('palmMute');
  const [draft, setDraft] = useState(sheet.notation.labels.palmMute);
  const { notation } = sheet;
  const choose = (next: SymbolLabel) => {
    setLabel(next);
    setDraft(notation.labels[next]);
  };
  const apply = () => onChange(withLabel(sheet, label, draft));
  const flag = (key: Exclude<keyof typeof notation, 'labels' | 'showsTempoDecimals'>, name: string) => (
    <Toggle palette={palette} label={name} isOn={notation[key]} onToggle={(isOn) => onChange(withNotation(sheet, { [key]: isOn }))} />
  );
  return (
    <>
      <ControlRow>
        <Choice palette={palette} label={t('stylesheet.notation.rename')} options={SYMBOL_LABELS.map((each) => [each, symbolLabelName(each)] as const)} value={label} onChoose={choose} />
      </ControlRow>
      <ControlRow>
        <ControlLabel palette={palette} text={t('stylesheet.notation.writtenAs', { label: symbolLabelName(label) })} />
        <TextField
          testID="stylesheet-label"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={apply}
          maxLength={STYLESHEET_LIMITS.labelLength}
          accessibilityLabel={t('stylesheet.notation.labelField', { label: symbolLabelName(label) })}
          style={[styles.field, { color: palette.text, borderColor: palette.border }]}
        />
        <BarButton label={t('stylesheet.notation.set')} palette={palette} isEnabled={draft !== notation.labels[label]} onPress={apply} />
      </ControlRow>
      <ControlRow>
        <ControlLabel palette={palette} text={t('stylesheet.notation.symbols')} />
        {flag('showsLinesOverRests', t('stylesheet.notation.linesOverRests'))}
        {flag('showsHopoLabels', t('stylesheet.notation.hopoLabels'))}
        {flag('showsSlideLabels', t('stylesheet.notation.slideLabels'))}
        {flag('showsVoiceColors', t('stylesheet.notation.voiceColors'))}
        {flag('showsDynamics', t('stylesheet.notation.dynamics'))}
        {flag('showsCommonTime', t('stylesheet.notation.commonTime'))}
      </ControlRow>
    </>
  );
}

const styles = StyleSheet.create({
  field: { width: 120, fontSize: 12, paddingVertical: 3, paddingHorizontal: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 4, marginRight: 4 },
});
