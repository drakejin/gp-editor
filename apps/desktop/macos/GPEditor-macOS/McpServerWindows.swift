// The MCP server's two windows (Tools ▸ MCP Server ▸ Settings… / Show Log…, and the menu bar item's): its settings —
// start with the app, the port, the menu bar item; the toggles apply at once, a new port restarts the server — and its
// log (GPMcpLog.m: newest first; Copy, Clear, the log file in Finder). Window identifiers start with "GPMcp", so the QA
// driver keeps acting on the score's window while they are open.

import AppKit
import SwiftUI

final class McpServerWindows {
  static let shared = McpServerWindows()
  private var settingsWindow: NSWindow?
  private var logWindow: NSWindow?
  private var languageObserver: NSObjectProtocol?

  private init() {
    languageObserver = NotificationCenter.default.addObserver(forName: .GPEditorLanguageChanged, object: nil, queue: .main) { [weak self] _ in
      self?.settingsWindow?.title = GPLocalizedString("MCP Server Settings")
      self?.logWindow?.title = GPLocalizedString("MCP Server Log")
    }
  }

  func showSettings() {
    settingsWindow = show(settingsWindow, id: "GPMcpSettings", title: "MCP Server Settings", isResizable: false) { McpSettingsView() }
  }

  func showLog() {
    logWindow = show(logWindow, id: "GPMcpLog", title: "MCP Server Log", isResizable: true) { McpLogView() }
  }

  private func show<Content: View>(_ existing: NSWindow?, id: String, title: String, isResizable: Bool, content: () -> Content) -> NSWindow {
    let window = existing ?? makeWindow(id: id, isResizable: isResizable, view: content())
    window.title = GPLocalizedString(title)
    NSApp.activate(ignoringOtherApps: true)
    window.makeKeyAndOrderFront(nil)
    return window
  }

  private func makeWindow<Content: View>(id: String, isResizable: Bool, view: Content) -> NSWindow {
    let style: NSWindow.StyleMask = isResizable ? [.titled, .closable, .miniaturizable, .resizable] : [.titled, .closable]
    let window = NSWindow(contentRect: .zero, styleMask: style, backing: .buffered, defer: false)
    window.identifier = NSUserInterfaceItemIdentifier(id)
    window.isReleasedWhenClosed = false
    window.contentViewController = NSHostingController(rootView: view)
    window.center()
    return window
  }
}

// MARK: - Settings

struct McpSettingsView: View {
  @StateObject private var strings = AppLanguageModel()
  @StateObject private var server = McpServerModel()
  @State private var isEnabledAtLaunch = GPMcpSettings.isEnabledAtLaunch
  @State private var showsInMenuBar = GPMcpSettings.showsInMenuBar
  @State private var portText = String(GPMcpSettings.port)

  private var typedPort: Int? {
    Int(portText.trimmingCharacters(in: .whitespaces)).flatMap { GPMcpSettings.isValidPort($0) ? $0 : nil }
  }

