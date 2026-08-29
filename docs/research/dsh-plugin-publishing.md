# DeepSeek Harness 插件独立发布机制调研

调研日期：2026-08-29

## 范围与结论

本文回答 DeepSeek Harness（DSH）第三方插件如何独立发布、安装和发现，以及 `packages/client/ui-reasoning-wait` 是否已经满足独立发布条件。实现审计基于本机 `C:\Workspace\Playground\deepseek-harness` 的 `dev-thinkbar` checkout，独立项目目标仓库为 `C:\Workspace\tower1229\dsh-thinkbar`。

结论：DSH 官方明确鼓励作者在独立仓库发布社区插件。一个可由 `dsh plugin add` 自动启用的第三方 Web UI 插件，核心不是采用某个名称前缀，而是同时满足两层契约：

1. 作为 Bundle，声明 `dsh.bundle.patch` 并随包发布 patch 文件，使 CLI 把包加入 Profile 的有序 Bundle 列表。
2. 作为 Client Plugin，声明 `dsh.client.platform: "web"`、导出已经构建的 `./client`，并由 patch 插入本包的 Loader row，使 Web Host 能发现并提供浏览器 bundle。

官方当前没有独立插件 registry 的提交门槛。官方站点和仓库把 GitHub `dsh-plugin` topic 作为社区插件发现入口；npm、Git、tarball 是分发渠道。

## 目标插件结论

结论是：**功能实现已经具备抽离基础，但当前包和当前独立仓库尚不满足独立发布条件。** 更准确地说：

| 维度 | 结论 | 证据 |
| --- | --- | --- |
| 插件行为 | 通过 | 3 个定向测试文件共 25 个测试通过；真实 Web E2E 回放 3 个通过、1 个需要真实 API 的用例跳过。 |
| 主仓内 client 契约 | 通过 | TypeScript build、tsdown bundle、`verify-client-packages` 均通过；浏览器产物是 DSH lazy-CJS factory。 |
| npm tarball 基础闭包 | 部分通过 | `pnpm pack --dry-run` 能列出 JS、DTS、README 和 LICENSE；publint 无 error，但有两个 warning。 |
| `dsh plugin add` 自动激活 | 不通过 | 当前 manifest 只有 `dsh.client`，没有 `dsh.bundle.patch`；tarball 也没有 `cordis.patch.yml`。 |
| 独立源码构建 | 不通过 | 构建配置、TypeScript config、project references 和 `workspace:^` 依赖都绑定 monorepo；独立仓库目前只有一行 README。 |
| 身份与发布元数据 | 不通过 | 包名和内部常量仍使用 `@deepseek-ai` scope，repository 仍指向 DeepSeek 官方仓库，README 链接和“默认随 web-app 发布”的说明仍是主仓语境。 |
| 独立安装验收 | 未执行 | 尚未从最终 tarball/npm 包安装到干净的 Web Profile，也未验证 add/dump-config/start/remove 全链路。 |

因此不能直接把当前目录复制出来执行 `npm publish`。发布前需要做一次真正的“树外包产品化”，不是只改包名。

## 1. 官方支持的独立发布与发现方式

DeepSeek 官方仓库当前不接受外部 pull request，明确建议开发者创建自己的 Harness 插件并给仓库添加 `dsh-plugin` GitHub topic；同时声明社区插件与官方插件在框架中地位相同。[官方 CONTRIBUTING](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/CONTRIBUTING.md)

