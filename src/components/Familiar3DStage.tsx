import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OwnedFamiliar } from "../lib/familiarsApi";

interface Familiar3DStageProps {
  familiar: OwnedFamiliar;
  onTap?: () => void;
}

type FamiliarSpeciesProfile = {
  bodyScale: [number, number, number];
  headScale: [number, number, number];
  earScale: [number, number, number];
  earOffsetX: number;
  earOffsetY: number;
  tailOffset: [number, number, number];
  tailLength: number;
  pawHeight: number;
  stride: number;
  bounce: number;
};

const DEFAULT_SPECIES: FamiliarSpeciesProfile = {
  bodyScale: [1.1, 0.86, 0.92],
  headScale: [0.94, 1.02, 0.92],
  earScale: [0.07, 0.18, 0.07],
  earOffsetX: 0.14,
  earOffsetY: 0.56,
  tailOffset: [-0.17, 0.03, -0.1],
  tailLength: 0.12,
  pawHeight: 0.5,
  stride: 12,
  bounce: 3.2,
};

const FAMILIAR_SPECIES: Record<string, FamiliarSpeciesProfile> = {
  elfe: { ...DEFAULT_SPECIES, bodyScale: [1.08, 0.84, 0.9], headScale: [0.92, 1.04, 0.9], tailLength: 0.08, earOffsetX: 0.16, earOffsetY: 0.58, stride: 11.5, bounce: 3.0 },
  demon: { ...DEFAULT_SPECIES, bodyScale: [1.14, 0.9, 0.96], headScale: [0.96, 1.0, 0.94], earScale: [0.08, 0.22, 0.08], tailOffset: [-0.21, 0.08, -0.14], tailLength: 0.18, earOffsetX: 0.15, earOffsetY: 0.6, stride: 13.5, bounce: 3.6 },
  humain: { ...DEFAULT_SPECIES, bodyScale: [1.04, 0.82, 0.88], headScale: [0.98, 1.0, 0.96], earScale: [0.06, 0.14, 0.06], tailLength: 0.05, pawHeight: 0.48, stride: 10.5, bounce: 2.6 },
  dragon: { ...DEFAULT_SPECIES, bodyScale: [1.18, 0.9, 1.0], headScale: [0.98, 0.98, 0.98], earScale: [0.09, 0.16, 0.09], tailOffset: [-0.25, 0.04, -0.15], tailLength: 0.28, earOffsetX: 0.14, earOffsetY: 0.62, stride: 14.2, bounce: 3.8 },
  esprit: { ...DEFAULT_SPECIES, bodyScale: [1.0, 0.8, 0.86], headScale: [1.0, 1.08, 0.92], earScale: [0.06, 0.2, 0.06], tailLength: 0.09, stride: 10.8, bounce: 3.1 },
  gardien: { ...DEFAULT_SPECIES, bodyScale: [1.16, 0.92, 0.98], headScale: [0.96, 1.0, 0.95], earScale: [0.08, 0.16, 0.08], tailOffset: [-0.18, 0.03, -0.08], tailLength: 0.1, pawHeight: 0.53, stride: 11.8, bounce: 3.3 },
  alien: { ...DEFAULT_SPECIES, bodyScale: [1.1, 0.78, 1.02], headScale: [1.02, 1.08, 0.96], earScale: [0.05, 0.16, 0.05], tailLength: 0.14, stride: 10.2, bounce: 2.8 },
  fee: { ...DEFAULT_SPECIES, bodyScale: [0.98, 0.76, 0.84], headScale: [1.02, 1.08, 0.94], earScale: [0.06, 0.22, 0.06], tailLength: 0.06, stride: 10.4, bounce: 2.7 },
  sirene: { ...DEFAULT_SPECIES, bodyScale: [1.08, 0.8, 0.9], headScale: [0.98, 1.04, 0.94], earScale: [0.06, 0.15, 0.06], tailLength: 0.22, tailOffset: [-0.22, 0.0, -0.16], stride: 11.2, bounce: 3.0 },
};

function colorForFamiliar(familiar: OwnedFamiliar) {
  return new THREE.Color(familiar.color || "#facc15");
}

function getSpeciesProfile(familiar: OwnedFamiliar): FamiliarSpeciesProfile {
  return FAMILIAR_SPECIES[familiar.familiarId] ?? DEFAULT_SPECIES;
}

function createLeg(material: THREE.Material) {
  const leg = new THREE.Group();
  const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.2, 6, 10), material);
  thigh.position.y = -0.08;
  thigh.castShadow = true;
  leg.add(thigh);
  const foot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), material);
  foot.scale.set(1.2, 0.65, 1.45);
  foot.position.set(0, -0.22, 0.03);
  foot.castShadow = true;
  leg.add(foot);
  return leg;
}

function createTail(material: THREE.Material) {
  const tail = new THREE.Group();
  const segment1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.12, 4, 8), material);
  segment1.rotation.z = -0.55;
  segment1.position.set(-0.17, 0.03, -0.1);
  segment1.castShadow = true;
  tail.add(segment1);
  const segment2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.09, 4, 8), material);
  segment2.rotation.z = -0.25;
  segment2.position.set(-0.27, -0.02, -0.13);
  segment2.castShadow = true;
  tail.add(segment2);
  return tail;
}

