# ESLint Setup Documentation

## Overview

ESLint has been successfully configured for the Avail Explorer Backend project. This setup provides comprehensive code quality checks, TypeScript support, and integration with the existing CI/CD pipeline.

## Configuration Files

### `.eslintrc.js`
The main ESLint configuration file with the following features:

- **Parser**: `@typescript-eslint/parser` for TypeScript support
- **Environment**: Node.js, ES2022, Jest
- **Extends**: 
  - `eslint:recommended` - Core ESLint rules
  - `plugin:@typescript-eslint/recommended` - TypeScript-specific rules
- **Plugins**: `@typescript-eslint` for TypeScript linting

### `.eslintignore`
Specifies files and directories to exclude from linting:
- Build outputs (`dist/`, `build/`)
- Dependencies (`node_modules/`)
- Test coverage (`coverage/`)
- Logs and temporary files
- Configuration files that don't need linting

## Rules Configuration

### TypeScript Rules
- `@typescript-eslint/no-unused-vars`: Error with underscore prefix exception
- `@typescript-eslint/explicit-function-return-type`: Disabled for flexibility
- `@typescript-eslint/explicit-module-boundary-types`: Disabled for flexibility
- `@typescript-eslint/no-explicit-any`: Warning (not error to allow gradual typing)
- `@typescript-eslint/no-non-null-assertion`: Warning

### Code Style Rules
- **Indentation**: 2 spaces
- **Quotes**: Single quotes
- **Semicolons**: Required
- **Trailing commas**: Required in multiline structures
- **Object/Array spacing**: Consistent formatting

### Best Practices
- **Equality**: Strict equality (`===`) required
- **Curly braces**: Required for all control structures
- **No eval**: Prohibited for security
- **Console statements**: Warning (allowed but flagged)

## Available Scripts

### `npm run lint`
Runs ESLint on all TypeScript files in the `src/` directory.

### `npm run lint:fix`
Runs ESLint with auto-fix enabled to automatically resolve fixable issues.

### `npm run lint:check`
Runs ESLint with zero warnings tolerance (useful for CI/CD).

## Current Status

### Issues Resolved
- ✅ ESLint configuration created and working
- ✅ TypeScript parser configured
- ✅ Auto-fix resolved 45+ formatting issues
- ✅ CI/CD integration ready

### Remaining Issues (68 total)
- **13 Errors**: Mostly unused variables and imports
- **55 Warnings**: Primarily `any` type usage and console statements

### Issue Breakdown by Category

#### Unused Variables/Imports (13 errors)
- `src/middleware/index.ts`: Unused `next` parameter
- `src/routes/blocks.ts`: Unused `db` import
- `src/routes/extrinsics.ts`: Unused `cacheMiddleware` and `config` imports
- `src/services/blockchain.ts`: Multiple unused variables
- `src/utils/database.ts`: Unused `QueryResult` import
- `src/types/index.ts`: Namespace usage (prefer ES modules)

#### Type Safety (55 warnings)
- Multiple files using `any` type instead of specific types
- Non-null assertions in middleware and database utilities
- Console statements throughout the codebase

## Recommendations

### Immediate Actions
1. **Remove unused imports/variables** to eliminate errors
2. **Replace `any` types** with specific interfaces where possible
3. **Add underscore prefix** to intentionally unused parameters

### Code Quality Improvements
1. **Type Definitions**: Create proper TypeScript interfaces
2. **Console Logging**: Replace with proper logging using Winston
3. **Error Handling**: Improve error handling patterns

### CI/CD Integration
The ESLint configuration is already integrated with GitHub Actions:
- Runs on push/PR to `main` and `develop` branches
- Uses `continue-on-error: true` to not block builds
- Provides feedback in PR comments

## TypeScript Version Compatibility

**Warning**: Currently using TypeScript 5.8.3, but ESLint TypeScript plugin supports up to 5.4.0. This may cause compatibility warnings but should work fine in practice.

### Options:
1. **Downgrade TypeScript** to supported version (5.3.x)
2. **Upgrade ESLint TypeScript plugin** when newer version available
3. **Continue with warnings** (current approach)

## File-Specific Overrides

### Test Files
- `**/*.test.ts`, `**/*.spec.ts`, `tests/**/*.ts`
- Relaxed rules: `any` types allowed, console statements allowed

### Configuration Files
- `*.config.js`, `*.config.ts`, `jest.config.js`
- Relaxed rules: `require()` allowed, console statements allowed

## Best Practices for Development

### Before Committing
```bash
npm run lint:fix    # Auto-fix issues
npm run lint        # Check remaining issues
npm run format      # Format with Prettier
```

### Handling Warnings
- **`any` types**: Replace with specific interfaces
- **Console statements**: Use Winston logger instead
- **Non-null assertions**: Add proper null checks

### Adding New Rules
1. Update `.eslintrc.js`
2. Test with `npm run lint`
3. Document changes in this file
4. Update CI/CD if needed

## Integration with Other Tools

### Prettier
- ESLint handles code quality
- Prettier handles code formatting
- Both run in CI/CD pipeline

### TypeScript
- ESLint uses TypeScript parser
- Shares `tsconfig.json` configuration
- Type checking runs separately in CI

### Jest
- Test files have relaxed ESLint rules
- Jest environment configured in ESLint
- Test-specific patterns allowed

## Troubleshooting

### Common Issues

#### "Configuration not found"
- Ensure `.eslintrc.js` is in project root
- Check file permissions

#### "Plugin not found"
- Run `npm install` to ensure dependencies
- Check `@typescript-eslint/eslint-plugin` is installed

#### "Parser error"
- Verify TypeScript files are valid
- Check `tsconfig.json` configuration

### Performance
- ESLint may be slow on large codebases
- Consider using `.eslintignore` for large generated files
- Use `--cache` flag for faster subsequent runs

## Future Enhancements

### Planned Improvements
- [ ] Add more specific TypeScript rules
- [ ] Integrate with VS Code settings
- [ ] Add custom rules for project-specific patterns
- [ ] Set up pre-commit hooks with Husky
- [ ] Add ESLint plugin for security rules

### Monitoring
- Track ESLint error/warning trends
- Monitor CI/CD performance impact
- Regular rule review and updates

---

**Last Updated**: December 2024  
**ESLint Version**: 8.57.1  
**TypeScript ESLint Version**: 6.21.0  
**Status**: ✅ Configured and Working 