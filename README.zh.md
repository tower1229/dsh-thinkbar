# dsh-thinkbar

[English](README.md) | 中文

`dsh-thinkbar` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Web UI 插件。当前助手轮次正在等待首个 reasoning 内容或流式输出 reasoning 时，它会把 composer 中的模型选择器显示成思考等待指示器。

指示器从 8% 起步，在 20 秒内按 ease-out 曲线填满，并沿 Harness info blue、红、橙、黄变化。reasoning 结束后，填充会在 240ms 内抽空。切换会话会立即清除旧会话的指示器；reduced-motion 模式会跳过抽空和粒子动画。

## 运行要求

- DeepSeek Harness source commit `6d7ae5a`（其 package manifest 仍把自身标记为 `0.1.1-rc.2`）
- DSH `web` Profile
- Node.js `^22.19.0` 或 `>=24.0.0`

当前发布候选只承诺兼容上述源码契约。Harness 仍处于 developer preview，client plugin API 可能变化。

> **发布已阻断：**当前不要把本包发布到 npm，也不要从 npm 安装。本地 commit `6d7ae5a` 仍报告版本 `0.1.1-rc.2`，但 npm 上同版本产物早于本插件依赖的 `waitOrigin`、`streamTime` 和 `conversation.input.model.decoration` 契约。DeepSeek 发布具有独立版本号的兼容产物，或本项目选定可分发的兼容 Harness fork 之前，package 保持 `private`。

## 安装

选定兼容 DSH 版本并发布本包后：

```sh
dsh plugin --profile web add dsh-thinkbar
```

安装后重启正在运行的 Web Profile。Bundle 变更只在 Profile 启动时生效。

检查 Bundle layer 和 Loader row：

```sh
dsh --profile web --dump-config
```

输出中应包含 `dsh-thinkbar` row。

## 升级

显式安装目标版本，然后重启 Profile：

```sh
dsh plugin --profile web add dsh-thinkbar@0.1.0
```

## 卸载

```sh
dsh plugin --profile web remove dsh-thinkbar
```

卸载后重启 Web Profile。

## 行为说明

只有当前可见会话存在 `waitOrigin`，且流式尾部为空或 reasoning block 时，插件才会显示。正文尾部、tool call、工具执行、关闭 thinking 的请求以及其他会话均保持 idle。

插件没有设置项，也没有 Host 端行为。它不会改变 prompt、消息、schema、工具、模型请求或 KV Cache，不包含遥测，也不会上传数据。

## 故障排查

- **安装后没有显示：**重启 DSH Web Profile，并确认 `dsh --profile web --dump-config` 中存在 `dsh-thinkbar`。
- **client bundle 加载失败：**确认 DSH 精确为 `0.1.1-rc.2`，重新安装并重启，然后检查浏览器 console 和 DSH stderr。
- **只安装成依赖但未启用：**检查安装包中是否存在 `cordis.patch.yml`。官方 `dsh-thinkbar` tarball 同时包含 Bundle 声明和 patch。
- **响应期间没有填充：**指示器只在 reasoning-wait 窗口显示，且只位于 Web composer 的模型选择器座位。

## 本地开发

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm pack
```

`pnpm verify` 会执行 TypeScript 检查、单元与组件测试、独立 DSH client bundle 构建、tarball 契约检查和 `publint`。

浏览器产物是 DSH lazy-CJS factory，不是普通应用模块。不要把 `window.__ModuleLoader__.load(...)` envelope 替换为常规 ESM bundle。

Bundle/Profile 和 client-module 发布契约见[发布机制调研](docs/research/dsh-plugin-publishing.md)。

## 许可与归属

MIT。思考指示器从 DeepSeek Harness commit `6d7ae5aa57b4dedfc03b09de7cafb65c01338800` 抽离。DeepSeek Harness 为 Copyright (c) 2026 DeepSeek，并按 MIT License 分发；独立打包和后续修改由 `dsh-thinkbar` contributors 维护。
