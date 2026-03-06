# Environment Check Command

Detect and display current operating system information.

## Usage

/env-check                # Show environment info

## Output

- Platform name
- OS type and release
- Architecture
- OS detection (Windows/macOS/Linux)
- Recommended commands for current OS
- Node.js version
- Working directory

## Implementation

Runs: node scripts/env-check.js

## Example Output

```nocode
=== Environment Check ===
Platform: win32
OS Detection:
  Windows: true
  macOS: false
  Linux: false
Recommended Commands:
  List files: dir
  Cat file: type file
```
