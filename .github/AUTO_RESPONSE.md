# Automated Issue Response

This repository includes automated responses for platform-related issues.

## Issue Labels and Auto-Responses

### `platform-support` Label

Issues asking about macOS or Linux support will automatically receive a response pointing to:

- The Platform Migration Guide
- Last supported versions
- Community alternatives

### GitHub Actions Workflow

The repository can be configured with a GitHub Action that automatically:

1. Detects issues mentioning macOS, Linux, or related keywords
2. Adds appropriate labels
3. Responds with helpful information
4. Closes the issue if it's a duplicate platform question

## Manual Response Template

For manual responses to platform support questions:

```markdown
Thank you for your interest in VLC Discord RP!

As of version 4.0.0, we've made the decision to focus exclusively on Windows support to ensure the highest quality experience.

For information about:

- Last supported versions for your platform
- Known issues and workarounds
- Community alternatives and forks
- How to contribute to cross-platform support

Please see our [Platform Migration Guide](docs/PLATFORM_MIGRATION.md).

If you're interested in maintaining support for your platform, we'd be happy to discuss community fork opportunities!
```

## Common Platform Keywords

Auto-detection should trigger on:

- "macOS", "Mac", "Apple Silicon", "M1", "M2"
- "Linux", "Ubuntu", "Arch", "Debian", "Fedora", "AppImage", "AUR"
- "CrossPlatform", "Multi-platform"
- "Won't install on", "Doesn't work on"
