import { PANEL_ICON_SIZE, engraveEyeIcon, engraveHeadphonesIcon, engraveSpeakerIcon } from '../src/score/panel-icons';
import { allFinite, fitsSquare } from '../test-support/score-helpers';

describe('panel icons', () => {
  it('crosses the speaker out when the track is muted', () => {
    // Act
    const playing = engraveSpeakerIcon('#FFFFFF', false);
    const muted = engraveSpeakerIcon('#FFFFFF', true);

    // Assert
    expect(playing.filter((command) => command.kind === 'curve')).toHaveLength(2);
    expect(muted.filter((command) => command.kind === 'curve')).toHaveLength(0);
    expect(muted.filter((command) => command.kind === 'line')).toHaveLength(2);
  });

  it('keeps the eye, speaker and headphones inside the icon square', () => {
    const icons = [engraveEyeIcon('#FFFFFF'), engraveSpeakerIcon('#FFFFFF', true), engraveSpeakerIcon('#FFFFFF', false), engraveHeadphonesIcon('#FFFFFF')];
    expect(icons.every((commands) => commands.length > 0 && fitsSquare(commands, PANEL_ICON_SIZE) && allFinite(commands))).toBe(true);
  });
});
