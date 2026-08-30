# dsh-thinkbar

[English](README.md) | 中文

`dsh-thinkbar` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Web UI 插件。当前可见助手 Step 正在流式输出 reasoning 时，它会填充现有模型选择器作为思考指示器。

指示器从 8% 起步，在 20 秒内按 ease-out 曲线填满，并沿 Harness info blue、红、橙、黄变化。reasoning 转为正文或 Tool call、助手消息完成或 Step 结束后，填充在 240ms 内抽空。切换会话会清除旧指示器；reduced-motion 模式会跳过抽空和粒子运动。

## 运行要求

- DeepSeek Harness 源码版 `0.1.2-alpha.1`
- 启用官方模型选择插件的标准 DSH `web` Profile
- Node.js `^22.19.0` 或 `>=24.0.0`

当前版本只兼容 `0.1.2-alpha.1`。该 Harness 版本目前是源码构建目标，并未作为完整 npm 版本发布；早期 RC 使用不同的 Conversation service，不再支持。

## 安装

发布后从 npm 安装：

```sh
pnpm dsh plugin --profile web add dsh-thinkbar
```

也可以安装本地 release tarball：

```sh
pnpm dsh plugin --profile web add ./dsh-thinkbar-<version>.tgz
```

安装后重启 Web Profile；Bundle 变更会在 Profile 启动时生效。验证 Bundle layer 和 Loader row：

```sh
pnpm dsh --profile web --dump-config
```

输出中必须恰好包含一个 `dsh-thinkbar` row。

## 升级和卸载

显式安装目标版本，然后重启：

```sh
pnpm dsh plugin --profile web add dsh-thinkbar@<version>
```

删除插件后重启 Profile：

```sh
pnpm dsh plugin --profile web remove dsh-thinkbar
```

## 工作原理

插件通过公开的 `ctx.uiConversation.events` 和 `ctx.uiConversation.views` registry 推导 `{ waitOrigin, streamTime, active, tailKind }`。`step/start` 只记录时钟，不立即显示；首个 reasoning block 才激活填充。直接输出正文或仅输出 Tool 的响应不会闪现指示器。

原版 Harness 没有模型选择器内部的 additive child Slot。因此插件在公开的 `conversation.input.right` Slot 注册生命周期锚点，在 `[data-composer-card]` 内识别锚点之后唯一的语义按钮 `button[aria-haspopup="menu"]`，并用 Portal 插入一个插件自有填充层。它不依赖生成的 class、模型文案、本地化、React 私有字段或按钮内部子结构。

如果无法唯一识别模型按钮，插件不会修改 DOM，只在浏览器 console 输出一次兼容性告警：

```text
[dsh-thinkbar] Could not uniquely identify the DeepSeek Harness model selector; the indicator is disabled.
```

插件没有设置项和 Host 行为，不会改变 prompt、消息、schema、工具、模型请求或 KV Cache，不包含遥测，也不会上传数据。

## 故障排查

- **安装后没有变化：**重启 Web Profile，并确认 `pnpm dsh --profile web --dump-config` 中存在 `dsh-thinkbar`。
- **client bundle 加载失败：**确认 DSH 源码版本精确为 `0.1.2-alpha.1`，重新安装并重启，然后检查浏览器 console 和 Host stderr。
- **出现兼容性告警：**确认已启用官方模型选择插件，并且没有其他插件在 `conversation.input.right` 后增加菜单按钮。
- **响应期间没有填充：**指示器只在首个 reasoning 事件出现后激活；直接正文或仅 Tool 输出保持 idle。
- **卸载后仍显示：**执行 `pnpm dsh plugin --profile web remove dsh-thinkbar` 后必须重启 Profile。

## 本地开发

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm pack
```

`pnpm verify` 会执行 TypeScript 检查、单元与组件测试、独立 DSH client 构建、tarball 契约检查和 `publint`。

### 发布

首次使用前执行一次 `npm login`。之后每次发布只需：

```sh
npm run publish
```

发布脚本会检查 npm 身份；当前版本未发布时直接使用，已存在时自动递增 patch 版本；然后执行完整验证、生成唯一 release tarball 及 SHA-256 checksum、发布该 tarball，并回读 registry 校验完整性。产物位于 `.smoke/release/`。脚本不会自动提交、打 Git tag 或 push。

不实际发布的完整演练：

```sh
npm run publish -- --dry-run
```

浏览器产物是 DSH lazy-CJS factory，不是普通应用模块；必须保留精确的 `window.__ModuleLoader__.load(...)` envelope。

Contributor 参考资料：

- [原版兼容思考指示器调研](docs/research/upstream-reasoning-indicator.md)
- [DSH plugin 发布机制调研](docs/research/dsh-plugin-publishing.md)

贡献代码应包含聚焦测试并通过 `pnpm verify`；修改事件、Slot、DOM Adapter 或 bundle 行为时，还需把最终 tarball 安装到干净的 DSH `0.1.2-alpha.1` Web Profile 验证。

## 许可与归属

MIT。原始思考指示器从 DeepSeek Harness commit `6d7ae5aa57b4dedfc03b09de7cafb65c01338800` 抽离。DeepSeek Harness 为 Copyright (c) 2026 DeepSeek，并按 MIT License 分发；独立打包和后续修改由 `dsh-thinkbar` contributors 维护。
