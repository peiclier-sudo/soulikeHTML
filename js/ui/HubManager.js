/**
 * HubManager — Controls Hub, Boutique, and Character pages.
 *
 * Lifecycle: constructed once at init. Each page is a show/hide overlay.
 * All persistent data goes through RunProgress.
 */

import { RunProgress } from '../core/RunProgress.js';
import { ITEMS, RARITIES, GEAR_SLOTS, getItemsBySlot, getItem } from '../data/ItemDefinitions.js';
import { TALENTS, TALENT_BRANCHES, getTalentsByBranch, getTalent, getKitTalent, getBranchTheme } from '../data/TalentDefinitions.js';
import { TalentSystem } from '../core/TalentSystem.js';

export class HubManager {
    /**
     * @param {object} opts
     * @param {function} opts.onStartTower — called when player clicks Boss Tower
     * @param {function} opts.onBackToStart — called when player exits hub
     */
    constructor(opts = {}) {
        this.onStartTower = opts.onStartTower ?? (() => {});
        this.onBackToStart = opts.onBackToStart ?? (() => {});

        /** Currently selected kit id — set by main.js before showing character */
        this._selectedKitId = null;

        // Cache DOM
        this.hubScreen = document.getElementById('hub-screen');
        this.boutiqueScreen = document.getElementById('boutique-screen');
        this.characterScreen = document.getElementById('character-screen');

        this._shopSlot = 'weapon';
        this._setupHub();
        this._setupBoutique();
        this._setupCharacter();
    }

