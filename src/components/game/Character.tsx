'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { CapsuleCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { usePreviewStore } from '@/stores/usePreviewStore';
import { CHARACTER_PREVIEW_REGISTRY } from '@/core/preview-registry';
import { AnimationCodex } from '@/systems/animation/AnimationCodex';
import type { AnimationManifest } from '@/types/animation';

const CLASS_COLORS: Record<string, string> = {
  mage: '#7b4fff',
  warrior: '#e05a00',
  rogue: '#00c89a',
};

function isAnimationManifest(data: unknown): data is AnimationManifest {
  if (!data || typeof data !== 'object') return false;
  const value = data as Partial<AnimationManifest>;
  return typeof value.version === 'string' && !!value.clipMapping && typeof value.clipMapping === 'object';
}

function CharacterModel({ modelPath, manifest }: { modelPath: string; manifest: AnimationManifest }) {
  const selectedClass = usePreviewStore((s) => s.selectedClass);
  const selectedAction = usePreviewStore((s) => s.selectedAction);
  const ref = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(modelPath);
  const { actions } = useAnimations(animations, ref);

  const previewConfig = CHARACTER_PREVIEW_REGISTRY[selectedClass];
  const codex = useMemo(() => new AnimationCodex(manifest), [manifest]);

  useEffect(() => {
    const trace = codex.resolveAction(selectedAction, {
      playerClass: selectedClass,
      weapon: previewConfig.weapon,
    });

    const clip = actions[trace.clipName] ?? actions.Idle;
    if (!clip) {
      console.warn(`[CharacterPreview] Missing clip "${trace.clipName}" for action ${selectedAction}`);
      return;
    }

    Object.values(actions).forEach((action) => action?.fadeOut(0.1));
    clip.reset().fadeIn(0.15).play();

    return () => {
      clip.fadeOut(0.1);
    };
  }, [actions, codex, previewConfig.weapon, selectedAction, selectedClass]);

  return <primitive ref={ref} object={scene} castShadow />;
}

function PlaceholderCapsule() {
  const ref = useRef<THREE.Mesh>(null);
  const selectedClass = usePreviewStore((s) => s.selectedClass);
  const color = CLASS_COLORS[selectedClass] ?? '#888888';

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

export default function Character() {
  const selectedClass = usePreviewStore((s) => s.selectedClass);
  const previewConfig = CHARACTER_PREVIEW_REGISTRY[selectedClass];
  const { modelPath, manifestPath } = previewConfig;
  const [modelExists, setModelExists] = useState(false);
  const [manifest, setManifest] = useState<AnimationManifest>(previewConfig.manifest);

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

  useEffect(() => {
    let cancelled = false;

    setManifest(previewConfig.manifest);

    fetch(manifestPath)
      .then((response) => {
        if (!response.ok) return null;
        return response.json() as Promise<unknown>;
      })
      .then((data) => {
        if (!cancelled && data && isAnimationManifest(data)) {
          setManifest(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setManifest(previewConfig.manifest);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [manifestPath, previewConfig.manifest]);

  return (
    <RigidBody
      type="dynamic"
      colliders={false}
      position={[0, 2, 0]}
      lockRotations
      linearDamping={0.8}
      angularDamping={1}
    >
      <CapsuleCollider args={[0.5, 0.42]} />
      {modelExists ? (
        <Suspense fallback={<PlaceholderCapsule />}>
          <CharacterModel modelPath={modelPath} manifest={manifest} />
        </Suspense>
      ) : (
        <PlaceholderCapsule />
      )}
    </RigidBody>
  );
}
