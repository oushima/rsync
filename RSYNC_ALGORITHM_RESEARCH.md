# Rsync Algorithm Research

## Executive Summary

This document provides comprehensive research on the rsync algorithm and its implementation, with practical guidance for replicating rsync's core functionality in a desktop application.

---

## 1. The Rolling Checksum Algorithm (Adler-32 Variant)

### Overview

The rsync rolling checksum is based on Mark Adler's **Adler-32** checksum, which is itself based on Fletcher's checksum. The "rolling" nature allows efficient computation as the window slides through the file.

### How It Works

The Adler-32 checksum consists of two 16-bit sums:

```
A = 1 + D₁ + D₂ + ... + Dₙ (mod 65521)
B = (1 + D₁) + (1 + D₁ + D₂) + ... + (1 + D₁ + D₂ + ... + Dₙ) (mod 65521)
  = n×D₁ + (n-1)×D₂ + (n-2)×D₃ + ... + Dₙ + n (mod 65521)

Adler-32(D) = B × 65536 + A
```

Where:
- `D` is the data bytes
- `n` is the block length
- `65521` is the largest prime number smaller than 2¹⁶

### Rolling Property

The key innovation is that when sliding the window by one byte:

```
// Remove old byte (D_old) from start, add new byte (D_new) to end
A_new = A_old - D_old + D_new (mod 65521)
B_new = B_old - (n × D_old) + A_new (mod 65521)
```

This allows O(1) computation per byte instead of O(block_size).

### Implementation Reference

```c
const uint32_t MOD_ADLER = 65521;

typedef struct {
    uint32_t a;
    uint32_t b;
    size_t count;
} RollingChecksum;

void rolling_init(RollingChecksum *rc) {
    rc->a = 1;
    rc->b = 0;
    rc->count = 0;
}

void rolling_update(RollingChecksum *rc, uint8_t old_byte, uint8_t new_byte, size_t block_size) {
    rc->a = (rc->a - old_byte + new_byte) % MOD_ADLER;
    rc->b = (rc->b - (block_size * old_byte) + rc->a) % MOD_ADLER;
}

uint32_t rolling_digest(RollingChecksum *rc) {
    return (rc->b << 16) | rc->a;
}
```

### Adler-32 Weaknesses

1. **Weak for short messages** (< ~128 bytes) - doesn't use full output space
2. **Poor for small incremental changes**
3. **Weak for strings with common prefixes and consecutive numbers**

### Modern Alternatives

| Algorithm | Speed | Collision Resistance | Use Case |
|-----------|-------|---------------------|----------|
| Adler-32 | Fast | Moderate | Traditional rsync |
| BuzHash (Cyclic Polynomial) | Very Fast | Good | Borg, casync |
| Gear Hash | Fastest | Good | FastCDC, modern chunking |
| Rabin Fingerprint | Fast | Good | LBFS, restic |

**Recommendation:** Consider **Gear hash** or **BuzHash** for modern implementations - they're faster and have better distribution properties.

---

## 2. Strong Checksum (MD5/Blake3) for Block Matching

### Purpose

The strong checksum is used to verify that blocks with matching rolling checksums are actually identical (not just collisions).

### rsync's Evolution

| rsync Version | Strong Checksum | Notes |
|---------------|-----------------|-------|
| < 3.0.0 | MD4 | Legacy |
| 3.0.0 - 3.1.x | MD5 | Standard |
| 3.2.0+ | Negotiated (xxHash, MD5, SHA1) | Modern |

### Current Checksum Options (rsync 3.2+)

- **xxh128** - XXHash 128-bit (fastest, recommended)
- **xxh3** - XXHash3 variant
- **xxh64** (aka xxhash) - XXHash 64-bit
- **md5** - MD5 128-bit
- **md4** - MD4 (legacy)
- **sha1** - SHA-1 160-bit

### Block vs File Checksums

rsync uses checksums at two levels:

1. **Block Checksum**: Generated for each block during delta computation
2. **File Checksum**: Whole-file checksum sent after transfer for verification

### Implementation Guidance

```rust
// Recommended modern approach
enum StrongChecksum {
    Blake3,     // Fastest, cryptographically secure, recommended
    XXH128,     // Very fast, non-cryptographic
    SHA256,     // Cryptographically secure, slower
}

struct BlockSignature {
    weak_checksum: u32,      // Rolling checksum (Adler-32 or BuzHash)
    strong_checksum: [u8; 32], // Blake3 or similar
    offset: u64,              // Position in file
}
```

