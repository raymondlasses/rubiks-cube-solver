import React, { useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const COLOR_PALETTE = {
    'white':  '#F5F5F7',
    'yellow': '#FFD600',
    'green':  '#00B348',
    'blue':   '#0055D4',
    'red':    '#D91E2E',
    'orange': '#FF6500',
    'black':  '#14161B'  // Premium internal speedcube core plastic
};

const CUBE_SIZE = 0.94;
const SPACING = 1.0;

const getAxisAndDirection = (move) => {
    const base = move[0];
    let axis = new THREE.Vector3(0, 1, 0);
    let logicalDirection = -1;

    if (base === 'U') { axis.set(0, 1, 0); logicalDirection = -1; }
    if (base === 'D') { axis.set(0, 1, 0); logicalDirection = 1; }
    if (base === 'R') { axis.set(1, 0, 0); logicalDirection = -1; }
    if (base === 'L') { axis.set(1, 0, 0); logicalDirection = 1; }
    if (base === 'F') { axis.set(0, 0, 1); logicalDirection = -1; }
    if (base === 'B') { axis.set(0, 0, 1); logicalDirection = 1; }

    let angle = Math.PI / 2;
    if (move.includes("'")) { logicalDirection *= -1; }
    if (move.includes("2")) { angle = Math.PI; }

    return { axis, angle: angle * logicalDirection, base };
};

const isCubieInMove = (pos, moveChar) => {
    const threshold = 0.1;
    if (moveChar === 'U' && pos.y > threshold) return true;
    if (moveChar === 'D' && pos.y < -threshold) return true;
    if (moveChar === 'R' && pos.x > threshold) return true;
    if (moveChar === 'L' && pos.x < -threshold) return true;
    if (moveChar === 'F' && pos.z > threshold) return true;
    if (moveChar === 'B' && pos.z < -threshold) return true;
    return false;
};

// Smooth magnetic snap ease: quick acceleration, snappy finish with subtle micro-settle
const magneticEase = (x) => {
    // easeOutCubic with a very subtle magnetic latch
    return 1 - Math.pow(1 - x, 3);
};

const RubiksCube = ({ scrambledColors, solutionMoves, currentMoveIndex, isPlaying, tps, onAnimationComplete }) => {
    const groupRef = useRef();
    const cubiesRef = useRef([]);
    const pivot = useMemo(() => new THREE.Object3D(), []);
    const pivotRef = useRef(pivot);

    // Shared rounded geometry across all 27 cubies for peak performance
    const roundedGeometry = useMemo(() => {
        return new RoundedBoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, 4, 0.055);
    }, []);

    const animState = useRef({
        active: false,
        moveIndex: -1,
        elapsed: 0,
        duration: 0.5,
        axis: new THREE.Vector3(),
        angle: 0,
        movingIndices: []
    });

    const initialCubies = useMemo(() => {
        const cubies = [];
        let id = 0;

        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                for (let z = -1; z <= 1; z++) {
                    const pos = new THREE.Vector3(x * SPACING, y * SPACING, z * SPACING);

                    // High-end tactile speedcube interior plastic
                    const blackMat = new THREE.MeshStandardMaterial({
                        color: COLOR_PALETTE['black'],
                        roughness: 0.45,
                        metalness: 0.05
                    });
                    const mats = Array(6).fill(blackMat);

                    if (y === 1) { const row = z + 1; const col = x + 1; mats[2] = getMat(scrambledColors[row*3 + col]); }
                    if (x === 1) { const row = 1 - y; const col = 1 - z; mats[0] = getMat(scrambledColors[9 + row*3 + col]); }
                    if (z === 1) { const row = 1 - y; const col = x + 1; mats[4] = getMat(scrambledColors[18 + row*3 + col]); }
                    if (y === -1) { const row = 1 - z; const col = x + 1; mats[3] = getMat(scrambledColors[27 + row*3 + col]); }
                    if (x === -1) { const row = 1 - y; const col = z + 1; mats[1] = getMat(scrambledColors[36 + row*3 + col]); }
                    if (z === -1) { const row = 1 - y; const col = 1 - x; mats[5] = getMat(scrambledColors[45 + row*3 + col]); }

                    cubies.push({ id: id++, pos, mats });
                }
            }
        }
        return cubies;
    }, [scrambledColors]);

    function getMat(colorName) {
        let hex = COLOR_PALETTE['black'];
        if (colorName && colorName.startsWith('rgb')) hex = colorName;
        else if (COLOR_PALETTE[colorName]) hex = COLOR_PALETTE[colorName];

        // Authentic speedcube stickerless/glossy plastic finish with specular highlight
        return new THREE.MeshStandardMaterial({
            color: hex,
            roughness: 0.28,
            metalness: 0.02
        });
    }

    useEffect(() => {
        if (animState.current.active) return;

        cubiesRef.current.forEach((mesh, idx) => {
            if (!mesh) return;
            const init = initialCubies[idx];
            mesh.position.copy(init.pos);
            mesh.rotation.set(0, 0, 0);
            mesh.updateMatrix();
            if (mesh.parent !== groupRef.current) groupRef.current.attach(mesh);
        });

        for (let i = 0; i < currentMoveIndex; i++) {
            const move = solutionMoves[i];
            if (!move) continue;

            const { axis, angle, base } = getAxisAndDirection(move);

            cubiesRef.current.forEach(mesh => {
                if (isCubieInMove(mesh.position, base)) {
                    mesh.position.applyAxisAngle(axis, angle);
                    mesh.position.round();
                    mesh.rotateOnWorldAxis(axis, angle);
                    mesh.updateMatrix();
                }
            });
        }
    }, [currentMoveIndex, solutionMoves, initialCubies]);

    useEffect(() => {
        if (isPlaying && !animState.current.active && currentMoveIndex < solutionMoves.length) {
            const move = solutionMoves[currentMoveIndex];
            const { axis, angle, base } = getAxisAndDirection(move);

            pivotRef.current.rotation.set(0, 0, 0);
            pivotRef.current.position.set(0, 0, 0);
            pivotRef.current.updateMatrixWorld();

            const movingIndices = [];
            cubiesRef.current.forEach((mesh, idx) => {
                if (isCubieInMove(mesh.position, base)) {
                    pivotRef.current.attach(mesh);
                    movingIndices.push(idx);
                }
            });

            const duration = Math.max(0.08, 1.0 / tps);
            animState.current = {
                active: true,
                moveIndex: currentMoveIndex,
                elapsed: 0,
                duration,
                axis,
                angle,
                movingIndices
            };
        }
    }, [isPlaying, currentMoveIndex, solutionMoves, tps]);

    useFrame((state, delta) => {
        if (!isPlaying && animState.current.active) return;
        if (!animState.current.active) return;

        animState.current.elapsed += delta;
        const tau = Math.min(1.0, animState.current.elapsed / animState.current.duration);
        const progress = magneticEase(tau);

        const currentRot = animState.current.angle * progress;
        pivotRef.current.rotation.set(0, 0, 0);
        pivotRef.current.rotateOnWorldAxis(animState.current.axis, currentRot);
        pivotRef.current.updateMatrixWorld();

        if (tau >= 1.0) {
            const finalRot = animState.current.angle;
            pivotRef.current.rotation.set(0, 0, 0);
            pivotRef.current.rotateOnWorldAxis(animState.current.axis, finalRot);
            pivotRef.current.updateMatrixWorld();

            animState.current.movingIndices.forEach(idx => {
                const mesh = cubiesRef.current[idx];
                groupRef.current.attach(mesh);
                mesh.position.x = Math.round(mesh.position.x);
                mesh.position.y = Math.round(mesh.position.y);
                mesh.position.z = Math.round(mesh.position.z);
                const euler = new THREE.Euler().setFromQuaternion(mesh.quaternion);
                euler.x = Math.round(euler.x / (Math.PI/2)) * (Math.PI/2);
                euler.y = Math.round(euler.y / (Math.PI/2)) * (Math.PI/2);
                euler.z = Math.round(euler.z / (Math.PI/2)) * (Math.PI/2);
                mesh.quaternion.setFromEuler(euler);
                mesh.updateMatrix();
            });

            pivotRef.current.rotation.set(0, 0, 0);
            animState.current.active = false;
            onAnimationComplete();
        }
    });

    return (
        <group ref={groupRef}>
            <primitive object={pivot} />
            {initialCubies.map((c, i) => (
                <mesh
                    key={i}
                    ref={el => cubiesRef.current[i] = el}
                    position={c.pos}
                    geometry={roundedGeometry}
                    material={c.mats}
                />
            ))}
        </group>
    );
};

