// Interpreter for ai.ini TriggerTypes

import { IniFile, IniSection } from "@chronodivide/game-api";
import { Countries } from "../../../common/utils.js";

export const loadTeamTypes = (aiIni: IniFile): { [id: string]: AiTeamType } => {
    const teamTypeIndex = aiIni.getSection("TeamTypes");
    if (!teamTypeIndex) {
        throw new Error("Missing TeamTypes in ai.ini");
    }

    const teamTypes: { [id: string]: AiTeamType } = {};

    teamTypeIndex.entries.forEach((teamTypeId, key) => {
        const section = aiIni.getSection(teamTypeId);
        if (!section) {
            throw new Error(`Missing TeamType ${teamTypeId} in ai.ini`);
        }
        teamTypes[teamTypeId] = new AiTeamType(teamTypeId, section);
    });

    return teamTypes;
};

// https://modenc.renegadeprojects.com/Category:TeamTypes_Flags
export class AiTeamType {
    // This is not a full set of flags for a team type. Only those that are likely to be useful for skirmish behaviour are included.
    public readonly name: string;
    public readonly annoyance: boolean;
    public readonly areTeamMembersRecruitable: boolean;
    public readonly autocreate: boolean;
    public readonly avoidThreats: boolean;
    public readonly guardSlower: boolean;
    public readonly isBaseDefense: boolean;
    public readonly priority: number;
    public readonly max: number;
    public readonly reinforce: boolean;
    public readonly script: string;
    public readonly taskForce: string;
    public readonly whiner: boolean;

    constructor(
        public readonly id: string,
        iniSection: IniSection,
    ) {
        // it is assumed that iniSection is genuinely a TeamType, and not some other key.
        this.name = iniSection.getString("Name");
        this.annoyance = iniSection.getBool("Annoyance");
        this.areTeamMembersRecruitable = iniSection.getBool("AreTeamMembersRecruitable");
        this.autocreate = iniSection.getBool("Autocreate");
        this.avoidThreats = iniSection.getBool("AvoidThreats");
        this.guardSlower = iniSection.getBool("GuardSlower");
        this.isBaseDefense = iniSection.getBool("IsBaseDefense");
        this.priority = iniSection.getNumber("Priority");
        this.max = iniSection.getNumber("Max");
        this.reinforce = iniSection.getBool("Reinforce");
        this.script = iniSection.getString("Script");
        this.taskForce = iniSection.getString("TaskForce");
        this.whiner = iniSection.getBool("Whiner");
    }
}
