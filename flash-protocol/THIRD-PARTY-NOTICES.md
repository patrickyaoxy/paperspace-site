# 浏览器刷机 SDK 第三方许可

运行时依赖打包在本目录的 engine.js，无 CDN 依赖。SDK 上游实现未修改；本项目适配层另行维护，不代表上游作者背书。构建身份见 build.json，保留以下原始许可全文。

| 组件 | 固定版本 / 来源 | 版权与许可 | 随附许可 |
| --- | --- | --- | --- |
| [esptool-js](https://github.com/espressif/esptool-js) | 0.7.0 / 4d8e8fe092f3425a4b85d1e883f4cc078a5efdd3 | Copyright (c) 2023 Espressif Systems (Shanghai) Co. Ltd.; Apache-2.0 | [Apache 2.0](licenses/esptool-js-APACHE-2.0.txt) |
| atob-lite | 2.0.0 | MIT，原版权声明见许可 | [MIT](licenses/atob-lite-MIT.txt) |
| [pako](https://github.com/nodeca/pako) | 2.2.0 | Copyright (C) 2014–2017 Vitaly Puzrin and Andrei Tuputcyn; MIT；zlib 移植另含 Jean-loup Gailly、Mark Adler 等人的通知 | [MIT](licenses/pako-MIT.txt)、[Zlib](licenses/pako-ZLIB.txt) |
| [SparkMD5](https://github.com/satazor/js-spark-md5) | 3.0.2 / 9315385868fe11076674d4ddd763005319a462a7 | Copyright (C) 2015 André Cruz; 包内 LICENSE 为 WTFPL v2 | [原始 LICENSE](licenses/spark-md5-LICENSE.txt) |

SparkMD5 的包元数据声明 `(WTFPL OR MIT)`，此处保留其随包实际取得的 WTFPL v2 全文，不补造 MIT 文本。SDK 上游固定提交未附独立 NOTICE，本说明不是新增上游 NOTICE。

构建工具 esbuild 0.28.2（Copyright (c) 2020 Evan Wallace，MIT）不在浏览器运行；其许可保存在源码仓库 protocol-lab/licenses/esbuild-0.28.2-MIT.txt。

SDK 内置 stub 的独立许可与精确来源见 [STUB-SOURCE.md](STUB-SOURCE.md)。
