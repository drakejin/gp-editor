import { type HeaderElement, HEADER_ELEMENTS, PAGE_FORMATS, type PageFormatId, type PageMargins, STYLESHEET_LIMITS, type Stylesheet, type TrackNameFormat } from '@gp-editor/core';
import { type Translate, useT } from '../../hooks/use-i18n';
import {
  millimetresText,
  pageFormatName,
  pageSummary,
  percentText,
  spacingText,
  stepNumber,
  stepScale,
  stepSpacing,
  textElementName,
  withHeaderShown,
  withMargin,
  withPage,
  withSystems,
} from '../../lib/stylesheet-draft';
import type { Palette } from '../../theme';
import { Choice, ControlHint, ControlLabel, ControlRow, Stepper, Toggle } from './StylesheetControls';

export interface StylesheetTabProps {
  readonly palette: Palette;
  readonly sheet: Stylesheet;
  /** The stylesheet with one value changed: one undo step, shown on the score at once. */
  readonly onChange: (sheet: Stylesheet) => void;
}

const FORMATS: readonly PageFormatId[] = [...PAGE_FORMATS.map((format) => format.id), 'custom'];
const MARGINS: readonly (keyof PageMargins)[] = ['top', 'bottom', 'left', 'right'];

const marginName = (side: keyof PageMargins, t: Translate): string => t(`stylesheet.page.margin.${side}`);
const nameFormats = (t: Translate): readonly (readonly [TrackNameFormat, string])[] => [
  ['full', t('stylesheet.systems.names.full')],
  ['short', t('stylesheet.systems.names.short')],
  ['hidden', t('stylesheet.systems.names.hidden')],
];

/** A custom page's size steps by 5 mm. */
const PAGE_SIZE_STEP = 5;

/** Page & Score Format: the page (PDF, PNG and Print), its margins, the score's scale and note spacing. */
export function PageTab({ palette, sheet, onChange }: StylesheetTabProps) {
  const t = useT();
  const { page } = sheet;
  const custom = (key: 'customWidth' | 'customHeight') => (delta: -1 | 1) => onChange(withPage(sheet, { [key]: stepNumber(page[key], delta, PAGE_SIZE_STEP, STYLESHEET_LIMITS.pageSize, 1) }));
  return (
    <>
      <ControlRow>
        <Choice palette={palette} label={t('stylesheet.page.format')} options={FORMATS.map((format) => [format, pageFormatName(format)] as const)} value={page.format} onChoose={(format) => onChange(withPage(sheet, { format }))} />
      </ControlRow>
      <ControlRow>
        <Choice
          palette={palette}
          label={t('stylesheet.page.orientation')}
          options={[
            ['portrait', t('stylesheet.page.portrait')],
            ['landscape', t('stylesheet.page.landscape')],
          ]}
          value={page.orientation}
          onChoose={(orientation) => onChange(withPage(sheet, { orientation }))}
        />
        {page.format === 'custom' ? (
          <>
            <Stepper palette={palette} label={t('stylesheet.page.width')} value={millimetresText(page.customWidth)} onStep={custom('customWidth')} />
            <Stepper palette={palette} label={t('stylesheet.page.height')} value={millimetresText(page.customHeight)} onStep={custom('customHeight')} />
          </>
        ) : null}
        <ControlHint palette={palette} text={pageSummary(page)} />
      </ControlRow>
      <ControlRow>
        <ControlLabel palette={palette} text={t('stylesheet.page.margins')} />
        {MARGINS.map((side) => (
          <Stepper key={side} palette={palette} label={marginName(side, t)} value={millimetresText(page.margins[side])} onStep={(delta) => onChange(withMargin(sheet, side, stepNumber(page.margins[side], delta, 1, STYLESHEET_LIMITS.margin, 1)))} />
        ))}
      </ControlRow>
      <ControlRow>
        <ControlLabel palette={palette} text={t('stylesheet.page.sizes')} />
        <Stepper palette={palette} label={t('stylesheet.page.scale')} value={percentText(sheet.scale)} onStep={(delta) => onChange(stepScale(sheet, delta))} />
        <Stepper palette={palette} label={t('stylesheet.page.noteSpacing')} value={sheet.noteSpacing.toFixed(1)} onStep={(delta) => onChange({ ...sheet, noteSpacing: stepNumber(sheet.noteSpacing, delta, 0.1, STYLESHEET_LIMITS.noteSpacing) })} />
      </ControlRow>
    </>
  );
}

