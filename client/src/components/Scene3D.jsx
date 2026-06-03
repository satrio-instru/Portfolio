import React, { Suspense, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sparkles, Stars } from "@react-three/drei";
import { useLocation } from "react-router-dom";
import { Astronaut } from "./Astronaut";
import Loader from "./Loader";
import { palette } from "../config/palette";

const routeSceneMap = {
  "/dashboard": "dashboard",
  "/input": "input",
  "/output": "output",
  "/visualization": "output",
  "/history": "downloads",
  "/settings": "ai-config",
};

function sceneConfig(routeKey) {
  const configs = {
    dashboard: { astronautPosition: [2.2, -1.3, 0], astronautScale: 0.34, floatSpeed: 1.7 },
    input: { astronautPosition: [2.55, -0.8, -0.2], astronautScale: 0.28, floatSpeed: 1.2 },
    output: { astronautPosition: [2.0, -1.15, 0], astronautScale: 0.32, floatSpeed: 1.6 },
    report: { astronautPosition: [2.7, -1.4, 0.1], astronautScale: 0.28, floatSpeed: 1.4 },
    downloads: { astronautPosition: [2.35, -1.0, 0], astronautScale: 0.3, floatSpeed: 1.1 },
    "ai-config": { astronautPosition: [2.6, -1.35, 0], astronautScale: 0.3, floatSpeed: 1.55 },
    guide: { astronautPosition: [2.4, -1.2, 0], astronautScale: 0.3, floatSpeed: 1.25 },
  };
  return configs[routeKey] || configs.dashboard;
}

function SceneAsset({ routeKey, anomalyRate }) {
  if (routeKey === "input") return <UploadCube />;
  if (routeKey === "output") return <ChartSculpture anomalyRate={anomalyRate} />;
  if (routeKey === "report") return <PeopleOrbit />;
  if (routeKey === "downloads") return <DownloadVault />;
  if (routeKey === "ai-config") return <AiChip />;
  if (routeKey === "guide") return <GuideStack />;
  return <DataConstellation anomalyRate={anomalyRate} />;
}

function AnimatedGroup({ children, position, scale = 1, speed = 0.2 }) {
  const groupRef = React.useRef();
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = clock.elapsedTime * speed;
    groupRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.25) * 0.08;
  });
  return (
    <group ref={groupRef} position={position} scale={scale}>
      {children}
    </group>
  );
}

function DataConstellation({ anomalyRate }) {
  const groupRef = React.useRef();
  const bars = useMemo(
    () =>
      Array.from({ length: 28 }, (_, index) => {
        const angle = (index / 28) * Math.PI * 2;
        const radius = 1.25 + (index % 5) * 0.16;
        const height = 0.25 + ((index * 37) % 11) / 14 + anomalyRate * 4;
        return {
          angle,
          radius,
          height,
          color: index % 4 === 0 ? palette.rose : index % 3 === 0 ? palette.amber : palette.cyan,
        };
      }),
    [anomalyRate],
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = clock.elapsedTime * 0.12;
    groupRef.current.rotation.z = Math.sin(clock.elapsedTime * 0.25) * 0.08;
  });

  return (
    <group ref={groupRef} position={[-3.05, 1.1, -0.6]} scale={0.82}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.75, 0.012, 12, 96]} />
        <meshStandardMaterial color={palette.cyan} emissive={palette.cyan} emissiveIntensity={0.8} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, Math.PI / 5]}>
        <torusGeometry args={[2.25, 0.008, 12, 96]} />
        <meshStandardMaterial color={palette.violet} emissive={palette.violet} emissiveIntensity={0.55} />
      </mesh>
      {bars.map((bar) => (
        <mesh
          key={`${bar.angle}-${bar.radius}`}
          position={[Math.cos(bar.angle) * bar.radius, bar.height / 2 - 0.75, Math.sin(bar.angle) * bar.radius]}
        >
          <boxGeometry args={[0.055, bar.height, 0.055]} />
          <meshStandardMaterial color={bar.color} emissive={bar.color} emissiveIntensity={0.7} />
        </mesh>
      ))}
      <mesh>
        <icosahedronGeometry args={[0.38, 1]} />
        <meshStandardMaterial color={palette.green} emissive={palette.green} emissiveIntensity={0.7} wireframe />
      </mesh>
    </group>
  );
}

