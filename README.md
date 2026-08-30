# dsh-thinkbar

English | [中文](README.zh.md)

`dsh-thinkbar` is a Web UI plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It fills the existing model selector while the visible assistant Step is streaming reasoning.

![Demo](assets/思考指示器演示.gif)

The indicator starts at 8%, fills toward 100% over 20 seconds with an ease-out curve, and moves through Harness info blue, red, orange, and yellow. It drains in 240 ms when text, a Tool call, the final message, or the Step boundary ends reasoning. Session changes clear the previous indicator, and reduced-motion mode skips the drain and particle movement.

## Requirements

- DeepSeek Harness source build `0.1.2-alpha.1`
- The standard DSH `web` Profile with the official model-selection plugin
- Node.js `^22.19.0` or `>=24.0.0`

This release supports exactly `0.1.2-alpha.1`. That Harness version is currently a source-build target rather than a published npm release. Earlier RCs used different Conversation services and are not supported.

## Install

After the package is published:

```sh
pnpm dsh plugin --profile web add dsh-thinkbar
```

To test a local release tarball instead:

```sh
pnpm dsh plugin --profile web add ./dsh-thinkbar-<version>.tgz
```

Restart the Web Profile after installation. Bundle changes are applied when the Profile starts. Verify the Bundle layer and Loader row with:

```sh
pnpm dsh --profile web --dump-config
```

The output must contain exactly one `dsh-thinkbar` row.

## Upgrade and uninstall

Install the desired version explicitly, then restart:

```sh
pnpm dsh plugin --profile web add dsh-thinkbar@<version>
```

Remove the plugin and restart the Profile:

```sh
pnpm dsh plugin --profile web remove dsh-thinkbar
```

## How it works

The plugin derives `{ waitOrigin, streamTime, active, tailKind }` from the public `ctx.uiConversation.events` and `ctx.uiConversation.views` registries. A `step/start` records the clock without displaying anything; the first reasoning block activates the fill. Direct text and Tool-only responses never flash the indicator.

The original Harness does not provide an additive child Slot inside the model selector. The plugin therefore registers a lifecycle anchor in the public `conversation.input.right` Slot, identifies the single following semantic `button[aria-haspopup="menu"]` inside `[data-composer-card]`, and portals one plugin-owned layer into it. It does not depend on generated class names, model labels, localization, React internals, or the button's child structure.

If the model trigger cannot be identified uniquely, the plugin leaves the DOM unchanged and emits one browser-console compatibility warning:

```text
[dsh-thinkbar] Could not uniquely identify the DeepSeek Harness model selector; the indicator is disabled.
```

There are no settings. The plugin has no Host behavior and does not change prompts, messages, schemas, tools, provider requests, or KV-cache behavior. It sends no telemetry and uploads no data.

## Troubleshooting

- **Nothing changes after installation:** restart the Web Profile and confirm `dsh-thinkbar` appears in `pnpm dsh --profile web --dump-config`.
- **The client bundle fails to load:** verify the DSH source build is exactly `0.1.2-alpha.1`, reinstall, restart, and inspect the browser console and Host stderr.
- **A compatibility warning appears:** confirm the official model-selection plugin is enabled and no other plugin has added another menu trigger after `conversation.input.right`.
- **No fill appears for a response:** the indicator activates only after the first reasoning event. Direct text or Tool-only output intentionally remains idle.
- **Removal appears ineffective:** restart the Profile after `pnpm dsh plugin --profile web remove dsh-thinkbar`.

## Development

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm pack
```

`pnpm verify` runs TypeScript checking, unit/component tests, the standalone DSH client build, tarball-contract checks, and `publint`.

### Publishing

Log in to npm once with `npm login`. Every release after that is a single command:

```sh
npm run publish
```

The release script verifies the npm identity, keeps the current version when it is still unpublished or increments the patch version when it already exists, runs the complete verification suite, packs one release tarball, writes its SHA-256 checksum, publishes that exact tarball, and verifies its registry integrity. Release files are written to `.smoke/release/`. It deliberately does not commit, tag, or push Git changes.

Exercise the complete flow without publishing:

```sh
npm run publish -- --dry-run
```

The browser artifact is a DSH lazy-CJS factory, not an ordinary application module. Preserve its exact `window.__ModuleLoader__.load(...)` envelope.

Contributor references:

- [Upstream-compatible reasoning indicator research](docs/research/upstream-reasoning-indicator.md)
- [DSH plugin publishing research](docs/research/dsh-plugin-publishing.md)

Contributions should include focused tests, pass `pnpm verify`, and verify the packed tarball against a clean DSH `0.1.2-alpha.1` Web Profile when changing event, Slot, DOM-adapter, or bundle behavior.

## License and attribution

MIT. The original reasoning indicator was extracted from DeepSeek Harness commit `6d7ae5aa57b4dedfc03b09de7cafb65c01338800`. DeepSeek Harness is Copyright (c) 2026 DeepSeek and distributed under the MIT License. Independent packaging and subsequent modifications are maintained by the `dsh-thinkbar` contributors.
