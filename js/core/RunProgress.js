/**
 * RunProgress — localStorage-based roguelike progression.
 *
 * Tracks two layers of state:
 *  1. **Current run** — kitId, boss number, potions, health (survives tab close)
 *  2. **Meta stats** — lifetime totals that persist forever (runs, kills, deaths, best streak)
 *
 * Boss scaling: each subsequent boss in a run gains +25 % HP and +15 % damage.
 */

const STORAGE_RUN  = 'eldenflame_run';
const STORAGE_META = 'eldenflame_meta';

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
     * Returns { health, damage, name } for the Nth boss in this run.
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
    }
};
