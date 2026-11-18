# 历史原型示例

保留上一代管理后台和小程序的页面清单、演示数据与布局。源码在 `src/`，使用固定版本的 `src/legacy-kit`。新项目的控件来源按 Luz-Design 的规则选取。

需要查看历史示例时，在此目录运行以下命令，生成并打开 `admin.html` 和 `mini.html`。

```powershell
$env:LUZ_PROTO_OUT = Join-Path $env:TEMP 'luz-legacy-demo'
py -X utf8 build.py
```

管理后台可以在画面里的「演示」切换角色，小程序可在地址末尾加 `?guest` 查看游客首页。功能输入与小程序壳的接口见 [mini.API.md](src/mini.API.md)。
