# Automated Issue Responses# Automated Issue Response



## Platform SupportThis repository includes automated responses for platform-related issues.



As of version 4.0.0, VLC-RPC is Windows-only.## Issue Labels and Auto-Responses



### Auto-response Template### `platform-support` Label



```markdownIssues asking about macOS or Linux support will automatically receive a response pointing to:

VLC-RPC is Windows-only as of v4.0.0. 

- The Platform Migration Guide

For macOS/Linux, use version 3.x or consider maintaining a community fork.- Last supported versions

- Community alternatives

See CHANGELOG.md for migration details.

```### GitHub Actions Workflow



### Detection KeywordsThe repository can be configured with a GitHub Action that automatically:



- macOS, Mac, Apple Silicon, M1, M2, M31. Detects issues mentioning macOS, Linux, or related keywords

- Linux, Ubuntu, Arch, Debian, Fedora2. Adds appropriate labels

- Cross-platform, multi-platform3. Responds with helpful information

- "doesn't work on", "won't install on"4. Closes the issue if it's a duplicate platform question



## Common Issues## Manual Response Template



Issues frequently asked about can receive automated responses pointing to:For manual responses to platform support questions:

- README.md for setup instructions

- CHANGELOG.md for version history```markdown

- Existing issues for known problemsThank you for your interest in VLC Discord RP!


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
