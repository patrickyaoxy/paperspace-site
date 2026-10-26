# ESP flasher stub 来源与许可

固定 esptool-js 0.7.0 的 gitHead 为 `4d8e8fe092f3425a4b85d1e883f4cc078a5efdd3`。其 [stub 目录说明](https://github.com/espressif/esptool-js/blob/4d8e8fe092f3425a4b85d1e883f4cc078a5efdd3/src/targets/stub_flasher/README.md)指明 set2 来自官方 [esp-flasher-stub v1.2.2](https://github.com/espressif/esp-flasher-stub/releases/tag/v1.2.2)，源码提交 `23959b780454adf885916d42f2274ec648e96a94`。

14份 npm 内置 JSON 与固定 SDK 源及该官方发布资产的 text/data 解码字节逐项一致。ESP32-S3 的 text 为7832字节、data为264字节。内置二进制采用 Apache-2.0 OR MIT 双许可。随包原样保留 [Apache许可](licenses/esp-flasher-stub-1.2.2-APACHE-2.0.txt)、[SDK目录MIT许可](licenses/esp-flasher-stub-1.2.2-SDK-MIT.txt)和[原源码tag的MIT许可](licenses/esp-flasher-stub-1.2.2-SOURCE-MIT.txt)。两份MIT版权年份分别为2026与2025，保持原文。

这是官方第三方 RAM 编程辅助程序的材料，不是 paperspace 固件包。其许可不代表设备或正式目标固件已验收。
