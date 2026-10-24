// File ▸ Open Recent and File ▸ Recent Files…: the recent files GPRecentFiles.m keeps in user defaults (the list's
// order and rules are the JS side's, src/lib/recent-files.ts). The menu follows the list whenever it is stored again.

import SwiftUI

final class RecentFilesModel: ObservableObject {
  struct Item: Identifiable, Equatable {
    let path: String
    /// The file name; with its folder when another listed file has the same name (the menu adds "(missing)" when it is gone).
    let title: String
    let isPinned: Bool
    let isMissing: Bool
    var id: String { path }
  }

  @Published private(set) var items: [Item] = []
  private var observer: NSObjectProtocol?

  init() {
    items = Self.load()
    observer = NotificationCenter.default.addObserver(forName: .GPEditorRecentFilesChanged, object: nil, queue: .main) { [weak self] _ in
      self?.items = Self.load()
    }
  }

  deinit {
    if let observer {
      NotificationCenter.default.removeObserver(observer)
    }
  }

  /// The stored list, in its order (pinned files first).
  static func load() -> [Item] {
    let stored = UserDefaults.standard.array(forKey: GPRecentFilesDefaultsKey) as? [[String: Any]] ?? []
    let files: [(path: String, name: String, isPinned: Bool, isMissing: Bool)] = stored.compactMap { entry in
      guard let path = entry["path"] as? String else { return nil }
      let name = entry["name"] as? String ?? (path as NSString).lastPathComponent
      return (path, name, entry["isPinned"] as? Bool ?? false, entry["isMissing"] as? Bool ?? false)
    }
    let nameCounts = Dictionary(files.map { ($0.name, 1) }, uniquingKeysWith: +)
    return files.map { file in
      let folder = ((file.path as NSString).deletingLastPathComponent as NSString).lastPathComponent
      let name = (nameCounts[file.name] ?? 0) > 1 ? "\(file.name) — \(folder)" : file.name
      return Item(path: file.path, title: name, isPinned: file.isPinned, isMissing: file.isMissing)
    }
  }
}

/// File ▸ Open Recent (pinned files, a divider, the others; Clear Menu keeps the pinned ones) and File ▸ Recent Files….
struct RecentFilesCommands: View {
  @ObservedObject var model: RecentFilesModel
  @ObservedObject var strings: AppLanguageModel

  var body: some View {
    let pinned = model.items.filter(\.isPinned)
    let others = model.items.filter { !$0.isPinned }
    Menu(strings("Open Recent")) {
      ForEach(pinned) { item in openButton(item) }
      if !pinned.isEmpty && !others.isEmpty {
        Divider()
      }
      ForEach(others) { item in openButton(item) }
      if !model.items.isEmpty {
        Divider()
      }
      Button(strings("Clear Menu")) {
        NotificationCenter.default.post(name: .GPEditorClearRecentCommand, object: nil)
      }
      .disabled(others.isEmpty)
    }
    Button(strings("Recent Files…")) {
      NotificationCenter.default.post(name: .GPEditorRecentFilesCommand, object: nil)
    }
  }

  private func openButton(_ item: RecentFilesModel.Item) -> some View {
    Button(item.isMissing ? String(format: strings("%@ (missing)"), item.title) : item.title) {
      NotificationCenter.default.post(name: .GPEditorOpenRecentCommand, object: item.path as NSString)
    }
    .disabled(item.isMissing)
  }
}