    /** Set the currently selected kit (called by main.js) */
    setSelectedKit(kitId) {
        this._selectedKitId = kitId;
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
        const kitId = this._getActiveKitId();
        document.getElementById('talent-points').textContent = `${pd.talentPoints} POINTS`;

        // If no kit selected, show a message
        if (!kitId) {
            container.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:2rem;">Select a class to view talents.</div>';
            return;
        }

        const unlockedTalents = RunProgress.getKitTalents(kitId);
        const layout = TalentSystem.getTreeLayout(kitId);

        // Points spent counter
        const spentEl = document.createElement('div');
        spentEl.className = 'talent-spent-counter';
        const totalSpent = TalentSystem.getTotalPointsSpent(kitId, unlockedTalents);
        spentEl.textContent = `${totalSpent} POINTS SPENT`;
        container.appendChild(spentEl);

        // Reset button
        const resetBtn = document.createElement('button');
        resetBtn.className = 'talent-reset-btn';
        resetBtn.textContent = 'RESET TALENTS';
        resetBtn.addEventListener('click', () => {
            if (totalSpent === 0) return;
            const removed = RunProgress.resetKitTalents(kitId);
            // Calculate refund from removed talent costs
            let refund = 0;
            for (const tid of removed) {
                const t = getKitTalent(kitId, tid);
                if (t) refund += t.cost;
            }
            RunProgress.refundTalentPoints(refund);
            this._renderTalents();
            this._renderStatSummary();
        });
        container.appendChild(resetBtn);

        // ── Spine (central column) ────────────────────────────
        const treeEl = document.createElement('div');
        treeEl.className = 'talent-tree-layout';

        const spineCol = document.createElement('div');
        spineCol.className = 'talent-spine';
        spineCol.innerHTML = `<div class="talent-branch-label" style="color:${layout.spineTheme.color}">${layout.spineTheme.icon} CORE PATH</div>`;

        for (let i = 0; i < layout.spine.length; i++) {
            const t = layout.spine[i];
            const state = TalentSystem.getNodeState(kitId, t.id, unlockedTalents, pd.talentPoints);

            // Connector line
            if (i > 0) {
                const prevState = TalentSystem.getNodeState(kitId, layout.spine[i - 1].id, unlockedTalents, pd.talentPoints);
                const conn = document.createElement('div');
                conn.className = 'talent-connector' + (prevState === 'unlocked' ? ' unlocked' : '');
                spineCol.appendChild(conn);
            }

            // If this is a connector node that unlocks a branch, render a fork indicator
            if (t.unlocksBranch) {
                const forkEl = document.createElement('div');
                forkEl.className = 'talent-fork-indicator';
                const branchTheme = getBranchTheme(t.unlocksBranch);
                forkEl.innerHTML = `<span style="color:${branchTheme.color}">→ ${branchTheme.icon} ${branchTheme.label}</span>`;
                spineCol.appendChild(forkEl);
            }

            const nodeEl = this._createTalentNode(kitId, t, state, unlockedTalents, pd.talentPoints, layout.spineTheme);
            spineCol.appendChild(nodeEl);
        }

        treeEl.appendChild(spineCol);

        // ── Branches (side columns) ───────────────────────────
        const branchesContainer = document.createElement('div');
        branchesContainer.className = 'talent-branches-container';

        for (const [branchId, branchData] of Object.entries(layout.branches)) {
            const branchCol = document.createElement('div');
            branchCol.className = 'talent-branch';

            const theme = branchData.theme;
            branchCol.innerHTML = `<div class="talent-branch-label" style="color:${theme.color}">${theme.icon} ${theme.label}</div>`;

            // Check if branch is unlocked
            const connector = layout.spine.find(s => s.unlocksBranch === branchId);
            const branchUnlocked = connector ? unlockedTalents.includes(connector.id) : true;

            if (!branchUnlocked) {
                const lockMsg = document.createElement('div');
                lockMsg.className = 'talent-branch-locked-msg';
                lockMsg.textContent = 'Unlock via Core Path';
                branchCol.appendChild(lockMsg);
            }

            const talents = branchData.talents;
            let prevChoiceGroup = null;

            for (let i = 0; i < talents.length; i++) {
                const t = talents[i];
                const state = branchUnlocked
                    ? TalentSystem.getNodeState(kitId, t.id, unlockedTalents, pd.talentPoints)
                    : 'locked';

                // Connector line (skip for first node and between choice siblings)
                if (i > 0 && !(t.choiceGroup && t.choiceGroup === prevChoiceGroup)) {
                    const prevT = talents[i - 1];
                    // Skip connector if prev was a choice sibling
                    if (!(prevT.choiceGroup && prevT.choiceGroup === t.choiceGroup)) {
                        const prevState = branchUnlocked
                            ? TalentSystem.getNodeState(kitId, prevT.id, unlockedTalents, pd.talentPoints)
                            : 'locked';
                        const conn = document.createElement('div');
                        conn.className = 'talent-connector' + (prevState === 'unlocked' ? ' unlocked' : '');
                        branchCol.appendChild(conn);
                    }
                }

                // Choice group: render side by side
                if (t.choiceGroup && t.choiceGroup !== prevChoiceGroup) {
                    const choicePair = talents.filter(x => x.choiceGroup === t.choiceGroup);
                    if (choicePair.length === 2) {
                        // Add connector before choice
                        if (i > 0) {
                            const prevT = talents[i - 1];
                            const prevState = branchUnlocked
                                ? TalentSystem.getNodeState(kitId, prevT.id, unlockedTalents, pd.talentPoints)
                                : 'locked';
                            const conn = document.createElement('div');
                            conn.className = 'talent-connector' + (prevState === 'unlocked' ? ' unlocked' : '');
                            branchCol.appendChild(conn);
                        }

                        const choiceRow = document.createElement('div');
                        choiceRow.className = 'talent-choice-row';

                        const choiceLabel = document.createElement('div');
                        choiceLabel.className = 'talent-choice-label';
                        choiceLabel.textContent = 'CHOOSE ONE';
                        branchCol.appendChild(choiceLabel);

                        for (const ct of choicePair) {
                            const cState = branchUnlocked
                                ? TalentSystem.getNodeState(kitId, ct.id, unlockedTalents, pd.talentPoints)
                                : 'locked';
                            const cNode = this._createTalentNode(kitId, ct, cState, unlockedTalents, pd.talentPoints, theme);
                            choiceRow.appendChild(cNode);
                        }

                        branchCol.appendChild(choiceRow);
                        prevChoiceGroup = t.choiceGroup;
                        continue;
                    }
                }

                // Skip second choice node (already rendered in pair)
                if (t.choiceGroup && t.choiceGroup === prevChoiceGroup) {
                    continue;
                }

                prevChoiceGroup = t.choiceGroup || null;
                const nodeEl = this._createTalentNode(kitId, t, state, unlockedTalents, pd.talentPoints, theme);
                branchCol.appendChild(nodeEl);
            }

            // Points in branch counter
            const branchPts = TalentSystem.getPointsInBranch(kitId, branchId, unlockedTalents);
            if (branchPts > 0) {
                const ptsBadge = document.createElement('div');
                ptsBadge.className = 'talent-branch-pts';
                ptsBadge.style.color = theme.color;
                ptsBadge.textContent = `${branchPts} pts`;
                branchCol.appendChild(ptsBadge);
            }

            branchesContainer.appendChild(branchCol);
        }

        treeEl.appendChild(branchesContainer);
        container.appendChild(treeEl);
    }

