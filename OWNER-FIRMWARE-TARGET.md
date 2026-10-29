# 官网固件目标配置

唯一入口是网站根目录 `firmware-target.json`。当前启用 Read Pico / ESP32-S3 / 16MB / Zbit 的 v2.1.1 正式渠道精简测试候选固定目标，USB 安装自动下载并核验原始镜像，访客不必选择 ZIP、本地固件包或应用槽。只有网站维护者修改固定目标；连接须访客主动操作，并仅连接适用板型；干净重装备份可选，写入前明确确认清空内部数据。ESP32-S3 对应重链接材料由许可页独立提供；本构建尚未完成真机验证，不能用合成向量或软件读回结果替代真实启动/显示/数据验收。

## 指定目标的最少步骤

1. 将已获分发授权且完成校验/隐私审查的原始镜像、manifest 和对应许可/重链接材料放入版本化目录。必须区分正式/探索功能渠道与候选/正式发布阶段；正式渠道测试候选不能写成已完成真机验收或 GitHub Release。不能公开私人工作区、应用 C 源、账号或用户数据。
2. 在本文件所述 schema 3 中填入包的精确身份、各文件真实地址/字节数/SHA-256、目标表，以及经审查的旧布局与 bootloader 构建资料。镜像地址必须来自这次构建的实际 `flasher_args.json`，不可把 `update.bin` 当固定地址安装镜像。维护者配置是信任来源，包内自报 hash 不能替代它。
3. 在隔离测试中验证包、布局、备份、取消和故障路径后更新官网。高级选项中的“重新检查官网固件”读取同源固定配置，不接受访客覆盖 manifest URL。网站发布不会自动刷设备。

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
|acceptedBootloaders|旧 bootloader 来源资料，每项 bytes、sha256、idfVersion、rollback、antiRollback；当前保留更新不以字节白名单为门禁，干净重装会覆盖旧底座|

当前目标六分区：NVS 0x9000/0x5000、PHY 0xE000/0x1000、ota_0 0x10000/0x500000、storage 0x510000/0x500000、ota_1 0xA10000/0x500000、otadata 0xF10000/0x2000。bootloader 地址 0x0、分区表地址 0x8000；app 与全 FF 初始 otadata 必须来自匹配包。完整安装参数不能直接用作保留数据的双槽更新。

## 安装方式与数据影响

常驻说明展示适用机型、断电和数据风险。点击唯一主按钮“连接并刷机”会立即申请浏览器设备选择，随后连接检查与官网固件获取并行；全部必要校验完成后自动刷入。兼容双槽保留数据更新，无额外普通升级确认。分区或 OTA 无法安全判定时明确停写，不自动转清空；空白、单槽或未知设备可另选全新安装，并只弹一次明确清空全部16 MiB内部设置、阅读进度和文件的确认。拒绝则零写入。TF/SD卡不改动；独立PMU中的屏幕VCOM标定不清除。备份折叠在高级选项中：可先只读连接，再在独立点击中保存完整备份，关闭文件并回读SHA-256才显示保存成功；它不是全新安装的门槛。未知分区无需先通过迁移格式检查。

- 保留数据双槽更新：从设备实际表解析两 OTA 槽和 otadata，按目标包必需分区的名称、类型、地址和大小逐项核对；不要求分区表摘要或条目顺序相同。目标应用自身有布局约束，不符时以 `APP_LAYOUT_INCOMPATIBLE` 列出差异并停写。不读取旧 bootloader 白名单或原应用版本。OTA 以 CRC、状态、序号判定启动选择（不能证明原运行槽）；全 FF 且无 factory 的双槽按 ota_0 默认选择，NEW/PENDING_VERIFY 和未知记录明确阻断。写非选中应用槽，经设备 MD5 后才提交另一 OTA 记录并读取核验；原槽、底座、表、NVS、PHY 和 storage 保留。写入核验后自动发送一次 hard_reset，关闭端口，分别记录写入已验、复位指令已发送和启动健康未验。
- 干净重装：将匹配的四镜像放入全 FF 的 16 MiB 安装图，使用已有受控 FLASH_BEGIN/DATA 在 `[0,16777216)` 内覆盖，按不超过 64 KiB 分段擦写，每段从设备计算实际 Flash MD5 并与源段比较；不使用无边界的整片擦除命令。内部设置、进度、文件及原应用全部清空，TF/SD 卡不改。未知旧 bootloader、损坏/未知分区均可使用此路径，无需旧布局白名单。镜像校验和适用硬件要求保持不变。
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
|写入后设备 MD5 对照固定源段|下载镜像仍核官网 SHA-256；不把 ACK 或源图 SHA 当作设备成功，真机启动另验|

