# 官网固件目标配置

唯一入口是网站根目录 `firmware-target.json`。当前启用 Read Pico / ESP32-S3 / 16MB / Zbit 的 v2.1.1 正式渠道精简测试候选固定目标，USB 安装自动下载并核验原始镜像，访客不必选择 ZIP、本地固件包或应用槽。只有网站维护者修改固定目标；连接须访客主动操作，并仅连接适用板型；干净重装备份可选，写入前明确确认清空内部数据。ESP32-S3 对应重链接材料由许可页独立提供；本构建尚未完成真机验证，不能用合成向量或软件读回结果替代真实启动/显示/数据验收。

## 指定目标的最少步骤

1. 将已获分发授权且完成校验/隐私审查的原始镜像、manifest 和对应许可/重链接材料放入版本化目录。必须区分正式/探索功能渠道与候选/正式发布阶段；正式渠道测试候选不能写成已完成真机验收或 GitHub Release。不能公开私人工作区、应用 C 源、账号或用户数据。
2. 在本文件所述 schema 3 中填入包的精确身份、各文件真实地址/字节数/SHA-256、目标表，以及经审查的旧布局与 bootloader 契约。镜像地址必须来自这次构建的实际 `flasher_args.json`，不可把 `update.bin` 当固定地址安装镜像。维护者配置是信任来源，包内自报 hash 不能替代它。
3. 在隔离测试中验证包、布局、备份、取消和故障路径后更新官网。页面“重新检查固件 / 重试下载”读取同源固定配置，不接受访客覆盖 manifest URL。网站发布不会自动刷设备。

本构建不含独立 HTML 浏览器、PDF、应用中心/Lua 轻应用与开发者实验入口；v2.0.8 浏览器体验及对应指南保留旧身份。生成器须核本次完整 sdkconfig 的 stable 配置和 app offset 288 的 32 字节正式渠道记录，并以精确镜像 hash 绑定；schema 3 不新增渠道字段，也不宣称支持同版本跨渠道更新。

## schema 3

顶层精确字段为 `schema:3, enabled, unavailable_reason, target`。关闭时 `target:null`，给出明确原因。启用后的 target 需包含以下信息（必须填真实值，不提供可直接启用的虚构示例）：

|字段|含义|
|---|---|
|board / model|操作者需确认的准确硬件板型；芯片识别不能证实板型|
|project / version / idfVersion / sourceSha|与 app descriptor、来源和实际构建对应；当前固定 2.1.1 / stable / v6.1 / 3abe593b3ad208229aaf734b879af2f5081c6cec|
|manifest|固定 url、sha256、bytes；schema1 独立安装清单，仅列四个实际镜像，完整 archive 清单不直接用于安装|
|images|bootloader、partitionTable、app、otaData；每项 file、url、sha256、bytes、address|
|partitions|目标分区的完整有序行 `[name,type,subtype,address,size]`，与原始表逐项匹配|
|knownLayouts|保留数据迁移所用的精确旧单槽表 hash、完整行和内部存储契约；不限制干净重装|
|bootloaderContract|经构建证据核定的 IDF / rollback / antiRollback 契约，不能凭二进制名字填写|
|acceptedBootloaders|保留数据双槽更新所用旧 bootloader 白名单，每项 bytes、sha256、idfVersion、rollback、antiRollback；干净重装会覆盖旧底座|

当前目标六分区：NVS 0x9000/0x5000、PHY 0xE000/0x1000、ota_0 0x10000/0x500000、storage 0x510000/0x500000、ota_1 0xA10000/0x500000、otadata 0xF10000/0x2000。bootloader 地址 0x0、分区表地址 0x8000；app 与全 FF 初始 otadata 必须来自匹配包。完整安装参数不能直接用作保留数据的双槽更新。

## 安装方式与数据影响

连接只检查适用芯片、容量、安全状态和当前布局，不发送 Flash 擦写命令。界面默认推荐可验证的双槽保留数据更新；其他状态显示“干净重装（清空内部数据）”，用户点击明确的重装按钮并确认一次后才写入。无需输入短语或先保存整片备份。可选完整备份在清装计划下也能读取，未知分区无需先通过迁移格式检查；保存后关闭文件并回读 SHA-256 才显示保存成功。

