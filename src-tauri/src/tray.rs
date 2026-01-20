//! System tray functionality for the rsync application.
//!
//! Provides system tray icon with menu for quick access to common actions
//! and displays sync status through icon and tooltip changes.

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Wry,
};

use crate::errors::SyncError;

/// Represents the current sync status for tray display.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TrayStatus {
    /// No active sync operations
    #[default]
    Idle,
    /// Sync is in progress
    Syncing,
    /// Sync is paused
    Paused,
    /// An error occurred during sync
    Error,
}

impl TrayStatus {
    /// Returns a human-readable tooltip for this status.
    fn tooltip(&self) -> &'static str {
        match self {
            TrayStatus::Idle => "RSync - Idle",
            TrayStatus::Syncing => "RSync - Syncing...",
            TrayStatus::Paused => "RSync - Paused",
            TrayStatus::Error => "RSync - Error",
        }
    }
}

/// Menu item identifiers for tray menu actions.
mod menu_ids {
    pub const SHOW_HIDE: &str = "show_hide";
    pub const PAUSE_SYNC: &str = "pause_sync";
    pub const RESUME_SYNC: &str = "resume_sync";
    pub const QUIT: &str = "quit";
}

/// State manager for system tray functionality.
pub struct TrayState {
    /// Current sync status displayed in tray
    status: RwLock<TrayStatus>,
    /// Whether the main window is currently visible
    window_visible: RwLock<bool>,
    /// Whether minimize to tray is enabled
    minimize_to_tray: RwLock<bool>,
}

impl TrayState {
    /// Creates a new tray state with default values.
    pub fn new() -> Self {
        Self {
            status: RwLock::new(TrayStatus::Idle),
            window_visible: RwLock::new(true),
            minimize_to_tray: RwLock::new(true),
        }
    }

    /// Gets the current sync status.
    pub fn get_status(&self) -> TrayStatus {
        *self.status.read()
    }

    /// Sets the current sync status.
    pub fn set_status(&self, status: TrayStatus) {
        *self.status.write() = status;
    }

    /// Gets whether the window is visible.
    pub fn is_window_visible(&self) -> bool {
        *self.window_visible.read()
    }

    /// Sets the window visibility state.
    pub fn set_window_visible(&self, visible: bool) {
        *self.window_visible.write() = visible;
    }

    /// Gets whether minimize to tray is enabled.
    pub fn is_minimize_to_tray_enabled(&self) -> bool {
        *self.minimize_to_tray.read()
    }

    /// Sets whether minimize to tray is enabled.
    pub fn set_minimize_to_tray(&self, enabled: bool) {
        *self.minimize_to_tray.write() = enabled;
    }
}

impl Default for TrayState {
    fn default() -> Self {
        Self::new()
    }
}

/// Loads the app icon for the tray.
/// Uses the 32x32 PNG icon for optimal tray display on macOS.
fn load_tray_icon() -> Result<Image<'static>, SyncError> {
    // Use include_bytes! to embed the icon at compile time
    // The 32x32 icon is ideal for macOS menu bar
    let icon_bytes = include_bytes!("../icons/32x32.png");
    
    Image::from_bytes(icon_bytes).map_err(|e| {
        SyncError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Failed to load tray icon: {}", e),
        ))
    })
}

