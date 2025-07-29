# Release Guide

This guide explains how to release the Promptrun AI SDK using our automated workflows.

## Branch Strategy

- **🔵 main**: Stable releases (latest tag)
- **🟠 beta**: Beta releases (beta tag)
- **🌿 feature branches**: Development work

## Beta Releases

### Automatic (Recommended)

1. **Push to beta branch**:

   ```bash
   git checkout beta
   git merge your-feature-branch
   git push origin beta
   ```

2. **The workflow will automatically**:
   - Create a unique beta version (e.g., `1.0.1-beta.1703123456.abc123`)
   - Run tests and build
   - Publish to NPM with `beta` tag
   - Create git tags
   - Update version in package.json

### Manual (Using Script)

1. **Use the beta release script**:

   ```bash
   npm run beta
   # or
   ./scripts/beta-release.sh "Your custom message"
   ```

2. **Push the changes**:
   ```bash
   git push origin beta
   git push origin v<VERSION>
   ```

## Stable Releases

### Using Changesets (Recommended)

1. **Create changesets** for your changes:

   ```bash
   npm run changeset
   ```

2. **Follow the prompts**:

   - Select package: `@promptrun-ai/sdk`
   - Choose type: `patch`, `minor`, or `major`
   - Write summary of changes

3. **Commit and push**:

   ```bash
   git add .changeset/
   git commit -m "chore: add changeset"
   git push origin your-branch
   ```

4. **Merge to main**:

   ```bash
   git checkout main
   git merge your-branch
   git push origin main
   ```

5. **The workflow will automatically**:
   - Check for changesets
   - Version the package
   - Publish to NPM with `latest` tag
   - Create git tags
   - Clean up changesets

### Manual Workflow

You can also manually trigger the changeset creation:

1. Go to **GitHub Actions** → **Create Changeset**
2. Click **"Run workflow"**
3. Fill in the details:
   - **Type**: patch/minor/major
   - **Summary**: Brief description
   - **Description**: Detailed description (optional)

## Version Types

- **patch** (1.0.0 → 1.0.1): Bug fixes, minor improvements
- **minor** (1.0.0 → 1.1.0): New features, backward compatible
- **major** (1.0.0 → 2.0.0): Breaking changes

## Installing Versions

### Latest Stable

```bash
npm install @promptrun-ai/sdk
```

### Latest Beta

```bash
npm install @promptrun-ai/sdk@beta
```

### Specific Version

```bash
npm install @promptrun-ai/sdk@1.0.1
```

## Workflow Files

- `.github/workflows/release-stable.yml`: Stable releases (main branch)
- `.github/workflows/release-beta.yml`: Beta releases (beta branch)
- `.github/workflows/create-changeset.yml`: Manual changeset creation

## Troubleshooting

### Beta Release Fails

1. **Check NPM token**: Ensure `NPM_TOKEN` secret is set in GitHub
2. **Check permissions**: Ensure workflow has write permissions
3. **Check branch**: Ensure you're pushing to `beta` branch

### Stable Release Fails

1. **Check changesets**: Ensure you have changesets in `.changeset/`
2. **Check NPM token**: Ensure `NPM_TOKEN` secret is set
3. **Check version conflicts**: Ensure no version conflicts

### Manual Release

If automated workflows fail, you can manually release:

```bash
# Build and test
npm run build
npm test

# Version and publish
npm run version
npm run release
```

## Best Practices

1. **Always test** before releasing
2. **Use descriptive changesets** for better changelogs
3. **Keep beta branch updated** with main
4. **Use semantic versioning** correctly
5. **Document breaking changes** clearly

## Support

For issues with releases:

1. Check GitHub Actions logs
2. Verify NPM token and permissions
3. Check Changesets documentation
4. Open an issue in the repository