官方产品页的 “Community plugins” 直接链接到 GitHub 的 [`dsh-plugin` topic](https://github.com/topics/dsh-plugin)，官方 README 也将它列为社区插件入口。[DeepSeek Harness 官方产品页](https://www.deepseek.com/harness/en/) · [官方 README](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/README.md)

因此，当前有一手证据支持的发现方式是：

- 建立公开的独立 GitHub 仓库；
- 添加 `dsh-plugin` topic；
- 在 README 给出准确的安装 spec、目标 Profile 和兼容版本。

没有官方一手证据表明发布者必须向第三方 marketplace 或目录提交。此类目录可以作为额外曝光渠道，但不属于 DSH 的安装或激活契约。

## 2. Bundle 与 Profile：安装和激活的硬契约

DSH 把作者分发的包定义为 Bundle，把用户启动的组合定义为 Profile：Bundle 的 `package.json` 声明 `dsh.bundle` 并贡献一个 patch；Profile 的 `package.json` 声明 `dsh.profile` 并记录有序 Bundle 列表。一个包不能同时是 Profile。[官方 Package and install 教程](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish)

最小 Bundle 结构为：

```text
package-root/
├── package.json
├── cordis.patch.yml
└── lib/...
```

最小 Bundle manifest：

```json
{
  "name": "dsh-example-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "files": ["lib", "cordis.patch.yml"],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

patch 至少要把本包插入 Loader tree：

```yaml
- insert:
    - id: example-plugin
      name: dsh-example-plugin
```

`name` 必须是安装后可由 Node 从 Profile 解析到的包名。缺少 `dsh.bundle` 时，`dsh plugin` 只会把它安装成普通依赖、打印警告，不会激活任何配置层。[官方教程源码](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/user/develop/basic/publish.md)

CLI 命令：

```sh
dsh plugin --profile web add <package-or-path-or-git-spec>
dsh --profile web --dump-config
dsh --profile web
dsh plugin --profile web remove <package-name>
```

`dsh plugin --profile <name> <args...>` 实际在 Profile 目录中转发 pnpm 命令，并在成功后根据已安装包的 `dsh.bundle` manifest 协调 `dsh.profile.bundles`。添加、删除或升级 Bundle 后，运行中的 Profile 不会动态改变 Bundle 集合，需要重启。[官方 CLI behavior reference](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md#plugin-management)

## 3. 独立 Web UI/client 插件的附加契约

官方 Client Module System 会扫描已经启用的 Loader entries。某个包只有同时声明以下内容，才会进入浏览器启动图：

- `dsh.client.platform` 必须是 `web`；
- `exports["./client"]` 必须存在并指向可读取的已构建文件；
- 可选的 `dsh.client.inject`、`dsh.client.external` 必须是字符串数组；
- 可选的 `dsh.client.immediately` 必须是 boolean，普通 UI 插件不应设置；它只用于第一阶段预取基础设施。

Host 会把 bundle 暴露在 `/plugins/<package-name>/client.js`，并通过内容 hash 生成启动图；未构建或不可读的 bundle 会导致启动阶段明确失败。[官方 Client Modules reference](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/client-modules) · [Client Modules 源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/modules/src/index.ts)

典型 manifest 形状：

```json
{
  "exports": {
    ".": {
      "types": "./lib/types/index.d.ts",
      "default": "./lib/index.js"
    },
    "./client": {
      "types": "./lib/types/client/index.d.ts",
      "default": "./lib/client.js"
    },
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    },
    "client": {
      "platform": "web",
      "inject": []
    }
  }
}
```

一个纯 UI 插件仍需要可由 Loader 挂载的 Node root entry；官方仓库中的纯 UI 插件通常提供空的 `apply()`，浏览器 half 则从 `./client` 加载。[官方 `ui-workspace` Node entry 示例](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-workspace/src/index.ts)

### 浏览器 bundle 格式限制

浏览器 half 必须是 DSH loader 所需的 lazy-CJS factory artifact，不能只是普通 ESM/CJS 文件。官方 monorepo 使用内部 `clientBundle(...)` tsdown preset 生成该格式，但官方文档明确说明该 preset 当前没有发布；树外包必须自行复刻等价输出格式。[官方 settings-card packaging 文档](https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/adding-a-settings-card#packaging)

这意味着“源代码能通过 TypeScript 编译”不足以证明可独立发布；必须检查最终 `lib/client.js` 的 loader handoff 格式，并用真实 DSH Web Profile 启动验证。

## 4. package.json、依赖、命名和版本

### DSH 硬要求

- 有有效的 npm `name` 和 `version`；
- `dsh.bundle.patch` 指向包内实际存在的 patch；
- patch 中的 Loader row 能解析到本包；
- UI 插件有 `dsh.client.platform: "web"` 和有效的 `./client` export；
- `files`/ignore 规则必须把所有运行时 JS、DTS、CSS/资源及 patch 收入发布包；
- 所有发布 entrypoint 和相对运行时 import 在 tarball 内闭合。

### 官方 monorepo 约定，不应原样复制为第三方规则

官方仓库内部的 Client 包采用 `@deepseek-ai/dsh-client-<name>` 命名、workspace project references、`workspace:^` 依赖和内部构建 preset；是否设置 `private` 由该包是否进入官方发布集合决定。这些是主仓发布流水线约定。独立包：

- 不应使用无权限的 `@deepseek-ai` scope；
- 必须去掉 `private: true`；
- 必须把所有 `workspace:` range 换成 registry 上真实存在的 semver range；
- 必须提供自己的独立 build/typecheck/test 配置，而不能依赖主仓 sibling 路径或内部未发布 preset。

官方 Client 包的依赖规则可作为兼容性参考：Cordis 和动态 DSH 包同时放在 `peerDependencies` 与 `devDependencies`，真实运行关系用 peer 表达，构建时由 dev 提供；普通第三方实现库放 `dependencies`。[官方 Client AGENTS 依赖规则](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/AGENTS.md#dependency-declaration)

### 命名

DSH 激活依据 manifest 和 package resolution，不校验 `dsh-plugin-*` 前缀。官方教程使用 `dsh-hello-plugin` 只是示例，不是规范性前缀。第三方可以使用：

- 非 scope 名：`dsh-<feature>` 或 `dsh-plugin-<feature>`；
- 自有 scope：`@owner/dsh-<feature>`。

无论采用哪种命名，patch row、`clientBundle` 中的模块 id、manifest 和 README 安装命令必须使用同一个最终 package name。

### 版本与兼容性

DSH manifest 当前没有独立的兼容版本字段。DeepSeek 官方明确标注 Harness 仍处于 developer preview，核心插件和 API 会继续演进。[官方产品页](https://www.deepseek.com/harness/en/)

因此发布者应使用正常 semver，并通过 peer range、README 与 CI 矩阵声明实际验证过的 DSH/Cordis 版本。这里属于发布建议，不是 DSH loader 的硬校验。npm 不允许重复发布同一 `name@version`，即使旧版本被 unpublish 也不能复用；发布前应先检查 tarball。[npm publish 官方文档](https://docs.npmjs.com/cli/commands/npm-publish/)

## 5. 分发方式与构建要求

### 推荐：npm 发布预构建产物

```sh
npm pack --dry-run
npm publish
```

若使用自有 scope，首次公开发布使用：

```sh
npm publish --access public
```

npm 官方建议先检查敏感/多余内容、从本地路径测试安装，并说明 scoped package 默认不是 public。[npm scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/) · [npm publish](https://docs.npmjs.com/cli/commands/npm-publish/)

预构建 npm 包不需要在用户机器执行 build，是 DSH 官方给出的低摩擦分发方式。[DSH 官方 publish 教程](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish#installing-from-github-the-build-script-catch)

### 可选：tarball

作者可先 `pnpm pack`/`npm pack` 生成含构建产物的 `.tgz`，用户用 `dsh plugin --profile web add ./package.tgz` 安装。它同样不需要安装期 build permission。

### 可选：GitHub source install

```sh
dsh plugin --profile web add github:owner/repo#<commit-sha>
```

Git 安装只取得源码，不会自动运行普通 `build` script。TypeScript 插件必须提供自包含的 `prepare`，且不能依赖 sibling monorepo 或仅在作者机器存在的 dev context。pnpm 10+ 默认阻止 Git 依赖的 `prepare`，用户需要在 Profile 的 `pnpm-workspace.yaml` 中显式 `allowBuilds` 后重试。官方建议将 Git spec 固定到 commit SHA，因为放行的是安装时在用户机器执行代码的权限。[DSH 官方 publish 教程源码](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/user/develop/basic/publish.md)

因此对普通用户发布，优先级建议是：预构建 npm 包 > 预构建 tarball > 需要 `prepare` 的 Git source install。

## 6. `ui-reasoning-wait` 当前实现审计

### 已经满足的条件

当前实现不是原型空壳，核心行为和主仓集成已有较完整证据：

- `package.json` 已有 Node root、`./client`、types、MIT license 声明和公开发布配置；`dsh.client.platform` 为 `web`。
- Node half 提供空 `apply()`，浏览器 half 注册 `ReasoningWaitService`，并通过 `ctx.slots.inject('conversation.input.model.decoration', ...)` 等待目标 slot，卸载时 service 和 slot contribution 都能清理。
- 等待识别、会话日志时钟外推、20 秒填充、240ms drain、session 切换、reduced motion、HMR teardown 均有测试。
- `pnpm exec vitest run` 对该包三个 spec 的结果为 3 files / 25 tests passed。
- `pnpm exec tsc -b packages/client/ui-reasoning-wait/tsconfig.json` 通过；`pnpm --filter @deepseek-ai/dsh-client-ui-reasoning-wait bundle` 生成 Node ESM entry 和 16.80 kB 的 client factory。
- `pnpm run verify-client-packages` 报告 41 个 client package（其中 38 个 dynamic）满足依赖和 module-request 规则。
- `DSH_SNAPSHOT=replay` 下的 `model-select-reasoning-fill.e2e.ts` 结果为 3 passed / 1 skipped；跳过项是需要真实 API 的路径，不是 keyless replay 失败。

这足以说明“功能代码值得抽离”，但不能替代独立安装验证。

### 阻断独立发布的问题

#### P0：安装后不会自动启用

当前 `package.json` 只有：

```json
"dsh": {
  "client": {
    "platform": "web"
  }
}
```

缺少 `dsh.bundle.patch`，发布文件清单也没有 `cordis.patch.yml`。用户执行 `dsh plugin --profile web add <package>` 后，CLI 会把它保留为普通依赖并警告，不会把它加入 Profile Bundle 列表。独立包需要同时声明：

```json
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": {
    "platform": "web",
    "inject": [
      "@deepseek-ai/dsh-client-runtime",
      "@deepseek-ai/dsh-client-ui-model-selection"
    ]
  }
}
```

随包 patch 至少插入最终包名对应的 Loader row。最终包名、patch row、client factory id、CSS tag id 和测试常量必须一次性统一改名。

#### P0：源码构建依赖 monorepo 私有上下文

当前独立仓库只有 `# dsh-thinkbar`。源包中的以下关系不能原样搬过去：

