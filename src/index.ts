/**
 * 打包入口文件
 * 导出所有需要暴露给外部使用的类和函数
 */

// 导出主要的 Bot 类
export { SupalosaBot } from './bot/bot.js';

// 导出 DummyBot（可选）
export { DummyBot } from './dummyBot/dummyBot.js';

// 版本号
export const version = '0.78.0';

