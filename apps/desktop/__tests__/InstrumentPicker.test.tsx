import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { DEFAULT_CHANNEL, type Song } from '@gp-editor/core';
import { BarButton } from '../src/components/BarButton';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { InstrumentPicker, PickerRow } from '../src/components/InstrumentPicker';
import { PickerOverlay } from '../src/components/WindowOverlays';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note, onStrings } from '../test-support/songs';

/** "Lead" playing two notes on a 6-string guitar of General MIDI `program`. */
function guitar(program: number): Song {
  const song = onStrings(makeSong([[beat(960, [note(6, 0)]), beat(1920, [note(1, 0)])]]), [64, 59, 55, 50, 45, 40], { program });
  return { ...song, tracks: song.tracks.map((track) => ({ ...track, name: 'Lead' })) };
}

function drums(): Song {
  const song = onStrings(makeSong([[beat(960, [note(1, 36)])]]), [0, 0, 0, 0, 0, 0], { isPercussion: true });
  return { ...song, channels: [{ ...DEFAULT_CHANNEL, id: 1, program: 0, bank: 128, isPercussion: true }] };
}

function render(song: Song) {
  const onChoose = jest.fn();
  const onClose = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<InstrumentPicker song={song} trackIndex={0} palette={PALETTE} onChoose={onChoose} onClose={onClose} />);
  });
  const rows = (pane: 'family' | 'instrument') => renderer.root.findAllByType(PickerRow).filter((row) => row.props.pane === pane);
  const labels = (pane: 'family' | 'instrument') => rows(pane).map((row) => row.props.label as string);
  const selected = (pane: 'family' | 'instrument') => rows(pane).filter((row) => row.props.isSelected === true).map((row) => row.props.label as string);
  const row = (pane: 'family' | 'instrument', label: string) => {
    const found = rows(pane).find((candidate) => candidate.props.label === label);
    if (found === undefined) {
      throw new Error(`no ${pane} row "${label}"`);
    }
    return found;
  };
  const press = (pane: 'family' | 'instrument', label: string) => ReactTestRenderer.act(() => row(pane, label).props.onPress());
  const button = (label: string) => renderer.root.findAllByType(ChromeButton).find((candidate) => String(candidate.props.label).includes(label));
  const pressButton = (label: string) => ReactTestRenderer.act(() => button(label)?.props.onPress());
  const texts = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  return { renderer, rows, labels, selected, row, press, button, pressButton, texts, onChoose, onClose };
}

describe('InstrumentPicker', () => {
  it('shows the two steps apart: the 16 families and the drums on the left, the chosen family’s instruments on the right', () => {
    // Act: program 30 is Distortion Electric Guitar, in the Guitar family
    const picker = render(guitar(30));

    // Assert
    expect(picker.labels('family')).toHaveLength(17);
    expect(picker.labels('family')[16]).toBe('Drums');
    expect(picker.labels('instrument')).toHaveLength(8);
    expect(picker.texts()).toEqual(expect.arrayContaining(['1  Family', '2  Instrument']));
    expect(picker.selected('family')).toEqual(['Guitar']);
    expect(picker.selected('instrument')).toEqual(['Distortion Electric Guitar']);
    expect(picker.texts()).toContain('Now: Distortion Electric Guitar');
  });

  it('browsing a family changes only the right pane; picking there plays the instrument', () => {
    // Arrange
    const picker = render(guitar(30));

    // Act
    picker.press('family', 'Brass');

    // Assert: browsing alone changes nothing yet
    expect(picker.onChoose).not.toHaveBeenCalled();
    expect(picker.labels('instrument')).toContain('Trumpet');
    expect(picker.selected('instrument')).toEqual([]);
    picker.press('instrument', 'Trumpet');
    expect(picker.onChoose).toHaveBeenCalledWith(56, false);
  });

  it('says under a bass what it makes of a guitar track, and makes it a bass unless asked to change only the sound', () => {
    // Arrange
    const picker = render(guitar(25));
    picker.press('family', 'Bass');

    // Act
    picker.press('instrument', 'Fingered Electric Bass');
    picker.pressButton('Also make the track that instrument');
    picker.press('instrument', 'Fingered Electric Bass');

    // Assert
    expect(picker.onChoose.mock.calls).toEqual([
      [33, false],
      [33, true],
    ]);
    expect(picker.button('Also make the track that instrument')?.props.label).toBe('☐ Also make the track that instrument (strings, tuning, clef)');
    expect(picker.row('instrument', 'Fingered Electric Bass').props.detail).toBeUndefined();
  });

  it('names the strings a bass gives the track while the box is ticked, and offers no box for the same kind', () => {
    const picker = render(guitar(25));
    expect(picker.button('Also make the track that instrument')).toBeUndefined();
    picker.press('family', 'Bass');
    expect(picker.row('instrument', 'Fingered Electric Bass').props.detail).toBe('Bass · 4 strings · E A D G');
    expect(picker.button('Also make the track that instrument')?.props.label).toBe('☑ Also make the track that instrument (strings, tuning, clef)');
  });

  it('asks before the drum kit takes a track’s notes out, and changes nothing on Cancel', () => {
    // Arrange
    const picker = render(guitar(25));
    picker.press('family', 'Drums');

    // Act
    picker.press('instrument', 'Drum Kit');

    // Assert
    expect(picker.onChoose).not.toHaveBeenCalled();
    expect(picker.texts()).toContain('Drum Kit for “Lead”? Drums and pitched instruments cannot play each other’s notes: its 2 notes are taken out, the rhythm staying as rests. ⌘Z puts them back.');
    picker.pressButton('Cancel');
    expect(picker.onChoose).not.toHaveBeenCalled();
    picker.press('instrument', 'Drum Kit');
    picker.pressButton('Change Instrument');
    expect(picker.onChoose).toHaveBeenCalledWith('drums', false);
  });

  it('opens a drum track on the drums, its kit chosen', () => {
    const picker = render(drums());
    expect(picker.selected('family')).toEqual(['Drums']);
    expect(picker.selected('instrument')).toEqual(['Drum Kit']);
    expect(picker.texts()).toContain('Now: Drum Kit');
  });

  it('closes with Done or by clicking outside the panel', () => {
    const picker = render(guitar(0));
    const done = picker.renderer.root.findAllByType(BarButton).find((candidate) => candidate.props.label === 'Done');
    ReactTestRenderer.act(() => done?.props.onPress());
    const backdrop = picker.renderer.root.findByProps({ testID: 'instrument-picker-backdrop' });
    ReactTestRenderer.act(() => backdrop.props.onPress());
    expect(picker.onClose).toHaveBeenCalledTimes(2);
  });
});

describe('PickerOverlay', () => {
  function renderOverlay(song: Song) {
    const dispatch = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<PickerOverlay palette={PALETTE} song={song} trackIndex={0} dispatch={dispatch} onClose={jest.fn()} />);
    });
    return { renderer, dispatch };
  }

  it('opens for a drum track too, its choice making the track that instrument', () => {
    // Arrange
    const overlay = renderOverlay(drums());

    // Act
    ReactTestRenderer.act(() => overlay.renderer.root.findByType(InstrumentPicker).props.onChoose(33, false));

    // Assert
    expect(overlay.dispatch).toHaveBeenCalledWith({ type: 'setTrackInstrument', trackIndex: 0, instrument: 33, keepsTrack: false });
  });

  it('draws nothing for a track without a channel, which has no sound to change', () => {
    const song = guitar(25);
    expect(renderOverlay({ ...song, channels: [] }).renderer.toJSON()).toBeNull();
  });
});
