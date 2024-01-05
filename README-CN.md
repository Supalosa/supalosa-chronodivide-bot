# 由 Supalosa 实现的 Chrono Divide AI机器人

[English Version Doc](README.md)

[Chrono Divide](https://chronodivide.com/) 是一个在浏览器中重新构建的红色警戒2游戏。它目前已经具备完整的功能，并允许与其他玩家进行在线对战。

它还提供了[一个构建机器人的 API](https://discord.com/channels/771701199812558848/842700851520339988)，因为 Chrono Divide目前还没有内置的AI机器人。

这个仓库是一个这样的机器人实现。

## 开发状态

这个项目正在积极开发中，在开发完善时将会作为 Chrono Divide 的一部分。但是目前距离完善的AI还有很大差距，希望大家都能参与本仓库的贡献！

警告：我不是专业的 AI 开发人员，这是我第一次涉足该领域，我对 TypeScript 或 JS 也没有特别的经验。

## 未来计划

我目前正在同时进行三个任务：

- 任务系统 - 不仅遵循实际的建造顺序，还可以管理攻击、骚扰/攻击敌人、侦查、扩展到其他基地等等。
- 队伍系统 - 能够独立控制多个单位集合（即队伍），例如由骚扰任务指导的骚扰队伍。
- 地图控制系统 - 能够分析地图状态，并决定是否争夺控制权。目前，我们已经将地图划分为具有单独威胁计算的方块区域，但对该信息并没有做太多处理。

这些概念中的很多已经被集成到我的《星际争霸2》机器人 [Supabot](https://github.com/Supalosa/supabot) 中，也许我完成那个项目后会回到这里。

## 安装说明

请使用Node.js 14版本，推荐使用nvm管理Node版本，方便切换。

```sh
npm install
npm run build
npx cross-env MIX_DIR="C:\指向你安装的红色警戒2目录" npm start
```

这将创建一个回放（`.rpl`）文件，可以[导入到实际游戏中](https://game.chronodivide.com/)。

## 与机器人对战

如果你真正有兴趣与机器人对战（无论是这个机器人还是你自己的机器人），请联系 Chrono Divide 的开发者以获取详细信息。

## 调试

```sh
npx cross-env MIX_DIR="C:\指向你安装的红色警戒2目录" npm --node-options="${NODE_OPTIONS} --inspect" start
```

## 发布

将 npmjs token 放在 ~/.npmrc 或适当的位置。

```bash
npm publish
```

# 忽略以下内容

```bash
# 开发电脑
export GAMEPATH="G:\Origin\Ra2_YurisRevenge\Command and Conquer Red Alert II"
# 开发笔记本电脑
export GAMEPATH="D:\EA Games\Command and Conquer Red Alert II"

---

# 不带任何调试运行
npm run build && npx cross-env MIX_DIR="${GAMEPATH}" npm start

# 带有附加调试器运行
npm run build && npx cross-env MIX_DIR="${GAMEPATH}" npm --node-options="${NODE_OPTIONS} --inspect" start

# 带有附加调试器和详细的 API 日志记录运行
npm run build && DEBUG_LOGGING="action" npx cross-env MIX_DIR="${GAMEPATH}" npm --node-options="${NODE_OPTIONS} --inspect" start

# DEBUG_LOGGING 也可以缩小范围，例如 "action" 或 "move"
```

如果你想在观看回放时渲染游戏内的调试文本，请在开发控制台中输入以下内容：
这将在第二个位置上调试机器人。（你无法调试第一个机器人，因为将 `debug_bot` 设置为 `0` 将禁用调试功能）。

```js
r.debug_bot = 1;
r.debug_text = true;
```

---

天梯地图可以参考：https://github.com/chronodivide/pvpgn-server/blob/26bbbe39613751cff696a73f087ce5b4cd938fc8/conf/bnmaps.conf.in#L321-L328

CDR2 1v1 2_malibu_cliffs_le.map
CDR2 1v1 4_country_swing_le_v2.map
CDR2 1v1 mp01t4.map
CDR2 1v1 tn04t2.map
CDR2 1v1 mp10s4.map
CDR2 1v1 heckcorners.map
CDR2 1v1 4_montana_dmz_le.map
CDR2 1v1 barrel.map

---

与机器人对战

```bash
export SERVER_URL="wss://<region_server>"
export CLIENT_URL="https://game.chronodivide.com/"
```
