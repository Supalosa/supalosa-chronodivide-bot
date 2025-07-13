# Supalosa关于网页版红警AI的实现

[English Version Doc](README.md)

[Chrono Divide](https://chronodivide.com/) 是一个在浏览器中重新构建的红色警戒2游戏。它目前已经具备完整的功能，并允许与其他玩家进行在线对战、游玩单机模式和导入MOD。

它还提供了[一个构建机器人的 API](https://discord.com/channels/771701199812558848/842700851520339988)，目前本仓库所开发的AI已经集成到Chronodivide正式游戏中，现在在持续完善。

## 开发状态和未来的计划

Chrono Divide 的开发者表示有兴趣将这个机器人直接整合到游戏中。因此，我打算实现缺失的功能，为人类玩家创建一个令人满意的 AI 对手。

从方向上来说，这意味着我不打算让这个 AI 成为一个拥有完美阵容或微操作的对手，而是希望它能成为**新手玩家**的有趣挑战。

请查看 TODO.md，其中列出了计划为机器人进行的结构性更改和功能改进的细分清单。

欢迎您贡献代码到代码库，甚至可以 fork 代码库并构建您自己的版本。

## 安装说明

请使用Node.js 14版本，更高的Node版本目前不被支持。推荐使用nvm管理Node版本，方便切换。

建议使用官方原版红色警戒2安装目录。**如果你更改了游戏ini，那么可能无法运行，请知悉！**

```sh
npm install
npm run build
npx cross-env MIX_DIR="C:\指向你安装的红色警戒2目录" npm start
```

这将创建一个回放（`.rpl`）文件，可以[导入到实际游戏中](https://game.chronodivide.com/)。

你可以编辑 `exampleBot.ts` 来定义对局。你可以看到 `const mapName = "..."` 这样的代码，去更改他以改变地图; 或者 `const offlineSettings1v1` 这样的代码，去更改他以改变bot国家。

## 真人与机器人对战

在Chronodivide的单机模式内，你可以和之前发布的Supalosa Bot对战。但是当前仓库的最新版本**只能供开发者游玩**，也就是正在看仓库的你。跟随下面的步骤，开启在线对战游玩方法吧。

### 初始设置步骤（仅需一次）

1. 使用官方客户端在 [https://game.chronodivide.com](https://game.chronodivide.com) 为您的机器人创建一个 Chronodivide 帐户。
2. 如果您还没有帐户，请使用相同的链接为自己创建一个 Chronodivide 帐户。
3. 将 `.env.template` 复制为 `.env`。`.env` 文件不会被提交到代码库中。
4. 将 `ONLINE_BOT_NAME` 的值设置为步骤 1 中机器人的用户名。
5. 将 `ONLINE_BOT_PASSWORD` 的值设置为步骤 1 中的密码。
6. 将 `PLAYER_NAME` 的值设置为人类帐户的用户名。
7. （可选）如果您想连接到另一个服务器，请更改 `SERVER_URL`。步骤 1 和步骤 2 中的 Chronodivide 帐户需要存在于该服务器上。

### 运行机器人并连接到游戏

使用 `ONLINE_MATCH=1` 启动机器人。例如：

```sh
ONLINE_MATCH=1 npx cross-env MIX_DIR="${GAMEPATH}" npm --node-options="${NODE_OPTIONS} --inspect" start
```

机器人将连接到服务器，并应返回如下输出：

```sh
You may use the following link(s) to join, after the game is created:

https://game.chronodivide.com/#/game/12345/supalosa


Press ENTER to create the game now...
```

进入控制台输出的这个地址，在上面的例子中，这个是“https://game.chronodivide.com/#/game/12345/supalosa”，请你以控制台实际输出为准。进入地址后，根据提示，**首先使用真人账号登录**，然后在控制台终端中按 ENTER 键，以便机器人可以创建游戏。

重要提示：不要过早按下 ENTER 键，因为人类连接到比赛的时间非常短暂。

## 调试

要生成启用调试的回放：

```sh
npx cross-env MIX_DIR="C:\path_to_ra2_install_dir" npm --node-options="${NODE_OPTIONS} --inspect" start
```

要记录机器人生成的所有操作：

```sh
DEBUG_LOGGING="action" npx cross-env MIX_DIR="${GAMEPATH}" npm --node-options="${NODE_OPTIONS} --inspect" start
```

我们还利用了 CD 提供的游戏内机器人调试功能。这些基本上是仅限机器人的操作，保存在回放中，但在观看回放之前，您必须在 CD 客户端中启用可视化功能，方法是在开发控制台中输入以下内容：

```
r.debug_text = true;
```

这将对已配置为 `setDebugMode(true)` 的机器人进行调试，这是在 `exampleBot.ts` 中完成的。

## 发布

在 `~/.npmrc` 或适当的位置设置 npmjs 令牌。

```
npm publish
```

## 贡献者

- use-strict: Chrono Divide创始人
- Libi: 改进建筑摆放性能
- Dogemoon（ra2web-bot）: 提供中文文档，修复一个因文件名驼峰导致的调试问题
