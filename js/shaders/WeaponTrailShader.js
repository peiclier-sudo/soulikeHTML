/**
 * Weapon Trail Shader - Glowing sword trail effect
 */

import * as THREE from 'three';

export const WeaponTrailShader = {
    uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(0xffffff) },
        glowColor: { value: new THREE.Color(0xaaccff) },
        opacity: { value: 0.8 },
        trailLength: { value: 1.0 }
    },
    
    vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        varying vec2 vUv;
        
        void main() {
            vAlpha = alpha;
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    
    fragmentShader: `
        uniform float time;
        uniform vec3 color;
        uniform vec3 glowColor;
        uniform float opacity;
        uniform float trailLength;
        
        varying float vAlpha;
        varying vec2 vUv;
        
        void main() {
            // Fade based on trail position (vUv.x represents position along trail)
            float fade = 1.0 - vUv.x;
            fade = pow(fade, 2.0);
            
            // Edge glow
            float edgeFade = 1.0 - abs(vUv.y - 0.5) * 2.0;
            edgeFade = pow(edgeFade, 0.5);
            
            // Combine fades
            float alpha = fade * edgeFade * opacity;
            
            // Color gradient from white core to colored edge
            vec3 coreColor = vec3(1.0);
            vec3 finalColor = mix(color, coreColor, edgeFade * 0.5);
            
            // Add subtle animation
            float shimmer = sin(vUv.x * 10.0 + time * 5.0) * 0.1 + 0.9;
            finalColor *= shimmer;
            
            // Glow effect
            finalColor += glowColor * (1.0 - edgeFade) * 0.3;
            
            gl_FragColor = vec4(finalColor, alpha);
        }
    `
};

export function createWeaponTrailMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(WeaponTrailShader.uniforms),
        vertexShader: WeaponTrailShader.vertexShader,
        fragmentShader: WeaponTrailShader.fragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}

