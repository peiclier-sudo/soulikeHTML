/**
 * Vignette Post-Processing Shader
 */

import * as THREE from 'three';

export const VignetteShader = {
    uniforms: {
        tDiffuse: { value: null },
        darkness: { value: 0.5 },
        offset: { value: 1.0 },
        tintColor: { value: new THREE.Color(0x000000) },
        lowHealthOverlay: { value: 0.0 }
    },
    
    vertexShader: `
        varying vec2 vUv;
        
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float darkness;
        uniform float offset;
        uniform vec3 tintColor;
        uniform float lowHealthOverlay;
        
        varying vec2 vUv;
        
        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            
            // Vignette effect
            vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
            float vignette = 1.0 - dot(uv, uv);
            vignette = clamp(pow(vignette, darkness), 0.0, 1.0);
            
            // Apply vignette
            vec3 color = texel.rgb * vignette;
            
            // Low health red overlay
            if (lowHealthOverlay > 0.0) {
                float pulse = sin(lowHealthOverlay * 3.14159) * 0.5 + 0.5;
                vec3 redOverlay = vec3(0.5, 0.0, 0.0);
                color = mix(color, redOverlay, pulse * 0.3 * (1.0 - vignette));
            }
            
            // Tint darker areas
            color = mix(tintColor, color, vignette);
            
            gl_FragColor = vec4(color, texel.a);
        }
    `
};

// Custom pass for vignette
export class VignettePass {
    constructor(darkness = 0.5, offset = 1.0) {
        this.uniforms = THREE.UniformsUtils.clone(VignetteShader.uniforms);
        this.uniforms.darkness.value = darkness;
        this.uniforms.offset.value = offset;
        
        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: VignetteShader.vertexShader,
            fragmentShader: VignetteShader.fragmentShader
        });
        
        this.fsQuad = null; // Will be initialized by composer
        this.enabled = true;
        this.needsSwap = true;
        this.renderToScreen = false;
    }
    
    setLowHealthOverlay(value) {
        this.uniforms.lowHealthOverlay.value = value;
    }
    
    render(renderer, writeBuffer, readBuffer) {
        this.uniforms.tDiffuse.value = readBuffer.texture;
        
        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
        } else {
            renderer.setRenderTarget(writeBuffer);
        }
        
        // Would render fullscreen quad here
        // This is a simplified version - in production use FullScreenQuad
    }
}

