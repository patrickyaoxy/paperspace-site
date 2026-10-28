# 安装器引擎的可复现维护

工具在完整 SHA-256 固定的已发布编译 bundle 上完成两阶段转换，不声称从原七个模块重新构建。第一阶段使用 Acorn 8.15.0 定位并替换来源、版本和诊断三个身份字面量；第二阶段只允许七个会话方法、一个私有安全字段、每会话 `VerifiedESPLoader` 和构造器唯一 loader callee 改动。原 SDK 类、OTA、WL/FAT、镜像/策略解析及完整备份实现保持 AST 与字节相同。

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

基线 engine SHA-256 为 `f82fa742ef5ecb838d4ca28a4cfe2e5d946056e06c65409ab9bf1ed6a677fc43`；身份适配中间产物为 `60a95723afb8f3f2c7503cb79a0553287eb6bda6a53bac3b5fcca637b0b912bd`；最终 engine 为 `1bbb21dd0490df7417c8ec6abf152378fe03cd097b3b106e4be387bf62e06dd2`。第一阶段可加 `--inspect` 只读检查，不传 `--outdir`。维护收据逐项绑定变更区间与摘要，并检查范围外字节和未改节点；当前构建来源见 [build.json](../../real-flash/build.json)。

每会话 adapter 严格检查二元回执、2或4字节的全零命令状态、signed32/uint32整数，保留 SDK 原始 signed 返回值；不修改全局 prototype。ROM 安全证据在 stub 和写前由三个只读 eFuse 字段复核，未知状态或真实保护均拒写，不修改 eFuse。

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

浏览器 runner 默认使用标准系统 Chromium 路径，可用 `CHROMIUM_PATH` 覆盖。报告目录必须尚不存在。固定版本测试预期为24项寄存器回归和16项浏览器流程；输出会记录 engine、模型、runner或页面模块摘要，应与当前文件核对。真实 USB 写入、启动、显示、操作系统文件选择器及物理掉电恢复仍需另行验证。

正常可信双槽更新无需整片备份；全片空白设备在首次擦除前完成只读扫描；单槽重叠迁移必须保存完整备份，关闭文件并读回核验后才写入。旧的 `tests/installer-regression.mjs` 对应早期准备合同，不是当前单按钮流程入口。
