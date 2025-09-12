# ioBroker Bot Task Library

ioBroker Bot Task Library is a Node.js service that provides repository checking functionality for ioBroker adapters. The service runs at https://adapter-check.iobroker.in/ and consists of backend scripts that analyze GitHub repositories for compliance and best practices.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Bootstrap and Setup
- **Node.js Requirement**: Node.js 18+ is required (specified in package.json engines)
- **Install dependencies**: `npm install` -- takes ~11 seconds. NEVER CANCEL.
- **Lint validation**: `npm run lint` -- takes <5 seconds. Always run before committing changes.

### Repository Structure
- `checks/checkRepository/checkRepository.js` - Main repository checking script (803 lines)
- `checks/checkLatestRepositories/checkLatestRepositories.js` - Batch repository checker for scheduled runs
- `lib/` - Common utility modules (commonTools.js, githubTools.js, iobrokerTools.js)
- `statistics/` - Generated JSON files containing repository analysis results
- `checks/_achived_/` - Deprecated functionality, do not modify

### Build and Test Process
- **No build step required** - This is a pure Node.js script-based project
- **No automated tests exist** - npm test fails with "Missing script: test"
- **Linting only**: Use `npm run lint` for code quality validation
- **Manual validation**: Test functionality using `--dry` and `--debug` flags on main scripts

### Authentication Requirements
- **GitHub API tokens required**: Set `IOBBOT_GITHUB_TOKEN` and `OWN_GITHUB_TOKEN` environment variables
- **Without tokens**: Scripts will fail with 403 errors when accessing GitHub API
- **For testing**: Use `--dry` flag to test logic without making actual API calls

## Main Scripts and Usage

### Repository Checker (Individual)
```bash
node checks/checkRepository/checkRepository.js [options] <repository_url_or_name>
```

**Available options:**
- `--debug` - Enable debug logging
- `--dry` - Dry run mode (no actual changes)
- `--cleanup` - Clean up old issues
- `--create-issue` - Create GitHub issues for findings
- `--erroronly` - Only process errors, skip warnings
- `--recheck` - Force recheck of repository
- `--recreate` - Recreate issues from scratch
- `--suggestions` - Include suggestions in output

**Examples:**
```bash
# Test in dry mode with debug output
node checks/checkRepository/checkRepository.js --debug --dry iobroker-community-adapters/ioBroker.accuweather

# Check repository and create issues (requires tokens)
node checks/checkRepository/checkRepository.js --create-issue owner/ioBroker.adapter-name
```

### Batch Repository Checker
```bash
node checks/checkLatestRepositories/checkLatestRepositories.js [flags]
```

### GitHub Workflows
- **CI/CD**: `.github/workflows/test-and-release.yml` - Runs linting on Node.js 22.x
- **Repository checking**: `.github/workflows/checkRepository.yml` - Manual/dispatch triggered checks
- **Scheduled checks**: `.github/workflows/checkLatestRepositories.yml` - Weekly scheduled runs (Fridays at 19:30)

## Validation and Testing

### Manual Validation Steps
Since there are no automated tests, always validate changes manually:

1. **Install and lint**: 
   ```bash
   npm install
   npm run lint
   ```

2. **Test repository checker in dry mode**:
   ```bash
   node checks/checkRepository/checkRepository.js --debug --dry iobroker-community-adapters/ioBroker.example
   ```

3. **Verify the script accepts parameters and shows expected error messages when missing tokens**

### Expected Behavior Without Tokens
- Scripts will output "AxiosError: Request failed with status code 403" 
- This is normal behavior when GitHub tokens are not provided
- Use `--dry` mode to test logic without API calls

### Code Quality
- **ALWAYS run**: `npm run lint` before committing changes
- **Follow existing code style**: 4-space indents, single quotes, semicolons required
- **ESLint config**: Uses @iobroker/eslint-config with custom overrides in eslint.config.mjs

## Important Notes and Warnings

### Security
- **Known vulnerability**: High severity vulnerability in image-size dependency
- **Fix available**: Run `npm audit fix` if needed, but test thoroughly after updates

### Timing Expectations
- `npm install`: ~11 seconds - NEVER CANCEL
- `npm run lint`: <5 seconds
- Repository checking scripts: Variable timing depending on repository size and network
- **No specific timeout warnings needed** - Scripts are relatively fast-running

### Common Pitfalls
- **Missing GitHub tokens**: Most common cause of 403 errors
- **Repository format**: Script expects GitHub repository URLs or owner/repo format
- **Case sensitivity**: Repository names are case-sensitive
- **Network access**: Scripts require internet access to GitHub API

## File Locations and Navigation

### Key Configuration Files
```
/home/runner/work/check-tasks/check-tasks/
├── package.json          # Dependencies and Node.js version requirements
├── eslint.config.mjs     # ESLint configuration
├── .eslintrc.json        # Legacy ESLint config (still referenced)
├── prettier.config.mjs   # Code formatting config
└── .github/
    ├── workflows/        # CI/CD and automation workflows
    └── copilot-instructions.md  # This file
```

### Main Source Code
```
├── checks/
│   ├── checkRepository/
│   │   └── checkRepository.js     # Primary repository checker (803 lines)
│   ├── checkLatestRepositories/
│   │   └── checkLatestRepositories.js  # Batch processor
│   └── _achived_/                 # Deprecated code - do not modify
└── lib/
    ├── commonTools.js             # Shared utilities  
    ├── githubTools.js             # GitHub API helpers
    └── iobrokerTools.js           # ioBroker-specific tools
```

### Generated Data
```
└── statistics/                    # Auto-generated JSON files (1000+ files)
    ├── ioBroker.adapter1.json     # Repository analysis results
    ├── ioBroker.adapter2.json
    └── ...
```

## Making Changes

### Development Workflow
1. **Always start with**: `npm install && npm run lint`
2. **Make minimal changes** to existing scripts
3. **Test changes**: Use `--dry --debug` flags extensively
4. **Validate**: Run `npm run lint` after every change
5. **No build step required** - changes take effect immediately

### Common Modification Areas
- **Error detection logic**: Located in main checking scripts
- **GitHub API integration**: Primarily in lib/githubTools.js
- **Issue formatting**: Text processing functions in main scripts
- **Statistics generation**: Output formatting in createStatistics functions

Always test changes thoroughly with dry runs before deploying, as this tool creates and modifies GitHub issues automatically.