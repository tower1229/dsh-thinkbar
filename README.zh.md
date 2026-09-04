<div align="center">

# 🧠 dsh-thinkbar

**DeepSeek Harness Web 对话框动态思考指示器插件**

[![npm version](https://img.shields.io/npm/v/dsh-thinkbar.svg?style=flat-square)](https://www.npmjs.com/package/dsh-thinkbar)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![DSH Compatibility](https://img.shields.io/badge/DSH-0.1.2--alpha.4-8a2be2?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178c6?style=flat-square)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.19.0-brightgreen.svg?style=flat-square)](https://nodejs.org)

<p align="center">
  <a href="README.md">English</a> | <b>简体中文</b>
</p>

<br>

<img src="assets/思考指示器演示.gif" alt="dsh-thinkbar 效果演示" width="760" style="border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.1);" />

</div>

---

`dsh-thinkbar` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的轻量级、无侵入 Web UI 插件。在当前可见助手 Step 正在流式输出思考链（reasoning thoughts）时，它会为现有的模型选择器填充动态热感进度与色彩渐变。

## ✨ 核心特性

- 🌡️ **物理热感温阶配色（Iron Scale）**：指示器从 8% 启航，在 20 秒内按 ease-out 曲线平滑填满，沿 Harness 官方信息蓝（0s）→ 红热（~6.7s）→ 橙红（~13.3s）→ 金黄高热（20s）自然过渡。
- ⚡ **零侵入 Portal 适配**：通过公开的 `conversation.input.right` Slot 生命周期锚点与 DOM 语义发现注入独立图层，不修改 DSH 核心源码、不依赖生成的 CSS 类名或模型文案。
- 🎯 **精准流式状态机**：严格按 `reasoning` 块边界激活。直接输出正文或纯工具调用时绝不误闪。
- 💨 **灵动抽空动效**：当思考转为正文、工具调用或 Step 完成时，在 240ms 内迅速丝滑抽空归零。
- ♿ **无障碍友好**：深度适配系统 `prefers-reduced-motion` 减弱动态偏好。
- 🔒 **纯前端无遥测**：无服务端行为、不改变 prompt/消息/请求、零遥测与数据收集。

---

## 📋 运行要求

| 依赖项 | 要求版本 | 说明 |
| :--- | :--- | :--- |
| **DeepSeek Harness** | `0.1.2-alpha.4` | 支持当前按需物化 Conversation 生命周期 |
| **Profile** | 标准 DSH `web` Profile | 需启用官方模型选择插件 |
| **Node.js** | `^22.19.0` \|\| `>=24.0.0` | 推荐 LTS 版本 |
| **包管理器** | `pnpm` (>= 9.0) | DSH 推荐工作流 |

> [!IMPORTANT]
> 当前版本精确兼容 `0.1.2-alpha.4`。早期版本使用了不同的 Conversation Target 生命周期，暂不支持。

---

## 🚀 快速上手

### 安装

通过 npm 注册表安装：

```sh
pnpm dsh plugin --profile web add dsh-thinkbar
```

或安装本地 release tarball：

```sh
pnpm dsh plugin --profile web add ./dsh-thinkbar-<version>.tgz
```

安装后启动/重启 Web Profile：

```sh
pnpm dsh web
```

验证插件已正确加载：

```sh
pnpm dsh --profile web --dump-config
```
*(输出中必须恰好包含一个 `dsh-thinkbar` 行)*

### 升级与卸载

```sh
# 升级至指定版本
pnpm dsh plugin --profile web add dsh-thinkbar@<version>

# 卸载插件
pnpm dsh plugin --profile web remove dsh-thinkbar
```

---

## 🔍 工作原理

```text
[ step/start ] ──> 记录时钟锚点 (Idle 待机)
       │
[ assistant/chunk: reasoning ] ──> 激活填充 (8% -> 100%, 0s -> 20s)
       │                              │
       │                              └──> 配色渐变: 官方蓝 -> 红 -> 橙 -> 金黄
       │
[ text / tool-call / step/end ] ──> 快速抽空 (240ms) -> 回到 Idle 待机
```

1. **状态投影（Projection）**：通过公开的 `ctx.uiConversation.events` 和 `ctx.uiConversation.views` 实时推导 `{ waitOrigin, streamTime, active, tailKind }`。
2. **生命周期锚定与 Portal**：在 `conversation.input.right` 注册锚点，在 `[data-composer-card]` 容器内寻找其后唯一的 `button[aria-haspopup="menu"]` 语义按钮，并 Portal 挂载插件图层。
3. **安全降级机制**：若无法唯一识别模型按钮，插件保持 DOM 纯净并仅在控制台输出一次兼容性提示：
   ```text
   [dsh-thinkbar] Could not uniquely identify the DeepSeek Harness model selector; the indicator is disabled.
   ```

---

## 🛠️ 故障排查

| 现象 | 可能原因 | 解决办法 |
| :--- | :--- | :--- |
| **安装后页面无变化** | 未重启 Profile 或 Bundle 未生效 | 重启 Web Profile，并通过 `pnpm dsh --profile web --dump-config` 确认插件存在。 |
| **client bundle 加载失败** | DSH 版本不匹配 | 确认 DSH 版本精确为 `0.1.2-alpha.4`，检查浏览器控制台与服务端 stderr。 |
| **控制台出现兼容性告警** | 缺少模型选择器或存在冲突按钮 | 确认已启用官方模型选择插件，且无其他插件在右侧 Slot 插入同名菜单按钮。 |
| **模型回答时指示器未激活** | 本次回答未产生 reasoning 块 | 指示器仅在收到 reasoning 事件后激活，直接输出正文或 Tool 调用时保持待机。 |
| **卸载后残留显示** | 进程缓存未释放 | 执行卸载命令后必须重启 Profile 服务。 |

---

## 🧑‍💻 本地开发

```sh
# 安装依赖
pnpm install --frozen-lockfile

# 执行类型检查、单元测试、构建校验与 publint
pnpm verify

# 打包本地 tarball
pnpm pack
```

### 发布流水线

```sh
# 一键自动化发版脚本
npm run publish

# 不发布的 dry-run 完整演练
npm run publish -- --dry-run
```

浏览器产物为 DSH lazy-CJS factory，必须严格保留 `window.__ModuleLoader__.load(...)` 外层 envelope。

### Contributor 参考资料
- [原版兼容思考指示器调研](docs/research/upstream-reasoning-indicator.md)
- [DSH plugin 发布机制调研](docs/research/dsh-plugin-publishing.md)

---

## 📄 许可与归属

[MIT License](LICENSE)

原始思考指示器逻辑抽离自 DeepSeek Harness commit `6d7ae5aa57b4dedfc03b09de7cafb65c01338800`。DeepSeek Harness 版权归 DeepSeek (c) 2026 所有，按 MIT 协议分发；独立打包与后续扩展由 `dsh-thinkbar` 贡献者维护。
