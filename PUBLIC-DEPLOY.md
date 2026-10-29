# 公网联机部署

对局固定四个座位。四名真人到齐自动开局；两名或三名真人时，仅房主可点击“电脑补位”开始。电脑使用现有单机 AI，自动出牌和选择技能目标。

## 建议：先用 Render 免费服务试运行

1. 注册并登录 https://dashboard.render.com/ ，连接用于发布游戏的 GitHub 仓库。
   可先运行 python build_public.py，将 release/dabaokill-public.zip 解压后的全部内容放入专门的服务仓库，避免遗漏后端文件。
2. 将本项目的 online-server.js、game.js、package.json、render.yaml 和网页文件上传到该仓库。仅上传 site/dist 不包含房间服务器。不要上传运行日志、node_modules、桌面构建缓存。
3. 在 Render 新建 Blueprint，选择此仓库，读取根目录 render.yaml，确认使用 Free 方案。无需数据库或 npm 依赖。
4. 部署完成后记录实际分配的 HTTPS 地址。访问其 /api/health 应返回 service=dabaokill、status=ok。访问根路径可运行包含三种模式的游戏。
5. 把 online-config.js 的 apiBaseUrl 设置为该 HTTPS 地址（只写域名，不附带 /online.html）。网页与桌面版使用完全相同的配置。
6. 运行 python build_web.py，发布 site/dist 的内容到原 GitHub Pages 网页。运行 python build_share.py 更新单文件版。桌面版在 desktop 目录运行 npm run build 后重新安装新安装包。
7. 已安装的桌面版如果已经包含本次更新，也可在联机大厅的“房间服务设置”中填写同一个服务地址，无需再次打包。旧安装包需要先更新。

invitePageUrl 留空时邀请链接指向房间服务自带的在线大厅。若想让邀请链接仍指向原 GitHub Pages，将其设为 https://hsniubi.github.io/dabaokill/online.html，并确保该网页的 apiBaseUrl 也已发布为同一个服务地址。

## 当前服务边界

免费服务空闲 15 分钟后休眠，首次唤醒可能需要约一分钟；免费实例也可能重启。房间保存在内存，进程重启、休眠或重新部署会丢失旧房间。只运行一个实例，不要开启多实例负载均衡。长期稳定使用可改用持续运行的付费实例；该改动不会自动增加房间持久化。

本地 localhost、127.0.0.1 地址只能用于本机测试。公网服务的可达性和延迟应使用实际参与者的网络验证。

官方文档：
- https://render.com/docs/free
- https://render.com/docs/blueprint-spec
- https://render.com/docs/web-services
- https://render.com/pricing
