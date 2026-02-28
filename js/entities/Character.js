/**
 * Character Controller - Player character with movement and animations
 * Uses real GLTF model with skeletal animations
 */

import * as THREE from 'three';
import { createDashVFX } from '../effects/DashVFX.js';
import { createBloodFireMaterial, updateBloodFireMaterial } from '../shaders/BloodFireShader.js';
import { createIceMaterial, updateIceMaterial } from '../shaders/IceShader.js';

export class Character {
    constructor(scene, camera, assetLoader, gameState, particleSystem = null) {
        this.scene = scene;
        this.camera = camera;
        this.assetLoader = assetLoader;
        this.gameState = gameState;
        this.particleSystem = particleSystem;

        // Read kit stats for movement
        const kit = gameState.selectedKit;
        const stats = kit?.stats;

        // Character properties
        this.position = new THREE.Vector3(0, 0, 5);
        this.rotation = new THREE.Euler(0, 0, 0);
        this.velocity = new THREE.Vector3();

        // Movement settings (driven by kit)
        this.walkSpeed = stats?.walkSpeed ?? 4;
        this.runSpeed = stats?.runSpeed ?? 8;
        this.jumpForce = stats?.jumpForce ?? 8;
        this.gravity = -25;

        // Third-person camera settings (further back for better view)
        this.cameraDistance = 5;        // Distance behind character
        this.cameraHeight = 1.2;        // Height above character
        this.cameraLookAtHeight = 1.75; // Look-at height so character sits at ~25% from bottom of viewport (0=bottom, 100=top of screen)
        this.cameraPitch = 0.3;         // Initial pitch (looking slightly down)
        this.cameraYaw = 0;
        this.pitchLimit = Math.PI / 3;  // Limit vertical rotation
        this.cameraSmoothSpeed = 18;    // Snappier camera follow for responsive feel
        this._cameraBobTime = 0;

        // State
        this.isGrounded = true;

        // Dash (R key) - smooth, snappy feel
        this.isDashing = false;
        this.dashTimer = 0;
        this.dashDuration = 0.28;
        this.dashDistance = 6.8;
        this.dashStartPos = new THREE.Vector3();
        this.dashDirection = new THREE.Vector3();
        this.dashCooldown = 0;
        this.superDashCooldown = 0;
        this.superDashCooldownDuration = 20;
        this.superDashDamage = 80;
        this.isSuperDashing = false;
        this.superDashHitSet = new Set();
        this.postDashTilt = 0;  // Smooth mesh tilt back to 0 after dash
        this.dashVfx = null;

        // Animation system
        this.mixer = null;
        this.actions = {};
        this.currentAction = null;
        this.currentAnimation = 'Idle';
        this.animationTime = 0;
        this.useProceduralAnimation = false;

        // Dissociation: two-layer system (Souls-like)
        this.useDissociation = true;
        this.locoOnly = false;       // Set true by setupAnimations for loco-only models (RogueV3)
        this.locoAction = null;      // Locomotion layer (legs, hips) - always active
        this.upperAction = null;     // Upper body layer (arms, torso, head) - plays on top

        // Procedural combat pose (locoOnly rigs): additive bone rotations during attacks
        this._combatBones = null;    // { spine, spine01, rArm, rForeArm, lArm, lForeArm }
        this._combatPoseBlend = 0;   // 0 = loco only, 1 = full attack pose
        this._combatPoseTarget = 0;  // target blend value
        this._combatPoseType = 'none'; // 'basic', 'charged', 'charging', 'ability', 'none'
        this._combatSwingT = 0;      // swing progress within an attack (0→1)
        this._combatSwingDir = 1;    // alternating slash direction (+1/-1)
        this._poseQ = new THREE.Quaternion();
        this._poseE = new THREE.Euler();
        this._isBeastModel = false;  // true for wolf/bear quadruped rigs
        this._landSquashT = 0;       // landing squash timer (1→0)
        this.currentUpperState = 'none'; // Track to avoid resetting every frame
        this.chargedAttackAnimStarted = false; // Only start charged anim once per charge, never replay
        this.isPlayingUltimate = false;
        this.ultimateAnimTimer = 0;

        // Create character mesh
        this.createCharacterMesh();

        // Create weapon
        this.createWeapon();

        // Blood Essence indicator: 3D orbs next to character, follow character, always face camera (fixed perspective)
        this.createBloodChargeIndicator();

        // Poison charge indicator (shadow assassin): green orbs orbiting the character
        this._isDaggerKit = this.gameState.selectedKit?.id === 'shadow_assassin';
        if (this._isDaggerKit) {
            this.createPoisonChargeIndicator();
        }

        // Trust charge indicator (bow ranger): blue orbs orbiting the character
        this._isBowRangerKit = this.gameState.selectedKit?.id === 'bow_ranger';
        if (this._isBowRangerKit) {
            this.createTrustChargeIndicator();
        }
    }

    /** 3D charge orbs on a circle (axis) around the character. Frost mage uses ice orbs. */
    createBloodChargeIndicator() {
        this.bloodChargeIndicator = new THREE.Group();
        this.bloodChargeIndicator.name = 'bloodChargeIndicator';
        const isFrost = this.gameState.selectedKit?.id === 'frost_mage';
        this._isFrostChargeIndicator = isFrost;
        const innerRadius = 0.052;
        const outerRadius = 0.075;
        const circleRadius = 1.35;
        const arcSpan = (120 * Math.PI) / 180;
        const startAngle = -arcSpan / 2;
        const innerGeom = new THREE.SphereGeometry(innerRadius, 6, 6);
        const outerGeom = new THREE.SphereGeometry(outerRadius, 6, 6);
        const sharedInnerMat = isFrost
            ? createIceMaterial({
                coreBrightness: 1.2,
                iceSpeed: 4.0,
                isCharged: 0.6,
                layerScale: 1.1,
                rimPower: 2.0,
                alpha: 0.95
            })
            : createBloodFireMaterial({
                coreBrightness: 1.0,
                plasmaSpeed: 3.2,
                isCharged: 0.6,
                layerScale: 1.1,
                rimPower: 2.0,
                alpha: 0.98,
                redTint: 0.92
            });
        const sharedOuterMat = new THREE.MeshBasicMaterial({
            color: isFrost ? 0x0a2a5a : 0x2a0808,
            transparent: true,
            opacity: 0.78,
            depthWrite: false
        });
        const maxBloodStacks = 8;
        for (let i = 0; i < maxBloodStacks; i++) {
            const angle = startAngle + (i / (maxBloodStacks - 1)) * arcSpan;
            const orbGroup = new THREE.Group();
            orbGroup.position.set(circleRadius * Math.cos(angle), 0, circleRadius * Math.sin(angle));
            const inner = new THREE.Mesh(innerGeom, sharedInnerMat);
            inner.userData.bloodMat = sharedInnerMat;
            inner.userData.isFrost = isFrost;
            orbGroup.add(inner);
            const outer = new THREE.Mesh(outerGeom, sharedOuterMat);
            outer.renderOrder = -1;
            orbGroup.add(outer);
            orbGroup.userData.inner = inner;
            orbGroup.userData.outer = outer;
            orbGroup.userData.lastParticleEmit = 0;
            this.bloodChargeIndicator.add(orbGroup);
        }
        this._bloodOrbWorldPos = new THREE.Vector3();
        this._camTarget = new THREE.Vector3();
        this._lookAt = new THREE.Vector3();
        this._moveVec = new THREE.Vector3();
        this._fwd = new THREE.Vector3();
        this._right = new THREE.Vector3();
        this._yAxis = new THREE.Vector3(0, 1, 0);
        this.bloodChargeIndicator.visible = false;
        this.scene.add(this.bloodChargeIndicator);
    }

    updateBloodChargeIndicator() {
        if (!this.bloodChargeIndicator) return;
        const n = this.gameState.bloodCharges;
        this.bloodChargeIndicator.visible = n >= 1;
        if (n < 1) return;
        const height = 1.15;
        this.bloodChargeIndicator.position.set(this.position.x, this.position.y + height, this.position.z);
        this.bloodChargeIndicator.rotation.set(0, this.cameraYaw, 0);
        const t = this.animationTime;
        const pulse = 1 + 0.07 * Math.sin(t * 4.5);
        const circleRadius = 1.35;
        const arcSpan = (120 * Math.PI) / 180;
        const startAngle = -arcSpan / 2;
        this.bloodChargeIndicator.children.forEach((orbGroup, i) => {
            const visible = i < n;
            orbGroup.visible = visible;
            const angle = startAngle + (i / Math.max(1, this.bloodChargeIndicator.children.length - 1)) * arcSpan;
            orbGroup.position.set(circleRadius * Math.cos(angle), 0.008 * Math.sin(t * 2.8 + i * 1.2), circleRadius * Math.sin(angle));
            if (visible) {
                orbGroup.scale.setScalar(pulse);
                const inner = orbGroup.userData.inner;
                if (inner?.userData?.bloodMat?.uniforms) {
                    if (inner.userData.isFrost) {
                        updateIceMaterial(inner.userData.bloodMat, t * 5, 0.9 + 0.08 * Math.sin(t * 2.7));
                    } else {
                        updateBloodFireMaterial(inner.userData.bloodMat, t * 5, 0.94 + 0.05 * Math.sin(t * 2.7));
                    }
                }
                if (this.particleSystem && t - (orbGroup.userData.lastParticleEmit ?? 0) > 0.18) {
                    orbGroup.getWorldPosition(this._bloodOrbWorldPos);
                    if (this._isFrostChargeIndicator) {
                        this.particleSystem.emitIceTrail(this._bloodOrbWorldPos, 1);
                    } else {
                        this.particleSystem.emitEmbers(this._bloodOrbWorldPos, 1);
                    }
                    orbGroup.userData.lastParticleEmit = t;
                }
            }
        });
    }

