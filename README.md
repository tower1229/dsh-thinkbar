<div align="center">

# 🧠 dsh-thinkbar

**Dynamic reasoning-wait visual indicator for DeepSeek Harness Web Composer**

[![npm version](https://img.shields.io/npm/v/dsh-thinkbar.svg?style=flat-square)](https://www.npmjs.com/package/dsh-thinkbar)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![DSH Compatibility](https://img.shields.io/badge/DSH-0.1.2--alpha.4-8a2be2?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178c6?style=flat-square)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.19.0-brightgreen.svg?style=flat-square)](https://nodejs.org)

<p align="center">
  <b>English</b> | <a href="README.zh.md">简体中文</a>
</p>

<br>

<img src="assets/思考指示器演示.gif" alt="dsh-thinkbar Demo" width="760" style="border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.1);" />

</div>

---

`dsh-thinkbar` is a lightweight, non-intrusive Web UI plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It fills the existing model selector with a dynamic thermal gradient during each assistant Step's model-thinking window, and overlays a separate Tool activity treatment while that Step's tools execute.

## ✨ Key Features

- 🌡️ **Thermal Iron Scale Palette**: Smooth transition from initial Harness info blue (0s) through red (~6.7s), orange (~13.3s), and glowing gold (20s) with an ease-out progression curve.
- ⚡ **Zero-Intrusion Portal Adapter**: Injects through the public `conversation.input.right` Slot lifecycle without hacking DSH internals, generated CSS classes, or model label strings.
- 🎯 **Model-Compatible Per-Step State Machine**: Starts with each model request, follows explicit `reasoning` chunks when available, and switches exclusively to Tool activity when a call begins.
- 🛠️ **Visible Tool Activity**: Uses a distinct violet/cyan sweep and temporarily overlays the names of every currently executing Tool.
- 💨 **Fluid Drain Animation**: Drains smoothly in 240ms when reasoning yields to text, tool calls, or message completion.
- ♿ **Accessibility Ready**: Fully respects `prefers-reduced-motion` settings.
- 🔒 **100% Client-Side & Private**: Zero backend modifications, zero telemetry, zero external network traffic.

---

## 📋 Requirements

| Dependency | Required Version | Note |
| :--- | :--- | :--- |
| **DeepSeek Harness** | `0.1.2-alpha.4` | Supports the current lazy-target Conversation lifecycle |
| **Profile** | Standard DSH `web` Profile | Official model-selection plugin enabled |
| **Node.js** | `^22.19.0` \|\| `>=24.0.0` | Recommended LTS |
| **Package Manager** | `pnpm` (>= 9.0) | Standard DSH workflow |

> [!IMPORTANT]
> This release supports exactly `0.1.2-alpha.4`. Earlier builds used different Conversation target lifecycles and are not supported.

---

## 🚀 Quick Start

### Installation

Install via npm registry:

```sh
pnpm dsh plugin --profile web add dsh-thinkbar
```

Or test a local release tarball:

```sh
pnpm dsh plugin --profile web add ./dsh-thinkbar-<version>.tgz
```

Restart your DSH Web Profile after installation:

```sh
pnpm dsh web
```

Verify that `dsh-thinkbar` is loaded:

```sh
pnpm dsh --profile web --dump-config
```
*(The output must contain exactly one `dsh-thinkbar` row)*

### Upgrade & Uninstall

```sh
# Upgrade to a specific version
pnpm dsh plugin --profile web add dsh-thinkbar@<version>

# Uninstall plugin
pnpm dsh plugin --profile web remove dsh-thinkbar
```

---

## 🔍 How It Works

```text
[ step/start ] ──> Start Thinking Fill (8% -> 100%, 0s -> 20s)
       │
[ assistant/chunk: reasoning ] ──> Continue Thinking Fill
       │                              │
       │                              └──> Palette: Blue -> Red -> Orange -> Yellow
       │
[ text / step/end ] ──────────────> Fast Drain (240ms) -> Return to Idle

[ assistant tool-call / tool/call ] ──> Stop Thinking Clock + Fast Drain (240ms)
                   │
                   └──> After 200ms, show violet/cyan Tool sweep + name overlay
                                      │
[ final matching tool/result ] ───────┴──> Return to Idle until next step/start
```

1. **State Projection**: Derives mutually exclusive Thinking and Tool phases for each `{ turn, step }` from the public `ctx.uiConversation.events` and `ctx.uiConversation.views` registries. Parallel Tools remain paired independently by call ID, while the Thinking clock stays stopped for the rest of that Step.
2. **Anchor & Portal**: Anchors in `conversation.input.right`, identifies the trailing `button[aria-haspopup="menu"]` within `[data-composer-card]`, and portals an isolated plugin layer.
3. **Safety Fallback**: If the model trigger cannot be identified uniquely, the DOM remains untouched with a single console notice:
   ```text
   [dsh-thinkbar] Could not uniquely identify the DeepSeek Harness model selector; the indicator is disabled.
   ```

---

## 🛠️ Troubleshooting

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| **No visual changes after install** | Profile not restarted or bundle unlinked | Restart Web Profile and verify with `pnpm dsh --profile web --dump-config`. |
| **Client bundle load failure** | DSH version mismatch | Ensure DSH is `0.1.2-alpha.4`. Inspect browser console and host stderr. |
| **Compatibility warning in console** | Missing or conflicting model trigger | Ensure official model-selection plugin is enabled without conflicting custom buttons. |
| **Thinking fill does not light up** | No active model Step reached the client projection | Inspect the browser console and verify the Conversation target subscription. Tool execution uses its separate activity treatment. |
| **Changes persist after removal** | Cached Profile process | Restart the Profile after `pnpm dsh plugin --profile web remove dsh-thinkbar`. |

---

## 🧑‍💻 Development

```sh
# Install dependencies
pnpm install --frozen-lockfile

# Run typecheck, unit tests, build validation & publint
pnpm verify

# Pack local tarball
pnpm pack
```

### Release Pipeline

```sh
# One-command automated publish suite
npm run publish

# Dry-run validation without publishing
npm run publish -- --dry-run
```

The browser artifact is a DSH lazy-CJS factory. Always preserve its `window.__ModuleLoader__.load(...)` envelope.

### Contributor References
- [Upstream-compatible reasoning indicator research](docs/research/upstream-reasoning-indicator.md)
- [DSH plugin publishing research](docs/research/dsh-plugin-publishing.md)

---

## 📄 License and Attribution

[MIT License](LICENSE)

The original reasoning indicator design was extracted from DeepSeek Harness commit `6d7ae5aa57b4dedfc03b09de7cafb65c01338800`. DeepSeek Harness is Copyright (c) 2026 DeepSeek and distributed under the MIT License. Independent packaging and subsequent modifications are maintained by the `dsh-thinkbar` contributors.
