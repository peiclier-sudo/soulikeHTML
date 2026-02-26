/**
 * Plasma Ring Shader - Blood-red flowing plasma around the wrist (Saturn-ring style)
 * Uses angle + time for continuous random-looking flow.
 */

import * as THREE from 'three';

export function createPlasmaRingMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vPosition;
            varying float vAngle;
            void main() {
                vUv = uv;
                vPosition = position;
                vAngle = atan(position.y, position.x);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            varying vec2 vUv;
            varying vec3 vPosition;
            varying float vAngle;

            float hash(vec3 p) {
                return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
            }
            float noise(vec3 p) {
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

            void main() {
                float angle = vAngle * 0.15915;
                float t = time * 1.2;
                float n1 = noise(vec3(angle * 4.0 + t, angle * 2.0 - t * 0.7, 0.1));
                float n2 = noise(vec3(angle * 6.0 - t * 0.5, t * 1.3, 0.2));
                float flow = n1 * 0.6 + n2 * 0.4;
                flow = smoothstep(0.2, 0.85, flow);
                flow *= 0.7 + 0.3 * sin(t * 2.0 + angle * 8.0);

                vec3 bloodDark = vec3(0.25, 0.0, 0.02);
                vec3 bloodMid = vec3(0.7, 0.05, 0.02);
                vec3 bloodBright = vec3(0.95, 0.12, 0.03);
                vec3 col = mix(bloodDark, bloodMid, flow);
                col = mix(col, bloodBright, flow * (0.6 + 0.4 * n2));

                float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
                edge = smoothstep(0.0, 0.6, edge);
                col *= edge;

                float alpha = 0.75 * (0.6 + 0.4 * flow) * edge;
                gl_FragColor = vec4(col, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });
}
