# Refactor: Introduce Strategy Interface for Bot Behavior

## Overview

Create an abstraction layer that centralizes strategy decisions currently scattered across compositions, missions, and build rules. This enables easy swapping between different playstyles (aggressive, defensive, economic) without modifying core bot logic.

## Current State Analysis

### Composition Files (Minimal)

-   `packages/chronodivide-bot/src/bot/logic/composition/alliedCompositions.ts`
-   `packages/chronodivide-bot/src/bot/logic/composition/sovietCompositions.ts`

**Current behavior:**

-   Simple map of unit type names to quantities
-   Functions that check what buildings exist (WarFactory, Airforce, BattleLab, Radar) and return different unit compositions based on available production facilities
-   No missions, structures, or build strategies defined — only reactive unit selection based on existing buildings

### Mission System Integration

-   Used only in `AttackMissionFactory`
-   Calls appropriate composition function based on player's country/side
-   Returned composition passed to `AttackMission` constructor
-   Mission uses it to determine what units it needs via `unitTypeRequests`

### Overall Data Flow

```
SupalosaBot.onGameTick()
  ├─ matchAwareness.onAiUpdate()  [Updates threat/sector caches]
  │
  ├─ missionController.onAiUpdate()  [EVERY 3 TICKS]
  │   ├─ Calls MissionFactory.maybeCreateMissions()
  │   │   └─ AttackMissionFactory calls calculateTargetComposition()
  │   ├─ Calls mission._onAiUpdate() for each active mission
  │   ├─ Collects unitTypeRequests from all missions
  │   └─ Assigns/releases units to missions
  │
  └─ queueController.onAiUpdate()  [EVERY TICK]
      ├─ Scores each available unit using AiBuildingRules
      ├─ Builds top item in each queue
      └─ Places buildings/units
```

### What Currently Lacks Strategy Interface

Decentralized strategy decisions across 4 layers:

1. **Composition layer**: Only 2 hard-coded functions that react to existing buildings
2. **Mission factory layer**: Each factory independently decides when to spawn missions (no coordination)
3. **Building rules layer**: Each unit/building has its own priority logic (no global strategy)
4. **Placement layer**: Scattered across individual building rule classes

## Refactoring Steps

### 1. Define Strategy Interface

Create `packages/chronodivide-bot/src/bot/strategy/` directory with:

-   **`Strategy.ts`**: Core interface defining:
    -   `getUnitComposition(buildingState: ..., gameState: ...): UnitComposition`
    -   `getMissionsToSpawn(): MissionFactoryType[]`
    -   `getBuildPriorities(): BuildPriorityMap`
    -   Any other central strategy decisions

### 2. Create Concrete Strategy Implementations

-   **`sovietDefaultStrategy.ts`**: Wraps current Soviet composition logic
-   **`alliedDefaultStrategy.ts`**: Wraps current Allied composition logic
-   Both implement `Strategy` interface, capturing today's behavior without changing it

### 3. Integrate Strategy into Mission Control

-   Modify `MissionController` to accept strategy in constructor
-   Use strategy to determine which mission factories to spawn instead of hard-coding them
-   Pass strategy reference to `AttackMissionFactory` and other factories

### 4. Update AttackMissionFactory

-   Inject strategy dependency
-   Call `strategy.getUnitComposition()` instead of `calculateTargetComposition()`
-   Remove direct composition function calls

### 5. Wire Strategy Through Bot Constructor

-   Update `SupalosaBot` constructor to accept strategy parameter
-   Pass strategy to `MissionController` initialization
-   Store on bot instance for access to factories

### 6. Update Initialization

-   Modify `packages/chronodivide-bot-driver/src/index.ts` to instantiate bot with desired strategy
-   Keep current behavior by defaulting to appropriate default strategy based on player country

## Scope & Considerations

### First Pass Scope (Recommended)

-   **Include**: Compositions + mission spawning abstraction
-   **Defer**: Build rule priorities (can follow in second pass)

### Future Extensibility

-   Per-match initialization sufficient for now (dynamic mid-match switching adds complexity)
-   Strategy interface designed to be extensible without breaking changes to core bot

## Expected Outcomes

1. **No behavioral change**: Current bot plays identically
2. **Clear separation**: Strategy decisions isolated from bot logic
3. **Extensibility**: New strategies can be added by implementing `Strategy` interface
4. **Testability**: Strategies can be unit tested independently
5. **Future proof**: Easy to add aggressive/defensive/economic strategy variants
