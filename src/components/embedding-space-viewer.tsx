"use client";

import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import type { EmbeddingMapLink, EmbeddingMapNode } from "@/lib/demo-types";
import { formatMapKind, uiCopy } from "@/lib/ui-copy";

import styles from "./embedding-space.module.css";

type AxisPair = "xy" | "xz" | "yz";
type CameraPreset = "isometric" | "front" | "side" | "top";
type DisplayMode = "3d" | "2d";

interface PositionedNode {
  color: string;
  node: EmbeddingMapNode;
  position: [number, number, number];
  radius: number;
}

interface SceneBounds {
  center: [number, number, number];
  extent: number;
  max: [number, number, number];
  min: [number, number, number];
  radius: number;
}

const SCENE_SCALE = 2.65;

function easeInOutCubic(value: number) {
  if (value < 0.5) {
    return 4 * value * value * value;
  }

  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function getColorForKind(kind: EmbeddingMapNode["kind"]) {
  if (kind === "support") {
    return "#f2a44f";
  }

  if (kind === "enhancement") {
    return "#0f9d87";
  }

  if (kind === "incident") {
    return "#2d66c3";
  }

  if (kind === "centroid") {
    return "#9d6b37";
  }

  if (kind === "example") {
    return "#b7583d";
  }

  return "#18253c";
}

function getNodeLabel(node: EmbeddingMapNode) {
  if (node.kind === "query") {
    return "Query";
  }

  if (node.kind === "example") {
    return node.id.replace("example-query:", "Example ");
  }

  if (node.kind === "centroid") {
    return node.overlayFamily
      ? `${node.overlayFamily} centroid`
      : "Centroid";
  }

  if (node.sourceId && node.segmentLabel && node.segmentLabel !== "record") {
    return `${node.sourceId}:${node.segmentLabel}`;
  }

  return node.sourceId ?? node.id;
}

function getNodeRadius(node: EmbeddingMapNode, isHighlighted: boolean) {
  let radius =
    node.kind === "query"
      ? 0.17
      : node.kind === "example"
        ? 0.126
        : node.kind === "centroid"
          ? 0.128
          : node.kind === "enhancement"
            ? 0.112
            : node.kind === "incident"
              ? 0.108
              : 0.104;

  if (isHighlighted) {
    radius *= 1.12;
  } else if ((node.score ?? 0) >= 0.82) {
    radius *= 1.05;
  }

  return radius;
}

function getScenePosition(
  node: EmbeddingMapNode,
  displayMode: DisplayMode,
  axisPair: AxisPair,
): [number, number, number] {
  if (displayMode === "2d") {
    if (axisPair === "xz") {
      return [node.x * SCENE_SCALE, node.z * SCENE_SCALE, 0];
    }

    if (axisPair === "yz") {
      return [node.y * SCENE_SCALE, node.z * SCENE_SCALE, 0];
    }

    return [node.x * SCENE_SCALE, node.y * SCENE_SCALE, 0];
  }

  return [node.x * SCENE_SCALE, node.y * SCENE_SCALE, node.z * SCENE_SCALE];
}

function computeSceneBounds(points: Array<[number, number, number]>): SceneBounds {
  if (!points.length) {
    return {
      center: [0, 0, 0],
      extent: 3,
      max: [1, 1, 1],
      min: [-1, -1, -1],
      radius: 3,
    };
  }

  const min: [number, number, number] = [...points[0]];
  const max: [number, number, number] = [...points[0]];

  for (const point of points) {
    min[0] = Math.min(min[0], point[0]);
    min[1] = Math.min(min[1], point[1]);
    min[2] = Math.min(min[2], point[2]);
    max[0] = Math.max(max[0], point[0]);
    max[1] = Math.max(max[1], point[1]);
    max[2] = Math.max(max[2], point[2]);
  }

  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const maxDistance = points.reduce((largest, point) => {
    const dx = point[0] - center[0];
    const dy = point[1] - center[1];
    const dz = point[2] - center[2];
    return Math.max(largest, Math.sqrt(dx * dx + dy * dy + dz * dz));
  }, 0);
  const radius = Math.max(maxDistance, 2.2);

  return {
    center,
    extent: Math.max(radius * 1.08, 2.75),
    max,
    min,
    radius,
  };
}

function getCameraDirection(displayMode: DisplayMode, cameraPreset: CameraPreset) {
  if (displayMode === "2d") {
    return new THREE.Vector3(0, 0, 1);
  }

  if (cameraPreset === "front") {
    return new THREE.Vector3(0, 0.08, 1).normalize();
  }

  if (cameraPreset === "side") {
    return new THREE.Vector3(1, 0.08, 0).normalize();
  }

  if (cameraPreset === "top") {
    return new THREE.Vector3(0.04, 1, 0.04).normalize();
  }

  return new THREE.Vector3(1.15, 0.82, 1.25).normalize();
}

function getCameraUp(displayMode: DisplayMode, cameraPreset: CameraPreset) {
  if (displayMode === "3d" && cameraPreset === "top") {
    return new THREE.Vector3(0, 0, -1);
  }

  return new THREE.Vector3(0, 1, 0);
}

function CameraController({
  autoRotate,
  bounds,
  cameraPreset,
  displayMode,
}: {
  autoRotate: boolean;
  bounds: SceneBounds;
  cameraPreset: CameraPreset;
  displayMode: DisplayMode;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const transitionRef = useRef({
    active: true,
    duration: 0.7,
    elapsed: 0,
    fromPosition: new THREE.Vector3(0, 0, 9),
    fromTarget: new THREE.Vector3(0, 0, 0),
    toPosition: new THREE.Vector3(0, 0, 9),
    toTarget: new THREE.Vector3(0, 0, 0),
    toUp: new THREE.Vector3(0, 1, 0),
  });

  useEffect(() => {
    const controls = controlsRef.current;
    const target = new THREE.Vector3(...bounds.center);
    const distance = bounds.radius * (displayMode === "3d" ? 3.25 : 2.45);
    const direction = getCameraDirection(displayMode, cameraPreset);
    const up = getCameraUp(displayMode, cameraPreset);

    transitionRef.current = {
      active: true,
      duration: 0.7,
      elapsed: 0,
      fromPosition: camera.position.clone(),
      fromTarget: controls?.target?.clone?.() ?? target.clone(),
      toPosition: target.clone().add(direction.multiplyScalar(distance)),
      toTarget: target,
      toUp: up,
    };
  }, [
    bounds.center,
    bounds.radius,
    camera,
    cameraPreset,
    displayMode,
  ]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    const transition = transitionRef.current;

    if (transition.active) {
      transition.elapsed = Math.min(
        transition.duration,
        transition.elapsed + delta,
      );
      const eased = easeInOutCubic(transition.elapsed / transition.duration);

      camera.position.lerpVectors(
        transition.fromPosition,
        transition.toPosition,
        eased,
      );
      camera.up.lerp(transition.toUp, 0.18);

      if (controls?.target) {
        controls.target.lerpVectors(
          transition.fromTarget,
          transition.toTarget,
          eased,
        );
      }

      camera.lookAt(controls?.target ?? transition.toTarget);
      controls?.update();

      if (transition.elapsed >= transition.duration) {
        transition.active = false;
      }

      return;
    }

    controls?.update();
  });

  return (
    <OrbitControls
      autoRotate={autoRotate && displayMode === "3d"}
      autoRotateSpeed={0.72}
      enablePan={displayMode === "3d"}
      enableRotate={displayMode === "3d"}
      enableZoom
      maxDistance={bounds.radius * 5.5}
      minDistance={Math.max(bounds.radius * 1.08, 1.8)}
      ref={controlsRef}
    />
  );
}

function SceneGuides({
  axisPair,
  bounds,
  displayMode,
}: {
  axisPair: AxisPair;
  bounds: SceneBounds;
  displayMode: DisplayMode;
}) {
  const [centerX, centerY, centerZ] = bounds.center;
  const extent = bounds.extent;
  const frameColor = "#e7dfd4";
  const axisColors = {
    horizontal: "#e4a55d",
    vertical: "#239784",
    depth: "#5877bc",
  };
  const horizontalAxis = displayMode === "2d" && axisPair === "yz" ? "Y" : "X";
  const verticalAxis = displayMode === "2d"
    ? axisPair === "xy"
      ? "Y"
      : "Z"
    : "Y";
  const depthAxis = displayMode === "3d" ? "Z" : null;
  const frameLines =
    displayMode === "3d"
      ? [
          [[centerX - extent, centerY - extent, centerZ - extent], [centerX + extent, centerY - extent, centerZ - extent]],
          [[centerX + extent, centerY - extent, centerZ - extent], [centerX + extent, centerY + extent, centerZ - extent]],
          [[centerX + extent, centerY + extent, centerZ - extent], [centerX - extent, centerY + extent, centerZ - extent]],
          [[centerX - extent, centerY + extent, centerZ - extent], [centerX - extent, centerY - extent, centerZ - extent]],
          [[centerX - extent, centerY - extent, centerZ + extent], [centerX + extent, centerY - extent, centerZ + extent]],
          [[centerX + extent, centerY - extent, centerZ + extent], [centerX + extent, centerY + extent, centerZ + extent]],
          [[centerX + extent, centerY + extent, centerZ + extent], [centerX - extent, centerY + extent, centerZ + extent]],
          [[centerX - extent, centerY + extent, centerZ + extent], [centerX - extent, centerY - extent, centerZ + extent]],
          [[centerX - extent, centerY - extent, centerZ - extent], [centerX - extent, centerY - extent, centerZ + extent]],
          [[centerX + extent, centerY - extent, centerZ - extent], [centerX + extent, centerY - extent, centerZ + extent]],
          [[centerX + extent, centerY + extent, centerZ - extent], [centerX + extent, centerY + extent, centerZ + extent]],
          [[centerX - extent, centerY + extent, centerZ - extent], [centerX - extent, centerY + extent, centerZ + extent]],
        ]
      : [
          [[centerX - extent, centerY - extent, 0], [centerX + extent, centerY - extent, 0]],
          [[centerX + extent, centerY - extent, 0], [centerX + extent, centerY + extent, 0]],
          [[centerX + extent, centerY + extent, 0], [centerX - extent, centerY + extent, 0]],
          [[centerX - extent, centerY + extent, 0], [centerX - extent, centerY - extent, 0]],
        ];

  return (
    <>
      <ambientLight intensity={0.82} />
      <directionalLight color="#fff7e8" intensity={1.02} position={[6, 7, 4]} />
      <directionalLight color="#dbe8f2" intensity={0.22} position={[-5, -2, -6]} />
      {displayMode === "3d" ? (
        <gridHelper
          args={[extent * 2.2, 8, "#e6ddd1", "#f2eadf"]}
          position={[centerX, bounds.min[1] - extent * 0.34, centerZ]}
        />
      ) : (
        <mesh position={[centerX, centerY, -0.06]}>
          <planeGeometry args={[extent * 2.1, extent * 2.1]} />
          <meshBasicMaterial color="#fbf7ef" opacity={0.4} transparent />
        </mesh>
      )}

      {frameLines.map((points, index) => (
        <Line
          color={frameColor}
          key={`frame-${index}`}
          lineWidth={1}
          opacity={0.14}
          points={points as [number, number, number][]}
          transparent
        />
      ))}

      <Line
        color={axisColors.horizontal}
        lineWidth={1}
        opacity={0.2}
        points={[
          [centerX - extent - 0.2, centerY, displayMode === "3d" ? centerZ : 0],
          [centerX + extent + 0.2, centerY, displayMode === "3d" ? centerZ : 0],
        ]}
        transparent
      />
      <Line
        color={axisColors.vertical}
        lineWidth={1}
        opacity={0.19}
        points={[
          [centerX, centerY - extent - 0.2, displayMode === "3d" ? centerZ : 0],
          [centerX, centerY + extent + 0.2, displayMode === "3d" ? centerZ : 0],
        ]}
        transparent
      />
      {displayMode === "3d" ? (
        <Line
          color={axisColors.depth}
          lineWidth={1}
          opacity={0.16}
          points={[
            [centerX, centerY, centerZ - extent - 0.2],
            [centerX, centerY, centerZ + extent + 0.2],
          ]}
          transparent
        />
      ) : null}

      <Html
        className={styles.axisLabel}
        position={[centerX + extent + 0.44, centerY, displayMode === "3d" ? centerZ : 0]}
        sprite
      >
        {horizontalAxis}
      </Html>
      <Html
        className={styles.axisLabel}
        position={[centerX, centerY + extent + 0.44, displayMode === "3d" ? centerZ : 0]}
        sprite
      >
        {verticalAxis}
      </Html>
      {depthAxis ? (
        <Html
          className={styles.axisLabel}
          position={[centerX, centerY, centerZ + extent + 0.44]}
          sprite
        >
          {depthAxis}
        </Html>
      ) : null}
    </>
  );
}

function NodeMarker({
  isHighlighted,
  isHovered,
  isSelected,
  node,
  onHover,
  onSelect,
  position,
  radius,
}: {
  isHighlighted: boolean;
  isHovered: boolean;
  isSelected: boolean;
  node: EmbeddingMapNode;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  position: [number, number, number];
  radius: number;
}) {
  const color = getColorForKind(node.kind);

  return (
    <group
      onClick={(event) => {
        event.stopPropagation();
        onSelect(node.id);
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        onHover(null);

        if (typeof document !== "undefined") {
          document.body.style.cursor = "";
        }
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHover(node.id);

        if (typeof document !== "undefined") {
          document.body.style.cursor = "pointer";
        }
      }}
      position={position}
    >
      {isSelected ? (
        <mesh renderOrder={1}>
          <sphereGeometry args={[radius * 1.8, 24, 24]} />
          <meshBasicMaterial color={color} opacity={0.12} transparent />
        </mesh>
      ) : null}

      {node.kind === "query" ? (
        <mesh renderOrder={1}>
          <sphereGeometry args={[radius * 1.45, 24, 24]} />
          <meshBasicMaterial color={color} opacity={0.16} transparent />
        </mesh>
      ) : null}

      <mesh castShadow receiveShadow>
        <sphereGeometry args={[radius, 28, 28]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isHighlighted ? 0.18 : 0.06}
          metalness={0.14}
          roughness={0.42}
        />
      </mesh>

      {isSelected || node.kind === "query" ? (
        <Html
          className={`${styles.sceneLabel} ${isSelected ? styles.sceneLabelActive : ""}`}
          position={[0, radius + 0.26, 0]}
          sprite
        >
          {getNodeLabel(node)}
        </Html>
      ) : null}

      {isHovered ? (
        <Html position={[0, radius + 0.72, 0]} sprite>
          <div className={styles.sceneTooltip}>
            <span>{formatMapKind(node.kind)}</span>
            <strong>{node.title}</strong>
            {node.kind === "example" ? (
              <em>{uiCopy.semanticMapPage.viewer.exampleTag}</em>
            ) : null}
            {node.kind === "query" ? (
              <em>{uiCopy.semanticMapPage.viewer.queryTag}</em>
            ) : null}
            {node.overlayFamily ? <em>{node.overlayFamily}</em> : null}
            {node.segmentLabel && node.segmentLabel !== "record" ? (
              <em>{node.segmentLabel}</em>
            ) : null}
            {typeof node.score === "number" ? (
              <em>{node.score.toFixed(3)}</em>
            ) : null}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

export function EmbeddingSpaceViewer({
  autoRotate,
  axisPair,
  cameraPreset,
  displayMode,
  links,
  nodes,
  onSelect,
  selectedId,
}: {
  autoRotate: boolean;
  axisPair: AxisPair;
  cameraPreset: CameraPreset;
  displayMode: DisplayMode;
  links: EmbeddingMapLink[];
  nodes: EmbeddingMapNode[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (typeof document !== "undefined") {
        document.body.style.cursor = "";
      }
    };
  }, []);

  const linkedIds = useMemo(
    () => new Set(links.map((link) => link.targetId)),
    [links],
  );
  const labelIds = useMemo(
    () => new Set(["query-point", selectedId ?? ""]),
    [selectedId],
  );

  const positionedNodes = useMemo<PositionedNode[]>(
    () =>
      nodes.map((node) => {
        const isHighlighted =
          node.id === "query-point" ||
          node.id === selectedId ||
          linkedIds.has(node.id);

        return {
          color: getColorForKind(node.kind),
          node,
          position: getScenePosition(node, displayMode, axisPair),
          radius: getNodeRadius(node, isHighlighted),
        };
      }),
    [axisPair, displayMode, linkedIds, nodes, selectedId],
  );

  const bounds = useMemo(
    () => computeSceneBounds(positionedNodes.map((entry) => entry.position)),
    [positionedNodes],
  );

  const positionedLookup = useMemo(
    () => new Map(positionedNodes.map((entry) => [entry.node.id, entry])),
    [positionedNodes],
  );

  return (
    <div className={styles.viewerCanvas}>
      <Canvas
        camera={{ fov: 42, near: 0.1, far: 120, position: [0, 0, 10] }}
        dpr={[1, 2]}
        gl={{ alpha: false, antialias: true }}
        onPointerMissed={() => {
          setHoveredId(null);

          if (typeof document !== "undefined") {
            document.body.style.cursor = "";
          }
        }}
      >
        <color attach="background" args={["#fbf7ef"]} />
        <fog attach="fog" args={["#fbf7ef", bounds.radius * 3.2, bounds.radius * 6.2]} />

        <CameraController
          autoRotate={autoRotate}
          bounds={bounds}
          cameraPreset={cameraPreset}
          displayMode={displayMode}
        />
        <SceneGuides axisPair={axisPair} bounds={bounds} displayMode={displayMode} />

        {links.map((link) => {
          const source = positionedLookup.get(link.sourceId);
          const target = positionedLookup.get(link.targetId);

          if (!source || !target) {
            return null;
          }

          return (
            <Line
              color="#25324b"
              key={`${link.sourceId}:${link.targetId}`}
              lineWidth={1 + link.score}
              opacity={0.05 + link.score * 0.16}
              points={[source.position, target.position]}
              transparent
            />
          );
        })}

        {positionedNodes.map((entry) => (
          <NodeMarker
            isHighlighted={labelIds.has(entry.node.id)}
            isHovered={hoveredId === entry.node.id}
            isSelected={selectedId === entry.node.id}
            key={entry.node.id}
            node={entry.node}
            onHover={setHoveredId}
            onSelect={onSelect}
            position={entry.position}
            radius={entry.radius}
          />
        ))}
      </Canvas>
    </div>
  );
}
