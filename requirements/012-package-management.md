# PRS-012: Package management

Status: Draft
Priority: High
Target Version: 2.0.0

## Overview

This PRS defines the package management implementation for DomainLang's CLI — the transport, caching, authentication, and command layer that fetches external dependencies declared in `model.yaml` and maintains the `model.lock` file.

The design replaces all `git clone`/`git ls-remote` subprocess calls with **pure HTTP tarball downloads** via the GitHub REST API, eliminating git as a runtime dependency for package operations. Authentication uses `git credential fill` as a read-only credential retrieval API — transparently bridging into whatever credential manager the user already has (macOS Keychain, GitHub CLI `gh auth`, Windows GCM, `.netrc`).

Package management commands are the first major user-facing feature of the CLI. They **co-implement with PRS-011** (Ink-based UI), serving as the proving ground for the component library, design tokens, and visual identity. Every command in this PRS renders through PRS-011's Ink components — spinners, tables, status messages, progress panels — making `dlang install` the flagship experience that sets the bar for all future commands.

> **Current state:** The CLI uses Commander.js + chalk with raw `console.log()`. The `bin/cli.js` entry point references a non-existent `main-ink.js`. Ink, React, and the PRS-011 component library are **not yet implemented**. This PRS requires PRS-011 Phase 1 (Foundation) as a prerequisite.

**Key changes:**

- HTTP tarball downloads via GitHub archive API (no git clone)
- `git credential fill` for authentication (Go-style delegation)
- Project-local cache at `.dlang/packages/` with atomic writes
- SHA-512 integrity hashes in lock file entries
- `--frozen` lock file mode for CI pipelines
- Retry with exponential backoff for network resilience
- CLI commands: `dlang install`, `add`, `remove`, `update`, `upgrade`, `outdated`, `init`, `cache-clear`
- Removal of all git protocol code from the CLI package
- **Rich Ink-based UI** for all commands (co-implemented with PRS-011)

> **Supersedes:** PRS-010 Phase 6 (CLI Commands). PRS-010 Phases 1–5 and 8–12 remain valid. This PRS replaces the CLI implementation plan from PRS-010 with an HTTP-native approach and adds package management infrastructure.

## User stories

### Primary user story

As a **domain modeler**,
I want to install shared domain definitions from GitHub packages,
So that I can compose enterprise-wide models without manual file copying.

### Secondary user stories

As a **CI/CD engineer**,
I want a `--frozen` install mode that fails if the lock file is stale,
So that builds are deterministic and unexpected dependency changes are caught.

As a **developer with private repos**,
I want the CLI to use my existing git credentials automatically,
So that I don't need to configure a separate authentication system.

As a **new user**,
I want `dlang init` to scaffold a project with `model.yaml`,
So that I can start modeling with dependencies quickly.

As a **team lead**,
I want integrity hashes in the lock file,
So that I can verify dependencies haven't been tampered with.

## Implementation status

**Last Updated:** 2026-02-05

| Phase | Status | Completion | Notes |
| ----- | ------ | ---------- | ----- |
| Phase 0: Merge refactor-cli | ✅ Complete | 100% | Ink framework merged via commit 259adc4 |
| Phase 1: Foundation services | ✅ Complete | 100% | CredentialProvider, PackageDownloader, PackageCache, fetchWithRetry all implemented with 94%+ coverage |
| Phase 2: Remove git protocol | ✅ Complete | 100% | GitUrlResolver deleted, HTTP-based download wired up |
| Phase 3: Lock file hardening | ✅ Complete | 100% | Integrity verification, --frozen, --force implemented |
| Phase 4: Ink command components | 🚧 In Progress | 63% | 5/8 commands complete: install, add, remove, init, cache-clear |
| Phase 5: Testing and docs | 📋 Planned | 0% | — |

**Commands Status:**
- ✅ `dlang install` - Full Ink UI with streaming progress, --frozen, --force
- ✅ `dlang add` - Package addition with model.yaml update
- ✅ `dlang remove` - Package removal with cache cleanup
- ✅ `dlang init` - Project scaffolding with ASCII art banner
- ✅ `dlang cache-clear` - Cache management (bug fix applied)
- ⏳ `dlang update` - TODO: Branch dependency updates
- ⏳ `dlang upgrade` - TODO: Tag version upgrades
- ⏳ `dlang outdated` - TODO: Available updates listing

**Test Status:** ✅ 311/311 tests passing (22 test files)  
**Build Status:** ✅ Clean (no TypeScript errors)  
**Lint Status:** ✅ 0 errors in production code

---

## Success criteria

- [ ] `dlang install` downloads packages via HTTP (no git subprocess)
- [ ] `dlang install --frozen` fails if `model.lock` doesn't match `model.yaml`
- [ ] Private GitHub repos work when user has `gh auth login` or `GITHUB_TOKEN` configured
- [ ] Public repos work without any git installation
- [ ] Lock file entries include `integrity: "sha512-..."` hashes
- [ ] `dlang add`, `remove`, `update`, `upgrade`, `outdated` commands work
- [ ] `dlang init` scaffolds a project with `model.yaml`
- [ ] `dlang cache-clear` clears the correct project-local cache
- [ ] No `git clone`, `git ls-remote`, or `git fetch` subprocess calls remain in the CLI
- [ ] All existing dependency resolution tests pass (BFS, "Latest Wins", cycle detection, overrides)
- [ ] All commands render through Ink components in rich mode (`<Banner>`, `<Spinner>`, `<Table>`, etc.)
- [ ] All commands support `--json` output mode (structured JSON, no Ink)
- [ ] All commands support `--quiet` output mode (minimal text, errors only)
- [ ] `dlang install` shows real-time streaming progress with `<Spinner>` per package
- [ ] Error messages render as `<Banner variant="error">` with actionable hints
- [ ] Snapshot tests cover key rendering states for all command components

## Functional requirements

### Must have (P0)

#### 1. HTTP tarball downloads

Replace `GitUrlResolver.downloadRepo()` with pure HTTP downloads via the GitHub REST API.

**Download flow:**

```text
┌──────────────────┐     ┌─────────────────────┐     ┌──────────────┐
│ DependencyResolver│────▶│  PackageDownloader   │────▶│ GitHub API   │
│ (existing BFS)   │     │  (new HTTP service)  │     │ tarball/{ref}│
└──────────────────┘     └─────────────────────┘     └──────────────┘
                                   │                        │
                                   │  ◀─── 302 redirect ────┘
                                   ▼
                          ┌─────────────────┐
                          │ codeload.github │
                          │   .com (CDN)    │
                          └────────┬────────┘
                                   │ tarball stream
                                   ▼
                          ┌─────────────────┐
                          │  PackageCache   │
                          │  atomic write   │
                          │  .dlang/pkgs/   │
                          └─────────────────┘
```

**GitHub API endpoints:**

| Operation | Endpoint | Method |
| --------- | -------- | ------ |
| Download tarball | `/repos/{owner}/{repo}/tarball/{ref}` | `GET` (follows 302) |
| Resolve tag to commit | `/repos/{owner}/{repo}/git/ref/tags/{ref}` | `GET` |
| Resolve branch to commit | `/repos/{owner}/{repo}/git/ref/heads/{ref}` | `GET` |
| Validate commit SHA | `/repos/{owner}/{repo}/commits/{sha}` | `GET` |
| List tags (for `upgrade`/`outdated`) | `/repos/{owner}/{repo}/tags` | `GET` |

**Required HTTP headers:**

```text
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
Authorization: Bearer <token>   (when credentials available)
```

**Tarball extraction:**

GitHub archives contain a root directory named `{repo}-{ref}/`. Use the `tar` npm package with `strip: 1` to flatten:

```typescript
import tar from 'tar';

await tar.extract({
    file: tarballPath,
    cwd: destinationDir,
    strip: 1,
});
```

**Platform scope:** GitHub only. Non-GitHub `source` URLs in `model.yaml` produce a clear error:

```text
Error: Non-GitHub hosts are not yet supported.
  Dependency 'corp/internal' specifies source: https://gitlab.corp.com/corp/internal
  Hint: Only GitHub repositories are supported in this version.
```

#### 2. Credential provider

Authentication delegates to the user's existing git credential ecosystem — the same approach Go modules use.

**Resolution order (highest priority first):**

1. `DLANG_GITHUB_TOKEN` environment variable (project-specific CI override)
2. `GITHUB_TOKEN` environment variable (standard CI token)
3. `git credential fill` subprocess (reads macOS Keychain, GCM, `gh auth`, `.netrc`)
4. No credentials (public repos only)

**`git credential fill` protocol:**

```typescript
import { execFile } from 'node:child_process';

async function getGitCredentials(host: string): Promise<{ username: string; password: string } | undefined> {
    const input = `protocol=https\nhost=${host}\n\n`;

    const { stdout } = await execFile('git', ['credential', 'fill'], {
        input,
        timeout: 5000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });

    const fields = Object.fromEntries(
        stdout.split('\n')
            .filter(line => line.includes('='))
            .map(line => line.split('=', 2) as [string, string])
    );

    if (fields.username && fields.password) {
        return { username: fields.username, password: fields.password };
    }
    return undefined;
}
```

