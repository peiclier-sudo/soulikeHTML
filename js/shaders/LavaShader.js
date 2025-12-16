/**
 * Lava Shader - Animated lava effect with flow and glow
 */

import * as THREE from 'three';

export const LavaShader = {
    uniforms: {
        time: { value: 0 },
        lavaTexture: { value: null },
        noiseTexture: { value: null },
        flowSpeed: { value: 0.5 },
        distortionScale: { value: 0.1 },
        brightness: { value: 1.5 },
        glowColor: { value: new THREE.Color(0xff4400) },
        darkColor: { value: new THREE.Color(0x4a0000) }
    },
    
    vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        
        void main() {
            vUv = uv;
            vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    
    fragmentShader: `
        uniform float time;
        uniform sampler2D lavaTexture;
        uniform float flowSpeed;
        uniform float distortionScale;
        uniform float brightness;
        uniform vec3 glowColor;
        uniform vec3 darkColor;
        
        varying vec2 vUv;
        varying vec3 vPosition;
        
        // Simple noise function
        float noise(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }
        
        // Smooth noise
        float smoothNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            
            float a = noise(i);
            float b = noise(i + vec2(1.0, 0.0));
            float c = noise(i + vec2(0.0, 1.0));
            float d = noise(i + vec2(1.0, 1.0));
            
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        
        // Fractal noise
        float fbm(vec2 p) {
            float value = 0.0;
            float amplitude = 0.5;
            float frequency = 1.0;
            
            for (int i = 0; i < 4; i++) {
                value += amplitude * smoothNoise(p * frequency);
                frequency *= 2.0;
                amplitude *= 0.5;
            }
            
            return value;
        }
        
        void main() {
            vec2 uv = vUv;
            
            // Flow animation
            float flowTime = time * flowSpeed;
            
            // Distortion based on noise
            float noise1 = fbm(uv * 3.0 + vec2(flowTime * 0.5, flowTime * 0.3));
            float noise2 = fbm(uv * 5.0 - vec2(flowTime * 0.3, flowTime * 0.5));
            
            vec2 distortion = vec2(noise1, noise2) * distortionScale;
            vec2 distortedUv = uv + distortion;
            
            // Sample lava texture with distortion
            vec4 lavaColor = texture2D(lavaTexture, distortedUv);
            
            // Create hot spots
            float hotspots = fbm(uv * 4.0 + vec2(flowTime * 0.2));
            hotspots = pow(hotspots, 2.0);
            
            // Mix between dark and glow based on hotspots
            vec3 finalColor = mix(darkColor, glowColor, hotspots * brightness);
            
            // Add texture detail
            finalColor += lavaColor.rgb * 0.3;
            
            // Pulsing glow
            float pulse = sin(time * 2.0) * 0.1 + 0.9;
            finalColor *= pulse;
            
            // Add bright spots
            float brightSpots = smoothstep(0.6, 0.8, noise1) * smoothstep(0.6, 0.8, noise2);
            finalColor += vec3(1.0, 0.8, 0.3) * brightSpots * 0.5;
            
            gl_FragColor = vec4(finalColor, 1.0);
        }
    `
};

// Create lava material
export function createLavaMaterial(lavaTexture) {
    const material = new THREE.ShaderMaterial({
        uniforms: {
            ...LavaShader.uniforms,
            lavaTexture: { value: lavaTexture }
        },
        vertexShader: LavaShader.vertexShader,
        fragmentShader: LavaShader.fragmentShader
    });
    
    return material;
}

// Update lava shader time
export function updateLavaMaterial(material, time) {
    if (material.uniforms && material.uniforms.time) {
        material.uniforms.time.value = time;
    }
}

