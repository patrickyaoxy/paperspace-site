# paperspace 官网固件目标

唯一配置文件是网站根目录的 `firmware-target.json`（开发工作区为 `dist/firmware-target.json`）。当前没有正式可分发的 v2.0.8 目标包，保持 `enabled: false`、`target: null`，页面明确显示尚未开放。不要把本机私测包当正式发布包。

所有者最少操作：先取得已确认可分发、匹配精确机型的正式包，核原始 manifest、原始应用镜像和分区表；将这三份文件放在网站相对路径或有 CORS 的 HTTPS 地址；编辑下面的配置字段并填真实字节数和 SHA-256；提交网站更新后打开“下载与刷机”，点击“重新检查开放状态”。配置不会上传、发布或签发固件，也不能代替真机验收。

顶层恰好四个字段：`schema: 2`、`enabled`、`unavailable_reason`、`target`。关闭时原因必须非空，target 为 null；启用时 target 必须恰好包含：

|字段|取值|
|---|---|
|board、model|已验证的准确板型、机型标识，操作者仍须主动核对；芯片识别不等于板型认证|
|project|原应用 descriptor 的 project_name；保留实际技术名称|
|version、idfVersion|本轮仅 `2.0.8`、`v6.1`|
|sourceSha|`79f2f5ad303b9a588d551e3e0eb4b6e5735bc56b`|
|manifest|`{url, sha256, bytes}`，原始 JSON 字节，最多 1 MiB|
|app|`{file, url, sha256, bytes}`，file 为 manifest 中的原应用成员名；288 字节至 5 MiB|
|partitionTable|`{file, url, sha256, bytes: 3072}`，精确分区表镜像|
|partitions|下列六行的二维数组，顺序和数值全部一致|

```json
[
 ["nvs",1,2,36864,20480],
 ["phy_init",1,1,57344,4096],
 ["ota_0",0,16,65536,5242880],
 ["storage",1,129,5308416,5242880],
 ["ota_1",0,17,10551296,5242880],
 ["otadata",1,0,15794176,8192]
]
```

SHA-256 必须为 64 位小写十六进制。相对 URL 以配置文件所在目录为基准，例如 `firmware/app.bin` 对应网站根目录的 firmware/app.bin；只允许安全相对路径或 HTTPS 绝对地址，不接受凭据、query、fragment、重定向或父目录跳转。外域必须允许网站 CORS。原始 manifest 必须声明 schema 1、profile product、esp32s3、16MB、精确版本/source_sha，并在 files 中列出上述两个镜像的摘要和长度。修改版本或分区布局需重新审查代码，不能仅改 JSON。

普通访客默认使用保留数据的设备内置 TF 更新流程。USB 工具目前只支持既有精确布局上的指定应用槽恢复：用户主动连接 → 芯片、安全状态和分区读回 → 完整 16 MiB 备份下载 → 输入 `RECOVER ota_0 2.0.8` 或对应 ota_1 文字 → 明确点击写入 → MD5 与 SHA-256 读回。未知安全配置拒绝；不会改启动选择、全片擦除、刷入 merged 镜像或自动重启。首次安装、分区迁移和自动 OTA 提交不在当前 USB 模式内。

写入失败或取消可能已改变目标应用槽，不能承诺自动回滚；备份文件由操作者保存，未验证其实际可恢复性。正式开放前仍需安排真实设备、启动显示与恢复验收。开发验证使用内存端口，不等于硬件通过。