/** Systems & Staves: the room between systems, tracks and staves, bars per system, the multitrack system's names and bar lines. */
export function SystemsTab({ palette, sheet, onChange }: StylesheetTabProps) {
  const t = useT();
  const { systems } = sheet;
  const names = nameFormats(t);
  const spacing = (key: 'systemSpacing' | 'trackSpacing' | 'staffSpacing') => (delta: -1 | 1) => onChange(stepSpacing(sheet, key, delta));
  return (
    <>
      <ControlRow>
        <ControlLabel palette={palette} text={t('stylesheet.systems.spacing')} />
        <Stepper palette={palette} label={t('stylesheet.systems.betweenSystems')} value={spacingText(systems.systemSpacing)} onStep={spacing('systemSpacing')} />
        <Stepper palette={palette} label={t('stylesheet.systems.betweenTracks')} value={spacingText(systems.trackSpacing)} onStep={spacing('trackSpacing')} />
        <Stepper palette={palette} label={t('stylesheet.systems.scoreToTab')} value={spacingText(systems.staffSpacing)} onStep={spacing('staffSpacing')} />
      </ControlRow>
      <ControlRow>
        <Stepper
          palette={palette}
          label={t('stylesheet.systems.barsPerSystem')}
          isSpaced={false}
          value={systems.barsPerSystem === 0 ? t('stylesheet.systems.auto') : `≤ ${systems.barsPerSystem}`}
          onStep={(delta) => onChange(withSystems(sheet, { barsPerSystem: stepNumber(systems.barsPerSystem, delta, 1, STYLESHEET_LIMITS.barsPerSystem, 0) }))}
        />
        <ControlLabel palette={palette} text={t('stylesheet.systems.multitrack')} isSpaced />
        <Toggle palette={palette} label={t('stylesheet.systems.barlinesAcross')} isOn={systems.showsBarlinesAcrossSystem} onToggle={(isOn) => onChange(withSystems(sheet, { showsBarlinesAcrossSystem: isOn }))} />
      </ControlRow>
      <ControlRow>
        <Choice palette={palette} label={t('stylesheet.systems.firstSystemNames')} options={names} value={systems.firstSystemNames} onChoose={(firstSystemNames) => onChange(withSystems(sheet, { firstSystemNames }))} />
        <Choice palette={palette} label={t('stylesheet.systems.otherSystemNames')} options={names} value={systems.otherSystemNames} onChoose={(otherSystemNames) => onChange(withSystems(sheet, { otherSystemNames }))} isSpaced />
      </ControlRow>
    </>
  );
}

/** Header & Footer: the song information the first page shows, and the page numbers in the footer. */
export function HeaderTab({ palette, sheet, onChange }: StylesheetTabProps) {
  const t = useT();
  return (
    <>
      <ControlRow>
        <ControlLabel palette={palette} text={t('stylesheet.header.header')} />
        {HEADER_ELEMENTS.map((element: HeaderElement) => (
          <Toggle key={element} palette={palette} label={textElementName(element)} isOn={sheet.header.shown[element]} onToggle={(isOn) => onChange(withHeaderShown(sheet, element, isOn))} />
        ))}
      </ControlRow>
      <ControlRow>
        <ControlLabel palette={palette} text={t('stylesheet.header.footer')} />
        <Toggle palette={palette} label={t('stylesheet.header.pageNumbers')} isOn={sheet.header.showsPageNumbers} onToggle={(isOn) => onChange({ ...sheet, header: { ...sheet.header, showsPageNumbers: isOn } })} />
        <ControlHint palette={palette} text={t('stylesheet.header.hint')} />
      </ControlRow>
    </>
  );
}