- `tsdown.config.ts` import `../tsdown.client.ts`；官方明确说明 `clientBundle` preset 没有发布。
- `tsconfig.json` extends `../../../tsconfig.base.client.json`，并引用五个 sibling project。
- dependencies 使用 `workspace:^`，离开 workspace 后不能作为 registry 兼容范围。
- package scripts 只有 `bundle`/`watch`，没有独立的 typecheck、test、pack/prepublish 检查；Git source 分发也没有自包含 `prepare`。
- 现有 profile composition test 读取主仓 `packages/bundle/web-app/cordis.patch.yml`，独立后应改为验证本包自己的 bundle patch。
- component test 直接 import `@deepseek-ai/dsh-api-remotes/client`，但 manifest 没有把它声明为直接 dev dependency；在独立依赖树中不能依赖偶然的传递可见性。

树外项目必须自带等价的 lazy-CJS factory 构建配置，并在干净 checkout 中仅靠自身 manifest 完成 install、typecheck、test、build 和 pack。

#### P0：包身份不可直接发布

当前包名是 `@deepseek-ai/dsh-client-ui-reasoning-wait`，repository 指向 `deepseek-ai/deepseek-harness.git`。除非得到 DeepSeek npm scope 和品牌授权，否则独立项目应使用自己的名称，例如当前未在 npm 公共 registry 查到的 `dsh-thinkbar`，并同步修改 repository/homepage/bugs、README 安装命令和所有内嵌 package id。npm 的 E404 只说明 2026-08-29 查询时没有公开包，不能替代发布瞬间的最终占名检查。

