# 安装器引擎的可复现维护

工具在完整 SHA-256 固定的已发布编译 bundle 上完成两阶段转换，不声称从原七个模块重新构建。第一阶段使用 Acorn 8.15.0 定位并替换来源、版本和诊断三个身份字面量；第二阶段只允许十二个会话方法、一个私有安全字段、完成写入后的一次性硬复位方法、每会话 `VerifiedESPLoader`、构造器唯一 loader callee 、导出身份元数据及controller转发连接模式及硬复位的改动。原 SDK/Transport 类、OTA 记录编解码、WL/FAT、镜像/策略解析及完整备份实现保持 AST 与字节相同；会话按实表绑定应用/OTA地址和目标应用几何。Adapter继承SDK的stub上传与后续USB配置，只替换ROM移交握手；工具逐字节证明该继承方法其余前后缀不变。

依赖版本及完整性由本目录 package-lock.json 固定，Acorn [MIT 许可](ACORN-LICENSE-MIT.txt) 随附。Acorn 只用于维护，不进入浏览器运行 bundle。

## 从公开基线重现

在仓库根目录执行。需要 Node.js 与 npm；每个输出目录必须尚不存在，输入与输出均使用仓库内相对路径。

```sh
npm ci --prefix scripts/engine-adaptation --ignore-scripts --no-audit --no-fund
mkdir -p staging/engine-baseline
git show bc5b2694fb848b6b7a2b008e559fe2b8c3eed944:real-flash/engine.js > staging/engine-baseline/engine.js
git show bc5b2694fb848b6b7a2b008e559fe2b8c3eed944:real-flash/build.json > staging/engine-baseline/build.json
node scripts/engine-adaptation/adapt-engine.mjs \
  --input staging/engine-baseline/engine.js \
  --build staging/engine-baseline/build.json \
  --outdir staging/engine-identity
node scripts/engine-adaptation/maintain-engine.mjs \
  staging/engine-identity/engine.js staging/engine-maintained
cmp staging/engine-maintained/engine.mjs real-flash/engine.js
```

基线 engine SHA-256 为 `f82fa742ef5ecb838d4ca28a4cfe2e5d946056e06c65409ab9bf1ed6a677fc43`；身份适配中间产物为 `60a95723afb8f3f2c7503cb79a0553287eb6bda6a53bac3b5fcca637b0b912bd`；最终 engine 摘要以实际 [build.json](../../real-flash/build.json) 的 engine_sha256 为准。第一阶段可加 `--inspect` 只读检查，不传 `--outdir`。维护收据逐项绑定变更区间与摘要，并检查范围外字节和未改节点；当前构建来源见 [build.json](../../real-flash/build.json)。

