// The menus' language: the one JS shows (GP Editor ▸ Settings… ▸ Language, GPAppStrings.m). A change re-publishes the
// model, so SwiftUI rebuilds the menu bar's commands with their new titles at once; macOS's own items (Services,
// Window, Quit …) follow the process's localization, which changes at the next start.

import Foundation

final class AppLanguageModel: ObservableObject {
  @Published private(set) var language: String = GPCurrentLanguage()
  private var observer: NSObjectProtocol?

  init() {
    observer = NotificationCenter.default.addObserver(forName: .GPEditorLanguageChanged, object: nil, queue: .main) { [weak self] _ in
      self?.language = GPCurrentLanguage()
    }
  }

  deinit {
    if let observer {
      NotificationCenter.default.removeObserver(observer)
    }
  }

  /// A menu title (its English text) in the shown language.
  func callAsFunction(_ english: String) -> String {
    GPLocalizedString(english)
  }
}