**Recommendation:** Use **Blake3** - it's faster than MD5/SHA256, cryptographically secure, and highly parallelizable.

---

## 3. The Delta Encoding Approach

### Algorithm Overview

The rsync algorithm operates in two phases:

#### Phase 1: Signature Generation (Receiver → Sender)

1. Receiver splits its copy into fixed-size blocks
2. For each block, compute:
   - Rolling checksum (weak, 32-bit)
   - Strong checksum (MD5/Blake3)
3. Send all signatures to sender

#### Phase 2: Delta Computation (Sender)

1. Build a hash table of receiver's signatures (keyed by rolling checksum)
2. Scan sender's file byte-by-byte using rolling checksum:
   - If rolling checksum matches → verify with strong checksum
   - If both match → emit "copy block N from receiver's file"
   - If no match → accumulate literal data
3. Output stream: sequence of "copy" and "literal" instructions

### Delta Stream Format

```
[COPY offset=1234, length=4096]
[LITERAL data="new content here..."]
[COPY offset=8192, length=4096]
[LITERAL data="more new data"]
...
[END]
[FILE_CHECKSUM: blake3_hash_of_reconstructed_file]
```

### Key Insight: Rolling Window

The sender doesn't just check at block boundaries - it checks at **every byte position**. This is what makes rsync detect insertions and deletions:

```
Receiver's file: [Block A][Block B][Block C][Block D]
Sender's file:   [Block A][NEW DATA][Block B][Block C][Block D]
                          ↑
                          Insertion detected because Block B is found
                          at a different offset
```

### Pseudocode

```python
def compute_delta(sender_file, receiver_signatures):
    signature_map = build_hashtable(receiver_signatures)  # Key: weak checksum
    
    window = RollingWindow(block_size)
    delta_stream = []
    literal_buffer = []
    
    for byte in sender_file:
        window.push(byte)
        
        if window.is_full():
            weak = window.rolling_checksum()
            
            if weak in signature_map:
                candidates = signature_map[weak]
                strong = compute_strong_checksum(window.data)
                
                for sig in candidates:
                    if sig.strong == strong:
                        # Match found!
                        if literal_buffer:
                            delta_stream.append(Literal(literal_buffer))
                            literal_buffer = []
                        delta_stream.append(Copy(sig.offset, block_size))
                        window.reset()
                        break
                else:
                    # Weak collision, no strong match
                    literal_buffer.append(window.oldest_byte())
                    window.slide()
            else:
                # No match
                literal_buffer.append(window.oldest_byte())
                window.slide()
    
    # Flush remaining
    literal_buffer.extend(window.remaining())
    if literal_buffer:
        delta_stream.append(Literal(literal_buffer))
    
    return delta_stream
```

---

## 4. Block Size Selection Strategies

### rsync's Dynamic Block Size

rsync calculates block size based on file size:

```c
// Simplified from rsync source
size_t calculate_block_size(off_t file_size) {
    size_t block_size;
    
    if (file_size <= 0)
        return BLOCK_SIZE;  // Default: 700 bytes
    
    // Target: ~1000 blocks per file
    block_size = file_size / 1000;
    
    // Clamp to reasonable range
    if (block_size < 700)
        block_size = 700;
    else if (block_size > 65536)
        block_size = 65536;
    
    // Round to nice boundary
    block_size = (block_size + 3) & ~3;  // Round up to 4-byte boundary
    
    return block_size;
}
```

### Trade-offs

| Block Size | Signature Overhead | Delta Precision | Matching Efficiency |
|------------|-------------------|-----------------|---------------------|
| Small (512B) | High | High | Many small matches |
| Medium (4KB) | Medium | Medium | Balanced |
| Large (64KB) | Low | Low | Fewer, larger matches |

### Recommendations for Desktop App

| File Size | Recommended Block Size |
|-----------|----------------------|
| < 64 KB | 512 bytes |
| 64 KB - 1 MB | 2 KB |
| 1 MB - 100 MB | 4-8 KB |
| 100 MB - 1 GB | 16-32 KB |
| > 1 GB | 64-128 KB |

