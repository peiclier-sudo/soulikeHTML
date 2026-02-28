/**
 * Kit Definitions - Data-driven character class/specialization system
 *
 * Each kit defines: stats, abilities, visual theme colors, combat parameters,
 * and VFX parameters for all attacks and abilities.
 *
 * Classes: Mage (2), Rogue (2), Changeform (2)
 */

export const CLASS_MAGE = 'mage';
export const CLASS_ROGUE = 'rogue';
export const CLASS_CHANGEFORM = 'changeform';

/**
 * All 6 character kits.
 * Each kit has:
 *   id, name, className, description
 *   stats: { health, stamina, walkSpeed, runSpeed, jumpForce, armor }
 *   weapon: { name, damage, staminaCost, attackSpeed, range }
 *   combat: keyed ability configs (Q, E, X, C, F + LMB/RMB)
 *   theme: { primary, secondary, accent } hex colors for VFX/UI
 *   vfx: per-ability visual effect parameters (colors, geometry, particles, animation)
 *   model: which character model to load
 */
export const KIT_DEFINITIONS = {

    // ─── MAGE 1: BLOOD MAGE (existing) ────────────────────────────
    blood_mage: {
        id: 'blood_mage',
        name: 'Blood Mage',
        className: CLASS_MAGE,
        description: 'Wields forbidden blood magic. Drains life from foes and unleashes devastating crimson fire.',
        icon: '\u{1F525}',

        stats: {
            health: 100,
            stamina: 100,
            walkSpeed: 4,
            runSpeed: 8,
            jumpForce: 8,
            armor: 10,
            critChance: 0.15,
            critMultiplier: 1.5,
            backstabMultiplier: 1.3
        },

        weapon: {
            name: 'Claymore',
            damage: 25,
            staminaCost: 5,
            attackSpeed: 1.0,
            range: 2.75
        },

        // Combat system parameters
        combat: {
            // LMB: fireball projectile
            basicAttack: {
                type: 'projectile',
                damage: 20,
                speed: 20,
                radius: 0.25,
                lifetime: 1.5,
                staminaCost: 5
            },
            // RMB hold+release: charged fireball
            chargedAttack: {
                type: 'projectile_charged',
                damage: 55,
                speed: 20,
                radius: 0.72,
                lifetime: 2.4,
                chargeDuration: 1.0
            },
            // Q: Crimson Eruption (ground target AoE)
            abilityQ: {
                name: 'Crimson Eruption',
                type: 'ground_aoe',
                damage: 50,
                radius: 3.5,
                cooldown: 8,
                bloodChargeGain: 2
            },
            // E: Bloodflail (finisher consumes blood charges)
            abilityE: {
                name: 'Bloodflail',
                type: 'melee_finisher',
                baseDamage: 45,
                range: 3.8,
                requiresBloodCharges: true
            },
            // X: Blood Nova (AoE root/freeze)
            abilityX: {
                name: 'Blood Nova',
                type: 'nova_aoe',
                damage: 35,
                radius: 12,
                cooldown: 10,
                freezeDuration: 2.4
            },
            // C: Blood Shield
            abilityC: {
                name: 'Blood Shield',
                type: 'shield',
                duration: 6
            },
            // F: Ultimate crescent slash
            abilityF: {
                name: 'Blood Crescent',
                type: 'ultimate_projectile',
                damage: 120,
                chargeNeeded: 100
            }
        },

        vfx: {
            // ── LMB / RMB: Blood Fireball ──
            projectile: {
                // Shader material type: 'bloodfire' | 'ice' | 'basic'
                materialType: 'bloodfire',
                basic: {
                    segments: 8,
                    coreRatio: 0.55,
                    outer: { coreBrightness: 0.9, plasmaSpeed: 3.8, isCharged: 0.0, layerScale: 0.85, rimPower: 1.8, redTint: 0.92, alpha: 0.45 },
                    core:  { coreBrightness: 2.0, plasmaSpeed: 5.5, isCharged: 0.0, layerScale: 1.3,  rimPower: 1.8, redTint: 0.92 },
                    launchSparks: 5, launchEmbers: 3,
                    hitSparks: 4, hitEmbers: 3,
                    expireSmoke: 1
                },
                charged: {
                    segments: 12,
                    coreRatio: 0.55,
                    outer: { coreBrightness: 1.0, plasmaSpeed: 3.5, isCharged: 1.0, layerScale: 0.7, rimPower: 2.0, redTint: 0.92, alpha: 0.5 },
                    core:  { coreBrightness: 2.2, plasmaSpeed: 6.5, isCharged: 1.0, layerScale: 1.6, rimPower: 2.0, redTint: 0.92 },
                    releaseBurst: 0.15,
                    burstScale: 0.5, burstDur: 0.15,
                    launchSparks: 10, launchEmbers: 6,
                    hitSparks: 8, hitEmbers: 6,
                    expireSmoke: 3
                },
                fadeAlpha: 0.92,
                outerAlphaRatio: 0.5,
                hitRadiusPadding: { basic: 0.3, charged: 0.6 }
            },
            // ── RMB Charge Orb ──
            chargeOrb: {
                sphereRadius: 0.22,
                sphereSegments: 32,
                materialType: 'bloodfire',
                material: { coreBrightness: 0.9, plasmaSpeed: 4.5, isCharged: 1.0, layerScale: 1.2, rimPower: 2.0, redTint: 0.92 },
                ringCount: 36,
                ringSize: 0.04,
                ringColor: 0xaa0a0a,
                ringOpacity: 0.9,
                scaleRange: [0.2, 1.8],
                forwardOffset: 0.4,
                pulse: { base: 0.95, amp: 0.15, freq: 6 },
                alphaRange: [0.75, 1.0],
                brightnessRange: [0.9, 1.5],
                ringRadiusRange: [0.06, 0.6],
                ringOpacityRange: [0.5, 1.0]
            },
            // ── Q: Crimson Eruption ──
            abilityQ: {
                previewRing: { inset: 0.35, segments: 48, color: 0x880808, opacity: 0.5, groundY: 0.02 },
                disc: {
                    segments: 48,
                    material: { coreBrightness: 2.2, plasmaSpeed: 12, isCharged: 1.0, layerScale: 2.5, rimPower: 3.0, alpha: 0.9, redTint: 0.92 },
                    groundY: 0.02
                },
                expandDuration: 0.22,
                fadeCurve: { peakAlpha: 0.9, holdTime: 0.15 },
                duration: 1.35
            },
            // ── E: Blood Crescend ──
            abilityE: {
                whipDuration: 0.48,
                whipTrailCount: 18,
                whipOrbTrailCount: 10,
                whipHitSparks: 36,
                whipHitEmbers: 28,
                crescend: {
                    bladeLenBase: 2.2, bladeLenPerCharge: 0.5,
                    bladeWidthBase: 0.74, bladeWidthPerCharge: 0.16, bladeWidthScale: [0.92, 0.45],
                    outerSegments: 42, innerSegments: 34, coreSegments: 28,
                    innerScale: [0.86, 0.74], coreScale: [0.68, 0.50],
                    outer: { coreBrightnessBase: 1.55, coreBrightnessPerCharge: 0.18, plasmaSpeedBase: 7.0, layerScale: 1.36, rimPower: 1.5, alphaBase: 0.96, redTint: 0.95 },
                    innerColor: 0xff4a4a, innerOpacity: 0.5,
                    coreColor: 0xffc0a0, coreOpacity: 0.32,
                    speedBase: 25, speedPerCharge: 1.45,
                    lifetimeBase: 1.2, lifetimePerCharge: 0.07,
                    hitRadiusBase: 2.05, hitRadiusPerCharge: 0.34,
                    pulse: { base: 0.22, freq: 24, scaleFreq: 16 },
                    launchSparksBase: 14, launchSparksPerCharge: 3,
                    launchEmbersBase: 10, launchEmbersPerCharge: 2,
                    launchTrailBase: 10, launchTrailPerCharge: 2
                }
            },
            // ── X: Blood Nova ──
            abilityX: {
                previewRing: { radiusScale: 0.85, innerInset: 0.22, outerInset: 0.18, segments: 64, color: 0xaa1030, groundY: 0.03 },
                windupDuration: 0.12,
                windupScale: { start: 0.15, end: 1.15 },
                windupOpacity: { start: 0.2, end: 0.8 },
                windupSparks: 18, windupEmbers: 12,
                releaseSparks: 45, releaseEmbers: 35
            },
            // ── X alt: Life Drain Beam ──
            lifeDrain: {
                beamPoints: 140,
                maxSegmentLength: 0.11,
                core:   { radiusTop: 0.007, radiusBot: 0.013, segments: 8, coreBrightness: 1.5, plasmaSpeed: 10, isCharged: 0.4, layerScale: 1.3, rimPower: 2.2, redTint: 0.92, alpha: 0.88 },
                outer:  { radiusTop: 0.019, radiusBot: 0.028, segments: 8, coreBrightness: 0.9, plasmaSpeed: 6,  isCharged: 0.3, layerScale: 0.9, rimPower: 1.6, redTint: 0.92, alpha: 0.5 },
                strand: { radiusTop: 0.0025, radiusBot: 0.0045, segments: 6, coreBrightness: 1.4, plasmaSpeed: 12, isCharged: 0.5, layerScale: 1.6, rimPower: 2.4, redTint: 0.92, alpha: 0.9 },
                light: { color: 0xaa0a0a, distance: 14, decay: 2, intensityBase: 22, intensityPulse: 8, pulseFreq: 18 },
                waver: { seedMult: 18, ampBase: 0.25, ampPerDist: 0.028 },
                pulse: { base: 0.88, amp: 0.08, freq: 14 },
                flowInterval: 0.08, flowCount: 10,
                damageFlowCount: 18, burstInterval: 0.15,
                castFlowCount: 40
            },
            // ── F: Ultimate Blood Orb ──
            abilityF: {
                orbRadius: 0.52,
                orbSegments: 16,
                light: { color: 0xc1081a, distance: 25, decay: 2.5, intensityBase: 38, intensityPulse: 10, pulseFreq: 10 },
                outerGlow: { color: 0x7a0010, distance: 16, decay: 1.2, intensityBase: 14, intensityPulse: 4, pulseFreq: 8 },
                speed: 32,
                scaleStart: 0.28, scaleEnd: 4.5, growthDuration: 0.8,
                maxLifetime: 2.4,
                baseDamage: 280,
                launchAlpha: 0.92,
                pulse: { amp: 0.08, freq: 14 },
                launchSparks: 15, launchEmbers: 10,
                trailOrbs: 14, trailSlash: 6
            }
        },

        theme: {
            primary: 0x8b0000,    // dark red
            secondary: 0xff4422,  // blood orange
            accent: 0xffaa00,     // fire gold
            particleColor: 0xff2200,
            uiClass: 'kit-blood-mage'
        },

        model: 'character_3k_mage'
    },

    // ─── MAGE 2: FROST MAGE ───────────────────────────────────────
    frost_mage: {
        id: 'frost_mage',
        name: 'Frost Mage',
        className: CLASS_MAGE,
        description: 'Commands the bitter cold. Slows enemies with frost and shatters them with ice.',
        icon: '\u{2744}',

        stats: {
            health: 90,
            stamina: 110,
            walkSpeed: 4,
            runSpeed: 8,
            jumpForce: 8,
            armor: 8,
            critChance: 0.15,
            critMultiplier: 1.5,
            backstabMultiplier: 1.3
        },

        weapon: {
            name: 'Frost Staff',
            damage: 22,
            staminaCost: 4,
            attackSpeed: 1.1,
            range: 2.75
        },

        combat: {
            basicAttack: {
                type: 'projectile',
                damage: 18,
                speed: 22,
                radius: 0.22,
                lifetime: 1.6,
                staminaCost: 4
            },
            chargedAttack: {
                type: 'projectile_charged',
                damage: 50,
                speed: 18,
                radius: 0.65,
                lifetime: 2.6,
                chargeDuration: 1.1
            },
            abilityQ: {
                name: 'Ice Claw',
                type: 'projectile_homing',
                damage: 55,
                cooldown: 7,
                bloodChargeGain: 2
            },
            abilityE: {
                name: 'Frost Beam',
                type: 'melee_finisher',
                baseDamage: 42,
                range: 12,
                requiresBloodCharges: true
            },
            abilityX: {
                name: 'Stalactite',
                type: 'ground_targeted',
                damage: 85,
                radius: 4.0,
                cooldown: 12,
                freezeDuration: 2.5
            },
            abilityC: {
                name: 'Ice Barrier',
                type: 'shield',
                duration: 5
            },
            abilityF: {
                name: 'Blizzard',
                type: 'ultimate_aoe',
                damage: 28,
                radius: 8,
                duration: 3.5,
                chargeNeeded: 100
            }
        },

        vfx: {
            // ── LMB / RMB: Ice Javelin ──
            projectile: {
                materialType: 'ice',
                basic: {
                    length: 0.7, radius: 0.09, coneSides: 6,
                    coreScale: [0.5, 0.7],
                    outer: { coreBrightness: 1.2, iceSpeed: 3.5, isCharged: 0.0, layerScale: 1.0, rimPower: 2.0, alpha: 0.8 },
                    core:  { coreBrightness: 2.0, iceSpeed: 5.5, isCharged: 0.0, layerScale: 1.2, rimPower: 2.0 },
                    launchIceBurst: 5,
                    hitIceBurst: 6, hitIceShatter: 4,
                    expireIceBurst: 3
                },
                charged: {
                    length: 1.4, radius: 0.18, coneSides: 6,
                    coreScale: [0.5, 0.7],
                    outer: { coreBrightness: 1.6, iceSpeed: 4.5, isCharged: 1.0, layerScale: 0.8, rimPower: 2.5, alpha: 0.85 },
                    core:  { coreBrightness: 2.5, iceSpeed: 7.0, isCharged: 1.0, layerScale: 1.5, rimPower: 2.0 },
                    releaseBurst: 0.15,
                    launchIceBurst: 10,
                    hitIceBurst: 12, hitIceShatter: 8,
                    expireIceBurst: 8
                },
                fadeAlpha: 0.92,
                hitRadiusPadding: { basic: 0.3, charged: 0.6 }
            },
            // ── RMB Charge Orb ──
            chargeOrb: {
                sphereRadius: 0.22,
                sphereSegments: 32,
                materialType: 'ice',
                material: { coreBrightness: 0.9, iceSpeed: 4.5, isCharged: 1.0, layerScale: 1.2, rimPower: 2.0, displaceAmount: 0.3 },
                ringCount: 36,
                ringSize: 0.04,
                ringColor: 0x44aaff,
                ringOpacity: 0.9,
                scaleRange: [0.2, 1.8],
                forwardOffset: 0.4,
                pulse: { base: 0.95, amp: 0.15, freq: 6 },
                alphaRange: [0.75, 1.0],
                brightnessRange: [0.9, 1.5],
                ringRadiusRange: [0.06, 0.6],
                ringOpacityRange: [0.5, 1.0]
            },
            // ── Frost Stack Indicator (per-enemy) ──
            frostIndicator: {
                stackColors: [0x0a1a3a, 0x1a3a6a, 0x2255aa, 0x3377cc, 0x44aaee, 0x66ccff, 0x88ddff, 0xccf0ff],
                circleRadius: 1.6,
                arcSpan: 140,
                innerOrb: { radius: 0.055, segments: 6, coreBrightness: 1.4, iceSpeed: 4.0, isCharged: 0.5, layerScale: 1.2, alpha: 0.95 },
                outerOrb: { radius: 0.08, segments: 6, color: 0x0a2a5a, opacity: 0.7 },
                yOffset: 1.8,
                rotationSpeed: 1.5,
                pulseScale: { amp: 0.08, freq: 5 },
                freezeBurst: 40, freezeShatter: 25,
                decayTime: 10000
            },
            // ── Q: Ice Claw ──
            abilityQ: {
                homingRadius: 22,
                blade: {
                    innerRadius: 0.7, outerRadius: 1.5, segments: 14,
                    arcStart: -0.35, arcSpan: 0.7,
                    color: 0x88ddff, maxOpacity: 0.9
                },
                bladeConfigs: [
                    { rotZ: 0, stagger: 0 },
                    { rotZ: 0.70, stagger: 0.04 },
                    { rotZ: -0.70, stagger: 0.08 }
                ],
                spawnOffset: 0.4,
                initialScale: 0.15,
                speed: 20,
                maxLifetime: 0.75,
                homingStrengthBase: 9, homingStrengthStep: 2,
                swipeDuration: 0.12,
                spinRate: 2.5,
                spawnBurst: 8,
                hitShatter: 5,
                expiryShatter: 3,
                trailInterval: 4
            },
            // ── E: Frost Beam ──
            abilityE: {
                beamLength: 12,
                beamWidthBasePerCharge: 0.03, beamWidthBaseStart: 0.15,
                beamWidthTipPerCharge: 0.05, beamWidthTipStart: 0.35,
                outerSegments: 8,
                innerCore: { radiusTop: 0.06, radiusBot: 0.18, lengthRatio: 0.95, segments: 6 },
                outer: { coreBrightnessBase: 2.2, coreBrightnessPerCharge: 0.15, iceSpeed: 8.0, isCharged: 1.0, layerScale: 1.0, rimPower: 1.5, alpha: 0.85 },
                core:  { coreBrightness: 3.0, iceSpeed: 12.0, isCharged: 1.0, layerScale: 1.6 },
                light: { color: 0x66ccff, intensity: 12, distance: 14, decay: 2, fadeIntensity: 30 },
                duration: 0.6,
                fade: { lightIntensity: 30, scaleDown: 0.5 },
                spawnBurst: 25,
                hitBurstBase: 20, hitBurstPerStack: 4,
                hitShatterBase: 10, hitShatterPerStack: 3
            },
            // ── X: Stalactite ──
            abilityX: {
                previewRing: { inset: 0.3, outerInset: 0.15, segments: 48, color: 0x44aaff, opacity: 0.5 },
                spike: {
                    height: 5.0, radius: 0.8, coneSides: 6,
                    material: { coreBrightness: 1.8, iceSpeed: 3.0, isCharged: 1.0, layerScale: 0.5, rimPower: 2.5, displaceAmount: 0.6, alpha: 0.85 }
                },
                spawnHeight: 20,
                groundY: 2.5,
                shadow: { segments: 32, color: 0x44aaff, opacity: 0.3, groundY: 0.05 },
                light: { color: 0x66ccff, intensity: 10, distance: 16, decay: 2, impactIntensity: 25 },
                fallDuration: 0.35,
                impactDuration: 0.8,
                sinkRate: 0.5,
                impactShatter: 50, impactBurst: 40,
                trailCount: 8, trailInterval: 2
            },
            // ── F: Blizzard ──
            abilityF: {
                previewRing: { inset: 0.35, outerInset: 0.2, segments: 48, color: 0x44aaff, opacity: 0.45 },
                activeRing: { inset: 0.3, outerInset: 0.2, segments: 64, color: 0x44aaff, opacity: 0.5 },
                disc: {
                    segments: 48,
                    material: { coreBrightness: 1.5, iceSpeed: 10.0, isCharged: 1.0, layerScale: 2.0, rimPower: 2.5, alpha: 0.3 },
                    alphaScale: 0.35
                },
                light: { color: 0x44aaff, intensity: 15, distance: 18, decay: 2, pulseBase: 40, pulseAmp: 15, pulseFreq: 10 },
                centerY: 0.1,
                rotationSpeed: 2,
                spawnBurst: 50, expiryShatter: 50,
                trailInterval: 3,
                trailSpread: 2, trailYRange: [1, 4],
                damagePerTick: 28, tickInterval: 0.25
            }
        },

        theme: {
            primary: 0x1a4a8a,    // deep blue
            secondary: 0x44aaff,  // ice blue
            accent: 0xcceeff,     // frost white
            particleColor: 0x66ccff,
            uiClass: 'kit-frost-mage'
        },

        model: 'character_3k_mage'
    },

    // ─── ROGUE 1: SHADOW ASSASSIN (dagger CAC) ────────────────────
    shadow_assassin: {
        id: 'shadow_assassin',
        name: 'Shadow Assassin',
        className: CLASS_ROGUE,
        description: 'A toxic assassin with emerald dashes and instant strikes. Build poison charges, then blink behind targets.',
        icon: '\u{1F5E1}',

        stats: {
            health: 80,
            stamina: 130,
            walkSpeed: 5,
            runSpeed: 10,
            jumpForce: 9,
            armor: 5,
            critChance: 0.30,
            critMultiplier: 1.75,
            backstabMultiplier: 1.5
        },

        weapon: {
            name: 'Shadow Daggers',
            damage: 18,
            staminaCost: 3,
            attackSpeed: 1.6,
            range: 2.0
        },

        combat: {
            basicAttack: {
                name: 'Green Slash',
                type: 'melee',
                damage: 22,
                staminaCost: 3,
                range: 2.2,
                poisonChargeGain: 1
            },
            chargedAttack: {
                name: 'Double Slash',
                type: 'melee',
                damage: 42,
                staminaCost: 8,
                range: 2.2,
                chargeDuration: 0.5,
                poisonChargeGain: 2
            },
            abilityA: {
                name: 'Teleport Behind',
                type: 'teleport_buff',
                cooldown: 12,
                damageBuffDuration: 3,
                damageBuffMultiplier: 2.0
            },
            abilityQ: {
                name: 'Shadow Step',
                type: 'ground_aoe',
                damage: 35,
                radius: 2.5,
                cooldown: 6
            },
            abilityE: {
                name: 'Poison Pierce',
                type: 'melee_finisher',
                baseDamage: 40,
                damagePerCharge: 18,
                range: 2.8,
                requiresPoisonCharges: true,
                poisonDurationPerCharge: 2
            },
            abilityX: {
                name: 'Toxic Focus',
                type: 'consume_charges_buff',
                cooldown: 20,
                damagePercentPerCharge: 20,
                buffDuration: 8
            },
            abilityC: {
                name: 'Vanish',
                type: 'vanish',
                duration: 5,
                speedMultiplier: 1.6
            },
            abilityF: {
                name: 'Twin Daggers',
                type: 'ultimate_hold_release',
                damage: 180,
                chargeNeeded: 100,
                range: 14
            }
        },

        vfx: {
            // ── LMB: Blade Wave (melee slash) ──
            projectile: {
                materialType: 'basic',
                basic: {
                    bladeLen: 3.2, bladeWidth: 0.55,
                    curveSegments: 10,
                    coreColor: 0x33ff77, coreOpacity: 0.95,
                    glowColor: 0x22cc66, glowOpacity: 0.3,
                    glowScale: [1.35, 1.0, 1.6],
                    speed: 30, maxLifetime: 0.2,
                    slashAngles: [-0.35, 0.35],
                    expandScale: [0.6, 1.2],
                    fadeCore: 0.92, fadeGlow: 0.45,
                    launchPoisonBurst: 6,
                    hitPoisonBurst: 18
                },
                charged: {
                    bladeLen: 3.8, bladeWidth: 0.7,
                    curveSegments: 10,
                    spreadAngle: 0.55,
                    coreColor: 0x55ff90, coreOpacity: 0.95,
                    glowColor: 0x22cc66, glowOpacity: 0.35,
                    glowScale: [1.3, 1.0, 1.5],
                    speed: 32, maxLifetime: 0.24,
                    launchPoisonBurst: 16, launchShadowBurst: 12
                }
            },
            // ── RMB Charge Orb ──
            chargeOrb: {
                sphereRadius: 0.22,
                sphereSegments: 32,
                materialType: 'basic',
                material: { color: 0x44ff70, emissive: 0x22aa44, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.1, opacity: 0.9 },
                ringCount: 36,
                ringSize: 0.04,
                ringColor: 0x44ff70,
                ringOpacity: 0.9,
                scaleRange: [0.2, 1.8],
                forwardOffset: 0.4,
                pulse: { base: 0.95, amp: 0.15, freq: 6 },
                alphaRange: [0.75, 1.0],
                brightnessRange: [0.9, 1.5],
                ringRadiusRange: [0.06, 0.6],
                ringOpacityRange: [0.5, 1.0]
            },
            // ── V/A: Teleport Behind ──
            abilityA: {
                heightOffset: 0.8,
                departureSmoke: 10,
                arrivalBurst: 14
            },
            // ── E: Poison Pierce (green blade projectile) ──
            abilityE: {
                bladeLenBase: 4.0, bladeLenPerCharge: 0.6,
                bladeWidthBase: 0.6, bladeWidthPerCharge: 0.1,
                fanAngles: [-0.4, 0, 0.4],
                coreColors: [0x33dd55, 0x55ff88, 0x33dd55],
                glowColors: [0x1a8833, 0x22cc55, 0x1a8833],
                coreSegments: 8, glowSegments: 6,
                coreOpacity: 0.95, glowOpacity: 0.35,
                glowScale: [1.35, 1.0, 1.5],
                flash: { color: 0xccffcc, opacity: 0.5, lengthRatio: 0.9, widthRatio: 0.3 },
                speedBase: 28, speedPerChargeRatio: 12,
                lifetimeBase: 0.4, lifetimePerChargeRatio: 0.15,
                hitRadiusBase: 2.6, hitRadiusPerChargeRatio: 1.2,
                expandDuration: 0.25,
                scaleRange: [0.5, 1.2],
                trailInterval: 3, trailCount: 2,
                launchBurstBase: 16, launchBurstPerCharge: 3,
                hitBurstBase: 18, hitBurstPerCharge: 3,
                startOffset: 0.6
            },
            // ── C: Vanish ──
            abilityC: {
                heightOffset: 0.8,
                vanishSmoke: 18,
                vanishPoisonBurst: 8
            },
            // ── F: Twin Daggers Ultimate ──
            abilityF: {
                blade1: { radius: 0.12, height: 1.1, segments: 4, color: 0x44ff70, opacity: 0.95, offsetX: 0.25 },
                blade2: { color: 0x9944ff, opacity: 0.85, offsetX: -0.25 },
                ring: { innerRadius: 0.3, outerRadius: 0.6, segments: 8, color: 0x33ff66, opacity: 0.4 },
                spinSpeed: 18,
                speed: 22,
                range: 14,
                trailInterval: 3, trailCount: 1,
                hitMargin: 0.8,
                hitBurst: 12, expiryBurst: 10,
                launchBurstBase: 10, launchBurstPerCharge: 2
            }
        },

        theme: {
            primary: 0x0b2a12,
            secondary: 0x1fbf4c,
            accent: 0x8bff7a,
            particleColor: 0x4dff66,
            uiClass: 'kit-shadow-assassin'
        },

        model: 'character_3k_rogue',
        animationKey: 'character_3k_rogue_dagger'
    },

    // ─── ROGUE 2: BOW RANGER ──────────────────────────────────────
    bow_ranger: {
        id: 'bow_ranger',
        name: 'Bow Ranger',
        className: CLASS_ROGUE,
        description: 'Precision archer. Builds Trust through relentless volleys, then unleashes devastating judgment arrows.',
        icon: '\u{1F3F9}',

        stats: {
            health: 85,
            stamina: 115,
            walkSpeed: 4.5,
            runSpeed: 9.5,
            jumpForce: 8.5,
            armor: 6,
            critChance: 0.25,
            critMultiplier: 1.65,
            backstabMultiplier: 1.5
        },

        weapon: {
            name: 'Longbow',
            damage: 20,
            staminaCost: 3,
            attackSpeed: 1.3,
            range: 3.0
        },

        combat: {
            // LMB: single blue arrow
            basicAttack: {
                type: 'projectile',
                damage: 22,
                speed: 30,
                radius: 0.18,
                lifetime: 2.0,
                staminaCost: 3,
                trustChargeGain: 1
            },
            // RMB: 3-arrow spread
            chargedAttack: {
                type: 'projectile_charged',
                damage: 18,
                speed: 28,
                radius: 0.18,
                lifetime: 1.8,
                chargeDuration: 0.7,
                arrowCount: 3,
                trustChargeGain: 2
            },
            // A/V: Recoil Shot - fire + dash backward
            abilityA: {
                name: 'Recoil Shot',
                type: 'dash_attack',
                damage: 55,
                cooldown: 6,
                dashDistance: 5.5
            },
            // E: Judgment Arrow - consume Trust stacks
            abilityE: {
                name: 'Judgment Arrow',
                type: 'consume_charges_projectile',
                baseDamage: 65,
                damagePercentPerCharge: 25,
                requiresTrustCharges: true
            },
            // X: Multi Shot - rapid fire, debuffs target
            abilityX: {
                name: 'Multi Shot',
                type: 'rapid_fire',
                damagePerArrow: 18,
                arrowCount: 6,
                cooldown: 10,
                debuffDuration: 6,
                debuffMultiplier: 1.5
            },
            // C: Hunter's Mark Zone - +100% damage while inside
            abilityC: {
                name: "Hunter's Mark",
                type: 'ground_zone',
                duration: 5,
                radius: 3.5,
                damageMultiplier: 2.0,
                cooldown: 14
            },
            // F: Ultimate - huge piercing arrow
            abilityF: {
                name: 'Skyfall Arrow',
                type: 'ultimate_piercing',
                damage: 200,
                chargeNeeded: 100
            }
        },

        vfx: {
            // ── LMB / RMB: Arrow ──
            projectile: {
                materialType: 'arrow',
                arrowColor: 0x8844ff,
                arrowHeadColor: 0xccaaff,
                glowColor: 0x8844ff,
                fletchingColor: 0xaa77ee,
                shaft: { taperRatio: 0.85, segments: 5 },
                head: { lengthScale: 0.28, radiusScale: 0.075, segments: 4, opacity: 1.0 },
                glow: { radiusScale: 0.12, segments: 6, opacity: 0.35 },
                fletching: { lengthScale: 0.22, widthScale: 0.06, opacity: 0.6, tailPosition: 0.42, count: 2 },
                basic: {
                    scale: 1.0, releaseBurst: 0,
                    launchSparks: 4
                },
                charged: {
                    scale: 1.3, releaseBurst: 0.12,
                    spreadAngle: 0.12,
                    launchSparks: 12
                },
                hitSparks: { basic: 4, charged: 8 },
                hitVioletBurst: { basic: 3, charged: 6 },
                expireSparks: { basic: 3, charged: 6 }
            },
            // ── RMB Charge Orb ──
            chargeOrb: {
                sphereRadius: 0.22,
                sphereSegments: 32,
                materialType: 'standard',
                material: { color: 0x8844ff, emissive: 0x4422aa, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.1, opacity: 0.9 },
                ringCount: 36,
                ringSize: 0.04,
                ringColor: 0x8844ff,
                ringOpacity: 0.9,
                scaleRange: [0.55, 2.9],
                verticalOffset: 0.32,
                pulse: { base: 0.95, amp: 0.15, freq: 6 },
                opacityRange: [0.6, 0.95],
                emissiveRange: [1.2, 2.8],
                ringRadiusRange: [0.36, 1.19],
                ringOpacityRange: [0.78, 1.0]
            },
            // ── V/A: Recoil Shot ──
            abilityA: {
                dashDuration: 0.22,
                dashSpeed: 28,
                arrowScale: 1.5, arrowSpeed: 35, arrowLifetime: 0.6,
                startOffset: 0.3,
                launchSparks: 18, launchSmoke: 8
            },
            // ── E: Judgment Arrow ──
            abilityE: {
                startOffset: 0.6,
                scaleBase: 1.4, scalePerCharge: 0.15,
                colorDefault: 0x8844ff, colorHighCharge: 0xaa66ff, highChargeThreshold: 6,
                extraGlow: { threshold: 4, radiusScale: 0.18, segments: 8, color: 0xcc88ff, opacityBase: 0.15, opacityPerCharge: 0.025 },
                speed: 30, maxLifetime: 2.2,
                releaseBurst: 0.15,
                aoeRadius: 3.5,
                launchSparksBase: 18, launchSparksPerCharge: 3,
                violetBurst: 8
            },
            // ── X: Multi Shot ──
            abilityX: {
                spread: 0.06,
                startOffset: 0.4,
                arrowScale: 0.85, arrowSpeed: 32, arrowLifetime: 1.5,
                sparksPerArrow: 2,
                interval: 0.08
            },
            // ── C: Hunter's Mark Zone ──
            abilityC: {
                disc: { segments: 48, color: 0x6622ff, opacity: 0.18 },
                ring: { width: 0.1, segments: 48, color: 0xbb88ff, opacity: 0.65 },
                marker: { outerRadius: 0.12, segments: 24, color: 0xccaaff, opacity: 0.6 },
                groundY: { disc: 0.03, ring: 0.04, marker: 0.05 },
                spawnSparks: 25,
                pulse: {
                    disc: { base: 0.14, amp: 0.08, freq: 3 },
                    ring: { base: 0.5, amp: 0.2, freq: 4 },
                    marker: { scaleBase: 0.8, scaleAmp: 0.4, freq: 2.5 },
                    innerRing: { base: 0.5, amp: 0.2, freq: 5 }
                },
                rimParticleChance: 0.25,
                rimHeight: 0.15
            },
            // ── F: Skyfall Arrow ──
            abilityF: {
                arrowScale: 4.5, arrowColor: 0x7733ff,
                glowLayers: [
                    { radiusBase: 0.25, radiusStep: 0.12, segments: 8, color: 0x8844ff, opacity: 0.20, zOffset: -0.9 },
                    { color: 0xaa88ff, opacity: 0.15 },
                    { color: 0xccaaff, opacity: 0.10 }
                ],
                wings: { width: 0.5, height: 1.0, color: 0x8844ff, opacity: 0.15, xOffset: 0.3, zOffset: 0.3, tilt: 0.3 },
                speed: 42, maxLifetime: 3.0,
                releaseBurst: 0.2,
                launchSparks: 35, launchIceBurst: 18
            }
        },

        theme: {
            primary: 0x2a1a5a,    // deep violet
            secondary: 0x8844ff,  // bright violet
            accent: 0xccaaff,     // lavender
            particleColor: 0x8844ff,
            uiClass: 'kit-bow-ranger'
        },

        model: 'character_3k_rogue',
        animationKey: 'character_3k_rogue_dagger'
    },


    // ─── CHANGEFORM 1: WEREWOLF ──────────────────────────────────
    werewolf: {
        id: 'werewolf',
        name: 'Werewolf',
        className: CLASS_CHANGEFORM,
        description: 'Savage predator. Blindingly fast with razor claws, feral lunges, and a blood-curdling howl.',
        icon: '\u{1F43A}',

        stats: {
            health: 110,
            stamina: 110,
            walkSpeed: 4.5,
            runSpeed: 10,
            jumpForce: 9,
            armor: 8,
            critChance: 0.25,
            critMultiplier: 1.8,
            backstabMultiplier: 1.6
        },

        weapon: {
            name: 'Feral Claws',
            damage: 22,
            staminaCost: 4,
            attackSpeed: 1.4,
            range: 2.5
        },

        combat: {
            // LMB: spectral claw slash projectile
            basicAttack: {
                type: 'projectile',
                damage: 18,
                speed: 22,
                radius: 0.3,
                lifetime: 0.9,
                staminaCost: 4
            },
            // RMB: charged lunge claw
            chargedAttack: {
                type: 'projectile_charged',
                damage: 50,
                speed: 28,
                radius: 0.7,
                lifetime: 1.4,
                chargeDuration: 0.8
            },
            // Q: Savage Pounce – leap AoE ground slam
            abilityQ: {
                name: 'Savage Pounce',
                type: 'ground_aoe',
                damage: 45,
                radius: 3.5,
                cooldown: 7,
                bloodChargeGain: 2
            },
            // E: Rend – claw finisher that tears flesh
            abilityE: {
                name: 'Rend',
                type: 'melee_finisher',
                baseDamage: 55,
                range: 3.0,
                requiresBloodCharges: true
            },
            // X: Blood Howl – AoE fear nova
            abilityX: {
                name: 'Blood Howl',
                type: 'nova_aoe',
                damage: 30,
                radius: 9,
                cooldown: 12,
                freezeDuration: 2.5
            },
            // C: Feral Instinct – dodge/evasion shield
            abilityC: {
                name: 'Feral Instinct',
                type: 'shield',
                duration: 5
            },
            // F: Bloodmoon Frenzy – ultimate
            abilityF: {
                name: 'Bloodmoon Frenzy',
                type: 'ultimate_projectile',
                damage: 180,
                chargeNeeded: 100
            }
        },

        vfx: {
            // ── LMB / RMB: Spectral Claw projectile ──
            projectile: {
                materialType: 'bloodfire',
                basic: {
                    segments: 8,
                    coreRatio: 0.6,
                    outer: { coreBrightness: 0.7, plasmaSpeed: 5.0, isCharged: 0.0, layerScale: 0.9, rimPower: 2.2, redTint: 0.45, alpha: 0.4 },
                    core:  { coreBrightness: 1.8, plasmaSpeed: 7.0, isCharged: 0.0, layerScale: 1.4, rimPower: 2.0, redTint: 0.35 },
                    launchSparks: 6, launchEmbers: 2,
                    hitSparks: 5, hitEmbers: 3,
                    expireSmoke: 1
                },
                charged: {
                    segments: 14,
                    coreRatio: 0.55,
                    outer: { coreBrightness: 1.2, plasmaSpeed: 4.5, isCharged: 1.0, layerScale: 0.8, rimPower: 2.4, redTint: 0.5, alpha: 0.55 },
                    core:  { coreBrightness: 2.5, plasmaSpeed: 8.0, isCharged: 1.0, layerScale: 1.8, rimPower: 2.2, redTint: 0.4 },
                    releaseBurst: 0.12,
                    burstScale: 0.6, burstDur: 0.12,
                    launchSparks: 12, launchEmbers: 5,
                    hitSparks: 10, hitEmbers: 6,
                    expireSmoke: 2
                },
                fadeAlpha: 0.88,
                outerAlphaRatio: 0.45,
                hitRadiusPadding: { basic: 0.25, charged: 0.55 }
            },
            // ── Charge orb: swirling silver-grey feral energy ──
            chargeOrb: {
                sphereRadius: 0.18,
                sphereSegments: 28,
                materialType: 'bloodfire',
                material: { coreBrightness: 1.1, plasmaSpeed: 6.0, isCharged: 1.0, layerScale: 1.4, rimPower: 2.4, redTint: 0.35 },
                ringCount: 28,
                ringSize: 0.035,
                ringColor: 0x778899,
                ringOpacity: 0.85,
                scaleRange: [0.25, 1.6],
                forwardOffset: 0.35,
                pulse: { base: 1.0, amp: 0.2, freq: 8 },
                alphaRange: [0.7, 1.0],
                brightnessRange: [1.0, 1.8],
                ringRadiusRange: [0.05, 0.5],
                ringOpacityRange: [0.4, 0.95]
            },
            // ── Q: Savage Pounce – ground-slam claw mark ──
            abilityQ: {
                previewRing: { inset: 0.3, segments: 48, color: 0x556677, opacity: 0.55, groundY: 0.02 },
                disc: {
                    segments: 48,
                    material: { coreBrightness: 2.0, plasmaSpeed: 14, isCharged: 1.0, layerScale: 2.8, rimPower: 3.2, alpha: 0.85, redTint: 0.3 },
                    groundY: 0.02
                },
                expandDuration: 0.18,
                fadeCurve: { peakAlpha: 0.85, holdTime: 0.12 },
                duration: 1.1
            },
            // ── E: Rend – feral claw whip slash ──
            abilityE: {
                whipDuration: 0.35,
                whipTrailCount: 22,
                whipOrbTrailCount: 12,
                whipHitSparks: 42,
                whipHitEmbers: 30,
                crescend: {
                    bladeLenBase: 2.0, bladeLenPerCharge: 0.6,
                    bladeWidthBase: 0.65, bladeWidthPerCharge: 0.18, bladeWidthScale: [0.95, 0.5],
                    outerSegments: 38, innerSegments: 30, coreSegments: 24,
                    innerScale: [0.88, 0.72], coreScale: [0.7, 0.48],
                    outer: { coreBrightnessBase: 1.4, coreBrightnessPerCharge: 0.2, plasmaSpeedBase: 9.0, layerScale: 1.5, rimPower: 1.8, alphaBase: 0.92, redTint: 0.4 },
                    innerColor: 0x99aabb, innerOpacity: 0.55,
                    coreColor: 0xddeeff, coreOpacity: 0.35,
                    speedBase: 30, speedPerCharge: 1.8,
                    lifetimeBase: 1.0, lifetimePerCharge: 0.06,
                    hitRadiusBase: 1.8, hitRadiusPerCharge: 0.4,
                    pulse: { base: 0.25, freq: 28, scaleFreq: 18 },
                    launchSparksBase: 16, launchSparksPerCharge: 4,
                    launchEmbersBase: 8, launchEmbersPerCharge: 2,
                    launchTrailBase: 12, launchTrailPerCharge: 3
                }
            },
            // ── X: Blood Howl – fear nova ripple ──
            abilityX: {
                previewRing: { radiusScale: 0.9, innerInset: 0.2, outerInset: 0.16, segments: 64, color: 0x8899aa, groundY: 0.03 },
                windupDuration: 0.15,
                windupScale: { start: 0.1, end: 1.2 },
                windupOpacity: { start: 0.25, end: 0.85 },
                windupSparks: 20, windupEmbers: 8,
                releaseSparks: 50, releaseEmbers: 30
            },
            // ── Life drain: spectral silver tendrils ──
            lifeDrain: {
                beamPoints: 120,
                maxSegmentLength: 0.1,
                core:   { radiusTop: 0.006, radiusBot: 0.012, segments: 8, coreBrightness: 1.6, plasmaSpeed: 12, isCharged: 0.5, layerScale: 1.5, rimPower: 2.4, redTint: 0.3, alpha: 0.85 },
                outer:  { radiusTop: 0.017, radiusBot: 0.025, segments: 8, coreBrightness: 0.8, plasmaSpeed: 7,  isCharged: 0.4, layerScale: 1.0, rimPower: 1.8, redTint: 0.3, alpha: 0.45 },
                strand: { radiusTop: 0.002, radiusBot: 0.004, segments: 6, coreBrightness: 1.3, plasmaSpeed: 14, isCharged: 0.6, layerScale: 1.8, rimPower: 2.6, redTint: 0.35, alpha: 0.88 },
                light: { color: 0x8899bb, distance: 12, decay: 2.2, intensityBase: 20, intensityPulse: 6, pulseFreq: 20 },
                waver: { seedMult: 22, ampBase: 0.3, ampPerDist: 0.032 },
                pulse: { base: 0.85, amp: 0.1, freq: 16 },
                flowInterval: 0.06, flowCount: 12,
                damageFlowCount: 20, burstInterval: 0.12,
                castFlowCount: 45
            },
            // ── F: Bloodmoon Frenzy – ultimate orb ──
            abilityF: {
                orbRadius: 0.48,
                orbSegments: 18,
                light: { color: 0x7788aa, distance: 28, decay: 2.2, intensityBase: 42, intensityPulse: 12, pulseFreq: 12 },
                outerGlow: { color: 0x445566, distance: 18, decay: 1.0, intensityBase: 16, intensityPulse: 5, pulseFreq: 10 },
                speed: 38,
                scaleStart: 0.25, scaleEnd: 5.0, growthDuration: 0.7,
                maxLifetime: 2.2,
                baseDamage: 180,
                launchAlpha: 0.9,
                pulse: { amp: 0.1, freq: 16 },
                launchSparks: 18, launchEmbers: 8,
                trailOrbs: 16, trailSlash: 8
            }
        },

        theme: {
            primary: 0x445566,    // steel grey
            secondary: 0x8899aa,  // moon silver
            accent: 0xccddee,     // pale moonlight
            particleColor: 0x778899,
            uiClass: 'kit-werewolf'
        },

        model: 'wolf',
        animationKey: 'wolf'
    },

    // ─── CHANGEFORM 2: BEAR ──────────────────────────────────────
    bear: {
        id: 'bear',
        name: 'Bear',
        className: CLASS_CHANGEFORM,
        description: 'Unstoppable force of nature. Massive paw strikes, earthquakes, and primal resilience.',
        icon: '\u{1F43B}',

        stats: {
            health: 150,
            stamina: 80,
            walkSpeed: 3.2,
            runSpeed: 7.0,
            jumpForce: 6.5,
            armor: 18,
            critChance: 0.15,
            critMultiplier: 1.5,
            backstabMultiplier: 1.3
        },

        weapon: {
            name: 'Bear Paws',
            damage: 38,
            staminaCost: 8,
            attackSpeed: 0.7,
            range: 3.2
        },

        combat: {
            // LMB: hurled earth/rock projectile
            basicAttack: {
                type: 'projectile',
                damage: 30,
                speed: 14,
                radius: 0.4,
                lifetime: 1.3,
                staminaCost: 8
            },
            // RMB: charged boulder
            chargedAttack: {
                type: 'projectile_charged',
                damage: 75,
                speed: 12,
                radius: 1.0,
                lifetime: 2.0,
                chargeDuration: 1.4
            },
            // Q: Earthquake – massive ground pound
            abilityQ: {
                name: 'Earthquake',
                type: 'ground_aoe',
                damage: 65,
                radius: 4.5,
                cooldown: 11,
                bloodChargeGain: 2
            },
            // E: Maul – devastating swipe finisher
            abilityE: {
                name: 'Maul',
                type: 'melee_finisher',
                baseDamage: 65,
                range: 3.5,
                requiresBloodCharges: true
            },
            // X: Thunderous Roar – AoE stun nova
            abilityX: {
                name: 'Thunderous Roar',
                type: 'nova_aoe',
                damage: 40,
                radius: 12,
                cooldown: 15,
                freezeDuration: 2.8
            },
            // C: Thick Hide – damage absorption shield
            abilityC: {
                name: 'Thick Hide',
                type: 'shield',
                duration: 9
            },
            // F: Primal Fury – ultimate
            abilityF: {
                name: 'Primal Fury',
                type: 'ultimate_projectile',
                damage: 200,
                chargeNeeded: 100
            }
        },

        vfx: {
            // ── LMB / RMB: Earth boulder projectile ──
            projectile: {
                materialType: 'bloodfire',
                basic: {
                    segments: 10,
                    coreRatio: 0.5,
                    outer: { coreBrightness: 0.6, plasmaSpeed: 3.0, isCharged: 0.0, layerScale: 0.75, rimPower: 1.6, redTint: 0.7, alpha: 0.5 },
                    core:  { coreBrightness: 1.5, plasmaSpeed: 4.5, isCharged: 0.0, layerScale: 1.2, rimPower: 1.6, redTint: 0.65 },
                    launchSparks: 4, launchEmbers: 4,
                    hitSparks: 5, hitEmbers: 4,
                    expireSmoke: 2
                },
                charged: {
                    segments: 14,
                    coreRatio: 0.5,
                    outer: { coreBrightness: 0.8, plasmaSpeed: 2.8, isCharged: 1.0, layerScale: 0.65, rimPower: 1.8, redTint: 0.75, alpha: 0.55 },
                    core:  { coreBrightness: 1.8, plasmaSpeed: 5.5, isCharged: 1.0, layerScale: 1.5, rimPower: 1.8, redTint: 0.7 },
                    releaseBurst: 0.18,
                    burstScale: 0.55, burstDur: 0.18,
                    launchSparks: 8, launchEmbers: 8,
                    hitSparks: 10, hitEmbers: 8,
                    expireSmoke: 4
                },
                fadeAlpha: 0.9,
                outerAlphaRatio: 0.5,
                hitRadiusPadding: { basic: 0.35, charged: 0.7 }
            },
            // ── Charge orb: amber/brown earth energy ──
            chargeOrb: {
                sphereRadius: 0.26,
                sphereSegments: 24,
                materialType: 'bloodfire',
                material: { coreBrightness: 0.8, plasmaSpeed: 3.5, isCharged: 1.0, layerScale: 1.0, rimPower: 1.8, redTint: 0.72 },
                ringCount: 32,
                ringSize: 0.05,
                ringColor: 0x8B6914,
                ringOpacity: 0.85,
                scaleRange: [0.2, 2.0],
                forwardOffset: 0.45,
                pulse: { base: 0.9, amp: 0.12, freq: 5 },
                alphaRange: [0.7, 1.0],
                brightnessRange: [0.8, 1.3],
                ringRadiusRange: [0.07, 0.65],
                ringOpacityRange: [0.45, 0.9]
            },
            // ── Q: Earthquake – earth-shattering ground slam ──
            abilityQ: {
                previewRing: { inset: 0.4, segments: 48, color: 0x6B4226, opacity: 0.5, groundY: 0.02 },
                disc: {
                    segments: 48,
                    material: { coreBrightness: 1.8, plasmaSpeed: 10, isCharged: 1.0, layerScale: 2.2, rimPower: 2.8, alpha: 0.92, redTint: 0.68 },
                    groundY: 0.02
                },
                expandDuration: 0.28,
                fadeCurve: { peakAlpha: 0.92, holdTime: 0.2 },
                duration: 1.6
            },
            // ── E: Maul – massive paw swipe crescend ──
            abilityE: {
                whipDuration: 0.55,
                whipTrailCount: 16,
                whipOrbTrailCount: 8,
                whipHitSparks: 32,
                whipHitEmbers: 24,
                crescend: {
                    bladeLenBase: 2.5, bladeLenPerCharge: 0.45,
                    bladeWidthBase: 0.85, bladeWidthPerCharge: 0.2, bladeWidthScale: [0.9, 0.5],
                    outerSegments: 36, innerSegments: 28, coreSegments: 22,
                    innerScale: [0.84, 0.7], coreScale: [0.65, 0.45],
                    outer: { coreBrightnessBase: 1.3, coreBrightnessPerCharge: 0.15, plasmaSpeedBase: 6.0, layerScale: 1.2, rimPower: 1.4, alphaBase: 0.94, redTint: 0.7 },
                    innerColor: 0xBB8833, innerOpacity: 0.5,
                    coreColor: 0xFFCC66, coreOpacity: 0.3,
                    speedBase: 22, speedPerCharge: 1.2,
                    lifetimeBase: 1.3, lifetimePerCharge: 0.08,
                    hitRadiusBase: 2.3, hitRadiusPerCharge: 0.38,
                    pulse: { base: 0.2, freq: 20, scaleFreq: 14 },
                    launchSparksBase: 12, launchSparksPerCharge: 3,
                    launchEmbersBase: 12, launchEmbersPerCharge: 3,
                    launchTrailBase: 8, launchTrailPerCharge: 2
                }
            },
            // ── X: Thunderous Roar – seismic nova ──
            abilityX: {
                previewRing: { radiusScale: 0.85, innerInset: 0.25, outerInset: 0.2, segments: 64, color: 0x8B5A2B, groundY: 0.03 },
                windupDuration: 0.2,
                windupScale: { start: 0.12, end: 1.25 },
                windupOpacity: { start: 0.2, end: 0.8 },
                windupSparks: 14, windupEmbers: 14,
                releaseSparks: 40, releaseEmbers: 40
            },
            // ── Life drain: amber-brown nature tendrils ──
            lifeDrain: {
                beamPoints: 100,
                maxSegmentLength: 0.13,
                core:   { radiusTop: 0.008, radiusBot: 0.015, segments: 8, coreBrightness: 1.3, plasmaSpeed: 8,  isCharged: 0.4, layerScale: 1.2, rimPower: 2.0, redTint: 0.7, alpha: 0.9 },
                outer:  { radiusTop: 0.022, radiusBot: 0.032, segments: 8, coreBrightness: 0.7, plasmaSpeed: 5,  isCharged: 0.3, layerScale: 0.8, rimPower: 1.4, redTint: 0.7, alpha: 0.5 },
                strand: { radiusTop: 0.003, radiusBot: 0.005, segments: 6, coreBrightness: 1.2, plasmaSpeed: 10, isCharged: 0.5, layerScale: 1.4, rimPower: 2.2, redTint: 0.65, alpha: 0.88 },
                light: { color: 0xBB8833, distance: 12, decay: 2.0, intensityBase: 18, intensityPulse: 6, pulseFreq: 14 },
                waver: { seedMult: 14, ampBase: 0.2, ampPerDist: 0.024 },
                pulse: { base: 0.9, amp: 0.06, freq: 12 },
                flowInterval: 0.1, flowCount: 8,
                damageFlowCount: 14, burstInterval: 0.18,
                castFlowCount: 35
            },
            // ── F: Primal Fury – ultimate orb ──
            abilityF: {
                orbRadius: 0.58,
                orbSegments: 14,
                light: { color: 0xCC8822, distance: 30, decay: 2.0, intensityBase: 35, intensityPulse: 8, pulseFreq: 8 },
                outerGlow: { color: 0x6B4226, distance: 20, decay: 1.0, intensityBase: 12, intensityPulse: 4, pulseFreq: 6 },
                speed: 28,
                scaleStart: 0.3, scaleEnd: 5.5, growthDuration: 0.9,
                maxLifetime: 2.6,
                baseDamage: 200,
                launchAlpha: 0.94,
                pulse: { amp: 0.06, freq: 10 },
                launchSparks: 12, launchEmbers: 14,
                trailOrbs: 12, trailSlash: 5
            }
        },

        theme: {
            primary: 0x6B4226,    // dark brown
            secondary: 0xBB8833,  // amber
            accent: 0xFFCC44,     // golden honey
            particleColor: 0xCC8822,
            uiClass: 'kit-bear'
        },

        model: 'bear',
        animationKey: 'bear'
    }
};

/** Get all kits for a given class */
export function getKitsByClass(className) {
    return Object.values(KIT_DEFINITIONS).filter(k => k.className === className);
}

/** Get a kit by id */
export function getKit(kitId) {
    return KIT_DEFINITIONS[kitId] || null;
}

/** Get all available classes with their display info */
export const CLASS_INFO = {
    [CLASS_MAGE]: {
        name: 'Mage',
        description: 'Masters of arcane arts. Powerful ranged attacks and devastating spells.',
        icon: '\u{1F9D9}'
    },
    [CLASS_ROGUE]: {
        name: 'Rogue',
        description: 'Swift and deadly. Fast attacks, high mobility, and lethal precision.',
        icon: '\u{1F977}'
    },
    [CLASS_CHANGEFORM]: {
        name: 'Changeform',
        description: 'Primal shapeshifters. Channel beast spirits for savage melee and untamed fury.',
        icon: '\u{1F43E}'
    }
};