    /** Poison charge orbs orbiting the character (shadow assassin), like blood mage orbs but green. */
    createPoisonChargeIndicator() {
        this.poisonChargeIndicator = new THREE.Group();
        this.poisonChargeIndicator.name = 'poisonChargeIndicator';
        const maxPoisonStacks = 6;
        const innerRadius = 0.06;
        const outerRadius = 0.085;

        const innerGeom = new THREE.SphereGeometry(innerRadius, 8, 8);
        const outerGeom = new THREE.SphereGeometry(outerRadius, 8, 8);
        const sharedInnerMat = new THREE.MeshBasicMaterial({
            color: 0x4dff66,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const sharedOuterMat = new THREE.MeshBasicMaterial({
            color: 0x0b2a12,
            transparent: true,
            opacity: 0.7,
            depthWrite: false
        });

        for (let i = 0; i < maxPoisonStacks; i++) {
            const orbGroup = new THREE.Group();
            const inner = new THREE.Mesh(innerGeom, sharedInnerMat.clone());
            orbGroup.add(inner);
            const outer = new THREE.Mesh(outerGeom, sharedOuterMat.clone());
            outer.renderOrder = -1;
            orbGroup.add(outer);
            orbGroup.userData.inner = inner;
            orbGroup.userData.outer = outer;
            orbGroup.userData.lastParticleEmit = 0;
            orbGroup.userData.orbitPhase = (i / maxPoisonStacks) * Math.PI * 2;
            this.poisonChargeIndicator.add(orbGroup);
        }
        this._poisonOrbWorldPos = new THREE.Vector3();
        this.poisonChargeIndicator.visible = false;
        this.scene.add(this.poisonChargeIndicator);
    }

    updatePoisonChargeIndicator() {
        if (!this.poisonChargeIndicator) return;
        const n = this.gameState.poisonCharges ?? 0;
        this.poisonChargeIndicator.visible = n >= 1;
        if (n < 1) return;

        const height = 1.05;
        this.poisonChargeIndicator.position.set(this.position.x, this.position.y + height, this.position.z);
        const t = this.animationTime;
        const orbitRadius = 1.2;
        const orbitSpeed = 1.8;
        const bobAmplitude = 0.12;
        const pulse = 1 + 0.1 * Math.sin(t * 5.5);

        this.poisonChargeIndicator.children.forEach((orbGroup, i) => {
            const visible = i < n;
            orbGroup.visible = visible;
            if (!visible) return;

            const baseAngle = orbGroup.userData.orbitPhase;
            const angle = baseAngle + t * orbitSpeed;
            const bob = bobAmplitude * Math.sin(t * 3.2 + i * 1.5);
            orbGroup.position.set(
                orbitRadius * Math.cos(angle),
                bob,
                orbitRadius * Math.sin(angle)
            );
            orbGroup.scale.setScalar(pulse);

            // Pulsing glow
            const inner = orbGroup.userData.inner;
            const glowIntensity = 0.7 + 0.3 * Math.sin(t * 4 + i * 0.8);
            inner.material.opacity = glowIntensity;
            // Color shift: brighter with more stacks
            const stackRatio = n / 6;
            const r = 0.1 + 0.2 * stackRatio;
            const g = 0.8 + 0.2 * stackRatio;
            const b = 0.2 + 0.15 * Math.sin(t * 3 + i);
            inner.material.color.setRGB(r, g, b);

            // Emit poison trail particles
            if (this.particleSystem && t - (orbGroup.userData.lastParticleEmit ?? 0) > 0.12) {
                orbGroup.getWorldPosition(this._poisonOrbWorldPos);
                this.particleSystem.emitPoisonTrail(this._poisonOrbWorldPos, 1);
                orbGroup.userData.lastParticleEmit = t;
            }
        });
    }

    /** Trust charge orbs (bow ranger): violet diamond-shaped orbs orbiting the character. */
    createTrustChargeIndicator() {
        this.trustChargeIndicator = new THREE.Group();
        this.trustChargeIndicator.name = 'trustChargeIndicator';
        const maxTrustStacks = 8;
        const innerRadius = 0.055;
        const outerRadius = 0.08;

        const innerGeom = new THREE.OctahedronGeometry(innerRadius, 0);
        const outerGeom = new THREE.SphereGeometry(outerRadius, 6, 6);
        const sharedInnerMat = new THREE.MeshBasicMaterial({
            color: 0x8844ff,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const sharedOuterMat = new THREE.MeshBasicMaterial({
            color: 0x0a0a2a,
            transparent: true,
            opacity: 0.7,
            depthWrite: false
        });

        for (let i = 0; i < maxTrustStacks; i++) {
            const orbGroup = new THREE.Group();
            const inner = new THREE.Mesh(innerGeom, sharedInnerMat.clone());
            orbGroup.add(inner);
            const outer = new THREE.Mesh(outerGeom, sharedOuterMat.clone());
            outer.renderOrder = -1;
            orbGroup.add(outer);
            orbGroup.userData.inner = inner;
            orbGroup.userData.outer = outer;
            orbGroup.userData.lastParticleEmit = 0;
            orbGroup.userData.orbitPhase = (i / maxTrustStacks) * Math.PI * 2;
            this.trustChargeIndicator.add(orbGroup);
        }
        this._trustOrbWorldPos = new THREE.Vector3();
        this.trustChargeIndicator.visible = false;
        this.scene.add(this.trustChargeIndicator);
    }

    updateTrustChargeIndicator() {
        if (!this.trustChargeIndicator) return;
        const n = this.gameState.trustCharges ?? 0;
        this.trustChargeIndicator.visible = n >= 1;
        if (n < 1) return;

        const height = 1.1;
        this.trustChargeIndicator.position.set(this.position.x, this.position.y + height, this.position.z);
        const t = this.animationTime;
        const orbitRadius = 1.25;
        const orbitSpeed = 2.0;
        const bobAmplitude = 0.1;
        const pulse = 1 + 0.08 * Math.sin(t * 5);

        this.trustChargeIndicator.children.forEach((orbGroup, i) => {
            const visible = i < n;
            orbGroup.visible = visible;
            if (!visible) return;

            const baseAngle = orbGroup.userData.orbitPhase;
            const angle = baseAngle + t * orbitSpeed;
            const bob = bobAmplitude * Math.sin(t * 3.5 + i * 1.3);
            orbGroup.position.set(
                orbitRadius * Math.cos(angle),
                bob,
                orbitRadius * Math.sin(angle)
            );
            orbGroup.scale.setScalar(pulse);

            // Spin the diamond shape
            const inner = orbGroup.userData.inner;
            inner.rotation.y = t * 3 + i;
            inner.rotation.x = t * 1.5 + i * 0.5;

            // Pulsing glow - brighter with more stacks
            const glowIntensity = 0.7 + 0.3 * Math.sin(t * 4.5 + i * 0.7);
            inner.material.opacity = glowIntensity;
            const stackRatio = n / 8;
            const r = 0.45 + 0.2 * stackRatio;
            const g = 0.15 + 0.1 * stackRatio;
            const b = 0.85 + 0.15 * Math.sin(t * 3 + i);
            inner.material.color.setRGB(r, g, b);

            // Emit spark trail
            if (this.particleSystem && t - (orbGroup.userData.lastParticleEmit ?? 0) > 0.15) {
                orbGroup.getWorldPosition(this._trustOrbWorldPos);
                this.particleSystem.emitSparks(this._trustOrbWorldPos, 1);
                orbGroup.userData.lastParticleEmit = t;
            }
        });
    }

    createCharacterMesh() {
        const modelKey = this.gameState?.selectedKit?.model || 'character_3k_mage';
        const originalModel = this.assetLoader.getModel(modelKey) || this.assetLoader.getModel('character_3k_mage');

        if (originalModel) {
            // Use the original model directly (don't clone for skeletal animation)
            this.mesh = originalModel;
            this.mesh.position.copy(this.position);

            // Scale models to match each other
            if (modelKey === 'character_3k_mage') {
                this.mesh.scale.setScalar(7.5);
            } else if (modelKey === 'character_3k_rogue') {
                this.mesh.scale.setScalar(0.7);
            } else if (modelKey === 'wolf') {
                this.mesh.scale.setScalar(0.7);
            } else if (modelKey === 'bear') {
                this.mesh.scale.setScalar(0.7);
            }

            // Enable shadows
            this.mesh.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Borderlands-style thick black outline (inverted hull), clearly visible.
            this.addToonOutline(this.mesh, 1.035);

            this.scene.add(this.mesh);

            // Setup animation system
            this.setupAnimations();

            console.log('Character mesh created successfully');
        } else {
            console.warn('No character model available, creating fallback');
            // Create a simple fallback mesh so player can still move
            this.createFallbackMesh();
        }
    }

    createFallbackMesh() {
        // Simple capsule-like character
        const group = new THREE.Group();

        // Body
        const bodyGeom = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2e2e38, metalness: 0.5 });
        const body = new THREE.Mesh(bodyGeom, bodyMat);
        body.position.y = 0.9;
        body.castShadow = true;
        group.add(body);

        // Head
        const headGeom = new THREE.SphereGeometry(0.25, 16, 16);
        const head = new THREE.Mesh(headGeom, bodyMat);
        head.position.y = 1.7;
        head.castShadow = true;
        group.add(head);

        this.mesh = group;
        this.mesh.position.copy(this.position);
        this.addToonOutline(this.mesh, 1.04);
        this.scene.add(this.mesh);

        // Use procedural animation for fallback
        this.useProceduralAnimation = true;
        console.log('Fallback character mesh created');
    }

    addToonOutline(root, thickness = 1.035) {
        if (!root) return;
        const outlineMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            side: THREE.BackSide,
            transparent: false,
            opacity: 1.0,
            depthWrite: true,
            depthTest: true,
            toneMapped: false,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
        });

        root.traverse((child) => {
            if (!child.isMesh || !child.geometry) return;
            if (child.userData?.isOutline) return;

            let outline = null;
            if (child.isSkinnedMesh && child.skeleton) {
                outline = new THREE.SkinnedMesh(child.geometry, outlineMat);
                outline.bind(child.skeleton, child.bindMatrix);
                outline.bindMode = child.bindMode;
            } else {
                outline = new THREE.Mesh(child.geometry, outlineMat);
            }

            outline.name = `${child.name || 'mesh'}_outline`;
            outline.userData.isOutline = true;
            outline.renderOrder = (child.renderOrder || 0) - 0.2;
            outline.frustumCulled = false;
            outline.position.copy(child.position);
            outline.quaternion.copy(child.quaternion);
            outline.scale.copy(child.scale).multiplyScalar(thickness);
            outline.castShadow = false;
            outline.receiveShadow = false;

            if (child.parent) {
                child.parent.add(outline);
            }
        });
    }

    /**
     * Setup the Three.js AnimationMixer and animation actions
     */
    setupAnimations() {
        const animKey = this.gameState?.selectedKit?.animationKey || this.gameState?.selectedKit?.model || 'character_3k_mage';
        const animationData = this.assetLoader.assets.animations[animKey];

        if (!animationData) {
            console.warn('No animation data available for character');
            this.useProceduralAnimation = true;
            return;
        }

        // Loco-only models (e.g. RogueV3): disable dissociation, attacks are VFX-only
        if (animationData.locoOnly) {
            this.locoOnly = true;
            this.useDissociation = false;
            this._cacheCombatBones();
        }

        // Check if we have real animation clips (GLTF loaded)
        if (animationData.clips && animationData.clips.length > 0) {
            // Create animation mixer for this character's mesh
            this.mixer = new THREE.AnimationMixer(this.mesh);

            // Create actions for each animation clip and map to standard names
            animationData.clips.forEach(clip => {
                const action = this.mixer.clipAction(clip);
                this.actions[clip.name] = action;

                // Also map by common name patterns
                const lowerName = clip.name.toLowerCase();
                if (lowerName.includes('idle')) this.actions['Idle'] = action;
                if (lowerName.includes('walk')) this.actions['Walk'] = action;
                if (lowerName.includes('running') || lowerName.includes('run')) this.actions['Run'] = action;
                if (lowerName.includes('fast') && lowerName.includes('run')) this.actions['Fast running'] = action;
                if (lowerName.includes('run') && lowerName.includes('left')) this.actions['Run left'] = action;
                if (lowerName.includes('run') && lowerName.includes('right')) this.actions['Run right'] = action;
                if (lowerName.includes('roll') || lowerName.includes('dodge')) this.actions['Roll dodge'] = action;
                if (lowerName.includes('jump')) {
                    this.actions['Jump'] = action;
                    action.setLoop(THREE.LoopOnce);
                    action.clampWhenFinished = true;
                }
                if (lowerName.includes('basic') && lowerName.includes('attack')) {
                    this.actions['Basic attack'] = action;
                    action.setLoop(THREE.LoopOnce);
                    action.clampWhenFinished = true;
                }
                if (lowerName.includes('charged') && lowerName.includes('attack')) {
                    this.actions['Charged attack'] = action;
                    action.setLoop(THREE.LoopOnce);
                    action.clampWhenFinished = true;
                }
                if (lowerName.includes('ultimate')) {
                    this.actions['Ultimate'] = action;
                    action.setLoop(THREE.LoopOnce);
                    action.clampWhenFinished = true;
                }
                if ((lowerName.includes('special') && lowerName.includes('attack') && lowerName.includes('1')) || lowerName === 'special attack 1') {
                    this.actions['Special attack 1'] = action;
                    action.setLoop(THREE.LoopOnce);
                    action.clampWhenFinished = true;
                }
                if (lowerName.includes('whip')) {
                    this.actions['Whip'] = action;
                    action.setLoop(THREE.LoopOnce);
                    action.clampWhenFinished = true;
                }
                if ((lowerName.includes('special') && lowerName.includes('attack') && lowerName.includes('2')) || lowerName === 'special attack 2') {
                    this.actions['Special attack 2'] = action;
                    action.setLoop(THREE.LoopOnce);
                    action.clampWhenFinished = true;
                }
                if ((lowerName.includes('special') && lowerName.includes('attack') && lowerName.includes('3')) || lowerName === 'special attack 3') {
                    this.actions['Special attack 3'] = action;
                    action.setLoop(THREE.LoopOnce);
                    action.clampWhenFinished = true;
                }
                if (lowerName.includes('drink') || lowerName.includes('potion') || lowerName.includes('use') && lowerName.includes('item') || lowerName.includes('consume')) {
                    this.actions['Drink'] = action;
                    action.setLoop(THREE.LoopOnce);
                    action.clampWhenFinished = true;
                }

                // Configure action defaults
                action.setEffectiveTimeScale(1);
                action.setEffectiveWeight(1);
            });

            // Fill missing combat/utility animations from loader fallbacks when a reduced clip set is used.
            const map = animationData.map || {};
            const bindAlias = (alias) => {
                const mapped = map[alias];
                if (!mapped) return;
                const action = this.actions[mapped.name] || this.mixer.clipAction(mapped);
                this.actions[alias] = action;
                if (alias === 'Basic attack' || alias === 'Charged attack' || alias === 'Ultimate' ||
                    alias === 'Special attack 1' || alias === 'Special attack 2' || alias === 'Special attack 3' ||
                    alias === 'Whip' || alias === 'Drink') {
                    action.setLoop(THREE.LoopOnce);
                    action.clampWhenFinished = true;
                }
            };
            [
                'Idle',
                'Walk',
                'Run',
                'Fast running',
                'Run left',
                'Run right',
                'Jump',
                'Basic attack',
                'Charged attack',
                'Special attack 1',
                'Special attack 2',
                'Special attack 3',
                'Whip',
                'Drink',
                'Ultimate'
            ].forEach(bindAlias);

            if (!this.actions['Jump']) {
                this.actions['Jump'] = this.actions['Roll dodge'] || this.actions['Run'] || this.actions['Walk'] || this.actions['Idle'];
            }

            // Dissociation: mask offensive animations only when using two-layer system
            if (this.useDissociation) {
                this.applyDissociationMasking();
            }

            // Start with idle on locomotion layer
            const idleAction = this.actions['Idle'] ||
                              this.actions['idle'] ||
                              Object.values(this.actions)[0];
            if (idleAction) {
                this.locoAction = idleAction;
                this.currentAction = idleAction; // Keep for backward compat during transition
                idleAction.reset().fadeIn(0.2).play();
            }

            this.useProceduralAnimation = false;
            console.log('Skeletal animation system initialized (dissociation enabled):', Object.keys(this.actions));
            this.logAttackDurations();
        } else {
            // Fallback to procedural animation for non-rigged models
            this.useProceduralAnimation = true;
            console.log('Using procedural animation (no skeletal clips found)');
        }
    }

