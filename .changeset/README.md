# Changesets

This directory contains changesets for the Promptrun AI SDK. Changesets are used to manage versioning and releases.

## How to Use Changesets

### For Regular Development

1. **Create a changeset** when you make changes that should be included in the next release:

   ```bash
   npm run changeset
   ```

2. **Follow the prompts**:

   - Select the package (`@promptrun-ai/sdk`)
   - Choose the type of change (patch, minor, major)
   - Write a summary of your changes

3. **Commit the changeset**:
   ```bash
   git add .changeset/
   git commit -m "chore: add changeset"
   ```

### For Beta Releases

When you push to the `beta` branch, the workflow will automatically:

- Create a unique beta version (e.g., `1.0.1-beta.1703123456.abc123`)
- Publish to NPM with the `beta` tag
- Create a git tag
- Update the version in package.json

### For Stable Releases

When you merge to `main`, the workflow will:

- Check for changesets
- Version the package according to the changesets
- Publish to NPM with the `latest` tag
- Create git tags
- Clean up the changesets

## Change Types

- **patch**: Bug fixes and minor improvements (1.0.0 → 1.0.1)
- **minor**: New features, backward compatible (1.0.0 → 1.1.0)
- **major**: Breaking changes (1.0.0 → 2.0.0)

## Manual Workflow

You can also manually trigger the changeset creation workflow from GitHub Actions:

1. Go to Actions → Create Changeset
2. Click "Run workflow"
3. Fill in the details:
   - Type: patch/minor/major
   - Summary: Brief description
   - Description: Detailed description (optional)

## Branch Strategy

- **main**: Stable releases (latest tag)
- **beta**: Beta releases (beta tag)
- **feature branches**: Development work

## Versioning Examples

### Beta Version

```
1.0.1-beta.1703123456.abc123
└─┬─┘ └─┬─┘ └─┬─┘ └─┬─┘
  │     │     │     └─ Commit hash
  │     │     └─ Timestamp
  │     └─ Beta identifier
  └─ Base version
```

### Stable Version

```
1.2.0
└─┬─┘
  └─ Based on changesets
```

## Commands

- `npm run changeset`: Create a new changeset
- `npm run version`: Version packages based on changesets
- `npm run release`: Publish packages to NPM

## Files

- `.changeset/config.json`: Configuration for changesets
- `.changeset/*.md`: Individual changeset files
- `.changeset/README.md`: This file
