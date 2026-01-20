//! macOS Launch Agent management for auto-start on login.
//!
//! Provides functionality to enable/disable automatic app startup
//! when the user logs in to macOS.

use std::fs;
use std::io::Write;
use std::path::PathBuf;

use crate::errors::SyncError;

/// The bundle identifier for the app.
/// Must match the identifier in tauri.conf.json.
const BUNDLE_IDENTIFIER: &str = "com.oushima.rsync";

/// Name of the Launch Agent plist file.
const LAUNCH_AGENT_FILENAME: &str = "com.oushima.rsync.plist";

/// Returns the path to the user's LaunchAgents directory.
fn get_launch_agents_dir() -> Result<PathBuf, SyncError> {
    let home = dirs::home_dir().ok_or_else(|| {
        SyncError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Could not determine home directory",
        ))
    })?;
    
    Ok(home.join("Library").join("LaunchAgents"))
}

/// Returns the full path to the Launch Agent plist file.
fn get_plist_path() -> Result<PathBuf, SyncError> {
    Ok(get_launch_agents_dir()?.join(LAUNCH_AGENT_FILENAME))
}

/// Gets the path to the app executable.
/// In development, this returns the current executable.
/// In production, this should return the path to the .app bundle.
fn get_app_path() -> Result<String, SyncError> {
    let exe_path = std::env::current_exe().map_err(|e| {
        SyncError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Could not determine executable path: {}", e),
        ))
    })?;
    
    // For a bundled macOS app, the exe is at:
    // /Applications/AppName.app/Contents/MacOS/app-name
    // We want to return the .app bundle path for launchctl
    let exe_str = exe_path.to_string_lossy();
    
    // Check if this is inside a .app bundle
    if let Some(pos) = exe_str.find(".app/") {
        // Return path up to and including .app
        let app_path = &exe_str[..pos + 4];
        // Use 'open' command to launch the app properly
        Ok(app_path.to_string())
    } else {
        // Development mode - just use the executable directly
        Ok(exe_str.to_string())
    }
}

/// Generates the Launch Agent plist XML content.
fn generate_plist_content(app_path: &str) -> String {
    // Check if it's a .app bundle or direct executable
    let is_app_bundle = app_path.ends_with(".app");
    
    let program_arguments = if is_app_bundle {
        format!(
            r#"    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/open</string>
        <string>-a</string>
        <string>{}</string>
    </array>"#,
            app_path
        )
    } else {
        format!(
            r#"    <key>ProgramArguments</key>
    <array>
        <string>{}</string>
    </array>"#,
            app_path
        )
    };

    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{}</string>
{}
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>LaunchOnlyOnce</key>
    <true/>
</dict>
</plist>
"#,
        BUNDLE_IDENTIFIER, program_arguments
    )
}

/// Enables auto-start on login by creating a Launch Agent.
pub fn enable_auto_start() -> Result<(), SyncError> {
    let launch_agents_dir = get_launch_agents_dir()?;
    let plist_path = get_plist_path()?;
    let app_path = get_app_path()?;
    
    // Create LaunchAgents directory if it doesn't exist
    if !launch_agents_dir.exists() {
        fs::create_dir_all(&launch_agents_dir).map_err(|e| {
            SyncError::Io(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                format!(
                    "Could not create LaunchAgents directory at {}: {}",
                    launch_agents_dir.display(),
                    e
                ),
            ))
        })?;
    }
    
    // Generate plist content
    let plist_content = generate_plist_content(&app_path);
    
    // Write the plist file
    let mut file = fs::File::create(&plist_path).map_err(|e| {
        SyncError::Io(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            format!(
                "Could not create Launch Agent at {}: {}",
                plist_path.display(),
                e
            ),
        ))
    })?;
    
    file.write_all(plist_content.as_bytes()).map_err(|e| {
        SyncError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Could not write Launch Agent content: {}", e),
        ))
    })?;
    
    // Set proper file permissions (644)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let permissions = fs::Permissions::from_mode(0o644);
        fs::set_permissions(&plist_path, permissions).map_err(|e| {
            SyncError::Io(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                format!("Could not set Launch Agent permissions: {}", e),
            ))
        })?;
    }
    
    eprintln!(
        "[LaunchAgent] Created Launch Agent at {} for app {}",
        plist_path.display(),
        app_path
    );
    
    Ok(())
}

/// Disables auto-start on login by removing the Launch Agent.
pub fn disable_auto_start() -> Result<(), SyncError> {
    let plist_path = get_plist_path()?;
    
    if plist_path.exists() {
        fs::remove_file(&plist_path).map_err(|e| {
            SyncError::Io(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                format!(
                    "Could not remove Launch Agent at {}: {}",
                    plist_path.display(),
                    e
                ),
            ))
        })?;
        
        eprintln!(
            "[LaunchAgent] Removed Launch Agent at {}",
            plist_path.display()
        );
    }
    
    Ok(())
}

/// Checks if auto-start is currently enabled.
pub fn is_auto_start_enabled() -> bool {
    match get_plist_path() {
        Ok(path) => path.exists(),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plist_generation() {
        let content = generate_plist_content("/Applications/RSync.app");
        assert!(content.contains("com.oushima.rsync"));
        assert!(content.contains("/usr/bin/open"));
        assert!(content.contains("RunAtLoad"));
    }

    #[test]
    fn test_plist_generation_dev_mode() {
        let content = generate_plist_content("/path/to/rsync");
        assert!(content.contains("com.oushima.rsync"));
        assert!(content.contains("/path/to/rsync"));
        assert!(!content.contains("/usr/bin/open"));
    }
}
