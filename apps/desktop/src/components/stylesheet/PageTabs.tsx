import { type HeaderElement, HEADER_ELEMENTS, PAGE_FORMATS, type PageFormatId, type PageMargins, STYLESHEET_LIMITS, type Stylesheet, type TrackNameFormat } from '@gp-editor/core';
import {
  HEADER_ELEMENT_NAMES,
  millimetresText,
  pageSummary,
  percentText,
  stepNumber,
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

const FORMATS: readonly (readonly [PageFormatId, string])[] = [...PAGE_FORMATS.map((format) => [format.id, format.name] as const), ['custom', 'Custom']];
const MARGINS: readonly (readonly [keyof PageMargins, string])[] = [['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']];
const NAME_FORMATS: readonly (readonly [TrackNameFormat, string])[] = [['full', 'Full'], ['short', 'Short'], ['hidden', 'None']];
/** A custom page's size steps by 5 mm. */
const PAGE_SIZE_STEP = 5;
const SPACING_STEP = 2;

/** Page & Score Format: the page (PDF, PNG and Print), its margins, the score's scale and note spacing. */
export function PageTab({ palette, sheet, onChange }: StylesheetTabProps) {
  const { page } = sheet;
  const custom = (key: 'customWidth' | 'customHeight') => (delta: -1 | 1) => onChange(withPage(sheet, { [key]: stepNumber(page[key], delta, PAGE_SIZE_STEP, STYLESHEET_LIMITS.pageSize, 1) }));
  return (
    <>
      <ControlRow>
        <Choice palette={palette} label="Format" options={FORMATS} value={page.format} onChoose={(format) => onChange(withPage(sheet, { format }))} />
      </ControlRow>
      <ControlRow>
        <Choice palette={palette} label="Orientation" options={[['portrait', 'Portrait'], ['landscape', 'Landscape']]} value={page.orientation} onChoose={(orientation) => onChange(withPage(sheet, { orientation }))} />
        {page.format === 'custom' ? (
          <>
            <Stepper palette={palette} label="Width" value={millimetresText(page.customWidth)} onStep={custom('customWidth')} />
            <Stepper palette={palette} label="Height" value={millimetresText(page.customHeight)} onStep={custom('customHeight')} />
          </>
        ) : null}
        <ControlHint palette={palette} text={pageSummary(page)} />
      </ControlRow>
      <ControlRow>
        <ControlLabel palette={palette} text="Margins" />
        {MARGINS.map(([side, name]) => (
          <Stepper key={side} palette={palette} label={name} value={millimetresText(page.margins[side])} onStep={(delta) => onChange(withMargin(sheet, side, stepNumber(page.margins[side], delta, 1, STYLESHEET_LIMITS.margin, 1)))} />
        ))}
      </ControlRow>
      <ControlRow>
        <ControlLabel palette={palette} text="Sizes" />
        <Stepper palette={palette} label="Scale" value={percentText(sheet.scale)} onStep={(delta) => onChange({ ...sheet, scale: stepNumber(sheet.scale, delta, 0.05, STYLESHEET_LIMITS.scale) })} />
        <Stepper palette={palette} label="Rhythm spacing" value={sheet.noteSpacing.toFixed(1)} onStep={(delta) => onChange({ ...sheet, noteSpacing: stepNumber(sheet.noteSpacing, delta, 0.1, STYLESHEET_LIMITS.noteSpacing) })} />
      </ControlRow>
    </>
  );
}

/** "+ 12 pt" of room added to the app's own. */
const spacingText = (value: number): string => `+${value} pt`;

/** Systems & Staves: the room between systems, tracks and staves, bars per system, the multitrack system's names and bar lines. */
export function SystemsTab({ palette, sheet, onChange }: StylesheetTabProps) {
  const { systems } = sheet;
  const spacing = (key: 'systemSpacing' | 'trackSpacing' | 'staffSpacing') => (delta: -1 | 1) =>
    onChange(withSystems(sheet, { [key]: stepNumber(systems[key], delta, SPACING_STEP, STYLESHEET_LIMITS[key], 1) }));
  return (
    <>
      <ControlRow>
        <ControlLabel palette={palette} text="Spacing" />
        <Stepper palette={palette} label="Between systems" value={spacingText(systems.systemSpacing)} onStep={spacing('systemSpacing')} />
        <Stepper palette={palette} label="Between tracks" value={spacingText(systems.trackSpacing)} onStep={spacing('trackSpacing')} />
        <Stepper palette={palette} label="Score to tab" value={spacingText(systems.staffSpacing)} onStep={spacing('staffSpacing')} />
      </ControlRow>
      <ControlRow>
        <Stepper
          palette={palette}
          label="Bars per system"
          isSpaced={false}
          value={systems.barsPerSystem === 0 ? 'Auto' : `≤ ${systems.barsPerSystem}`}
          onStep={(delta) => onChange(withSystems(sheet, { barsPerSystem: stepNumber(systems.barsPerSystem, delta, 1, STYLESHEET_LIMITS.barsPerSystem, 0) }))}
        />
        <ControlLabel palette={palette} text="Multitrack" isSpaced />
        <Toggle palette={palette} label="Extend barlines across system" isOn={systems.showsBarlinesAcrossSystem} onToggle={(isOn) => onChange(withSystems(sheet, { showsBarlinesAcrossSystem: isOn }))} />
      </ControlRow>
      <ControlRow>
        <Choice palette={palette} label="Track names: first system" options={NAME_FORMATS} value={systems.firstSystemNames} onChoose={(firstSystemNames) => onChange(withSystems(sheet, { firstSystemNames }))} />
        <Choice palette={palette} label="Other systems" options={NAME_FORMATS} value={systems.otherSystemNames} onChoose={(otherSystemNames) => onChange(withSystems(sheet, { otherSystemNames }))} isSpaced />
      </ControlRow>
    </>
  );
}

/** Header & Footer: the song information the first page shows, and the page numbers in the footer. */
export function HeaderTab({ palette, sheet, onChange }: StylesheetTabProps) {
  return (
    <>
      <ControlRow>
        <ControlLabel palette={palette} text="Header" />
        {HEADER_ELEMENTS.map((element: HeaderElement) => (
          <Toggle key={element} palette={palette} label={HEADER_ELEMENT_NAMES[element]} isOn={sheet.header.shown[element]} onToggle={(isOn) => onChange(withHeaderShown(sheet, element, isOn))} />
        ))}
      </ControlRow>
      <ControlRow>
        <ControlLabel palette={palette} text="Footer" />
        <Toggle palette={palette} label="Title and page numbers" isOn={sheet.header.showsPageNumbers} onToggle={(isOn) => onChange({ ...sheet, header: { ...sheet.header, showsPageNumbers: isOn } })} />
        <ControlHint palette={palette} text="The song information itself is edited in the Song inspector." />
      </ControlRow>
    </>
  );
}