- 保留数据双槽更新：核对真实表、受信 bootloader、CRC/状态/启动选择及启动镜像；写非启动应用，先完整读回验证，再提交 OTA 元数据。保留 NVS、PHY、内部 FAT 和原有效启动记录，不自动重启。旧布局或底座白名单仅用于证明此保留方式安全。
- 干净重装：将匹配的四镜像放入全 FF 的 16 MiB 安装图，使用已有受控 FLASH_BEGIN/DATA 在 `[0,16777216)` 内覆盖，按不超过 64 KiB 分段擦写，每段做 MD5/SHA-256 读回，再做全片 SHA-256 核验；不使用无边界的整片擦除命令。内部设置、进度、文件及原应用全部清空，TF/SD 卡不改。未知旧 bootloader、损坏/未知分区均可使用此路径，无需旧布局白名单。镜像校验和适用硬件要求保持不变。
- 引擎兼容接口仍保留 `prepare(candidate,{mode:'auto'})` 的全空新机扫描和已知单槽保留迁移。后者仍需真实布局、兼容 WL/FAT12、完整备份保存及等长搬移；普通界面不默认引导单槽用户走此高级路径。

## 必要校验与兼容边界

|校验|原因|
|---|---|
|ESP32-S3、有效 MAC、16 MiB RDID|匹配固定镜像与写入上界；芯片不能证明实际 Read Pico 板型|
|官网固定策略、四镜像 hash、S3镜像封装/版本和固定地址|防止下载损坏、错包与越界；不接受任意URL或固件|
|ROM 安全信息与只读 eFuse 交叉核验|读取失败不视为零；Secure Boot、secure download 或启用 Flash 加密不兼容本镜像|
|非零已烧录安全版本|高于目标应用 secure_version=0 时拒写；此计数不单独证明硬件正在强制 antiRollback|
|未知 flags、格式或 ROM/eFuse 不一致|安全语义不确定时停止，诊断保留原字段；不写 eFuse|
|写前 MAC/RDID、eFuse 和本计划只读前提再核|防止设备替换或状态变化；确认仅能消费一次，不能移用于其他计划|
|写入 ACK 后 MD5 与 SHA-256 完整读回|ACK 或部分完成不能当作成功；真机启动仍须另验|

Flash 厂商没有品牌白名单；有效 RDID 与容量才是协议校验依据。仅连接官网指定 Read Pico 硬件，不承诺同芯片的所有开发板均能启动。密钥用途本身不表示已启用保护：S3只有六个物理key block；通用安全信息的第七个wire字节保留诊断，不据其非零拒写，也不推断该字节具体来源。

依据官方主代码：[S3物理key范围](https://github.com/espressif/esptool/blob/v4.6.2/esptool/targets/esp32s3.py#L165-L179)、[通用七wire槽解析](https://github.com/espressif/esptool/blob/v4.6.2/esptool/loader.py#L826-L846)、[esptool-js 0.7.0](https://github.com/espressif/esptool-js/blob/v0.7.0/src/esploader.ts)。六个物理字段仍与实际 eFuse 一致性检查。

## 失败与恢复

干净重装不是掉电原子事务。取消、拔线、切页或错误只停止后续命令，已擦写范围不会回滚；未保存的数据不能恢复。全片传输与读回耗时取决于设备/连接，可能需要数分钟；每次分段擦写需等设备响应；分段用于避免一次大容量擦除超过现有传输等待上限，实际耗时仍待真机验证。中断后可重新进入下载模式重装，或由设备负责人用匹配工具和事先保存的完整备份恢复。双槽更新中断应先核实际启动情况，再重新读取与规划；重新连接不复用旧确认。

软件读回成功不证明真实启动、显示、硬件兼容、回滚或物理掉电恢复。开发与独立验收使用内存协议端口，真实设备结果须单列。不要为刷机修改 eFuse 或关闭保护。

## 生成器输入

在仓库根目录运行 `python3 scripts/prepare-firmware-target.py --package PACKAGE_DIRECTORY --trust TRUST_JSON --out staging/prepared-target`。输出目录必须尚不存在；生成器不直接修改根目标。

`TRUST_JSON` 中的文件路径均相对该 JSON 所在目录，禁止绝对路径或逃逸。必填字段为 `manifestSha256`、`board`、`model`、`project`、`sdkconfig`、`knownLayouts` 与 `acceptedBootloaders`。`sdkconfig` 指向本次构建配置；安装目录必须含本次实际 `flasher_args.json` 与四镜像安装清单。

每个 `knownLayouts` 项包含 `id`、`partitionFile`、`storageMigration`；后者精确字段为 `method:"byte-copy"`、`format:"esp-idf-wl-fat"`、`sectorSize:4096`、`sourceLabel`、`targetLabel`。每个 `acceptedBootloaders` 项包含 `file`、`sdkconfig`、`contract`；当前合同为 `idfVersion:"v6.1"`、`rollback:true`、`antiRollback:false`，每个底座必须有各自匹配证据。

输出包括版本化四镜像与安装清单、`firmware-target.candidate.json` 和准备收据。维护者须核生成结果与实际镜像，再决定是否更新网站根目标；不能从包内自报摘要代替独立核定的清单身份。
