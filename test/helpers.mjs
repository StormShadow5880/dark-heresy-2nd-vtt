// Minimal stand-ins for the Foundry globals used by the pure rule / view-model modules.
export function installFoundryStubs() {
    const notifications = { warnings: [], infos: [] };
    globalThis.ui = {
        notifications: {
            warn: (m) => notifications.warnings.push(m),
            info: (m) => notifications.infos.push(m),
        },
    };
    globalThis.game = { user: { name: 'Tester', isGM: false }, i18n: { lang: 'en' } };
    globalThis.foundry = {
        utils: {
            randomID: () => Math.random().toString(36).slice(2, 18),
            getProperty: (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj),
        },
        applications: { ux: { TextEditor: { implementation: { enrichHTML: async (t) => t } } } },
    };
    return notifications;
}

const CHARS = [
    ['weaponSkill', 'WS'],
    ['ballisticSkill', 'BS'],
    ['strength', 'S'],
    ['toughness', 'T'],
    ['agility', 'Ag'],
    ['intelligence', 'Int'],
    ['perception', 'Per'],
    ['willpower', 'WP'],
    ['fellowship', 'Fel'],
    ['influence', 'Inf'],
];

/** Creates a fake acolyte that records updates and flags. */
export function makeActor({ total = 1000, used = 0, charAdvance = 0, skillAdvance = 0, aptitudes = [], talents = [] } = {}) {
    const characteristics = Object.fromEntries(
        CHARS.map(([key, short]) => [key, { label: key, short, base: 30, advance: charAdvance, modifier: 0, unnatural: 0, cost: 0, total: 30 + charAdvance * 5, bonus: 3 }]),
    );
    const skills = {
        awareness: { label: 'Awareness', characteristics: ['Per'], characteristic: 'Per', advance: skillAdvance, isSpecialist: false, cost: 0, current: 30 },
        commonLore: {
            label: 'Common Lore',
            characteristics: ['Int'],
            characteristic: 'Int',
            isSpecialist: true,
            specialities: {
                imperium: { label: 'Imperium', advance: 1, taken: true, cost: 0, current: 30 },
                tech: { label: 'Tech', advance: 0, taken: false, cost: 0, current: 10 },
            },
        },
    };
    const flags = {};
    const actor = {
        updates: [],
        flags,
        system: { characteristics, skills, experience: { total, used }, psy: { cost: 0 } },
        id: 'actor1',
        failNextUpdate: false,
        async update(data) {
            if (this.failNextUpdate) {
                this.failNextUpdate = false;
                throw new Error('update failed');
            }
            this.updates.push(data);
            for (const [path, value] of Object.entries(data)) {
                if (path.startsWith('flags.dark-heresy-2nd.')) {
                    this.flags[path.slice('flags.dark-heresy-2nd.'.length)] = value;
                    continue;
                }
                const keys = path.split('.');
                const last = keys.pop();
                const target = keys.reduce((o, k) => o[k], this);
                target[last] = value;
            }
        },
        getFlag: (scope, key) => flags[key],
        async setFlag(scope, key, value) {
            flags[key] = value;
        },
        _skillAdvanceToValue: (a) => ({ 0: -20, 1: 0, 2: 10, 3: 20, 4: 30 })[Number(a)],
        characteristics,
        skills,
        items: [...aptitudes.map((name) => ({ type: 'aptitude', name })), ...talents.map((name) => ({ type: 'talent', name, system: { cost: 0 } }))],
        async createEmbeddedDocuments(type, list) {
            const made = list.map((d, i) => ({ ...d, id: `new${this.items.length + i}` }));
            this.items.push(...made);
            return made;
        },
        async deleteEmbeddedDocuments(type, ids) {
            this.items = this.items.filter((i) => !ids.includes(i.id));
        },
    };
    return actor;
}
