/**
 * RunProgress — localStorage-based roguelike progression.
 *
 * Tracks two layers of state:
 *  1. **Current run** — kitId, boss number, potions, health (survives tab close)
 *  2. **Meta stats** — lifetime totals that persist forever (runs, kills, deaths, best streak)
 *
 * Recovery codes: all save data can be packed into a portable alphanumeric code
 * that the player can use on any browser/device to restore their account.
 *
 * Boss scaling: each subsequent boss in a run gains +25 % HP and +15 % damage.
 */

const STORAGE_RUN  = 'eldenflame_run';
const STORAGE_META = 'eldenflame_meta';
const STORAGE_ACCT = 'eldenflame_account';
const STORAGE_PLAYER = 'eldenflame_player'; // persistent player data (gear, talents, souls)

// Kit ids mapped to short indices for compact encoding
const KIT_IDS = [
    'blood_mage', 'frost_mage', 'shadow_assassin',
    'bow_ranger', 'berserker', 'paladin'
];

// ─── helpers ──────────────────────────────────────────────────

function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function save(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch { /* quota */ }
}

// ─── default shapes ───────────────────────────────────────────

function defaultMeta() {
    return { totalRuns: 0, totalBossKills: 0, totalDeaths: 0, bestStreak: 0 };
}

function defaultRun() {
    return null; // no active run
}

// ─── public API ───────────────────────────────────────────────

