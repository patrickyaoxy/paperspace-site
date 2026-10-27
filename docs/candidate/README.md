# v2.0.8 官网本地候选准备

官网基线：`paperspace-site` main `244bfb7e2ed78678e1f302e75cca9d355af86512`。2026-10-27 以 `git ls-remote` 实核后 clone；本轮未远端写入、发布、创建凭据、连接设备或写设备。生产 `firmware-target.json` 保持 `enabled:false,target:null`。

规则来源：`elink-reader` 规范提交 `917c662bb18101cbc4fe422ccac2b5021e8ef973` 的根 AGENTS §1/2/2b/5/6/7、规范索引、开发与验收的“入口自测 / 冻结后的定向验收 / 交付”。本目录为官网单写区；未修改固件或构建区，未执行 S3 构建。当前检查为开发自测，不能由作者独立签发最终 QA。

项目基于 MindReset 的 Read Pico 官方 Demo Firmware 二次开发，由 paperspace 独立维护；现有 README、legal.html#project-origin 与 Apache 原文已保留来源，不需再改产品功能。

## 已有能力与最小接入

`real-flasher-ui.js` 和 `real-flash/engine.js` 已有固定 schema 3 策略、精确源码/版本/六分区合同、逐文件大小与 SHA-256、用户手势串口授权、机型确认、实际安全状态/容量/分区读取、完整 16 MiB 备份、当次短语确认、自动规划与无整片擦除。计划支持全片 FF 空白机、精确白名单单槽（WL v2/4096/FAT12 或全 FF 的 5 MiB 存储）、受信 bootloader 与可信 OTA 记录的双槽；未知布局和 bootloader 拒写。取消、离页、旧确认失效与端口关闭不确定锁已有实现。

不重写现有引擎。拿到获准的真实原始包与独立审查输入后，运行生成器，将固定文件放进新的本地 staging，交给生产公开策略加载器核验；正式 target 的切换与网站发布仍属于后续动作。

## 可重复检查

环境：Node v24.19.0、Python 3.12.14、系统 Chromium、环境自带 `playwright`。不用 npm 安装依赖。浏览器仅访问临时绑定 `127.0.0.1` 的服务。生产代码未打补丁；UI 测试通过 route 替换成内存控制器，系统串口禁止访问。

```sh
node tests/installer-regression.mjs
python3 tests/prepare-target-regression.py
```

默认证据路径为 `evidence/local-checks/`。首个脚本可用 `REPORT_PATH` 另存纠正/补验结果，`CHROMIUM_PATH` 指定已安装浏览器。不要覆盖失败证据。2026-10-27 首轮：浏览器 26 项通过，生成器 7 项通过；补入精确旧表后新增 3 项生产策略正负控，共 29 项通过，另存 `installer-regression-known-layout.json`。浏览器报告分别绑定真实 engine/UI/live target SHA-256；生成器报告绑定脚本 SHA-256。

|证据|覆盖|限制|
|---|---|---|
|真实 engine 公开 API，13 项|关闭策略、未认证策略、固定下载、错误 hash、未知字段、源码/分区/bootloader合同/URL/地址错误；精确旧表合同正控、旧存储容量/NVS变化负控|下载向量是合成字节，只测策略和下载，不证明 ESP 镜像或设备兼容|
|真实 UI + 隔离控制器，16 项|不可用/下载失败、三种计划、备份与短语、只读阻断、未知表/底座/未确认启动、坏回执、ACK未完成、取消、错误读回、完成未承诺启动、离页、端口关闭不确定|控制器返回预设计划；不执行真实 SDK 协议、迁移算法或设备写入|
|真实生成脚本，7 项|合成正控、manifest pin、路径逃逸、antiRollback、坏镜像、已知单槽、存储不等长|不是真实固件或真机验收；实际包到位后须补验|

公共官网仓库仅保留打包引擎与来源 hashes（`real-flash/build.json`），没有其 `entry/policy/session/validation/ota/wl-storage.mjs` 或原有协议回归。原冻结 candidate `8afecc876` 未取得；七个生产源码 hash 不能证明旧“7/7”测试身份，旧结果不继承。本轮另建公开控制器黑盒协议回归，engine 原字节执行，没有追加 export、替换函数或复制生产规划/解析算法；新结果及边界单列。真实硬件启动/显示/数据/掉电恢复另列待验。

## 固定目标生成器

```sh
python3 scripts/prepare-firmware-target.py \
  --package "${PACKAGE_DIR}" \
  --trust "${REVIEWED_TRUST_JSON}" \
  --out staging/v2.0.8-prepared
```

