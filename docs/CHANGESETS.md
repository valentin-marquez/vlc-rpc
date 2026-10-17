# Changesets

Every user facing change carries a changeset: a small file under `.changeset/` that says how the
version should move and what a person will see differently. Those files are what writes
`CHANGELOG.md` and what decides the next version number, so the release notes get written while the
change is fresh instead of being reconstructed from commit messages months later.

## Writing one

```bash
bun run changeset
```

It asks for a bump and a summary, then writes a file under `.changeset/`. Commit that file in the
same change it describes.

- `patch` for a fix that changes nothing anybody chose.
- `minor` for something new that breaks nothing.
- `major` for a change that breaks something someone relied on, a default that moves included.

Write them in English, in the voice of the ones already in the folder: what changed, what a person
sees differently, and the reason when the reason is the interesting part. No em dashes. A changeset
is for what a user can notice, so a refactor, a CI change or a documentation edit does not get one.

Good:

```markdown
Audio files with no embedded artwork now get a cover.

- The app looks the track up by its tags and uses the release cover it finds.
- A lookup that finds nothing leaves the frame empty instead of risking the wrong one.
```

Bad:

```markdown
Fixed stuff
```

## What ships them

Two workflows, and neither one publishes by itself.

`ci.yml` runs on every push and pull request to `main`: `lint:check`, both typechecks, the suite and
a Windows build. It does not check whether a changeset exists, so that part is on the author.

`release.yml` runs when a `v*` tag reaches GitHub. It checks the tag against `package.json`, builds
the Windows binaries and creates the GitHub release with the installers attached. It never versions,
commits or tags: the repository lives on Forgejo and GitHub is a push mirror, which deletes any tag
Forgejo does not have, so a tag created by the workflow would vanish and leave the release as a draft.
Merging to `main` releases nothing.

To release, from an up to date `main`:

```bash
bun run changeset:version
git commit -am "chore: release vX.Y.Z"
git tag vX.Y.Z
git push origin main vX.Y.Z   # origin is Forgejo; the mirror carries both to GitHub
```

## Scripts

```bash
bun run changeset          # write a new changeset
bun run changeset:version  # apply the pending ones, bump the version, write the changelog
bun run changeset:publish  # publish, which the release does not use
```

`changeset:version` is part of the release steps above and is run locally.

## Links

- [Changesets](https://github.com/changesets/changesets)
- [Semantic versioning](https://semver.org/)
