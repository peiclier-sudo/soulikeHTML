/**
 * Environment System - Enclosed dark arena with high walls
 */

import * as THREE from 'three';

const ARENA_HALF = 20;
const WALL_HEIGHT = 14;
const WALL_THICKNESS = 1.5;

export class Environment {
    constructor(scene, assetLoader) {
        this.scene = scene;
        this.assetLoader = assetLoader;

        this.createFloor();
        this.createWalls();
        this.createCeiling();
    }

    createFloor() {
        const floorGeom = new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2, 1, 1);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x0a0a0e,
            roughness: 0.92,
            metalness: 0.08
        });
        const floor = new THREE.Mesh(floorGeom, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);
    }

    createWalls() {
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x12111a,
            roughness: 0.95,
            metalness: 0.05
        });

        const trimMat = new THREE.MeshStandardMaterial({
            color: 0x1a1520,
            roughness: 0.8,
            metalness: 0.2
        });

        const sides = [
            { px: 0, pz: -ARENA_HALF, ry: 0 },
            { px: 0, pz: ARENA_HALF, ry: Math.PI },
            { px: -ARENA_HALF, pz: 0, ry: Math.PI / 2 },
            { px: ARENA_HALF, pz: 0, ry: -Math.PI / 2 }
        ];

        const wallGeom = new THREE.BoxGeometry(ARENA_HALF * 2 + WALL_THICKNESS * 2, WALL_HEIGHT, WALL_THICKNESS);
        const trimGeom = new THREE.BoxGeometry(ARENA_HALF * 2 + WALL_THICKNESS * 2, 0.4, WALL_THICKNESS + 0.1);

        for (const s of sides) {
            const wall = new THREE.Mesh(wallGeom, wallMat);
            wall.position.set(s.px, WALL_HEIGHT / 2, s.pz);
            wall.rotation.y = s.ry;
            wall.receiveShadow = true;
            this.scene.add(wall);

            const trim = new THREE.Mesh(trimGeom, trimMat);
            trim.position.set(s.px, WALL_HEIGHT, s.pz);
            trim.rotation.y = s.ry;
            this.scene.add(trim);
        }

        wallGeom.dispose();
        trimGeom.dispose();
    }

    createCeiling() {
        const ceilGeom = new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2, 1, 1);
        const ceilMat = new THREE.MeshStandardMaterial({
            color: 0x060510,
            roughness: 1.0,
            metalness: 0.0
        });
        const ceil = new THREE.Mesh(ceilGeom, ceilMat);
        ceil.rotation.x = Math.PI / 2;
        ceil.position.y = WALL_HEIGHT;
        this.scene.add(ceil);
    }

    update(deltaTime, elapsedTime) {}
}