    /** Create a single talent node element */
    _createTalentNode(kitId, talent, state, unlockedTalents, availablePoints, theme) {
        const nodeEl = document.createElement('div');
        nodeEl.className = `talent-node talent-${talent.type} ${state}`;

        // Type badge
        const typeBadge = talent.type === 'keystone' ? '★ ' :
                          talent.type === 'capstone' ? '♛ ' :
                          talent.type === 'major' ? '◈ ' :
                          talent.type === 'connector' ? '◇ ' : '';

        const costText = state === 'unlocked' ? 'UNLOCKED' :
                         state === 'excluded' ? 'LOCKED' :
                         talent.cost === 0 ? 'FREE' :
                         `${talent.cost} pt`;

        // Build stats description for tooltip
        const statsDesc = talent.stats ? Object.entries(talent.stats).map(([k, v]) => {
            if (typeof v === 'boolean') return v ? k.replace(/([A-Z])/g, ' $1').trim() : '';
            return typeof v === 'number' && v < 1 && v > 0
                ? `+${(v * 100).toFixed(0)}% ${this._statLabel(k)}`
                : `+${v} ${this._statLabel(k)}`;
        }).filter(Boolean).join(', ') : '';

        nodeEl.innerHTML = `
            <span class="talent-node-icon">${talent.icon}</span>
            <div class="talent-node-name">${typeBadge}${talent.name}</div>
            <div class="talent-node-cost">${costText}</div>
            <div class="talent-tooltip">
                <div class="talent-tooltip-type">${talent.type.toUpperCase()}</div>
                <div class="talent-tooltip-name" style="color:${theme.color}">${talent.name}</div>
                <div class="talent-tooltip-desc">${talent.description}${statsDesc ? `<br><span style="color:#44cc44;font-size:0.6rem">${statsDesc}</span>` : ''}</div>
            </div>
        `;

        // Style based on type
        if (talent.type === 'keystone' || talent.type === 'capstone') {
            nodeEl.style.borderColor = state === 'unlocked' ? theme.color : '';
        }

        // Click handler
        if (state === 'available') {
            nodeEl.addEventListener('click', () => {
                if (RunProgress.unlockKitTalent(kitId, talent.id, talent.cost)) {
                    this._renderTalents();
                    this._renderStatSummary();
                }
            });
        }

        return nodeEl;
    }

    /** Get the active kit ID from saved run or selection */
    _getActiveKitId() {
        if (this._selectedKitId) return this._selectedKitId;
        const run = RunProgress.getSavedRun();
        return run?.kitId ?? null;
    }

    _renderStatSummary() {
        const container = document.getElementById('char-stat-summary');
        if (!container) return;

        const bonuses = this._calculateTotalBonuses();
        const stats = [
            { label: 'DMG', value: `+${bonuses.damage}`, show: bonuses.damage > 0 },
            { label: 'HP', value: `+${bonuses.health}`, show: bonuses.health > 0 },
            { label: 'ARMOR', value: `+${bonuses.armor}`, show: bonuses.armor > 0 },
            { label: 'STAM', value: `+${bonuses.stamina}`, show: bonuses.stamina > 0 },
            { label: 'CRIT', value: `+${(bonuses.critChance * 100).toFixed(0)}%`, show: bonuses.critChance > 0 },
            { label: 'CRIT DMG', value: `+${(bonuses.critMultiplier * 100).toFixed(0)}%`, show: bonuses.critMultiplier > 0 },
            { label: 'LIFESTEAL', value: `+${(bonuses.lifesteal * 100).toFixed(0)}%`, show: bonuses.lifesteal > 0 },
            { label: 'SPEED', value: `+${bonuses.runSpeed.toFixed(1)}`, show: bonuses.runSpeed > 0 },
            { label: 'ATK SPD', value: `+${(bonuses.attackSpeed * 100).toFixed(0)}%`, show: bonuses.attackSpeed > 0 },
            { label: 'HP/S', value: `+${bonuses.healthRegen}`, show: bonuses.healthRegen > 0 },
        ].filter(s => s.show);

        container.innerHTML = stats.map(s =>
            `<div class="char-summary-stat"><span class="char-summary-value">${s.value}</span><span class="char-summary-label">${s.label}</span></div>`
        ).join('');
    }

    /** Calculate combined stat bonuses from gear + talents (kit-specific) */
    _calculateTotalBonuses() {
        const pd = RunProgress.getPlayerData();
        const kitId = this._getActiveKitId();
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

        // Kit-specific talent bonuses (new system)
        if (kitId) {
            const kitBonuses = TalentSystem.calculateBonuses(kitId, RunProgress.getKitTalents(kitId));
            for (const [k, v] of Object.entries(kitBonuses)) {
                if (k in bonuses) bonuses[k] += v;
            }
        }

        // Legacy talent bonuses (for any old unlocked talents)
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

    /** Get special (non-stat) talent effects for the active kit */
    getTalentEffects() {
        const kitId = this._getActiveKitId();
        if (!kitId) return {};
        return TalentSystem.getSpecialEffects(kitId, RunProgress.getKitTalents(kitId));
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
            attackSpeed: 'Atk Speed', healthRegen: 'HP/s', soulBonus: 'Soul Bonus',
            // Talent-specific effect labels
            bloodDotBonus: 'Blood DoT', bleedDamage: 'Bleed DMG/s', bleedDuration: 'Bleed Duration',
            frozenDamageBonus: 'Frozen DMG', freezeDurationMult: 'Freeze Duration',
            poisonTickBonus: 'Poison DMG', maxPoisonCharges: 'Max Poison',
            maxTrustCharges: 'Max Trust', maxRageIncrease: 'Max Rage',
            vanishDurationBonus: 'Vanish Duration', teleportCdReduction: 'Teleport CD',
            thickHideDurationBonus: 'Hide Duration', thornsDamage: 'Thorns',
            frostStackBonus: 'Frost Stack Rate', healthPercent: 'Max HP %',
            chargedDamageMult: 'Charged DMG', comboWindowBonus: 'Combo Window',
            maxComboBonus: 'Max Combo',
        };
        return labels[key] ?? key.replace(/([A-Z])/g, ' $1').trim();
    }
}
