# Supalosa's Chrono Divine Bot

[Chrono Divide](https://chronodivide.com/) is a ground-up rebuild of Red Alert 2 in the browser. It is feature-complete and allows for online skirmish play against other players.
It also provides [an API to build bots](https://discord.com/channels/771701199812558848/842700851520339988), as there is no built-in AI yet.

This repository is one such implementation of a bot.

## Development State
Development on this is paused as I'm currently focusing on a Starcraft 2 bot instead.
The bot only plays Allied, and is not particularly good at the game. Feel free to use its code as a training dummy against your own bot, or extend it if you'd like. Caveat: I'm not a professional AI dev, this was my first foray into this, nor am I particularly experienced with TypeScript or JS.

## Future plans (on hold)
I was working on three things at once before I put this on hold:

 * Task System - Something to not only follow actual build orders, but manage attacks, harass/attack the enemy, perform scouting, expand to other bases etc.
 * Squad System - Ability to independently control more than one mass of units (i.e. squads), for example a Harass Squad directed by a Harass Task.
 * Map Control System - Ability to analyse the state of the map and decide whether to fight for control over areas. Currently we already divide the map into square regions with individual threat calculations, but don't really do much with that information.

A lot of these concepts are being built into my Starcraft 2 bot, [Supabot](https://github.com/Supalosa/supabot) - maybe I'll come back to this when I'm done there.

## Install instructions

```sh
npm install
npm run build
npx cross-env MIX_DIR="C:\path_to_ra2_install_dir" npm start
```

This will create a replay (`.rpl`) file that can be [imported into the live game](https://game.chronodivide.com/).

## Playing against the bot
Contact the developer of Chrono Divide for details if you are seriously interested in playing against a bot (this one or your own).

## Debugging

```sh
npx cross-env MIX_DIR="C:\path_to_ra2_install_dir" NODE_OPTIONS="--inspect" npm start
```

# G:\Origin\Ra2_YurisRevenge\Command and Conquer Red Alert II
npx cross-env MIX_DIR="G:\Origin\Ra2_YurisRevenge\Command and Conquer Red Alert II" npm start
npx cross-env MIX_DIR="G:\Origin\Ra2_YurisRevenge\Command and Conquer Red Alert II" NODE_OPTIONS="--inspect" npm start