**Key behaviors:**

- `GIT_TERMINAL_PROMPT=0` prevents interactive prompts from blocking the CLI
- Timeout of 5 seconds prevents hanging on misconfigured credential helpers
- If `git` is not installed, the credential provider returns `undefined` gracefully — public repos still work
- For env var tokens, use `Authorization: Bearer {token}` header
- For git credentials, use `Authorization: Basic {base64(user:pass)}` header
- Host-aware: queries credentials for the correct hostname (always `github.com` for now)

**Error messaging when auth fails:**

```text
Error: Authentication failed for 'acme/private-models' (HTTP 401)
  Hint: For private repos, ensure credentials are available:
    • Run 'gh auth login' (GitHub CLI)
    • Set GITHUB_TOKEN environment variable
    • Configure a git credential helper
```

#### 3. Project-local cache

All downloaded packages are stored in the project-local `.dlang/packages/` directory per PRS-010's design. No global cache.

**Cache structure:**

```text
my-project/
├── model.yaml
├── model.lock
├── .dlang/                          # gitignored
│   └── packages/
│       ├── .tmp-a1b2c3/            # in-progress download (cleaned up)
│       ├── domainlang/
│       │   └── core/
│       │       └── abc123def456/    # keyed by commit SHA
│       │           ├── model.yaml
│       │           └── index.dlang
│       └── acme/
│           └── patterns/
│               └── def789abc123/
│                   └── ...
```

**Atomic write pattern:**

1. Create temp directory: `.dlang/packages/.tmp-{randomUUID}/`
2. Extract tarball into temp directory (with `strip: 1`)
3. Compute SHA-512 hash of the tarball bytes
4. `fs.rename()` temp directory to final path `{owner}/{repo}/{commitSha}/`
5. If target already exists (concurrent install or cache hit): remove temp, reuse existing

Since content at a given commit SHA is immutable, a cache hit by path means the content is correct.

**Cache operations:**

| Method | Behavior |
| ------ | -------- |
| `has(owner, repo, commitSha)` | Check if directory exists |
| `get(owner, repo, commitSha)` | Return absolute path to cached package |
| `put(owner, repo, commitSha, tarball)` | Atomic extract + rename |
| `remove(owner, repo, commitSha)` | Remove specific package |
| `clear()` | Remove entire `.dlang/packages/` directory |

**Bug fix:** The current `cacheClear()` command in `dependency-commands.ts` incorrectly clears `~/.dlang/cache/` (a path that doesn't exist). This PRS fixes it to clear the project-local `.dlang/packages/` directory.

#### 4. Lock file hardening

Extend the existing `model.lock` JSON format with integrity hashes and resolved download URLs.

**Enhanced lock entry:**

```json
{
    "version": "1",
    "dependencies": {
        "domainlang/core": {
            "ref": "v1.0.0",
            "refType": "tag",
            "resolved": "https://api.github.com/repos/domainlang/core/tarball/abc123def456",
            "commit": "abc123def456789...",
            "integrity": "sha512-K2sFMmQw4Y1..."
        }
    }
}
```

**New/updated fields:**

| Field | Status | Description |
| ----- | ------ | ----------- |
| `resolved` | Exists, now populated | Exact tarball download URL |
| `integrity` | Exists (optional), now populated | SHA-512 hash of downloaded tarball in SRI format |

The `LockedDependency` type in `packages/language/src/services/types.ts` already has both fields as optional. This PRS populates them.

**Integrity verification flow:**

```text
dlang install (with existing lock file)
  │
  ├─ For each locked dependency:
  │   ├─ Download tarball (or use cached)
  │   ├─ Compute SHA-512 of tarball bytes
  │   ├─ If lock has integrity field:
  │   │   ├─ Match? → Continue
  │   │   └─ Mismatch? → Error (below)
  │   └─ If lock has no integrity field:
  │       └─ Add integrity to lock (graceful upgrade)
  │
  └─ Write updated lock file
```

**Integrity mismatch error:**

```text
Error: Integrity check failed for 'acme/patterns'
  Expected: sha512-K2sFMmQw4Y1...
  Got:      sha512-x9pLm3nRt7Q...
  
  The package archive may have been regenerated or tampered with.
  Run 'dlang install --force' to re-resolve and update the lock file.
```

**Note on GitHub archive stability:** GitHub does not guarantee that tarballs for the same ref produce identical bytes across regenerations. The integrity hash locks what WE downloaded — subsequent installs verify against OUR stored hash, detecting any change. `--force` re-resolves when intentional.

#### 5. Frozen lock file mode

The `--frozen` flag prevents any modification to `model.lock` during install. This is the CI mode.

```bash
dlang install --frozen
```

Behavior:

- If `model.lock` doesn't exist → error
- If `model.yaml` has a dependency not in `model.lock` → error
- If `model.lock` has a dependency not in `model.yaml` → error
- If refs differ between manifest and lock → error
- If all match → download/verify packages without touching `model.lock`

Also triggered by `DLANG_FROZEN=1` environment variable.

**Error example:**

```text
Error: Lock file is out of sync with model.yaml (--frozen mode)
  Added in model.yaml but missing from lock:
    acme/new-dep@v1.0.0
  
  Run 'dlang install' without --frozen to update the lock file.
```

#### 6. Network resilience

All HTTP calls wrapped in `fetchWithRetry()`:

- Max 3 attempts
- Exponential backoff: 1s → 2s → 4s (with jitter)
- Cap at 30 seconds
- Retry on: HTTP 429, 5xx, network errors (`ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`)
- Respect `retry-after` and `x-ratelimit-reset` headers
- No retry on: 401, 403 (auth failures), 404 (not found)

**Rate limit awareness:**

```text
Warning: GitHub API rate limit low (12/60 remaining, resets in 47 minutes)
  Hint: Set GITHUB_TOKEN for 5000 requests/hour instead of 60.
```

#### 7. Ref resolution via HTTP

Replace `git ls-remote` with GitHub REST API calls for ref-to-commit resolution:

```typescript
async function resolveRef(owner: string, repo: string, ref: string): Promise<ResolvedRef> {
    // Commit SHA: validate directly
    if (/^[0-9a-f]{7,40}$/i.test(ref)) {
        const commit = await fetchCommit(owner, repo, ref);
        return { ref, refType: 'commit', commit: commit.sha };
    }

    // Try as tag first
    const tag = await fetchRef(owner, repo, `tags/${ref}`);
    if (tag) {
        // Tags can be annotated (point to tag object) or lightweight (point to commit)
        const commitSha = tag.object.type === 'tag'
            ? (await fetchTagObject(owner, repo, tag.object.sha)).object.sha
            : tag.object.sha;
        return { ref, refType: 'tag', commit: commitSha };
    }

    // Try as branch
    const branch = await fetchRef(owner, repo, `heads/${ref}`);
    if (branch) {
        return { ref, refType: 'branch', commit: branch.object.sha };
    }

    throw new Error(
        `Cannot resolve ref '${ref}' for '${owner}/${repo}'.\n` +
        `  Checked: tag '${ref}', branch '${ref}'\n` +
        `  Hint: Verify the ref exists at https://github.com/${owner}/${repo}`
    );
}
```

#### 8. Remove git protocol code from CLI

Delete all `git clone`, `git ls-remote`, `git fetch`, and `git checkout` subprocess calls from the CLI package. The only remaining git subprocess is `git credential fill` in the credential provider.

**What to remove:**

| Current code | Action |
| ------------ | ------ |
| `GitUrlResolver` class (network methods) | Delete entirely |
| `git clone --depth 1` calls | Replaced by HTTP tarball download |
| `git ls-remote` calls | Replaced by GitHub REST API ref resolution |
| `git fetch` / `git checkout` calls | Not needed (tarballs are immutable snapshots) |
| `git rev-parse HEAD` calls | Replaced by commit SHA from API response |

**What to keep:**

| Current code | Action |
| ------------ | ------ |
| `GitUrlParser` (static URL parsing) | Extract to own file `git-url-parser.ts`, rename to `PackageUrlParser` |
| `DependencyResolver` (BFS, "Latest Wins") | Keep, swap download backend |
| `DependencyAnalyzer` (tree, impact) | Keep unchanged |
| `GovernanceValidator` (audit, compliance) | Keep unchanged |
| `semver.ts` (SemVer utilities) | Keep unchanged |

**Verification:** Grep for `exec.*git\s+(clone|ls-remote|fetch|checkout|rev-parse)` in CLI source — zero matches after implementation. Only `git credential fill` allowed.

### Should have (P1)

#### 9. CLI commands (Ink components)

All CLI commands are implemented as **React/Ink components** following the pattern established on the `refactor-cli` branch. Each command is a `.tsx` file that combines service calls with the PRS-011 component library (`Banner`, `Spinner`, `Table`, `StatusMessage`, `KeyValue`, `Divider`).

**Architecture per command:**

```text
commands/install.tsx          ← Ink component (rich mode)
  ├── services/               ← Pure business logic (testable without UI)
  │   ├── package-downloader  
  │   ├── package-cache
  │   └── credential-provider
  └── ui/components/          ← Shared Ink components from PRS-011
      ├── Banner, Spinner, Table, StatusMessage
      ├── KeyValue, Divider, SectionHeader
      └── ThemedGradient, KeyboardHints
