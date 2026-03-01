/**
 * TalentSystem — Core logic for the kit-specific talent tree.
 *
 * Handles: talent allocation, prerequisite validation, choice node exclusion,
 * stat bonus calculation, and talent effect queries.
 *
 * This is a pure logic module with no UI or persistence — those are handled
 * by HubManager and RunProgress respectively.
 */

import {
    getKitTalents, getKitTalent, getKitSpine, getKitBranches,
    getKitTalentsByBranch, getChoiceGroupNodes, getBranchTheme,
    BRANCH_THEMES
} from '../data/TalentDefinitions.js';

export const TalentSystem = {

    // ── Query methods ─────────────────────────────────────────

    /**
     * Check if a talent can be unlocked.
     * @param {string} kitId — e.g. 'blood_mage'
     * @param {string} talentId — e.g. 'bm_h3'
     * @param {string[]} unlockedTalents — currently unlocked talent IDs
     * @param {number} availablePoints — talent points available
     * @returns {{ canUnlock: boolean, reason: string }}
     */
    canUnlock(kitId, talentId, unlockedTalents, availablePoints) {
        const talent = getKitTalent(kitId, talentId);
        if (!talent) return { canUnlock: false, reason: 'Talent not found.' };

        // Already unlocked
        if (unlockedTalents.includes(talentId)) {
            return { canUnlock: false, reason: 'Already unlocked.' };
        }

        // Cost check
        if (availablePoints < talent.cost) {
            return { canUnlock: false, reason: `Need ${talent.cost} points (have ${availablePoints}).` };
        }

        // Prerequisite check — need at least one prereq satisfied (OR logic for choice node convergence)
        if (talent.prereqs && talent.prereqs.length > 0) {
            const anyPrereqMet = talent.prereqs.some(pid => unlockedTalents.includes(pid));
            if (!anyPrereqMet) {
                return { canUnlock: false, reason: 'Prerequisite not met.' };
            }
        }

        // Branch gating — non-spine talents need their branch connector unlocked
        if (talent.branch !== 'spine') {
            const spine = getKitSpine(kitId);
            const connector = spine.find(s => s.unlocksBranch === talent.branch);
            if (connector && !unlockedTalents.includes(connector.id)) {
                return { canUnlock: false, reason: 'Branch not unlocked yet.' };
            }
        }

        // Spine ordering — spine nodes must be unlocked in order
        if (talent.branch === 'spine') {
            const spine = getKitSpine(kitId);
            const idx = spine.findIndex(s => s.id === talentId);
            if (idx > 0 && !unlockedTalents.includes(spine[idx - 1].id)) {
                return { canUnlock: false, reason: 'Unlock previous spine node first.' };
            }
        }

        // Choice node exclusion — if this is a choice node, check if rival is already picked
        if (talent.choiceGroup) {
            const rivals = getChoiceGroupNodes(kitId, talent.choiceGroup);
            const rivalPicked = rivals.find(r => r.id !== talentId && unlockedTalents.includes(r.id));
            if (rivalPicked) {
                return { canUnlock: false, reason: `Cannot pick — chose "${rivalPicked.name}" instead.` };
            }
        }

        return { canUnlock: true, reason: '' };
    },

    /**
     * Get the display state of a talent node.
     * @returns {'unlocked'|'available'|'locked'|'excluded'}
     */
    getNodeState(kitId, talentId, unlockedTalents, availablePoints) {
        if (unlockedTalents.includes(talentId)) return 'unlocked';

        const talent = getKitTalent(kitId, talentId);
        if (!talent) return 'locked';

        // Check if excluded by choice group
        if (talent.choiceGroup) {
            const rivals = getChoiceGroupNodes(kitId, talent.choiceGroup);
            const rivalPicked = rivals.find(r => r.id !== talentId && unlockedTalents.includes(r.id));
            if (rivalPicked) return 'excluded';
        }

        const { canUnlock } = this.canUnlock(kitId, talentId, unlockedTalents, availablePoints);
        return canUnlock ? 'available' : 'locked';
    },

    // ── Stat aggregation ──────────────────────────────────────

    /**
     * Calculate total stat bonuses from unlocked talents.
     * Returns a flat object with all stat keys accumulated.
     */
    calculateBonuses(kitId, unlockedTalents) {
        const bonuses = {
            // Standard stats (applied via GameState.bonuses)
            damage: 0, health: 0, armor: 0, stamina: 0,
            critChance: 0, critMultiplier: 0, backstabMultiplier: 0,
            lifesteal: 0, runSpeed: 0, jumpForce: 0, attackSpeed: 0,
            healthRegen: 0, soulBonus: 0,
        };

        const talents = getKitTalents(kitId);
        for (const t of talents) {
            if (!unlockedTalents.includes(t.id)) continue;
            if (!t.stats) continue;
            for (const [key, value] of Object.entries(t.stats)) {
                if (key in bonuses) {
                    bonuses[key] += value;
                }
            }
        }

        return bonuses;
    },

    /**
     * Get all special (non-standard-stat) talent effects for a kit.
     * Returns a merged object of all special properties from unlocked talents.
     * Used by combat systems to query talent-specific behavior.
     */
    getSpecialEffects(kitId, unlockedTalents) {
        const effects = {};
        const talents = getKitTalents(kitId);

        for (const t of talents) {
            if (!unlockedTalents.includes(t.id)) continue;
            if (!t.stats) continue;

            // Standard stat keys to skip
            const standardKeys = new Set([
                'damage', 'health', 'armor', 'stamina',
                'critChance', 'critMultiplier', 'backstabMultiplier',
                'lifesteal', 'runSpeed', 'jumpForce', 'attackSpeed',
                'healthRegen', 'soulBonus'
            ]);

            for (const [key, value] of Object.entries(t.stats)) {
                if (!standardKeys.has(key)) {
                    // For numeric values, accumulate; for booleans, set true
                    if (typeof value === 'boolean') {
                        effects[key] = value;
                    } else if (typeof value === 'number' && key in effects) {
                        effects[key] += value;
                    } else {
                        effects[key] = value;
                    }
                }
            }
        }

        return effects;
    },

    /**
     * Check if a specific talent effect is active.
     */
    hasEffect(kitId, unlockedTalents, effectKey) {
        const effects = this.getSpecialEffects(kitId, unlockedTalents);
        return !!effects[effectKey];
    },

    /**
     * Get the value of a specific talent effect (or default).
     */
    getEffectValue(kitId, unlockedTalents, effectKey, defaultValue = 0) {
        const effects = this.getSpecialEffects(kitId, unlockedTalents);
        return effects[effectKey] ?? defaultValue;
    },

    // ── Tree structure helpers ────────────────────────────────

    /**
     * Get the organized tree structure for rendering.
     * Returns: { spine: [...], branches: { branchId: { theme, talents } } }
     */
    getTreeLayout(kitId) {
        const spine = getKitSpine(kitId);
        const branchIds = getKitBranches(kitId);

        const branches = {};
        for (const bid of branchIds) {
            branches[bid] = {
                theme: getBranchTheme(bid),
                talents: getKitTalentsByBranch(kitId, bid),
            };
        }

        // Determine which spine connector unlocks which branch
        const connectors = {};
        for (const s of spine) {
            if (s.unlocksBranch) {
                connectors[s.id] = s.unlocksBranch;
            }
        }

        return {
            spine,
            branches,
            connectors,
            spineTheme: getBranchTheme('spine'),
        };
    },

    /**
     * Count total points spent in a specific branch.
     */
    getPointsInBranch(kitId, branchId, unlockedTalents) {
        const talents = getKitTalentsByBranch(kitId, branchId);
        return talents
            .filter(t => unlockedTalents.includes(t.id))
            .reduce((sum, t) => sum + t.cost, 0);
    },

    /**
     * Count total points spent across all branches.
     */
    getTotalPointsSpent(kitId, unlockedTalents) {
        const talents = getKitTalents(kitId);
        return talents
            .filter(t => unlockedTalents.includes(t.id))
            .reduce((sum, t) => sum + t.cost, 0);
    },
};
