import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { type Song, buildEffect } from '@gp-editor/core';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { Inspector, type InspectorProps } from '../src/components/inspector/Inspector';
import { DEFAULT_MIDI_INPUT } from '../src/lib/midi-input';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const GUITAR = { id: 1, name: 'Guitar', program: 30, bank: 0, volume: 100, balance: 64, chorus: 0, reverb: 0, phaser: 0, tremolo: 0, isPercussion: false };
const SONG: Song = { ...makeSong([[beat(960, [note(1, 3)])]]), channels: [GUITAR] };
const BANKS = {
  banks: [
    { id: 'generaluser', name: 'GeneralUser GS', isRemovable: false },
    { id: 'file:mine.sf2', name: 'mine', isRemovable: true },
  ],
  selectedId: 'file:mine.sf2',
};

function render(overrides: Partial<InspectorProps> = {}) {
  const props: InspectorProps = {
    palette: PALETTE,
    song: SONG,
    trackIndex: 0,
    mode: 'notationAndTab',
    soundBanks: BANKS,
    onChangeMode: jest.fn(),
    onSetSongInfo: jest.fn(),
    onSetTrackName: jest.fn(),
    onSetTrackCapo: jest.fn(),
    onSetTrackTuning: jest.fn(),
    onDismissNotice: jest.fn(),
    onEditInstrument: jest.fn(),
    onSelectSoundBank: jest.fn(),
    onAddSoundBank: jest.fn(),
    onRemoveSoundBank: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Inspector {...props} />);
  });
  const button = (tooltip: string) => renderer.root.findAllByType(ChromeButton).find((candidate) => candidate.props.tooltip === tooltip);
  const press = (tooltip: string) => ReactTestRenderer.act(() => button(tooltip)?.props.onPress());
  const openTab = (label: 'SONG' | 'TRACK' | 'NOTE') =>
    ReactTestRenderer.act(() =>
      renderer.root.findAll((node) => node.props.tooltip === `${label} settings` && typeof node.props.onPress === 'function')[0]?.props.onPress(),
    );
  const field = (label: string) => renderer.root.findAllByType(TextInput).find((input) => input.props.accessibilityLabel === label);
  const edit = (label: string, text: string) => {
    ReactTestRenderer.act(() => field(label)?.props.onChangeText(text));
    ReactTestRenderer.act(() => field(label)?.props.onSubmitEditing());
  };
  const texts = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  return { props, button, press, openTab, field, edit, texts };
}

describe('Inspector TRACK tab: effects', () => {
  it('edits the track’s effects in its EFFECTS section, heard while a slider is dragged', () => {
    // Arrange
    const onSetTrackEffects = jest.fn();
    const onPreviewMix = jest.fn();
    const inspector = render({ onSetTrackEffects, onPreviewMix });

    // Act
    inspector.press('Add an effect at the end');
    inspector.press('Add Reverb');

    // Assert
    expect(inspector.texts()).toEqual(expect.arrayContaining(['EFFECTS', 'No effects: the track plays its instrument as it is.']));
    expect(onSetTrackEffects).toHaveBeenCalledWith(0, [buildEffect('reverb')]);
  });

  it('has no EFFECTS section where effects cannot be edited', () => {
    expect(render().texts()).not.toContain('EFFECTS');
  });
});

describe('Inspector TRACK tab', () => {
  it('opens on the track: its name, notation toggles and instrument', () => {
    const inspector = render();
    expect(inspector.field('Name')?.props.value).toBe('Guitar');
    expect(inspector.button('Show standard notation')?.props.isActive).toBe(true);
    expect(inspector.button('Show tablature')?.props.isActive).toBe(true);
    expect(inspector.button('Choose the track’s instrument')?.props.label).toBe('♪ Distortion Electric Guitar ▾');
  });

  it('shows or hides the score’s chord names and diagrams', () => {
    // Arrange
    const onChangeChordDisplay = jest.fn();
    const inspector = render({ chordDisplay: { showsNames: true, showsDiagrams: false }, onChangeChordDisplay });

    // Act
    inspector.press('Show chord diagrams over the staff');
    inspector.press('Show chord names over the staff');

    // Assert
    expect(inspector.button('Show chord names over the staff')?.props.isActive).toBe(true);
    expect(inspector.button('Show chord diagrams over the staff')?.props.isActive).toBe(false);
    expect(onChangeChordDisplay.mock.calls).toEqual([[{ showsNames: true, showsDiagrams: true }], [{ showsNames: false, showsDiagrams: false }]]);
  });

  it('renames the track when typing ends, not on every key', () => {
    // Arrange
    const inspector = render();

    // Act
    ReactTestRenderer.act(() => inspector.field('Name')?.props.onChangeText('Lead'));
    const whileTyping = (inspector.props.onSetTrackName as jest.Mock).mock.calls.length;
    ReactTestRenderer.act(() => inspector.field('Name')?.props.onBlur());

    // Assert
    expect(whileTyping).toBe(0);
    expect(inspector.props.onSetTrackName).toHaveBeenCalledWith(0, 'Lead');
  });

  it('hides tablature, moves the capo and opens the instrument picker', () => {
    // Arrange
    const inspector = render();

    // Act
    inspector.press('Show tablature');
    inspector.press('Capo one fret higher');
    inspector.press('Choose the track’s instrument');

    // Assert
    expect(inspector.props.onChangeMode).toHaveBeenCalledWith('notation');
    expect(inspector.props.onSetTrackCapo).toHaveBeenCalledWith(0, 1);
    expect(inspector.props.onEditInstrument).toHaveBeenCalledWith(0);
    expect(inspector.button('Capo one fret lower')?.props.isEnabled).toBe(false);
  });

  it('shows a drum track’s kit and no capo', () => {
    const drums: Song = { ...SONG, tracks: SONG.tracks.map((track) => ({ ...track, isPercussion: true })), channels: [{ ...GUITAR, isPercussion: true }] };
    const inspector = render({ song: drums });
    expect(inspector.button('Guitar Pro 3–5 files hold no drum-kit setting')?.props.isEnabled).toBe(false);
    expect(inspector.button('Capo one fret higher')).toBeUndefined();
  });
});