### Content-Defined Chunking (Modern Alternative)

Instead of fixed-size blocks, use content-defined chunking (CDC):

```python
# FastCDC-style approach
MIN_SIZE = 2 * 1024      # 2 KB minimum
MAX_SIZE = 64 * 1024     # 64 KB maximum
MASK = 0x0000d93003530000  # Determines average ~8KB chunks

def find_chunk_boundary(data, offset):
    gear_hash = 0
    i = offset + MIN_SIZE
    
    while i < min(offset + MAX_SIZE, len(data)):
        gear_hash = (gear_hash << 1) + GEAR_TABLE[data[i]]
        if not (gear_hash & MASK):
            return i  # Found boundary
        i += 1
    
    return min(offset + MAX_SIZE, len(data))
```

**Benefits of CDC:**
- Insertions/deletions don't cascade through all chunks
- Better deduplication across similar files
- More stable chunk boundaries

---

## 5. How rsync Handles Special Cases

### 5.1 Partial Transfers and Resumption (`-P`/`--partial`)

```
--partial           Keep partially transferred files
--partial-dir=DIR   Store partial files in separate directory
-P                  Same as --partial --progress
```

**How it works:**
1. Without `--partial`: Interrupted transfers delete the temp file
2. With `--partial`: Temp file is kept with destination filename
3. With `--partial-dir`: Temp file stored in `.rsync-partial/` directory
4. On resume: The partial file becomes the basis for delta transfer

**Implementation:**
```python
class PartialTransfer:
    def __init__(self, partial_dir=None):
        self.partial_dir = partial_dir or ".rsync-partial"
    
    def get_partial_path(self, dest_path):
        if self.partial_dir:
            dir_name = os.path.dirname(dest_path)
            base_name = os.path.basename(dest_path)
            return os.path.join(dir_name, self.partial_dir, base_name)
        return dest_path
    
    def resume_transfer(self, dest_path):
        partial = self.get_partial_path(dest_path)
        if os.path.exists(partial):
            # Use partial file as basis for delta
            return self.compute_signatures(partial)
        return None
```

### 5.2 File Modification Detection

rsync uses a "quick check" algorithm by default:

```python
def needs_transfer(source_stat, dest_stat, options):
    # Quick check (default)
    if not options.checksum:
        if source_stat.size != dest_stat.size:
            return True
        if source_stat.mtime != dest_stat.mtime:
            return True
        return False
    
    # Checksum mode (-c/--checksum)
    if source_stat.size != dest_stat.size:
        return True
    source_hash = compute_file_hash(source_path)
    dest_hash = compute_file_hash(dest_path)
    return source_hash != dest_hash
```

**Options affecting detection:**
- `--checksum` (`-c`): Compare by file checksum
- `--size-only`: Only compare sizes
- `--ignore-times` (`-I`): Always transfer
- `--update` (`-u`): Skip newer files on receiver

### 5.3 Symbolic Links

```python
class SymlinkHandler:
    def handle(self, path, options):
        if options.copy_links:          # -L
            # Follow symlink, copy target
            return self.copy_target(path)
        elif options.links:             # -l (default with -a)
            # Preserve symlink as symlink
            return self.copy_symlink(path)
        elif options.copy_unsafe_links:
            # Only follow symlinks pointing outside tree
            if self.points_outside(path):
                return self.copy_target(path)
            return self.copy_symlink(path)
        elif options.safe_links:
            # Skip symlinks pointing outside tree
            if self.points_outside(path):
                return None
            return self.copy_symlink(path)
        else:
            # Skip symlinks entirely
            return None
```

### 5.4 Hard Links (`-H`)

```python
class HardLinkTracker:
    def __init__(self):
        self.inode_map = {}  # (device, inode) -> first_path
    
    def process(self, path, stat):
        if stat.nlink > 1:  # File has multiple hard links
            key = (stat.dev, stat.ino)
            if key in self.inode_map:
                # Already seen this inode - create hard link
                return HardLink(target=self.inode_map[key])
            else:
                # First occurrence - transfer file, remember path
                self.inode_map[key] = path
                return TransferFile(path)
        return TransferFile(path)
```

### 5.5 Sparse Files (`-S`)

