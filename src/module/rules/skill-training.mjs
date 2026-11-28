/** Skill training: the name of a rank and the bonus it gives to the test (Unknown -20, Known +0, Trained +10, Experienced +20, Veteran +30). Pure. */
export const TRAINING_LEVELS = { 0: 'Unknown', 1: 'Known', 2: 'Trained', 3: 'Experienced', 4: 'Veteran' };
export const TRAINING_BONUS = { 0: -20, 1: 0, 2: 10, 3: 20, 4: 30 };

/** "Known (+0)", "Trained (+10)" */
export function trainingText(rank) {
    const r = Number(rank) || 0;
    const bonus = TRAINING_BONUS[r];
    if (bonus === undefined) return `Rank ${r}`;
    return `${TRAINING_LEVELS[r]} (${bonus >= 0 ? '+' : ''}${bonus})`;
}

/** A skill key of the actor ("techUse") as a readable name ("Tech Use"); the template label wins when it is known */
export function readableSkillName(key, labelFromTemplate = '') {
    if (labelFromTemplate) return labelFromTemplate;
    return String(key).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}