function createNameTag(label: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(6, 10, 20, 0.72)";
  roundRect(ctx, 18, 18, 476, 92, 28);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 4;
  roundRect(ctx, 18, 18, 476, 92, 28);
  ctx.stroke();

  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.font = "bold 34px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff7d6";
  ctx.fillText(label, 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.set(0, 1.02, 0);
  sprite.userData.dispose = () => {
    texture.dispose();
    material.dispose();
  };
  return sprite;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

export function Familiar3DStage({ familiar, onTap }: Familiar3DStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  const familiarColor = useMemo(() => colorForFamiliar(familiar), [familiar]);
  const species = useMemo(() => getSpeciesProfile(familiar), [familiar]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const hostElement = host;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x07111f, 5.5, 18);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    camera.position.set(0, 1.8, 5.8);
    camera.lookAt(0, 0.9, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    hostElement.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xcfe8ff, 1.45);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xfff3d1, 1.35);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x66e0ff, 0.5);
    rim.position.set(-4, 4, -3);
    scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(4.1, 64),
      new THREE.MeshStandardMaterial({
        color: 0x17361f,
        roughness: 0.94,
        metalness: 0.0,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.position.y = -0.92;
    scene.add(floor);

    const path = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.35, 0.1, 24, 1),
      new THREE.MeshStandardMaterial({
        color: 0x30482f,
        roughness: 0.88,
      }),
    );
    path.position.set(0, -0.85, 0.1);
    path.receiveShadow = true;
    scene.add(path);

    const root = new THREE.Group();
    root.position.set(0, 1.04, 0);
    root.userData.bounds = {
      minX: -1.1,
      maxX: 1.1,
      minZ: -0.72,
      maxZ: 0.72,
    };

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.86;
    root.add(shadow);

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: familiarColor,
      roughness: 0.62,
      metalness: 0.03,
      emissive: familiarColor.clone().multiplyScalar(0.05),
    });
    const bellyMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff6d8,
      roughness: 0.82,
    });
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.4,
    });
    const blushMaterial = new THREE.MeshStandardMaterial({
      color: 0xffcad4,
      roughness: 0.5,
      transparent: true,
      opacity: 0.95,
    });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 22, 18), bodyMaterial);
    body.scale.set(...species.bodyScale);
    body.position.set(0, -0.18, 0);
    body.castShadow = true;
    root.add(body);

    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), bellyMaterial);
    chest.scale.set(1.12, 0.8, 0.75);
    chest.position.set(0, -0.16, 0.22);
    chest.castShadow = true;
    root.add(chest);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 22, 18), bodyMaterial);
    head.scale.set(...species.headScale);
    head.position.set(0, 0.3, 0.13);
    head.castShadow = true;
    root.add(head);

    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), bellyMaterial);
    muzzle.scale.set(1.35, 0.84, 1.0);
    muzzle.position.set(0, 0.22, 0.36);
    root.add(muzzle);

    const earLeft = new THREE.Mesh(
      new THREE.ConeGeometry(species.earScale[0], species.earScale[1], 8),
      bodyMaterial,
    );
    earLeft.rotation.z = -0.35;
    earLeft.position.set(-species.earOffsetX, species.earOffsetY, 0.03);
    earLeft.castShadow = true;
    root.add(earLeft);

    const earRight = new THREE.Mesh(
      new THREE.ConeGeometry(species.earScale[0], species.earScale[1], 8),
      bodyMaterial,
    );
    earRight.rotation.z = 0.35;
    earRight.position.set(species.earOffsetX, species.earOffsetY, 0.03);
    earRight.castShadow = true;
    root.add(earRight);

    const eyeLeft = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 10), eyeMaterial);
    eyeLeft.position.set(-0.07, 0.34, 0.38);
    root.add(eyeLeft);
    const eyeRight = eyeLeft.clone();
    eyeRight.position.x = 0.07;
    root.add(eyeRight);

    const blushLeft = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), blushMaterial);
    blushLeft.position.set(-0.12, 0.27, 0.33);
    blushLeft.scale.set(1.4, 0.62, 0.8);
    root.add(blushLeft);
    const blushRight = blushLeft.clone();
    blushRight.position.x = 0.12;
    root.add(blushRight);

    const mouth = new THREE.Mesh(
      new THREE.TorusGeometry(0.038, 0.012, 6, 10, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x5b2a2a, roughness: 0.8 }),
    );
    mouth.rotation.x = Math.PI / 2;
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, 0.2, 0.38);
    root.add(mouth);

    const leftLeg = createLeg(bodyMaterial);
    leftLeg.position.set(-0.15, -0.5, 0.08);
    root.add(leftLeg);
    const rightLeg = createLeg(bodyMaterial);
    rightLeg.position.set(0.15, -0.5, -0.02);
    root.add(rightLeg);

    const tail = createTail(bodyMaterial);
    tail.position.set(...species.tailOffset);
    tail.scale.set(1, 1, species.tailLength / 0.12);
    root.add(tail);

    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.026, 8, 16),
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xd97706,
        emissiveIntensity: 0.2,
        roughness: 0.45,
      }),
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.03, 0.28);
    root.add(collar);

    const nameTag = createNameTag(familiar.nickname || familiar.name, familiarColor.getStyle());
    if (nameTag) {
      root.add(nameTag);
    }

    scene.add(root);
    setReady(true);

    const target = new THREE.Vector3(0, 0, 0);
    const desired = new THREE.Vector3(0, 0, 0);
    const clock = new THREE.Clock();
    let roamTimer = 0;
    let pauseTimer = 0;
    let isWalking = false;
    let pathStep = 0;
    const pathTargets = [
      new THREE.Vector3(0.52, 0, -0.08),
      new THREE.Vector3(0.42, 0, 0.34),
      new THREE.Vector3(0.06, 0, 0.56),
      new THREE.Vector3(-0.34, 0, 0.38),
      new THREE.Vector3(-0.62, 0, 0.04),
      new THREE.Vector3(-0.46, 0, -0.34),
      new THREE.Vector3(-0.06, 0, -0.56),
      new THREE.Vector3(0.34, 0, -0.42),
    ];
    let tapCooldown = 0;

    function pickDestination() {
      const nextTarget = pathTargets[pathStep % pathTargets.length];
      desired.copy(nextTarget);
      pathStep += 1;
      pauseTimer = 0;
      isWalking = true;
    }

    pickDestination();

    function resize() {
      const width = hostElement.clientWidth;
      const height = hostElement.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (tapCooldown > 0) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const hits = raycaster.intersectObjects(root.children, true);
      if (hits.length > 0) {
        tapCooldown = 1.1;
        onTap?.();
      }
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", resize);

    let animationFrame = 0;
    const animate = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      tapCooldown = Math.max(0, tapCooldown - dt);
      roamTimer += dt;

      if (pauseTimer > 0) {
        pauseTimer -= dt;
        isWalking = false;
      } else {
        const dx = desired.x - target.x;
        const dz = desired.z - target.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.04) {
      pauseTimer = pathStep % 8 === 0 ? 0.5 : 0.18;
      if (pathStep % 8 === 0) {
        desired.set(0.52, 0, -0.08);
      }
      pickDestination();
        } else {
          isWalking = true;
          target.x += dx * dt * 1.35;
          target.z += dz * dt * 1.2;
          target.x = THREE.MathUtils.clamp(target.x, root.userData.bounds.minX, root.userData.bounds.maxX);
          target.z = THREE.MathUtils.clamp(target.z, root.userData.bounds.minZ, root.userData.bounds.maxZ);
          const angle = Math.atan2(dx, dz);
          root.rotation.y = THREE.MathUtils.lerp(
            root.rotation.y,
            angle,
            0.14,
          );
        }
      }

      root.position.x = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(root.position.x, target.x, 0.26),
        root.userData.bounds.minX,
        root.userData.bounds.maxX,
      );
      root.position.z = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(root.position.z, target.z, 0.22),
        root.userData.bounds.minZ,
        root.userData.bounds.maxZ,
      );
      root.position.y = 1.04 + Math.sin(roamTimer * species.bounce) * 0.014;
      root.rotation.z = Math.sin(roamTimer * 1.2) * 0.015;

      const walk = isWalking ? Math.sin(roamTimer * species.stride) : Math.sin(roamTimer * 4) * 0.12;
      leftLeg.rotation.x = walk * 0.78;
      rightLeg.rotation.x = -walk * 0.78;
      leftLeg.position.y = -0.5 + Math.abs(walk) * 0.05;
      rightLeg.position.y = -0.5 + Math.abs(Math.sin(roamTimer * 12 + Math.PI)) * 0.05;
      tail.rotation.y = Math.sin(roamTimer * 4.5) * 0.3;
      head.rotation.x = Math.sin(roamTimer * 1.8) * 0.04 + (isWalking ? 0.02 : 0);
      head.rotation.y = Math.sin(roamTimer * 1.6) * 0.05;
      body.rotation.z = Math.sin(roamTimer * 2.4) * 0.012;
      if (nameTag) {
        nameTag.position.set(0, 1.02 + Math.sin(roamTimer * 2.2) * 0.04, 0);
      }
      camera.lookAt(root.position.x, 0.72, root.position.z + 0.1);

      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.dispose();
      root.traverse((obj) => {
        if (obj.userData.dispose) {
          obj.userData.dispose();
        }
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const material = obj.material;
          if (Array.isArray(material)) {
            material.forEach((m) => m.dispose());
          } else {
            material.dispose();
          }
        }
      });
      hostElement.removeChild(renderer.domElement);
    };
  }, [familiar, familiarColor, onTap]);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      aria-label={`Familier 3D ${familiar.nickname || familiar.name}`}
    >
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-[0.2em] text-ivory/50">
          Chargement du familier 3D…
        </div>
      )}
    </div>
  );
}