Sparse files contain "holes" (regions of null bytes that don't consume disk space).

```python
def write_with_sparse_handling(dest_fd, data, options):
    if not options.sparse:
        os.write(dest_fd, data)
        return
    
    SPARSE_BLOCK = 4096  # Typical filesystem block size
    offset = 0
    
    while offset < len(data):
        block = data[offset:offset + SPARSE_BLOCK]
        
        if is_all_zeros(block):
            # Seek past hole instead of writing zeros
            os.lseek(dest_fd, SPARSE_BLOCK, os.SEEK_CUR)
        else:
            os.write(dest_fd, block)
        
        offset += SPARSE_BLOCK
```

**rsync's `--sparse` behavior:**
- Detects sequences of null bytes
- Uses `lseek()` to skip over them
- Works best with `--whole-file` for local copies
- May conflict with `--inplace` on some systems

### 5.6 Large File Handling

rsync handles large files (> 2GB / 4GB) using:

```python
# 64-bit file offsets
import os
os.open(path, os.O_RDONLY | os.O_LARGEFILE)  # O_LARGEFILE on Linux

# Streaming approach - never load entire file
def stream_file(path, block_size=64*1024):
    with open(path, 'rb') as f:
        while True:
            chunk = f.read(block_size)
            if not chunk:
                break
            yield chunk

# Memory-mapped for signature scanning (when appropriate)
import mmap
def scan_with_mmap(path):
    with open(path, 'rb') as f:
        with mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as mm:
            # Can access like bytes without loading all to RAM
            pass
```

### 5.7 Bandwidth Limiting (`--bwlimit`)

```python
import time

class BandwidthLimiter:
    def __init__(self, rate_kbps):
        self.rate = rate_kbps * 1024  # bytes per second
        self.bucket = 0
        self.last_time = time.monotonic()
    
    def limit(self, bytes_to_send):
        now = time.monotonic()
        elapsed = now - self.last_time
        self.last_time = now
        
        # Refill bucket based on elapsed time
        self.bucket += elapsed * self.rate
        self.bucket = min(self.bucket, self.rate)  # Cap at 1 second worth
        
        if bytes_to_send > self.bucket:
            # Need to wait
            wait_time = (bytes_to_send - self.bucket) / self.rate
            time.sleep(wait_time)
            self.bucket = 0
        else:
            self.bucket -= bytes_to_send
```

### 5.8 Compression During Transfer (`-z`)

rsync supports multiple compression algorithms (3.2.0+):

| Algorithm | Speed | Ratio | Memory |
|-----------|-------|-------|--------|
| zstd | Very Fast | Excellent | Low |
| lz4 | Fastest | Good | Very Low |
| zlib/zlibx | Medium | Good | Medium |

```python
import zstandard as zstd

class CompressedTransfer:
    def __init__(self, algorithm='zstd', level=3):
        if algorithm == 'zstd':
            self.compressor = zstd.ZstdCompressor(level=level)
            self.decompressor = zstd.ZstdDecompressor()
        # ... other algorithms
    
    def send_block(self, data):
        compressed = self.compressor.compress(data)
        # Only send compressed if smaller
        if len(compressed) < len(data):
            return b'\x01' + struct.pack('<I', len(compressed)) + compressed
        else:
            return b'\x00' + struct.pack('<I', len(data)) + data
```

**Skip-compress list:** rsync skips compression for already-compressed files:
```
.gz, .zip, .jpg, .png, .mp3, .mp4, .avi, .7z, .bz2, .xz, etc.
```

---

## 6. What Makes rsync Reliable for Data Integrity

### 6.1 Multi-Layer Verification

```
┌─────────────────────────────────────────────────────────────┐
│                    rsync Integrity Layers                     │
├─────────────────────────────────────────────────────────────┤
│ Layer 1: Transport (SSH/TLS)                                  │
│   └── Encrypted + authenticated channel                       │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: Block Checksums                                      │
│   └── Verify each block during reconstruction                 │
├─────────────────────────────────────────────────────────────┤
│ Layer 3: Whole-File Checksum                                  │
│   └── Computed during transfer, verified at end               │
├─────────────────────────────────────────────────────────────┤
│ Layer 4: Atomic Rename                                        │
│   └── Write to temp file, then rename                         │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Atomic File Updates

```python
def safe_write_file(dest_path, content):
    dest_dir = os.path.dirname(dest_path)
    
    # Write to temporary file in same directory
    temp_path = os.path.join(dest_dir, f".{os.path.basename(dest_path)}.XXXXXX")
    with tempfile.NamedTemporaryFile(dir=dest_dir, delete=False, 
                                      prefix='.', suffix='.tmp') as f:
        temp_path = f.name
        f.write(content)
        f.flush()
        os.fsync(f.fileno())  # Ensure written to disk
    
    # Atomic rename
    os.rename(temp_path, dest_path)
    
    # Sync directory for rename durability
    dir_fd = os.open(dest_dir, os.O_RDONLY)
    os.fsync(dir_fd)
    os.close(dir_fd)
```

### 6.3 Checksum Verification

```python
class TransferVerifier:
    def __init__(self):
        self.hasher = blake3.blake3()
    
    def process_block(self, data):
        """Called for each block written to destination"""
        self.hasher.update(data)
    
    def verify(self, expected_hash):
        """Called at end of transfer"""
        computed = self.hasher.digest()
        if computed != expected_hash:
            raise IntegrityError(
                f"File corruption detected: "
                f"expected {expected_hash.hex()}, "
                f"got {computed.hex()}"
            )
```

### 6.4 Error Recovery

```python
class ResilientTransfer:
    MAX_RETRIES = 3
    
    def transfer_with_retry(self, file_path):
        for attempt in range(self.MAX_RETRIES):
            try:
                result = self.transfer(file_path)
                if self.verify_checksum(result):
                    return result
                raise ChecksumMismatch()
            except (IOError, ChecksumMismatch) as e:
                if attempt < self.MAX_RETRIES - 1:
                    logger.warning(f"Retry {attempt + 1} for {file_path}: {e}")
                    time.sleep(2 ** attempt)  # Exponential backoff
                else:
                    raise
```

---

## 7. Known Limitations of rsync

### 7.1 Fundamental Limitations

| Limitation | Description | Impact |
|------------|-------------|--------|
| **Single-threaded** | Cannot parallelize file operations | Slow on SSDs/NVMe |
| **Memory usage** | Stores file list in RAM | Problems with millions of files |
| **No resumable file list** | Must rescan on restart | Slow restart for large trees |
| **Fixed-size blocks** | Less efficient than CDC | Worse deduplication |
| **Bidirectional sync** | No native conflict resolution | Not suitable for multi-master |
| **No native encryption at rest** | Only transport encryption | Need external tools |

### 7.2 Protocol Limitations

```
1. File list transmitted upfront (memory pressure)
2. No incremental file list save/restore
3. Limited metadata (no creation time on Linux)
4. No extended attribute filtering
5. No native support for cloud storage APIs
```

### 7.3 Performance Issues

```
Scenario                          | rsync Weakness
----------------------------------|----------------------------------------
Many small files                  | Overhead per file, no batching
Files with random changes         | Rolling checksum less effective
Encrypted/compressed files        | Delta transfer doesn't help
High-latency connections          | Round-trip for signature exchange
Files changing during scan        | May cause errors or partial transfers
```

### 7.4 Security Considerations

```
- CVE history (buffer overflows, path traversal)
- Daemon mode authentication is basic
- No built-in access control lists per path
- Trust model assumes sender is honest (--trust-sender risk)
```

---

## 8. Modern Alternatives and Improvements

### 8.1 zsync

**Purpose:** Client-side rsync for file distribution (one-to-many)

**Key Innovation:**
- Pre-computed `.zsync` file containing block checksums
- No server-side computation needed
- Works over plain HTTP

**Best For:**
- ISO image distribution
- Software updates
- CDN-friendly distribution

```
┌─────────────────────────────────────────────────────────────┐
│                      zsync Architecture                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐    .zsync file     ┌─────────┐                │
│  │ Server  │ ─────────────────→ │ Client  │                │
│  │         │                    │         │                │
│  │  file   │   HTTP Range       │ local   │                │
│  │         │ ←─────────────────│  copy   │                │
│  └─────────┘  (missing blocks)  └─────────┘                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 casync (Content-Addressable Sync)

**Key Innovations:**
- Content-defined chunking (variable-size blocks)
- Content-addressable storage (chunks named by hash)
- Removes file boundaries before chunking
- HTTP/CDN friendly

**Architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│                     casync Architecture                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Source Directory                                           │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────┐     ┌─────────────────┐               │
│  │  .caidx file    │────▶│  .castr store   │               │
│  │  (chunk index)  │     │  (chunk files)  │               │
│  └─────────────────┘     └─────────────────┘               │
│         │                        │                          │
│         ▼                        ▼                          │
│     HTTP Server              HTTP Server                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Benefits:**
- Excellent deduplication across versions
- Parallel chunk downloads
- Seed from existing local files
- CDN distribution friendly

### 8.3 Comparison Table

| Feature | rsync | zsync | casync | rclone |
|---------|-------|-------|--------|--------|
| Delta transfer | ✅ | ✅ | ✅ | ❌ |
| Content-defined chunking | ❌ | ❌ | ✅ | ❌ |
| Cloud storage support | ❌ | ❌ | ❌ | ✅ |
| HTTP-only server | ❌ | ✅ | ✅ | ✅ |
| Deduplication | Per-file | Per-file | Global | ❌ |
| Bidirectional sync | Limited | ❌ | ❌ | ✅ |
| Parallel transfers | ❌ | Partial | ✅ | ✅ |

### 8.4 Other Notable Tools

| Tool | Key Feature |
|------|-------------|
| **restic** | Encrypted backups with CDC (Rabin fingerprint) |
| **Borg** | Deduplicating backup with BuzHash CDC |
| **bup** | Git-based backup with rolling checksums |
| **duplicacy** | Lock-free deduplication |
| **rclone** | Cloud storage swiss army knife |
| **Syncthing** | Peer-to-peer continuous sync |

---

## 9. Implementation Recommendations for Desktop App

### 9.1 Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Modern Sync Engine                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  File       │  │  Chunking   │  │  Delta      │        │
│  │  Watcher    │──│  Engine     │──│  Computer   │        │
│  │  (notify)   │  │  (CDC)      │  │  (rdiff)    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│         │                │                │                 │
│         ▼                ▼                ▼                 │
│  ┌─────────────────────────────────────────────────┐       │
│  │            Transfer Manager (async)              │       │
│  │  • Parallel file processing                      │       │
│  │  • Bandwidth limiting                            │       │
│  │  • Resume/retry logic                            │       │
│  └─────────────────────────────────────────────────┘       │
│                          │                                  │
│         ┌────────────────┼────────────────┐                │
│         ▼                ▼                ▼                │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐          │
│  │   Local   │    │    SSH    │    │   Cloud   │          │
│  │   Copy    │    │  Transport│    │    API    │          │
│  └───────────┘    └───────────┘    └───────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Technology Recommendations

| Component | Recommendation | Rationale |
|-----------|---------------|-----------|
| Language | Rust | Memory safety, performance, async |
| Weak checksum | Gear hash or BuzHash | Faster, better distribution |
| Strong checksum | Blake3 | Fastest, secure, parallelizable |
| Chunking | FastCDC | Content-defined, efficient |
| Compression | zstd | Best ratio/speed trade-off |
| Async runtime | Tokio | Mature, performant |
| File watching | notify-rs | Cross-platform |

### 9.3 Key Improvements Over rsync

```python
# 1. Parallel processing
async def sync_directory(source, dest):
    files = await scan_directory(source)
    
    # Process multiple files concurrently
    semaphore = asyncio.Semaphore(8)  # Limit concurrency
    tasks = [sync_file(f, semaphore) for f in files]
    await asyncio.gather(*tasks)

# 2. Content-defined chunking
class FastCDC:
    """Variable-size chunking based on content"""
    MIN_SIZE = 2 * 1024
    AVG_SIZE = 8 * 1024
    MAX_SIZE = 64 * 1024
    
    def chunk(self, data):
        # Chunks are stable across insertions/deletions
        pass

# 3. Incremental file list
class FileIndex:
    """Persistent, resumable file index"""
    def save_checkpoint(self, path):
        # Can resume scan after interruption
        pass
    
    def load_checkpoint(self, path):
        # Restore previous scan state
        pass

# 4. Conflict detection
class ConflictResolver:
    def detect(self, local_file, remote_file):
        if local_file.mtime > last_sync and remote_file.mtime > last_sync:
            return Conflict(local_file, remote_file)
        return None
    
    def resolve(self, conflict, strategy):
        if strategy == 'local_wins':
            return conflict.local
        elif strategy == 'remote_wins':
            return conflict.remote
        elif strategy == 'rename_both':
            return self.rename_conflicting(conflict)
```

### 9.4 Suggested Improvements

1. **Parallel Processing**
   - Multi-threaded signature computation
   - Concurrent file transfers
   - Parallel directory scanning

2. **Content-Defined Chunking**
   - Better deduplication
   - Stable chunk boundaries
   - Cross-file deduplication

3. **Persistent State**
   - Save/resume file index
   - Track sync history
   - Maintain chunk cache

4. **Modern Cryptography**
   - Blake3 for checksums
   - ChaCha20-Poly1305 for encryption
   - Ed25519 for authentication

5. **Better Conflict Handling**
   - Detect concurrent modifications
   - Multiple resolution strategies
   - Version history

6. **Cloud Integration**
   - Native S3/GCS/Azure support
   - Efficient chunk upload/download
   - Resumable uploads

### 9.5 Sample Rust Implementation Skeleton

```rust
use blake3::Hasher;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Configuration for the sync engine
pub struct SyncConfig {
    pub chunk_min_size: usize,
    pub chunk_avg_size: usize,
    pub chunk_max_size: usize,
    pub parallelism: usize,
    pub compression: CompressionMethod,
}

/// Represents a content-defined chunk
pub struct Chunk {
    pub hash: [u8; 32],      // Blake3 hash
    pub offset: u64,
    pub length: u32,
}

/// Compute signatures for a file using content-defined chunking
pub async fn compute_signatures(path: &Path) -> Result<Vec<Chunk>> {
    let file = File::open(path).await?;
    let mut reader = BufReader::new(file);
    let mut chunks = Vec::new();
    let mut offset = 0u64;
    
    let chunker = FastCDC::new(
        config.chunk_min_size,
        config.chunk_avg_size,
        config.chunk_max_size,
    );
    
    for chunk_data in chunker.chunks(&mut reader).await {
        let hash = blake3::hash(&chunk_data);
        chunks.push(Chunk {
            hash: *hash.as_bytes(),
            offset,
            length: chunk_data.len() as u32,
        });
        offset += chunk_data.len() as u64;
    }
    
    Ok(chunks)
}

/// Compute delta between source and destination
pub async fn compute_delta(
    source: &Path,
    dest_signatures: &[Chunk],
) -> Result<Delta> {
    // Build signature lookup table
    let sig_map: HashMap<[u8; 32], &Chunk> = 
        dest_signatures.iter().map(|c| (c.hash, c)).collect();
    
    let mut delta = Delta::new();
    let source_chunks = compute_signatures(source).await?;
    
    for chunk in source_chunks {
        if let Some(existing) = sig_map.get(&chunk.hash) {
            // Chunk exists in destination - emit copy instruction
            delta.push(DeltaOp::Copy {
                offset: existing.offset,
                length: existing.length,
            });
        } else {
            // New chunk - emit literal data
            let data = read_chunk(source, chunk.offset, chunk.length).await?;
            delta.push(DeltaOp::Literal(data));
        }
    }
    
    Ok(delta)
}
```

---

## 10. Conclusion

The rsync algorithm remains a foundational technology for efficient file synchronization. While the core algorithm (rolling checksum + strong checksum + delta encoding) is elegant and effective, modern implementations can significantly improve upon it by:

1. **Adopting content-defined chunking** for better deduplication
2. **Using modern hash functions** (Blake3, XXHash) for speed
3. **Implementing parallel processing** for multi-core systems
4. **Adding persistent state** for resumable operations
5. **Supporting cloud storage** natively

For a desktop application, combining the proven rsync algorithm with these modern improvements will result in a robust, efficient synchronization tool that exceeds the capabilities of the original rsync.

---

## References

1. Tridgell, A. (1999). *Efficient Algorithms for Sorting and Synchronization*. PhD Thesis, Australian National University.
2. rsync Technical Report: https://rsync.samba.org/tech_report/
3. How Rsync Works: https://rsync.samba.org/how-rsync-works.html
4. FastCDC Paper: Xia, W. et al. (2016). *FastCDC: A Fast and Efficient Content-Defined Chunking Approach*. USENIX ATC.
5. casync: https://github.com/systemd/casync
6. zsync: http://zsync.moria.org.uk/
