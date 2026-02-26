/**
 * Blood Fire Shader - High-detail blood plasma spell effect
 * Multiple noise layers, domain warp, rich palette, rim glow, inner soul core.
 */

import * as THREE from 'three';

export const BloodFireShader = {
    uniforms: {
        time: { value: 0 },
        alpha: { value: 1.0 },
        coreBrightness: { value: 1.2 },
        plasmaSpeed: { value: 4.0 },
        isCharged: { value: 0.0 },
        layerScale: { value: 1.0 },
        rimPower: { value: 2.2 },
        redTint: { value: 0.0 },
        displaceAmount: { value: 0.0 }
    },

    vertexShader: `
        uniform float time;
        uniform float displaceAmount;
        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying float vFresnel;
        varying vec3 vWorldPos;

        float vHash(vec3 p) {
            return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
        }
        float vNoise3(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float n000 = vHash(i);
            float n100 = vHash(i + vec3(1,0,0));
            float n010 = vHash(i + vec3(0,1,0));
            float n110 = vHash(i + vec3(1,1,0));
            float n001 = vHash(i + vec3(0,0,1));
            float n101 = vHash(i + vec3(1,0,1));
            float n011 = vHash(i + vec3(0,1,1));
            float n111 = vHash(i + vec3(1,1,1));
            return mix(
                mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
                mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
        }
        float vFbm(vec3 p) {
            float v = 0.0;
            float a = 0.5;
            float f = 1.0;
            for (int i = 0; i < 4; i++) {
                v += a * vNoise3(p * f);
                f *= 2.0;
                a *= 0.5;
            }
            return v;
        }

        void main() {
            vUv = uv;
            vec3 pos = position;
            if (displaceAmount > 0.0) {
                vec3 q = pos * 2.5 + vec3(0, 0, time * 2.0);
                vec3 q2 = pos * 5.0 + vec3(time * 2.5, time * 1.5, 0);
                float n = vFbm(q) - 0.5;
                n += 0.35 * vFbm(q2);
                float spike = smoothstep(0.6, 0.9, vNoise3(pos * 8.0 + vec3(0, 0, time * 3.0)));
                pos += normal * displaceAmount * (n * 0.7 + spike * 0.5);
            }
            vPosition = pos;
            vNormal = normalize(normalMatrix * normal);
            vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
            vec3 viewDir = normalize(-mvPos.xyz);
            vFresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.2);
            vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
            gl_Position = projectionMatrix * mvPos;
        }
    `,

    fragmentShader: `
        uniform float time;
        uniform float alpha;
        uniform float coreBrightness;
        uniform float plasmaSpeed;
        uniform float isCharged;
        uniform float layerScale;
        uniform float rimPower;
        uniform float redTint;

        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying float vFresnel;
        varying vec3 vWorldPos;

        #define PI 3.14159265359

        float hash(vec3 p) {
            return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
        }

        float noise3(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float n000 = hash(i);
            float n100 = hash(i + vec3(1,0,0));
            float n010 = hash(i + vec3(0,1,0));
            float n110 = hash(i + vec3(1,1,0));
            float n001 = hash(i + vec3(0,0,1));
            float n101 = hash(i + vec3(1,0,1));
            float n011 = hash(i + vec3(0,1,1));
            float n111 = hash(i + vec3(1,1,1));
            return mix(
                mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
                mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
        }

        float fbm3(vec3 p) {
            float v = 0.0;
            float a = 0.5;
            float f = 1.0;
            for (int i = 0; i < 5; i++) {
                v += a * noise3(p * f);
                f *= 2.0;
                a *= 0.52;
            }
            return v;
        }

        float fbm3Low(vec3 p) {
            float v = 0.0;
            float a = 0.5;
            float f = 1.0;
            for (int i = 0; i < 4; i++) {
                v += a * noise3(p * f);
                f *= 2.0;
                a *= 0.52;
            }
            return v;
        }

        vec3 warp(vec3 p) {
            float t = time * plasmaSpeed * 0.5;
            return p + 0.4 * vec3(
                fbm3Low(p + vec3(0, 0, t)),
                fbm3Low(p + vec3(5.2, 1.3, t * 0.7)),
                fbm3Low(p + vec3(-2.1, 4.7, t * 0.9))
            );
        }

        void main() {
            float t = time * plasmaSpeed;
            vec3 pos = vPosition * layerScale;

            vec3 q = warp(pos * 2.0 + vec3(0, 0, t * 0.4));
            vec3 q2 = warp(pos * 3.5 + vec3(2.1, -1.2, t * 0.6));
            vec3 q3 = pos * 5.0 + vec3(-1.5, 2.3, t * 0.35);
            vec3 qFine = pos * 8.0 + vec3(0.7, 0.9, t * 1.2);

            float n1 = fbm3(q);
            float n2 = fbm3(q2);
            float n3 = fbm3(q3);
            float nFine = fbm3(qFine);

            float plasma = n1 * 0.45 + n2 * 0.35 + n3 * 0.2;
            plasma = smoothstep(0.15, 0.82, plasma);

            float veins = smoothstep(0.55, 0.72, n1) * smoothstep(0.45, 0.6, n2);
            veins *= (0.85 + 0.15 * sin(t + n3 * 6.28));

            float embers = smoothstep(0.88, 0.92, nFine) + smoothstep(0.82, 0.88, n1) * smoothstep(0.78, 0.85, n2);
            embers *= (0.7 + 0.3 * sin(t * 4.0 + nFine * 10.0));

            float dist = length(vPosition);
            float core = smoothstep(0.6, 0.98, 1.0 - dist);
            float corePulse = 0.92 + 0.08 * sin(t * 2.5);
            core *= corePulse;

            float soulCore = smoothstep(0.85, 0.99, 1.0 - dist);
            soulCore *= (0.85 + 0.15 * sin(t * 3.0 + n1 * 6.28));

            // BLOOD palette: deep venous red, arterial crimson, bright blood core; minimal orange
            vec3 blackSmoke = vec3(0.03, 0.0, 0.0);
            vec3 venousDark = vec3(0.18, 0.0, 0.02);
            vec3 bloodDark = vec3(0.42, 0.02, 0.03);
            vec3 arterialCrimson = vec3(0.78, 0.04, 0.02);
            vec3 bloodBright = vec3(0.95, 0.08, 0.02);
            vec3 bloodCore = vec3(1.0, 0.18, 0.05);
            vec3 bloodHot = vec3(1.0, 0.35, 0.12);

            vec3 col = mix(blackSmoke, venousDark, plasma * 0.6);
            col = mix(col, bloodDark, plasma * n2);
            col = mix(col, arterialCrimson, plasma * 0.9);
            col = mix(col, bloodBright, veins);
            col = mix(col, bloodCore, core * coreBrightness);
            col = mix(col, bloodHot, soulCore * coreBrightness * 0.5);

            col += vec3(0.95, 0.12, 0.02) * embers * 0.9;

            float rim = pow(vFresnel, rimPower);
            float rimPulse = 0.6 + 0.4 * sin(t * 1.8 + n1 * 6.28);
            col += vec3(0.4, 0.0, 0.0) * rim * rimPulse;
            col += bloodBright * rim * 0.65;
            col += bloodCore * rim * rim * 0.35;
            float edgeSmoke = smoothstep(0.3, 0.85, vFresnel);
            col = mix(col, blackSmoke, edgeSmoke * 0.4);

            if (isCharged > 0.5) {
                float crackle = smoothstep(0.7, 0.95, nFine) * smoothstep(0.6, 0.8, n1);
                crackle *= (0.5 + 0.5 * sin(t * 8.0 + n2 * 12.0));
                col += vec3(1.0, 0.25, 0.05) * crackle * 0.5;
                col *= 1.1;
                col += vec3(0.1, 0.0, 0.01) * (0.5 + 0.5 * sin(t * 3.5));
                rim = pow(vFresnel, 1.8);
                col += bloodHot * rim * 0.25;
            }

            col.g *= (1.0 - redTint);
            col.b *= (1.0 - redTint);

            gl_FragColor = vec4(col, alpha);
        }
    `
};

export function createBloodFireMaterial(opts = {}) {
    return new THREE.ShaderMaterial({
        uniforms: {
            time: { value: opts.time ?? 0 },
            alpha: { value: opts.alpha ?? 1.0 },
            coreBrightness: { value: opts.coreBrightness ?? 1.2 },
            plasmaSpeed: { value: opts.plasmaSpeed ?? 4.0 },
            isCharged: { value: opts.isCharged ?? 0.0 },
            layerScale: { value: opts.layerScale ?? 1.0 },
            rimPower: { value: opts.rimPower ?? 2.2 },
            redTint: { value: opts.redTint ?? 0.0 },
            displaceAmount: { value: opts.displaceAmount ?? 0.0 }
        },
        vertexShader: BloodFireShader.vertexShader,
        fragmentShader: BloodFireShader.fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
}

export function updateBloodFireMaterial(material, time, alpha = 1.0) {
    if (!material.uniforms) return;
    material.uniforms.time.value = time;
    material.uniforms.alpha.value = alpha;
}
