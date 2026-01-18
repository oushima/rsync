//! Power management for macOS - prevents system sleep during file transfers
//!
//! Uses IOKit's power management APIs to create assertions that prevent
//! the system from sleeping while a transfer is in progress.

use std::ffi::CString;
use std::sync::atomic::{AtomicU32, Ordering};

/// IOKit power assertion ID type
type IOPMAssertionID = u32;

/// IOReturn type for IOKit return values
type IOReturn = i32;

/// Success return value for IOKit
const K_IO_RETURN_SUCCESS: IOReturn = 0;

/// Assertion type for preventing display sleep (more aggressive - prevents user idle sleep)
const K_IOPM_ASSERTION_TYPE_PREVENT_USER_IDLE_SYSTEM_SLEEP: &str = "PreventUserIdleSystemSleep";

// External IOKit functions
#[link(name = "IOKit", kind = "framework")]
extern "C" {
    fn IOPMAssertionCreateWithName(
        assertion_type: *const u8,
        assertion_level: u32,
        assertion_name: *const u8,
        assertion_id: *mut IOPMAssertionID,
    ) -> IOReturn;

    fn IOPMAssertionRelease(assertion_id: IOPMAssertionID) -> IOReturn;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFStringCreateWithCString(
        allocator: *const std::ffi::c_void,
        c_str: *const i8,
        encoding: u32,
    ) -> *const std::ffi::c_void;

    fn CFRelease(cf: *const std::ffi::c_void);
}

/// kCFStringEncodingUTF8
const K_CF_STRING_ENCODING_UTF8: u32 = 0x08000100;

/// kIOPMAssertionLevelOn
const K_IOPM_ASSERTION_LEVEL_ON: u32 = 255;

/// Global assertion ID - 0 means no active assertion
static POWER_ASSERTION_ID: AtomicU32 = AtomicU32::new(0);

/// Creates a CFString from a Rust string
fn create_cf_string(s: &str) -> *const std::ffi::c_void {
    let c_str = CString::new(s).unwrap();
    unsafe { CFStringCreateWithCString(std::ptr::null(), c_str.as_ptr(), K_CF_STRING_ENCODING_UTF8) }
}

/// Prevents the system from sleeping while a transfer is in progress.
/// 
/// This uses macOS's IOKit framework to create a power assertion that
/// keeps the system awake. The assertion should be released when the
/// transfer completes using `allow_sleep()`.
/// 
/// Returns `true` if the assertion was successfully created.
pub fn prevent_sleep(reason: &str) -> bool {
    // Check if we already have an assertion
    if POWER_ASSERTION_ID.load(Ordering::SeqCst) != 0 {
        eprintln!("[Power] Already preventing sleep");
        return true;
    }

    let assertion_type = create_cf_string(K_IOPM_ASSERTION_TYPE_PREVENT_USER_IDLE_SYSTEM_SLEEP);
    let assertion_name = create_cf_string(reason);

    if assertion_type.is_null() || assertion_name.is_null() {
        eprintln!("[Power] Failed to create CFStrings");
        if !assertion_type.is_null() {
            unsafe { CFRelease(assertion_type) };
        }
        if !assertion_name.is_null() {
            unsafe { CFRelease(assertion_name) };
        }
        return false;
    }

    let mut assertion_id: IOPMAssertionID = 0;

    let result = unsafe {
        IOPMAssertionCreateWithName(
            assertion_type as *const u8,
            K_IOPM_ASSERTION_LEVEL_ON,
            assertion_name as *const u8,
            &mut assertion_id,
        )
    };

    unsafe {
        CFRelease(assertion_type);
        CFRelease(assertion_name);
    }

    if result == K_IO_RETURN_SUCCESS {
        POWER_ASSERTION_ID.store(assertion_id, Ordering::SeqCst);
        eprintln!("[Power] System sleep prevented (assertion ID: {})", assertion_id);
        true
    } else {
        eprintln!("[Power] Failed to create power assertion: {}", result);
        false
    }
}

/// Releases the power assertion and allows the system to sleep again.
/// 
/// Returns `true` if the assertion was successfully released.
pub fn allow_sleep() -> bool {
    let assertion_id = POWER_ASSERTION_ID.swap(0, Ordering::SeqCst);

    if assertion_id == 0 {
        eprintln!("[Power] No active power assertion to release");
        return true;
    }

    let result = unsafe { IOPMAssertionRelease(assertion_id) };

    if result == K_IO_RETURN_SUCCESS {
        eprintln!("[Power] System sleep allowed again");
        true
    } else {
        eprintln!("[Power] Failed to release power assertion: {}", result);
        // Reset the ID even on failure
        false
    }
}

/// Checks if the system is currently being prevented from sleeping.
pub fn is_preventing_sleep() -> bool {
    POWER_ASSERTION_ID.load(Ordering::SeqCst) != 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prevent_and_allow_sleep() {
        assert!(!is_preventing_sleep());
        
        assert!(prevent_sleep("Test assertion"));
        assert!(is_preventing_sleep());
        
        // Second call should return true (already preventing)
        assert!(prevent_sleep("Test assertion 2"));
        
        assert!(allow_sleep());
        assert!(!is_preventing_sleep());
        
        // Second call should return true (no-op)
        assert!(allow_sleep());
    }
}