function UploadCube() {
  return (
    <AnimatedGroup position={[-2.7, 1.2, -0.5]} scale={0.9} speed={0.16}>
      <mesh>
        <boxGeometry args={[1.2, 1.2, 1.2]} />
        <meshStandardMaterial color={palette.cyan} emissive={palette.cyan} emissiveIntensity={0.25} wireframe />
      </mesh>
      {[0, 1, 2, 3].map((index) => (
        <mesh key={index} position={[0, -0.9 - index * 0.24, 0]} rotation={[0, 0, index * 0.12]}>
          <boxGeometry args={[1.6 - index * 0.18, 0.08, 1.1 - index * 0.12]} />
          <meshStandardMaterial color={index % 2 ? palette.green : palette.violet} emissiveIntensity={0.25} emissive={index % 2 ? palette.green : palette.violet} />
        </mesh>
      ))}
      <mesh position={[0, 0.9, 0]} rotation={[0, 0, Math.PI / 4]}>
        <coneGeometry args={[0.35, 0.8, 4]} />
        <meshStandardMaterial color={palette.amber} emissive={palette.amber} emissiveIntensity={0.45} />
      </mesh>
    </AnimatedGroup>
  );
}

function ChartSculpture({ anomalyRate }) {
  const bars = Array.from({ length: 18 }, (_, index) => ({
    height: 0.35 + ((index * 23) % 9) / 5 + anomalyRate * 2,
    x: (index % 6) * 0.32 - 0.8,
    z: Math.floor(index / 6) * 0.34 - 0.3,
    color: index % 3 === 0 ? palette.rose : index % 3 === 1 ? palette.cyan : palette.green,
  }));
  return (
    <AnimatedGroup position={[-2.7, 1.05, -0.55]} scale={0.95} speed={0.18}>
      {bars.map((bar, index) => (
        <mesh key={index} position={[bar.x, bar.height / 2 - 0.75, bar.z]}>
          <boxGeometry args={[0.16, bar.height, 0.16]} />
          <meshStandardMaterial color={bar.color} emissive={bar.color} emissiveIntensity={0.45} />
        </mesh>
      ))}
      <mesh position={[0, -0.82, 0]}>
        <boxGeometry args={[2.2, 0.06, 1.25]} />
        <meshStandardMaterial color={palette.violet} emissive={palette.violet} emissiveIntensity={0.2} />
      </mesh>
    </AnimatedGroup>
  );
}

function PeopleOrbit() {
  return (
    <AnimatedGroup position={[-2.85, 1.05, -0.6]} scale={0.92} speed={0.14}>
      <mesh>
        <torusGeometry args={[1.45, 0.012, 10, 80]} />
        <meshStandardMaterial color={palette.cyan} emissive={palette.cyan} emissiveIntensity={0.65} />
      </mesh>
      {Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        return (
          <group key={index} position={[Math.cos(angle) * 1.45, Math.sin(index) * 0.16, Math.sin(angle) * 1.45]}>
            <mesh position={[0, 0.16, 0]}>
              <sphereGeometry args={[0.09, 16, 16]} />
              <meshStandardMaterial color={index % 2 ? palette.green : palette.amber} emissiveIntensity={0.35} emissive={index % 2 ? palette.green : palette.amber} />
            </mesh>
            <mesh position={[0, -0.06, 0]}>
              <capsuleGeometry args={[0.07, 0.22, 8, 16]} />
              <meshStandardMaterial color={palette.violet} emissive={palette.violet} emissiveIntensity={0.25} />
            </mesh>
          </group>
        );
      })}
    </AnimatedGroup>
  );
}

