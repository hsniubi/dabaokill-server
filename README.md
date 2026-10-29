# 大宝 Kill 公网房间服务

包含完整游戏网页、图片音频资源及 Node.js 联机服务。

对局固定四个座位：四名真人到齐自动开局；两名或三名真人可由房主选择电脑补位。

## 部署到 Render

1. 在 Render 点击 New → Blueprint。
2. 连接本仓库，选择 main 分支。
3. 使用根目录 render.yaml，确认实例为 Free 后部署。
4. 部署完成后打开 Render 提供的 HTTPS 地址。

无需额外数据库或 npm 依赖。

- 启动：`node online-server.js`
- 健康检查：`/api/health`
- 游戏首页：`/`
- 联机大厅：`/online.html`
- 联机测试：`node test-online.js`

房间保存在内存中，服务重启、休眠或重新部署后需要重新创建。请只运行一个实例。

接入原网页版和本地版时，在它们的 online-config.js 中配置同一个 HTTPS 房间服务地址。

详细说明见 [PUBLIC-DEPLOY.md](PUBLIC-DEPLOY.md)。
