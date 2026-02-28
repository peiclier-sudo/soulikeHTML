/**
 * HubManager — Controls Hub, Boutique, and Character pages.
 *
 * Lifecycle: constructed once at init. Each page is a show/hide overlay.
 * All persistent data goes through RunProgress.
 */

import { RunProgress } from '../core/RunProgress.js';
import { ITEMS, RARITIES, GEAR_SLOTS, getItemsBySlot, getItem } from '../data/ItemDefinitions.js';
import { TALENTS, TALENT_BRANCHES, getTalentsByBranch, getTalent } from '../data/TalentDefinitions.js';

export class HubManager {
    /**
     * @param {object} opts
     * @param {function} opts.onStartTower — called when player clicks Boss Tower
     * @param {function} opts.onBackToStart — called when player exits hub
     */
    constructor(opts = {}) {
        this.onStartTower = opts.onStartTower ?? (() => {});
        this.onBackToStart = opts.onBackToStart ?? (() => {});

        // Cache DOM
        this.hubScreen = document.getElementById('hub-screen');
        this.boutiqueScreen = document.getElementById('boutique-screen');
        this.characterScreen = document.getElementById('character-screen');

        this._shopSlot = 'weapon';
        this._setupHub();
        this._setupBoutique();
        this._setupCharacter();
    }

    // ═══════════════════════════════════════════════════════════
    // HUB
    // ═══════════════════════════════════════════════════════════

    showHub() {
        this._hideAll();
        this._refreshSouls();
        this.hubScreen.style.display = 'flex';
    }

    _setupHub() {
        document.getElementById('hub-tower')?.addEventListener('click', () => {
            this.hubScreen.style.display = 'none';
            this.onStartTower();
        });
        document.getElementById('hub-boutique')?.addEventListener('click', () => {
            this.hubScreen.style.display = 'none';
            this.showBoutique();
        });
        document.getElementById('hub-character')?.addEventListener('click', () => {
            this.hubScreen.style.display = 'none';
            this.showCharacter();
        });
        document.getElementById('hub-back-btn')?.addEventListener('click', () => {
            this.hubScreen.style.display = 'none';
            this.onBackToStart();
        });
    }

    // ═══════════════════════════════════════════════════════════
    // BOUTIQUE
    // ═══════════════════════════════════════════════════════════

    showBoutique() {
        this._hideAll();
        this._refreshSouls();
        this.boutiqueScreen.style.display = 'flex';
        this._renderShop();
    }

    _setupBoutique() {
        document.getElementById('boutique-back-btn')?.addEventListener('click', () => {
            this.boutiqueScreen.style.display = 'none';
            this.showHub();
        });

        document.getElementById('shop-tabs')?.addEventListener('click', (e) => {
            const tab = e.target.closest('.shop-tab');
            if (!tab) return;
            document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            this._shopSlot = tab.dataset.slot;
            this._renderShop();
        });
    }

