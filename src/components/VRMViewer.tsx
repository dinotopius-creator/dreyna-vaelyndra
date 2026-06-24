import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import clsx from "clsx";

interface Props {
  src: string;
  alt?: string;
  className?: string;
  autoRotate?: boolean;
  interactive?: boolean;
}

export function VRMViewer({
  src,
  alt = "Avatar VRM",
  className,
  autoRotate = true,
  interactive = true,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canvasClass = useMemo(
    () =>
      clsx(
        "relative overflow-hidden rounded-2xl border border-gold-400/30 bg-night-900/60",
        className,
      ),
    [className],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let mounted = true;
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let loading = true;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b1020");
    scene.fog = new THREE.Fog("#0b1020", 2.5, 6.5);

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    camera.position.set(0, 1.45, 2.8);

    const ambient = new THREE.AmbientLight(0xffffff, 2.1);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(1.8, 3, 2.5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight("#8b5cf6", 1.1);
    fillLight.position.set(-2, 1.2, 1.8);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight("#f59e0b", 0.8);
    rimLight.position.set(0, 2.5, -2.8);
    scene.add(rimLight);

    const groundGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.8, 48),
      new THREE.MeshBasicMaterial({
        color: "#12091f",
        transparent: true,
        opacity: 0.35,
      }),
    );
    groundGlow.rotation.x = -Math.PI / 2;
    groundGlow.position.y = -1.25;
    scene.add(groundGlow);

    const load = async () => {
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(host.clientWidth, host.clientHeight, false);
        host.replaceChildren(renderer.domElement);

        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));

        const gltf = await loader.loadAsync(src);
        if (!mounted) return;

        const vrm = gltf.userData.vrm;
        if (!vrm) {
          throw new Error("Le fichier ne contient pas de VRM lisible.");
        }

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);

        vrm.scene.position.set(0, -1.15, 0);
        vrm.scene.rotation.y = Math.PI;
        vrm.scene.scale.setScalar(1.05);
        scene.add(vrm.scene);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableZoom = false;
        controls.enablePan = false;
        controls.enableDamping = true;
        controls.autoRotate = autoRotate;
        controls.autoRotateSpeed = 0.8;
        controls.target.set(0, 0.55, 0);
        controls.update();

        const clock = new THREE.Clock();

        const animate = () => {
          if (!mounted || !renderer) return;
          frame = requestAnimationFrame(animate);
          const delta = clock.getDelta();
          if (vrm) {
            vrm.update(delta);
          }
          if (controls) controls.update();
          renderer.render(scene, camera);
        };

        const onResize = () => {
          if (!renderer || !host) return;
          const width = host.clientWidth || 1;
          const height = host.clientHeight || 1;
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
        };

        resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(host);
        onResize();
        animate();
        loading = false;
      } catch (err) {
        console.error("VRMViewer error", err);
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : "Impossible de charger le modèle VRM.",
          );
        }
      }
    };

    void load();

    return () => {
      mounted = false;
      cancelAnimationFrame(frame);
      controls?.dispose();
      renderer?.dispose();
      resizeObserver?.disconnect();
      if (host && host.contains(renderer?.domElement ?? null)) {
        host.replaceChildren();
      }
      void loading;
    };
  }, [src, autoRotate, interactive]);

  return (
    <div ref={hostRef} className={canvasClass}>
      {error ? (
        <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-rose-200">
          {error}
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.22em] text-gold-200/70">
          Chargement de {alt}…
        </div>
      )}
    </div>
  );
}
