'use client';

import { Canvas } from '@react-three/fiber';
import { KeyboardControls, OrbitControls } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import Character from './Character';
import Boss from './Boss';
import PreviewControls from './PreviewControls';

const controls = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'ArrowRight'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'dash', keys: ['ShiftLeft', 'ShiftRight'] },
];

export default function Canvas3D() {
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <PreviewControls />
      <KeyboardControls map={controls}>
        <Canvas camera={{ position: [5, 3, 7], fov: 55 }} shadows>
          <ambientLight intensity={0.45} />
          <directionalLight
            castShadow
            intensity={1}
            position={[8, 12, 8]}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />

          <Physics gravity={[0, -9.81, 0]}>
            <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[120, 120]} />
              <meshStandardMaterial color="#0d0d14" roughness={0.9} metalness={0.1} />
            </mesh>

            <Character />
            <Boss />
          </Physics>

          <OrbitControls target={[0, 1, 0]} maxPolarAngle={Math.PI / 2.1} />
        </Canvas>
      </KeyboardControls>
    </div>
  );
}
