/**
 * Combat System - Handles attacks, combos, and hit detection
 */

import * as THREE from 'three';

export class CombatSystem {
    constructor(scene, character, gameState) {
        this.scene = scene;
        this.character = character;
        this.gameState = gameState;
        
        // Raycaster for hit detection
        this.raycaster = new THREE.Raycaster();
        
        // Attack properties
        this.attackDuration = 0.5;
        this.attackTimer = 0;
        this.comboWindow = 0.3;
        this.comboTimer = 0;
        this.maxCombo = 3;
        
        // Screen shake
        this.shakeIntensity = 0;
        this.shakeDuration = 0;
        this.originalCameraPosition = new THREE.Vector3();
        
        // Weapon trail
        this.weaponTrail = null;
        this.trailPositions = [];
        this.maxTrailLength = 10;
        
        // Create visual effects
        this.createWeaponTrail();
        
        // Enemies in scene (for hit detection)
        this.enemies = [];
    }
    
    createWeaponTrail() {
        const trailGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.maxTrailLength * 6);
        trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const trailMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        
        this.weaponTrail = new THREE.Mesh(trailGeometry, trailMaterial);
        this.weaponTrail.visible = false;
        this.scene.add(this.weaponTrail);
    }
    
    update(deltaTime, input) {
        // Update attack state
        if (this.gameState.combat.isAttacking) {
            this.updateAttack(deltaTime);
        } else {
            // Check for new attack
            if (input.attack && !this.gameState.combat.isDodging) {
                this.startAttack();
            }
        }
        
        // Update combo window
        if (this.comboTimer > 0) {
            this.comboTimer -= deltaTime;
            if (this.comboTimer <= 0) {
                this.gameState.combat.comboCount = 0;
            }
        }
        
        // Update screen shake
        this.updateScreenShake(deltaTime);
        
        // Update weapon trail
        this.updateWeaponTrail();
    }
    
    startAttack() {
        // Check if we can attack (stamina check)
        if (!this.gameState.startAttack()) {
            return;
        }
        
        // Increment combo or reset
        const now = performance.now() / 1000;
        const timeSinceLastAttack = now - this.gameState.combat.lastAttackTime;
        
        if (timeSinceLastAttack < this.comboWindow + this.attackDuration && 
            this.gameState.combat.comboCount < this.maxCombo) {
            this.gameState.combat.comboCount++;
        } else {
            this.gameState.combat.comboCount = 1;
        }
        
        this.gameState.combat.attackPhase = this.gameState.combat.comboCount;
        this.gameState.combat.lastAttackTime = now;
        this.attackTimer = this.attackDuration;
        this.comboTimer = this.comboWindow + this.attackDuration;
        
        // Show weapon trail
        if (this.weaponTrail) {
            this.weaponTrail.visible = true;
            this.trailPositions = [];
        }
        
        // Animate weapon
        this.animateAttack();
    }
    
    updateAttack(deltaTime) {
        this.attackTimer -= deltaTime;
        
        // Check for hits at attack midpoint
        if (this.attackTimer <= this.attackDuration * 0.6 && 
            this.attackTimer > this.attackDuration * 0.4) {
            this.checkHits();
        }
        
        if (this.attackTimer <= 0) {
            this.gameState.endAttack();
            
            // Hide weapon trail
            if (this.weaponTrail) {
                this.weaponTrail.visible = false;
            }
        }
    }
    
    animateAttack() {
        const weapon = this.character.weapon;
        if (!weapon) return;
        
        const phase = this.gameState.combat.attackPhase;
        
        // Different swing animations based on combo
        const swings = {
            1: { startAngle: -Math.PI / 4, endAngle: Math.PI / 2 },
            2: { startAngle: Math.PI / 2, endAngle: -Math.PI / 3 },
            3: { startAngle: -Math.PI / 2, endAngle: Math.PI / 2, isOverhead: true }
        };
        
        const swing = swings[phase] || swings[1];
        
        // Animate using requestAnimationFrame for smooth motion
        const startTime = performance.now();
        const duration = this.attackDuration * 1000;
        
        const animate = () => {
            if (!this.gameState.combat.isAttacking) return;
            
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Eased swing
            const eased = 1 - Math.pow(1 - progress, 3);
            const angle = swing.startAngle + (swing.endAngle - swing.startAngle) * eased;
            
            weapon.rotation.z = angle;
            
            if (swing.isOverhead) {
                weapon.rotation.x = -Math.PI / 4 + eased * Math.PI / 2;
            }
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Reset weapon position
                weapon.rotation.set(0, 0, -Math.PI / 4);
            }
        };

        animate();
    }

    checkHits() {
        const weaponPos = this.character.getWeaponPosition();
        const playerForward = this.character.getForwardDirection();
        const range = this.gameState.equipment.weapon.range;

        // Raycast in attack direction
        this.raycaster.set(weaponPos, playerForward);
        this.raycaster.far = range;

        const intersects = this.raycaster.intersectObjects(this.enemies, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            this.onHit(hit);
        }
    }

    onHit(hitInfo) {
        const baseDamage = this.gameState.equipment.weapon.damage;
        const comboMultiplier = 1 + (this.gameState.combat.comboCount - 1) * 0.2;
        const isCritical = Math.random() < 0.15;

        let damage = Math.floor(baseDamage * comboMultiplier);
        if (isCritical) {
            damage = Math.floor(damage * 1.5);
        }

        // Trigger visual feedback
        this.triggerScreenShake(isCritical ? 0.15 : 0.08);
        this.spawnHitParticles(hitInfo.point);
        this.spawnDamageNumber(hitInfo.point, damage, isCritical);

        // Apply damage to enemy
        if (hitInfo.object.userData.enemy) {
            hitInfo.object.userData.enemy.takeDamage(damage);
        }
    }

    triggerScreenShake(intensity) {
        this.shakeIntensity = intensity;
        this.shakeDuration = 0.15;
        this.originalCameraPosition.copy(this.character.camera.position);
    }

    updateScreenShake(deltaTime) {
        if (this.shakeDuration > 0) {
            this.shakeDuration -= deltaTime;

            const shake = this.shakeIntensity * (this.shakeDuration / 0.15);
            const offsetX = (Math.random() - 0.5) * 2 * shake;
            const offsetY = (Math.random() - 0.5) * 2 * shake;

            this.character.camera.position.x = this.originalCameraPosition.x + offsetX;
            this.character.camera.position.y = this.originalCameraPosition.y + offsetY;
        }
    }

    updateWeaponTrail() {
        if (!this.weaponTrail || !this.weaponTrail.visible) return;

        // Add current weapon position to trail
        const weaponPos = this.character.getWeaponPosition();
        this.trailPositions.push(weaponPos.clone());

        // Limit trail length
        while (this.trailPositions.length > this.maxTrailLength) {
            this.trailPositions.shift();
        }

        // Update trail geometry
        if (this.trailPositions.length >= 2) {
            const positions = this.weaponTrail.geometry.attributes.position.array;

            for (let i = 0; i < this.trailPositions.length - 1; i++) {
                const p1 = this.trailPositions[i];
                const p2 = this.trailPositions[i + 1];

                // Create quad vertices
                const idx = i * 6;
                positions[idx] = p1.x;
                positions[idx + 1] = p1.y;
                positions[idx + 2] = p1.z;
                positions[idx + 3] = p2.x;
                positions[idx + 4] = p2.y + 0.3;
                positions[idx + 5] = p2.z;
            }

            this.weaponTrail.geometry.attributes.position.needsUpdate = true;
        }
    }

    spawnHitParticles(position) {
        // This will be handled by ParticleSystem
        // Emit event for particle spawning
        this.gameState.emit('hitEffect', { position: position.clone() });
    }

    spawnDamageNumber(position, damage, isCritical) {
        // Emit event for UI to display damage number
        this.gameState.emit('damageNumber', {
            position: position.clone(),
            damage,
            isCritical
        });
    }

    addEnemy(enemy) {
        this.enemies.push(enemy);
    }

    removeEnemy(enemy) {
        const index = this.enemies.indexOf(enemy);
        if (index > -1) {
            this.enemies.splice(index, 1);
        }
    }
}

