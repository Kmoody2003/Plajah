import AppKit
import UserNotifications

/// Plajah for Mac — the macOS twin of windows-native/Plajah.WinUI.
///
/// Same architecture as the Windows app: a native window hosting https://plajah.com in the system
/// web engine (WKWebView here, WebView2 there), with a JSON message bridge for native features.
/// The bridge speaks the Windows protocol byte for byte — `window.chrome.webview.postMessage` /
/// `addEventListener('message')`, `{ type, ... }` messages, `<TYPE>_RESULT` replies — so every web
/// path written for the Windows app (services/windowsBridgeService.ts, the custom title bar, the
/// file explorer, Voca speech, output windows...) runs on the Mac unchanged.
@main
final class PlajahMacApp: NSObject, NSApplicationDelegate {
    static func main() {
        let app = NSApplication.shared
        let delegate = PlajahMacApp()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.run()
    }

    private var mainWindow: ShellWindowController?
    /// File opened before the window existed (Finder "Open With", drag onto the Dock icon).
    private var pendingOpen: [URL] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.mainMenu = MainMenu.build()
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
        let controller = ShellWindowController()
        mainWindow = controller
        controller.showWindow(nil)
        controller.window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if !pendingOpen.isEmpty { controller.openFiles(pendingOpen); pendingOpen = [] }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        let files = urls.filter { $0.isFileURL }
        let links = urls.filter { !$0.isFileURL }
        if let controller = mainWindow {
            if !files.isEmpty { controller.openFiles(files) }
            for link in links { controller.openDeepLink(link) }
        } else {
            pendingOpen.append(contentsOf: files)
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { mainWindow?.showWindow(nil) }
        return true
    }

    /// Like the Windows app: closing the last window quits.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    /// Dock menu = the Windows jump list (JumpListService): straight into each experience.
    func applicationDockMenu(_ sender: NSApplication) -> NSMenu? {
        let menu = NSMenu()
        for (title, view) in JumpList.entries {
            let item = NSMenuItem(title: title, action: #selector(openExperience(_:)), keyEquivalent: "")
            item.representedObject = view
            item.target = self
            menu.addItem(item)
        }
        return menu
    }

    @objc private func openExperience(_ sender: NSMenuItem) {
        guard let view = sender.representedObject as? String else { return }
        mainWindow?.navigate(path: "/?view=\(view)")
        mainWindow?.showWindow(nil)
    }
}

enum JumpList {
    static let entries: [(String, String)] = [
        ("Home", "home"), ("Chora", "chora"), ("Reello", "reello"), ("Live", "live"),
        ("Tela", "tela"), ("Fabula", "fabula"), ("Files", "files"), ("Messages", "chat"),
    ]
}

@MainActor
enum MainMenu {
    static func build() -> NSMenu {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Plajah", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide Plajah", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = appMenu.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Plajah", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        // Standard Edit menu so ⌘C / ⌘V / ⌘Z / ⌘A reach the web view's text fields.
        let editItem = NSMenuItem()
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        main.addItem(editItem)

        let viewItem = NSMenuItem()
        let view = NSMenu(title: "View")
        view.addItem(withTitle: "Reload", action: #selector(ShellWindowController.reloadPage(_:)), keyEquivalent: "r")
        let fs = view.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fs.keyEquivalentModifierMask = [.command, .control]
        view.addItem(withTitle: "Actual Size", action: #selector(ShellWindowController.zoomReset(_:)), keyEquivalent: "0")
        view.addItem(withTitle: "Zoom In", action: #selector(ShellWindowController.zoomIn(_:)), keyEquivalent: "+")
        view.addItem(withTitle: "Zoom Out", action: #selector(ShellWindowController.zoomOut(_:)), keyEquivalent: "-")
        viewItem.submenu = view
        main.addItem(viewItem)

        let windowItem = NSMenuItem()
        let window = NSMenu(title: "Window")
        window.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        window.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowItem.submenu = window
        main.addItem(windowItem)
        NSApp.windowsMenu = window
        return main
    }
}
