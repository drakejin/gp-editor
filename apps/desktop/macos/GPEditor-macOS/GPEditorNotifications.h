// Notification names shared by AppDelegate.swift (posts them, via the bridging header), GPFiles.m (forwards them
// to JS as the "newRequested" / "importPdfRequested" / "exportRequested" / "exportPngRequested" / "printRequested" / "helpRequested" / "songWriterRequested" / "openRequested" / "fileOpened" /
// "saveRequested" / "closeTabRequested" / "nextTabRequested" / "previousTabRequested" events) and GPQADriver.m.

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/** File ▸ New Score + Tab (⌘N) / New Score / New Tab. Object: NSString score mode ("notationAndTab", "notation", "tab"). */
FOUNDATION_EXPORT NSString *const GPEditorNewCommandNotification;

/** File ▸ Import PDF… (⇧⌘I) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorImportPdfCommandNotification;

/** File ▸ Export PDF… (⇧⌘E) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorExportCommandNotification;

/** File ▸ Export PNG… was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorExportPngCommandNotification;

/** File ▸ Export MIDI… was chosen (JS event "exportMidiRequested"). No object. */
FOUNDATION_EXPORT NSString *const GPEditorExportMidiCommandNotification;

/** File ▸ Export ASCII Tab… was chosen (JS event "exportAsciiTabRequested"). No object. */
FOUNDATION_EXPORT NSString *const GPEditorExportAsciiTabCommandNotification;

/** File ▸ Export MusicXML… was chosen (JS event "exportMusicXmlRequested"). No object. */
FOUNDATION_EXPORT NSString *const GPEditorExportMusicXmlCommandNotification;

/** File ▸ Export Compressed MusicXML… was chosen (JS event "exportCompressedMusicXmlRequested"). No object. */
FOUNDATION_EXPORT NSString *const GPEditorExportCompressedMusicXmlCommandNotification;

/** File ▸ Export Audio… was chosen (JS event "exportAudioRequested"). No object. */
FOUNDATION_EXPORT NSString *const GPEditorExportAudioCommandNotification;

/** File ▸ Print… (⌘P) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorPrintCommandNotification;

/** View ▸ Focus / Unfocus (⇧⌘F) was chosen; GPFiles.m forwards it to JS as "focusRequested". No object. */
FOUNDATION_EXPORT NSString *const GPEditorFocusCommandNotification;

/** Help ▸ Keyboard Shortcuts (⌘H) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorHelpCommandNotification;

/** Edit ▸ AI Wizard ▸ Song Writer… was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorSongWriterCommandNotification;

/** Tools ▸ Tuner… was chosen; GPAudioInput.m forwards it to JS as "tunerRequested". No object. */
FOUNDATION_EXPORT NSString *const GPEditorTunerCommandNotification;
/** Tools ▸ Transpose… was chosen (JS event "transposeRequested"). No object. */
FOUNDATION_EXPORT NSString *const GPEditorTransposeCommandNotification;

/** Tools ▸ Command Palette… (⇧⌘P) was chosen (JS event "commandPaletteRequested"). No object. */
FOUNDATION_EXPORT NSString *const GPEditorCommandPaletteCommandNotification;

/** Edit ▸ Lyrics… was chosen ("lyricsRequested" in JS). No object. */
FOUNDATION_EXPORT NSString *const GPEditorLyricsCommandNotification;

/** Tools ▸ Scales… was chosen ("scalesRequested" in JS). No object. */
FOUNDATION_EXPORT NSString *const GPEditorScalesCommandNotification;

/** File ▸ Open… (⌘O) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorOpenCommandNotification;

/** File ▸ Open Recent ▸ a file was chosen (RecentFilesMenu.swift → GPRecentFiles.m). Object: NSString path. */
FOUNDATION_EXPORT NSString *const GPEditorOpenRecentCommandNotification;

/** File ▸ Open Recent ▸ Clear Menu was chosen (the pinned files stay). No object. */
FOUNDATION_EXPORT NSString *const GPEditorClearRecentCommandNotification;

/** File ▸ Recent Files… was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorRecentFilesCommandNotification;

/** GPRecentFiles.m stored a new recent files list (GPRecentFilesDefaultsKey); File ▸ Open Recent reloads it. No object. */
FOUNDATION_EXPORT NSString *const GPEditorRecentFilesChangedNotification;

/** Finder handed the app files (Open With, dock drop, `open -a`). Object: NSArray<NSURL *>. */
FOUNDATION_EXPORT NSString *const GPEditorOpenURLsNotification;

/** File ▸ Save (⌘S). No object. */
FOUNDATION_EXPORT NSString *const GPEditorSaveCommandNotification;

/** File ▸ Save As… (⇧⌘S). No object. */
FOUNDATION_EXPORT NSString *const GPEditorSaveAsCommandNotification;

/** File ▸ Close Tab (⌘W) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorCloseTabCommandNotification;

/** File ▸ Next Tab (⌃Tab) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorNextTabCommandNotification;

/** File ▸ Previous Tab (⌃⇧Tab) was chosen. No object. */
FOUNDATION_EXPORT NSString *const GPEditorPreviousTabCommandNotification;

