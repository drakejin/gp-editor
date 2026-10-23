import { TAB_STRIP, scrollOffsetToShowTab, tabWidth } from '../src/lib/tab-strip';

describe('tabWidth', () => {
  it('shares the strip out evenly between the narrowest and widest tab', () => {
    expect(tabWidth(1000, 5)).toBe(200);
    expect(tabWidth(1000, 3)).toBe(TAB_STRIP.maxTabWidth);
    expect(tabWidth(1000, 20)).toBe(TAB_STRIP.minTabWidth);
    expect(tabWidth(1000, 7)).toBe(142);
  });

  it('draws tabs at their widest before the strip has a width, or with no tab', () => {
    expect(tabWidth(0, 4)).toBe(TAB_STRIP.maxTabWidth);
    expect(tabWidth(800, 0)).toBe(TAB_STRIP.maxTabWidth);
  });
});

describe('scrollOffsetToShowTab', () => {
  it('leaves the strip where it is when the tab is in view', () => {
    expect(scrollOffsetToShowTab(2, 120, 0, 600)).toBeUndefined();
    expect(scrollOffsetToShowTab(5, 120, 240, 480)).toBeUndefined();
  });

  it('scrolls back to a tab left of the view, and on to one right of it', () => {
    // Arrange: tabs 120 wide, a view 480 wide scrolled to 600 (tabs 5–8 in view)
    const scrollX = 600;

    // Act + Assert
    expect(scrollOffsetToShowTab(2, 120, scrollX, 480)).toBe(240);
    expect(scrollOffsetToShowTab(10, 120, scrollX, 480)).toBe(840);
  });

  it('does not scroll before the strip has a width or for no tab', () => {
    expect(scrollOffsetToShowTab(9, 120, 0, 0)).toBeUndefined();
    expect(scrollOffsetToShowTab(-1, 120, 0, 600)).toBeUndefined();
  });
});
