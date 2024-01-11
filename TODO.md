# Project roadmap

## Urgent

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
-   Performance/Feature: Debounce `BatchableActions` in `actionBatcher`
    -   We have an `actionBatcher` to group up actions taken by units in a given tick, and submit them all at once. For example, if 5 units are being told to attack the same unit, it is submitted as one action with 5 IDs.
    -   This improves performance and reduces the replay size.
    -   There is further opportunity to improve this by remembering actions assigned _across_ ticks and do not submit them if the same action was submitted most recently.
    -   This might simplify some mission logic (we can just spam unit `BatchableActions` safely) and also significantly reduce replay size.
    -   There is a light version of this in `combatSquad`, where it remembers the last order given for a unit and doesn't submit the same order twice in a row.

## Low priority

-   Feature: `ai.ini` integration
    -   It would be nice to use the attack groups and logic defined in `ai.ini`, so the AI tries strategies such as engineer rush, terrorist rush etc.
    -   This might make the AI mod-friendly as well.
