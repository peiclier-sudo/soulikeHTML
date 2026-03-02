/**
 * Environment System - Cyber training room with per-floor color themes.
 * Grid shader tints shift as the player climbs the tower.
 */

import * as THREE from 'three';

const ARENA_HALF = 28;
const WALL_HEIGHT = 14;

// Grid tuning
const LINE_WIDTH = 0.018;    // thick, visible grid lines
const LINE_ALPHA = 0.38;     // bright enough to read from any angle
const GRID_SPACING = 10.0;

// Per-floor theme: lineColor (RGB 0-1), fogColor (hex), bgColor (hex)
const FLOOR_THEMES = [
    { line: [1.0, 1.0, 1.0],  fog: 0x080c14, bg: 0x080c14 }, // 0: default white
    { line: [0.5, 0.7, 1.0],  fog: 0x060a18, bg: 0x060a18 }, // 1: cold blue
    { line: [1.0, 0.7, 0.3],  fog: 0x120a04, bg: 0x120a04 }, // 2: amber forge
    { line: [1.0, 0.2, 0.15], fog: 0x140606, bg: 0x140606 }, // 3: crimson
    { line: [0.7, 0.3, 1.0],  fog: 0x0a0614, bg: 0x0a0614 }, // 4+: void purple
];

function getTheme(floorNumber) {
    const i = Math.min(floorNumber, FLOOR_THEMES.length - 1);
    return FLOOR_THEMES[i];
}

function createGridMaterial(maskX, maskY, maskZ) {
    return new THREE.ShaderMaterial({
        uniforms: {
            gridSpacing: { value: GRID_SPACING },
            gridOffset:  { value: GRID_SPACING * 0.5 },
            lineWidth:   { value: LINE_WIDTH },
            lineAlpha:   { value: LINE_ALPHA },
            axisMask:    { value: new THREE.Vector3(maskX, maskY, maskZ) },
            lineColor:   { value: new THREE.Vector3(1, 1, 1) }
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
            uniform vec3 lineColor;
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
                vec3 col = lineColor * g * lineAlpha;
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
        this._gridMaterials = [];

        this.createFloor();
        this.createWalls();
        this.createCeiling();
    }

    createFloor() {
        const floorGeom = new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2, 1, 1);
        const mat = createGridMaterial(1, 0, 1);
        this._gridMaterials.push(mat);
        const floor = new THREE.Mesh(floorGeom, mat);
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
            const mat = createGridMaterial(s.mx, s.my, s.mz);
            this._gridMaterials.push(mat);
            const wall = new THREE.Mesh(wallGeom, mat);
            wall.position.set(s.px, s.py, s.pz);
            wall.rotation.y = s.ry;
            wall.receiveShadow = true;
            this.scene.add(wall);
        }

        wallGeom.dispose();
    }

    createCeiling() {
        const ceilGeom = new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2, 1, 1);
        const mat = createGridMaterial(1, 0, 1);
        this._gridMaterials.push(mat);
        const ceil = new THREE.Mesh(ceilGeom, mat);
        ceil.rotation.x = Math.PI / 2;
        ceil.position.y = WALL_HEIGHT + 0.04;
        this.scene.add(ceil);
    }

    setFloorTheme(floorNumber) {
        const theme = getTheme(floorNumber);
        const lc = theme.line;
        for (const mat of this._gridMaterials) {
            mat.uniforms.lineColor.value.set(lc[0], lc[1], lc[2]);
        }
        if (this.scene.background) this.scene.background.setHex(theme.bg);
        if (this.scene.fog) this.scene.fog.color.setHex(theme.fog);
    }

    update(deltaTime, elapsedTime) {}
}
