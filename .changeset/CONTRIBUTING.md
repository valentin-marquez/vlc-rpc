# Using Changesets

This project uses [Changesets](https://github.com/changesets/changesets) to manage versioning and changelogs.

## For Contributors

When you make a change that affects users (bug fix, new feature, breaking change), you need to add a changeset:

```bash
bun changeset
```

This will prompt you to:

1. Select the type of change (major/minor/patch)
2. Write a summary of the change

The changeset will be included in your PR.

## Change Types

- **Major** (1.0.0 → 2.0.0): Breaking changes
- **Minor** (1.0.0 → 1.1.0): New features (backwards compatible)
- **Patch** (1.0.0 → 1.0.1): Bug fixes

## For Maintainers

### Release Process (Manual Trigger)

1. **Accumulate changesets** from merged PRs

2. **Trigger release workflow**:
   - Go to GitHub Actions → "Release" workflow
   - Click "Run workflow"
   - The workflow will:
     - Consume all changesets
     - Update package.json version
     - Update CHANGELOG.md
     - Commit changes
     - Build Windows binaries
     - Create git tag
     - Create GitHub release with artifacts

That's it! One click release.

### What happens behind the scenes:

```bash
bun changeset:version  # Consumes changesets, updates version
git commit & push      # Commits version bump
bun run build:win      # Builds binaries
gh release create      # Creates GitHub release
```

## Examples

### Adding a Changeset

```bash
$ bun changeset
🦋  Which packages would you like to include? · vlc-rpc
🦋  Which type of change is this for vlc-rpc? · patch
🦋  Please enter a summary for this change (this will be in the changelogs).
🦋    (submit empty line to open external editor)
🦋  Summary · Fixed cover art upload issues
🦋
🦋  === Summary of changesets ===
🦋  patch:  vlc-rpc
🦋
🦋  Is this your desired changeset? (Y/n) · true
🦋  Changeset added! - you can now commit it
```

### Viewing Pending Changesets

```bash
bun changeset status
```

## Workflow

```
PR with changeset → Merge → Changesets accumulate → Manual trigger "Release" → Done
```

Simple and controlled!
