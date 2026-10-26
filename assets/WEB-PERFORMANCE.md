# 网页资源与父页面生命周期开发记录

范围：网站基线 `875fe5c1fb8b842cc66966f218608e2fb5dd87e4`，网站根目录直接提供页面；不涉及生产固件、系统字库、串口、刷写或目标包配置。按用户本轮云模式授权执行，代码作者的下述结果是开发自测，独立 QA 由协调者安排。遵循 `/workspace/zhijian-v208` 的 `79f2f5ad303b9a588d551e3e0eb4b6e5735bc56b` 下 `AGENTS.md` 与 `docs/standards/development-acceptance.zh.md` 的公共实现、状态/退出、缓存/性能和真实帧验收章节。

|需求与公共路径|正常结果|失败、退出、重入|
|---|---|---|
|网页字体，`assets/fonts/web-fonts.css`|同源同字形，核心与其余 Unicode 范围互斥且覆盖原 cmap；核心 182,976 B，原 TTF 26,198,796 B|原 TTF 与 OFL 保留，完整字体下载链接保留；未知页面字符按需加载原字体其余字形|
|57 张截图，`media.js`|无损 WebP，原始 7,885,900 B → 2,705,940 B；RGBA 解码逐像素一致；原 684×1216 PNG 保留|先解码后替换；失败保留上一完整帧并提示；同一图可重试|
|首页/锁屏/阅读/导览共享媒体入口|只有当前 route、非 hidden、非折叠内容、距视口约250px的图片开始加载；首页主帧 high 优先，明确尺寸；自动演示等首帧与字体齐备|离页/隐藏暂停演示；减少动效沿用；所有动态换帧都接同一入口，未请求图片不记加载失败|
|启动与资源反馈，`v2.js`|先让 busy 实际呈现，再 `PaperspaceRuntimeAssets.prepare`；下载展示实际 received/total，解压/校验只展示阶段|Stop、离页、pagehide 取消在途资源，epoch 拒绝旧异步完成；下载与90s初始化计时分开；90s在资源校验完成后开始|
|配置重启与输入|主题/日夜/阅读配置重启复用已校验公共 bytes；输入马上显示网站触控环/aria-busy，busy 重复输入只解释不排队|原生回执只表示输入被处理，NOOP明确表示无改变；不假造系统帧或进度百分比|
|可靠主页打开短书|只在 view0 且未锁屏时发真实 `ARM TAP 130 530 100`；保持同 iframe；目标 bookId、view13、book_open1、父 seq=observation.frame=子 canvas seq 全齐后才宣告呈现|超时提示重试或停止；Stop/换代取消等待；不改变 child 的通用输入协议|

`media.js` 是 app、hero 操作回放、主页日夜比较、阅读、锁屏和放大查看的共同媒体路径。父页资源加载器由另一个开发任务提供，集成契约为 `prepare({onProgress})`、`cancel()`、`getBundle()`；本次真实联调只读其提交 `3e364ad65ad209269296b96f903a4128cd508557`。

开发自测：`node --check` 三个受影响脚本、`git diff --check`；`/usr/bin/python3 scripts/build-web-assets.py` 完成所有46,946 cmap 字符的 advance、展开轮廓与 hint 指令核对，150个网页分片共10,264,040 B，57图像素校验成功。清单在相邻 `web-assets-manifest.json`。原 TTF SHA-256 仍为 `4baa9679b0aae3983a8b03c49f5cccce796b503b95e900120e8e6f3c07a6519c`。

本机 Chromium + Playwright 开发自测通过：直达 experience 时首页与折叠导览不加载、未点击启动无 data/wasm 下载；首页仅视口附近请求；图片失败保旧与同源重试；三种阅读方向；四主题锁屏加日夜/书2；684×1216实际像素查看；页面未含字符“龘”按需请求原字体分片；下载中 Stop 与离页取消后旧 promise 不建 iframe；实际 WASM 首次2个 gzip请求，主题重启不再下载；短书快开不更换 iframe，严格业务帧门禁通过，无 JS 异常。

最早原始联调测试仅等待 busy=false 和 view13，遗漏了随后 canvas 帧更新；保留原日志并明确不据此判定业务画面完成。纠正测试记录了原 complete (view0/frame15) 到后续阅读帧(view13/frame16)的真实差异；修复父页短书门禁后重新通过严格断言。开发证据与脚本保留在独占 `/tmp/paperspace-assets-*`，协调者交接文件 `/tmp/perf-assets-handoff.json`。

未测：独立冻结候选 QA、公开站点发布后检查、实体墨水屏触控/刷新/残影/功耗与硬件。未尝试绕过公网 Chromium 证书错误；所有浏览器开发验证使用本机 HTTP COOP/COEP 服务。`firmware-target.json` 仍是 schema2/disabled，writer 与生产固件均未更改。

生成器静态修整待跑：固定公共 UI 输入清单（不受新根目录加载器影响），记录逐输入 SHA-256，并将字体 header 时间归一到原字体以确保重新生成稳定。此修整尚未重生成，须待协调者正式基线测量窗口结束后执行，再以新候选冻结并复核字节统计。
