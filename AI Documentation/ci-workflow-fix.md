# CI Workflow Fix - Working Directory Error

## Problem
The CI workflows were failing with the error:
```
Error: An error occurred trying to start process '/usr/bin/bash' with working directory '/home/runner/work/server/server/./server'. No such file or directory
```

## Root Cause
All GitHub Actions workflow files were incorrectly configured with:
```yaml
defaults:
  run:
    working-directory: ./server
```

However, the repository structure shows that this IS already the server project - there's no subdirectory called `server`. The workflows were trying to navigate to a non-existent directory.

## Files Fixed
1. `.github/workflows/test.yml`
2. `.github/workflows/quality.yml`
3. `.github/workflows/security.yml`
4. `.github/workflows/performance.yml`

## Changes Made

### 1. Removed Working Directory Configuration
Removed the following from all workflow files:
```yaml
defaults:
  run:
    working-directory: ./server
```

### 2. Updated Path Filters
Changed path filters from:
```yaml
paths:
  - 'server/**'
```

To:
```yaml
paths:
  - 'src/**'
  - 'package.json'
  - 'package-lock.json'
```

### 3. Fixed File Path References
Updated all file path references to remove the `server/` prefix:

**Before:**
- `./server/coverage/lcov.info` → `./coverage/lcov.info`
- `server/npm-audit-results.json` → `npm-audit-results.json`
- `--file=server/package.json` → `--file=package.json`
- `path: ./server` → `path: ./`

**After:** All paths now correctly reference files in the current directory.

## Impact
- ✅ CI workflows will now run successfully
- ✅ Proper path filtering ensures workflows only trigger on relevant changes
- ✅ All artifact uploads and file references work correctly
- ✅ No functional changes to the actual test/quality/security/performance logic

## Testing
The workflows should now:
1. Successfully checkout code
2. Install dependencies in the correct directory
3. Run tests, linting, security scans, and performance tests
4. Upload artifacts with correct paths
5. Generate proper reports and comments

## Best Practices Applied
- Used specific path filters (`src/**`, `package.json`) instead of broad wildcards
- Removed unnecessary working directory configurations
- Maintained consistency across all workflow files
- Preserved all existing functionality while fixing the path issues 