    _renderShop() {
        const grid = document.getElementById('shop-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const pd = RunProgress.getPlayerData();
        const items = getItemsBySlot(this._shopSlot);

        for (const item of items) {
            const owned = item.consumable ? false : (pd.ownedItems.includes(item.id) || item.cost === 0);
            const canAfford = pd.souls >= item.cost;
            const rarity = RARITIES[item.rarity];

            const el = document.createElement('div');
            el.className = 'shop-item' + (owned ? ' owned' : '');

            // Stats display
            const statsHTML = Object.entries(item.stats)
                .filter(([, v]) => v)
                .map(([k, v]) => {
                    const label = this._statLabel(k);
                    const val = typeof v === 'number' && v < 1 && v > 0 ? `+${(v * 100).toFixed(0)}%` : `+${v}`;
                    return `<span class="shop-item-stat">${val} ${label}</span>`;
                }).join('');

            el.innerHTML = `
                <div class="shop-item-header">
                    <span class="shop-item-icon">${item.icon}</span>
                    <span class="shop-item-name" style="color:${rarity.color}">${item.name}</span>
                </div>
                <div class="shop-item-rarity" style="color:${rarity.color}">${rarity.label}</div>
                <div class="shop-item-desc">${item.description}</div>
                <div class="shop-item-stats">${statsHTML}</div>
                ${owned
                    ? ''
                    : `<div class="shop-item-cost">${item.cost} SOULS</div>
                       <button class="shop-buy-btn ${canAfford ? '' : 'cant-afford'}"
                               data-item="${item.id}" data-cost="${item.cost}">
                           ${canAfford ? 'PURCHASE' : 'NOT ENOUGH SOULS'}
                       </button>`
                }
            `;

            grid.appendChild(el);
        }

        // Purchase click handler
        grid.querySelectorAll('.shop-buy-btn:not(.cant-afford)').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const itemId = btn.dataset.item;
                const cost = parseInt(btn.dataset.cost, 10);
                const item = getItem(itemId);

                // Consumables: spend souls + apply effect (repeatable)
                if (item?.consumable) {
                    if (!RunProgress.spendSouls(cost)) return;
                    this._applyConsumable(item.effect);
                    this._refreshSouls();
                    this._renderShop();
                    return;
                }

                if (RunProgress.purchaseItem(itemId, cost)) {
                    this._refreshSouls();
                    this._renderShop();
                }
            });
        });
    }

    // ═══════════════════════════════════════════════════════════
    // CHARACTER
    // ═══════════════════════════════════════════════════════════

    showCharacter() {
        this._hideAll();
        this._refreshSouls();
        this.characterScreen.style.display = 'flex';
        this._renderGear();
        this._renderTalents();
        this._renderStatSummary();
    }

    _setupCharacter() {
        document.getElementById('char-back-btn')?.addEventListener('click', () => {
            this.characterScreen.style.display = 'none';
            this.showHub();
        });

        // Close gear picker on overlay click
        document.getElementById('gear-picker-overlay')?.addEventListener('click', (e) => {
            if (e.target.id === 'gear-picker-overlay') {
                e.target.style.display = 'none';
            }
        });
    }

    _renderGear() {
        const container = document.getElementById('gear-slots');
        if (!container) return;
        container.innerHTML = '';

        const pd = RunProgress.getPlayerData();
        const slotLabels = { weapon: 'Weapon', helmet: 'Helmet', chest: 'Chest Armor', boots: 'Boots' };
        const emptyIcons = { weapon: '\u2694', helmet: '\u{1F3A9}', chest: '\u{1F6E1}', boots: '\u{1F462}' };

        for (const slot of GEAR_SLOTS) {
            const equippedId = pd.gear[slot];
            const item = equippedId ? getItem(equippedId) : null;
            const rarity = item ? RARITIES[item.rarity] : null;

            const el = document.createElement('div');
            el.className = 'gear-slot' + (item ? '' : ' empty');

            const statsText = item
                ? Object.entries(item.stats).filter(([, v]) => v).map(([k, v]) => {
                    return typeof v === 'number' && v < 1 && v > 0 ? `+${(v * 100).toFixed(0)}% ${this._statLabel(k)}` : `+${v} ${this._statLabel(k)}`;
                }).join(', ')
                : '';

            el.innerHTML = `
                <div class="gear-slot-icon">${item ? item.icon : emptyIcons[slot]}</div>
                <div class="gear-slot-info">
                    <div class="gear-slot-label">${slotLabels[slot]}</div>
                    <div class="gear-slot-name" ${rarity ? `style="color:${rarity.color}"` : ''}>${item ? item.name : 'Empty'}</div>
                    ${statsText ? `<div class="gear-slot-stats">${statsText}</div>` : ''}
                </div>
            `;

            el.addEventListener('click', () => this._openGearPicker(slot));
            container.appendChild(el);
        }
    }

    _openGearPicker(slot) {
        const overlay = document.getElementById('gear-picker-overlay');
        const titleEl = document.getElementById('gear-picker-title');
        const itemsEl = document.getElementById('gear-picker-items');
        if (!overlay || !itemsEl) return;

        const pd = RunProgress.getPlayerData();
        const slotLabels = { weapon: 'WEAPON', helmet: 'HELMET', chest: 'CHEST ARMOR', boots: 'BOOTS' };
        titleEl.textContent = `SELECT ${slotLabels[slot]}`;
        itemsEl.innerHTML = '';

        // "None" option to unequip
        const noneEl = document.createElement('div');
        noneEl.className = 'gear-picker-item' + (!pd.gear[slot] ? ' equipped' : '');
        noneEl.innerHTML = '<span style="color:rgba(255,255,255,0.4)">None (unequip)</span>';
        noneEl.addEventListener('click', () => {
            RunProgress.unequipSlot(slot);
            overlay.style.display = 'none';
            this._renderGear();
            this._renderStatSummary();
        });
        itemsEl.appendChild(noneEl);

        // Owned items for this slot
        const slotItems = getItemsBySlot(slot).filter(i => pd.ownedItems.includes(i.id) || i.cost === 0);
        for (const item of slotItems) {
            const rarity = RARITIES[item.rarity];
            const isEquipped = pd.gear[slot] === item.id;

            const el = document.createElement('div');
            el.className = 'gear-picker-item' + (isEquipped ? ' equipped' : '');

            const statsText = Object.entries(item.stats).filter(([, v]) => v).map(([k, v]) => {
                return typeof v === 'number' && v < 1 && v > 0 ? `+${(v * 100).toFixed(0)}% ${this._statLabel(k)}` : `+${v} ${this._statLabel(k)}`;
            }).join(', ');

            el.innerHTML = `
                <span style="font-size:1.3rem">${item.icon}</span>
                <div style="flex:1">
                    <div style="color:${rarity.color};font-size:0.85rem;letter-spacing:0.08rem">${item.name}</div>
                    <div style="font-size:0.65rem;color:#44cc44;margin-top:0.15rem">${statsText}</div>
                </div>
                ${isEquipped ? '<span style="color:#00d4ff;font-size:0.7rem">EQUIPPED</span>' : ''}
            `;

            el.addEventListener('click', () => {
                RunProgress.equipItem(item.id, slot);
                overlay.style.display = 'none';
                this._renderGear();
                this._renderStatSummary();
            });
            itemsEl.appendChild(el);
        }

        overlay.style.display = 'flex';
    }

    _renderTalents() {
        const container = document.getElementById('talent-branches');
        if (!container) return;
        container.innerHTML = '';

        const pd = RunProgress.getPlayerData();
        document.getElementById('talent-points').textContent = `${pd.talentPoints} POINTS`;

        for (const [branchId, branch] of Object.entries(TALENT_BRANCHES)) {
            const branchEl = document.createElement('div');
            branchEl.className = 'talent-branch';

            branchEl.innerHTML = `<div class="talent-branch-label" style="color:${branch.color}">${branch.icon} ${branch.label}</div>`;

            const talents = getTalentsByBranch(branchId);
            for (let i = 0; i < talents.length; i++) {
                const t = talents[i];
                const isUnlocked = pd.talents.includes(t.id);
                const prereqMet = !t.prereq || pd.talents.includes(t.prereq);
                const canAfford = pd.talentPoints >= t.cost;
                const isAvailable = !isUnlocked && prereqMet && canAfford;
                const isLocked = !isUnlocked && !prereqMet;

                // Connector line
                if (i > 0) {
                    const prevUnlocked = pd.talents.includes(talents[i - 1].id);
                    const conn = document.createElement('div');
                    conn.className = 'talent-connector' + (prevUnlocked ? ' unlocked' : '');
                    branchEl.appendChild(conn);
                }

                const nodeEl = document.createElement('div');
                nodeEl.className = 'talent-node' +
                    (isUnlocked ? ' unlocked' : '') +
                    (isAvailable ? ' available' : '') +
                    (isLocked ? ' locked' : '');

                const statsDesc = Object.entries(t.stats).map(([k, v]) => {
                    return typeof v === 'number' && v < 1 && v > 0 ? `+${(v * 100).toFixed(0)}% ${this._statLabel(k)}` : `+${v} ${this._statLabel(k)}`;
                }).join(', ');

                nodeEl.innerHTML = `
                    <span class="talent-node-icon">${t.icon}</span>
                    <div class="talent-node-name">${t.name}</div>
                    <div class="talent-node-cost">${isUnlocked ? 'UNLOCKED' : `${t.cost} pt`}</div>
                    <div class="talent-tooltip">
                        <div class="talent-tooltip-name" style="color:${branch.color}">${t.name}</div>
                        <div class="talent-tooltip-desc">${t.description}<br><span style="color:#44cc44;font-size:0.6rem">${statsDesc}</span></div>
                    </div>
                `;

                if (isAvailable) {
                    nodeEl.addEventListener('click', () => {
                        if (RunProgress.unlockTalent(t.id, t.cost)) {
                            this._renderTalents();
                            this._renderStatSummary();
                        }
                    });
                }

                branchEl.appendChild(nodeEl);
            }

            container.appendChild(branchEl);
        }
    }

    _renderStatSummary() {
        const container = document.getElementById('char-stat-summary');
        if (!container) return;

        const bonuses = this._calculateTotalBonuses();
        const stats = [
            { label: 'DMG', value: `+${bonuses.damage}` },
            { label: 'HP', value: `+${bonuses.health}` },
            { label: 'ARMOR', value: `+${bonuses.armor}` },
            { label: 'STAM', value: `+${bonuses.stamina}` },
            { label: 'CRIT', value: `+${(bonuses.critChance * 100).toFixed(0)}%` },
            { label: 'SPEED', value: `+${bonuses.runSpeed.toFixed(1)}` },
        ];

        container.innerHTML = stats.map(s =>
            `<div class="char-summary-stat"><span class="char-summary-value">${s.value}</span><span class="char-summary-label">${s.label}</span></div>`
        ).join('');
    }

    /** Calculate combined stat bonuses from gear + talents */
    _calculateTotalBonuses() {
        const pd = RunProgress.getPlayerData();
        const bonuses = {
            damage: 0, health: 0, armor: 0, stamina: 0,
            critChance: 0, critMultiplier: 0, backstabMultiplier: 0,
            lifesteal: 0, runSpeed: 0, jumpForce: 0, attackSpeed: 0,
            healthRegen: 0, soulBonus: 0
        };

        // Gear bonuses
        for (const slot of GEAR_SLOTS) {
            const itemId = pd.gear[slot];
            if (!itemId) continue;
            const item = getItem(itemId);
            if (!item) continue;
            for (const [k, v] of Object.entries(item.stats)) {
                if (k in bonuses) bonuses[k] += v;
            }
        }

        // Talent bonuses
        for (const talentId of pd.talents) {
            const t = getTalent(talentId);
            if (!t) continue;
            for (const [k, v] of Object.entries(t.stats)) {
                if (k in bonuses) bonuses[k] += v;
            }
        }

        return bonuses;
    }

    /** Get bonuses to apply to GameState at game start */
    getStatBonuses() {
        return this._calculateTotalBonuses();
    }

    // ═══════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════

    _applyConsumable(effect) {
        switch (effect) {
            case 'addPotion': {
                const run = RunProgress.getSavedRun();
                if (run) { run.potions = (run.potions ?? 5) + 1; localStorage.setItem('eldenflame_run', JSON.stringify(run)); }
                break;
            }
            case 'addPotionx3': {
                const run = RunProgress.getSavedRun();
                if (run) { run.potions = (run.potions ?? 5) + 3; localStorage.setItem('eldenflame_run', JSON.stringify(run)); }
                break;
            }
            case 'addTalentPoint':
                RunProgress.addTalentPoint(1);
                break;
        }
    }

    _hideAll() {
        this.hubScreen.style.display = 'none';
        this.boutiqueScreen.style.display = 'none';
        this.characterScreen.style.display = 'none';
    }

    _refreshSouls() {
        const pd = RunProgress.getPlayerData();
        const text = `${pd.souls} SOULS`;
        const els = ['hub-souls', 'boutique-souls', 'char-souls'];
        els.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        });
    }

    _statLabel(key) {
        const labels = {
            damage: 'DMG', health: 'HP', armor: 'Armor', stamina: 'Stamina',
            critChance: 'Crit', critMultiplier: 'Crit DMG', backstabMultiplier: 'Backstab',
            lifesteal: 'Lifesteal', runSpeed: 'Speed', jumpForce: 'Jump',
            attackSpeed: 'Atk Speed', healthRegen: 'HP/s', soulBonus: 'Soul Bonus'
        };
        return labels[key] ?? key;
    }
}
