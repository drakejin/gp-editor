import type { EN_SETTINGS } from '../en/settings';
import type { Catalog } from '../messages';

/** Korean texts of GP Editor ▸ 설정…: the keys of ../en/settings.ts, in the words of ../glossary.md. */
export const KO_SETTINGS: Catalog<typeof EN_SETTINGS> = {
  'settings.title': '설정',
  'settings.accessibility': '설정',
  'settings.closeTooltip': '설정 닫기 (Esc)',
  'settings.section.language': '언어',
  'settings.section.display': '화면',
  'settings.language': '언어',
  'settings.language.system': '시스템 설정 따름 ({language})',
  'settings.language.en': 'English',
  'settings.language.ko': '한국어',
  'settings.language.hint': '창은 바로 바뀝니다. macOS가 직접 만드는 메뉴 항목(서비스, 윈도우, 종료 등)은 다음 실행부터 바뀝니다.',
  'settings.language.restart': 'GP Editor를 다시 시작하면 시스템 메뉴 항목도 새 언어로 표시됩니다.',
  'settings.contrast': '인터페이스 대비',
  'settings.contrast.standard': '표준',
  'settings.contrast.high': '높음',
  'settings.contrast.hint': '대비를 높이면 패널은 더 어두워지고 글자와 테두리는 더 밝아집니다.',
  'settings.paper': '악보 용지',
  'settings.paper.system': '시스템 설정 따름',
  'settings.paper.light': '밝게',
  'settings.paper.dark': '어둡게',
  'settings.paper.hint': '악보가 그려지는 종이의 색입니다. PDF, PNG, 인쇄는 늘 흰 종이에 검은 글씨입니다.',
  'settings.saveFailed': '설정을 저장하지 못했습니다',
};
