'use client';

import { Canvas } from '@react-three/fiber';
import { KeyboardControls, Environment, OrbitControls } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import Character from './Character';

export const KEYBOARD_MAP = [
  { name: 'forward',  keys: ['KeyW', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left',     keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right',    keys: ['KeyD', 'ArrowRight'] },
  { name: 'jump',     keys: ['Space'] },
  { name: 'dash',     keys: ['ShiftLeft'] },
  { name: 'attack',   keys: ['KeyJ'] },
  { name: 'skill1',   keys: ['KeyQ'] },
  { name: 'skill2',   keys: ['KeyE'] },
  { name: 'ultimate', keys: ['KeyR'] },
] as const;

export default function Canvas3D() {
  return (
    <KeyboardControls map={KEYBOARD_MAP as never}>
      <Canvas
        style={{ position: 'fixed', inset: 0 }}
        camera={{ position: [0, 5, 12], fov: 55, near: 0.1, far: 600 }}
        shadows
        gl={{ antialias: true }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.25} />
        <directionalLight
          position={[10, 20, 10]}
          intensity={1.4}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={80}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        />
        {/* Rim light */}
        <pointLight position={[-6, 4, -8]} intensity={0.6} color="#4422ff" />

        {/* Environment */}
        <Environment preset="night" />

        {/* Physics world */}
        <Physics gravity={[0, -20, 0]}>
          {/* Ground plane */}
          <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[120, 120]} />
            <meshStandardMaterial color="#0d0d14" roughness={0.9} metalness={0.1} />
          </mesh>

          {/* Character — your model plugs in here */}
          <Character />
        </Physics>

        {/* Dev orbit camera — swap for a follow-cam when ready */}
        <OrbitControls target={[0, 1, 0]} maxPolarAngle={Math.PI / 2.1} />
      </Canvas>
    </KeyboardControls>
  );
}
