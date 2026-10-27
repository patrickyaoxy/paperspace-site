# 第三方来源与许可

`dist/real-flash/engine.js` 由本项目应用槽恢复适配层和以下固定运行依赖组成，无 CDN 运行时依赖。适配层没有修改 npm 上游源文件；额外实现了严格镜像 envelope 校验、协议范围保护、串口 writer finally 释放及有界关闭。

|组件|固定版本|上游与许可全文|
|---|---|---|
|esptool-js|0.7.0，npm gitHead `4d8e8fe092f3425a4b85d1e883f4cc078a5efdd3`|Copyright (c) 2023 Espressif Systems (Shanghai) Co. Ltd.；[Espressif 上游](https://github.com/espressif/esptool-js)；[Apache-2.0](licenses/esptool-js-0.7.0-APACHE-2.0.txt)|
|atob-lite|2.0.0|[MIT](licenses/atob-lite-2.0.0-MIT.txt)|
|pako|2.2.0|Copyright (C) 2014-2017 Vitaly Puzrin and Andrei Tuputcyn；[MIT](licenses/pako-2.2.0-MIT.txt)、[Zlib 文件头通知](licenses/pako-2.2.0-ZLIB.txt)|
|SparkMD5|3.0.2，npm gitHead `9315385868fe11076674d4ddd763005319a462a7`|Copyright (C) 2015 André Cruz；[上游](https://github.com/satazor/js-spark-md5)；[随包 WTFPL v2 全文](licenses/spark-md5-LICENSE.txt)。包声明 `(WTFPL OR MIT)`，这里保留实际取得的 WTFPL 原文。|

构建工具 esbuild 0.28.2 是 MIT，不在浏览器运行；[上游](https://github.com/evanw/esbuild)，完整许可保留于 `protocol-lab/licenses/esbuild-0.28.2-MIT.txt`。依赖与 integrity 由 `protocol-lab/package-lock.json` 固定，安装使用 `npm ci --ignore-scripts`。

SDK 内置 stub JSON 原样进入 bundle；真实使用时会在通过 S3/安全状态检查后上传到 RAM。本次只在内存模拟串口验证 stub 上传与写入协议，未操作实际设备，正式固件包目前未配置，默认禁止请求设备与真实写入。本说明不是上游新增 NOTICE，附带许可保留原始版权文字。

OTA与WL/FAT只读保护层是本项目独立JavaScript实现，参考ESP-IDF v6.1（固定commit `fff9895c82d744c7237be8847347bdd1b07c6643`）的结构、CRC与启动/地址换算契约；未把以下SDK原码复制进运行bundle：

- `components/bootloader_support/src/bootloader_common_loader.c`、`bootloader_utility.c`、`include/esp_flash_partitions.h`
- `components/app_update/esp_ota_ops.c`、`components/esp_rom/patches/esp_rom_crc.c`
- `components/wear_levelling/WL_Flash.cpp`、`private_include/WL_Config.h`、`private_include/WL_State.h`

这些参考文件属于Espressif ESP-IDF，保留其原文件copyright/SPDX（Apache-2.0）；[固定官方来源](https://github.com/espressif/esp-idf/tree/fff9895c82d744c7237be8847347bdd1b07c6643)，[Apache-2.0许可全文](licenses/esptool-js-0.7.0-APACHE-2.0.txt)。私有离线测试使用固定官方Python FAT生成器与官方WL C++主机模型生成合成快照，原文件的版权和许可保留在独立QA证据目录；这些主机工具、合成固件与存储快照均不进入网站bundle、owner策略或生产固件包。许可证说明不代表正式包或硬件已经通过验证。
