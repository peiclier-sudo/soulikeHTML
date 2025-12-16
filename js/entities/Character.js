/**
 * Character Controller - Player character with movement and animations
 * Uses real GLTF model with skeletal animations
 */

import * as THREE from 'three';

export class Character {
    constructor(scene, camera, assetLoader, gameState) {
        this.scene = scene;
        this.camera = camera;
        this.assetLoader = assetLoader;
        this.gameState = gameState;

        // Character properties
        this.position = new THREE.Vector3(0, 0, 5);
        this.rotation = new THREE.Euler(0, 0, 0);
        this.velocity = new THREE.Vector3();

        // Movement settings
        this.walkSpeed = 4;
        this.runSpeed = 8;
        this.dodgeSpeed = 15;
        this.jumpForce = 8;
        this.gravity = -25;

        // Third-person camera settings
        this.cameraDistance = 2;        // Distance behind character
        this.cameraHeight = 0.8;        // Height above character
        this.cameraLookAtHeight = 0.4;  // Look at point on character
        this.cameraPitch = 0.3;         // Initial pitch (looking slightly down)
        this.cameraYaw = 0;
        this.pitchLimit = Math.PI / 3;  // Limit vertical rotation

        // State
        this.isGrounded = true;
        this.isDodging = false;
        this.dodgeTimer = 0;
        this.dodgeDuration = 0.4;
        this.dodgeCooldown = 0;
        this.dodgeDirection = new THREE.Vector3();

        // Animation system
        this.mixer = null;
        this.actions = {};
        this.currentAction = null;
        this.currentAnimation = 'Idle';
        this.animationTime = 0;
        this.useProceduralAnimation = false;

        // Create character mesh
        this.createCharacterMesh();

        // Create weapon
        this.createWeapon();
    }

    createCharacterMesh() {
        // Get the loaded character model
        const originalModel = this.assetLoader.getModel('character');

        if (originalModel) {
            // Use the original model directly (don't clone for skeletal animation)
            this.mesh = originalModel;
            this.mesh.position.copy(this.position);

            // Enable shadows
            this.mesh.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

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
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a4a5a, metalness: 0.5 });
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
        this.scene.add(this.mesh);

