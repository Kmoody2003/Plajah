import React, { useRef, useMemo, useState, memo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useTexture, OrbitControls, PerspectiveCamera, Float } from '@react-three/drei';
import * as THREE from 'three';

interface SpatialImageProps {
  url: string;
  is3D?: boolean;
}

// Low-poly performance geometry
const PLANE_GEO = new THREE.PlaneGeometry(10, 10, 32, 32);

const ImagePlane: React.FC<{ url: string }> = memo(({ url }) => {
  // Use lower resolution for faster spatialization if needed
  const texture = useTexture(url);
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Performance: share geometry across all instances
  const geo = useMemo(() => PLANE_GEO, []);

  const shaderArgs = useMemo(() => ({
    uniforms: {
      uTexture: { value: texture },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uTime: { value: 0 },
      uDepthStrength: { value: 0.5 },
    },
    vertexShader: `
      varying vec2 vUv;
      uniform vec2 uMouse;
      uniform float uDepthStrength;
      
      void main() {
        vUv = uv;
        
        // Displacement mapping based on brightness (pseudo-depth)
        vec4 texColor = texture2D(uTexture, uv);
        float brightness = (texColor.r + texColor.g + texColor.b) / 3.0;
        
        vec3 newPos = position;
        // Move vertex along Z based on brightness and mouse parallax
        newPos.z += brightness * uDepthStrength * (0.5 + 0.5 * sin(uTime * 0.2));
        newPos.z += (uMouse.x + uMouse.y) * brightness * 0.2;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uTexture;
      uniform vec2 uMouse;
      varying vec2 vUv;

      void main() {
        vec2 uv = vUv;
        // Sample with slight chromatic aberration for "rendered" feel
        float r = texture2D(uTexture, uv + uMouse * 0.005).r;
        float g = texture2D(uTexture, uv).g;
        float b = texture2D(uTexture, uv - uMouse * 0.005).b;
        
        gl_FragColor = vec4(r, g, b, 1.0);
      }
    `
  }), [texture]);

  useFrame((state) => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.ShaderMaterial;
      material.uniforms.uMouse.value.lerp(
        new THREE.Vector2(state.mouse.x, state.mouse.y),
        0.05
      );
      material.uniforms.uTime.value = state.clock.getElapsedTime();
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.1} floatIntensity={0.2}>
      <mesh ref={meshRef} geometry={geo}>
        <shaderMaterial 
          {...shaderArgs} 
          transparent 
          side={THREE.DoubleSide}
        />
      </mesh>
    </Float>
  );
});

const SpatialImage: React.FC<SpatialImageProps> = memo(({ url, is3D }) => {
  const [hasError, setHasError] = useState(false);

  if (!is3D || hasError) {
    return (
      <div className="w-full h-full relative overflow-hidden rounded-[2rem] bg-white/5">
        <img 
          src={url || null} 
          alt="Spatialized source" 
          className="w-full h-full object-cover transition-all duration-700 hover:scale-110"
          loading="lazy"
          decoding="async"
          onError={() => setHasError(true)}
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full relative rounded-[2rem] overflow-hidden bg-black/40 backdrop-blur-3xl border border-white/5 group shadow-inner">
      <Canvas 
        className="w-full h-full" 
        gl={{ 
          antialias: false, // Performance: disable antialias for speed on 3D objects 
          alpha: true,
          powerPreference: "high-performance"
        }}
        dpr={[1, 2]} // Performance: limit pixel ratio
      >
        <PerspectiveCamera makeDefault position={[0, 0, 12]} fov={45} />
        <ambientLight intensity={0.7} />
        <pointLight position={[5, 5, 5]} intensity={0.5} />
        <React.Suspense fallback={
          <mesh>
            <planeGeometry args={[10, 10]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.1} wireframe />
          </mesh>
        }>
          <ImagePlane url={url} />
        </React.Suspense>
        <OrbitControls 
          enableZoom={false} 
          enablePan={false} 
          maxPolarAngle={Math.PI / 1.6} 
          minPolarAngle={Math.PI / 2.4}
        />
      </Canvas>
      
      {/* HUD Info */}
      <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="text-[7px] font-black uppercase tracking-[0.4em] text-cyan-400">Meta SAM 2 Subspace Active</span>
          </div>
          <span className="text-[7px] font-bold text-white/20 uppercase tracking-widest">3D Projection: Standard</span>
        </div>
      </div>
    </div>
  );
});

export default SpatialImage;
