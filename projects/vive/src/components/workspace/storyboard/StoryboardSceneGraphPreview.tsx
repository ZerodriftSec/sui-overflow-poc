import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, TransformControls } from "@react-three/drei";
import type { Mesh } from "three";
import type {
  StoryboardSceneGraph,
  StoryboardSceneObject,
  StoryboardSceneVector3,
} from "../../../lib/project";
import { cn } from "../../../lib/utils";

function toTuple(vector: StoryboardSceneVector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function CameraTarget({ target }: { target: StoryboardSceneVector3 }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.lookAt(target.x, target.y, target.z);
    camera.updateProjectionMatrix();
  }, [camera, target.x, target.y, target.z]);

  return null;
}

function ScenePrimitive({
  object,
  selected,
  onPointerDown,
  meshRef,
}: {
  object: StoryboardSceneObject;
  selected: boolean;
  onPointerDown?: () => void;
  meshRef?: (mesh: Mesh | null) => void;
}) {
  const position = toTuple(object.position);
  const rotation = toTuple(object.rotation);
  const scale = toTuple(object.scale);
  const material = (
    <meshStandardMaterial
      color={object.color}
      emissive={selected ? "#202020" : "#000000"}
      emissiveIntensity={selected ? 0.6 : 0}
    />
  );

  if (object.primitive === "sphere") {
    return (
      <mesh
        ref={meshRef}
        position={position}
        rotation={rotation}
        scale={scale}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown?.();
        }}
      >
        <sphereGeometry args={[0.5, 20, 20]} />
        {material}
      </mesh>
    );
  }

  if (object.primitive === "capsule") {
    return (
      <mesh
        ref={meshRef}
        position={position}
        rotation={rotation}
        scale={scale}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown?.();
        }}
      >
        <capsuleGeometry args={[0.35, 1, 8, 16]} />
        {material}
      </mesh>
    );
  }

  if (object.primitive === "cylinder") {
    return (
      <mesh
        ref={meshRef}
        position={position}
        rotation={rotation}
        scale={scale}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown?.();
        }}
      >
        <cylinderGeometry args={[0.5, 0.5, 1, 16]} />
        {material}
      </mesh>
    );
  }

  if (object.primitive === "cone") {
    return (
      <mesh
        ref={meshRef}
        position={position}
        rotation={rotation}
        scale={scale}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown?.();
        }}
      >
        <coneGeometry args={[0.5, 1, 16]} />
        {material}
      </mesh>
    );
  }

  if (object.primitive === "plane") {
    return (
      <mesh
        ref={meshRef}
        position={position}
        rotation={rotation}
        scale={scale}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown?.();
        }}
      >
        <planeGeometry args={[1, 1]} />
        {material}
      </mesh>
    );
  }

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={rotation}
      scale={scale}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown?.();
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      {material}
    </mesh>
  );
}

type TransformMode = "translate" | "rotate" | "scale";

interface StoryboardSceneGraphPreviewProps {
  graph: StoryboardSceneGraph;
  className?: string;
  editable?: boolean;
  onGraphChange?: (graph: StoryboardSceneGraph) => void;
}

export const StoryboardSceneGraphPreview = memo(function StoryboardSceneGraphPreview({
  graph,
  className,
  editable = false,
  onGraphChange,
}: StoryboardSceneGraphPreviewProps) {
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(
    graph.objects[0]?.id ?? null,
  );
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const meshRefs = useRef<Map<string, Mesh>>(new Map());

  useEffect(() => {
    if (!selectedObjectId || !graph.objects.some((object) => object.id === selectedObjectId)) {
      setSelectedObjectId(graph.objects[0]?.id ?? null);
    }
  }, [graph.objects, selectedObjectId]);

  const selectedMesh = useMemo(() => {
    if (!selectedObjectId) return null;
    return meshRefs.current.get(selectedObjectId) ?? null;
  }, [selectedObjectId, graph.objects]);

  function commitTransformFromMesh(): void {
    if (!editable || !onGraphChange || !selectedObjectId) return;
    const mesh = meshRefs.current.get(selectedObjectId);
    if (!mesh) return;

    const nextGraph: StoryboardSceneGraph = {
      ...graph,
      objects: graph.objects.map((object) => {
        if (object.id !== selectedObjectId) return object;
        return {
          ...object,
          position: {
            x: mesh.position.x,
            y: mesh.position.y,
            z: mesh.position.z,
          },
          rotation: {
            x: mesh.rotation.x,
            y: mesh.rotation.y,
            z: mesh.rotation.z,
          },
          scale: {
            x: mesh.scale.x,
            y: mesh.scale.y,
            z: mesh.scale.z,
          },
        };
      }),
    };

    onGraphChange(nextGraph);
  }

  return (
    <div className={cn("relative h-full w-full", className)}>
      {editable ? (
        <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded border border-border-subtle bg-bg-panel/95 p-1">
          {(["translate", "rotate", "scale"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setTransformMode(mode)}
              className={cn(
                "rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                transformMode === mode
                  ? "bg-resolve-accent text-white"
                  : "text-text-secondary hover:bg-bg-raised",
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      ) : null}
      <Canvas
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 1.5]}
        camera={{
          position: toTuple(graph.camera.position),
          fov: graph.camera.fov,
          near: 0.1,
          far: 200,
        }}
      >
        <CameraTarget target={graph.camera.target} />
        {editable ? (
          <OrbitControls
            makeDefault
            enablePan
            enableRotate
            enableZoom
            target={toTuple(graph.camera.target)}
          />
        ) : null}
        {graph.lights.map((light) =>
          light.type === "ambient" ? (
            <ambientLight key={light.id} color={light.color} intensity={light.intensity} />
          ) : (
            <directionalLight
              key={light.id}
              color={light.color}
              intensity={light.intensity}
              position={
                light.position
                  ? toTuple(light.position)
                  : ([3, 5, 4] as [number, number, number])
              }
            />
          ),
        )}
        {graph.ground?.enabled ? (
          <mesh
            position={[0, 0, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[graph.ground.size, graph.ground.size]} />
            <meshStandardMaterial color={graph.ground.color} />
          </mesh>
        ) : null}
        {graph.objects.map((object) => {
          const selected = object.id === selectedObjectId;
          return (
            <ScenePrimitive
              key={object.id}
              object={object}
              selected={selected}
              onPointerDown={editable ? () => setSelectedObjectId(object.id) : undefined}
              meshRef={(mesh) => {
                if (!mesh) {
                  meshRefs.current.delete(object.id);
                  return;
                }
                meshRefs.current.set(object.id, mesh);
              }}
            />
          );
        })}
        {editable && selectedMesh ? (
          <TransformControls
            object={selectedMesh}
            mode={transformMode}
            onMouseUp={commitTransformFromMesh}
          />
        ) : null}
      </Canvas>
    </div>
  );
});