function DownloadVault() {
  return (
    <AnimatedGroup position={[-2.65, 1.0, -0.55]} scale={0.92} speed={0.12}>
      {[0, 1, 2].map((index) => (
        <mesh key={index} position={[index * 0.55 - 0.55, -0.2 + index * 0.16, 0]}>
          <boxGeometry args={[0.48, 0.48, 0.48]} />
          <meshStandardMaterial color={[palette.cyan, palette.amber, palette.green][index]} emissive={[palette.cyan, palette.amber, palette.green][index]} emissiveIntensity={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 0.85, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.42, 0.95, 3]} />
        <meshStandardMaterial color={palette.rose} emissive={palette.rose} emissiveIntensity={0.45} />
      </mesh>
    </AnimatedGroup>
  );
}

function AiChip() {
  return (
    <AnimatedGroup position={[-2.75, 1.05, -0.55]} scale={0.95} speed={0.2}>
      <mesh>
        <boxGeometry args={[1.6, 1.0, 0.12]} />
        <meshStandardMaterial color={palette.ink} emissive={palette.cyan} emissiveIntensity={0.2} />
      </mesh>
      {Array.from({ length: 20 }, (_, index) => (
        <mesh key={index} position={[(index % 5) * 0.28 - 0.56, Math.floor(index / 5) * 0.2 - 0.3, 0.12]}>
          <sphereGeometry args={[0.035, 12, 12]} />
          <meshStandardMaterial color={index % 4 === 0 ? palette.rose : palette.green} emissive={index % 4 === 0 ? palette.rose : palette.green} emissiveIntensity={0.65} />
        </mesh>
      ))}
      <mesh position={[0, 0, 0.18]}>
        <torusKnotGeometry args={[0.28, 0.018, 80, 8]} />
        <meshStandardMaterial color={palette.violet} emissive={palette.violet} emissiveIntensity={0.8} />
      </mesh>
    </AnimatedGroup>
  );
}

function GuideStack() {
  return (
    <AnimatedGroup position={[-2.75, 0.95, -0.55]} scale={0.92} speed={0.1}>
      {[0, 1, 2, 3, 4].map((index) => (
        <mesh key={index} position={[0, index * 0.18 - 0.45, 0]} rotation={[0.05, 0, index * 0.08]}>
          <boxGeometry args={[1.55 - index * 0.08, 0.12, 1.0]} />
          <meshStandardMaterial color={[palette.cyan, palette.violet, palette.green, palette.amber, palette.rose][index]} emissiveIntensity={0.25} emissive={[palette.cyan, palette.violet, palette.green, palette.amber, palette.rose][index]} />
        </mesh>
      ))}
    </AnimatedGroup>
  );
}

export default function Scene3D({ anomalyRate = 0 }) {
  const location = useLocation();
  const routeKey = routeSceneMap[location.pathname] || "dashboard";
  const scene = sceneConfig(routeKey);

  return (
    <Canvas camera={{ position: [0, 0, 7], fov: 48 }} dpr={[1, 1.6]} gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={["#020610"]} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[4, 4, 6]} intensity={2.4} />
      <pointLight position={[-4, -2, 4]} intensity={1.6} color={palette.rose} />
      <Stars radius={70} depth={30} count={900} factor={3} saturation={0} fade speed={0.45} />
      <Sparkles count={55} speed={0.35} opacity={0.55} size={2.5} color={palette.cyan} />
      <Suspense fallback={<Loader />}>
        <Float speed={scene.floatSpeed} rotationIntensity={0.55} floatIntensity={1.2}>
          <Astronaut position={scene.astronautPosition} rotation={[-Math.PI / 2, -0.35, 2.45]} scale={scene.astronautScale} />
        </Float>
      </Suspense>
      <SceneAsset routeKey={routeKey} anomalyRate={anomalyRate} />
    </Canvas>
  );
}
