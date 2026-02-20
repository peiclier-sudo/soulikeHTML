'use client';

/**
 * Character.tsx — R3F character slot
 *
 * HOW TO DROP IN YOUR MODEL
 * ─────────────────────────
 * 1. Put your .glb in /public/models/<classId>.glb
 *    e.g. /public/models/mage.glb
 *
 * 2. Set MODEL_PATH below:
 *    const MODEL_PATH = '/models/mage.glb';
 *
 * 3. The <CharacterModel> component will load it and
 *    hand you `scene` + `animations` via useGLTF/useAnimations.
 *    Wire up actions['idle']?.play() etc. inside the useEffect.
 *
 * Until a model is set, a coloured capsule placeholder renders
 * (tinted by the selected class colour).
 */

import { Suspense, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { usePlayerStore } from '@/stores/usePlayerStore';

// ─── SET THIS TO YOUR GLB PATH ────────────────────────────────────────────────
const MODEL_PATH = ''; // e.g. '/models/mage.glb'
// ─────────────────────────────────────────────────────────────────────────────

const CLASS_COLORS: Record<string, string> = {
  mage:    '#7b4fff',
  warrior: '#e05a00',
  rogue:   '#00c89a',
};

// ── Actual GLB model (only mounted when MODEL_PATH is set) ────────────────────
function CharacterModel() {
  const ref = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(MODEL_PATH);
  const { actions } = useAnimations(animations, ref);

  // Example animation bootstrap — uncomment when your GLB has clips:
  // useEffect(() => {
  //   actions['idle']?.reset().fadeIn(0.3).play();
  //   return () => { actions['idle']?.fadeOut(0.3); };
  // }, [actions]);

  return <primitive ref={ref} object={scene} castShadow />;
}

// ── Placeholder capsule (visible while no GLB is loaded) ─────────────────────
function PlaceholderCapsule() {
  const ref = useRef<THREE.Mesh>(null);
  const classId = usePlayerStore((s) => s.classId);
  const color = classId ? (CLASS_COLORS[classId] ?? '#888888') : '#888888';

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.7;
  });

  return (
    <mesh ref={ref} castShadow position={[0, 0, 0]}>
      <capsuleGeometry args={[0.42, 1.0, 8, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.3}
        roughness={0.4}
        metalness={0.3}
      />
    </mesh>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
export default function Character() {
  return (
    // Spawn the rigid body slightly above the floor so physics drops it in
    <RigidBody
      type="dynamic"
      colliders={false}
      position={[0, 2, 0]}
      lockRotations
      linearDamping={0.8}
      angularDamping={1}
    >
      <CapsuleCollider args={[0.5, 0.42]} />
      {MODEL_PATH ? (
        <Suspense fallback={<PlaceholderCapsule />}>
          <CharacterModel />
        </Suspense>
      ) : (
        <PlaceholderCapsule />
      )}
    </RigidBody>
  );
}