独立仓库还必须放置实际 LICENSE 文件。当前 workspace 的 pack 结果会自动带上仓库根 LICENSE；复制 package 子目录本身并不会自动把该文件带到新仓库。应明确版权归属和对原 DeepSeek MIT 代码的 attribution，不应沿用错误的官方 repository 身份。

#### P1：发布视图和文档需要清理

`pnpm pack --dry-run` 当前包含运行时 JS、DTS、README 和 LICENSE，但没有 bundle patch。publint 给出两个 warning：

1. `exports["./src/*"]` 指向未进入 tarball 的 `src/*`。独立发布时应删除该测试便利 export，或明确把 source 纳入发布文件；不能保留失效公开入口。
2. `./client` 在 `type: module` 包内指向 `.js`，而内容是 CJS。对普通 npm 包这是风险，但这里的内容是 DSH loader 要求的 lazy-CJS factory，不应机械改成普通 ESM；最终以真实 Profile 加载为准，并在构建测试中锁定 factory envelope。

README 中指向 sibling package、主仓 `.agents`、`CONTEXT.md` 和 ADR 的相对链接在独立仓库会失效；“默认随 web-app bundle 发布”也必须改成独立安装、升级、卸载说明。`README.i18n.yaml` 是否保留取决于独立仓库是否继续采用主仓翻译门禁，不是运行时资产。

#### P1：兼容范围尚未建立

该插件直接依赖 developer-preview API：`PartialAssistant.waitOrigin/streamTime`、`conversation.input.model.decoration`、Slot props 以及 DSH client factory 格式。2026-08-29 的 npm 查询确认相关 `0.1.1-rc.2` 包存在，但 client runtime、ui-model-selection、ui-slots 和 invariants 的 `latest` tag 仍指向旧 RC，`0.1.1-rc.2` 在 `next`。首版不应声明宽泛兼容性；应以实际验收版本为准，优先精确 pin 或窄 peer range，并在 CI 对该 DSH 版本跑安装 smoke。