每会话 adapter 严格检查二元回执、2或4字节的全零命令状态、signed32/uint32整数，保留 SDK 原始 signed 返回值；不修改全局 prototype。ROM 安全证据在 stub 和写前由三个只读 eFuse 字段复核；只按六个物理key核对，通用wire第七字节仅保留诊断，不把key用途本身当保护启用。不可信读取、未知flags、真实保护或已烧录安全版本高于当前镜像仍拒写，不修改eFuse。官方依据见[校验说明](../../OWNER-FIRMWARE-TARGET.md#必要校验与兼容边界)。

## 可复现回归

寄存器回归使用生产 controller 与内存串口模型：

```sh
node tests/register-security-regression.mjs staging/register-regression
```

浏览器回归使用 Chromium，controller、端口选择及文件选择器由模型替代；它验证 UI 保存、取消及重入时序，不操作实际设备。已验证工具为 Node.js 24.19.0、Playwright 1.62.1 和 Chromium 151。为测试单独安装 Playwright，并通过 `CHROMIUM_PATH` 指定本机 Chromium 可执行文件：

```sh
npm install --prefix staging/test-tools --no-save --package-lock=false --ignore-scripts playwright@1.62.1
NODE_PATH="$PWD/staging/test-tools/node_modules" node tests/installer-flow-regression.mjs staging/ui-regression
```

浏览器 runner 默认使用标准系统 Chromium 路径，可用 `CHROMIUM_PATH` 覆盖。报告目录必须尚不存在。固定版本测试预期为寄存器、握手、实际Flash读取和浏览器流程；输出会记录 engine、模型、runner或页面模块摘要，应与当前文件核对。真实 USB 写入、启动、显示、操作系统文件选择器及物理掉电恢复仍需另行验证。

普通界面只有一个“连接并刷机”主按钮：同步发起浏览器设备选择，再并行连接和获取固件，必要检查完成后自动刷入。普通保留更新不弹额外确认；仅全新安装清空内部数据时弹一次确认。兼容双槽默认保数据；不确定分区/OTA先停写并说明原因；其他状态可明确另选干净重装，内部数据清空且TF/SD不动，完整备份可选。安装与设备核验可能需要数分钟，不承诺具体耗时。高级auto兼容接口仍保留全空新机扫描及单槽迁移备份约束，普通界面不默认进入单槽保留迁移。

全片回归使用实际生产controller和SDK，经内存协议端口核对完整16MiB内容、四镜像与其余FF、确认和错误保护：

```sh
node tests/clean-reinstall-regression.mjs staging/clean-regression
```

`prepare(candidate,{mode:'clean-reinstall'})`不要求旧布局白名单；`confirm(plan,{installAccepted:true,destructiveAccepted:true})`产生同计划一次性授权。该计划的`sha256`是源安装图摘要；成功回执为`verificationMethod:"device-md5"`、`readbackSha256:null`、`sha256ReadbackVerified:false`，`imageSha256`只表示源图，`targetAppSha256`另列应用摘要。设备实际MD5核对所有写入段，不再按段及整片重复下载SHA核验。协议opcode guard、原SDK/Transport类、镜像校验器和完整备份方法字节保持相同；接收loop仅在本session派生原方法并增加异常观察/致命退出点，finally释放不变。旧的 `tests/installer-regression.mjs` 对应早期准备合同，不是当前单按钮流程入口。

ROM→stub连接回归使用生产controller/SDK，覆盖ACK/OHAI正常、反序、无ACK后有OHAI、迟到非零ACK、coalesced/逐字节分片、错误状态长度/op、原始假OHAI、部分帧、断连和取消，全部零Flash写且MEM_END一次：

```sh
node tests/serial-handoff-regression.mjs staging/serial-handoff-regression
```

有限移交窗口沿用SDK的3秒默认值。OHAI先到时仍在同一窗口等待可选ROM ACK，不提前漏掉迟到错误应答；只允许已验证SLIP OHAI之后完全空的ACK窗口超时。错误状态、非法SLIP或部分帧不会当成功。不调高全局超时、不改baud/reset、不自动重放RAM操作。此模型覆盖兼容时序，不能推断某次设备现场的物理原因。诊断build字段区分安装器与握手组件，完整engine SHA见build.json。

READ_FLASH与接收错误定向回归使用真实4096字节帧、8194字节全转义帧、原生Web Streams错误/替换流与释放检查：

```sh
node tests/read-flash-regression.mjs staging/read-flash-regression
```

`connectFromUserGesture({board,model,mode:'clean-reinstall'})`仍从同步用户手势申请新的设备选择与ROM会话，在必要芯片/容量/安全检查后跳过旧Flash读取。普通auto保留方式不再读取旧应用整5MiB或按旧应用版本拒绝。实际IO失败不会被当作安全通过；重新清装须先关闭旧流且明确同意清空16MiB。准确协议与标准来源见[读取与核验说明](../../OWNER-FIRMWARE-TARGET.md#读取协议与核验结果)。

当前双槽策略从实际表读取地址，并按目标包必需分区 tuple 验证目标应用几何，允许表序/摘要变化。不以旧 bootloader 字节或应用版本拒写；NEW/PENDING 和未知 OTA 明确阻断，不自动清空。全 FF OTA 且无 factory 的兼容双槽正常写 ota_1。应用设备 MD5 后才提交另一 OTA 记录并回读校验。UI 随后调用单次 `restart()`：返回 `writeVerified`、`resetCommandSent`、`bootHealthVerified:false` 和独立错误；不把复位失败改写成刷写失败。RTS 按官方脉冲后释放，finally 尽力释放并关闭端口；仅 resetting 阶段抑制复位引发的接收结束/设备丢失自动取消。

本批有界开发自测：`node tests/dual-upgrade-regression.mjs NEW_REPORT_DIRECTORY`；UI runner 可用 `CASE_IDS` 逗号选择受影响用例。开发自测不等于独立 QA，真实设备启动和 USB 重新枚举未验。

应用 MD5 等待修复使用 `node tests/md5-deadline-regression.mjs NEW_REPORT_DIRECTORY`，可用 `CASE_IDS` 选择定向案例。SDK 按 `max(3000,8000*bytes/1000000)` 毫秒计算预算；3338288 字节应用为 26706.304 毫秒。只有不可变写计划已完成 FLASH_END、实际发送 opcode 19 且范围与 SDK 预算一致时才采用该预算；其他读取仍最多 5000 毫秒。专用每会话 MD5 读取从固定原 Transport.read 精确派生，只插入取消与单调时钟总截止检查，SLIP 解析不变；因此分片不能续期，取消不遗留长预算轮询。原 SDK/Transport 类未修改。MD5 回执严格校验方向、opcode、18 字节 payload、16 字节 digest 与两字节全零状态；value 字段仅诊断。FLASH_END 仍发送不复位参数，真实应用 MD5 通过前不提交 OTA 或复位。

诊断区分应用 ACK、FLASH_END 实际发出/应答、MD5 发出/收到/比对与 OTA 提交/回读，记录范围、预期/收到的摘要及时间，不含原始 Flash 内容。该缺陷可以产生通用空窗错误，但错误文本不证明物理噪声，也不保证本修复解决任一真实设备的全部问题。
