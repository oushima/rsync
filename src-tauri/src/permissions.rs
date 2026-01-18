//! macOS permissions handling for Full Disk Access.

use crate::errors::SyncResult;

/// Check if the application has Full Disk Access on macOS.
#[cfg(target_os = "macos")]
pub fn check_full_disk_access() -> bool {
    let protected_paths = [
        dirs::home_dir().map(|h| h.join("Library/Application Support/com.apple.TCC")),
        dirs::home_dir().map(|h| h.join("Library/Safari")),
    ];

    for path_opt in protected_paths.iter() {
        if let Some(path) = path_opt {
            if path.exists() && std::fs::read_dir(path).is_ok() {
                return true;
            }
        }
    }

    if let Some(home) = dirs::home_dir() {
        let tcc_db = home.join("Library/Application Support/com.apple.TCC/TCC.db");
        if tcc_db.exists() && std::fs::metadata(&tcc_db).is_ok() {
            return true;
        }
    }

    let test_paths = [
        dirs::desktop_dir(),
        dirs::document_dir(),
        dirs::download_dir(),
    ];

    for path_opt in test_paths.iter() {
        if let Some(path) = path_opt {
            if path.exists() {
                match std::fs::read_dir(path) {
                    Ok(mut entries) => {
                        if entries.next().is_some() {
                            return true;
                        }
                    }
                    Err(_) => return false,
                }
            }
        }
    }

    true
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
