'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { BOSS_PREVIEW_REGISTRY } from '@/core/preview-registry';
import { usePreviewStore } from '@/stores/usePreviewStore';

function BossModel({ modelPath }: { modelPath: string }) {
  const ref = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(modelPath);
  const { actions, names } = useAnimations(animations, ref);

  useEffect(() => {
    const preferred = actions.Idle ?? actions[names[0] ?? ''];
    preferred?.reset().fadeIn(0.2).play();
    return () => {
      preferred?.fadeOut(0.2);
    };
  }, [actions, names]);

  return <primitive ref={ref} object={scene} castShadow position={[3.5, 0, 0]} />;
}

function BossPlaceholder() {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y -= dt * 0.4;
  });

  return (
    <mesh ref={ref} castShadow position={[3.5, 1, 0]}>
      <octahedronGeometry args={[1.1, 0]} />
      <meshStandardMaterial color="#8b1e2f" emissive="#8b1e2f" emissiveIntensity={0.25} />
    </mesh>
  );
}

export default function Boss() {
  const selectedBoss = usePreviewStore((s) => s.selectedBoss);
  const modelPath = BOSS_PREVIEW_REGISTRY[selectedBoss].modelPath;
  const [modelExists, setModelExists] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(modelPath, { method: 'HEAD' })
      .then((response) => {
        if (!cancelled) setModelExists(response.ok);
      })
      .catch(() => {
        if (!cancelled) setModelExists(false);
      });

    return () => {
      cancelled = true;
    };
  }, [modelPath]);

  if (!modelExists) return <BossPlaceholder />;

  return (
    <Suspense fallback={<BossPlaceholder />}>
      <BossModel modelPath={modelPath} />
    </Suspense>
  );
}