export const RunProgress = {

    // ── meta stats (permanent) ────────────────────────────────

    getMeta() {
        return load(STORAGE_META) ?? defaultMeta();
    },

    _saveMeta(meta) {
        save(STORAGE_META, meta);
    },

    // ── current run ───────────────────────────────────────────

    /** Returns the saved run object, or null if no run in progress. */
    getSavedRun() {
        return load(STORAGE_RUN) ?? defaultRun();
    },

    hasSavedRun() {
        return this.getSavedRun() !== null;
    },

    /**
     * Start a brand-new run.  Called when the player picks a kit and clicks "Enter the Abyss".
     */
    startNewRun(kitId) {
        const meta = this.getMeta();
        meta.totalRuns++;
        this._saveMeta(meta);

        const run = {
            kitId,
            bossesDefeated: 0,
            potions: 5,
            health: null, // filled from kit on first save
            savedAt: Date.now()
        };
        save(STORAGE_RUN, run);
        return run;
    },

    /**
     * Called after a boss is defeated.
     * Snapshots player state so the next boss fight can continue.
     */
    onBossDefeated(gameState) {
        const run = this.getSavedRun();
        if (!run) return;

        run.bossesDefeated++;
        run.potions = gameState.player.healthPotions;
        run.health  = gameState.player.health;
        run.savedAt = Date.now();
        save(STORAGE_RUN, run);

        // update meta
        const meta = this.getMeta();
        meta.totalBossKills++;
        meta.bestStreak = Math.max(meta.bestStreak, run.bossesDefeated);
        this._saveMeta(meta);

        // Award souls and talent point
        const pd = this.getPlayerData();
        const soulBonus = 1 + (pd.talents?.includes?.('u_scavenger') ? 0.25 : 0);
        const baseSouls = 80 + run.bossesDefeated * 30;
        pd.souls += Math.floor(baseSouls * soulBonus);
        pd.talentPoints += 1;
        this.savePlayerData(pd);
    },

    /**
     * Called when the player quits mid-fight (pause → quit).
     * Saves current state so they can continue later.
     */
    saveRunState(gameState) {
        const run = this.getSavedRun();
        if (!run) return;
        run.potions = gameState.player.healthPotions;
        run.health  = gameState.player.health;
        run.savedAt = Date.now();
        save(STORAGE_RUN, run);
    },

    /**
     * Called when the player dies.  Ends the current run and records the death.
     */
    onPlayerDeath() {
        const meta = this.getMeta();
        meta.totalDeaths++;
        this._saveMeta(meta);
        this.clearRun();
    },

    /** Wipe the current run (death / manual reset). */
    clearRun() {
        localStorage.removeItem(STORAGE_RUN);
    },

    // ── boss scaling ──────────────────────────────────────────

    /**
     * Returns { health, damage } for the Nth boss in this run.
     * Boss 0 = base stats, each subsequent boss scales up.
     */
    getBossConfig(bossNumber) {
        const baseHP  = 2000;
        const baseDMG = 25;
        const hpScale  = 1 + bossNumber * 0.25;   // +25 % per boss
        const dmgScale = 1 + bossNumber * 0.15;    // +15 % per boss

        return {
            health: Math.round(baseHP * hpScale),
            damage: Math.round(baseDMG * dmgScale)
        };
    },

    // ── persistent player data (gear, talents, souls) ─────────

    /** Default player data shape */
    _defaultPlayer() {
        return {
            souls: 0,
            talentPoints: 0,
            talents: [],           // array of unlocked talent ids
            gear: {                // equipped item ids per slot
                weapon: null,
                helmet: null,
                chest: null,
                boots: null
            },
            ownedItems: []         // array of item ids the player has purchased
        };
    },

    getPlayerData() {
        return load(STORAGE_PLAYER) ?? this._defaultPlayer();
    },

    savePlayerData(data) {
        save(STORAGE_PLAYER, data);
    },

    addSouls(amount) {
        const pd = this.getPlayerData();
        pd.souls += amount;
        this.savePlayerData(pd);
        return pd.souls;
    },

    spendSouls(amount) {
        const pd = this.getPlayerData();
        if (pd.souls < amount) return false;
        pd.souls -= amount;
        this.savePlayerData(pd);
        return true;
    },

    purchaseItem(itemId, cost) {
        const pd = this.getPlayerData();
        if (pd.souls < cost) return false;
        if (pd.ownedItems.includes(itemId)) return false;
        pd.souls -= cost;
        pd.ownedItems.push(itemId);
        this.savePlayerData(pd);
        return true;
    },

    equipItem(itemId, slot) {
        const pd = this.getPlayerData();
        pd.gear[slot] = itemId;
        this.savePlayerData(pd);
    },

    unequipSlot(slot) {
        const pd = this.getPlayerData();
        pd.gear[slot] = null;
        this.savePlayerData(pd);
    },

    unlockTalent(talentId, cost) {
        const pd = this.getPlayerData();
        if (pd.talentPoints < cost) return false;
        if (pd.talents.includes(talentId)) return false;
        pd.talentPoints -= cost;
        pd.talents.push(talentId);
        this.savePlayerData(pd);
        return true;
    },

    addTalentPoint(count = 1) {
        const pd = this.getPlayerData();
        pd.talentPoints += count;
        this.savePlayerData(pd);
    },

    // ── account / recovery code ───────────────────────────────

    /** Returns the current account name, or null. */
    getAccount() {
        return load(STORAGE_ACCT);
    },

    /** Create account — just stores a display name and generates a code. */
    createAccount(name) {
        const acct = { name, createdAt: Date.now() };
        save(STORAGE_ACCT, acct);
        return this.generateRecoveryCode();
    },

    /**
     * Pack all save data into a portable recovery code.
     * Format: base64url of JSON { a, m, r }
     *   a = account, m = meta stats, r = current run (nullable)
     */
    generateRecoveryCode() {
        const payload = {
            v: 2,
            a: this.getAccount(),
            m: this.getMeta(),
            r: this.getSavedRun(),
            p: this.getPlayerData()
        };
        const json = JSON.stringify(payload);
        // base64url encode (browser-safe, no +/= chars)
        const b64 = btoa(unescape(encodeURIComponent(json)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        // Split into groups of 4 for readability
        return b64.match(/.{1,4}/g).join('-');
    },

    /**
     * Restore all save data from a recovery code.
     * Returns { success, account } or { success: false, error }.
     */
    restoreFromCode(code) {
        try {
            // Strip dashes and whitespace
            const clean = code.replace(/[-\s]/g, '');
            // Restore base64 padding
            const padded = clean + '=='.slice(0, (4 - clean.length % 4) % 4);
            const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
            const json = decodeURIComponent(escape(atob(b64)));
            const payload = JSON.parse(json);

            if (!payload.v || !payload.m) {
                return { success: false, error: 'Invalid code format' };
            }

            // Restore account
            if (payload.a) save(STORAGE_ACCT, payload.a);

            // Restore meta stats
            save(STORAGE_META, payload.m);

            // Restore current run (if one was in progress)
            if (payload.r) {
                save(STORAGE_RUN, payload.r);
            } else {
                localStorage.removeItem(STORAGE_RUN);
            }

            // Restore player data (gear, talents, souls)
            if (payload.p) save(STORAGE_PLAYER, payload.p);

            return { success: true, account: payload.a };
        } catch (e) {
            return { success: false, error: 'Could not decode recovery code' };
        }
    }
};