    /** Log Basic and Charged attack clip durations (from your GLB) and effective playback times */
    logAttackDurations() {
        const basic = this.actions['Basic attack']?.getClip();
        const charged = this.actions['Charged attack']?.getClip();
        const chargeDuration = this.gameState.combat.chargeDuration;
        if (basic) {
            const timeScale = 3.8;
            const effectiveBasic = basic.duration / timeScale;
            console.log(`Basic attack: clip=${basic.duration.toFixed(2)}s → plays in ${effectiveBasic.toFixed(2)}s (${timeScale}x speed)`);
        }
        if (charged) {
            console.log(`Charged attack: clip=${charged.duration.toFixed(2)}s → plays in ${chargeDuration.toFixed(2)}s (synced to charge)`);
        }
    }

    /**
     * Dissociation: remove lower-body tracks from offensive animations.
     * Legs keep locomotion; arms/torso/head do attacks on top. Souls-like feel.
     */
    applyDissociationMasking() {
        // Remove only leg bones - keep Hips so pelvis can lean with the attack (grounded, weighted feel)
        const lowerBones = [
            'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
            'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
            // Common rig variants (Mixamo, Character Creator, etc.)
            'L_UpLeg', 'L_Leg', 'L_Foot', 'L_ToeBase',
            'R_UpLeg', 'R_Leg', 'R_Foot', 'R_ToeBase',
            'CC_Base_L_Thigh', 'CC_Base_L_Calf', 'CC_Base_L_Foot', 'CC_Base_L_ToeBase',
            'CC_Base_R_Thigh', 'CC_Base_R_Calf', 'CC_Base_R_Foot', 'CC_Base_R_ToeBase'
        ];

        Object.values(this.actions).forEach(action => {
            const clip = action.getClip();
            const name = clip.name.toLowerCase();

            if (name.includes('attack') || name.includes('roll') || name.includes('dodge') ||
                name.includes('charged') || name.includes('special') || name.includes('ultimate')) {

                const before = clip.tracks.length;
                clip.tracks = clip.tracks.filter(track => {
                    const path = track.name.replace(/\.(position|quaternion|scale)$/i, '') || track.name.split('.')[0];
                    const segments = path.split(/[.:\/]/);
                    const boneName = segments[segments.length - 1];
                    return !lowerBones.includes(boneName);
                });
                if (before !== clip.tracks.length) {
                    console.log(`Dissociation: ${clip.name} - removed ${before - clip.tracks.length} lower-body tracks`);
                }
            }
        });
    }