输出目录必须不存在。脚本不修改 `firmware-target.json`，也不复制 SDK 配置、私有源码或 trust 文件到可分发固件目录；只输出四个原始镜像、原始 manifest、`firmware-target.candidate.json` 和准备收据。候选 JSON 的 `enabled:true` 仅供隔离测试使用，不自动装入官网。生成器从本次真实 `flasher_args.json` 读取固定偏移并比对 manifest，不能以 update.bin 或 merged.bin 替代四镜像。

trust JSON 必填字段如下，所有文件路径相对 trust 文件所在目录，禁止绝对路径/逃逸。不要猜测 board/model 或从包内自报 hash 代替独立 manifest pin。

|字段|要求|
|`manifestSha256`|审查后独立钉住的原始 manifest SHA-256|
|`board`, `model`, `project`|准确板型、机型和 app descriptor 工程名|
|`sdkconfig`|本次构建的真实配置文件；rollback=y 且 antiRollback 未启用|
|`knownLayouts`|数组；每项 `id, partitionFile, storageMigration`。存储合同精确字段 `method:"byte-copy", format:"esp-idf-wl-fat", sectorSize:4096, sourceLabel, targetLabel`。从真实旧表导出完整行与 hash，NVS/PHY 原位、存储等长；不按版本猜布局|
|`acceptedBootloaders`|数组；每项 `file, sdkconfig, contract`；contract 精确为 `idfVersion:"v6.1", rollback:true, antiRollback:false`。每个旧底座需自己的构建配置证据。空数组表示仅目标自身受信，不证明旧底座已兼容|

生成器会核 ESP32-S3 envelope、段边界、XOR checksum、附加 SHA-256、app descriptor、分区表 MD5/flags/范围/重叠、全 FF otadata、manifest 与镜像对应、精确六分区与迁移合同。它现已前置核对生产引擎的 `manifest.files` 1..100 项限制，避免完整 archive 清单误作安装清单；该单行门禁修正只补旧191项拒绝/新4项接受2项检查，既有生成器7项不重跑，旧报告仍绑定原脚本身份。它不替代生产 SDK 镜像验证、许可/重链接/隐私审查，也不把 `hardware:NOT_TESTED` 改成真机通过。

## 已登记的一种精确旧表

`compatibility/v1.6.16-single-slot/` 的 CSV 来自固件提交 `6e393965f4a53250023a576951080373068ec05e` 的 `firmware/read_pico_firmware/partitions_16M.csv`（blob `ce1d0134175eb9ec7b4f433ec79f39b7e69b0200`），由实际 IDF v6.1 `gen_esp32part.py` 生成 3072 字节表，SHA-256 为 `ceb0bf03239c94c30fa19226d32a32ba7cbcabe3c643fda81287662a824e47ec`。完整来源、命令、工具与文件 hashes 见 `provenance.json`。旧四分区：NVS 0x9000/0x5000、PHY 0xE000/0x1000、factory 0x10000/0x600000、storage 0x610000/0x500000。该表通过现有 schema 合同；运行时仍须核精确 hash/完整行与 WL/FAT 或全 FF 存储，不据此承诺所有旧机兼容。历史双槽 bootloader 没有可信可恢复证据，名单仍为空，只自动接受目标自身底座。

## 实际安装输入与最终独立 QA

本地已接入经审固定包的四个原始镜像，位于 `firmware/v2.0.8/`。来源 `79f2f5ad303b9a588d551e3e0eb4b6e5735bc56b`，Read Pico / ESP32-S3 / 16MB / Zbit，工程 `Read_Pico`。app 为移除调试信息后由官方工具生成的最终镜像，4160944 字节，SHA-256 `71c977630f11a970b7b16c9a7bc29d9e67ea19a0f823093fb17add25102ee76f`。未复制构建 sdkconfig 或私有源码到网站固件目录。

最初完整 archive manifest SHA-256 `cf94d104215412d0e4ec61098c0ffdce1d70096059b3e1c70e0f2acd816d7971` 有191项 files；下载检查通过，但真实生产 `prepare()` 因上限100项拒绝，0 Flash写入。原FAIL保留在 `evidence/local-checks/original-manifest-prepare-failure.json`，完整原始日志私下留存；旧 `d263139` 不能据原下载检查视为可安装。现网站单独使用只列四镜像的安装 manifest SHA-256 `c03d3958c77228a99d866141d4eaa2262cb4385867c85094ad9ff9f779b572e2`；四镜像逐字不变、其他元数据不变，原 archive manifest/ZIP不改。派生链见 `install-manifest-provenance.json`。

