# dsh-thinkbar

English | [中文](README.zh.md)

`dsh-thinkbar` is a Web UI plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It turns the model selector in the composer into a reasoning-wait indicator while the current assistant turn is waiting for or streaming reasoning.

The indicator starts at 8%, fills toward 100% over 20 seconds with an ease-out curve, and moves through the Harness info blue, red, orange, and yellow. When reasoning ends it drains in 240 ms. Switching sessions clears the previous indicator, and reduced-motion mode skips the drain and particle motion.

## Requirements

- DeepSeek Harness source commit `6d7ae5a` (its package manifests still identify themselves as `0.1.1-rc.2`)
- The DSH `web` profile
- Node.js `^22.19.0` or `>=24.0.0`

This release candidate intentionally supports only that source contract. Harness is still a developer preview and its client plugin APIs may change.

> **Release blocked:** do not publish or install this package from npm yet. The source checkout at commit `6d7ae5a` still reports `0.1.1-rc.2`, but the npm artifacts with that version predate the required `waitOrigin`, `streamTime`, and `conversation.input.model.decoration` contracts. The package remains `private` until DeepSeek publishes a distinct compatible version or this project selects a compatible Harness fork distribution.

## Install

After a compatible DSH release is selected and this package is published:

```sh
dsh plugin --profile web add dsh-thinkbar
```

Restart the running Web Profile after installation. Bundle changes are applied only when the profile starts.

To verify that the bundle layer and Loader row were added:

```sh
dsh --profile web --dump-config
```

The output should contain a `dsh-thinkbar` row.

## Upgrade

Install the desired version explicitly, then restart the profile:

```sh
dsh plugin --profile web add dsh-thinkbar@0.1.0
```

## Uninstall

```sh
dsh plugin --profile web remove dsh-thinkbar
```

Restart the Web Profile after removal.

## Behavior

The plugin is active only when the visible session has a `waitOrigin` and its streaming tail is empty or a reasoning block. Text tails, tool calls, tool execution, thinking-off requests, and other sessions leave the indicator idle.

It has no settings and performs no host-side work. It does not change prompts, messages, schemas, tools, provider requests, or KV-cache behavior. It sends no telemetry and uploads no data.

## Troubleshooting

- **The indicator does not appear after installation:** restart the DSH Web Profile and confirm `dsh-thinkbar` appears in `dsh --profile web --dump-config`.
- **The client bundle fails to load:** confirm that DSH is exactly `0.1.1-rc.2`, reinstall the package, restart the profile, and inspect the browser console and DSH stderr.
- **The plugin installs as a dependency but is not enabled:** inspect the installed package and confirm its `cordis.patch.yml` is present. Official `dsh-thinkbar` tarballs include the Bundle declaration and patch.
- **No fill appears during a response:** the fill is shown only during the reasoning-wait window and only in the Web composer model seat.

## Development

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm pack
```

`pnpm verify` runs TypeScript checking, unit and component tests, the standalone DSH client bundle build, tarball-contract checks, and `publint`.

The browser artifact is a DSH lazy-CJS factory rather than a normal application module. Do not replace its `window.__ModuleLoader__.load(...)` envelope with a conventional ESM bundle.

See [the publishing research](docs/research/dsh-plugin-publishing.md) for the Bundle/Profile and client-module contracts used by this package.

## License and attribution

MIT. The reasoning indicator was extracted from the DeepSeek Harness codebase at commit `6d7ae5aa57b4dedfc03b09de7cafb65c01338800`. DeepSeek Harness is Copyright (c) 2026 DeepSeek and distributed under the MIT License. Independent packaging and subsequent modifications are maintained by the `dsh-thinkbar` contributors.
