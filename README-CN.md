# 由 Supalosa 实现的 Chrono Divide(网页版红警2) AI机器人

[English Version Doc](README.md)

[Chrono Divide](https://chronodivide.com/) 是一个在浏览器中重新构建的红色警戒2游戏。它目前已经具备完整的功能，并允许与其他玩家进行在线对战。

它还提供了[一个构建机器人的 API](https://discord.com/channels/771701199812558848/842700851520339988)，因为其目前还没有内置的AI机器人。

这个仓库就是一个这样的机器人实现。这个项目的原始模板可以从这里获取到：[game-api-playground](https://github.com/chronodivide/game-api-playground/blob/master/README.md) 

## 开发状态及未来计划
开发Chrono Divide（网页版红警2）的开发者表达了将该机器人直接整合到游戏中的兴趣。因此，我的目标是实现缺失的功能，为人类创建一个令人满意的AI对手。

在方向上，这意味着我并不打算使这个AI成为一个拥有完美阵容或微操的对手，而是希望它对新手玩家来说是一种有趣的挑战。

查看 TODO.md 以获取计划中的机器人的结构更改和功能改进的详细列表。

随时欢迎您贡献到代码库，甚至可以分叉仓库并构建您自己的版本。

## 安装说明

Chrono Divide API 目前要求使用 Node 14。目前还不支持更高版本。

```sh
npm install
npm run build
npx cross-env MIX_DIR="C:\指向你安装的红色警戒2目录" npm start
```

这将创建一个回放（`.rpl`）文件，可以[导入到实际游戏中](https://game.chronodivide.com/)。

您可以修改 exampleBot.ts 来配置比赛。您很可能希望查看包含 const mapName = "..." 的行以更改地图，或者查看 const offlineSettings1v1 以更改机器人的国家。

## 与机器人对战

目前，只有开发者才能与该机器人进行游戏，因为这需要您从源代码运行这个代码库。如果您想要这样做，请在 Chrono Divide 的 [#dev-talk](https://discord.com/channels/771701199812558848/842700851520339988)  频道中发送消息，因为需要使用正确的联机服务器URL和机器人凭据来连接到联机服务器。目前代码没有轻松设置这一点，因此我们可能需要一起逐步执行说明。

```sh
export SERVER_URL="wss://<region_server>"
export CLIENT_URL="https://game.chronodivide.com/"
```

## 调试

在调试模式开启时生成一个回放文件：

```sh
npx cross-env MIX_DIR="C:\path_to_ra2_install_dir" npm --node-options="${NODE_OPTIONS} --inspect" start
```

记录机器人生产的所有动作日志:

```sh
DEBUG_LOGGING="action" npx cross-env MIX_DIR="${GAMEPATH}" npm --node-options="${NODE_OPTIONS} --inspect" start
```

我们还利用了由 CD 提供的游戏内的机器人调试功能。这些基本上是仅供机器人执行的操作，它们会保存在回放中，但在观看回放之前，您必须在 CD 客户端中启用可视化，方法是在开发者控制台中输入以下内容：

```
r.debug_bot = 1;
r.debug_text = true;
```

这将调试处于2号位置的机器人（debug_bot是从0开始计数的）。机器人还必须配置为调试操作（使用 setDebugMode(true)），在 exampleBot.ts 中为2号机器人完成了这一操作。

## 发布

将 npmjs token 放在 ~/.npmrc 或适当的位置。

```bash
npm publish
```