经审启用候选为 `candidates/firmware-target.v2.0.8.json`，SHA-256 `bc68d65ca9f1a2a059ab59be32fe0ec3520027e507cd48ed1553b991ed4ff208`，供最终发布负责人审查切换；根目录正式 `firmware-target.json` 始终保持关闭。候选启用状态不等于已公开安装服务、已发布或已通过真机验证。

新 ESP32-S3 材料位于 `downloads/paperspace-v2.0.8-esp32s3-relink-materials.zip`，14238608 字节，SHA-256 `2f20bbc2c512783735da5e799443c857c37bcefd058dd504058f28ebbcc9848f`；同名 `.sha256` 文件与 `legal.html#esp32s3-materials` 提供独立入口。包内 `relink-plan.json` 的参考 app 精确匹配上述最终镜像，包含必要应用对象、修改版 epdiy 源、头文件、链接脚本、许可与替换重链接许可。既有浏览器 WASM 材料链接和字节保持原样。未提供固件 ZIP 下载链接；下载帮助说明已明确安装时自动获取固定原始镜像。

```sh
node tests/real-target-download.mjs
```

最初真实包接入6项检查记录在 `evidence/local-checks/real-target-download.json`，只覆盖当时的 owner policy/五文件下载散列、身份、损坏下载拒绝、无串口请求和正式目标关闭；该旧报告没有覆盖 `prepare/execute`，不能把它扩写成安装通过。原生成收据 `real-target-preparation.json` 与新安装输入收据 `install-target-preparation-fixed.json` 分别保留，不覆盖旧证据。未重复不变的29项UI/策略检查。

材料入口追加 13 项有界文档与文件接入检查，全部通过，记录 `evidence/local-checks/esp32s3-material-link-delta.json`：精确大小/hash、校验文件、独立入口、本地链接可达、浏览器材料保留、材料内参考镜像和说明/许可身份、Public Beta 与工具链边界、主流程无 ZIP 选择、无固件 ZIP 下载链接、正式 target 关闭、公开文档无本机编译路径。`node --check app.js` 与差异检查通过；未重跑不变的 29+7+6 项。文档 delta 的独立 QA 另行记录。

## 新协议 / 迁移 / WL-FAT 必要组

新组共14个子场景通过，摘要 `evidence/local-checks/new-protocol-regression-summary.json`；不是继承旧“7/7”。生产 engine SHA-256 `f82fa742ef5ecb838d4ca28a4cfe2e5d946056e06c65409ab9bf1ed6a677fc43` 原字节执行，公开 `loadOwnerPolicy/createController` 驱动内存 Web Streams 串口，真实执行 esptool-js SYNC、安全检查、官方 stub RAM 上传、Flash 协议及生产 session 的 prepare/backup/confirm/execute。未追加 export、替换生产函数或复制生产算法。

覆盖7类风险：旧191项输入拒绝/新4项输入接受；完整空白安装与备份短语门禁；精确单槽真实 WL/FAT12 根文件及全FF存储搬移；可信双槽非启动槽写入且完整读回先于另一OTA扇区提交；未知表/底座、坏CRC/pending OTA与坏WL/FAT的拒写/只备份边界；实际写失败和坏读回不提交；首块ACK后取消、代际失效与旧确认拒绝。未知历史双槽 bootloader 不能生成网站 backup plan，不能称为可备份升级。

官方 IDF 生成的两根文件、0子目录、5MiB WL/FAT12 正控经完整16MiB备份与实际搬移通过（76.378秒），新旧存储逐字一致，NVS/PHY保持；夹具 SHA-256 `dedccdb023778fd16c02f1e015698a93b807ff0dade6ec9231876d94e8442fc8`。完整空白82.518秒与可信双槽82.313秒等原始耗时逐项见摘要。已通过项未为交状态重复运行。

原官方 Python 子目录夹具的迁移正控 FAIL 保留，原因 `FAT_DOT_DIRECTORY`，0 Flash写入：该生成器将虚拟root簇1写入子目录`..`，与运行时FatFs根父引用0不同，生产解析器安全拒写且允许备份。未改原夹具或放宽parser；目录迁移正控明确 **NOT_RUN**，根文件正控不证明所有目录/文件系统状态。原始测试源码、完整报告与命令日志在私有协议执行材料中留存，公开摘要绑定其hash。真实硬件、启动健康、显示、物理掉电/回滚行为仍未测。

最终冻结需要记录实际候选 SHA/tree、完整 diff、生产引擎和 UI 身份、真实包/工具/配置 hashes，并由不同执行者执行独立检查。本地合成回归通过不能替代该责任。