```

**Output modes:** Every command supports three output modes (decision D12):

| Mode | Flag | Rendering | Use case |
| ---- | ---- | --------- | -------- |
| Rich | (default) | Full Ink with colors, emoji, spinners, animated banner | Interactive terminal |
| JSON | `--json` | Structured JSON to stdout, bypasses Ink entirely | Tooling, scripts, editors |
| Quiet | `--quiet` / `-q` | Minimal text, errors only | CI pipelines, log-friendly |

Non-rich modes call `runInstall(args, context)` directly (like `runValidate()` on refactor-cli) instead of rendering Ink components.

##### `dlang install`

Resolve all dependencies, download packages, generate/update lock file. This is the **flagship command** — the first thing users run and the visual bar for all future commands.

```bash
dlang install              # Normal install
dlang install --frozen     # CI mode: fail if lock is stale
dlang install --force      # Re-resolve everything, ignore cached
```

**Flow:**

1. Read `model.yaml` — parse dependencies
2. Read `model.lock` (if exists) — load pinned commits
3. For each dependency:
   a. If locked and cached → verify integrity, skip download
   b. If locked but not cached → download at locked commit
   c. If not locked → resolve ref via API, download, add to lock
4. Run transitive resolution (BFS, "Latest Wins", existing `DependencyResolver`)
5. Write `model.lock` with all pinned commits + integrity hashes
6. Report results

**Rich output — installing (Ink `<Spinner>` + streaming status):**

Long-running operations show animated `dots` spinners (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) from `ink-spinner` via the `<Spinner>` component. Each package shows its own progress line that updates in-place:

```text
  ⠸ 🔍 Resolving dependencies...

  ╭──────────────────────────────────────────────╮
  │ ⏳ Installing 3 packages                     │
  ╰──────────────────────────────────────────────╯

  ⠼ 📦 Downloading domainlang/core@v1.0.0... (0.3s)
  ✅ acme/patterns@v2.0.0 → def789a (cached)
  ⠴ 📦 Downloading acme/events@v1.2.0... (0.1s)
```

The `⠸` characters rotate through the braille spinner animation at ~80ms intervals. Each completed package's spinner is replaced with ✅. The `(0.3s)` timer uses the `<LoadingWithTimer>` component with the `useElapsedTime()` hook.

**Rich output — success (Ink `<Banner variant="success">` + `<KeyValue>` + `<Divider>`):**

```text
  ╭──────────────────────────────────────────────╮
  │ ✅ 3 packages installed successfully         │
  ╰──────────────────────────────────────────────╯

  ─── Summary ─────────────────────────────────

    Packages     3 installed, 1 cached
    Lock file    model.lock updated (2 new entries)
    Integrity    SHA-512 verified
    Cache        .dlang/packages/ (12.4 KB)

  ⏳ Completed in 1.34s
```

**Rich output — frozen mode failure (`<Banner variant="error">` + `<List>`):**

```text
  ╭──────────────────────────────────────────────╮
  │ ❌ Lock file is out of sync (--frozen mode)  │
  ╰──────────────────────────────────────────────╯

  Added in model.yaml but missing from lock:
    • acme/new-dep@v1.0.0

  💡 Run 'dlang install' without --frozen to update the lock file.
```

**JSON output (`--json`):**

```json
{
    "success": true,
    "installed": 3,
    "cached": 1,
    "packages": [
        { "name": "domainlang/core", "ref": "v1.0.0", "commit": "abc123d", "cached": false },
        { "name": "acme/patterns", "ref": "v2.0.0", "commit": "def789a", "cached": true }
    ],
    "elapsed": 1.34
}
```

**Ink component structure (`commands/install.tsx`):**

```tsx
export const Install: React.FC<InstallProps> = ({ flags, context }) => {
    const [state, setState] = useState<InstallState>({ status: 'resolving' });
    const elapsed = useElapsedTime();

    useEffect(() => {
        installPackages(flags)
            .then(result => setState({ status: 'success', result }))
            .catch(error => setState({ status: 'error', error: ... }));
    }, [flags]);

    if (state.status === 'resolving')
        return <Spinner label="Resolving dependencies..." emoji="search" />;
    if (state.status === 'downloading')
        return <InstallProgress packages={state.packages} />;
    if (state.status === 'error')
        return <Banner bannerText={`${EMOJI.error}${state.error}`} variant="error" />;

    return (
        <Box flexDirection="column">
            <Banner bannerText={`${EMOJI.success}${state.result.count} packages installed`}
                    variant="success" />
            <Divider title="Summary" />
            <KeyValue data={{ Packages: ..., 'Lock file': ..., Integrity: ... }} />
            <Text color={theme.text.secondary}>{EMOJI.loading}Completed in {elapsed}s</Text>
        </Box>
    );
};
```

##### `dlang add <specifier>`

Add a dependency to `model.yaml` and run install.

```bash
dlang add domainlang/core@v1.0.0         # Tag
dlang add experimental/lib@main           # Branch
dlang add pinned/lib@abc123def            # Commit SHA
dlang add shared --path ../shared         # Local path dependency
dlang add corp/lib@v1.0.0 --source URL   # Non-GitHub (errors for now)
```

**Behavior:**

1. Parse specifier into `owner/repo` and `ref`
2. Validate ref exists via API (HTTP call)
3. Add to `model.yaml` (short form if GitHub, extended if local path)
4. Run `dlang install` to resolve and lock

**Rich output:**

```text
  ⠸ 🔍 Resolving domainlang/core@v1.0.0...
  ⠼ 📦 Downloading domainlang/core@v1.0.0... (0.6s)

  ╭──────────────────────────────────────────────╮
  │ ✅ Added domainlang/core@v1.0.0              │
  ╰──────────────────────────────────────────────╯

  ─── Details ─────────────────────────────────

    Package      domainlang/core
    Ref          v1.0.0 (tag)
    Commit       abc123def456
    Integrity    sha512-K2sFMm...
    Added to     model.yaml, model.lock

  ⏳ Completed in 0.82s
```

##### `dlang remove <name>`

Remove a dependency from `model.yaml` and update lock.

```bash
dlang remove domainlang/core
```

**Behavior:**

1. Remove from `model.yaml` dependencies
2. Remove from `model.lock`
3. Optionally clean cached package from `.dlang/packages/`

**Rich output:**

```text
  ╭──────────────────────────────────────────────╮
  │ ✅ Removed domainlang/core                   │
  ╰──────────────────────────────────────────────╯

    Removed from   model.yaml, model.lock
    Cache          .dlang/packages/domainlang/core/ cleaned

  ⏳ Completed in 0.12s
```

##### `dlang update [name]`

Re-resolve floating refs (branches) to their current HEAD commit.

```bash
dlang update                    # All branch-type dependencies
dlang update experimental/lib   # Specific dependency
```

**Behavior per `refType` in lock file:**

| `refType` | Behavior |
| --------- | -------- |
| `branch` | Re-resolve to current HEAD via API |
| `tag` | Skip (immutable) |
| `commit` | Skip (immutable) |

**Rich output (`<Table>` + `<StatusMessage>`):**

```text
  ⠸ 🔍 Checking branch dependencies...

  ╭──────────────────────────────────────────────────────────────╮
  │ Package             Before       After         Status       │
  │ ────────────────────────────────────────────────────────────│
  │ dev/lib             a1b2c3d  →   f4e5d6c       updated     │
  │ experimental/api    d7e8f9a      d7e8f9a       up to date  │
  ╰──────────────────────────────────────────────────────────────╯

  ✅ 1 package updated, 1 already up to date
  ⏳ Completed in 0.64s
```

##### `dlang upgrade [name[@ref]]`

Upgrade to newer tags. Updates both `model.yaml` and `model.lock`.

```bash
dlang upgrade                              # List all available upgrades
dlang upgrade domainlang/core              # Latest tag for this package
dlang upgrade domainlang/core@v2.0.0       # Explicit new ref
```

**Behavior:**

1. Fetch available tags from GitHub API (`GET /repos/{owner}/{repo}/tags`)
2. Compare current ref against available tags using `semver.ts`
3. Show available upgrades or apply specified upgrade
4. Update `model.yaml` ref and run install

**Rich output — listing upgrades (`<Table>` with color-coded status):**

```text
  ⠸ 🔍 Checking for upgrades...

  ╭──────────────────────────────────────────────────────────────╮
  │ Package             Current     Latest      Available       │
  │ ────────────────────────────────────────────────────────────│
  │ domainlang/core     v1.0.0      v1.3.0      minor ↑        │
  │ acme/patterns       v2.1.0      v2.1.0      up to date     │
  ╰──────────────────────────────────────────────────────────────╯

  💡 Run 'dlang upgrade <package>' to upgrade a specific package.
