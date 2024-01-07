# Project roadmap

## Urgent

-   Refactor: Change how production is prioritised.
    -   Currently, each unit type defines its own priorities `AiBuildingRules.getPriority()`
    -   This leads to spamming of conscript/GI, and sometimes tanks, that means the AI never techs due to the `onlyBuildWithFloatingCreditAmounts` of `NARADR/GAAIRC/AMRADR`.
-   Refactor: Remove "behaviour" (`missionBehaviour`) paradigm.
    -   This is only used to reuse logic between `attackMission` and `defenceMission` so the concept doesn't need to leak to the other mission types.
    -   There is some awkward "call the behaviour's `onAiUpdate`, then do our own thing in `onAiUpdate`" in mission update loops that could be solved.
    -   We could probably keep the "Squad" terminology, but now it strictly means a group of combat units.

## Medium priority

-   Performance: Leader pathfinding
    -   For a given squad of units, choose a leader (typically the slowest unit, tie-break with the lowest ID) and have other units in the squad follow that unit.
    -   This should improve clustering of units, and hopefully we can remove the `centerOfMass` hack to keep groups of units together.
-   Feature: Detect Naval map
    -   Currently the AI doesn't know if it's on a naval map or not, and will just sit in base forever.
-   Feature: Naval construction
    -   The AI cannot produce GAYARD/NAYARD because it doesn't know how to place naval structures efficiently.
-   Feature: Naval/amphibious play
    -   If a naval map is detected, we should try to bias towards naval units and various naval strategies (amphibious transports etc)
-   Feature: Superweapon usage
    -   Self-explanatory
-   Correctness: `isPlayerOwnedTechnoRules` does not account for garrisoned buildings
    -   `src/bot/common/utils.ts`:`isPlayerOwnedTechnoRules` is used to determine if a given `TechnoRules` is likely to be a player-controlled unit or not.
    -   If you garrison a building or mind control a neutral unit, this doesn't work.
    -   There is an upcoming API change to add an `"enemy"` player filter to `getVisibleUnits` that should obviate this function completey.

## Low priority

-   Feature: `ai.ini` integration
    -   It would be nice to use the attack groups and logic defined in `ai.ini`, so the AI tries strategies such as engineer rush, terrorist rush etc.
    -   This might make the AI mod-friendly as well.
