/**
 * Enemy Base Class - AI-controlled enemies
 */

import * as THREE from 'three';

export class Enemy {
    constructor(scene, position, config = {}) {
        this.scene = scene;
        this.position = position.clone();
        
        // Stats
        this.health = config.health || 100;
        this.maxHealth = this.health;
        this.damage = config.damage || 15;
        this.speed = config.speed || 2;
        this.attackRange = config.attackRange || 2;
        this.detectionRange = config.detectionRange || 15;
        
        // State
        this.state = 'idle'; // idle, patrol, chase, attack, stagger, dead
        this.isAlive = true;
        this.staggerTimer = 0;
        this.attackCooldown = 0;
        
        // AI
        this.target = null;
        this.patrolPoints = [];
        this.currentPatrolIndex = 0;
        
        // Create mesh
        this.createMesh(config);
    }
    
    createMesh(config) {
        const group = new THREE.Group();
        
        // Body
        const bodyGeom = new THREE.CylinderGeometry(0.4, 0.5, 1.5, 8);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: config.color || 0x2a2a2a,
            roughness: 0.8,
            metalness: 0.3
        });
        const body = new THREE.Mesh(bodyGeom, bodyMat);
        body.position.y = 0.75;
        group.add(body);
        
        // Head
        const headGeom = new THREE.SphereGeometry(0.25, 16, 16);
        const headMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.9
        });
        const head = new THREE.Mesh(headGeom, headMat);
        head.position.y = 1.75;
        group.add(head);
        
        // Eyes (glowing)
        const eyeGeom = new THREE.SphereGeometry(0.05, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({
            color: 0xff0000
        });
        
        const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
        leftEye.position.set(-0.1, 1.8, 0.2);
        group.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
        rightEye.position.set(0.1, 1.8, 0.2);
        group.add(rightEye);
        
        // Weapon (simple sword)
        const weaponGeom = new THREE.BoxGeometry(0.05, 0.8, 0.02);
        const weaponMat = new THREE.MeshStandardMaterial({
            color: 0x6a6a6a,
            metalness: 0.9
        });
        const weapon = new THREE.Mesh(weaponGeom, weaponMat);
        weapon.position.set(0.5, 0.8, 0);
        weapon.rotation.z = -Math.PI / 4;
        group.add(weapon);
        
        this.mesh = group;
        this.mesh.position.copy(this.position);
        this.mesh.userData.enemy = this;
        
        this.mesh.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        this.scene.add(this.mesh);
    }
    
    update(deltaTime, playerPosition) {
        if (!this.isAlive) return;
        
        // Update cooldowns
        if (this.staggerTimer > 0) {
            this.staggerTimer -= deltaTime;
            return;
        }
        
        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaTime;
        }
        
        // AI behavior
        const distanceToPlayer = this.position.distanceTo(playerPosition);
        
        if (distanceToPlayer <= this.attackRange && this.attackCooldown <= 0) {
            this.attack();
        } else if (distanceToPlayer <= this.detectionRange) {
            this.chase(playerPosition, deltaTime);
        } else {
            this.patrol(deltaTime);
        }
        
        // Update mesh position
        this.mesh.position.copy(this.position);
    }
    
    chase(targetPosition, deltaTime) {
        this.state = 'chase';
        
        const direction = new THREE.Vector3()
            .subVectors(targetPosition, this.position)
            .normalize();
        
        direction.y = 0; // Stay on ground
        
        this.position.add(direction.multiplyScalar(this.speed * deltaTime));
        
        // Face target
        this.mesh.lookAt(targetPosition.x, this.mesh.position.y, targetPosition.z);
    }
    
    patrol(deltaTime) {
        this.state = 'patrol';
        // Simple idle behavior - could add patrol points
    }
    
    attack() {
        this.state = 'attack';
        this.attackCooldown = 1.5;
        // For ultimate bar: 6 charged or 12 basic hits to fill
        this.attackType = Math.random() < 0.35 ? 'charged' : 'basic';
        return this.damage;
    }
    
    takeDamage(amount) {
        this.health -= amount;
        this.staggerTimer = 0.3;
        this.state = 'stagger';

        if (!this._hitFlashMeshes) {
            this._hitFlashMeshes = [];
            this._hitFlashOriginals = [];
            this.mesh.traverse(child => {
                if (child.isMesh && child.material && child.material.color) {
                    this._hitFlashMeshes.push(child);
                    this._hitFlashOriginals.push(child.material.color.clone());
                }
            });
        }
        const flashColor = this.isBoss ? 0xf8f8ff : 0xff0000;
        const meshes = this._hitFlashMeshes;
        const originals = this._hitFlashOriginals;
        for (let i = 0; i < meshes.length; i++) {
            meshes[i].material.color.setHex(flashColor);
        }
        if (this._hitFlashTimer) clearTimeout(this._hitFlashTimer);
        this._hitFlashTimer = setTimeout(() => {
            for (let i = 0; i < meshes.length; i++) {
                meshes[i].material.color.copy(originals[i]);
            }
            this._hitFlashTimer = null;
        }, 100);

        if (this.health <= 0) {
            this.die();
        }
    }
    
    die() {
        this.isAlive = false;
        this.state = 'dead';
        
        // Death animation - fall over
        const startRotation = this.mesh.rotation.x;
        const animate = () => {
            if (this.mesh.rotation.x < Math.PI / 2) {
                this.mesh.rotation.x += 0.1;
                requestAnimationFrame(animate);
            } else {
                // Remove after delay
                setTimeout(() => {
                    this.scene.remove(this.mesh);
                }, 3000);
            }
        };
        animate();
    }
}