```

**Rich output — after upgrading:**

```text
  ╭──────────────────────────────────────────────╮
  │ ✅ Upgraded domainlang/core                  │
  │   v1.0.0 → v1.3.0                           │
  ╰──────────────────────────────────────────────╯

  ⏳ Completed in 1.12s
```

##### `dlang outdated`

Show available updates for all dependencies. Read-only — does not modify any files.

```bash
dlang outdated
```

**Rich output (`<Table>` component with semantic coloring):**

```text
  ╭────────────────────────────────────────────────────────────────────╮
  │ Package             Current     Latest      Type                  │
  │ ──────────────────────────────────────────────────────────────────│
  │ domainlang/core     v1.0.0      v1.3.0      tag (minor update)   │
  │ acme/patterns       v2.1.0      v2.1.0      tag (up to date)     │
  │ dev/lib             main        main        branch (5 behind)    │
  │ pinned/lib          abc123      —           commit (pinned)      │
  ╰────────────────────────────────────────────────────────────────────╯

  📊 1 upgrade available, 1 branch behind, 1 pinned
  💡 Run 'dlang upgrade' to apply available upgrades.
```

**JSON output (`--json`):**

```json
{
    "packages": [
        { "name": "domainlang/core", "current": "v1.0.0", "latest": "v1.3.0", "type": "tag", "updateAvailable": true },
        { "name": "dev/lib", "current": "main", "latest": "main", "type": "branch", "commitsBehind": 5 }
    ]
}
```

##### `dlang init`

Scaffold a new DomainLang project. Uses Ink interactive components for the wizard flow (PRS-011 Phase 4).

```bash
dlang init                      # Interactive wizard (current directory)
dlang init my-project           # Create in subdirectory
dlang init --yes                # Accept all defaults (non-interactive)
```

**Rich output — interactive wizard (Ink `useInput` + state machine):**

The `init` command is one of the commands with `BannerContext: 'init'`, so it shows the full ASCII art header with the cyan→blue gradient icon:

```text
  ╭────────────────────────────────────────────────────────────────────────────────────────────────────╮
  │                                                                                                    │
  │  ██╗██╗      ██████╗  ██████╗ ███╗   ███╗ █████╗ ██╗███╗   ██╗██╗      █████╗ ███╗   ██╗ ██████╗  │
  │  ██║╚██╗     ██╔══██╗██╔═══██╗████╗ ████║██╔══██╗██║████╗  ██║██║     ██╔══██╗████╗  ██║██╔════╝  │
  │  ██║ ╚██╗    ██║  ██║██║   ██║██╔████╔██║███████║██║██╔██╗ ██║██║     ███████║██╔██╗ ██║██║  ███╗  │
  │  ██║ ██╔╝    ██║  ██║██║   ██║██║╚██╔╝██║██╔══██║██║██║╚██╗██║██║     ██╔══██║██║╚██╗██║██║   ██║  │
  │  ██║██╔╝     ██████╔╝╚██████╔╝██║ ╚═╝ ██║██║  ██║██║██║ ╚████║███████╗██║  ██║██║ ╚████║╚██████╔╝  │
  │  ╚═╝╚═╝      ╚═════╝  ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝  │
  │                                                                                                    │
  │  DDD Modeling DSL                                                                       v0.1.0    │
  │                                                                                                    │
  ╰────────────────────────────────────────────────────────────────────────────────────────────────────╯

  📝 Create a new DomainLang project

    Project name: my-project
    Entry file:   index.dlang
    Version:      0.1.0

  ⠸ 🚀 Creating project...

  ╭──────────────────────────────────────────────╮
  │ ✅ Project created successfully              │
  ╰──────────────────────────────────────────────╯

  Created files:
    • model.yaml
    • index.dlang
    • .gitignore
    • domains/.gitkeep

  💡 Next steps:
    cd my-project
    dlang validate index.dlang
```

**Generated structure:**

```text
my-project/
├── model.yaml
├── index.dlang
├── .gitignore                  # includes .dlang/
└── domains/
    └── .gitkeep
```

**Generated `model.yaml`:**

```yaml
model:
  name: my-project
  version: 0.1.0
  entry: index.dlang

paths:
  "@": "."
  "@domains": "./domains"

dependencies: {}
```

##### `dlang cache-clear`

Clear the project-local dependency cache.

```bash
dlang cache-clear               # Clear .dlang/packages/
```

Fixes the existing bug where `cacheClear()` clears the wrong directory.

**Rich output:**

```text
  ╭──────────────────────────────────────────────╮
  │ ✅ Cache cleared                             │
  ╰──────────────────────────────────────────────╯

    Removed    .dlang/packages/ (3 packages, 14.2 KB)

  💡 Run 'dlang install' to re-download packages.
```

#### 10. Progress reporting (Ink components)

Long-running operations use the **Ink component library** from `refactor-cli` for real-time visual feedback. The service layer emits structured events; the UI layer renders them through PRS-011 components.

**Event-driven architecture:**

```typescript
/** Structured event from service layer (framework-agnostic). */
type PackageEvent =
    | { type: 'resolving'; pkg: string }
    | { type: 'downloading'; pkg: string; bytesReceived: number; totalBytes?: number }
    | { type: 'extracting'; pkg: string }
    | { type: 'cached'; pkg: string; commit: string }
    | { type: 'complete'; pkg: string; commit: string }
    | { type: 'error'; pkg: string; error: string }
    | { type: 'rate-limit'; remaining: number; resetMinutes: number };
```

Services yield events via callback or async iterator. The Ink command component subscribes and updates React state, which triggers re-renders of the appropriate UI components.

**Ink component mapping:**

| Event | UI component | Visual |
| ----- | ------------ | ------ |
| `resolving` | `<Spinner label="Resolving..." emoji="search" />` | `⠸ 🔍 Resolving domainlang/core@v1.0.0...` |
| `downloading` | `<Spinner label="Downloading..." emoji="package" />` | `⠴ 📦 Downloading acme/patterns (3.4 KB)...` |
| `downloading` (with total) | `<LoadingWithTimer label="..." elapsedSeconds={n} />` | `⠸ 📦 Downloading... (1.2s)` |
| `extracting` | `<Spinner label="Extracting..." emoji="package" />` | `⠸ 📦 Extracting acme/patterns...` |
| `cached` | `<Text>` with success color | `✅ acme/patterns@v2.0.0 → def789a (cached)` |
| `complete` | `<Text>` with success color | `✅ domainlang/core@v1.0.0 → abc123d` |
| `error` | `<StatusMessage type="error">` | `❌ Failed: acme/missing (404)` |
| `rate-limit` | `<Banner isWarning>` | Rate limit warning box with hint |

**Multi-package install progress (`<InstallProgress>` — custom component):**

```text
  ╭──────────────────────────────────────────────╮
  │ ⏳ Installing 4 packages                     │
  ╰──────────────────────────────────────────────╯

  ✅ domainlang/core@v1.0.0 → abc123d
  ✅ acme/patterns@v2.0.0 → def789a (cached)
  ⠸ 📦 Downloading acme/events@v1.2.0... (0.8s)
  ⠴ 🔍 Resolving dev/lib@main...
```

Lines are added as events arrive — the Ink renderer handles incremental updates without flickering (React reconciliation). Each package progresses through: resolving → downloading → extracting → complete.

**Rate limit warning (`<Banner isWarning>`):**

```text
  ╭──────────────────────────────────────────────╮
  │ ⚠️ GitHub API rate limit low                  │
  │   12/60 remaining, resets in 47 minutes      │
  │                                              │
  │   💡 Set GITHUB_TOKEN for 5000 req/hour      │
  ╰──────────────────────────────────────────────╯