/// Creates the system tray menu.
fn create_tray_menu(app: &AppHandle<Wry>) -> Result<Menu<Wry>, SyncError> {
    let show_hide = MenuItem::with_id(app, menu_ids::SHOW_HIDE, "Show/Hide Window", true, None::<&str>)
        .map_err(|e| SyncError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
    
    let pause_sync = MenuItem::with_id(app, menu_ids::PAUSE_SYNC, "Pause Sync", true, None::<&str>)
        .map_err(|e| SyncError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
    
    let resume_sync = MenuItem::with_id(app, menu_ids::RESUME_SYNC, "Resume Sync", true, None::<&str>)
        .map_err(|e| SyncError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
    
    let separator = PredefinedMenuItem::separator(app)
        .map_err(|e| SyncError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
    
    let quit = MenuItem::with_id(app, menu_ids::QUIT, "Quit", true, None::<&str>)
        .map_err(|e| SyncError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
    
    Menu::with_items(app, &[
        &show_hide,
        &pause_sync,
        &resume_sync,
        &separator,
        &quit,
    ])
    .map_err(|e| SyncError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))
}

/// Toggles the main window visibility.
fn toggle_window_visibility(app: &AppHandle<Wry>, tray_state: &TrayState) {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);
        
        if is_visible {
            // Hide the window
            if let Err(e) = window.hide() {
                eprintln!("Failed to hide window: {}", e);
            }
            tray_state.set_window_visible(false);
        } else {
            // Show and focus the window
            if let Err(e) = window.show() {
                eprintln!("Failed to show window: {}", e);
            }
            if let Err(e) = window.set_focus() {
                eprintln!("Failed to focus window: {}", e);
            }
            tray_state.set_window_visible(true);
        }
    }
}

/// Handles menu item click events.
fn handle_menu_event(app: &AppHandle<Wry>, tray_state: &Arc<TrayState>, item_id: &str) {
    match item_id {
        menu_ids::SHOW_HIDE => {
            toggle_window_visibility(app, tray_state);
        }
        menu_ids::PAUSE_SYNC => {
            // Emit event to frontend to pause all syncs
            if let Err(e) = app.emit("tray_pause_sync", ()) {
                eprintln!("Failed to emit pause sync event: {}", e);
            }
        }
        menu_ids::RESUME_SYNC => {
            // Emit event to frontend to resume all syncs
            if let Err(e) = app.emit("tray_resume_sync", ()) {
                eprintln!("Failed to emit resume sync event: {}", e);
            }
        }
        menu_ids::QUIT => {
            app.exit(0);
        }
        _ => {
            eprintln!("Unknown menu item clicked: {}", item_id);
        }
    }
}

/// Initializes the system tray with icon and menu.
///
/// This should be called during app setup.
pub fn init_tray(app: &AppHandle<Wry>, tray_state: Arc<TrayState>) -> Result<TrayIcon<Wry>, SyncError> {
    let icon = load_tray_icon()?;
    let menu = create_tray_menu(app)?;
    
    let tray_state_click = Arc::clone(&tray_state);
    let tray_state_menu = Arc::clone(&tray_state);
    
    let app_handle = app.clone();
    
    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip(TrayStatus::Idle.tooltip())
        .menu(&menu)
        .show_menu_on_left_click(false) // Left click toggles window, right click shows menu
        .on_tray_icon_event(move |_tray, event| {
            // Handle left click to toggle window visibility
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_window_visibility(&app_handle, &tray_state_click);
            }
        })
        .on_menu_event(move |app, event| {
            handle_menu_event(app, &tray_state_menu, event.id().as_ref());
        })
        .build(app)
        .map_err(|e| SyncError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))
}

/// Updates the tray icon and tooltip based on sync status.
pub fn update_tray_status(app: &AppHandle<Wry>, tray_state: &TrayState, status: TrayStatus) {
    tray_state.set_status(status);
    
    // Get the tray icon
    if let Some(tray) = app.tray_by_id("main-tray") {
        // Update tooltip
        if let Err(e) = tray.set_tooltip(Some(status.tooltip())) {
            eprintln!("Failed to update tray tooltip: {}", e);
        }
        
        // For now, we use the same icon for all states
        // In a production app, you might want different icons for each state
        // e.g., spinning icon for syncing, red icon for error, etc.
    }
}

/// Shows the main window if hidden.
pub fn show_window(app: &AppHandle<Wry>, tray_state: &TrayState) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.show() {
            eprintln!("Failed to show window: {}", e);
        }
        if let Err(e) = window.set_focus() {
            eprintln!("Failed to focus window: {}", e);
        }
        tray_state.set_window_visible(true);
    }
}

/// Hides the main window to tray.
pub fn hide_window(app: &AppHandle<Wry>, tray_state: &TrayState) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.hide() {
            eprintln!("Failed to hide window: {}", e);
        }
        tray_state.set_window_visible(false);
    }
}