/** Edit ▸ Undo / Redo (⌘Z / ⇧⌘Z) for the score (EditMenu.swift); GPFiles.m forwards them as "undoRequested" / "redoRequested". */
FOUNDATION_EXPORT NSString *const GPEditorUndoCommandNotification;
FOUNDATION_EXPORT NSString *const GPEditorRedoCommandNotification;

/** JS's undo state for Edit ▸ Undo / Redo (GPFiles' setUndoState). userInfo: "canUndo", "canRedo" (NSNumber booleans). */
FOUNDATION_EXPORT NSString *const GPEditorUndoStateNotification;

/**
 * Edit ▸ Cut / Copy / Paste (⌘X / ⌘C / ⌘V) for the score (EditMenu.swift); GPClipboard.m forwards it to JS as
 * "clipboardCommandRequested". Object: NSString "cut", "copy" or "paste".
 */
FOUNDATION_EXPORT NSString *const GPEditorClipboardCommandNotification;

/**
 * Edit ▸ Delete Notes (D on the score) / Delete Bars (⌘D) for the score (EditMenu.swift); GPFiles.m forwards it to JS as
 * "deleteRequested" { what }. Object: NSString "notes" or "bars".
 */
FOUNDATION_EXPORT NSString *const GPEditorDeleteCommandNotification;

/** View ▸ Multitrack (F3) was chosen; GPFiles.m forwards it to JS as "multitrackRequested". No object. */
FOUNDATION_EXPORT NSString *const GPEditorMultitrackCommandNotification;

/** View ▸ Previous Track / Next Track; GPFiles.m forwards them to JS as "previousTrackRequested" / "nextTrackRequested". No object. */
FOUNDATION_EXPORT NSString *const GPEditorPreviousTrackCommandNotification;
FOUNDATION_EXPORT NSString *const GPEditorNextTrackCommandNotification;

/** View ▸ Mixer was chosen; GPPlayer.m forwards it to JS as "mixerRequested". No object. */
FOUNDATION_EXPORT NSString *const GPEditorMixerCommandNotification;

/** View ▸ Drum Key was chosen; GPFiles.m forwards it to JS as "drumKeyRequested". No object. */
FOUNDATION_EXPORT NSString *const GPEditorDrumKeyCommandNotification;

/** Tools ▸ Line In… was chosen; GPPlayer.m forwards it to JS as "lineInRequested". No object. */
FOUNDATION_EXPORT NSString *const GPEditorLineInCommandNotification;

/** Track ▸ Add Audio Track… was chosen; GPAudioTrack.m forwards it to JS as "addAudioTrackRequested". No object. */
FOUNDATION_EXPORT NSString *const GPEditorAddAudioTrackCommandNotification;

/**
 * Track ▸ Add Track… / Duplicate Track / Delete Track / Move Track Up / Move Track Down was chosen; GPAudioTrack.m
 * forwards it to JS as "trackCommandRequested". Object: NSString "add", "duplicate", "delete", "moveUp" or "moveDown".
 */
FOUNDATION_EXPORT NSString *const GPEditorTrackCommandNotification;

/**
 * File ▸ Stylesheet… (F7) / View ▸ Design Mode / View ▸ Reset Positions was chosen; GPStylesheet.m forwards it to JS
 * as "layoutCommandRequested". Object: NSString "stylesheet", "designMode" or "resetPositions".
 */
FOUNDATION_EXPORT NSString *const GPEditorLayoutCommandNotification;

/** GP Editor ▸ Settings… (⌘,) was chosen; GPAppSettings.m forwards it to JS as "settingsRequested". No object. */
FOUNDATION_EXPORT NSString *const GPEditorSettingsCommandNotification;

/** JS applied Settings ▸ Language (GPAppSettings.m): the menus and native panels show GPCurrentLanguage() now. No object. */
FOUNDATION_EXPORT NSString *const GPEditorLanguageChangedNotification;

/**
 * Tools ▸ MCP Server ▸ … or the menu bar item's menu was chosen (McpServerMenu.swift answers it; the command palette
 * and the QA driver post it too). Object: NSString "start", "stop", "restart", "settings", "log", "copyUrl" or
 * "copySetupCommand".
 */
FOUNDATION_EXPORT NSString *const GPEditorMcpCommandNotification;

/** The MCP server started, stopped or failed (GPMcpServerCore.m). No object. */
FOUNDATION_EXPORT NSString *const GPEditorMcpServerStateNotification;

/** The MCP server's log has new entries or was cleared (GPMcpLog.m). No object. */
FOUNDATION_EXPORT NSString *const GPEditorMcpLogChangedNotification;

/** An MCP server setting changed (GPMcpSettings.m). No object. */
FOUNDATION_EXPORT NSString *const GPEditorMcpSettingsChangedNotification;

/**
 * The QA driver asks for the MCP server's menu bar item (McpServerMenu.swift answers at once). Object: an
 * NSMutableDictionary, filled with "menu" (NSMenu) and "button" (NSStatusBarButton) while the item is shown.
 */
FOUNDATION_EXPORT NSString *const GPEditorMcpStatusItemQueryNotification;

NS_ASSUME_NONNULL_END