  var body: some View {
    Form {
      Section {
        LabeledContent(strings("Status")) { Text(server.statusText).textSelection(.enabled) }
        Toggle(strings("Start the server when GP Editor opens"), isOn: $isEnabledAtLaunch)
          .onChange(of: isEnabledAtLaunch) { _, isOn in GPMcpSettings.isEnabledAtLaunch = isOn }
        Toggle(strings("Show in the menu bar"), isOn: $showsInMenuBar)
          .onChange(of: showsInMenuBar) { _, isOn in GPMcpSettings.showsInMenuBar = isOn }
        portRow
      } footer: {
        Text(strings("The switches apply at once; a new port restarts the server.")).font(.footnote).foregroundStyle(.secondary)
      }
      Section(strings("Connect")) {
        Text(strings("Claude Code: run this command in a terminal.")).font(.footnote)
        Text(server.setupCommand).font(.system(.body, design: .monospaced)).textSelection(.enabled)
        HStack {
          Button(strings("Copy Setup Command")) { McpServerCommand.copySetupCommand.post() }
          Button(strings("Copy URL")) { McpServerCommand.copyUrl.post() }
        }
      }
      Section {
        Text(strings("No sign-in: any program on this Mac can use the server. It listens on 127.0.0.1 only and refuses requests from web pages, so nothing on the network or in a browser reaches it. Turn it off when you do not use it."))
          .font(.footnote)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .formStyle(.grouped)
    // A grouped form scrolls and has no height of its own: the window gets one that shows every row.
    .frame(width: 560, height: 520)
  }

  private var portRow: some View {
    LabeledContent(strings("Port")) {
      HStack {
        TextField(strings("Port"), text: $portText).labelsHidden().textFieldStyle(.roundedBorder).frame(width: 80)
        Button(strings("Apply and Restart")) {
          guard let port = typedPort else { return }
          GPMcpSettings.port = port
          GPMcpServerCore.shared().restart()
        }
        .disabled(typedPort == nil || typedPort == GPMcpSettings.port || GPMcpSettings.isPortOverridden)
      }
      if GPMcpSettings.isPortOverridden {
        Text(String(format: strings("GPEDITOR_MCP_PORT sets this copy’s port: %ld."), GPMcpSettings.effectivePort)).font(.footnote)
      } else if typedPort == nil {
        Text(String(format: strings("A port from %ld to %ld."), GPMcpMinPort, GPMcpMaxPort)).font(.footnote)
      }
    }
  }
}

// MARK: - Log

/// One row of the log window.
struct McpLogRow: Identifiable {
  let id: Int
  let time: String
  let client: String
  let request: String
  let duration: String
  let outcome: String
  let isError: Bool
  let isEvent: Bool

  init(_ entry: GPMcpLogEntry) {
    id = entry.serial
    time = entry.timeText
    client = entry.client
    request = entry.request
    duration = entry.isEvent ? "" : "\(entry.durationMs) ms"
    outcome = entry.outcome
    isError = entry.isError
    isEvent = entry.isEvent
  }
}

/// The log's entries, newest first, following GPEditorMcpLogChangedNotification.
final class McpLogModel: ObservableObject {
  @Published private(set) var rows: [McpLogRow] = []
  private var observer: NSObjectProtocol?

  init() {
    refresh()
    observer = NotificationCenter.default.addObserver(forName: .GPEditorMcpLogChanged, object: nil, queue: .main) { [weak self] _ in self?.refresh() }
  }

  deinit {
    if let observer { NotificationCenter.default.removeObserver(observer) }
  }

  private func refresh() {
    rows = GPMcpLog.shared().entries.reversed().map(McpLogRow.init)
  }
}

struct McpLogView: View {
  @StateObject private var strings = AppLanguageModel()
  @StateObject private var log = McpLogModel()

  var body: some View {
    VStack(spacing: 0) {
      Table(log.rows) {
        TableColumn(strings("Time")) { row in Text(row.time).monospacedDigit() }.width(min: 90, ideal: 96, max: 110)
        TableColumn(strings("Client")) { row in Text(row.isEvent ? strings("Server") : row.client) }.width(min: 80, ideal: 150)
        TableColumn(strings("Request")) { row in Text(row.request).help(row.request) }.width(min: 120, ideal: 220)
        TableColumn(strings("Time Taken")) { row in Text(row.duration).monospacedDigit() }.width(min: 60, ideal: 70, max: 90)
        TableColumn(strings("Result")) { row in resultCell(row) }.width(min: 120, ideal: 260)
      }
      Divider()
      HStack {
        Text(log.rows.count == 1 ? strings("1 entry") : String(format: strings("%ld entries"), log.rows.count)).font(.footnote).foregroundStyle(.secondary)
        Spacer()
        Button(strings("Show Log File")) { NSWorkspace.shared.activateFileViewerSelecting([GPMcpLog.shared().fileURL]) }
        Button(strings("Copy")) {
          NSPasteboard.general.clearContents()
          NSPasteboard.general.setString(GPMcpLog.shared().text(), forType: .string)
        }
        Button(strings("Clear")) { GPMcpLog.shared().clear() }
      }
      .padding(10)
    }
    .frame(minWidth: 940, minHeight: 360)
  }

  /// The result; an error marked with a sign, in the text's own colour.
  @ViewBuilder private func resultCell(_ row: McpLogRow) -> some View {
    if row.isError {
      Label(row.outcome, systemImage: "exclamationmark.triangle").help(row.outcome.isEmpty ? row.request : row.outcome)
    } else {
      Text(row.outcome).help(row.outcome)
    }
  }
}
