// Interpreter for ai.ini TriggerTypes

import { IniFile, IniSection } from "@chronodivide/game-api";

export const loadTaskForces = (aiIni: IniFile): { [id: string]: AiTaskForce } => {
    const taskForcesIndex = aiIni.getSection("TaskForces");
    if (!taskForcesIndex) {
        throw new Error("Missing TaskForces in ai.ini");
    }
    const taskForces: { [id: string]: AiTaskForce } = {};

    taskForcesIndex.entries.forEach((taskForceId, key) => {
        const section = aiIni.getSection(taskForceId);
        if (!section) {
            throw new Error(`Missing TaskForce ${taskForceId} in ai.ini`);
        }
        taskForces[taskForceId] = new AiTaskForce(taskForceId, section);
    });

    return taskForces;
};

const MAX_TASK_FORCE_SLOT = 50;

// https://modenc.renegadeprojects.com/TaskForces
export class AiTaskForce {
    public readonly name: string;
    public readonly units: { [unitName: string]: number } = {};

    constructor(
        public readonly id: string,
        iniSection: IniSection,
    ) {
        // it is assumed that iniSection is genuinely a TeamType, and not some other key.
        this.name = iniSection.getString("Name");
        for (let i = 0; i < MAX_TASK_FORCE_SLOT; ++i) {
            if (!iniSection.has(i.toString())) {
                break;
            }
            const text = iniSection.getString(i.toString());
            const [countStr, unitName] = text.split(",");
            this.units[unitName] = parseInt(countStr);
        }
    }
}
