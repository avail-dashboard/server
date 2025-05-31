# GitHub Actions Troubleshooting Guide

## Common Issues and Solutions

### 1. Node.js Caching Issues

**Error:**
```
Error: Some specified paths were not resolved, unable to cache dependencies.
Found in cache @ /opt/hostedtoolcache/node/20.19.1/x64
```

**Cause:** 
The `cache-dependency-path` in `actions/setup-node@v4` cannot find the `package-lock.json` file at the specified path when the workflow runs from the repository root but the Node.js project is in a subdirectory.

**Solution:**
Instead of using the built-in npm cache in `setup-node`, use a separate `actions/cache@v4` step:

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20.x'
    
- name: Cache node modules
  uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

**Status:** ✅ Fixed in all workflows

### 2. Working Directory Issues

**Issue:** Commands failing because they're running from the wrong directory.

**Solution:** 
Ensure all workflows have the correct `defaults.run.working-directory` setting:

```yaml
defaults:
  run:
    working-directory: ./server
```

**Status:** ✅ Configured in all workflows

### 3. Test Environment Setup

**Issue:** Tests failing due to missing environment variables or configuration.

**Solution:**
Create test environment file in the workflow:

```yaml
- name: Create test environment file
  run: |
    cat > .env.test << EOF
    NODE_ENV=test
    PORT=3002
    DATABASE_TYPE=postgresql
    DATABASE_URL=postgresql://avail_user:ni_vineet_21@pg.avail.naxatar.com:5432/avail_explorer_test
    # ... other environment variables
    EOF
```

**Status:** ✅ Implemented in test workflow

### 4. Permission Issues

**Issue:** Security workflows failing due to insufficient permissions.

**Solution:**
Add required permissions to the job:

```yaml
permissions:
  security-events: write
  actions: read
  contents: read
```

**Status:** ✅ Configured in security workflow

### 5. Artifact Path Issues

**Issue:** Artifacts not being uploaded due to incorrect paths.

**Solution:**
Use relative paths from the working directory:

```yaml
- name: Upload test results
  uses: actions/upload-artifact@v4
  with:
    name: test-results
    path: |
      coverage/
      test-results.xml
```

**Status:** ✅ Configured in all workflows

## Debugging Tips

### 1. Check Workflow Logs
- Go to the Actions tab in your GitHub repository
- Click on the failed workflow run
- Expand the failing step to see detailed logs

### 2. Validate Workflows Locally
```bash
npm run validate:workflows
```

### 3. Test Commands Locally
Before adding commands to workflows, test them locally:
```bash
cd server
npm ci
npm test
npm run lint
npm run build
```

### 4. Use Debug Mode
Add debug output to workflows:
```yaml
- name: Debug environment
  run: |
    echo "Working directory: $(pwd)"
    echo "Node version: $(node --version)"
    echo "NPM version: $(npm --version)"
    ls -la
```

## Workflow-Specific Issues

### Test Workflow
- **Unit test failures**: Often due to mocking issues (non-critical)
- **Integration test failures**: Usually indicate real API issues
- **Coverage upload failures**: Check Codecov token configuration

### Quality Workflow
- **Linting failures**: Run `npm run lint` locally to fix
- **Formatting issues**: Run `npm run format` locally
- **Type checking failures**: Fix TypeScript errors

### Performance Workflow
- **Server startup failures**: Check port conflicts and environment variables
- **Artillery installation issues**: Network connectivity or npm registry issues
- **Performance degradation**: Compare with baseline metrics

### Security Workflow
- **Snyk failures**: Check `SNYK_TOKEN` secret configuration
- **CodeQL failures**: Usually due to code analysis issues
- **Dependency review failures**: Check license compliance

## Prevention Strategies

### 1. Pre-commit Hooks
Set up pre-commit hooks to catch issues early:
```bash
npm install --save-dev husky lint-staged
```

### 2. Local Testing
Always test workflows locally before pushing:
```bash
# Test all components
npm test
npm run lint
npm run build
npm audit
```

### 3. Gradual Rollout
- Start with basic workflows
- Add complexity incrementally
- Test each addition thoroughly

### 4. Monitor Workflow Performance
- Check execution times regularly
- Optimize slow steps
- Use caching effectively

## Getting Help

### 1. GitHub Actions Documentation
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Workflow syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)

### 2. Community Resources
- [GitHub Community Forum](https://github.community/)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/github-actions)

### 3. Action-Specific Documentation
- [actions/setup-node](https://github.com/actions/setup-node)
- [actions/cache](https://github.com/actions/cache)
- [codecov/codecov-action](https://github.com/codecov/codecov-action)

## Status Summary

| Issue | Status | Solution |
|-------|--------|----------|
| Node.js caching | ✅ Fixed | Use separate cache action |
| Working directory | ✅ Fixed | Configured in all workflows |
| Test environment | ✅ Fixed | Environment file creation |
| Permissions | ✅ Fixed | Added required permissions |
| Artifact paths | ✅ Fixed | Relative paths configured |

All known issues have been resolved and the workflows are ready for production use. 