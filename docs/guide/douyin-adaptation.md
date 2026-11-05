# 抖音小程序适配实践

> 本文档总结了 wot-ui 在抖音小程序（`mp-toutiao` 平台）上的适配经验。wot-ui 官方声明支持微信小程序、支付宝小程序、钉钉小程序、H5、APP 等，**抖音小程序不在官方支持范围内**（1.0 仓库相关 issue 均以 not_planned 关闭），本文是社区侧的有限适配实践，适用于"按需适配少量组件"的场景。

## 背景：能不能适配？

结论是：**"能用"可以靠补丁达成，"体验对齐微信"做不到**。官方未适配的核心原因在 [Moonofweisheng/wot-design-uni#161](https://github.com/Moonofweisheng/wot-design-uni/issues/161) 中有明确说明，被两个 uni-app 上游问题阻塞：

| 上游问题 | 内容 | 现状 |
|---------|------|------|
| [dcloudio/uni-app#3360](https://github.com/dcloudio/uni-app/issues/3360) | vue3 的 `provide/inject` 在字节小程序中无法传值 | 2024-01 官方修复关闭，但时序仍不稳定，需保留 workaround |
| [dcloudio/uni-app#5006](https://github.com/dcloudio/uni-app/issues/5006) | 组件开启 `virtualHost` 后 emit 事件失效、props 更新卡死模拟器 | **平台硬限制，无法修复**。根因是 uni-app 用抖音 Fragment 组件模拟 virtualHost，与微信实现不一致 |

## 平台限制与根因清单

以下是抖音端已实证的与微信端的差异点，适配工作全部围绕它们展开：

### 1. virtualHost 不可用 → 组件外多一级宿主节点

所有组件已按 `#ifndef MP-TOUTIAO` 禁用 virtualHost（这是官方确认的唯一可行方案，"抖音平台目前千万不要开启 virtualHost"）。代价是每个自定义组件外层多一个**无样式宿主节点**，连锁影响：

- **flex 布局链断裂**：子组件的宿主节点成为父 flex 容器的直接子项，子组件内部节点上的 `flex: 1` 因父级不是 flex 容器而失效。典型症状是 tabbar 所有 item 挤在一侧。
- **解法**：容器布局改用 `grid`（宿主节点作为 grid 子项被 `grid-auto-columns: 1fr` 强制均分），不依赖任何选择器支持：

```scss
/* #ifdef MP-TOUTIAO */
.wd-tabbar {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
}
/* #endif */
```

### 2. 样式隔离：`styleIsolation: 'shared'` 无等价物

微信靠 `shared` 让组件间样式互相命中；**抖音样式强隔离，没有 apply-shared / shared 的等价能力**（见 [uni-app#5006](https://github.com/dcloudio/uni-app/issues/5006) 评论区）。两种典型失效模式：

- **A 组件 ttss + `custom-class` 交给 B 组件渲染**：A 的规则打不中 B 渲染的节点。wd-popup 把 `.wd-popup{position:fixed;background}` 通过 `custom-class` 交给 wd-transition 渲染，在抖音端规则整体失效 → 弹层无定位无背景、内容平铺在页面流里。
  - **解法**：关键定位/外观样式改为**内联样式**（inline style 不受隔离限制），通过 `custom-style` 传入。见 `wd-popup.vue` 的 `douyinPositionStyle` 与 `wd-overlay.vue` 的 `overlayStyle`（均仅 `MP-TOUTIAO` 生效）。
- **跨组件作用域的后代选择器**：`.wd-popup .wd-popup__close` 中祖先与后代分属两个组件作用域，抖音隔离下选择器整体不匹配 → 弹层关闭按钮失去定位与配色。
  - **解法**：同上，内联化。通过 `wd-icon` 的 `custom-style` 写入，见 `wd-popup.vue` 的 `closeStyle`。

判断口诀：**节点的 class 和生效的规则是否属于同一个组件作用域**。凡是"样式在 A 的 ttss、节点由 B（尤其是 wd-transition/wd-overlay 这类渲染器）渲染"的组合，在抖音端都会失效。

### 3. `globalThis` 不存在

抖音 AppService 环境没有 `globalThis`（微信等平台有）。zod v4 等三方库在模块初始化时裸访问 `globalThis`，会导致 `common/vendor.js` 求值中断，**连带 vendor 后续所有导出缺失**，出现 `e.ref is not a function` 这类连锁报错。

- **解法**：`vite.config.ts` 中的 `douyinGlobalThisPolyfill` 插件（仅 `UNI_PLATFORM=mp-toutiao` 生效），在 generateBundle 阶段向 vendor 顶部 `"use strict";` 之后注入模块级兜底：

```js
var globalThis = typeof global !== "undefined" ? global : {};
```

注意事项：vendor 在 bundle 中是 chunk 类型（用 `code` 属性）而非 asset；polyfill 必须插在 `"use strict"` 之后，否则严格模式指令失效；`var` 声明对整个 vendor 模块作用域可见，同文件内所有 `globalThis` 引用命中同一单例。

### 4. `provide/inject` 时序不稳定

上游已修复但抖音端 setup 同步期 inject 仍可能拿到 null。组件库的 workaround 模式在 `composables/useParent.ts`：抖音端把 inject 延迟到 `onMounted` 执行。新组件如需 provide/inject，应复用 `useParent`/`useChildren`，或按同模式处理。

### 5. 需要开启 `component2`

`manifest.json` 的 `mp-toutiao` 节点需配置 `"component2": true`（已配置）。这是抖音新版组件框架开关，`styleIsolation` 等特性的支持与它相关。注意此类框架级开关在开发者工具中通常需要**移除项目后重新导入**才会生效。

## 本仓库已落地的改动清单

| 文件 | 改动 | 解决的问题 |
|------|------|-----------|
| `vite.config.ts` | 新增 `douyinGlobalThisPolyfill` 插件 | zod 等库导致 vendor.js 求值中断 |
| `src/manifest.json` | mp-toutiao 增加 `"component2": true` | 新版组件框架 |
| `components/wd-tabbar-item/wd-tabbar-item.vue` | 补 `#ifndef MP-TOUTIAO` virtualHost 守卫 | 全库唯一守卫遗漏 |
| `components/wd-tabbar/index.scss` | 抖音端 grid 布局 | item 宿主节点导致 flex:1 失效 |
| `components/wd-popup/wd-popup.vue` | `useRootPortal` + `douyinPositionStyle` + `closeStyle` | 弹层平铺、遮罩缺失、关闭按钮无样式 |
| `components/wd-overlay/wd-overlay.vue` | `overlayStyle` 内联定位与背景 | 遮罩不显示 |
| `components/wd-root-portal/wd-root-portal.vue` | root-portal 条件编译加入 `MP-TOUTIAO` | 弹层脱离组件树的逃生通道 |
| `composables/useParent.ts`（既有） | inject 延迟到 onMounted | provide/inject 时序 |

## 用 pnpm patch 应用到业务项目

适合"业务项目通过 npm 依赖 `@wot-ui/ui`、只用到少量组件"的场景。以本项目实际案例（`patches/@wot-ui__ui@2.4.0.patch`）为例：

1. `pnpm patch @wot-ui/ui@2.4.0`，得到编辑目录（`node_modules/.pnpm_patches/...`）
2. 把上文"已落地的改动清单"中对应组件的修复套用到编辑目录内的同名文件（均有 `#ifdef MP-TOUTIAO` 或 `douyin` 命名标记，易定位）
3. **行尾铁律**（违反会导致补丁应用后文件被截断/重复，构建报 scss `expected "}"`）：
   - 全部改动文件统一 LF 行尾
   - 文件末行必须以换行符结尾
   - 自查：生成的补丁文件中 `grep "No newline at end of file"` 结果必须为 0
4. `pnpm patch-commit <编辑目录>`，生成 `patches/@wot-ui__ui@2.4.0.patch` 并自动写入 `patchedDependencies`
5. 业务项目自身配置：`manifest.json` 的 mp-toutiao 增加 `"component2": true`；如 vendor.js 报 `globalThis` 相关错误（本项目实例是 zod），参考上文 polyfill 插件方案
6. `pnpm build:mp-toutiao` 构建，并抽查产物（app.json 的 component2、组件 ttss 的 grid/内联样式）

升级 `@wot-ui/ui` 版本后补丁会失配：对新的 `pkg@version` 重新 `pnpm patch`，按新版源码重新套用修复后再 `patch-commit`。修复集中且标记清晰，重推成本可控。

## 组件适配检查清单

要把一个新组件适配到抖音端，按以下顺序逐项排查：

1. **virtualHost 守卫**：组件 `options` 中的 `virtualHost: true` 是否有 `#ifndef MP-TOUTIAO` 守卫（全库约定，缺失会导致抖音端异常）。
2. **布局依赖**：组件或其子项是否依赖"父容器是 flex"的布局？宿主节点会打断 flex 链，必要时改 grid 或在宿主节点恢复样式。
3. **跨组件样式**：是否存在"ttss 规则写在 A 组件、节点由 B 组件渲染"的组合（custom-class / slot 深层节点）？有则将关键样式内联化。
4. **后代选择器**：ttss 中是否有横跨组件作用域的后代选择器？抖音端不匹配，改为内联或调整结构。
5. **provide/inject**：是否使用 `useParent`/`useChildren`？自行 inject 的需参考 `useParent.ts` 做 onMounted 延迟。
6. **uni API**：所用 `uni.*` API 在抖音端是否可用（注意 `globalThis` 依赖、胶囊按钮 API 的空值兜底）。
7. **编译验证**：`pnpm build:mp-toutiao` 构建成功，并抽查产物（条件编译是否生效、内联样式是否进入 bundle）。
8. **行尾规范**：若改动会被复制进 pnpm patch，统一 LF 并确保末行有换行符（见"用 pnpm patch 应用到业务项目"的行尾铁律）。
9. **运行验证**：抖音开发者工具中**移除项目后重新导入**（框架级开关需要重开项目），按下方清单验证。

## 已知取舍与未覆盖项

- center 弹层的 zoom-in 缩放动画在抖音端退化为 fade 淡入淡出：内联的居中 transform 会覆盖动画类的 transform，这是"保定位舍动画"的取舍。
- 横向滑动手势（如 swipe-action）无法通过 `preventDefault` 锁定页面纵向滚动——这在微信端同样存在，属小程序通病，非抖音特有回归。
- dialog、toast、notify 等其余组件与 popup 同构（custom-class + transition 渲染模式），如需适配按本文方法论处理即可。
- `custom-class`/页面级样式覆盖在抖音端无法穿透组件（样式强隔离），主题定制一律走 `--wot-*` CSS 变量。
- 无抖音端自动化测试与 CI，所有适配依赖开发者工具人工回归；`pnpm build:mp-toutiao` 编译通过 + 产物抽查是提交前的最低要求。

## 参考

- [wot-design-uni#161 支持字节系小程序](https://github.com/Moonofweisheng/wot-design-uni/issues/161)（维护者说明被阻塞的原因）
- [dcloudio/uni-app#5006](https://github.com/dcloudio/uni-app/issues/5006)、[dcloudio/uni-app#3360](https://github.com/dcloudio/uni-app/issues/3360)
- [uni-app 多端渲染差异说明](https://uniapp.dcloud.io/matter?id=vendorjs-%e8%bf%87%e5%a4%a7%e7%9a%84%e5%a4%84%e7%90%86%e6%96%b9%e5%bc%8f)
- [抖音 root-portal 组件文档](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/component/root-portal)
