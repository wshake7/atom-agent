# 宿主运行时选用官方 Cordis

内核闭合集（服务注册、依赖注入、生命周期、事件总线原语）用官方 Cordis（[cordiverse/cordis](https://github.com/cordiverse/cordis)）兑现，不自研第二套宿主，也不 vendor DeepSeek Harness 里的 `@deepseek-ai/cordis`。这不是 fork Harness：Harness 只是同一运行时上的产品树。

`atom-kernel` 对 Cordis 做薄封装（加载已解析同进程模块、官方槽、匿名事件），插件形态对齐 Cordis 的 `apply` / `inject` / `Service` / 可逆 effect。发现、boot、回合循环仍不进核。