    /** Play locomotion layer (legs) - always active */
    playLoco(actionName, fadeTime = 0.2) {
        const action = this.actions[actionName];
        if (!action) return;
        if (this.locoAction === action) return;

        if (this.locoAction) this.locoAction.fadeOut(fadeTime);
        action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fadeTime).play();
        this.locoAction = action;
    }

    /** Play upper-body layer (arms, torso) - fades in/out on top of locomotion */
    playUpper(actionName, fadeInTime = 0.12, fadeOutTime = 0.2) {
        if (actionName === 'none' || !actionName) {
            if (this.upperAction) {
                this.upperAction.fadeOut(fadeOutTime);
                this.upperAction = null;
            }
            return;
        }

        const action = this.actions[actionName];
        if (!action) return;

        // Never restart Charged attack if already playing (play once, freeze until projectile)
        if (actionName === 'Charged attack' && this.upperAction === action) {
            return;
        }

        if (this.upperAction) this.upperAction.fadeOut(fadeOutTime);
        action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fadeInTime).play();
        this.upperAction = action;
    }

    fadeToAction(actionName, duration = 0.25) {
        const newAction = this.actions[actionName];
        if (!newAction) return;
        if (this.currentAction === newAction) return;

        if (this.currentAction) {
            this.currentAction.fadeOut(duration);
        }

        newAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(duration).play();
        this.currentAction = newAction;
    }

    createWeapon() {
        // Don't create weapon if mesh doesn't exist
        if (!this.mesh) {
            console.warn('Cannot create weapon - no character mesh');
            return;
        }

        // Changeform models (wolf, bear) use natural weapons – no mesh to attach
        const modelKey = this.gameState?.selectedKit?.model;
        if (modelKey === 'wolf' || modelKey === 'bear') {
            return;
        }

        this.weapon = this.assetLoader.getModel('claymore');

        if (this.weapon) {
            // Find a suitable hand bone to attach the weapon
            // Check for various bone naming conventions
            let handBone = null;
            const handBoneNames = ['hand_r', 'hand.r', 'righthand', 'rhand', 'hand_right', 'handright'];

            this.mesh.traverse(child => {
                if (child.isBone) {
                    const name = child.name.toLowerCase();

                    // Check various naming conventions
                    for (const boneName of handBoneNames) {
                        if (name.includes(boneName) || name === boneName) {
                            // Avoid finger bones
                            if (!name.includes('thumb') && !name.includes('index') &&
                                !name.includes('middle') && !name.includes('ring') &&
                                !name.includes('pinky') && !name.includes('finger')) {
                                handBone = child;
                                break;
                            }
                        }
                    }
                }
            });

            if (handBone) {
                // Clone the weapon to avoid issues
                this.weapon = this.weapon.clone();
                // Position and orient for KayKit style models
                this.weapon.position.set(0, 0, 0);
                this.weapon.rotation.set(0, 0, 0);
                this.weapon.scale.setScalar(1.0);
                handBone.add(this.weapon);
                this.createBloodDagger(this.mesh);
            } else {
                // Clone and attach directly to mesh
                this.weapon = this.weapon.clone();
                this.weapon.position.set(0.5, 0.8, 0);
                this.weapon.rotation.set(0, 0, Math.PI / 4);
                this.weapon.scale.setScalar(1.0);
                this.mesh.add(this.weapon);
                this.createBloodDagger(this.mesh);
            }
        } else {
            this.createBloodDagger(this.mesh);
        }
    }

    /** Small dagger-shaped blood-red flame at the hip (deep, intense) – attached to Hips when possible */
    createBloodDagger(mesh) {
        if (!mesh) return;
        let hipBone = null;
        const hipBoneNames = ['hips', 'hip', 'pelvis', 'spine', 'root', 'mixamorighips', 'cc_base_hip'];
        mesh.traverse(child => {
            if (child.isBone) {
                const name = child.name.toLowerCase();
                for (const bn of hipBoneNames) {
                    if (name === bn || name.includes(bn)) {
                        hipBone = child;
                        return;
                    }
                }
            }
        });

        const mat = createBloodFireMaterial({
            coreBrightness: 1.8,
            plasmaSpeed: 3.5,
            isCharged: 1.0,
            layerScale: 1.4,
            rimPower: 2.4
        });
        mat.uniforms.alpha.value = 0.92;

        const bladeW = 0.012;
        const bladeH = 0.16;
        const bladeD = 0.006;
        const bladeGeo = new THREE.BoxGeometry(bladeW, bladeH, bladeD);
        const blade = new THREE.Mesh(bladeGeo, mat);
        blade.position.set(0, bladeH * 0.5 + 0.03, 0);
        blade.castShadow = false;
        blade.receiveShadow = false;

        const guardW = 0.04;
        const guardH = 0.012;
        const guardD = 0.008;
        const guardGeo = new THREE.BoxGeometry(guardW, guardH, guardD);
        const guard = new THREE.Mesh(guardGeo, mat);
        guard.position.set(0, 0.03, 0);
        guard.castShadow = false;
        guard.receiveShadow = false;

        const handleW = 0.018;
        const handleH = 0.05;
        const handleD = 0.01;
        const handleGeo = new THREE.BoxGeometry(handleW, handleH, handleD);
        const handle = new THREE.Mesh(handleGeo, mat);
        handle.position.set(0, -handleH * 0.5, 0);
        handle.castShadow = false;
        handle.receiveShadow = false;

        this.bloodDagger = new THREE.Group();
        this.bloodDagger.add(blade);
        this.bloodDagger.add(guard);
        this.bloodDagger.add(handle);
        this.bloodDagger.scale.setScalar(0.85);
        this.bloodDagger.rotation.x = Math.PI * 0.5;
        this.bloodDagger.rotation.z = -Math.PI * 0.12;
        this.bloodDagger.position.set(0.12, 0.02, 0.06);
        this.bloodDagger.frustumCulled = false;

        if (hipBone) {
            hipBone.add(this.bloodDagger);
        } else {
            mesh.add(this.bloodDagger);
            this.bloodDagger.position.set(0.08, 0.92, 0.08);
        }
    }
    
    update(deltaTime, input, mouseSensitivity) {
        // Vanish (dagger C): ghostly semi-transparent while active
        if (this.mesh && this._isDaggerKit) {
            const vanishActive = this.gameState?.combat?.vanishRemaining > 0;
            const vanishRemaining = this.gameState?.combat?.vanishRemaining ?? 0;
            if (vanishActive) {
                this.mesh.visible = true;
                // Ghost effect: make all meshes semi-transparent with a shimmer
                if (!this._vanishMaterialsStored) {
                    this._vanishMaterialsStored = true;
                    this._vanishOriginalOpacities = [];
                    this.mesh.traverse(child => {
                        if (child.isMesh && child.material && !child.userData?.isOutline) {
                            this._vanishOriginalOpacities.push({
                                mesh: child,
                                transparent: child.material.transparent,
                                opacity: child.material.opacity
                            });
                            child.material.transparent = true;
                        }
                    });
                }
                // Flickering ghost opacity
                const flickerBase = 0.12;
                const flicker = flickerBase + 0.08 * Math.sin(this.animationTime * 12) * Math.cos(this.animationTime * 7);
                // Fade back in during last 0.5s
                const fadeIn = vanishRemaining < 0.5 ? (1 - vanishRemaining / 0.5) : 0;
                const targetOpacity = flicker + fadeIn * (1 - flicker);
                for (let vi = 0; vi < this._vanishOriginalOpacities.length; vi++) {
                    this._vanishOriginalOpacities[vi].mesh.material.opacity = targetOpacity;
                }
            } else if (this._vanishMaterialsStored) {
                // Restore original materials
                for (const entry of this._vanishOriginalOpacities) {
                    entry.mesh.material.transparent = entry.transparent;
                    entry.mesh.material.opacity = entry.opacity;
                }
                this._vanishMaterialsStored = false;
                this._vanishOriginalOpacities = [];
                this.mesh.visible = true;
            }
        } else if (this.mesh) {
            this.mesh.visible = (this.gameState?.combat?.vanishRemaining <= 0);
        }

        // Ultimate (F): consume full bar and play Special attack 1 animation
        const ultimateAction = this.actions['Special attack 1'] || this.actions['Ultimate'];
        if (input.ultimate && (this.gameState.player.ultimateCharge >= 100 || this.gameState.ultimateTestMode) && !this.isPlayingUltimate && ultimateAction) {
            this.gameState.useUltimate();
            this.isPlayingUltimate = true;
            const ultimateClip = ultimateAction.getClip();
            const ultimateSpeed = 4.0; // 2x faster than before (100% increase)
            this.ultimateAnimTimer = ultimateClip.duration / ultimateSpeed;
            if (this.useDissociation) {
                this.playLoco('Idle', 0.2);
                this.playUpper(ultimateAction === this.actions['Special attack 1'] ? 'Special attack 1' : 'Ultimate', 0.12, 0.12);
                this.currentUpperState = ultimateAction === this.actions['Special attack 1'] ? 'Special attack 1' : 'Ultimate';
            } else {
                this.fadeToAction(ultimateAction === this.actions['Special attack 1'] ? 'Special attack 1' : 'Ultimate', 0.1);
                this.currentAnimation = ultimateAction === this.actions['Special attack 1'] ? 'Special attack 1' : 'Ultimate';
            }
        }
        const whipAction = this.actions['Whip'] || this.actions['Special attack 2'];
        const drainAction = this.actions['Special attack 3'] || this.actions['Special attack 2'] || this.actions['Whip'];
        // E = Bloodflail is started by Game → CombatSystem.executeBloodflail(), not from input here
        const drinkAction = this.actions['Drink'] || this.actions['Special attack 2'];
        // Potion uses gameplay/VFX only; keep normal locomotion and avoid forcing a dedicated upper animation.
        if (this.gameState.combat.isDrinkingPotion && this.currentUpperState === 'Drink') {
            this.playUpper('none', 0.08, 0.15);
            this.currentUpperState = null;
        }
        if (this.gameState.combat.isLifeDraining && drainAction) {
            if (this.currentUpperState !== 'LifeDrain') {
                const drinkLoco = this.gameState.movement.isMoving ? ((this.gameState.movement.isRunning && this.actions['Run']) ? 'Run' : (this.actions['Walk'] ? 'Walk' : 'Idle')) : 'Idle';
                this.playLoco(drinkLoco, 0.12);
                const drainAnimName = this.actions['Special attack 3'] ? 'Special attack 3' : (this.actions['Special attack 2'] ? 'Special attack 2' : 'Whip');
                this.playUpper(drainAnimName, 0.1, 0.15);
                const drainAnim = this.actions[drainAnimName];
                if (drainAnim) drainAnim.setEffectiveTimeScale(0.2);
                this.currentUpperState = 'LifeDrain';
            }
        } else if (this.currentUpperState === 'LifeDrain') {
            this.playUpper('none', 0.05, 0.15);
            const drainAnimName = this.actions['Special attack 3'] ? 'Special attack 3' : (this.actions['Special attack 2'] ? 'Special attack 2' : 'Whip');
            const drainAnim = this.actions[drainAnimName];
            if (drainAnim) drainAnim.setEffectiveTimeScale(1);
            this.currentUpperState = null;
        }
        if (this.isPlayingUltimate) {
            this.ultimateAnimTimer -= deltaTime;
            if (this.ultimateAnimTimer <= 0) this.isPlayingUltimate = false;
        }
        // Update camera rotation
        this.updateCamera(input, mouseSensitivity, deltaTime);
        
        if (this.isDashing) {
            this.updateDash(deltaTime);
        } else {
            this.updateMovement(deltaTime, input);
            if (Math.abs(this.postDashTilt) > 0.001) {
                this.postDashTilt *= Math.max(0, 1 - 10 * deltaTime);
            }
        }
        
        // Apply gravity and update position
        this.applyPhysics(deltaTime);
        
        // Update game state
        this.updateGameState(deltaTime);
        
        // Update mesh position
        this.updateMesh();
        
        // Update animation
        this.updateAnimation(deltaTime, input);

        // Blood dagger at hip – animated flame
        if (this.bloodDagger) {
            const daggerMat = this.bloodDagger.children[0]?.material;
            if (daggerMat && daggerMat.uniforms) {
                updateBloodFireMaterial(daggerMat, this.animationTime, 0.92);
            }
        }

        // Dash VFX (trail, vortex, sparks) – keep updating until fade-out done
        if (this.dashVfx) {
            const progress = this.isDashing ? 1 - this.dashTimer / this.dashDuration : 0;
            if (!this.dashVfx.update(deltaTime, this.position, this.dashDirection, progress, this.isDashing)) {
                this.dashVfx = null;
            }
        }
    }
    
    updateCamera(input, sensitivity, deltaTime = 0.016) {
        const lookSensitivity = 0.0022 * sensitivity;  // Slightly more responsive
        const maxAnglePerFrame = 0.22;  // Snappier turn feel
        const lockCamera = input.crimsonEruptionTargeting === true || input.stalactiteTargeting === true || input.blizzardTargeting === true;
        const deltaYaw = lockCamera ? 0 : Math.max(-maxAnglePerFrame, Math.min(maxAnglePerFrame, -input.mouseDeltaX * lookSensitivity));
        const deltaPitch = lockCamera ? 0 : Math.max(-maxAnglePerFrame, Math.min(maxAnglePerFrame, input.mouseDeltaY * lookSensitivity));
        this.cameraYaw += deltaYaw;
        this.cameraPitch += deltaPitch;


        // Clamp pitch (prevent camera going too high or too low)
        this.cameraPitch = Math.max(-0.5, Math.min(this.pitchLimit, this.cameraPitch));

        const horizontalDistance = this.cameraDistance * Math.cos(this.cameraPitch);
        const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
        this._cameraBobTime += deltaTime * (2.5 + planarSpeed * 0.65);
        const bobAmp = Math.min(0.05, planarSpeed * 0.0045);
        const bobOffset = Math.sin(this._cameraBobTime) * bobAmp;
        const verticalDistance = this.cameraDistance * Math.sin(this.cameraPitch) + this.cameraHeight + bobOffset;

        const targetX = this.position.x + horizontalDistance * Math.sin(this.cameraYaw);
        const targetY = this.position.y + verticalDistance;
        const targetZ = this.position.z + horizontalDistance * Math.cos(this.cameraYaw);

        const smoothFactor = 1 - Math.exp(-this.cameraSmoothSpeed * deltaTime);
        this._camTarget.set(targetX, targetY, targetZ);
        this.camera.position.lerp(this._camTarget, smoothFactor);

        const lookBob = Math.cos(this._cameraBobTime * 0.8) * (bobAmp * 0.45);
        this._lookAt.set(this.position.x, this.position.y + this.cameraLookAtHeight + lookBob, this.position.z);
        this.camera.lookAt(this._lookAt);
    }
    
    updateMovement(deltaTime, input) {
        if (this.gameState.combat.isLifeDraining) {
            this.velocity.x *= 0.9;
            this.velocity.z *= 0.9;
            return;
        }
        this._moveVec.set(0, 0, 0);
        const moveVector = this._moveVec;
        
        const forward = this._fwd.set(0, 0, -1);
        const right = this._right.set(1, 0, 0);
        
        forward.applyAxisAngle(this._yAxis, this.cameraYaw);
        right.applyAxisAngle(this._yAxis, this.cameraYaw);
        
        // Zero out Y component for horizontal movement
        forward.y = 0;
        right.y = 0;
        forward.normalize();
        right.normalize();
        
        if (input.forward) moveVector.add(forward);
        if (input.backward) moveVector.sub(forward);
        if (input.right) moveVector.add(right);
        if (input.left) moveVector.sub(right);
        
        if (moveVector.length() > 0) {
            moveVector.normalize();

            // Default fast run when moving; Vanish (dagger C) gives +60% speed
            const isRunning = this.gameState.player.stamina > 5;
            const vanishMult = (this.gameState?.combat?.vanishRemaining > 0) ? 1.6 : 1;
            const speedBonus = this.gameState?.bonuses?.runSpeed ?? 0;
            const speed = ((isRunning ? this.runSpeed : this.walkSpeed) + speedBonus) * vanishMult;

            // Drain stamina while running
            if (isRunning) {
                this.gameState.useStamina(10 * deltaTime);
            }

            const targetVelX = moveVector.x * speed;
            const targetVelZ = moveVector.z * speed;
            const moveSmooth = 1 - Math.exp(-16 * deltaTime);  // Quick, smooth velocity blend
            this.velocity.x += (targetVelX - this.velocity.x) * moveSmooth;
            this.velocity.z += (targetVelZ - this.velocity.z) * moveSmooth;

            const targetYaw = Math.atan2(moveVector.x, moveVector.z);
            let diff = targetYaw - this.rotation.y;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            const rotSmooth = 1 - Math.exp(-12 * deltaTime);   // Quick, smooth rotation
            this.rotation.y += diff * rotSmooth;
        } else {
            // Stop immediately when no movement input (no slide/latency)
            this.velocity.x = 0;
            this.velocity.z = 0;
        }

        // Space = jump only
        if (input.jump && this.isGrounded && !this.isDashing) {
            const jumpBonus = this.gameState?.bonuses?.jumpForce ?? 0;
            this.velocity.y = this.jumpForce + jumpBonus;
            this.isGrounded = false;
        }

        // é (AZERTY Digit2) = Super Dash
        if (input.superDash && this.superDashCooldown <= 0 && !this.isDashing && this.gameState.useStamina(20)) {
            const dashDir = moveVector.length() > 0 ? moveVector.clone().normalize() : forward;
            this.startDash(dashDir, true);
            this.gameState.combat.nextAttackDamageMultiplier = 2.0;
        }

        // R = dash in movement direction (or forward if not moving)
        if (input.dash && this.dashCooldown <= 0 &&
            this.gameState.useStamina(12)) {
            const dashDir = moveVector.length() > 0
                ? moveVector.clone().normalize()
                : forward;
            this.startDash(dashDir, false);
        }
    }

    startDash(forwardDir, isSuper = false) {
        const dir = forwardDir.clone().normalize();
        this.dashStartPos.copy(this.position);
        this.dashDirection.copy(dir);
        this.rotation.y = Math.atan2(dir.x, dir.z);
        this.velocity.set(0, 0, 0);
        this.isDashing = true;
        this.isSuperDashing = isSuper;
        this.superDashHitSet.clear();
        this.dashTimer = isSuper ? this.dashDuration * 1.15 : this.dashDuration;
        this.dashCooldown = isSuper ? 1.2 : 0.7;
        if (isSuper) this.superDashCooldown = this.superDashCooldownDuration;
        this.gameState.combat.invulnerable = true;
        if (this.dashVfx) this.dashVfx.dispose();
        this.dashVfx = createDashVFX(this.scene, {
            isFrost: this.gameState.selectedKit?.id === 'frost_mage',
            isPoison: this.gameState.selectedKit?.id === 'shadow_assassin',
            isBow: this.gameState.selectedKit?.id === 'bow_ranger'
        });
    }

    updateDash(deltaTime) {
        this.dashTimer -= deltaTime;
        if (this.dashTimer <= 0) {
            this.isDashing = false;
            this.isSuperDashing = false;
            this.gameState.combat.invulnerable = false;
            const coastSpeed = 3.5;
            this.velocity.x = this.dashDirection.x * coastSpeed;
            this.velocity.z = this.dashDirection.z * coastSpeed;
            const t = 1;
            const easeOutQuint = 1 - Math.pow(1 - t, 5);
            this.postDashTilt = -0.1 * Math.sin(easeOutQuint * Math.PI);
        } else {
            const t = 1 - this.dashTimer / this.dashDuration;
            const easeOutQuint = 1 - Math.pow(1 - t, 5);
            const boundary = 18.5;
            const dist = this.isSuperDashing ? this.dashDistance * 2.0 : this.dashDistance;
            this.position.x = this.dashStartPos.x + this.dashDirection.x * dist * easeOutQuint;
            this.position.z = this.dashStartPos.z + this.dashDirection.z * dist * easeOutQuint;
            this.position.x = Math.max(-boundary, Math.min(boundary, this.position.x));
            this.position.z = Math.max(-boundary, Math.min(boundary, this.position.z));
        }
    }

    applyPhysics(deltaTime) {
        if (!this.isGrounded && !this.isDashing) {
            this.velocity.y += this.gravity * deltaTime;
        }

        // Update position
        this.position.x += this.velocity.x * deltaTime;
        this.position.y += this.velocity.y * deltaTime;
        this.position.z += this.velocity.z * deltaTime;

        // Ground collision
        if (this.position.y <= 0) {
            this.position.y = 0;
            this.velocity.y = 0;
            this.isGrounded = true;
        }

        const boundary = 18.5;
        this.position.x = Math.max(-boundary, Math.min(boundary, this.position.x));
        this.position.z = Math.max(-boundary, Math.min(boundary, this.position.z));
    }

    updateGameState(deltaTime) {
        // Update movement state
        this.gameState.movement.isMoving = this.velocity.length() > 0.5;
        this.gameState.movement.isGrounded = this.isGrounded;
        this.gameState.movement.velocity = {
            x: this.velocity.x,
            y: this.velocity.y,
            z: this.velocity.z
        };

        // Regenerate stamina
        this.gameState.regenerateStamina(deltaTime);

        if (this.dashCooldown > 0) this.dashCooldown -= deltaTime;
        if (this.superDashCooldown > 0) this.superDashCooldown -= deltaTime;
    }

    updateMesh() {
        if (this.mesh) {
            this.mesh.position.copy(this.position);
            this.mesh.rotation.y = this.rotation.y;
            if (this.isDashing) {
                const t = 1 - this.dashTimer / this.dashDuration;
                const tilt = 1 - Math.pow(1 - t, 3);
                this.mesh.rotation.x = -0.1 * Math.sin(tilt * Math.PI);
                this.postDashTilt = this.mesh.rotation.x;
            } else {
                this.mesh.rotation.x = this.postDashTilt;
            }
        }
        this.updateBloodChargeIndicator();
        if (this._isDaggerKit) this.updatePoisonChargeIndicator();
        if (this._isBowRangerKit) this.updateTrustChargeIndicator();
    }

    updateAnimation(deltaTime, input) {
        this.animationTime += deltaTime;

        if (this.mixer) {
            this.mixer.update(deltaTime);
        }

        if (this.useProceduralAnimation) {
            this.applyProceduralAnimation();
            return;
        }

        if (!this.mixer) return;

        if (this.useDissociation) {
            // --- Dissociation: two independent layers ---
            let targetLoco = 'Idle';
            if (this.isDashing) {
                targetLoco = this.actions['Fast running'] ? 'Fast running' : 'Run';
            } else if (!this.isGrounded) {
                targetLoco = this.actions['Jump'] ? 'Jump' : 'Idle';
            } else if (this.gameState.movement.isMoving) {
                const isFastRun = this.gameState.player.stamina > 5;
                if (input.left && !input.right && this.actions['Run left']) {
                    targetLoco = 'Run left';
                } else if (input.right && !input.left && this.actions['Run right']) {
                    targetLoco = 'Run right';
                } else if (isFastRun && this.actions['Fast running']) {
                    targetLoco = 'Fast running';
                } else {
                    targetLoco = isFastRun ? 'Run' : 'Walk';
                }
            }

            if (targetLoco !== this.currentAnimation) {
                const fromDash = this.currentAnimation === 'Fast running' || this.currentAnimation === 'Run';
                const fadeTime = fromDash ? 0.32 : 0.15;
                this.playLoco(targetLoco, fadeTime);
                this.currentAnimation = targetLoco;
            }

            let targetUpper = 'none';
            if (this.isPlayingUltimate) {
                const ultAct = this.actions['Special attack 1'] || this.actions['Ultimate'];
                targetUpper = ultAct ? (ultAct === this.actions['Special attack 1'] ? 'Special attack 1' : 'Ultimate') : 'none';
            } else if (this.isSuperDashing && this.gameState.combat.isWhipAttacking !== true) {
                targetUpper = this.actions['Special attack 1'] ? 'Special attack 1' : (this.actions['Whip'] ? 'Whip' : 'none');
            } else if (this.gameState.combat.isChargedAttacking || this.gameState.combat.isCharging) {
                targetUpper = this.actions['Charged attack'] ? 'Charged attack' : 'none';
            } else if (this.gameState.combat.isDrinkingPotion) {
                targetUpper = 'none';
            } else if (this.gameState.combat.isLifeDraining) {
                targetUpper = (this.actions['Special attack 3'] || this.actions['Special attack 2'] || this.actions['Whip']) ? (this.actions['Special attack 3'] ? 'Special attack 3' : (this.actions['Special attack 2'] ? 'Special attack 2' : 'Whip')) : 'none';
            } else if (this.gameState.combat.isWhipAttacking) {
                targetUpper = (this.actions['Whip'] || this.actions['Special attack 2']) ? (this.actions['Whip'] ? 'Whip' : 'Special attack 2') : 'none';
            } else if (this.gameState.combat.isAttacking) {
                targetUpper = this.actions['Basic attack'] ? 'Basic attack' : 'none';
            }

            if (targetUpper === 'none') {
                this.chargedAttackAnimStarted = false; // Ready for next charge
            }

            if (targetUpper !== this.currentUpperState) {
                const wasAttack = this.currentUpperState === 'Charged attack' || this.currentUpperState === 'Basic attack' || this.currentUpperState === 'Ultimate' || this.currentUpperState === 'Special attack 1' || this.currentUpperState === 'Whip' || this.currentUpperState === 'Special attack 2' || this.currentUpperState === 'Special attack 3' || this.currentUpperState === 'LifeDrain' || this.currentUpperState === 'Drink';
                const fadeIn = (targetUpper === 'Basic attack' || targetUpper === 'Charged attack') ? 0.05 : 0.12;  // Snappy attack blend
                const fadeOut = targetUpper === 'none' && wasAttack ? 0.3 : 0.15;  // Longer blend to avoid arm shake at attack end
                this.playUpper(targetUpper, fadeIn, fadeOut);
                this.currentUpperState = targetUpper;
                if (targetUpper === 'Charged attack') {
                    this.chargedAttackAnimStarted = true; // Only start once, never replay
                }
            }

            this.currentAction = this.upperAction || this.locoAction;
        } else if (this.locoOnly) {
            // Loco-only mode (RogueV3): movement stays perfectly smooth, attacks are VFX-only.
            // Combat states never interrupt locomotion — the character keeps running/walking.
            let targetAnimation = 'Idle';
            if (this.isDashing) {
                targetAnimation = this.actions['Fast running'] ? 'Fast running' : 'Run';
            } else if (this.isSuperDashing) {
                targetAnimation = this.actions['Fast running'] ? 'Fast running' : 'Run';
            } else if (!this.isGrounded) {
                targetAnimation = this.actions['Jump'] ? 'Jump' : 'Idle';
            } else if (this.gameState.movement.isMoving) {
                const isFastRun = this.gameState.player.stamina > 5;
                if (input.left && !input.right && this.actions['Run left']) {
                    targetAnimation = 'Run left';
                } else if (input.right && !input.left && this.actions['Run right']) {
                    targetAnimation = 'Run right';
                } else if (isFastRun && this.actions['Fast running']) {
                    targetAnimation = 'Fast running';
                } else {
                    targetAnimation = isFastRun ? 'Run' : 'Walk';
                }
            }

            if (targetAnimation !== this.currentAnimation) {
                const fromJump = this.currentAnimation === 'Jump';
                const toJump = targetAnimation === 'Jump';
                const fromDash = this.currentAnimation === 'Fast running' || this.currentAnimation === 'Run';
                const fadeDur = toJump ? 0.1 : fromJump ? 0.15 : fromDash ? 0.28 : 0.18;
                this.fadeToAction(targetAnimation, fadeDur);
                this.currentAnimation = targetAnimation;
                // Landing squash: brief mesh scale compression on landing from jump
                if (fromJump && this.isGrounded) {
                    this._landSquashT = 1.0;
                }
            }

            // Jump time scale: slower at peak, speed up during descent
            if (targetAnimation === 'Jump' && this.actions['Jump']) {
                const vy = this.velocity.y;
                // Ascending: play at 0.8x, near peak (|vy| < 2): slow to 0.3x, descending: 0.6x
                const jumpTimeScale = Math.abs(vy) < 2 ? 0.3 : vy > 0 ? 0.8 : 0.6;
                this.actions['Jump'].setEffectiveTimeScale(jumpTimeScale);
            }

            // Landing squash decay
            if (this._landSquashT > 0) {
                this._landSquashT = Math.max(0, this._landSquashT - deltaTime * 8);
                const squash = 1 - this._landSquashT * 0.12;
                const stretch = 1 + this._landSquashT * 0.06;
                if (this.mesh) this.mesh.scale.set(stretch, squash, stretch);
            } else if (this.mesh && this.mesh.scale.y !== 1) {
                this.mesh.scale.set(1, 1, 1);
            }

            this.currentAction = this.actions[targetAnimation] || this.currentAction;
            this.locoAction = this.currentAction;
            this.upperAction = null;
        } else {
            // Full-body: single layer (attacks take over entire body)
            let targetAnimation = 'Idle';
            if (this.isDashing) {
                targetAnimation = this.actions['Fast running'] ? 'Fast running' : 'Run';
            } else if (this.isSuperDashing && this.gameState.combat.isWhipAttacking !== true) {
                targetAnimation = this.actions['Special attack 1'] ? 'Special attack 1' : (this.actions['Whip'] ? 'Whip' : 'Fast running');
            } else if (this.gameState.combat.isChargedAttacking || this.gameState.combat.isCharging) {
                targetAnimation = this.actions['Charged attack'] ? 'Charged attack' : 'Idle';
            } else if (this.gameState.combat.isDrinkingPotion) {
                targetAnimation = this.gameState.movement.isMoving ? ((this.gameState.movement.isRunning && this.actions['Run']) ? 'Run' : (this.actions['Walk'] ? 'Walk' : 'Idle')) : 'Idle';
            } else if (this.gameState.combat.isLifeDraining) {
                targetAnimation = (this.actions['Special attack 3'] || this.actions['Special attack 2'] || this.actions['Whip']) ? (this.actions['Special attack 3'] ? 'Special attack 3' : (this.actions['Special attack 2'] ? 'Special attack 2' : 'Whip')) : 'Idle';
            } else if (this.gameState.combat.isWhipAttacking) {
                targetAnimation = (this.actions['Whip'] || this.actions['Special attack 2']) ? (this.actions['Whip'] ? 'Whip' : 'Special attack 2') : 'Idle';
            } else if (this.gameState.combat.isAttacking) {
                targetAnimation = this.actions['Basic attack'] ? 'Basic attack' : 'Idle';
            } else if (!this.isGrounded) {
                targetAnimation = this.actions['Jump'] ? 'Jump' : 'Idle';
            } else if (this.gameState.movement.isMoving) {
                const isFastRun = this.gameState.player.stamina > 5;
                if (input.left && !input.right && this.actions['Run left']) {
                    targetAnimation = 'Run left';
                } else if (input.right && !input.left && this.actions['Run right']) {
                    targetAnimation = 'Run right';
                } else if (isFastRun && this.actions['Fast running']) {
                    targetAnimation = 'Fast running';
                } else {
                    targetAnimation = isFastRun ? 'Run' : 'Walk';
                }
            }

            if (targetAnimation !== this.currentAnimation) {
                const fromDash = this.currentAnimation === 'Fast running' || this.currentAnimation === 'Run';
                const fadeDur = fromDash ? 0.32 : 0.25;
                this.fadeToAction(targetAnimation, fadeDur);
                this.currentAnimation = targetAnimation;
            }

            this.currentAction = this.actions[targetAnimation] || this.currentAction;
            this.locoAction = this.currentAction;
            this.upperAction = null;
        }

        this.updateAnimationSpeed();

        // Procedural combat pose: additive bone rotations for locoOnly rigs
        if (this.locoOnly) this._updateProceduralCombatPose(deltaTime);
    }

    updateAnimationSpeed() {
        if (this.useDissociation) {
            if (this.locoAction) {
                this.locoAction.setEffectiveWeight(1);
                this.locoAction.setEffectiveTimeScale(1.0);
            }
            if (this.upperAction) {
                this.upperAction.setEffectiveWeight(1);
                if (this.currentUpperState === 'Basic attack') {
                    const kitId = this.gameState.selectedKit?.id;
                    const basicSpeed = kitId === 'shadow_assassin' ? 8.0
                        : kitId === 'bow_ranger' ? 5.5
                        : 3.8;
                    this.upperAction.setEffectiveTimeScale(basicSpeed);
                } else if (this.currentUpperState === 'Charged attack') {
                    const clipDuration = this.upperAction.getClip().duration;
                    const chargeDuration = this.gameState.combat.chargeDuration;
                    const timeScale = chargeDuration > 0 ? clipDuration / chargeDuration : 1;
                    this.upperAction.setEffectiveTimeScale(timeScale);
                } else if (this.currentUpperState === 'Ultimate' || this.currentUpperState === 'Special attack 1') {
                    this.upperAction.setEffectiveTimeScale(4.0); // 2x speed (100% increase)
                } else if (this.currentUpperState === 'Whip' || this.currentUpperState === 'Special attack 2') {
                    this.upperAction.setEffectiveTimeScale(2.2);
                } else if (this.currentUpperState === 'LifeDrain' || this.currentUpperState === 'Special attack 3') {
                    this.upperAction.setEffectiveTimeScale(0.2);
                } else {
                    this.upperAction.setEffectiveTimeScale(1.0);
                }
            }
        } else {
            // Full-body: apply combat timing to current action
            if (this.currentAction) {
                this.currentAction.setEffectiveWeight(1);
                if (this.currentAnimation === 'Basic attack') {
                    const kitId = this.gameState.selectedKit?.id;
                    const basicSpeed = kitId === 'shadow_assassin' ? 8.0
                        : kitId === 'bow_ranger' ? 5.5
                        : 3.8;
                    this.currentAction.setEffectiveTimeScale(basicSpeed);
                } else if (this.currentAnimation === 'Charged attack') {
                    const clipDuration = this.currentAction.getClip().duration;
                    const chargeDuration = this.gameState.combat.chargeDuration;
                    const timeScale = chargeDuration > 0 ? clipDuration / chargeDuration : 1;
                    this.currentAction.setEffectiveTimeScale(timeScale);
                } else if (this.currentAnimation === 'Ultimate' || this.currentAnimation === 'Special attack 1') {
                    this.currentAction.setEffectiveTimeScale(4.0); // 2x speed (100% increase)
                } else if (this.currentAnimation === 'Whip' || this.currentAnimation === 'Special attack 2') {
                    this.currentAction.setEffectiveTimeScale(2.2);
                } else if (this.currentAnimation === 'Special attack 3') {
                    this.currentAction.setEffectiveTimeScale(0.2);
                } else {
                    this.currentAction.setEffectiveTimeScale(1.0);
                }
            }
        }
    }

    /** Cache bone references for procedural combat poses (locoOnly rigs). */
    _cacheCombatBones() {
        if (!this.mesh) return;

        const modelKey = this.gameState?.selectedKit?.model;
        this._isBeastModel = (modelKey === 'wolf' || modelKey === 'bear');

        // Collect all bone names for debugging
        const allBones = [];
        this.mesh.traverse(child => {
            if (child.isBone) allBones.push(child.name);
        });
        if (allBones.length) console.log(`[${modelKey}] Bones found:`, allBones);

        const bones = {};

        if (this._isBeastModel) {
            // Quadruped bone search — flexible patterns for various rig conventions
            const wanted = {
                spine:  ['spine1', 'spine01', 'spine_1', 'spine'],
                spine2: ['spine2', 'spine02', 'spine_2'],
                neck:   ['neck'],
                head:   ['head'],
                jaw:    ['jaw', 'mouth'],
                // Front legs
                rFrontUpper: ['frontright', 'rightupper', 'frontrightleg', 'rightfrontleg', 'rightshoulder', 'r_front_upper', 'frontlegr'],
                rFrontLower: ['frontrightlower', 'rightlower', 'r_front_lower', 'frontlegr_lower', 'rightforearm'],
                lFrontUpper: ['frontleft', 'leftupper', 'frontleftleg', 'leftfrontleg', 'leftshoulder', 'l_front_upper', 'frontlegl'],
                lFrontLower: ['frontleftlower', 'leftlower', 'l_front_lower', 'frontlegl_lower', 'leftforearm'],
                // Rear legs
                rRearUpper: ['rearright', 'rightrear', 'rearrightleg', 'rightbackleg', 'r_rear_upper', 'backlegr', 'righthip'],
                rRearLower: ['rearrightlower', 'r_rear_lower', 'backlegr_lower', 'rightknee', 'rightlowerleg'],
                lRearUpper: ['rearleft', 'leftrear', 'rearleftleg', 'leftbackleg', 'l_rear_upper', 'backlegl', 'lefthip'],
                lRearLower: ['rearleftlower', 'l_rear_lower', 'backlegl_lower', 'leftknee', 'leftlowerleg'],
                // Tail
                tail:   ['tail', 'tail1', 'tail01'],
                hips:   ['hips', 'hip', 'pelvis', 'root']
            };
            this.mesh.traverse(child => {
                if (!child.isBone) return;
                const n = child.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                for (const [key, patterns] of Object.entries(wanted)) {
                    if (bones[key]) continue;
                    for (const p of patterns) {
                        if (n === p || n.includes(p)) { bones[key] = child; break; }
                    }
                }
            });
            if (bones.spine || bones.head || bones.neck) {
                this._combatBones = bones;
                this._combatBonesRest = {};
                for (const [key, bone] of Object.entries(bones)) {
                    this._combatBonesRest[key] = bone.quaternion.clone();
                }
                console.log(`[${modelKey}] Beast combat bones mapped:`, Object.keys(bones));
            }
        } else {
            // Humanoid bone search (original)
            const wanted = {
                spine: ['spine02', 'spine2', 'spine_02'],
                spine01: ['spine01', 'spine1', 'spine_01'],
                rArm: ['rightarm'],
                rForeArm: ['rightforearm'],
                lArm: ['leftarm'],
                lForeArm: ['leftforearm']
            };
            this.mesh.traverse(child => {
                if (!child.isBone) return;
                const n = child.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                for (const [key, patterns] of Object.entries(wanted)) {
                    if (bones[key]) continue;
                    for (const p of patterns) {
                        if (n === p || n.includes(p)) { bones[key] = child; break; }
                    }
                }
            });
            if (bones.spine || bones.rArm) {
                this._combatBones = bones;
                this._combatBonesRest = {};
                for (const [key, bone] of Object.entries(bones)) {
                    this._combatBonesRest[key] = bone.quaternion.clone();
                }
            }
        }
    }

    /**
     * Apply additive procedural rotations on top of locomotion for combat feel.
     * Called AFTER mixer.update() so bone transforms are set by locomotion clips.
     */
    _updateProceduralCombatPose(dt) {
        if (!this._combatBones) return;

        // Beast models use a separate quadruped animation path
        if (this._isBeastModel) {
            this._updateBeastCombatPose(dt);
            return;
        }

        const bones = this._combatBones;
        const q = this._poseQ;
        const e = this._poseE;

        // --- Airborne arm lock: pin arms to a compact held pose during jump ---
        const airTarget = this.isGrounded ? 0 : 1;
        this._jumpArmBlend = this._jumpArmBlend ?? 0;
        this._jumpArmBlend += (airTarget - this._jumpArmBlend) * Math.min(1, dt * 12);
        if (this._jumpArmBlend > 0.01) {
            const jb = this._jumpArmBlend;
            // Arms tucked in close to body, forearms bent
            if (bones.rArm) {
                e.set(-0.25 * jb, 0, 0.4 * jb);
                q.setFromEuler(e);
                bones.rArm.quaternion.multiply(q);
            }
            if (bones.rForeArm) {
                e.set(-0.55 * jb, 0, 0);
                q.setFromEuler(e);
                bones.rForeArm.quaternion.multiply(q);
            }
            if (bones.lArm) {
                e.set(-0.25 * jb, 0, -0.4 * jb);
                q.setFromEuler(e);
                bones.lArm.quaternion.multiply(q);
            }
            if (bones.lForeArm) {
                e.set(-0.55 * jb, 0, 0);
                q.setFromEuler(e);
                bones.lForeArm.quaternion.multiply(q);
            }
            // Slight forward lean
            if (bones.spine) {
                e.set(0.08 * jb, 0, 0);
                q.setFromEuler(e);
                bones.spine.quaternion.multiply(q);
            }
        }

        const combat = this.gameState.combat;

        // Determine target pose from combat state
        let newType = 'none';
        if (combat.isAttacking) newType = 'basic';
        else if (combat.isCharging) newType = 'charging';
        else if (combat.isChargedAttacking) newType = 'charged';
        else if (combat.isWhipAttacking) newType = 'ability';

        // Reset swing when attack type changes, alternate slash direction for basic
        if (newType !== this._combatPoseType) {
            if (newType !== 'none') {
                this._combatSwingT = 0;
                if (newType === 'basic') this._combatSwingDir *= -1; // alternate L/R slash
            }
            this._combatPoseType = newType;
        }
        this._combatPoseTarget = newType !== 'none' ? 1 : 0;

        // Smooth blend in/out
        const blendSpeed = this._combatPoseTarget > 0.5 ? 18 : 10;
        this._combatPoseBlend += (this._combatPoseTarget - this._combatPoseBlend) * Math.min(1, dt * blendSpeed);
        if (Math.abs(this._combatPoseBlend) < 0.001) { this._combatPoseBlend = 0; return; }

        // Advance swing timer
        const swingSpeed = newType === 'basic' ? 7.5 : newType === 'charged' ? 5.5 : newType === 'ability' ? 5.0 : 1.0;
        this._combatSwingT = Math.min(1, this._combatSwingT + dt * swingSpeed);
        const t = this._combatSwingT;
        const blend = this._combatPoseBlend;
        const dir = this._combatSwingDir; // +1 or -1

        // Easing curves
        const easeOut = 1 - (1 - t) * (1 - t);
        const bell = Math.sin(t * Math.PI);
        // Sharp attack curve: fast wind-up, sharp peak, slower follow-through
        const strike = t < 0.35 ? Math.sin(t / 0.35 * Math.PI * 0.5) : Math.cos((t - 0.35) / 0.65 * Math.PI * 0.5);

        if (newType === 'basic') {
            // Alternating diagonal slash — full upper body commits to the swing
            const s = strike * blend;
            // Spine: lean forward + twist toward slash direction
            if (bones.spine) {
                e.set(s * 0.2, -s * dir * 0.3, s * dir * 0.08);
                q.setFromEuler(e);
                bones.spine.quaternion.multiply(q);
            }
            if (bones.spine01) {
                e.set(s * 0.1, -s * dir * 0.15, 0);
                q.setFromEuler(e);
                bones.spine01.quaternion.multiply(q);
            }
            // Lead arm (slashing side): swings forward and across
            if (dir > 0 && bones.rArm || dir < 0 && bones.lArm) {
                const leadArm = dir > 0 ? bones.rArm : bones.lArm;
                e.set(-s * 0.8, -s * dir * 0.4, -s * dir * 0.3);
                q.setFromEuler(e);
                leadArm.quaternion.multiply(q);
            }
            // Lead forearm: extra extension into the slash
            if (dir > 0 && bones.rForeArm || dir < 0 && bones.lForeArm) {
                const leadFore = dir > 0 ? bones.rForeArm : bones.lForeArm;
                e.set(-s * 0.5, 0, -s * dir * 0.15);
                q.setFromEuler(e);
                leadFore.quaternion.multiply(q);
            }
            // Trailing arm: counter-swing for balance
            if (dir > 0 && bones.lArm || dir < 0 && bones.rArm) {
                const trailArm = dir > 0 ? bones.lArm : bones.rArm;
                e.set(s * 0.25, s * dir * 0.2, s * dir * 0.15);
                q.setFromEuler(e);
                trailArm.quaternion.multiply(q);
            }
        } else if (newType === 'charging') {
            // Both arms draw back, spine coils, building tension
            const chargeT = Math.min(1, t * 1.5);
            const coil = 1 - (1 - chargeT) * (1 - chargeT);
            // Pulsing tension at full coil
            const pulse = chargeT >= 1 ? Math.sin(this.animationTime * 12) * 0.04 : 0;
            if (bones.spine) {
                e.set((-coil * 0.15 + pulse) * blend, coil * 0.2 * blend, 0);
                q.setFromEuler(e);
                bones.spine.quaternion.multiply(q);
            }
            if (bones.spine01) {
                e.set((-coil * 0.08 + pulse) * blend, coil * 0.1 * blend, 0);
                q.setFromEuler(e);
                bones.spine01.quaternion.multiply(q);
            }
            if (bones.rArm) {
                e.set((coil * 0.55 + pulse) * blend, 0, coil * 0.35 * blend);
                q.setFromEuler(e);
                bones.rArm.quaternion.multiply(q);
            }
            if (bones.rForeArm) {
                e.set(coil * 0.35 * blend, 0, coil * 0.15 * blend);
                q.setFromEuler(e);
                bones.rForeArm.quaternion.multiply(q);
            }
            if (bones.lArm) {
                e.set((coil * 0.4 + pulse) * blend, 0, -coil * 0.25 * blend);
                q.setFromEuler(e);
                bones.lArm.quaternion.multiply(q);
            }
        } else if (newType === 'charged') {
            // Explosive release: both arms slam forward, whole torso commits
            const s = strike * blend;
            if (bones.spine) {
                e.set(s * 0.3, -s * 0.15, 0);
                q.setFromEuler(e);
                bones.spine.quaternion.multiply(q);
            }
            if (bones.spine01) {
                e.set(s * 0.15, -s * 0.1, 0);
                q.setFromEuler(e);
                bones.spine01.quaternion.multiply(q);
            }
            if (bones.rArm) {
                e.set(-s * 1.0, -s * 0.2, -s * 0.35);
                q.setFromEuler(e);
                bones.rArm.quaternion.multiply(q);
            }
            if (bones.rForeArm) {
                e.set(-s * 0.6, 0, 0);
                q.setFromEuler(e);
                bones.rForeArm.quaternion.multiply(q);
            }
            if (bones.lArm) {
                e.set(-s * 0.7, s * 0.2, s * 0.3);
                q.setFromEuler(e);
                bones.lArm.quaternion.multiply(q);
            }
            if (bones.lForeArm) {
                e.set(-s * 0.4, 0, 0);
                q.setFromEuler(e);
                bones.lForeArm.quaternion.multiply(q);
            }
        } else if (newType === 'ability') {
            // Wide horizontal sweep: full body rotates into a big cross-slash
            const s = strike * blend;
            if (bones.spine) {
                e.set(s * 0.2, -easeOut * 0.35 * blend, s * 0.1);
                q.setFromEuler(e);
                bones.spine.quaternion.multiply(q);
            }
            if (bones.spine01) {
                e.set(s * 0.1, -bell * 0.2 * blend, 0);
                q.setFromEuler(e);
                bones.spine01.quaternion.multiply(q);
            }
            if (bones.rArm) {
                e.set(-s * 0.9, -s * 0.5, -easeOut * 0.3 * blend);
                q.setFromEuler(e);
                bones.rArm.quaternion.multiply(q);
            }
            if (bones.rForeArm) {
                e.set(-s * 0.4, -s * 0.2, 0);
                q.setFromEuler(e);
                bones.rForeArm.quaternion.multiply(q);
            }
            if (bones.lArm) {
                e.set(-s * 0.7, s * 0.5, easeOut * 0.3 * blend);
                q.setFromEuler(e);
                bones.lArm.quaternion.multiply(q);
            }
            if (bones.lForeArm) {
                e.set(-s * 0.3, s * 0.2, 0);
                q.setFromEuler(e);
                bones.lForeArm.quaternion.multiply(q);
            }
        }
    }

    /**
     * Beast-specific procedural combat poses for quadruped rigs (wolf/bear).
     * Uses spine, neck, head, jaw, front legs, rear legs, and tail bones.
     */
    _updateBeastCombatPose(dt) {
        const bones = this._combatBones;
        const q = this._poseQ;
        const e = this._poseE;
        const modelKey = this.gameState?.selectedKit?.model;
        const isWolf = modelKey === 'wolf';

        // --- Airborne body tuck ---
        const airTarget = this.isGrounded ? 0 : 1;
        this._jumpArmBlend = this._jumpArmBlend ?? 0;
        this._jumpArmBlend += (airTarget - this._jumpArmBlend) * Math.min(1, dt * 12);
        if (this._jumpArmBlend > 0.01) {
            const jb = this._jumpArmBlend;
            // Tuck legs, arch spine
            if (bones.spine) {
                e.set(-0.15 * jb, 0, 0);
                q.setFromEuler(e); bones.spine.quaternion.multiply(q);
            }
            if (bones.rFrontUpper) {
                e.set(0.4 * jb, 0, 0);
                q.setFromEuler(e); bones.rFrontUpper.quaternion.multiply(q);
            }
            if (bones.lFrontUpper) {
                e.set(0.4 * jb, 0, 0);
                q.setFromEuler(e); bones.lFrontUpper.quaternion.multiply(q);
            }
            if (bones.rRearUpper) {
                e.set(-0.3 * jb, 0, 0);
                q.setFromEuler(e); bones.rRearUpper.quaternion.multiply(q);
            }
            if (bones.lRearUpper) {
                e.set(-0.3 * jb, 0, 0);
                q.setFromEuler(e); bones.lRearUpper.quaternion.multiply(q);
            }
            if (bones.tail) {
                e.set(0.3 * jb, 0, 0);
                q.setFromEuler(e); bones.tail.quaternion.multiply(q);
            }
        }

        const combat = this.gameState.combat;

        // Determine target pose from combat state
        let newType = 'none';
        if (combat.isAttacking) newType = 'basic';
        else if (combat.isCharging) newType = 'charging';
        else if (combat.isChargedAttacking) newType = 'charged';
        else if (combat.isWhipAttacking) newType = 'ability';

        if (newType !== this._combatPoseType) {
            if (newType !== 'none') {
                this._combatSwingT = 0;
                if (newType === 'basic') this._combatSwingDir *= -1;
            }
            this._combatPoseType = newType;
        }
        this._combatPoseTarget = newType !== 'none' ? 1 : 0;

        // Smooth blend in/out
        const blendSpeed = this._combatPoseTarget > 0.5 ? 20 : 12;
        this._combatPoseBlend += (this._combatPoseTarget - this._combatPoseBlend) * Math.min(1, dt * blendSpeed);
        if (Math.abs(this._combatPoseBlend) < 0.001) { this._combatPoseBlend = 0; return; }

        // Swing timer — wolf attacks are faster, bear attacks are heavier
        const swingSpeeds = {
            basic:    isWolf ? 9.0 : 6.0,
            charged:  isWolf ? 6.0 : 4.5,
            charging: 1.0,
            ability:  isWolf ? 6.5 : 5.0
        };
        const swingSpeed = swingSpeeds[newType] || 1.0;
        this._combatSwingT = Math.min(1, this._combatSwingT + dt * swingSpeed);
        const t = this._combatSwingT;
        const blend = this._combatPoseBlend;
        const dir = this._combatSwingDir;

        // Easing curves
        const strike = t < 0.3 ? Math.sin(t / 0.3 * Math.PI * 0.5) : Math.cos((t - 0.3) / 0.7 * Math.PI * 0.5);
        const bell = Math.sin(t * Math.PI);
        const snap = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8; // fast snap then slow return

        if (newType === 'basic') {
            // ── CLAW SWIPE: alternating left/right front leg swipe + spine twist ──
            const s = strike * blend;
            const swipeIntensity = isWolf ? 1.0 : 0.75;

            // Spine lunges forward and twists toward swipe direction
            if (bones.spine) {
                e.set(s * 0.25 * swipeIntensity, -s * dir * 0.2, s * dir * 0.06);
                q.setFromEuler(e); bones.spine.quaternion.multiply(q);
            }
            if (bones.spine2) {
                e.set(s * 0.15 * swipeIntensity, -s * dir * 0.12, 0);
                q.setFromEuler(e); bones.spine2.quaternion.multiply(q);
            }
            // Neck and head snap toward target
            if (bones.neck) {
                e.set(s * 0.2, -s * dir * 0.1, 0);
                q.setFromEuler(e); bones.neck.quaternion.multiply(q);
            }
            if (bones.head) {
                e.set(s * 0.15, -s * dir * 0.08, s * dir * 0.05);
                q.setFromEuler(e); bones.head.quaternion.multiply(q);
            }
            // Jaw snaps open on strike peak
            if (bones.jaw) {
                e.set(snap * 0.35 * blend, 0, 0);
                q.setFromEuler(e); bones.jaw.quaternion.multiply(q);
            }
            // Lead front leg swipes outward
            const leadFront = dir > 0 ? bones.rFrontUpper : bones.lFrontUpper;
            const leadFrontLower = dir > 0 ? bones.rFrontLower : bones.lFrontLower;
            if (leadFront) {
                e.set(-s * 0.7 * swipeIntensity, -s * dir * 0.3, -s * dir * 0.25);
                q.setFromEuler(e); leadFront.quaternion.multiply(q);
            }
            if (leadFrontLower) {
                e.set(-s * 0.4 * swipeIntensity, 0, -s * dir * 0.15);
                q.setFromEuler(e); leadFrontLower.quaternion.multiply(q);
            }
            // Trail front leg braces
            const trailFront = dir > 0 ? bones.lFrontUpper : bones.rFrontUpper;
            if (trailFront) {
                e.set(s * 0.15, s * dir * 0.1, 0);
                q.setFromEuler(e); trailFront.quaternion.multiply(q);
            }
            // Rear legs push forward for lunge
            if (bones.rRearUpper) {
                e.set(-s * 0.12, 0, 0);
                q.setFromEuler(e); bones.rRearUpper.quaternion.multiply(q);
            }
            if (bones.lRearUpper) {
                e.set(-s * 0.12, 0, 0);
                q.setFromEuler(e); bones.lRearUpper.quaternion.multiply(q);
            }
            // Tail flicks with the swipe
            if (bones.tail) {
                e.set(0, s * dir * 0.3, s * dir * 0.15);
                q.setFromEuler(e); bones.tail.quaternion.multiply(q);
            }
            // Hips shift
            if (bones.hips) {
                e.set(s * 0.05, -s * dir * 0.04, 0);
                q.setFromEuler(e); bones.hips.quaternion.multiply(q);
            }

        } else if (newType === 'charging') {
            // ── CHARGE WINDUP: crouch low, coil spine, pull head back ──
            const chargeT = Math.min(1, t * 1.2);
            const coil = 1 - (1 - chargeT) * (1 - chargeT);
            const pulse = chargeT >= 1 ? Math.sin(this.animationTime * 14) * 0.03 : 0;
            const intensity = isWolf ? 1.0 : 0.8;

            // Spine arches down (crouching)
            if (bones.spine) {
                e.set((-coil * 0.2 + pulse) * blend * intensity, 0, 0);
                q.setFromEuler(e); bones.spine.quaternion.multiply(q);
            }
            if (bones.spine2) {
                e.set((-coil * 0.12 + pulse) * blend * intensity, 0, 0);
                q.setFromEuler(e); bones.spine2.quaternion.multiply(q);
            }
            // Head pulls back (cocking for strike)
            if (bones.neck) {
                e.set(coil * 0.25 * blend, 0, 0);
                q.setFromEuler(e); bones.neck.quaternion.multiply(q);
            }
            if (bones.head) {
                e.set(coil * 0.15 * blend, 0, 0);
                q.setFromEuler(e); bones.head.quaternion.multiply(q);
            }
            // Front legs bend (crouching)
            if (bones.rFrontUpper) {
                e.set(coil * 0.3 * blend, 0, coil * 0.1 * blend);
                q.setFromEuler(e); bones.rFrontUpper.quaternion.multiply(q);
            }
            if (bones.lFrontUpper) {
                e.set(coil * 0.3 * blend, 0, -coil * 0.1 * blend);
                q.setFromEuler(e); bones.lFrontUpper.quaternion.multiply(q);
            }
            // Rear legs coil
            if (bones.rRearUpper) {
                e.set(-coil * 0.2 * blend, 0, 0);
                q.setFromEuler(e); bones.rRearUpper.quaternion.multiply(q);
            }
            if (bones.lRearUpper) {
                e.set(-coil * 0.2 * blend, 0, 0);
                q.setFromEuler(e); bones.lRearUpper.quaternion.multiply(q);
            }
            // Tail tenses up
            if (bones.tail) {
                e.set(-coil * 0.2 * blend + pulse * 3, 0, 0);
                q.setFromEuler(e); bones.tail.quaternion.multiply(q);
            }

        } else if (newType === 'charged') {
            // ── POUNCE/MAUL: explosive forward lunge, both front legs slam down ──
            const s = strike * blend;
            const power = isWolf ? 1.0 : 1.2; // bear hits harder

            // Spine thrusts forward explosively
            if (bones.spine) {
                e.set(s * 0.35 * power, 0, 0);
                q.setFromEuler(e); bones.spine.quaternion.multiply(q);
            }
            if (bones.spine2) {
                e.set(s * 0.2 * power, 0, 0);
                q.setFromEuler(e); bones.spine2.quaternion.multiply(q);
            }
            // Head snaps forward (bite)
            if (bones.neck) {
                e.set(s * 0.3 * power, 0, 0);
                q.setFromEuler(e); bones.neck.quaternion.multiply(q);
            }
            if (bones.head) {
                e.set(s * 0.25 * power, 0, 0);
                q.setFromEuler(e); bones.head.quaternion.multiply(q);
            }
            // Jaw wide open then snaps shut
            if (bones.jaw) {
                const jawOpen = t < 0.25 ? t / 0.25 : Math.max(0, 1 - (t - 0.25) / 0.15);
                e.set(jawOpen * 0.5 * blend, 0, 0);
                q.setFromEuler(e); bones.jaw.quaternion.multiply(q);
            }
            // Both front legs slam down
            if (bones.rFrontUpper) {
                e.set(-s * 0.8 * power, 0, -s * 0.2);
                q.setFromEuler(e); bones.rFrontUpper.quaternion.multiply(q);
            }
            if (bones.rFrontLower) {
                e.set(-s * 0.5 * power, 0, 0);
                q.setFromEuler(e); bones.rFrontLower.quaternion.multiply(q);
            }
            if (bones.lFrontUpper) {
                e.set(-s * 0.8 * power, 0, s * 0.2);
                q.setFromEuler(e); bones.lFrontUpper.quaternion.multiply(q);
            }
            if (bones.lFrontLower) {
                e.set(-s * 0.5 * power, 0, 0);
                q.setFromEuler(e); bones.lFrontLower.quaternion.multiply(q);
            }
            // Rear legs push (launch)
            if (bones.rRearUpper) {
                e.set(-s * 0.25 * power, 0, 0);
                q.setFromEuler(e); bones.rRearUpper.quaternion.multiply(q);
            }
            if (bones.lRearUpper) {
                e.set(-s * 0.25 * power, 0, 0);
                q.setFromEuler(e); bones.lRearUpper.quaternion.multiply(q);
            }
            // Tail whips up
            if (bones.tail) {
                e.set(-s * 0.4, 0, 0);
                q.setFromEuler(e); bones.tail.quaternion.multiply(q);
            }
            // Hips drive forward
            if (bones.hips) {
                e.set(s * 0.1 * power, 0, 0);
                q.setFromEuler(e); bones.hips.quaternion.multiply(q);
            }

        } else if (newType === 'ability') {
            // ── HOWL/ROAR: rear up on hind legs, head thrown back, jaw open ──
            const s = strike * blend;
            const rearUp = bell * blend; // rises then falls
            const power = isWolf ? 0.9 : 1.1;

            // Spine rears upward
            if (bones.spine) {
                e.set(-rearUp * 0.4 * power, 0, 0);
                q.setFromEuler(e); bones.spine.quaternion.multiply(q);
            }
            if (bones.spine2) {
                e.set(-rearUp * 0.3 * power, 0, 0);
                q.setFromEuler(e); bones.spine2.quaternion.multiply(q);
            }
            // Neck and head throw back for howl/roar
            if (bones.neck) {
                e.set(-rearUp * 0.45 * power, 0, 0);
                q.setFromEuler(e); bones.neck.quaternion.multiply(q);
            }
            if (bones.head) {
                e.set(-rearUp * 0.35 * power, 0, 0);
                q.setFromEuler(e); bones.head.quaternion.multiply(q);
            }
            // Jaw wide open for the howl/roar
            if (bones.jaw) {
                e.set(rearUp * 0.55 * power, 0, 0);
                q.setFromEuler(e); bones.jaw.quaternion.multiply(q);
            }
            // Front legs lift off ground
            if (bones.rFrontUpper) {
                e.set(rearUp * 0.5, 0, rearUp * 0.15);
                q.setFromEuler(e); bones.rFrontUpper.quaternion.multiply(q);
            }
            if (bones.rFrontLower) {
                e.set(rearUp * 0.35, 0, 0);
                q.setFromEuler(e); bones.rFrontLower.quaternion.multiply(q);
            }
            if (bones.lFrontUpper) {
                e.set(rearUp * 0.5, 0, -rearUp * 0.15);
                q.setFromEuler(e); bones.lFrontUpper.quaternion.multiply(q);
            }
            if (bones.lFrontLower) {
                e.set(rearUp * 0.35, 0, 0);
                q.setFromEuler(e); bones.lFrontLower.quaternion.multiply(q);
            }
            // Rear legs brace for support
            if (bones.rRearUpper) {
                e.set(-rearUp * 0.15, 0, rearUp * 0.08);
                q.setFromEuler(e); bones.rRearUpper.quaternion.multiply(q);
            }
            if (bones.lRearUpper) {
                e.set(-rearUp * 0.15, 0, -rearUp * 0.08);
                q.setFromEuler(e); bones.lRearUpper.quaternion.multiply(q);
            }
            // Tail sweeps with the roar
            if (bones.tail) {
                e.set(-rearUp * 0.3, s * 0.4, 0);
                q.setFromEuler(e); bones.tail.quaternion.multiply(q);
            }
            // Hips tilt back
            if (bones.hips) {
                e.set(-rearUp * 0.12, 0, 0);
                q.setFromEuler(e); bones.hips.quaternion.multiply(q);
            }
        }
    }

    /**
     * Apply procedural animation for non-skeletal models
     */
    applyProceduralAnimation() {
        if (!this.mesh) return;

        const bobAmount = 0.05;
        const bobSpeed = this.currentAnimation === 'Run' ? 12 : 6;

        if (this.gameState.movement.isMoving && this.isGrounded) {
            const bob = Math.sin(this.animationTime * bobSpeed) * bobAmount;
            this.mesh.position.y = this.position.y + Math.abs(bob);
        } else if (this.currentAnimation === 'Idle') {
            const breath = Math.sin(this.animationTime * 2) * 0.02;
            this.mesh.position.y = this.position.y + breath;
        }
    }

    // Get position for raycasting
    getWorldPosition() {
        return this.position.clone();
    }

    // Get forward/aim direction from camera; never shoot downward (into the floor)
    getForwardDirection() {
        // When in air, use yaw/pitch only so aim stays consistent (no wobble from position.y change)
        if (!this.isGrounded) {
            const aim = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraYaw);
            const right = new THREE.Vector3(0, 1, 0).cross(aim).normalize();
            if (right.lengthSq() > 0.0001) aim.applyAxisAngle(right, this.cameraPitch);
            if (aim.y < 0) {
                aim.y = 0;
                if (aim.lengthSq() < 0.0001) aim.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraYaw);
                aim.normalize();
            }
            return aim;
        }
        const lookAtPoint = new THREE.Vector3(
            this.position.x,
            this.position.y + this.cameraLookAtHeight,
            this.position.z
        );
        const aim = lookAtPoint.clone().sub(this.camera.position).normalize();
        if (aim.y < 0) {
            aim.y = 0;
            if (aim.lengthSq() < 0.0001) {
                aim.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraYaw);
            }
            aim.normalize();
        }
        return aim;
    }

    // Get weapon world position for combat
    getWeaponPosition() {
        if (this.weapon) {
            const worldPos = new THREE.Vector3();
            this.weapon.getWorldPosition(worldPos);
            return worldPos;
        }
        return this.position.clone().add(new THREE.Vector3(0.5, 1, 0.5));
    }
}

