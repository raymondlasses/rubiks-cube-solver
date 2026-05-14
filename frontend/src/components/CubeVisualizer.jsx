import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

const COLOR_PALETTE = {
    'white':  '#e0e0e0',
    'yellow': '#ffeb3b',
    'green':  '#00c853',
    'blue':   '#2962ff',
    'red':    '#d50000',
    'orange': '#ff6d00',
    'black':  '#dddddd'  // Internal plastic
};

const CUBE_SIZE = 0.95;
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

const RubiksCube = ({ scrambledColors, solutionMoves, currentMoveIndex, isPlaying, tps, onAnimationComplete }) => {
    const groupRef = useRef();
    const cubiesRef = useRef([]);
    const pivotRef = useRef(new THREE.Object3D());

    const animState = useRef({ active: false, moveIndex: -1, progress: 0, axis: new THREE.Vector3(), angle: 0, movingIndices: [] });

    const initialCubies = useMemo(() => {
        const cubies = [];
        let id = 0;

        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                for (let z = -1; z <= 1; z++) {
                    const pos = new THREE.Vector3(x * SPACING, y * SPACING, z * SPACING);

                    const blackMat = new THREE.MeshStandardMaterial({
                        color: COLOR_PALETTE['black'], roughness: 1.0, metalness: 0.0
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

        // --- MATTE GLOW EFFECT ---
        // Roughness 1 = Zero shiny reflections. Emissive creates the inner light.
        return new THREE.MeshStandardMaterial({
            color: hex,
            emissive: hex,
            emissiveIntensity: 0.25,
            roughness: 1.0,
            metalness: 0.0
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

            animState.current = { active: true, moveIndex: currentMoveIndex, progress: 0, axis, angle, movingIndices };
        }
    }, [isPlaying, currentMoveIndex, solutionMoves]);

    useFrame((state, delta) => {
        if (!isPlaying && animState.current.active) return;
        if (!animState.current.active) return;

        const durationInSeconds = 1.0 / tps;
        const speed = Math.abs(animState.current.angle) / durationInSeconds;
        const step = speed * delta;

        animState.current.progress += step;

        if (Math.abs(animState.current.progress) >= Math.abs(animState.current.angle)) {
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
        } else {
            pivotRef.current.rotateOnWorldAxis(animState.current.axis, step * Math.sign(animState.current.angle));
        }
    });

    return (
        <group ref={groupRef}>
            <primitive object={pivotRef.current} />
            {initialCubies.map((c, i) => (
                <mesh
                    key={i}
                    ref={el => cubiesRef.current[i] = el}
                    position={c.pos}
                    geometry={new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE)}
                    material={c.mats}
                />
            ))}
        </group>
    );
};

export const Cube3D = ({ scrambledColors, solutionMoves, currentMoveIndex, isPlaying, tps, onMoveComplete }) => {
    return (
        <Canvas style={{ height: '100%', minHeight: '400px', width: '100%', background: '#17252A', borderRadius: '15px', border: '2px solid #3AAFA9' }}>
            <PerspectiveCamera makeDefault position={[4, 3.5, 6]} fov={40} />
            <OrbitControls enablePan={false} minDistance={5} maxDistance={20} />

            {/* AMBIENT LIGHT ONLY: Completely removes directional shadows & "sun" reflections */}
            <ambientLight intensity={1.5} />

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
            background: '#17252A', padding: '20px', borderRadius: '15px',
            marginTop: '20px', border: '2px solid #2B7A78', width: '100%', boxSizing: 'border-box'
        }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap' }}>
                <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    style={{
                        background: isPlaying ? '#ff4444' : '#3AAFA9',
                        color: isPlaying ? 'white' : '#17252A',
                        border: '2px solid #0a1114', padding: '12px 30px', borderRadius: '8px',
                        fontWeight: '800', cursor: 'pointer', fontSize: '16px', letterSpacing:'1px',
                        minWidth: '120px', boxShadow: '0 4px 0 rgba(0,0,0,0.2)'
                    }}>
                    {isPlaying ? "PAUSE" : "PLAY"}
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: '200px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#DEF2F1', fontSize: '12px', marginBottom: '6px' }}>
                        <span>ANIMATION SPEED</span>
                        <span style={{fontWeight:'bold'}}>{tps} TPS</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', background: '#0a1114', padding: '6px', borderRadius: '8px', border: '1px solid #222', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}>
                        {tpsOptions.map((val, i) => {
                            const hue = Math.max(0, 120 - (i * 13.5));
                            const isActive = tps >= val;
                            return (
                                <div
                                    key={val}
                                    onClick={() => setTps(val)}
                                    style={{
                                        flex: 1, height: '14px', borderRadius: '3px', cursor: 'pointer',
                                        background: isActive ? `hsl(${hue}, 100%, 50%)` : '#222',
                                        boxShadow: isActive ? `0 0 10px hsl(${hue}, 100%, 50%)` : 'none',
                                        transition: 'all 0.15s ease-out',
                                        opacity: isActive ? 1 : 0.3
                                    }}
                                    title={`${val} Moves per Second`}
                                />
                            )
                        })}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', color: '#DEF2F1', background: '#222', padding: '10px', borderRadius: '8px' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '14px', minWidth: '60px' }}>
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
                    style={{ flexGrow: 1, height: '8px', cursor: 'pointer', accentColor: '#3AAFA9', width: '100%' }}
                />
            </div>
        </div>
    );
};