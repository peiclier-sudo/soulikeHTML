/**
 * Ice Shader - Crystalline ice material for Frost Mage projectiles and effects.
 * Blue-white with internal refraction-like sparkle and cold rim glow.
 *
 * Two quality tiers:
 *   FULL  – 3 FBM + 2 noise calls, vertex displacement   (GPU-heavy)
 *   FAST  – 0 noise, sin/cos approximation, same palette  (10-20x cheaper)
 */

import * as THREE from 'three';

// ─── FULL-QUALITY shader (unchanged) ─────────────────────────────

const fullVertexShader = /* glsl */ `
    uniform float time;
    uniform float displaceAmount;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec2 vUv;
    varying float vFresnel;

    float hash(vec3 p) {
        return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
    }
    float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    float fbm(vec3 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 3; i++) { v += a * noise3(p); p *= 2.0; a *= 0.5; }
        return v;
    }

    void main() {
        vNormal = normalize(normalMatrix * normal);
        vUv = uv;
        vec3 pos = position;

        if (displaceAmount > 0.001) {
            vec3 q = pos * 4.0 + vec3(time * 0.8, time * 1.2, time * 0.6);
            float n = fbm(q) - 0.5;
            float spike = smoothstep(0.6, 0.9, noise3(pos * 10.0 + time * 2.0)) * 0.3;
            pos += normal * (n * 0.08 + spike * 0.12) * displaceAmount;
        }

        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPosition = worldPos.xyz;
        vec3 viewDir = normalize(cameraPosition - worldPos.xyz);
        vFresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.5);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
`;

const fullFragmentShader = /* glsl */ `
    uniform float time;
    uniform float alpha;
    uniform float coreBrightness;
    uniform float iceSpeed;
    uniform float isCharged;
    uniform float layerScale;
    uniform float rimPower;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec2 vUv;
    varying float vFresnel;

    float hash(vec3 p) {
        return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
    }
    float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    float fbm(vec3 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 3; i++) { v += a * noise3(p); p *= 2.1; a *= 0.48; }
        return v;
    }

    void main() {
        float t = time * iceSpeed;
        vec3 p = vWorldPosition * layerScale;

        float n1 = fbm(p * 3.0 + vec3(t * 0.3, t * 0.5, 0.0));
        float n2 = fbm(p * 6.0 + vec3(0.0, t * 0.4, t * 0.6));

        float crystal = smoothstep(0.35, 0.55, n1) * smoothstep(0.3, 0.5, n2);
        float facets = smoothstep(0.55, 0.75, n2) * 0.8;

        float sparkle = smoothstep(0.8, 0.9, noise3(p * 22.0 + t * 3.0)) * 1.8;

        vec3 deepBlue = vec3(0.02, 0.04, 0.15);
        vec3 iceBlue = vec3(0.1, 0.25, 0.55);
        vec3 frostCyan = vec3(0.3, 0.65, 0.85);
        vec3 iceWhite = vec3(0.7, 0.85, 1.0);
        vec3 brightWhite = vec3(0.95, 0.98, 1.0);

        float intensity = crystal * 0.6 + facets * 0.3 + 0.1;
        vec3 col = mix(deepBlue, iceBlue, smoothstep(0.0, 0.3, intensity));
        col = mix(col, frostCyan, smoothstep(0.3, 0.6, intensity));
        col = mix(col, iceWhite, smoothstep(0.6, 0.85, intensity));
        col += brightWhite * sparkle;

        float core = smoothstep(0.7, 0.0, length(vUv - 0.5) * 2.0);
        float coreGlow = core * coreBrightness;
        col += frostCyan * coreGlow * 0.5;
        col += iceWhite * coreGlow * 0.3;

        float rim = pow(vFresnel, rimPower);
        col += vec3(0.3, 0.6, 1.0) * rim * 1.2;
        col += vec3(0.6, 0.8, 1.0) * rim * 0.5 * (0.8 + 0.2 * sin(t * 2.0));

        if (isCharged > 0.5) {
            float crackle = smoothstep(0.7, 0.85, noise3(p * 14.0 + t * 5.0));
            col += brightWhite * crackle * 0.6;
            col += frostCyan * sparkle * 0.4;
            col *= 1.3;
        }

        col *= coreBrightness;
        gl_FragColor = vec4(col, alpha);
    }
`;

// ─── FAST shader (sin/cos only — zero noise) ────────────────────