        // Use procedural animation for fallback
        this.useProceduralAnimation = true;
        console.log('Fallback character mesh created');
    }

    /**
     * Setup the Three.js AnimationMixer and animation actions
     */
    setupAnimations() {
        const animationData = this.assetLoader.assets.animations.character;

        if (!animationData) {
            console.warn('No animation data available for character');
            this.useProceduralAnimation = true;
            return;
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
                if (lowerName.includes('run')) this.actions['Run'] = action;

                // Configure action defaults
                action.setEffectiveTimeScale(1);
                action.setEffectiveWeight(1);
            });

            // Start with idle animation (try various names)
            const idleAction = this.actions['Idle'] ||
                              this.actions['idle'] ||
                              Object.values(this.actions)[0];
            if (idleAction) {
                this.currentAction = idleAction;
                this.currentAction.play();
            }

            this.useProceduralAnimation = false;
            console.log('Skeletal animation system initialized:', Object.keys(this.actions));
        } else {
            // Fallback to procedural animation for non-rigged models
            this.useProceduralAnimation = true;
            console.log('Using procedural animation (no skeletal clips found)');
        }
    }

    /**
     * Fade to a new animation with smooth crossfade
     */
    fadeToAction(actionName, duration = 0.3) {
        const newAction = this.actions[actionName];

        if (!newAction) {
            // Fallback for animations that don't exist
            return;
        }

        if (this.currentAction === newAction) {
            return;
        }

        // Crossfade from current to new action
        if (this.currentAction) {
            this.currentAction.fadeOut(duration);
        }

        newAction
            .reset()
            .setEffectiveTimeScale(1)
            .setEffectiveWeight(1)
            .fadeIn(duration)
            .play();

        this.currentAction = newAction;
    }

    createWeapon() {
        // Don't create weapon if mesh doesn't exist
        if (!this.mesh) {
            console.warn('Cannot create weapon - no character mesh');
            return;
        }

        this.weapon = this.assetLoader.getModel('claymore');

        if (this.weapon) {
            // Find a suitable hand bone to attach the weapon
            // Check for various bone naming conventions
            let handBone = null;
            const handBoneNames = ['hand_r', 'hand.r', 'righthand', 'rhand', 'hand_right', 'handright'];

            // First, log all bones to help debug
            console.log('Looking for hand bone in character mesh...');
            this.mesh.traverse(child => {
                if (child.isBone) {
                    console.log('Found bone:', child.name);
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
                console.log('Attaching weapon to bone:', handBone.name);
                // Clone the weapon to avoid issues
                this.weapon = this.weapon.clone();
                // Position and orient for KayKit style models
                this.weapon.position.set(0, 0, 0);
                this.weapon.rotation.set(0, 0, 0);
                this.weapon.scale.setScalar(1.0);
                handBone.add(this.weapon);
            } else {
                console.log('No hand bone found, attaching weapon to mesh at offset');
                // Clone and attach directly to mesh
                this.weapon = this.weapon.clone();
                this.weapon.position.set(0.5, 0.8, 0);
                this.weapon.rotation.set(0, 0, Math.PI / 4);
                this.weapon.scale.setScalar(1.0);
                this.mesh.add(this.weapon);
            }
        }
    }
    
    update(deltaTime, input, mouseSensitivity) {
        // Update camera rotation
        this.updateCamera(input, mouseSensitivity);
        
        // Handle dodge
        if (this.isDodging) {
            this.updateDodge(deltaTime);
        } else {
            // Normal movement
            this.updateMovement(deltaTime, input);
        }
        
        // Apply gravity and update position
        this.applyPhysics(deltaTime);
        
        // Update game state
        this.updateGameState(deltaTime);
        
        // Update mesh position
        this.updateMesh();
        
        // Update animation
        this.updateAnimation(deltaTime, input);
    }
    
    updateCamera(input, sensitivity) {
        const lookSensitivity = 0.002 * sensitivity;

        // Update camera angles based on mouse input
        this.cameraYaw -= input.mouseDeltaX * lookSensitivity;
        this.cameraPitch += input.mouseDeltaY * lookSensitivity;

        // Clamp pitch (prevent camera going too high or too low)
        this.cameraPitch = Math.max(-0.5, Math.min(this.pitchLimit, this.cameraPitch));

        // Calculate camera position behind and above character
        // Camera orbits around the character based on yaw and pitch
        const horizontalDistance = this.cameraDistance * Math.cos(this.cameraPitch);
        const verticalDistance = this.cameraDistance * Math.sin(this.cameraPitch) + this.cameraHeight;

        const cameraX = this.position.x + horizontalDistance * Math.sin(this.cameraYaw);
        const cameraY = this.position.y + verticalDistance;
        const cameraZ = this.position.z + horizontalDistance * Math.cos(this.cameraYaw);

        this.camera.position.set(cameraX, cameraY, cameraZ);

        // Look at the character (slightly above ground level)
        const lookAtPoint = new THREE.Vector3(
            this.position.x,
            this.position.y + this.cameraLookAtHeight,
            this.position.z
        );
        this.camera.lookAt(lookAtPoint);
    }
    
    updateMovement(deltaTime, input) {
        const moveVector = new THREE.Vector3();
        
        // Get camera-relative movement direction
        const forward = new THREE.Vector3(0, 0, -1);
        const right = new THREE.Vector3(1, 0, 0);
        
        forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraYaw);
        right.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraYaw);
        
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
            
            // Determine speed (walk or run)
            const isRunning = input.run && this.gameState.player.stamina > 5;
            const speed = isRunning ? this.runSpeed : this.walkSpeed;
            
            // Drain stamina while running
            if (isRunning) {
                this.gameState.useStamina(10 * deltaTime);
            }
            
            this.velocity.x = moveVector.x * speed;
            this.velocity.z = moveVector.z * speed;
            
            // Rotate character to face movement direction
            this.rotation.y = Math.atan2(moveVector.x, moveVector.z);
        } else {
            // Deceleration
            this.velocity.x *= 0.9;
            this.velocity.z *= 0.9;
        }

        // Handle dodge initiation
        if (input.dodge && this.isGrounded && this.dodgeCooldown <= 0 &&
            this.gameState.useStamina(20)) {
            this.startDodge(moveVector.length() > 0 ? moveVector : forward.multiplyScalar(-1));
        }

        // Handle jump
        if (input.jump && this.isGrounded && !this.isDodging) {
            this.velocity.y = this.jumpForce;
            this.isGrounded = false;
        }
    }

    startDodge(direction) {
        this.isDodging = true;
        this.dodgeTimer = this.dodgeDuration;
        this.dodgeDirection.copy(direction).normalize();
        this.gameState.combat.isDodging = true;
        this.gameState.combat.invulnerable = true;
    }

    updateDodge(deltaTime) {
        this.dodgeTimer -= deltaTime;

        if (this.dodgeTimer <= 0) {
            this.isDodging = false;
            this.dodgeCooldown = 0.5;
            this.gameState.combat.isDodging = false;
            this.gameState.combat.invulnerable = false;
        } else {
            // Apply dodge movement
            const dodgeProgress = 1 - (this.dodgeTimer / this.dodgeDuration);
            const dodgeSpeedMultiplier = Math.sin(dodgeProgress * Math.PI); // Smooth curve

            this.velocity.x = this.dodgeDirection.x * this.dodgeSpeed * dodgeSpeedMultiplier;
            this.velocity.z = this.dodgeDirection.z * this.dodgeSpeed * dodgeSpeedMultiplier;
        }
    }

    applyPhysics(deltaTime) {
        // Apply gravity
        if (!this.isGrounded) {
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

        // Boundary constraints (keep in arena)
        const boundary = 23;
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

        // Update cooldowns
        if (this.dodgeCooldown > 0) {
            this.dodgeCooldown -= deltaTime;
        }
    }

    updateMesh() {
        if (this.mesh) {
            this.mesh.position.copy(this.position);
            this.mesh.rotation.y = this.rotation.y;

            // During dodge, we can tilt the model slightly instead of full rotation
            // since skeletal animation doesn't support arbitrary mesh rotation well
            if (this.isDodging) {
                const rollProgress = 1 - (this.dodgeTimer / this.dodgeDuration);
                // Slight forward lean during dodge
                this.mesh.rotation.x = Math.sin(rollProgress * Math.PI) * 0.3;
            } else {
                this.mesh.rotation.x = 0;
            }
        }
    }

    updateAnimation(deltaTime, input) {
        this.animationTime += deltaTime;

        // Update the animation mixer for skeletal animation
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }

        // Determine which animation to play based on state
        let targetAnimation = 'Idle';

        if (this.isDodging) {
            targetAnimation = 'Run';
        } else if (this.gameState.combat.isAttacking) {
            targetAnimation = 'Run';
        } else if (!this.isGrounded) {
            targetAnimation = 'Idle';
        } else if (this.gameState.movement.isMoving) {
            const isRunning = input.run && this.gameState.player.stamina > 5;
            targetAnimation = isRunning ? 'Run' : 'Walk';
        }

        // Handle animation transition
        if (targetAnimation !== this.currentAnimation) {
            if (!this.useProceduralAnimation && this.mixer) {
                this.fadeToAction(targetAnimation, 0.2);
            }
            this.currentAnimation = targetAnimation;
            this.animationTime = 0;
        }

        // Adjust animation speed for skeletal animation
        if (!this.useProceduralAnimation) {
            this.updateAnimationSpeed();
        } else {
            // Apply procedural animation for non-skeletal models
            this.applyProceduralAnimation();
        }
    }

    /**
     * Adjust animation playback speed based on movement state
     */
    updateAnimationSpeed() {
        if (!this.currentAction) return;

        if (this.isDodging) {
            this.currentAction.setEffectiveTimeScale(2.0);
        } else if (this.gameState.combat.isAttacking) {
            this.currentAction.setEffectiveTimeScale(1.5);
        } else {
            this.currentAction.setEffectiveTimeScale(1.0);
        }
    }

    /**
     * Apply procedural animation for non-skeletal models
     */
    applyProceduralAnimation() {
        if (!this.mesh) return;

        const bobAmount = 0.05;
        const bobSpeed = this.currentAnimation === 'Run' ? 12 : 6;

        if (this.gameState.movement.isMoving && this.isGrounded && !this.isDodging) {
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

    // Get forward direction
    getForwardDirection() {
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraYaw);
        return forward;
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

