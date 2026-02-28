/**
 * Environment System - Cyber training room (black/white grid shader)
 */

import * as THREE from 'three';

const ARENA_HALF = 28;
const WALL_HEIGHT = 14;
const WALL_THICKNESS = 1.5;

// mask: vec3 — set 1.0 for axes that should draw lines, 0.0 to skip.
function createGridMaterial(maskX, maskY, maskZ) {
    return new THREE.ShaderMaterial({
        uniforms: {
            gridSpacing: { value: 10.0 },
            gridOffset: { value: 5.0 },
            lineWidth: { value: 0.002 },
            lineAlpha: { value: 0.24 },
            axisMask: { value: new THREE.Vector3(maskX, maskY, maskZ) }
        },
        vertexShader: `
            varying vec3 vWorldPos;
            void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorldPos = wp.xyz;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
        fragmentShader: `
            uniform float gridSpacing;
            uniform float gridOffset;
            uniform float lineWidth;
            uniform float lineAlpha;
            uniform vec3 axisMask;
            varying vec3 vWorldPos;

            float grid(float coord) {
                float c = coord + gridOffset;
                float d = abs(mod(c + gridSpacing * 0.5, gridSpacing) - gridSpacing * 0.5);
                float aa = fwidth(coord) * 1.5;
                return 1.0 - smoothstep(lineWidth - aa, lineWidth + aa, d);
            }

            void main() {
                float gx = grid(vWorldPos.x) * axisMask.x;
                float gy = grid(vWorldPos.y) * axisMask.y;
                float gz = grid(vWorldPos.z) * axisMask.z;
                float g = max(max(gx, gy), gz);
                vec3 col = vec3(g * lineAlpha);
                gl_FragColor = vec4(col, 1.0);
            }
        `,
        side: THREE.FrontSide
    });
}

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
        const floor = new THREE.Mesh(floorGeom, createGridMaterial(1, 0, 1));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.04;
        floor.receiveShadow = true;
        this.scene.add(floor);
    }

    createWalls() {
        const wallW = ARENA_HALF * 2;
        const wallGeom = new THREE.PlaneGeometry(wallW, WALL_HEIGHT);

        const inset = 0.05;
        const sides = [
            { px: 0, py: WALL_HEIGHT / 2, pz: -ARENA_HALF + inset, ry: 0, mx: 1, my: 1, mz: 0 },
            { px: 0, py: WALL_HEIGHT / 2, pz: ARENA_HALF - inset, ry: Math.PI, mx: 1, my: 1, mz: 0 },
            { px: -ARENA_HALF + inset, py: WALL_HEIGHT / 2, pz: 0, ry: Math.PI / 2, mx: 0, my: 1, mz: 1 },
            { px: ARENA_HALF - inset, py: WALL_HEIGHT / 2, pz: 0, ry: -Math.PI / 2, mx: 0, my: 1, mz: 1 }
        ];

        for (const s of sides) {
            const wall = new THREE.Mesh(wallGeom, createGridMaterial(s.mx, s.my, s.mz));
            wall.position.set(s.px, s.py, s.pz);
            wall.rotation.y = s.ry;
            wall.receiveShadow = true;
            this.scene.add(wall);
        }

        wallGeom.dispose();
    }

    createCeiling() {
        const ceilGeom = new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2, 1, 1);
        const ceil = new THREE.Mesh(ceilGeom, createGridMaterial(1, 0, 1));
        ceil.rotation.x = Math.PI / 2;
        ceil.position.y = WALL_HEIGHT + 0.04;
        this.scene.add(ceil);
    }

    update(deltaTime, elapsedTime) {}
}
