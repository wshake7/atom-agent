# 13 — 宿主：无循环也能加载、卸载、发匿名事件

**Parent:** [spec.md](../spec.md)

**What to build:** 内核作为进程内插件宿主可用：同进程插件能装上、卸掉，生命周期 effect 可逆；匿名事件总线可发布/订阅。不装 `loop`、没有业务事件名、没有发现逻辑也算过。宿主四件套用官方 Cordis 兑现，`atom-kernel` 薄封装加载面；插件为 Cordis 模块（`apply` / `inject` / `Service`）。不自研第二套 DI/事件，不 vendor `@deepseek-ai/cordis`。见 [ADR-0007](../../../docs/adr/0007-cordis-as-host-runtime.md)。

**Blocked by:** 12 — 包布局与模块边界落地

**Status:** resolved

- [x] 经宿主加载面装上一颗探测插件后，Context 上能取到它贡献的服务（含未点名键）
- [x] 卸载后 effect 逆转，服务不再可取
- [x] 匿名事件总线可发布/订阅；内核自身不规定业务事件名
- [x] 不装 `loop` 的装配仍能完成上述验收；测试只走宿主加载面
- [x] 依赖官方 Cordis（cordiverse），不出现自研平行宿主、也不出现 Harness vendor 的 Cordis

## Answer

`atom-kernel` 用官方 `cordis@4.0.0-rc.8`（cordiverse）兑现四件套：`createPluginHost()` 薄封装 `Context.plugin` / `provide` / `get` / `emit` / `on` / fiber.dispose。探测插件经 `load` 贡献未点名键或官方槽后可从 `context.get` 取到；`unload` 逆转 effect；`events` 与插件 `ctx.emit` 同一条匿名总线。测试不装 `loop`。不依赖 `@deepseek-ai/cordis`。

## Comments

- 实现接缝：`PluginHost.load` / `context.get` / `events` / `LoadedPlugin.unload`。插件形态为 Cordis `apply` + `inject`，并再导出 `Service`。