export const Cube3D = ({ scrambledColors, solutionMoves, currentMoveIndex, isPlaying, tps, onMoveComplete }) => {
    return (
        <Canvas style={{
            height: '100%',
            minHeight: '400px',
            width: '100%',
            background: '#08090C',
            borderRadius: '14px',
            border: '1px solid rgba(255, 255, 255, 0.12)'
        }}>
            <PerspectiveCamera makeDefault position={[4.2, 3.8, 6.2]} fov={38} />
            <OrbitControls enablePan={false} minDistance={5} maxDistance={18} />

            {/* Studio Lighting */}
            <ambientLight intensity={0.55} />
            {/* Soft Warm Key Light */}
            <directionalLight position={[6, 9, 7]} intensity={1.2} />
            {/* Soft Fill Light */}
            <directionalLight position={[-6, -2, -5]} intensity={0.35} color="#DCE6F5" />
            {/* Space Orange Rim Light: Signature Theme Accent */}
            <pointLight position={[-4, 4, -4]} intensity={2.2} color="#FF6B00" />

            {/* Contact ground shadow */}
            <ContactShadows position={[0, -2.15, 0]} opacity={0.65} scale={8} blur={2.2} far={4.5} color="#000000" />

            <RubiksCube
                scrambledColors={scrambledColors}
                solutionMoves={solutionMoves}
                currentMoveIndex={currentMoveIndex}
                isPlaying={isPlaying}
                tps={tps}
                onAnimationComplete={onMoveComplete}
            />
        </Canvas>
    );
};

