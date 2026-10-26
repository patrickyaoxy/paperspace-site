# 网页字体派生

`LXGWWenKaiMonoGB-Regular.ttf` 与 `OFL.txt` 保留原文件和完整字体下载用途。网页采用 `web/` 内的 WOFF2 派生，源为同一个 Regular 1.530 字体；仅用于网页传输，不提供可安装的桌面派生字体。

`web-fonts.css` 将全体原字体 Unicode 映射分为页面核心字形与其余按需范围。核心字形包括页面静态文本、脚本提示和 ASCII，其余原字体支持的字符仍由同源派生加载；不会因子集遗漏静默切换为其他字体。核心与其余范围互不重叠，合集等于原字体 cmap。原字体本身没有的字符依照浏览器正常后备规则处理。

版权、Reserved Font Names 与 SIL OFL 1.1 及作者的网页子集／转换特别许可均见相邻 `OFL.txt`；派生保留原字体命名与许可元数据。生成脚本是 `scripts/build-web-assets.py`。它逐字核对 advance、展开后的字形坐标和 hint 指令，并保存 `assets/web-assets-manifest.json`。同一脚本生成网页截图 WebP，解码后对原 PNG 逐像素校验；原 PNG 与字体均不改动。

生成器使用固定公共页面/脚本/样式输入清单，并在资源清单记录各输入和派生文件的 SHA-256。派生字体使用原字体 header 时间，使输出稳定。重新生成用 `python3 scripts/build-web-assets.py`；只读验证用 `python3 scripts/build-web-assets.py --verify-existing`，会严格核对全部字形、范围、像素和清单，不重新压缩或写入产物。
