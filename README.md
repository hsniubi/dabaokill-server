# 大宝 Kill 公网房间服务

部署到 Render 的 Node.js 服务，包含游戏网页及联机房间接口。

对局固定四个座位：四名真人到齐自动开始；两名或三名真人可由房主选择电脑补位。

## Render 部署

在 Render 选择 New → Blueprint，连接本仓库，使用根目录 render.yaml。配置使用 Free 实例；无需额外数据库。

- 启动：`node online-server.js`
- 健康检查：`/api/health`
- 网页入口：`/`
- 联机入口：`/online.html`

房间保存在进程内存中，服务重启或休眠后需重新创建。请只运行一个实例。

详细说明见 PUBLIC-DEPLOY.md。
