import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { STYLESHEET_LIMITS, SYMBOL_LABELS, type SymbolLabel, TEXT_ELEMENTS, type TextElement } from '@gp-editor/core';
import {
  SYMBOL_LABEL_NAMES,
  TEXT_ELEMENT_NAMES,
  matchingFamilies,
  stepNumber,
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
  const [element, setElement] = useState<TextElement>('title');
  const [filter, setFilter] = useState('');
  const style = sheet.texts[element];
  const shown = matchingFamilies(families, filter, style.family, SHOWN_FAMILIES);
  return (
    <>
      <ControlRow>
        <Choice palette={palette} label="Text" options={TEXT_ELEMENTS.map((each) => [each, TEXT_ELEMENT_NAMES[each]] as const)} value={element} onChoose={setElement} />
      </ControlRow>
      <ControlRow>
        <ControlLabel palette={palette} text="Font" />
        <BarButton label="System" palette={palette} isActive={style.family === ''} onPress={() => onChange(withText(sheet, element, { family: '' }))} />
        {shown.map((family) => (
          <BarButton key={family} label={family} palette={palette} isActive={family === style.family} onPress={() => onChange(withText(sheet, element, { family }))} />
        ))}
        <TextField
          testID="stylesheet-font-filter"
          value={filter}
          placeholder="Find a font"
          placeholderTextColor={palette.muted}
          onChangeText={setFilter}
          accessibilityLabel="Find a font"
          style={[styles.field, { color: palette.text, borderColor: palette.border }]}
        />
      </ControlRow>
      <ControlRow>
        <Stepper palette={palette} label="Size" isSpaced={false} value={`${style.size} pt`} onStep={(delta) => onChange(withText(sheet, element, { size: stepNumber(style.size, delta, 1, STYLESHEET_LIMITS.textSize, 1) }))} />
        <Spacer />
        <Toggle palette={palette} label="Bold" isOn={style.isBold} onToggle={(isBold) => onChange(withText(sheet, element, { isBold }))} />
        <Toggle palette={palette} label="Italic" isOn={style.isItalic} onToggle={(isItalic) => onChange(withText(sheet, element, { isItalic }))} />
        <ControlHint palette={palette} text={`${TEXT_ELEMENT_NAMES[element]}: ${textStyleText(style)}`} />
      </ControlRow>
      <ControlRow>
        <Choice palette={palette} label="Lyrics" options={[['below', 'Below'], ['above', 'Above'], ['hidden', 'Hidden']]} value={sheet.lyrics} onChoose={(lyrics) => onChange({ ...sheet, lyrics })} />
        <Choice palette={palette} label="Bar numbers" options={[['all', 'All bars'], ['systemStart', 'First of each system'], ['hidden', 'Hidden']]} value={sheet.barNumbers} onChoose={(barNumbers) => onChange({ ...sheet, barNumbers })} isSpaced />
        <Spacer />
        <Toggle palette={palette} label="Tempo decimals" isOn={sheet.notation.showsTempoDecimals} onToggle={(isOn) => onChange(withNotation(sheet, { showsTempoDecimals: isOn }))} />
      </ControlRow>
    </>
  );
}

/** Notation: the technique labels renamed (Set: one undo step), and the options of the score's symbols. */
export function NotationTab({ palette, sheet, onChange }: StylesheetTabProps) {
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
        <Choice palette={palette} label="Rename" options={SYMBOL_LABELS.map((each) => [each, SYMBOL_LABEL_NAMES[each]] as const)} value={label} onChoose={choose} />
      </ControlRow>
      <ControlRow>
        <ControlLabel palette={palette} text={`${SYMBOL_LABEL_NAMES[label]} is written`} />
        <TextField
          testID="stylesheet-label"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={apply}
          maxLength={STYLESHEET_LIMITS.labelLength}
          accessibilityLabel={`${SYMBOL_LABEL_NAMES[label]} label`}
          style={[styles.field, { color: palette.text, borderColor: palette.border }]}
        />
        <BarButton label="Set" palette={palette} isEnabled={draft !== notation.labels[label]} onPress={apply} />
      </ControlRow>
      <ControlRow>
        <ControlLabel palette={palette} text="Symbols" />
        {flag('showsLinesOverRests', 'Extend symbol lines over rests')}
        {flag('showsHopoLabels', 'H / P for hammer-ons')}
        {flag('showsSlideLabels', 'sl. for slides')}
        {flag('showsVoiceColors', 'Colour voices 2–4 in tab')}
        {flag('showsDynamics', 'Dynamics')}
        {flag('showsCommonTime', 'C for 4/4 and 2/2')}
      </ControlRow>
    </>
  );
}

const styles = StyleSheet.create({
  field: { width: 120, fontSize: 12, paddingVertical: 3, paddingHorizontal: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 4, marginRight: 4 },
});