```

**Non-rich modes** bypass all Ink rendering. The `--json` mode collects events and outputs a single JSON blob on completion. The `--quiet` mode writes only errors to stderr.

### Could have (future)

#### 11. Non-GitHub host support

Extend `PackageDownloader` with platform-specific strategies (GitLab, Bitbucket, generic) using the archive URL patterns already captured in `GitUrlParser`.

#### 12. Parallel downloads

Download multiple independent packages concurrently using `Promise.all()` with a concurrency limiter. Not needed in first version — DomainLang dependency graphs are small.

#### 13. Offline mode

When network is unavailable and all dependencies are cached, allow install to succeed from cache alone without any HTTP calls.

#### 14. Shell completions

Generate bash/zsh/fish completion scripts for `dlang` commands.

## Non-functional requirements

- **Performance:** `dlang install` with warm cache < 500ms for projects with < 10 dependencies
- **Performance:** First install < 10s for projects with < 10 dependencies on reasonable network
- **Reliability:** Retry on transient errors (429, 5xx, network timeouts)
- **Reliability:** Atomic cache writes prevent corruption from interrupted downloads
- **Security:** No `git clone` or shell string interpolation — only `git credential fill` via `execFile`
- **Security:** SHA-512 integrity verification for all locked dependencies
- **Usability:** Every error message includes an actionable hint
- **Usability:** Rate limit warnings before hitting limits
- **Compatibility:** Node.js 20+ (uses built-in `fetch()`)
- **Compatibility:** Works without git installed (public repos only)
- **Compatibility:** Works with git installed (private repos via credential helpers)

## Out of scope

Explicitly excluded from this PRS:

- **Global cache** — project-local only; these projects are small
- **Non-GitHub hosts** — GitHub only in first iteration
- **Parallel downloads** — dependency graphs are small
- **Offline mode** — deferred to future
- **Shell completions** — deferred to future
- **Standard library (`domainlang/core`)** — separate repository
- **Interactive `dlang query`** — deferred to PRS-011 Phase 4
- **Theme customization** — deferred to PRS-011 future phase

## Visual design

Package management commands showcase the DomainLang CLI's visual identity. This section documents the Ink-based UI that all commands render through, grounded in the actual implementation on the `refactor-cli` branch.

### Brand identity

The CLI uses the **DomainLang icon** — a stylized `I|` glyph derived from the SVG logo — combined with block-character wordmark text. The `AsciiArt.ts` module on `refactor-cli` provides three responsive variants.

**Wide terminal (≥100 columns) — first-run / help:**

The full logo shows the `I|` icon (first 12 characters of each line) next to the "DOMAINLANG" wordmark in large block letters, inside a round-bordered box with the tagline and version below:

```text
  ╭────────────────────────────────────────────────────────────────────────────────────────────────────╮
  │                                                                                                    │
  │  ██╗██╗      ██████╗  ██████╗ ███╗   ███╗ █████╗ ██╗███╗   ██╗██╗      █████╗ ███╗   ██╗ ██████╗  │
  │  ██║╚██╗     ██╔══██╗██╔═══██╗████╗ ████║██╔══██╗██║████╗  ██║██║     ██╔══██╗████╗  ██║██╔════╝  │
  │  ██║ ╚██╗    ██║  ██║██║   ██║██╔████╔██║███████║██║██╔██╗ ██║██║     ███████║██╔██╗ ██║██║  ███╗  │
  │  ██║ ██╔╝    ██║  ██║██║   ██║██║╚██╔╝██║██╔══██║██║██║╚██╗██║██║     ██╔══██║██║╚██╗██║██║   ██║  │
  │  ██║██╔╝     ██████╔╝╚██████╔╝██║ ╚═╝ ██║██║  ██║██║██║ ╚████║███████╗██║  ██║██║ ╚████║╚██████╔╝  │
  │  ╚═╝╚═╝      ╚═════╝  ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝  │
  │                                                                                                    │
  │  DDD Modeling DSL                                                                       v0.1.0    │
  │                                                                                                    │
  ╰────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

**Medium terminal (60–99 columns):**

```text
  ╭──────────────────────────────────╮
  │  ╔══╗                            │
  │  ║I>║  DomainLang        v0.1.0  │
  │  ╚══╝                            │
  ╰──────────────────────────────────╯
```

`I>` must be bold in brand cyan.

**Narrow terminal (<60 columns):**

```text
  I> DomainLang v0.1.0
```
`I>` must be bold in brand cyan.

**Gradient rendering:** The `Header.tsx` component on `refactor-cli` applies a **diagonal gradient** from cyan `#00e5fc` to blue `#027fff` on the icon portion (first 12 characters of each line) using `colorizeDiagonalGradient()`. The wordmark portion ("DOMAINLANG") renders in `theme.text.primary` (near-white `#F8FAFC`). This matches the screenshot where the `I|` icon glows cyan-to-blue while the text is bright white.

The banner context determines when the header shows:

| Context | Trigger | Rendering |
| ------- | ------- | --------- |
| `first-run` | First time CLI is run | Animated reveal (future) |
| `help` | `dlang help`, `dlang --help`, no command | Static banner |
| `init` | `dlang init` | Static banner |
| `none` | All other commands (`install`, `add`, etc.) | No banner — straight to command output |

### Color system

Colors are defined in `ui/themes/colors.ts` as a dynamic theme proxy that responds to the `ThemeManager`. The semantic palette:

| Token | Hex | Usage |
| ----- | --- | ----- |
| `theme.status.success` | `#22C55E` | ✅ Success messages, completed packages |
| `theme.status.error` | `#EF4444` | ❌ Error banners, failed operations |
| `theme.status.warning` | `#F59E0B` | ⚠️ Rate limit warnings, deprecation notices |
| `theme.status.info` | `#00BCD4` | ℹ️ Info messages, spinners |
| `theme.text.primary` | `#F8FAFC` | Primary text |
| `theme.text.secondary` | `#94A3B8` | Secondary text, labels |
| `theme.text.muted` | `#64748B` | Muted text, separators |
| `theme.border.default` | `#64748B` | Box borders |
| `theme.border.focused` | `#00BCD4` | Active/focused borders |
| Brand cyan | `#00e5fc` | Gradient start, icon highlight |
| Brand blue | `#027fff` | Gradient end, icon base |
| Brand magenta | `#EC4899` | Accent, interactive elements |
| Brand yellow | `#FFC107` | Highlights, warning accents |

### Component vocabulary

Every package command composes from this fixed set of PRS-011 components (all implemented on `refactor-cli`):

