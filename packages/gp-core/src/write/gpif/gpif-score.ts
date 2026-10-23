// GPIF `<Score>`: the song information and page layout (no TuxGuitar counterpart: the inverse of the reader's readScore).
import type { SongInfo } from '../../model/song';
import { type XmlNode, xmlCdata, xmlElement, xmlText } from './xml-writer';

/** Page header and footer as Guitar Pro's rich text, with the placeholders it fills in. */
const QT_RICH_TEXT = '<html><head><meta name="qrichtext" content="1" /></head><body>';
const centered = (size: number, field: string): string => `<p align="center"><span style=" font-size:${size}pt;">${field}</span></p>`;
const FIRST_PAGE_HEADER =
  `${QT_RICH_TEXT}${centered(35, '%TITLE%')}${centered(16, '%SUBTITLE%')}${centered(16, '%ARTIST%')}` +
  `${centered(16, '%ALBUM%')}${centered(12, '%WORDS&MUSIC%')}</body></html>`;
const PAGE_FOOTER = `${QT_RICH_TEXT}<p align="right">Page %page%/%pages%</p></body></html>`;
/** Guitar Pro's page layout defaults. "0>" is how Guitar Pro writes multi-voice editing off. */
const SYSTEMS_LAYOUT = 4;
const MULTI_VOICE_OFF = '0>';

/** `<Score>`: the song information (notices one per line; WordsAndMusic left empty, the reader then keeps Words and Music). */
export function scoreNode(info: SongInfo): XmlNode {
  return xmlElement('Score', [
    xmlCdata('Title', info.title),
    xmlCdata('SubTitle', info.subtitle),
    xmlCdata('Artist', info.artist),
    xmlCdata('Album', info.album),
    xmlCdata('Words', info.words),
    xmlCdata('Music', info.music),
    xmlCdata('WordsAndMusic', ''),
    xmlCdata('Copyright', info.copyright),
    xmlCdata('Tabber', info.transcriber),
    xmlCdata('Instructions', info.instructions),
    xmlCdata('Notices', info.notice.join('\n')),
    xmlCdata('FirstPageHeader', FIRST_PAGE_HEADER),
    xmlCdata('FirstPageFooter', PAGE_FOOTER),
    xmlCdata('PageHeader', ''),
    xmlCdata('PageFooter', PAGE_FOOTER),
    xmlText('ScoreSystemsDefaultLayout', SYSTEMS_LAYOUT),
    xmlText('ScoreSystemsLayout', SYSTEMS_LAYOUT),
    xmlText('ScoreZoomPolicy', 'Value'),
    xmlText('ScoreZoom', 1),
    xmlText('MultiVoice', MULTI_VOICE_OFF),
  ]);
}
