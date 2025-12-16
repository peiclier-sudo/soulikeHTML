/**
 * Particle System - Object-pooled particle effects
 */

import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        
        // Particle pools
        this.pools = {
            spark: [],
            smoke: [],
            ember: []
        };
        
        // Active particles
        this.activeParticles = [];
        
        // Quality settings
        this.qualityMultiplier = 1;
        
        // Initialize pools
        this.initializePools();
    }
    
    initializePools() {
        // Pre-create spark particles
        for (let i = 0; i < 50; i++) {
            this.pools.spark.push(this.createSparkParticle());
        }
        
        // Pre-create smoke particles
        for (let i = 0; i < 30; i++) {
            this.pools.smoke.push(this.createSmokeParticle());
        }
        
        // Pre-create ember particles
        for (let i = 0; i < 40; i++) {
            this.pools.ember.push(this.createEmberParticle());
        }
    }
    
    createSparkParticle() {
        const geometry = new THREE.PlaneGeometry(0.1, 0.1);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffaa44,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        
        const particle = new THREE.Mesh(geometry, material);
        particle.visible = false;
        particle.userData = {
            type: 'spark',
            velocity: new THREE.Vector3(),
            lifetime: 0,
            maxLifetime: 0.5,
            active: false
        };
        
        this.scene.add(particle);
        return particle;
    }
    
    createSmokeParticle() {
        const geometry = new THREE.PlaneGeometry(0.3, 0.3);
        const material = new THREE.MeshBasicMaterial({
            color: 0x888888,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        
        const particle = new THREE.Mesh(geometry, material);
        particle.visible = false;
        particle.userData = {
            type: 'smoke',
            velocity: new THREE.Vector3(),
            lifetime: 0,
            maxLifetime: 1.5,
            active: false
        };
        
        this.scene.add(particle);
        return particle;
    }
    
    createEmberParticle() {
        const geometry = new THREE.SphereGeometry(0.02, 4, 4);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 1
        });
        
        const particle = new THREE.Mesh(geometry, material);
        particle.visible = false;
        particle.userData = {
            type: 'ember',
            velocity: new THREE.Vector3(),
            lifetime: 0,
            maxLifetime: 2,
            active: false
        };
        
        this.scene.add(particle);
        return particle;
    }
    
    getFromPool(type) {
        const pool = this.pools[type];
        if (!pool) return null;
        
        for (const particle of pool) {
            if (!particle.userData.active) {
                return particle;
            }
        }
        return null;
    }
    
    emitSparks(position, count = 10) {
        const actualCount = Math.floor(count * this.qualityMultiplier);
        
        for (let i = 0; i < actualCount; i++) {
            const particle = this.getFromPool('spark');
            if (!particle) continue;
            
            particle.position.copy(position);
            particle.userData.active = true;
            particle.userData.lifetime = 0;
            particle.userData.maxLifetime = 0.3 + Math.random() * 0.3;
            particle.visible = true;
            
            // Random velocity
            particle.userData.velocity.set(
                (Math.random() - 0.5) * 5,
                Math.random() * 3 + 2,
                (Math.random() - 0.5) * 5
            );
            
            particle.material.opacity = 1;
            this.activeParticles.push(particle);
        }
    }
    
    emitSmoke(position, count = 5) {
        const actualCount = Math.floor(count * this.qualityMultiplier);
        
        for (let i = 0; i < actualCount; i++) {
            const particle = this.getFromPool('smoke');
            if (!particle) continue;
            
            particle.position.copy(position);
            particle.userData.active = true;
            particle.userData.lifetime = 0;
            particle.visible = true;
            
            particle.userData.velocity.set(
                (Math.random() - 0.5) * 0.5,
                Math.random() * 1 + 0.5,
                (Math.random() - 0.5) * 0.5
            );
            
            particle.material.opacity = 0.5;
            particle.scale.setScalar(0.3 + Math.random() * 0.3);
            this.activeParticles.push(particle);
        }
    }

    emitEmbers(position, count = 8) {
        const actualCount = Math.floor(count * this.qualityMultiplier);

        for (let i = 0; i < actualCount; i++) {
            const particle = this.getFromPool('ember');
            if (!particle) continue;

            particle.position.copy(position);
            particle.position.x += (Math.random() - 0.5) * 2;
            particle.position.z += (Math.random() - 0.5) * 2;
            particle.userData.active = true;
            particle.userData.lifetime = 0;
            particle.visible = true;

            particle.userData.velocity.set(
                (Math.random() - 0.5) * 0.3,
                Math.random() * 2 + 1,
                (Math.random() - 0.5) * 0.3
            );

            particle.material.opacity = 1;
            this.activeParticles.push(particle);
        }
    }

    update(deltaTime) {
        // Update active particles
        for (let i = this.activeParticles.length - 1; i >= 0; i--) {
            const particle = this.activeParticles[i];
            const data = particle.userData;

            data.lifetime += deltaTime;

            if (data.lifetime >= data.maxLifetime) {
                // Return to pool
                particle.visible = false;
                data.active = false;
                this.activeParticles.splice(i, 1);
                continue;
            }

            // Update position
            particle.position.add(
                data.velocity.clone().multiplyScalar(deltaTime)
            );

            // Apply gravity for sparks
            if (data.type === 'spark') {
                data.velocity.y -= 10 * deltaTime;
            }

            // Slow down smoke and rise
            if (data.type === 'smoke') {
                data.velocity.multiplyScalar(0.98);
                particle.scale.addScalar(deltaTime * 0.5);
            }

            // Flicker embers
            if (data.type === 'ember') {
                data.velocity.y -= 0.5 * deltaTime;
                particle.material.opacity = 1 - (data.lifetime / data.maxLifetime) * 0.5;
            }

            // Fade out based on lifetime
            const lifeRatio = data.lifetime / data.maxLifetime;
            particle.material.opacity *= (1 - lifeRatio * 0.5);

            // Billboard effect (face camera)
            particle.lookAt(particle.position.clone().add(new THREE.Vector3(0, 0, 1)));
        }
    }

    setQuality(quality) {
        const multipliers = {
            low: 0.3,
            medium: 0.7,
            high: 1.0
        };
        this.qualityMultiplier = multipliers[quality] || 0.7;
    }

    // Emit hit effect (sparks + smoke)
    emitHitEffect(position) {
        this.emitSparks(position, 15);
        this.emitSmoke(position, 3);
    }

    // Emit fire from torches
    emitTorchFire(position) {
        this.emitEmbers(position, 2);
    }

    // Clear all particles
    clear() {
        for (const particle of this.activeParticles) {
            particle.visible = false;
            particle.userData.active = false;
        }
        this.activeParticles = [];
    }
}