const fastVertexShader = /* glsl */ `
    uniform float time;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec2 vUv;
    varying float vFresnel;

    void main() {
        vNormal = normalize(normalMatrix * normal);
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vec3 viewDir = normalize(cameraPosition - worldPos.xyz);
        vFresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.5);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fastFragmentShader = /* glsl */ `
    uniform float time;
    uniform float alpha;
    uniform float coreBrightness;
    uniform float iceSpeed;
    uniform float isCharged;
    uniform float rimPower;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec2 vUv;
    varying float vFresnel;

    void main() {
        float t = time * iceSpeed;
        vec3 p = vWorldPosition * 3.0;

        // Cheap crystal: sin/cos instead of FBM noise
        float n1 = sin(p.x * 3.0 + t * 0.3) * cos(p.z * 2.5 + t * 0.5) * 0.5 + 0.5;
        float n2 = sin(p.y * 4.0 + t * 0.4 + 2.1) * cos(p.x * 3.5 - t * 0.6) * 0.5 + 0.5;

        float crystal = smoothstep(0.3, 0.6, n1) * smoothstep(0.25, 0.55, n2);
        float sparkle = smoothstep(0.9, 0.98, sin(p.x * 22.0 + t * 3.0) * cos(p.z * 19.0 - t * 2.0) * 0.5 + 0.5) * 1.5;

        // Same ice palette
        vec3 deepBlue = vec3(0.02, 0.04, 0.15);
        vec3 iceBlue = vec3(0.1, 0.25, 0.55);
        vec3 frostCyan = vec3(0.3, 0.65, 0.85);
        vec3 iceWhite = vec3(0.7, 0.85, 1.0);
        vec3 brightWhite = vec3(0.95, 0.98, 1.0);

        float intensity = crystal * 0.7 + 0.15;
        vec3 col = mix(deepBlue, iceBlue, smoothstep(0.0, 0.3, intensity));
        col = mix(col, frostCyan, smoothstep(0.3, 0.6, intensity));
        col = mix(col, iceWhite, smoothstep(0.6, 0.85, intensity));
        col += brightWhite * sparkle;

        // Core glow
        float core = smoothstep(0.7, 0.0, length(vUv - 0.5) * 2.0);
        col += frostCyan * core * coreBrightness * 0.5;
        col += iceWhite * core * coreBrightness * 0.3;

        // Rim glow
        float rim = pow(vFresnel, rimPower);
        col += vec3(0.3, 0.6, 1.0) * rim * 1.2;
        col += vec3(0.6, 0.8, 1.0) * rim * 0.4;

        if (isCharged > 0.5) {
            col *= 1.3;
            col += brightWhite * sparkle * 0.4;
        }

        col *= coreBrightness;
        gl_FragColor = vec4(col, alpha);
    }
`;

// ─── Public API ──────────────────────────────────────────────────

export const IceShader = {
    uniforms: {
        time: { value: 0 },
        alpha: { value: 0.88 },
        coreBrightness: { value: 1.2 },
        iceSpeed: { value: 3.0 },
        isCharged: { value: 0.0 },
        layerScale: { value: 1.0 },
        rimPower: { value: 2.2 },
        displaceAmount: { value: 0.0 }
    },
    vertexShader: fullVertexShader,
    fragmentShader: fullFragmentShader
};

/** Quality flag — set by Game.js adaptive quality system */
let _useFastShaders = true;

export function setIceQuality(fast) {
    _useFastShaders = fast;
}

export function createIceMaterial(opts = {}) {
    const fast = opts.fast ?? _useFastShaders;
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            alpha: { value: opts.alpha ?? 0.88 },
            coreBrightness: { value: opts.coreBrightness ?? 1.2 },
            iceSpeed: { value: opts.iceSpeed ?? 3.0 },
            isCharged: { value: opts.isCharged ?? 0.0 },
            layerScale: { value: opts.layerScale ?? 1.0 },
            rimPower: { value: opts.rimPower ?? 2.2 },
            displaceAmount: { value: opts.displaceAmount ?? 0.0 }
        },
        vertexShader: fast ? fastVertexShader : fullVertexShader,
        fragmentShader: fast ? fastFragmentShader : fullFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });
    return mat;
}

export function updateIceMaterial(material, time, alpha) {
    if (!material || !material.uniforms) return;
    material.uniforms.time.value = time;
    if (alpha !== undefined) material.uniforms.alpha.value = alpha;
}
