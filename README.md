# 奈儿 · 网页桌宠

一只住在网页里的 Q 版小女仆：自己走动、随机卖萌、100+ 个透明动画，也能陪你聊天。
**纯静态、零依赖、零服务端**——每人打开网页后填**自己的** API Key 即可（Key 只存在各自浏览器里）。

## 在线使用（GitHub Pages）

仓库开启 Pages 后（Settings → Pages → Source: `Deploy from a branch` → `main` / `(root)`），访问：

```
https://<你的用户名>.github.io/<仓库名>/
```

第一次打开：点左下角 **⚙** → 填「接口地址 / 模型 / API Key」→ 保存 → 右键点她 →「对话」。

## 本地使用

* 直接双击 `index.html`（Chrome / Edge；macOS 请用 Chrome，Safari 不认 webm 透明视频）
* 或双击 `启动奈儿网站.cmd`：本机起一个微型静态服务并自动打开浏览器（`http://127.0.0.1:8080/`）
* 当作内网站点：把整个文件夹丢到任意静态服务器（IIS / nginx / 对象存储）即可

## 配置

* `config.js` / `config.json`：动画池、权重、默认大小、人设（改完刷新页面生效）
* 网页里的 ⚙ 面板：接口地址、模型、API Key、大小、人设、朗读开关
  * 任何 **OpenAI 兼容**接口都能用（默认 `https://api.deepseek.com` + `deepseek-chat`）
  * 「测试连接」会发一条最小请求验证 Key 是否可用

## 说明

* 只有点「对话 / 碎碎念」才会调用接口；走动、播放动画全部在本地，不产生费用
* 浏览器直连接口（需要对方支持浏览器跨域；DeepSeek 官方与多数 One-API/New-API 系中转都支持）
* 动画素材与角色来自开源项目 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)：
  代码 MIT；素材（动画 / 提示词 / 源视频）允许开源使用、**禁止商用**；二次创作需在展示处附上该项目地址

## 文件

```
index.html        页面（含样式）
pet.js            主程序：行为循环 / 拖拽甩飞 / 右键菜单 / 对话 / 设置
shared-core.js    与桌面版共用的组件（菜单、气泡、物理）
config.js/.json   动画池与默认配置
assets/webm/      106 段透明动画（VP9-alpha）
assets/fonts/     气泡字体（上首软糖体）
serve.ps1         微型静态服务器（系统自带 PowerShell，无依赖）
启动奈儿网站.cmd   双击启动上面的服务器
使用说明.txt       面向使用者的中文说明
```
