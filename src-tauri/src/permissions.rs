//! macOS permissions handling for Full Disk Access.

use crate::errors::SyncResult;

/// Check if the application has Full Disk Access on macOS.
/// 
/// FDA is required to access protected locations like:
/// - ~/Library/Mail
/// - ~/Library/Messages  
/// - ~/Library/Safari
/// - Time Machine backups
/// - System-level TCC database
#[cfg(target_os = "macos")]
pub fn check_full_disk_access() -> bool {
    // The most reliable FDA check is trying to read from truly protected paths.
    // These paths require FDA and will fail with permission denied without it.
    
    // System-level TCC database - only readable with FDA
    let system_tcc = std::path::Path::new("/Library/Application Support/com.apple.TCC/TCC.db");
    if system_tcc.exists() {
        if std::fs::read(system_tcc).is_ok() {
            return true;
        }
    }
    
    // User's Safari data - protected by FDA
    if let Some(home) = dirs::home_dir() {
        let safari_history = home.join("Library/Safari/History.db");
        if safari_history.exists() {
            if std::fs::metadata(&safari_history).is_ok() && std::fs::read(&safari_history).is_ok() {
                return true;
            }
        }
        
        // User's Mail data - protected by FDA  
        let mail_dir = home.join("Library/Mail");
        if mail_dir.exists() {
            if std::fs::read_dir(&mail_dir).is_ok() {
                // Try to actually list contents, not just check existence
                if let Ok(mut entries) = std::fs::read_dir(&mail_dir) {
                    if entries.next().is_some() {
                        return true;
                    }
                }
            }
        }
        
        // Messages database - protected by FDA
        let messages_db = home.join("Library/Messages/chat.db");
        if messages_db.exists() {
            if std::fs::read(&messages_db).is_ok() {
                return true;
            }
        }
        
        // User TCC database - protected by FDA
        let user_tcc = home.join("Library/Application Support/com.apple.TCC/TCC.db");
        if user_tcc.exists() {
            if std::fs::read(&user_tcc).is_ok() {
                return true;
            }
        }
    }
    
    // If we get here, we couldn't confirm FDA access
    false
}

#[cfg(not(target_os = "macos"))]
pub fn check_full_disk_access() -> bool {
    true
}

#[cfg(target_os = "macos")]
pub fn open_full_disk_access_settings() -> SyncResult<()> {
    use std::process::Command;

    let urls = [
        "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
        "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles",
    ];

    for url in urls.iter() {
        if Command::new("open").arg(url).status().is_ok() {
            return Ok(());
        }
    }

    let _ = Command::new("open")
        .arg("-b")
        .arg("com.apple.systempreferences")
        .arg("/System/Library/PreferencePanes/Security.prefPane")
        .status();

    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn open_full_disk_access_settings() -> SyncResult<()> {
    Ok(())
}

pub fn check_path_accessible(path: &std::path::Path) -> bool {
    if !path.exists() {
        if let Some(parent) = path.parent() {
            return check_path_accessible(parent);
        }
        return false;
    }

    if path.is_dir() {
        std::fs::read_dir(path).is_ok()
    } else {
        std::fs::File::open(path).is_ok()
    }
}

pub fn check_write_access(path: &std::path::Path) -> bool {
    if path.exists() {
        if path.is_dir() {
            let test_file = path.join(".rsync_write_test");
            match std::fs::File::create(&test_file) {
                Ok(_) => {
                    let _ = std::fs::remove_file(test_file);
                    true
                }
                Err(_) => false,
            }
        } else {
            std::fs::OpenOptions::new().write(true).open(path).is_ok()
        }
    } else if let Some(parent) = path.parent() {
        check_write_access(parent)
    } else {
        false
    }
}
