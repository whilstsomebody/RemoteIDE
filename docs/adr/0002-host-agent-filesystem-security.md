# ADR 0002: Host Agent Filesystem Security & Concurrency Architecture

## Status

Accepted

## Context

RemoteIDE connects remote devices to a host machine. Exposing the host filesystem introduces critical security challenges:

1. **Path Traversal Attacks**: Attackers or malicious scripts attempting relative navigation (`../../etc/passwd`).
2. **Symlink Escape Attacks**: Symlinks inside a project directory pointing to arbitrary host locations (e.g., `~/.ssh`, `/var/run/docker.sock`).
3. **Filesystem Race Conditions (TOCTOU)**: State changes between checking path validity and performing filesystem operations.
4. **Data Corruption During Concurrent Writes**: Multiple clients or external processes (such as Git or local editors) modifying the same file concurrently.
5. **Accidental Corruption of Binary Assets**: Attempting to read and save binary files as UTF-8 text.

Joining a client-supplied relative path to a root directory (e.g. `path.join(root, userPath)`) is **not** sufficient protection.

## Decisions

1. **Canonical Path Resolution & Strict Jail Boundaries**:
   - Every workspace folder path is canonicalized on registration using `fs.realpathSync`.
   - Before executing any read, write, move, or delete operation, the agent resolves the candidate path and verifies that its canonical real path (`fs.realpathSync`) resides strictly within the canonical folder root.
   - For new files, the parent directory's canonical real path is verified.

2. **Proactive Symlink Escape Prevention**:
   - Files and directories that are symbolic links are inspected via `fs.lstatSync`.
   - The link target's canonical path is resolved using `fs.realpathSync`. If the target escapes the workspace root boundary, the agent rejects the request immediately with `ErrorCode.SYMLINK_ESCAPE_DETECTED` (HTTP 403 Forbidden).
   - In directory tree traversal, symlinks pointing outside the workspace boundary are omitted.

3. **Atomic Writes via Write-Fsync-Rename**:
   - File saves do not write directly to the target destination.
   - Files are written to a temporary sibling file (`.${basename}.tmp.${uuid}`) in the same directory.
   - `fs.fsync` flushes all data blocks and metadata to physical storage.
   - The temporary file is atomically renamed (`fs.rename`) over the target file.

4. **Optimistic Concurrency Control with ETags**:
   - Every file read returns a deterministic ETag computed from file size, modification timestamp, and SHA-1 content checksum.
   - Write operations accept an optional `expectedETag`.
   - If the current file's ETag on disk does not match `expectedETag`, the agent rejects the write with `ErrorCode.CONCURRENCY_CONFLICT` (HTTP 409 Conflict), preventing silent overwrites.

5. **Binary File Protection**:
   - When files are read, the agent inspects the initial 8KB chunk for null bytes (`\0`).
   - If binary data is detected, the agent marks `isBinary: true` and encodes output in `base64`. Direct text editing in the browser UI is restricted to avoid encoding corruption.

6. **Local Append-Only SQLite Change Journal**:
   - Every filesystem operation and external filesystem watcher event is logged to a local SQLite table (`file_change_journal`).
   - Monotonic sequence numbers guarantee total ordering of filesystem modifications for future replication and offline recovery.

## Consequences

- Guarantees complete isolation of the host filesystem outside authorized workspace directories.
- Protects against symlink jailbreaks and path traversal.
- Guarantees data integrity during crashes and concurrent multi-device writes.