| Component | When to use | Visual reference |
| --------- | ----------- | ---------------- |
| `<Banner variant="success">` | Operation completed | Green-bordered box: `╭✅ 3 packages installed╮` |
| `<Banner variant="error">` | Operation failed | Red-bordered box: `╭❌ Lock file out of sync╮` |
| `<Banner isWarning>` | Non-blocking warning | Yellow-bordered box: `╭⚠️ Rate limit low╮` |
| `<Spinner label="..." emoji="...">` | Async operation in progress | `⠸ 🔍 Resolving...` (braille dots cycle at ~80ms: `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) |
| `<LoadingWithTimer>` | Long download with elapsed timer | `⠸ 📦 Downloading... (1.2s)` — spinner + `useElapsedTime()` hook |
| `<Table headers rows>` | Tabular data (outdated, upgrade) | Bordered table with header + separator |
| `<KeyValue data>` | Key-value summary | Aligned `Key:  Value` pairs |
| `<List items>` | Bulleted/numbered lists | `• item one` / `1. step one` |
| `<Divider title="...">` | Section break | `─── Summary ────────────────` |
| `<StatusMessage type="error">` | Inline error | `❌ Failed: acme/missing (404)` |
| `<ThemedGradient>` | Brand-colored text | Gradient `cyan → blue` text |
| `<SectionHeader>` | Named section | Styled heading text |

### Emoji vocabulary

All emoji come from `ui/themes/emoji.ts` (never inline strings). Package commands use this subset:

| Key | Emoji | Text fallback | Used in |
| --- | ----- | ------------- | ------- |
| `success` | ✅ | `[OK]` | Completed installs, cache hits |
| `error` | ❌ | `[ERROR]` | Failed downloads, integrity mismatch |
| `warning` | ⚠️ | `[WARN]` | Rate limits, deprecations |
| `info` | ℹ️ | `[INFO]` | Hints, non-blocking messages |
| `loading` | ⏳ | `[...]` | Elapsed time display |
| `search` | 🔍 | `[FIND]` | Resolving refs |
| `package` | 📦 | `[PKG]` | Downloading, extracting |
| `rocket` | 🚀 | `[DONE]` | Project created (init) |
| `tip` | 💡 | `[TIP]` | Actionable hints |
| `chart` | 📊 | `[STATS]` | Summary statistics |
| `pencil` | 📝 | `[EDIT]` | Init wizard |

Text fallbacks (`EMOJI_TEXT`) are used in `--quiet` mode and CI environments that don't render emoji.

### Design tokens

Spacing and borders from `ui/tokens.ts`:

| Token | Value | Usage |
| ----- | ----- | ----- |
| `tokens.spacing.xs` | 1 char | Compact mode padding |
| `tokens.spacing.sm` | 2 chars | Default table padding |
| `tokens.spacing.md` | 4 chars | Section margins |
| `tokens.spacing.lg` | 8 chars | Large layout spacing |
| `tokens.borders.style` | `'round'` | All boxes use `╭╮╰╯` corners |
| `tokens.breakpoints.wide` | 100 cols | Full ASCII art |
| `tokens.breakpoints.medium` | 60 cols | Compact ASCII art |
| `tokens.breakpoints.narrow` | 40 cols | Inline text only |

### Flagship command mockup: `dlang install`

Complete terminal output for a typical 3-package install on a wide terminal. Note that `install` has `BannerContext: 'none'` — the header is NOT shown for non-help commands, keeping output focused.

**In-progress state (animated spinners cycling through `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`):**

```text
  ╭──────────────────────────────────────────────╮
  │ ⏳ Installing 3 packages                     │
  ╰──────────────────────────────────────────────╯

  ✅ domainlang/core@v1.0.0 → abc123d
  ⠼ 📦 Downloading acme/patterns@v2.0.0... (0.8s)
  ⠸ 🔍 Resolving acme/events@v1.2.0...
```

**Completed state:**

```text
  ╭──────────────────────────────────────────────╮
  │ ✅ 3 packages installed successfully         │
  ╰──────────────────────────────────────────────╯

  ─── Summary ─────────────────────────────────

    Packages     3 installed, 0 cached
    Lock file    model.lock created (3 entries)
    Integrity    SHA-512 verified
    Cache        .dlang/packages/ (18.7 KB)

  ─── Packages ────────────────────────────────

    ✅ domainlang/core@v1.0.0 → abc123d
    ✅ acme/patterns@v2.0.0 → def789a
    ✅ acme/events@v1.2.0 → 789bcd0

  ⏳ Completed in 2.41s
```

**First-run experience (`BannerContext: 'first-run'`):**

On the very first `dlang install` (when `isFirstRun()` returns true), the header IS shown with the full logo before the install output:

```text
  ╭────────────────────────────────────────────────────────────────────────────────────────────────────╮
  │                                                                                                    │
  │  ██╗██╗      ██████╗  ██████╗ ███╗   ███╗ █████╗ ██╗███╗   ██╗██╗      █████╗ ███╗   ██╗ ██████╗  │
  │  ██║╚██╗     ██╔══██╗██╔═══██╗████╗ ████║██╔══██╗██║████╗  ██║██║     ██╔══██╗████╗  ██║██╔════╝  │
  │  ██║ ╚██╗    ██║  ██║██║   ██║██╔████╔██║███████║██║██╔██╗ ██║██║     ███████║██╔██╗ ██║██║  ███╗  │
  │  ██║ ██╔╝    ██║  ██║██║   ██║██║╚██╔╝██║██╔══██║██║██║╚██╗██║██║     ██╔══██║██║╚██╗██║██║   ██║  │
  │  ██║██╔╝     ██████╔╝╚██████╔╝██║ ╚═╝ ██║██║  ██║██║██║ ╚████║███████╗██║  ██║██║ ╚████║╚██████╔╝  │
  │  ╚═╝╚═╝      ╚═════╝  ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝  │
  │                                                                                                    │
  │  DDD Modeling DSL                                                                       v0.1.0    │
  │                                                                                                    │
  ╰────────────────────────────────────────────────────────────────────────────────────────────────────╯

  ╭──────────────────────────────────────────────╮
  │ ✅ 3 packages installed successfully         │
  ╰──────────────────────────────────────────────╯

  [... summary as above ...]
```

## Design considerations

### Why HTTP tarball over git clone

| Aspect | git clone | HTTP tarball |
| ------ | --------- | ------------ |
| Runtime dependency | Requires git installed | No git needed (except optional credential retrieval) |
| Download size | Full checkout + `.git` objects | Minimal tarball (no `.git`) |
| Speed | Clone + checkout + rev-parse | Single HTTP request + extract |
| Shell injection risk | URL interpolation into shell commands | No shell involved |
| Authentication | SSH keys, credential helpers | HTTP tokens via API headers |
| Complexity | Subprocess management, error parsing | Standard HTTP + tar extraction |

### Why `git credential fill` for auth (the Go approach)

Go modules delegate authentication entirely to git's credential ecosystem. Users configure credentials once (via `gh auth login`, macOS Keychain, GCM, or `.netrc`), and all tools that speak the git credential protocol benefit.

**Benefits:**

- Zero DomainLang-specific auth configuration
- Works with corporate SSO/SAML if configured in git
- Works with `gh auth setup-git` (GitHub CLI)
- Works with macOS Keychain, Windows Credential Manager
- Works with `.netrc` files
- Env var override (`GITHUB_TOKEN`) for CI

**Compared to alternatives:**

| Approach | Pros | Cons |
| -------- | ---- | ---- |
| `git credential fill` (chosen) | Zero config for users with git | Requires git for private repos |
| Custom `.dlangrc` config file | No git dependency | Yet another auth config to manage |
| OAuth device flow | No pre-configuration | Complex, requires browser |
| Only env vars | Simple | No personal credential reuse |

### Why project-local cache (no global store)

DomainLang models are small (kilobytes of `.dlang` files). The overhead of a global content-addressable store (like pnpm) is not justified:

- No disk pressure from duplicate packages across projects
- Simple mental model: `.dlang/` is like `node_modules/` — delete and regenerate
- No cross-filesystem hard-linking complexity
- CI environments start fresh anyway

### Integrity hash strategy

GitHub does not guarantee tarball byte-stability across archive regenerations. Our approach:

1. **First download:** Compute SHA-512 of the tarball bytes, store in lock file
2. **Subsequent installs:** Re-download (or use cached) and verify hash matches lock
3. **Mismatch:** Error with clear message, `--force` to re-resolve

This detects both tampering and unexpected archive regeneration. The `--force` escape hatch handles legitimate regeneration.

**SRI format:** `sha512-{base64}` matches the Subresource Integrity standard used by npm, pnpm, and browsers.

### Relationship to PRS-010

PRS-010 defined the import system architecture (phases 1–5, 8–12), all of which are implemented. Phase 6 (CLI commands) was planned with `git clone`-based downloads. This PRS **supersedes Phase 6** with:

- HTTP transport instead of git subprocess
- Credential provider via `git credential fill`
- Lock file integrity hashes
- `--frozen` CI mode
- Proper cache management (fixing the `cacheClear()` bug)

The dependency resolution algorithm (BFS, "Latest Wins", cycle detection, overrides) from PRS-010 Phase 5 remains unchanged — only the download transport is replaced.

### Relationship to PRS-011 (co-implementation)

PRS-011 defines the Ink-based CLI UI framework — component library, design tokens, color system, emoji constants, and UX patterns. **This PRS co-implements with PRS-011**, using package management commands as the first real consumers of the Ink component library.

**Dependency chain:**

1. PRS-011 Phase 1 (Foundation) — Ink setup, `tokens.ts`, `colors.ts`, `emoji.ts`, `StatusMessage`, `Spinner`, `Table` components
2. PRS-012 Phase 1 (Foundation services) — `CredentialProvider`, `PackageDownloader`, `PackageCache`
3. PRS-012 Phase 4 (CLI commands) — Ink command components that combine services + UI
4. PRS-011 Phase 2 (Branding) — ASCII art banner, gradient header (enhances `dlang init`)

The service layer (`PackageDownloader`, `PackageCache`, `CredentialProvider`) emits structured events via the `ProgressReporter` interface. The Ink command components (`Install.tsx`, `Add.tsx`, etc.) subscribe to these events and render them through PRS-011's component library. The `--json` and `--quiet` output modes bypass Ink entirely, writing structured JSON or minimal text to stdout.

## Architecture

### Ink UI layer (from `refactor-cli` branch)

The `refactor-cli` branch establishes the Ink application architecture. Package management commands follow this exact pattern:

```text
packages/cli/src/
├── main-ink.ts                      # Entry point: parseArgs → Ink render or non-Ink fallback
├── ui/
│   ├── App.tsx                      # Root component: routes command → component
│   ├── components/                  # PRS-011 shared component library
│   │   ├── AsciiArt.ts             # Responsive logo (wide/medium/narrow)
│   │   ├── Banner.tsx              # Bordered message boxes (success/error/warning/info)
│   │   ├── Spinner.tsx             # Animated dots spinner + LoadingWithTimer
│   │   ├── Table.tsx               # Data tables + KeyValue + List
│   │   ├── StatusMessage.tsx       # Inline status: ✅ ❌ ⚠️ ℹ️ 
│   │   ├── Header.tsx              # ASCII art banner + gradient
│   │   ├── Footer.tsx              # Timing + keyboard hints
│   │   ├── Divider.tsx             # Section dividers: ─── Title ───
│   │   ├── SectionHeader.tsx       # Titled sections
│   │   ├── ThemedGradient.tsx      # Gradient text (cyan → blue)
│   │   └── KeyboardHints.tsx       # [q] quit  [↑↓] navigate
│   ├── themes/
│   │   ├── colors.ts               # Dynamic theme proxy → semantic tokens
│   │   ├── emoji.ts                # EMOJI constants + text fallbacks
│   │   ├── semantic-tokens.ts      # Color palette: text, background, border, ui, status
│   │   └── theme-manager.ts        # Theme state management
│   ├── tokens.ts                   # Spacing (xs/sm/md/lg), borders (round), breakpoints
│   └── hooks/
│       ├── useFirstRun.ts          # First-run detection (animated banner)
│       └── useElapsedTime.ts       # Elapsed timer hook
├── commands/                        # Each command = React component + pure runner
│   ├── types.ts                    # CommandContext, CommandResult, CommandError
│   ├── validate.tsx                # ✅ Already implemented on refactor-cli
│   ├── help.tsx                    # ✅ Already implemented on refactor-cli
│   ├── install.tsx                 # NEW in PRS-012
│   ├── add.tsx                     # NEW in PRS-012
│   ├── remove.tsx                  # NEW in PRS-012
│   ├── update.tsx                  # NEW in PRS-012
│   ├── upgrade.tsx                 # NEW in PRS-012
│   ├── outdated.tsx                # NEW in PRS-012
│   ├── init.tsx                    # NEW in PRS-012
│   └── cache-clear.tsx             # NEW in PRS-012
├── utils/
│   ├── output-mode.ts              # OutputMode: rich | json | quiet
│   └── exit-codes.ts              # Typed exit codes
└── test-utils/
    └── render.tsx                  # Ink test renderer (snapshot + query helpers)
```

**Command dual-export pattern** (established by `validate.tsx` on refactor-cli):

Every command exports two things:

1. **React component** (`<Install>`) — for rich Ink mode
2. **Pure async function** (`runInstall()`) — for JSON/quiet modes (no React)

```typescript
// Rich mode (main-ink.ts)
if (shouldUseInk(config)) {
    render(<App command="install" args={args} context={context} />);
}
// Non-rich mode (main-ink.ts)
else {
    await runInstall(args, context);
}
```

### New services

```text
packages/cli/src/services/
├── credential-provider.ts   # NEW: git credential fill + env var auth
├── package-downloader.ts    # NEW: HTTP tarball download + ref resolution
├── package-cache.ts         # NEW: project-local .dlang/packages/ management
├── package-url-parser.ts    # RENAMED: extracted from git-url-resolver.ts
├── fetch-utils.ts           # NEW: fetchWithRetry with backoff
├── dependency-resolver.ts   # EXISTING: composition change (new download backend)
├── dependency-analyzer.ts   # EXISTING: unchanged
├── governance-validator.ts  # EXISTING: unchanged
├── semver.ts                # EXISTING: unchanged
└── types.ts                 # NEW: PackageEvent, InstallResult, CLI-specific types
```

### Service composition

```text
┌─────────────────────────────────────────────────────────┐
│  Ink Layer (rich mode only)                             │
│  ┌───────────────┐  ┌───────────────┐                  │
│  │ App.tsx        │  │ commands/     │                  │
│  │   routes cmd   │─▶│ install.tsx   │ (React component)│
│  └───────────────┘  │ add.tsx       │                  │
│                      │ outdated.tsx  │                  │
│                      └───────┬───────┘                  │
│                              │ subscribes to events     │
│  ┌──────────────────────┐    │                          │
│  │ ui/components/*      │◀───┘ renders via              │
│  │ Banner, Spinner,     │                               │
│  │ Table, StatusMessage │                               │
│  └──────────────────────┘                               │
└─────────────────────────────────────────────────────────┘
                              │ calls services
                              ▼
┌─────────────────────────────────────────────────────────┐
│  Service Layer (framework-agnostic, pure TypeScript)    │
│  ┌────────────────────┐                                 │
│  │ DependencyResolver │  BFS graph, "Latest Wins"       │
│  │   (EXISTING)       │                                 │
│  └────────┬───────────┘                                 │
│           │ delegates download to                       │
│           ▼                                             │
│  ┌────────────────────┐     ┌──────────────────────┐    │
│  │ PackageDownloader  │────▶│ CredentialProvider    │    │
│  │   (NEW)            │     │   (NEW)              │    │
│  └────────┬───────────┘     └──────────────────────┘    │
│           │ stores via                                  │
│           ▼                                             │
│  ┌────────────────────┐                                 │
│  │ PackageCache       │                                 │
│  │   (NEW)            │                                 │
│  └────────────────────┘                                 │
└─────────────────────────────────────────────────────────┘
```

### Files to delete

| File | Reason |
| ---- | ------ |
| `git-url-resolver.ts` (entire file after extraction) | Replaced by `package-downloader.ts` + `package-url-parser.ts` |

### Shared types (language package)

These types remain in `packages/language/src/services/types.ts` per project convention (single source of truth for shared types):

- `LockFile`
- `LockedDependency` (with `integrity` and `resolved` fields)
- `ModelManifest`, `ManifestDependency`, `ManifestDependencyExtended`
- `DependencyNode`, `DependencyTreeNode`

### New dependency

Add `tar` (by npm/isaacs) to `packages/cli/package.json`:

```json
{
    "dependencies": {
        "tar": "^7.0.0"
    },
    "devDependencies": {
        "@types/tar": "^6.0.0"
    }
}
```

No other new dependencies. Uses Node.js built-in `fetch()` (Node 20+).

## Implementation plan

> **Prerequisite:** PRS-011 Phase 1 (Foundation) must be completed first — this provides the Ink framework, component library (`Banner`, `Spinner`, `Table`, `StatusMessage`, `KeyValue`, `Divider`), design tokens (`colors.ts`, `emoji.ts`, `tokens.ts`), and the dual-mode entry point (`main-ink.ts`, `output-mode.ts`). The `refactor-cli` branch has this work in progress.

### Phase 0: Merge refactor-cli foundation (prerequisite) ✅ COMPLETE

**Goal:** Land the Ink foundation from `refactor-cli` branch onto `main`

| # | Task | Branch/files | Status |
| - | ---- | ------------ | ------ |
| 0.1 | Complete and merge `refactor-cli` branch (PRS-011 Phase 1) | `refactor-cli` → `main` | ✅ Done |
| 0.2 | Verify `main-ink.ts` entry point works | `bin/cli.js` → `main-ink.js` | ✅ Done |
| 0.3 | Verify `validate` and `help` commands work in all 3 output modes | `commands/validate.tsx`, `help.tsx` | ✅ Done |
| 0.4 | Ensure design tokens, themes, and component library are stable | `ui/themes/*`, `ui/components/*` | ✅ Done |

**Acceptance criteria:**

- [x] `dlang validate` works with rich, `--json`, and `--quiet` modes
- [x] Component library exports: `Banner`, `Spinner`, `Table`, `KeyValue`, `List`, `StatusMessage`, `Divider`, `SectionHeader`, `ThemedGradient`, `KeyboardHints`
- [x] Design tokens: `colors.ts` (theme proxy), `emoji.ts` (EMOJI + EMOJI_TEXT), `tokens.ts` (spacing, borders, breakpoints)
- [x] `test-utils/render.tsx` provides snapshot testing for Ink components

**Completed:** 2026-02-05 - Merged via commit 259adc4

### Phase 1: Foundation services (week 1)

**Goal:** Build the three core services with tests (pure TypeScript, no UI)

| # | Task | New file | Tests |
| - | ---- | -------- | ----- |
| 1.1 | Create `CredentialProvider` service | `services/credential-provider.ts` | `credential-provider.test.ts` |
| 1.2 | Create `PackageDownloader` service | `services/package-downloader.ts` | `package-downloader.test.ts` |
| 1.3 | Create `PackageCache` service | `services/package-cache.ts` | `package-cache.test.ts` |
| 1.4 | Create `fetchWithRetry` utility | `services/fetch-utils.ts` | `fetch-utils.test.ts` |
| 1.5 | Add `tar` dependency to `package.json` | `package.json` | — |
| 1.6 | Define `PackageEvent` union type and service types | `services/types.ts` | — |

**Acceptance criteria:**

- [ ] `CredentialProvider` returns credentials from env vars and mocked `git credential fill`
- [ ] `PackageDownloader` downloads and extracts tarballs from mocked HTTP responses
- [ ] `PackageDownloader` resolves refs to commit SHAs via mocked API
- [ ] `PackageDownloader` emits `PackageEvent` callbacks during operations
- [ ] `PackageCache` performs atomic writes and cache lookups
- [ ] `fetchWithRetry` retries on 429/5xx with backoff
- [ ] All services have >80% test coverage

### Phase 2: Git protocol removal and wiring (week 1–2)

**Goal:** Replace `GitUrlResolver` with new services, remove git subprocess code

| # | Task | Files | Tests |
| - | ---- | ----- | ----- |
| 2.1 | Extract `GitUrlParser` to `package-url-parser.ts` | New file, delete old | Update imports |
| 2.2 | Refactor `DependencyResolver` to use `PackageDownloader` + `PackageCache` | `dependency-resolver.ts` | `dependency-resolver.test.ts` |
| 2.3 | Delete `GitUrlResolver` class | `git-url-resolver.ts` | Remove/update tests |
| 2.4 | Update barrel exports | `services/index.ts` | — |
| 2.5 | Verify zero git subprocess calls remain (except credential fill) | grep check | — |

**Acceptance criteria:**

- [ ] `DependencyResolver` tests pass with new download backend
- [ ] No `git clone`, `git ls-remote`, `git fetch` in codebase
- [ ] Existing resolution tests (BFS, "Latest Wins", cycles, overrides) unchanged and passing

### Phase 3: Lock file hardening (week 2)

**Goal:** Add integrity hashes and `--frozen` mode

| # | Task | Files | Tests |
| - | ---- | ----- | ----- |
| 3.1 | Compute SHA-512 on download, store in lock entry | `package-downloader.ts` | `package-downloader.test.ts` |
| 3.2 | Verify integrity on install | `services/install-pipeline.ts` | `install.test.ts` |
| 3.3 | Implement `--frozen` flag | `services/install-pipeline.ts` | `install-frozen.test.ts` |
| 3.4 | Support `DLANG_FROZEN=1` env var | `services/install-pipeline.ts` | `install-frozen.test.ts` |
| 3.5 | Implement `--force` flag | `services/install-pipeline.ts` | `install-force.test.ts` |

**Acceptance criteria:**

- [ ] Lock entries include `integrity: "sha512-..."` after install
- [ ] Integrity mismatch produces clear error
- [ ] `--frozen` fails when lock is stale
- [ ] `--force` re-resolves everything

### Phase 4: Ink command components (week 2–3)

**Goal:** Implement all CLI commands as Ink React components + pure runners

Each command follows the dual-export pattern from `validate.tsx`:

- `<CommandName>` React component for rich mode (uses `<Banner>`, `<Spinner>`, `<Table>`, `<KeyValue>`, `<Divider>`)
- `runCommandName()` async function for JSON/quiet modes

| # | Task | Files | Tests |
| - | ---- | ----- | ----- |
| 4.1 | `<Install>` component + `runInstall()` | `commands/install.tsx` | `install.test.ts` + `install.snapshot` |
| 4.2 | `<Add>` component + `runAdd()` | `commands/add.tsx` | `add.test.ts` + `add.snapshot` |
| 4.3 | `<Remove>` component + `runRemove()` | `commands/remove.tsx` | `remove.test.ts` |
| 4.4 | `<Update>` component + `runUpdate()` | `commands/update.tsx` | `update.test.ts` |
| 4.5 | `<Upgrade>` component + `runUpgrade()` | `commands/upgrade.tsx` | `upgrade.test.ts` |
| 4.6 | `<Outdated>` component + `runOutdated()` | `commands/outdated.tsx` | `outdated.test.ts` + `outdated.snapshot` |
| 4.7 | `<Init>` component + `runInit()` (interactive wizard) | `commands/init.tsx` | `init.test.ts` + `init.snapshot` |
| 4.8 | `<CacheClear>` component + `runCacheClear()` | `commands/cache-clear.tsx` | `cache-clear.test.ts` |
| 4.9 | `<InstallProgress>` shared component (multi-package streaming) | `ui/components/InstallProgress.tsx` | `install-progress.snapshot` |
| 4.10 | Route all new commands in `App.tsx` | `ui/App.tsx` | — |
| 4.11 | Add non-Ink runners to `main-ink.ts` | `main-ink.ts` | — |

**Testing approach:** Use `test-utils/render.tsx` from refactor-cli for Ink component snapshot testing. Service logic is tested separately (Phase 1–3). Component tests verify rendering states (loading → success/error) with mocked services.

**Acceptance criteria:**

- [ ] All 8 commands work in rich mode (Ink components)
- [ ] All 8 commands work in `--json` mode (structured output)
- [ ] All 8 commands work in `--quiet` mode (minimal output)
- [ ] `<Install>` shows streaming progress with `<Spinner>` per package
- [ ] `<Outdated>` renders dependency table with `<Table>` component
- [ ] `<Init>` shows ASCII art banner on first run
- [ ] Snapshot tests capture expected terminal output for key states
- [ ] Error states show `<Banner variant="error">` with actionable hints

### Phase 5: Testing and documentation (week 3)

**Goal:** Integration tests, error path coverage, site docs

| # | Task | Files | Tests |
| - | ---- | ----- | ----- |
| 5.1 | Integration test: full install → cache → verify flow | `test/integration/` | New |
| 5.2 | Test: auth failure → clear error with `<StatusMessage type="error">` | `test/` | New |
| 5.3 | Test: rate limit handling → `<Banner isWarning>` | `test/` | New |
| 5.4 | Test: offline with warm cache | `test/` | New |
| 5.5 | Update site/guide/cli.md with new commands and visual examples | `site/guide/cli.md` | — |
| 5.6 | Update site/guide/imports.md (auth section) | `site/guide/imports.md` | — |
| 5.7 | Update PRS-010 Phase 6 status to "Superseded by PRS-012" | `requirements/010-...md` | — |

**Acceptance criteria:**

- [ ] All 518+ existing tests still pass
- [ ] New tests cover: download, cache, auth, retry, frozen, integrity
- [ ] Ink component snapshots cover: success, error, loading, rate-limit states
- [ ] Documentation covers: `--frozen`, `--force`, credentials, no-git usage
- [ ] Site has terminal screenshots/mockups of key command outputs
- [ ] PRS-010 Phase 6 marked as superseded

## Implementation summary

| Phase | Duration | Key deliverable |
| ----- | -------- | --------------- |
| 0. Merge refactor-cli | Prerequisite | Ink framework, component library, design tokens on `main` |
| 1. Foundation services | 1 week | `CredentialProvider`, `PackageDownloader`, `PackageCache` |
| 2. Git removal + wiring | 3–4 days | Zero git subprocess calls (except credential fill) |
| 3. Lock hardening | 2–3 days | Integrity hashes, `--frozen`, `--force` |
| 4. Ink command components | 1 week | 8 Ink commands + streaming progress + snapshot tests |
| 5. Testing + docs | 3–4 days | Integration tests, site docs with visual examples |

**Total estimated duration:** 3–4 weeks (after Phase 0 prerequisite)

## Decisions log

| # | Decision | Rationale |
| - | -------- | --------- |
| D1 | HTTP tarball over git clone | Eliminates git as runtime dependency; faster; no shell injection risk |
| D2 | `git credential fill` for auth | Zero-config for users with existing git credentials (Go-style); env var override for CI |
| D3 | Project-local cache only (no global) | Models are small (KB); simplicity wins; same as `node_modules/` pattern |
| D4 | GitHub only (no GitLab/Bitbucket) | Matches PRS-010 scope; other hosts deferred to future PRS |
| D5 | SHA-512 integrity hashed on first download | GitHub doesn't guarantee archive byte-stability; we lock OUR download; `--force` re-resolves |
| D6 | JSON lock format retained | No breaking change; machine-friendly; already implemented in PRS-010 |
| D7 | `tar` npm package as new dependency | Standard Node.js tar extractor; avoids platform-specific CLI differences |
| D8 | Shared types stay in language package | Single source of truth per project convention (`types.ts`) |
| D9 | `--frozen` for CI | Standard practice (pnpm `--frozen-lockfile`, npm `ci`); prevents silent version drift |
| D10 | Supersede PRS-010 Phase 6 only | Phases 1–5, 8–12 are implemented and valid; only the CLI transport layer changes |
| D11 | Co-implement Ink UI with PRS-011 | Package commands are the first user-facing feature; they set the visual bar for the CLI. Building services without UI wastes the opportunity to validate the component library early. |
| D12 | Output modes: rich (default), `--json`, `--quiet` | Rich mode uses Ink components; JSON mode bypasses Ink for tooling; quiet mode for CI. Same pattern as pnpm/turbo. |
| D13 | Base on `refactor-cli` branch Ink foundation | The branch has a complete component library, design tokens, dual-mode entry point, and snapshot test utilities. Building on this avoids reinventing the UI layer. |
| D14 | Each command = `.tsx` component + pure runner function | Dual-export pattern from `validate.tsx`: React component for rich mode, async function for JSON/quiet. Clean separation of UI and logic. |

## Acceptance testing

### Scenario 1: First install (public repo, no git)

```bash
# Preconditions: git is NOT installed, no GITHUB_TOKEN
cat model.yaml
# dependencies:
#   domainlang/core: v1.0.0

dlang install
```

**Expected:** Downloads `domainlang/core` via HTTP, creates `.dlang/packages/domainlang/core/{sha}/`, generates `model.lock` with integrity hash.

### Scenario 2: Frozen install in CI

```bash
DLANG_FROZEN=1 dlang install
```

**Expected (lock in sync):** Downloads packages, verifies integrity, exits 0.  
**Expected (lock stale):** Exits 1 with clear error listing mismatches.

### Scenario 3: Private repo with `gh auth`

```bash
# Preconditions: gh auth login completed, gh auth setup-git run
cat model.yaml
# dependencies:
#   acme/private-models: v1.0.0

dlang install
```

**Expected:** `git credential fill` returns credentials from `gh auth`, tarball downloads succeed with Bearer token.

### Scenario 4: Integrity mismatch

```bash
# Manually edit model.lock integrity hash to wrong value
dlang install
```

**Expected:** Error: `Integrity check failed for 'domainlang/core'` with hint to use `--force`.

### Scenario 5: Add and remove dependency

```bash
dlang add acme/new-dep@v2.0.0
# → model.yaml updated, model.lock updated, package cached

dlang remove acme/new-dep
# → model.yaml updated, model.lock updated
```

### Scenario 6: Update branch dependency

```bash
cat model.lock | grep refType
# "refType": "branch"

dlang update
```

**Expected:** Re-resolves branch to current HEAD commit via API. Tags and commits skipped.

### Scenario 7: Outdated check

```bash
dlang outdated
```

**Expected:** Table showing current vs latest refs for all dependencies, with ref type context.

### Scenario 8: Rate limit handling

```bash
# Trigger rate limiting (60 requests/hour unauthenticated)
dlang install
```

**Expected:** Warning about low rate limit. On 429, retries with backoff. Hint to set `GITHUB_TOKEN`.

---

**Author:** Software Architect  
**Created:** 2026-02-05  
**Supersedes:** PRS-010 Phase 6 (CLI Commands)  
**Related PRSs:** PRS-010 (Import System), PRS-011 (Modern CLI Experience)
