# Contributing

Conventions for this repository. They exist so the codebase reads as one voice.

## Project structure

The main process is organized by feature, not by utility:

```
src/main/
  main.ts          Composition root. Builds the object graph and starts the app.
  core/            Cross cutting infrastructure: logger, config, ipc, clock.
  features/<name>/ One folder per feature. Owns its types, handlers and services.
src/shared/        Contract between main and renderer. Nothing else.
src/renderer/      Also organized by feature.
```

A module belongs in `shared/` only when three or more features use it *and* it carries no business
logic. If only `main` uses it, it lives in its feature. Without this rule `shared/` becomes a dumping
ground within months.

## File naming

`<subject>.<role>.ts`, kebab-case. The subject defaults to the feature name. When a folder holds
several files of the same role, the subject is the specific thing, composed with a hyphen:

```
features/vlc/vlc.client.ts          features/vlc/vlc-config.handler.ts
features/vlc/vlc.mapper.ts          features/vlc/vlc-status.handler.ts
features/cover/providers/embedded.provider.ts
```

Roles in use: `.client`, `.handler`, `.mapper`, `.provider`, `.store`, `.loop`, `.types`.

Do not use `*-service.ts`. The folder already says it is a service.

`core/` is the exception: one file per concept, bare name (`logger.ts`, `config.ts`). There are no
roles to distinguish there.

## Identifiers

The path carries the qualifier, so the exported identifier stays short:

```ts
// features/discord/discord.client.ts
export class Client { }
```

At the call site, use a namespace import when names collide or when it aids reading:

```ts
import * as Discord from "@main/features/discord"

constructor(private readonly discord: Discord.Client) {}
```

Never write `DiscordClient` in a file already inside `features/discord/`.

Note that `import * as` hurts tree shaking. It is free in `main` (Node, never shipped to a browser)
but should be avoided in `renderer`, where named imports are preferred.

## Imports and barrels

| Situation | Rule |
|---|---|
| Between features | Only through the barrel: `@main/features/vlc`. Never deep. |
| Within a feature | Always relative: `./vlc.client`. Never through your own barrel. |

The second rule is what prevents circular imports.

A barrel (`index.ts`) only re-exports. It never contains an implementation. Six editor tabs named
"index.ts" are not navigable.

## Code style

**Classes with constructor injection, not singletons.** A `private static instance` is global state
wearing a class costume: it cannot be instantiated twice, faked in a test, or inspected. Dependencies
are declared in the constructor and wired once in `main.ts`.

**Functions for pure transformations.** A class with no state is a function with extra steps.

**Interfaces for anything crossing a feature boundary.** Tests then receive fakes instead of mocking
modules.

**Discriminated unions over optional field soup.** Prefer a `kind` tag the compiler can narrow over a
type where half the fields may or may not be present.

## Comments and prose

Be minimal. Comment the *why*, never the *what*. If a comment restates the code, delete it. If the
code needs a comment to be understood, consider renaming things instead.

Do not add JSDoc that repeats the signature. A `@param filePath - Path to the file` on a parameter
named `filePath` is noise.

A comment earns its place by recording a decision, a measurement, or a trap that cost somebody
time. "AcoustID limits by application key, not by IP" is worth a line. So is why an order matters.
Everything else goes.

Keep them short. A doc block longer than the function under it is too long: compress it to the
sentence that carries the decision. One comment above the function, and inline only where the
surprise is at that exact line.

Write in English, code and comments both. Never commit commented out code, it is in git already.

Do not use em dashes in code, comments, commit messages, documentation or pull request descriptions.
Use a comma, a colon, parentheses or a new sentence.

## TypeScript

Strict mode plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
`noFallthroughCasesInSwitch` and `verbatimModuleSyntax`.

Do not lie to the compiler. A cast that asserts fields nothing ever assigns is worse than no type at
all, because it silences the one tool that could have caught it. `as unknown as T` is always a bug
report about the type above it.

Generics must constrain. A signature like `get<T>(key: string): T` returns whatever the caller asks
for and verifies nothing. Key it off the real shape instead:

```ts
get<K extends keyof AppConfig>(key: K): AppConfig[K]
```

## Logging

Never pass a configuration value, a configuration object, or a whole error object to the logger.
The app config holds the VLC HTTP password, and an error thrown by a failed request can carry the
whole URL it was made against, which is how a credential passed as a query parameter ends up in a
log file.

Log the key that changed, not its value. Log whether a password is set, never the value and never
its length. Log `error.name` rather than the error itself for any request whose URL may embed a
credential. Port numbers and boolean flags are safe and worth keeping, they are what makes a
connection problem diagnosable.

## Tests

Pure units (mappers, key builders, timeline math, presence building) are tested directly with
fixtures. The suite must run without VLC, without Discord and without network access.

When refactoring, write characterization tests first: they capture current behavior, bugs included.
A later diff in those snapshots is the list of behavior changes you actually made.

Four gates run on every push: `lint:check`, `typecheck`, `test`, `build:win`. Run them through the
package scripts. `npx biome` does not run this repo's linter: the bare name resolves to an unrelated
package on the registry that exits 0 without checking anything, so green from it means nothing.

## Commits

Use [changesets](./docs/CHANGESETS.md) for anything user facing. Write them in English, in the
same voice as the ones already there: what changed, what a person sees differently, and the reason
when the reason is the interesting part.

Conventional commit prefixes: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`.

Do not add AI attribution trailers, generated-by footers or session links to commits or pull
requests. Do not commit AI generated design documents or working notes.

Keep pull requests small and single purpose. A mechanical change (moving and renaming files) and a
behavioral change never share a commit: when something breaks, you need to know which one did it.
