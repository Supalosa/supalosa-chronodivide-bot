import { GameApi, GameMath, MovementZone, ObjectType, PlayerData, UnitData } from "@chronodivide/game-api";
import { GlobalThreat } from "./threat.js";

export function calculateGlobalThreat(game: GameApi, playerData: PlayerData, visibleAreaPercent: number): GlobalThreat {
    let groundUnits = game.getVisibleUnits(
        playerData.name,
        "hostile",
        (r) => r.type == ObjectType.Vehicle || r.type == ObjectType.Infantry,
    );
    let airUnits = game.getVisibleUnits(playerData.name, "hostile", (r) => r.movementZone == MovementZone.Fly);
    let groundDefence = game
        .getVisibleUnits(playerData.name, "hostile", (r) => r.type == ObjectType.Building)
        .filter((unitId) => isAntiGround(game, unitId));
    let antiAirPower = game
        .getVisibleUnits(playerData.name, "hostile", (r) => r.type != ObjectType.Building)
        .filter((unitId) => isAntiAir(game, unitId));

    let ourAntiGroundUnits = game
        .getVisibleUnits(playerData.name, "self", (r) => r.isSelectableCombatant)
        .filter((unitId) => isAntiGround(game, unitId));
    let ourAntiAirUnits = game
        .getVisibleUnits(playerData.name, "self", (r) => r.isSelectableCombatant)
        .filter((unitId) => isAntiAir(game, unitId));
    let ourGroundDefence = game
        .getVisibleUnits(playerData.name, "self", (r) => r.type == ObjectType.Building)
        .filter((unitId) => isAntiGround(game, unitId));
    let ourAirUnits = game.getVisibleUnits(
        playerData.name,
        "self",
        (r) => r.movementZone == MovementZone.Fly && r.isSelectableCombatant,
    );

    let observedGroundThreat = calculateFirepowerForUnits(game, groundUnits);
    let observedAirThreat = calculateFirepowerForUnits(game, airUnits);
    let observedAntiAirThreat = calculateFirepowerForUnits(game, antiAirPower);
    let observedGroundDefence = calculateFirepowerForUnits(game, groundDefence);

    let ourAntiGroundPower = calculateFirepowerForUnits(game, ourAntiGroundUnits);
    let ourAntiAirPower = calculateFirepowerForUnits(game, ourAntiAirUnits);
    let ourAirPower = calculateFirepowerForUnits(game, ourAirUnits);
    let ourGroundDefencePower = calculateFirepowerForUnits(game, ourGroundDefence);

    return new GlobalThreat(
        visibleAreaPercent,
        observedGroundThreat,
        observedAirThreat,
        observedAntiAirThreat,
        observedGroundDefence * 0.25,
        ourGroundDefencePower * 0.25,
        ourAntiGroundPower,
        ourAntiAirPower,
        ourAirPower,
    );
}

function isAntiGround(gameApi: GameApi, unitId: number): boolean {
    let unit = gameApi.getUnitData(unitId);
    if (unit && unit.primaryWeapon) {
        return unit.primaryWeapon.projectileRules.isAntiGround;
    }
    return false;
}

function isAntiAir(gameApi: GameApi, unitId: number): boolean {
    let unit = gameApi.getUnitData(unitId);
    if (unit && unit.primaryWeapon) {
        return unit.primaryWeapon.projectileRules.isAntiAir;
    }
    return false;
}

function calculateFirepowerForUnit(unitData: UnitData): number {
    let threat = 0;
    let hpRatio = unitData.hitPoints / Math.max(1, unitData.maxHitPoints);
    if (unitData.primaryWeapon) {
        threat +=
            (hpRatio *
                ((unitData.primaryWeapon.rules.damage + 1) * GameMath.sqrt(unitData.primaryWeapon.rules.range + 1))) /
            Math.max(unitData.primaryWeapon.cooldownTicks, 1);
    }
    if (unitData.secondaryWeapon) {
        threat +=
            (hpRatio *
                ((unitData.secondaryWeapon.rules.damage + 1) *
                    GameMath.sqrt(unitData.secondaryWeapon.rules.range + 1))) /
            Math.max(unitData.secondaryWeapon.cooldownTicks, 1);
    }
    return Math.min(800, threat);
}

function calculateFirepowerForUnits(game: GameApi, unitIds: number[]) {
    let threat = 0;
    unitIds.forEach((unitId) => {
        let unitData = game.getUnitData(unitId);
        if (unitData) {
            threat += calculateFirepowerForUnit(unitData);
        }
    });
    return threat;
}