Flash 厂商没有品牌白名单；有效 RDID 与容量才是协议校验依据。仅连接官网指定 Read Pico 硬件，不承诺同芯片的所有开发板均能启动。密钥用途本身不表示已启用保护：S3只有六个物理key block；通用安全信息的第七个wire字节保留诊断，不据其非零拒写，也不推断该字节具体来源。

依据官方主代码：[S3物理key范围](https://github.com/espressif/esptool/blob/v4.6.2/esptool/targets/esp32s3.py#L165-L179)、[通用七wire槽解析](https://github.com/espressif/esptool/blob/v4.6.2/esptool/loader.py#L826-L846)、[esptool-js 0.7.0](https://github.com/espressif/esptool-js/blob/v0.7.0/src/esploader.ts)。六个物理字段仍与实际 eFuse 一致性检查。

## 失败与恢复

干净重装不是掉电原子事务。取消、拔线、切页或错误只停止后续命令，已擦写范围不会回滚；未保存的数据不能恢复。全片传输与读回耗时取决于设备/连接，可能需要数分钟；每次分段擦写需等设备响应；分段用于避免一次大容量擦除超过现有传输等待上限，实际耗时仍待真机验证。中断后可重新进入下载模式重装，或由设备负责人用匹配工具和事先保存的完整备份恢复。双槽更新中断应先核实际启动情况，再重新读取与规划；重新连接不复用旧确认。只读检测发生实际IO错误时，先关闭原会话；可另选“全新安装”触发新的浏览器设备选择与ROM安全检查，并跳过旧分区、bootloader和OTA读取。关闭不确定时不能新连或刷写。

连接诊断包含安装器build和connection.stage、lastOpcode、handoff字段。ROM→stub移交只发送一次MEM_END，以完整SLIP OHAI证明已启动；ROM ACK可缺失或与OHAI反序，收到的ACK仍核对response/op/length/status。未知错误帧、非零状态、部分帧超时、断连或缺OHAI均停止，不自动重放RAM命令。依据[官方Python ROM mem_finish说明](https://github.com/espressif/esptool/blob/v4.8.1/esptool/loader.py#L807-L822)与[esptool-js 0.7.0](https://github.com/espressif/esptool-js/blob/v0.7.0/src/esploader.ts)。通信超时本身不证明物理噪声或安全保护，具体设备原因仍须实际验证。

设备MD5核验通过不证明真实启动、显示、硬件兼容、回滚或物理掉电恢复。开发与独立验收使用内存协议端口，真实设备结果须单列。不要为刷机修改 eFuse 或关闭保护。

官网候选下载的清单与四镜像共享固定300秒总预算；每个请求响应头等待和无新增解码数据等待各限30秒，收到新字节只刷新停滞计时，不延长总预算。owner配置小请求保留15秒。gzip传输的`Content-Length`可能是压缩字节数；完整解码后的固定长度和官网SHA-256仍须全部通过。取消/首次错误会中止下载，晚结果不登记候选，不自动重试；下载成功仍须通过设备写前校验。可复制日志区分超时阶段、HTTP、fetch、长度、摘要与取消，并保留文件、计数和预算；单凭fetch错误无法确定底层原因。

应用完整 ACK 后仍需等待设备计算 MD5。SDK 的大小预算为 `max(3000,8000*bytes/1000000)` 毫秒，本版3338288字节应用为26706.304毫秒；超过5000毫秒的预算仅在已完成写计划的精确MD5命令内使用，其他读取保持5000毫秒上限。MD5采用单调时钟总截止时间，分片不延长预算；取消、断连、非法应答或摘要不匹配均停止，应用MD5真实通过前零OTA提交、零复位。诊断区分应用ACK、FLASH_END发出/应答、MD5发出/收到/通过及OTA提交/回读，并保留摘要、范围和耗时；不记录原始Flash内容。通用“Serial data stream stopped”也可由等待空窗产生，不能据此确定线路噪声或设备断开。

双槽提交前保留实际分区/OTA读取、解析与最初SHA-256检查。应用MD5通过后，安全与身份再次复核，分区表4KiB和OTA8KiB各用实际设备MD5与已完整实读字节的摘要核对，合并重复的大包读取；只读授权仅覆盖不可变计划内的精确范围，预算仍为SDK的3000毫秒。写入新OTA完整4KiB扇区且设备MD5通过后，使用旧8KiB快照拼入拟写完整4KiB扇区，再以设备整体8KiB MD5匹配确认原记录及新记录，并解析已验证期望字节。此结果明确称`device-md5-verified-expected-OTA`，`otaRawReadbackPerformed:false`，不假称原始读回；应用MD5事实独立保留。提交前不一致则不提交，提交后不确定则不自动重试或复位。原READ_FLASH在stub生命周期上合法，现场首数据帧未完成的唯一物理原因仍未知。

## 生成器输入

在仓库根目录运行 `python3 scripts/prepare-firmware-target.py --package PACKAGE_DIRECTORY --trust TRUST_JSON --out staging/prepared-target`。输出目录必须尚不存在；生成器不直接修改根目标。

`TRUST_JSON` 中的文件路径均相对该 JSON 所在目录，禁止绝对路径或逃逸。必填字段为 `manifestSha256`、`board`、`model`、`project`、`sdkconfig`、`knownLayouts` 与 `acceptedBootloaders`。`sdkconfig` 指向本次构建配置；安装目录必须含本次实际 `flasher_args.json` 与四镜像安装清单。

每个 `knownLayouts` 项包含 `id`、`partitionFile`、`storageMigration`；后者精确字段为 `method:"byte-copy"`、`format:"esp-idf-wl-fat"`、`sectorSize:4096`、`sourceLabel`、`targetLabel`。每个 `acceptedBootloaders` 项包含 `file`、`sdkconfig`、`contract`；当前合同为 `idfVersion:"v6.1"`、`rollback:true`、`antiRollback:false`，每个底座必须有各自匹配证据。

输出包括版本化四镜像与安装清单、`firmware-target.candidate.json` 和准备收据。维护者须核生成结果与实际镜像，再决定是否更新网站根目标；不能从包内自报摘要代替独立核定的清单身份。

## 读取协议与核验结果

实际使用的 ESP32-S3 stub 为 esptool-js 0.7.0 内置 set2 的 esp-flasher-stub v1.2.2。READ_FLASH 请求的第三字段为4096字节帧，第四字段仍为SDK的1024；该stub实现固定单包窗口，收到裸累计字节ACK后继续，全部数据ACK后发送16字节MD5。最坏全转义数据帧为8194字节，Web Serial以64KiB缓冲打开，而非标准默认255字节。接收原生错误会保留真实name/count/stage；关键IO失效或会话已取消即退出reader并正常释放锁，不吞丢失后继续当前计划。该防护不证明任一次超时的现场原因一定是溢出。

依据：[准确stub读取实现](https://github.com/espressif/esp-flasher-stub/blob/23959b780454adf885916d42f2274ec648e96a94/src/command_handler.c#L764-L844)、[Web Serial标准](https://wicg.github.io/serial/)、[Chrome的接收错误和缓冲说明](https://developer.chrome.com/docs/capabilities/serial)。连接诊断仅含readStart/readExpected/readReceived/currentStep等计数与状态，不存Flash原始payload。

写后成功回执为 `verificationMethod:"device-md5"`、`md5Verified:true`、`readbackSha256:null`、`sha256ReadbackVerified:false`；`imageSha256`只描述已固定的源安装图。设备MD5与本地源段比较通过才算完成，不重复每段和整片SHA下载校验。双槽保留数据更新仍验证启动选择与OTA提交；不声称已读取验证旧应用或实际启动健康。失败可复制必要日志，剪贴板被拒绝时提供只读文本选择回退，不假报已复制。普通页面不加载或显示协议演练、本地包检查与开发调试入口。

硬复位仅在当前会话写入和 OTA 提交已验后授权一次：先释放 DTR，再 RTS assert→100 ms（Espressif USB 200 ms）→release，USB 再等待 200 ms。依据 [Espressif esp-pylib 1.2.0](https://github.com/espressif/esp-pylib/blob/v1.2.0/esp_pylib/serial_reset.py)。复位失败保留写入核验回执，绝不声称已经启动；取消时尽力释放 RTS 并关闭端口。接收结束/断连的预期抑制仅限这一复位阶段，物理复位、重新枚举、首次健康确认和显示仍待真机验证。
