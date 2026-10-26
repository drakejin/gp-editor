// The MCP server's controls (GPMcpServerCore.m): an item in the menu bar at the top right of the screen — its status,
// Start / Stop, Restart, Copy URL, Copy Setup Command, Show Log…, Settings… — and the same items in Tools ▸ MCP Server.
// Every item posts GPEditorMcpCommandNotification with its command; McpServerCommands answers them all (the command
// palette and the QA driver post it too). Settings ▸ "Show in the menu bar" adds or removes the item at once.

import AppKit
import SwiftUI

/// What the menus' items do, by the command each posts.
enum McpServerCommand: String {
  case start, stop, restart, settings, log, copyUrl, copySetupCommand

  func post() {
    NotificationCenter.default.post(name: .GPEditorMcpCommand, object: rawValue as NSString)
  }
}

/// Answers GPEditorMcpCommandNotification: the server, its windows, the pasteboard.
final class McpServerCommands: NSObject {
  static let shared = McpServerCommands()
  private var observer: NSObjectProtocol?

  func install() {
    observer = NotificationCenter.default.addObserver(forName: .GPEditorMcpCommand, object: nil, queue: .main) { note in
      guard let name = note.object as? String, let command = McpServerCommand(rawValue: name) else { return }
      McpServerCommands.run(command)
    }
  }

  private static func run(_ command: McpServerCommand) {
    let core = GPMcpServerCore.shared()
    switch command {
    case .start: core.start()
    case .stop: core.stop()
    case .restart: core.restart()
    case .settings: McpServerWindows.shared.showSettings()
    case .log: McpServerWindows.shared.showLog()
    case .copyUrl: copy(core.endpointURL)
    case .copySetupCommand: copy(core.setupCommand)
    }
  }

  private static func copy(_ text: String) {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(text, forType: .string)
  }
}

/// The server's state for SwiftUI (Tools ▸ MCP Server, the settings window): follows its notifications and the language.
final class McpServerModel: ObservableObject {
  @Published private(set) var statusText = ""
  @Published private(set) var isListening = false
  @Published private(set) var endpointURL = ""
  @Published private(set) var setupCommand = ""
  private var observers: [NSObjectProtocol] = []

  init() {
    refresh()
    observers = [Notification.Name.GPEditorMcpServerState, .GPEditorLanguageChanged].map { name in
      NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in self?.refresh() }
    }
  }

  deinit {
    observers.forEach { NotificationCenter.default.removeObserver($0) }
  }

  private func refresh() {
    let core = GPMcpServerCore.shared()
    statusText = core.statusText
    isListening = core.state == .running || core.state == .starting
    endpointURL = core.endpointURL
    setupCommand = core.setupCommand
  }
}

/// Tools ▸ MCP Server: the status, then the same items as the menu bar's.
struct McpServerMenuItems: View {
  @ObservedObject var model: McpServerModel
  @ObservedObject var strings: AppLanguageModel

  var body: some View {
    Text(model.statusText)
    Divider()
    Button(model.isListening ? strings("Stop") : strings("Start")) {
      (model.isListening ? McpServerCommand.stop : .start).post()
    }
    Button(strings("Restart")) { McpServerCommand.restart.post() }
    Divider()
    Button(strings("Copy URL")) { McpServerCommand.copyUrl.post() }
    Button(strings("Copy Setup Command")) { McpServerCommand.copySetupCommand.post() }
    Divider()
    Button(strings("Show Log…")) { McpServerCommand.log.post() }
    Button(strings("Settings…")) { McpServerCommand.settings.post() }
  }
}

/// The item at the top right of the screen; its menu is built when it opens, in the shown language.
final class McpStatusItem: NSObject, NSMenuDelegate {
  static let shared = McpStatusItem()
  private var item: NSStatusItem?
  private var observers: [NSObjectProtocol] = []

  /// Shows the item when the settings say so, and follows the server and the settings from then on.
  func install() {
    update()
    observers = [Notification.Name.GPEditorMcpSettingsChanged, .GPEditorMcpServerState, .GPEditorLanguageChanged].map { name in
      NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in self?.update() }
    }
    // The QA driver's question (GPEditorNotifications.h), answered at once on its thread.
    observers.append(NotificationCenter.default.addObserver(forName: .GPEditorMcpStatusItemQuery, object: nil, queue: nil) { [weak self] note in
      guard let found = note.object as? NSMutableDictionary, let item = self?.item else { return }
      found["menu"] = item.menu
      found["button"] = item.button
    })
  }

  private func update() {
    guard GPMcpSettings.showsInMenuBar else {
      if let item { NSStatusBar.system.removeStatusItem(item) }
      item = nil
      return
    }
    let shown = item ?? makeItem()
    item = shown
    let core = GPMcpServerCore.shared()
    shown.button?.appearsDisabled = !core.isRunning
    shown.button?.toolTip = String(format: GPLocalizedString("GP Editor MCP server: %@"), core.statusText)
  }

  private func makeItem() -> NSStatusItem {
    let created = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    let image = NSImage(systemSymbolName: "guitars", accessibilityDescription: "GP Editor MCP server")
    image?.isTemplate = true
    created.button?.image = image
    let menu = NSMenu()
    menu.delegate = self
    created.menu = menu
    return created
  }

  func menuNeedsUpdate(_ menu: NSMenu) {
    let core = GPMcpServerCore.shared()
    let isListening = core.state == .running || core.state == .starting
    menu.removeAllItems()
    let title = NSMenuItem(title: GPLocalizedString("GP Editor MCP Server"), action: nil, keyEquivalent: "")
    title.isEnabled = false
    menu.addItem(title)
    let status = NSMenuItem(title: core.statusText, action: nil, keyEquivalent: "")
    status.isEnabled = false
    menu.addItem(status)
    menu.addItem(.separator())
    menu.addItem(commandItem(isListening ? "Stop" : "Start", isListening ? .stop : .start))
    menu.addItem(commandItem("Restart", .restart))
    menu.addItem(.separator())
    menu.addItem(commandItem("Copy URL", .copyUrl))
    menu.addItem(commandItem("Copy Setup Command", .copySetupCommand))
    menu.addItem(.separator())
    menu.addItem(commandItem("Show Log…", .log))
    menu.addItem(commandItem("Settings…", .settings))
  }

  private func commandItem(_ english: String, _ command: McpServerCommand) -> NSMenuItem {
    let item = NSMenuItem(title: GPLocalizedString(english), action: #selector(choose(_:)), keyEquivalent: "")
    item.target = self
    item.representedObject = command.rawValue
    return item
  }

  @objc private func choose(_ sender: NSMenuItem) {
    guard let name = sender.representedObject as? String, let command = McpServerCommand(rawValue: name) else { return }
    command.post()
  }
}