describe('Inspector SONG tab', () => {
  it.each([
    ['ptb', 'Power Tab'],
    ['tef', 'TablEdit'],
  ] as const)('names a song read from a %s file after its program', (format, name) => {
    // Arrange
    const inspector = render({ song: { ...SONG, source: { format, version: '4' } } });

    // Act
    inspector.openTab('SONG');

    // Assert
    expect(inspector.texts()).toContain(`${name} · 1 track · 1 bar · 00:02`);
  });

  it('edits a song field and shows the file facts', () => {
    // Arrange
    const inspector = render();
    inspector.openTab('SONG');

    // Act
    inspector.edit('Artist', 'Blur');

    // Assert
    expect(inspector.props.onSetSongInfo).toHaveBeenCalledWith({ artist: 'Blur' });
    expect(inspector.texts()).toContain('Guitar Pro 5 · 1 track · 1 bar · 00:02');
  });

  it('names a song opened from a MIDI file', () => {
    // Arrange
    const inspector = render({ song: { ...SONG, source: { format: 'midi', version: 'SMF 1' } } });

    // Act
    inspector.openTab('SONG');

    // Assert
    expect(inspector.texts()).toContain('MIDI file · 1 track · 1 bar · 00:02');
  });

  it('lists the sound banks: select one, remove one the user added, add a SoundFont', () => {
    // Arrange
    const inspector = render();
    inspector.openTab('SONG');

    // Act
    inspector.press('Play every track with GeneralUser GS');
    inspector.press('Remove mine from the app');
    inspector.press('Add a SoundFont (.sf2) or DLS bank');

    // Assert
    expect(inspector.button('Play every track with mine')?.props.isActive).toBe(true);
    expect(inspector.props.onSelectSoundBank).toHaveBeenCalledWith('generaluser');
    expect(inspector.props.onRemoveSoundBank).toHaveBeenCalledWith('file:mine.sf2');
    expect(inspector.props.onAddSoundBank).toHaveBeenCalledTimes(1);
  });

  it('shows the MIDI input settings when the app has them', () => {
    const midiInput = { settings: DEFAULT_MIDI_INPUT, sources: [], listening: 0, changeSettings: jest.fn() };
    const inspector = render({ midiInput });
    inspector.openTab('SONG');
    expect(inspector.texts()).toContain('MIDI INPUT');
    inspector.press('Enter notes at the cursor from a MIDI keyboard or MIDI guitar');
    expect(midiInput.changeSettings).toHaveBeenCalledWith({ isEnabled: true });
  });
});

describe('Inspector NOTE tab', () => {
  it('shows the cursor note’s audio settings and steps each of them', () => {
    // Arrange
    const onEditNote = jest.fn();
    const inspector = render({ note: { ...note(1, 3), audio: { durationPercent: 80, offsetPercent: 10, velocityOffset: -5 } }, onEditNote });

    // Act
    inspector.openTab('NOTE');
    inspector.press('Play duration: longer');
    inspector.press('Start offset: earlier');
    inspector.press('Velocity change: more');
    inspector.press('Play the note as written');

    // Assert
    expect(inspector.texts()).toEqual(expect.arrayContaining(['AUDIO', '80%', '10%', '−5']));
    expect(onEditNote.mock.calls).toEqual([
      [{ type: 'shiftNoteAudio', setting: 'durationPercent', delta: 5 }],
      [{ type: 'shiftNoteAudio', setting: 'offsetPercent', delta: -5 }],
      [{ type: 'shiftNoteAudio', setting: 'velocityOffset', delta: 5 }],
      [{ type: 'resetNoteAudio' }],
    ]);
  });

  it('shows a note playing as written, and says when the cursor is on no note', () => {
    const withNote = render({ note: note(1, 3), onEditNote: jest.fn() });
    withNote.openTab('NOTE');
    expect(withNote.texts()).toEqual(expect.arrayContaining(['100%', '0%', '+0']));
    const without = render();
    without.openTab('NOTE');
    expect(without.texts()).toContain('Put the cursor on a note to set how it plays back.');
  });
});

describe('Inspector TRACK tab: slash notation', () => {
  it('writes the whole track in rhythm slashes, lit while it is', () => {
    // Arrange
    const onSetTrackSlashNotation = jest.fn();
    const plain = render({ onSetTrackSlashNotation });
    const slashed = render({ song: { ...SONG, tracks: SONG.tracks.map((track) => ({ ...track, hasSlashNotation: true })) }, onSetTrackSlashNotation });

    // Act
    plain.press('Write the whole track in rhythm slashes');
    slashed.press('Write the whole track in rhythm slashes');

    // Assert
    expect(plain.button('Write the whole track in rhythm slashes')?.props.isActive).toBe(false);
    expect(slashed.button('Write the whole track in rhythm slashes')?.props.isActive).toBe(true);
    expect(onSetTrackSlashNotation.mock.calls).toEqual([[0, true], [0, false]]);
  });
});