export const VisualizerControls = ({
    isPlaying, setIsPlaying,
    tps, setTps,
    currentMoveIndex, totalMoves, setCurrentMoveIndex
}) => {
    const tpsOptions = [0.3, 0.5, 0.8, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0, 15.0];

    return (
        <div style={{
            background: '#0E1117',
            padding: '20px',
            borderRadius: '14px',
            marginTop: '16px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            width: '100%',
            boxSizing: 'border-box'
        }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    style={{
                        background: isPlaying ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255, 107, 0, 0.12)',
                        color: isPlaying ? '#EF4444' : '#FF6B00',
                        border: isPlaying ? '1.5px solid #EF4444' : '1.5px solid #FF6B00',
                        padding: '12px 28px',
                        borderRadius: '8px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        fontSize: '15px',
                        letterSpacing: '1px',
                        minWidth: '120px',
                        transition: 'all 0.2s ease'
                    }}>
                    {isPlaying ? "PAUSE" : "PLAY"}
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: '200px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9AA0B0', fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', marginBottom: '8px' }}>
                        <span>ANIMATION SPEED</span>
                        <span style={{ fontWeight: '800', color: '#FF6B00' }}>{tps} TPS</span>
                    </div>
                    <div style={{ display: 'flex', gap: '5px', background: '#08090C', padding: '6px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        {tpsOptions.map((val, i) => {
                            const isActive = tps >= val;
                            return (
                                <div
                                    key={val}
                                    onClick={() => setTps(val)}
                                    style={{
                                        flex: 1,
                                        height: '14px',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        background: isActive ? '#FF6B00' : '#1A1E26',
                                        opacity: isActive ? (0.4 + (i / tpsOptions.length) * 0.6) : 0.3,
                                        transition: 'all 0.15s ease-out'
                                    }}
                                    title={`${val} Moves per Second`}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', color: '#F0F2F8', background: '#08090C', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '14px', minWidth: '60px', color: '#FF6B00' }}>
                    {currentMoveIndex} / {totalMoves}
                </span>
                <input
                    type="range"
                    min="0"
                    max={totalMoves}
                    value={currentMoveIndex}
                    onChange={(e) => {
                        setIsPlaying(false);
                        setCurrentMoveIndex(parseInt(e.target.value));
                    }}
                    style={{ flexGrow: 1, height: '6px', cursor: 'pointer', accentColor: '#FF6B00', width: '100%' }}
                />
            </div>
        </div>
    );
};