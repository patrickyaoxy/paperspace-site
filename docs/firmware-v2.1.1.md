# v2.1.1 stable 精简固件与 USB 安装

本固件使用源码 `3abe593b3ad208229aaf734b879af2f5081c6cec` 的 stable 精简配置和 ESP-IDF v6.1 构建。stable 表示功能渠道；当前软件验证不代表 GitHub Release 或真实硬件验收。此构建经过路径净化与 ELF 规范化，校验值与同标签的其他构建可以不同。

点击“连接并刷机”选择设备后，官网 USB 工具自动检查设备并获取、校验和刷入固定镜像，不需要下载 ZIP、选择本地固件或手选分区。仅适用于官网指定的 Read Pico / ESP32-S3 / 16 MiB 硬件；芯片识别不能单独证明板型。本精简版不包含独立 HTML 浏览器、PDF、应用中心、Lua 轻应用和开发者实验入口。网站 v2.0.8 浏览器体验及对应指南仍展示旧版能力。

## 安装路径与数据

- 兼容的可信双槽：自动保留数据更新，无普通升级确认弹窗，写入非启动槽并完整读回验证后提交 OTA；无需强制保存整片备份。
- 旧固件、未知或损坏分区、新设备：自动规划全新安装，写前只弹一次明确确认清空全部内部设置、阅读进度和文件，TF/SD 卡不改动。无需布局白名单、短语或强制备份；可在折叠的高级选项中先保存可选完整备份。TF/SD卡不改动；独立PMU中的屏幕VCOM标定不清除。

干净重装用匹配四镜像及其余全 FF 内容覆盖整个 16 MiB 内部 Flash，按不超过 64 KiB 分段擦写并做每段 MD5/SHA-256 读回，最后再核全片 SHA-256。全片传输与读回可能需要数分钟，不是掉电原子事务；断电、取消或失败可能导致暂时不能启动，需重新进入下载模式重装，或用匹配工具和已保存的完整备份恢复。网页无自动回滚。

Secure Boot、secure download、启用 Flash 加密、已烧录安全版本高于本镜像、不能可信读取的安全状态仍拒写。只读检查不会修改 eFuse；不要为安装关闭安全保护。S3只按六个物理key字段核对，不把通用协议第七字节非零误判为额外保护，依据见[校验说明与官方源码](../OWNER-FIRMWARE-TARGET.md#必要校验与兼容边界)。高级单槽保留迁移与全空新机扫描接口仍保留，各自必要前提不用于限制明确的干净重装。

## 文件与完整性

|文件|字节|SHA-256|
|---|---:|---|
|[应用](../firmware/v2.1.1/Read_Pico.bin)|3338288|`3bd0d10257bdad0020bc72ee7c4f37c0e3d26e2be41132a41f3c7ba4b34e7310`|
|[bootloader](../firmware/v2.1.1/bootloader/bootloader.bin)|21232|`de9684ab654050d83dbf651b5eeb2d9f42af1ac85a10277c6d1ba7a2f64b8b4e`|
|[分区表](../firmware/v2.1.1/partition_table/partition-table.bin)|3072|`cd4ff0257b302884afa9c8961a8d3ffa26851b03b8b97db3d602e04f0b88f5ae`|
|[初始 OTA 数据](../firmware/v2.1.1/ota_data_initial.bin)|8192|`7d2c7ac4888bfd75cd5f56e8d61f69595121183afc81556c876732fd3782c62f`|

固定地址和镜像关系见 [安装清单](../firmware/v2.1.1/manifest.json)；目标策略见 [配置说明](../OWNER-FIRMWARE-TARGET.md)。保留数据更新所接受的已登记旧 bootloader 只有精确 SHA-256 `2f3d2e3b17f259b5b2cedda68d214074a906860475d4b681bba97d20c2f0a316`，不据版本号推定其他底座兼容；干净重装会覆盖旧底座，无此白名单前提。

## 软件验证与复现

仓库提供[全片重装回归](../tests/clean-reinstall-regression.mjs)、[寄存器回归](../tests/register-security-regression.mjs)和[浏览器流程回归](../tests/installer-flow-regression.mjs)，命令及依赖见[维护说明](../scripts/engine-adaptation/README.md)。协议设备、端口选择与文件接口由模型替代；这不证明真实设备或系统文件选择器行为。

本轮改动仍须绑定最终候选做独立验收；软件读回不代表启动、显示、硬件兼容或物理掉电恢复通过，上述真机项目尚未验证。引擎可复现来源与完整摘要见[构建记录](../real-flash/build.json)。

## 来源与许可

paperspace 基于 MindReset 的 Read Pico Demo Firmware 二次开发，独立维护，并非上游官方发布。来源、版权及许可见 [许可与鸣谢](../legal.html)。[对应重链接材料](../downloads/paperspace-v2.1.1-stable-esp32s3-relink-materials.zip)包含必要的已编译应用对象、修改版库源码、链接脚本和许可证，不含私有应用 C/C++ 源码。编译对象可被反汇编分析，接收者可按许可替换库后重链接、安装及为调试修改进行必要逆向。

材料 ZIP 为 9391512 字节，SHA-256 `99aae319373d20174184c10a514cfcae8dabbbfacb334681b73afdd01c01f2de`。ZIP 使用 LZMA 方法14，可用 Python 3 解包：`python3 -m zipfile -e paperspace-v2.1.1-stable-esp32s3-relink-materials.zip relink-materials`。设备安装由官网自动获取镜像；普通刷机无需先下载该材料包。