当前 `./invariant` companion 是主仓发布治理的一部分，installer 本身为空。树外包可在确认 DSH 外部插件没有该强制要求后删除这一 entry 和 `@deepseek-ai/dsh-invariants` 依赖，减少无行为价值的耦合；若保留，则必须把它纳入真实依赖和安装测试。

### 推荐的独立项目形态

首版建议使用单包 `dsh-thinkbar`，让同一个 `package.json` 同时声明 `dsh.bundle` 与 `dsh.client`，不再额外发布 wrapper 包：

```text
dsh-thinkbar/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── build/                    # 自有 client factory 构建配置
├── cordis.patch.yml
├── src/
│   ├── index.ts             # 空 Node half
│   └── client/...
├── tests/
├── README.md
└── LICENSE
```

推荐先支持预构建 npm/tarball，不在首版承诺 Git source install。这样无需让用户授权 `prepare`；仓库自身仍可保留普通 `build`，发布前用 `prepack` 生成并校验 `lib/`。

### 发布门槛

完成抽离后，至少应取得以下证据再发布 `0.1.0`：

1. 干净 clone 中 `pnpm install --frozen-lockfile`、typecheck、test、build 全绿。
2. `npm pack --dry-run` 回读后，实际生成 tarball，并从 tarball 安装到全新临时 Web Profile。
3. `dsh --profile <temp> --dump-config` 显示 `dsh-thinkbar` Bundle layer 和唯一 Loader row。
4. 重启 Profile 后用真实浏览器验证 idle、TTFT、reasoning stream、text tail drain、reduced motion 和 session switch；浏览器 console/Host stderr 无加载错误。
5. `dsh plugin --profile <temp> remove dsh-thinkbar` 后 layer 和 UI 都消失。
6. CI 固定已验证的 DSH `0.1.1-rc.2`（或发布时选定版本），再决定是否扩大 peer range。

## 7. 独立发布验收清单

以下清单可用于后续审查任何待拆出的 UI 插件：

- [ ] 独立仓库具备 README、LICENSE、repository 元数据和 `dsh-plugin` topic。
- [ ] package name 可用且不冒用 `@deepseek-ai`；`private` 不为 true；版本未被占用。
- [ ] 没有 `workspace:` range、本地绝对路径、主仓 sibling import 或依赖内部未发布构建 preset。
- [ ] `dsh.bundle.patch` 指向随 tarball 发布的 `cordis.patch.yml`。
- [ ] patch 插入本包的 Loader row，且 `name` 与最终 package name 完全一致。
- [ ] Node root export 可解析；纯 UI 包至少提供有效的空 `apply()`。
- [ ] `dsh.client.platform` 为 `web`；`exports["./client"]` 指向真实的 `lib/client.js`。
- [ ] `lib/client.js` 是 DSH lazy-CJS factory artifact，而不是普通模块输出。
- [ ] `files` 覆盖所有 JS、DTS、CSS/静态资源和 patch；无密钥、路径、测试夹具等泄漏。
- [ ] `npm pack --dry-run` 或 `pnpm pack` 的文件清单经过人工回读。
- [ ] 从 tarball/npm 包在一个干净的 `web` Profile 执行 `add` 成功。
- [ ] `dsh --profile web --dump-config` 能看到该 Bundle layer 和本包 row。
- [ ] 重启 `dsh web` 后 UI 行为通过真实浏览器 smoke；控制台、Host stderr 无加载错误。
- [ ] `remove` 后 Bundle layer 消失，重启后 UI 不残留。
- [ ] README 明确安装、升级、卸载命令，以及实际验证过的 DSH/Cordis 版本范围。

## 8. 一手来源索引

- [DeepSeek Harness 官方产品页](https://www.deepseek.com/harness/en/)
- [DeepSeek Harness 官方仓库](https://github.com/deepseek-ai/deepseek-harness)
- [官方 CONTRIBUTING](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/CONTRIBUTING.md)
- [官方 README](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/README.md)
- [Package and install a plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish)
- [dsh CLI behavior reference](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md)
- [Client Modules reference](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/client-modules)
- [Client package rules](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/AGENTS.md)
- [Settings card packaging](https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/adding-a-settings-card#packaging)
- [npm publish](https://docs.npmjs.com/cli/commands/npm-publish/)
- [npm scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
