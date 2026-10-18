import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Cube3D, VisualizerControls } from './CubeVisualizer';
import DotMatrixBackground from './DotMatrixBackground';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const SPACE_BLACK = '#08090C';
const PANEL_BG = '#0E1117';
const CARD_BG = '#141820';
const ORANGE_PRIMARY = '#FF6B00';
const ORANGE_HOVER = '#FF8533';
const TEXT_PRIMARY = '#F0F2F8';
const TEXT_SECONDARY = '#9AA0B0';
const RED_ACCENT = '#EF4444';

const DIAGNOSTIC_COLOR_MAP = {
    white: '#FFFFFF',
    yellow: '#FFE600',
    green: '#00E676',
    blue: '#2979FF',
    red: '#FF3D57',
    orange: '#FF9100',
    unknown: '#8A92A4'
};

const MIRRORED_DIAGNOSTIC_INDICES = [2, 1, 0, 5, 4, 3, 8, 7, 6];

const btnStyle = {
    padding: '11px 20px',
    background: 'rgba(255, 107, 0, 0.08)',
    color: ORANGE_PRIMARY,
    border: `1.5px solid ${ORANGE_PRIMARY}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontWeight: '700',
    fontSize: '13px',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    transition: 'all 0.2s ease',
    outline: 'none'
};

const redBtnStyle = {
    ...btnStyle,
    color: RED_ACCENT,
    border: `1.5px solid ${RED_ACCENT}`,
    background: 'rgba(239, 68, 68, 0.08)'
};

const neutralBtnStyle = {
    ...btnStyle,
    color: '#D0D4DC',
    border: '1.5px solid rgba(255, 255, 255, 0.16)',
    background: 'rgba(255, 255, 255, 0.03)'
};

const CALIBRATION_STEPS = [
    {
        key: 'up',
        name: 'White',
        colorName: 'white',
        colorHex: '#FFFFFF',
        textHex: '#000000',
        badge: 'UP',
        desc: 'Hold WHITE center face squarely within the alignment grid.'
    },
    {
        key: 'down',
        name: 'Yellow',
        colorName: 'yellow',
        colorHex: '#FFD500',
        textHex: '#000000',
        badge: 'DOWN',
        desc: 'Hold YELLOW center face squarely within the alignment grid.'
    },
    {
        key: 'front',
        name: 'Green',
        colorName: 'green',
        colorHex: '#00B348',
        textHex: '#FFFFFF',
        badge: 'FRONT',
        desc: 'Hold GREEN center face squarely within the alignment grid.'
    },
    {
        key: 'back',
        name: 'Blue',
        colorName: 'blue',
        colorHex: '#0055D4',
        textHex: '#FFFFFF',
        badge: 'BACK',
        desc: 'Hold BLUE center face squarely within the alignment grid.'
    },
    {
        key: 'right',
        name: 'Red',
        colorName: 'red',
        colorHex: '#D91E2E',
        textHex: '#FFFFFF',
        badge: 'RIGHT',
        desc: 'Hold RED center face squarely within the alignment grid.'
    },
    {
        key: 'left',
        name: 'Orange',
        colorName: 'orange',
        colorHex: '#FF6500',
        textHex: '#FFFFFF',
        badge: 'LEFT',
        desc: 'Hold ORANGE center face squarely within the alignment grid.'
    }
];

const triggerConfetti = () => {
    const fire = () => window.confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        zIndex: 9999,
        colors: [ORANGE_PRIMARY, '#FF8533', '#FFFFFF', '#0055D4']
    });
    if (window.confetti) fire();
    else {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js";
        script.onload = fire;
        document.head.appendChild(script);
    }
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        const playNote = (freq, startTime, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine'; osc.frequency.value = freq;
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(startTime);
            gain.gain.setValueAtTime(0.08, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            osc.stop(startTime + duration);
        };
        const now = ctx.currentTime;
        playNote(523.25, now, 0.15);
        playNote(659.25, now + 0.15, 0.15);
        playNote(783.99, now + 0.3, 0.15);
        playNote(1046.50, now + 0.45, 0.4);
    } catch { /* ignore */ }
};

const FaceGrid = ({ faceObj, label }) => {
    const isScanned = !!faceObj;
    const gridColors = faceObj ? faceObj.colors : Array(9).fill('#1A1E26');
    const hasWarning = faceObj && faceObj.hasWarning;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '4px', opacity: isScanned ? 1 : 0.35, transition: 'all 0.3s' }}>
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 19px)', gridTemplateRows: 'repeat(3, 19px)', gap: '2px', padding: '4px',
                backgroundColor: '#08090C', borderRadius: '6px',
                border: isScanned ? (hasWarning ? `1.5px solid ${RED_ACCENT}` : `1.5px solid ${ORANGE_PRIMARY}`) : '1px solid rgba(255, 255, 255, 0.10)'
            }}>
                {gridColors.map((c, i) => <div key={i} style={{ backgroundColor: c, width: '100%', height: '100%', borderRadius: '2px' }} />)}
            </div>
            <span style={{ fontSize: '11px', color: isScanned ? (hasWarning ? RED_ACCENT : ORANGE_PRIMARY) : TEXT_SECONDARY, marginTop: '6px', fontWeight: '700', letterSpacing: '0.5px' }}>{label}</span>
            {hasWarning && <span style={{ fontSize: '9px', color: RED_ACCENT, marginTop: '2px', fontWeight: 'bold' }}>Check Face</span>}
        </div>
    );
};

const CameraSkeleton = () => {
    return (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: '#08090C',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 6,
            overflow: 'hidden'
        }}>
            <div className="camera-shimmer-bar" />
            <div style={{
                height: '80%',
                aspectRatio: '1/1',
                border: '2px dashed rgba(255, 255, 255, 0.25)',
                borderRadius: '8px',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gridTemplateRows: 'repeat(3, 1fr)',
                position: 'relative',
                zIndex: 2,
                pointerEvents: 'none'
            }}>
                {[...Array(9)].map((_, i) => (
                    <div key={i} style={{ border: '1px solid rgba(255, 255, 255, 0.12)' }} />
                ))}
            </div>
        </div>
    );
};

const Scanner = () => {
    const [isCameraReady, setIsCameraReady] = useState(false);
    const [calibratedProfile, setCalibratedProfile] = useState(() => {
        try {
            const saved = localStorage.getItem('rubiks_solver_calibrated_profile');
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    });

    const [activeView, setActiveView] = useState(() => {
        try {
            const saved = localStorage.getItem('rubiks_solver_calibrated_profile');
            return saved ? 'main' : 'calibrate';
        } catch {
            return 'calibrate';
        }
    });

    const [calibrationIndex, setCalibrationIndex] = useState(0);
    const [calibratedSteps, setCalibratedSteps] = useState(() => {
        try {
            const saved = localStorage.getItem('rubiks_solver_calibrated_profile');
            return saved ? JSON.parse(saved).mapping : {};
        } catch {
            return {};
        }
    });
    const [calibrateWarning, setCalibrateWarning] = useState(null);
    const [isCalibratingLoading, setIsCalibratingLoading] = useState(false);

    const [isTransitioning, setIsTransitioning] = useState(false);

    const mainVideoRef = useRef(null);
    const mainCanvasRef = useRef(null);
    const calibrateVideoRef = useRef(null);
    const calibrateCanvasRef = useRef(null);

    const hasCelebrated = useRef(false);
    const processingRef = useRef(false);
    const stabilityCounter = useRef(0);
    const lastFaceRef = useRef(null);

    const [faceData, setFaceData] = useState({ up: null, left: null, front: null, right: null, back: null, down: null });
    const [detectedFace, setDetectedFace] = useState("Searching...");
    const [scanProgress, setScanProgress] = useState(0);
    const [isAutoScanning, setIsAutoScanning] = useState(true);
    const [solveError, setSolveError] = useState(null);

    // Cube presence & diagnostics
    const [isCubePresent, setIsCubePresent] = useState(false);
    const [presenceScore, setPresenceScore] = useState(0);
    const [validCount, setValidCount] = useState(0);
    const [diagnosticsData, setDiagnosticsData] = useState(null);
    const [showDiagnostics, setShowDiagnostics] = useState(false);

    const [finalSolution, setFinalSolution] = useState(null);
    const [solutionMoves, setSolutionMoves] = useState([]);
    const [scrambledColors, setScrambledColors] = useState([]);
    const [isEasterEgg, setIsEasterEgg] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
    const [tps, setTps] = useState(0.8);

    const changeView = (newView) => {
        setIsTransitioning(true);
        setActiveView(newView);
        setTimeout(() => {
            setIsTransitioning(false);
        }, 800);
    };

    useEffect(() => {
        axios.post(`${API_BASE_URL}/reset`).catch(() => { /* ignore */ });
        let activeStream = null;
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 1280, height: 720 } })
            .then(stream => {
                activeStream = stream;
                if (mainVideoRef.current) {
                    mainVideoRef.current.srcObject = stream;
                    mainVideoRef.current.onloadedmetadata = () => setIsCameraReady(true);
                }
                if (calibrateVideoRef.current) {
                    calibrateVideoRef.current.srcObject = stream;
                    calibrateVideoRef.current.onloadedmetadata = () => setIsCameraReady(true);
                }
                setIsCameraReady(true);
            })
            .catch(err => console.error("Camera failed", err));

        return () => {
            if (activeStream) {
                activeStream.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const playSuccessSound = () => {
        const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
        audio.play().catch(() => { /* ignore */ });
    };

    const solve = async () => {
        try {
            const payload = {};
            if (calibratedProfile?.mapping) {
                payload.custom_palette = Object.values(calibratedProfile.mapping);
            }

            const res = await axios.post(`${API_BASE_URL}/solve-global`, payload);
            const sol = res.data.solution;
            setFinalSolution(sol);
            setSolveError(null);

            const colorsFor3D = res.data.parsed_colors.map(face => {
                if (calibratedProfile && calibratedProfile.mapping[face]) {
                    const rgb = calibratedProfile.mapping[face].rgb;
                    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
                }
                const standardMap = { 'up': 'white', 'down': 'yellow', 'front': 'green', 'back': 'blue', 'right': 'red', 'left': 'orange' };
                return standardMap[face];
            });
            setScrambledColors(colorsFor3D);

            if (sol.startsWith("Good news")) { setIsEasterEgg(true); setSolutionMoves([]); }
            else { setIsEasterEgg(false); setSolutionMoves(sol.split(' ')); }

            changeView('solution');

        } catch (err) {
            setSolveError(err.response?.data?.detail || "An unknown solver error occurred.");
            setIsAutoScanning(true);
        }
    };

    const commitScan = async (faceName) => {
        try {
            const payload = { image: mainCanvasRef.current.toDataURL('image/jpeg'), face_name: faceName, preview: false, picker_mode: false };
            if (calibratedProfile?.mapping) {
                payload.custom_palette = Object.values(calibratedProfile.mapping);
            }

            const res = await axios.post(`${API_BASE_URL}/scan-raw`, payload);
            if (res.data.success) {
                playSuccessSound();
                setSolveError(null);
                const cssColors = res.data.rgb_preview.map(c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`);
                setFaceData(prev => ({ ...prev, [faceName]: { colors: cssColors, hasWarning: false } }));

                if (res.data.scanned_count === 6) {
                    setIsAutoScanning(false);
                    solve();
                } else {
                    setIsAutoScanning(false);
                    // 1.0 Second Cooldown after successful face scan
                    setTimeout(() => {
                        setScanProgress(0);
                        setIsAutoScanning(true);
                    }, 1000);
                }
            }
        } catch { /* ignore */ }
    };

    const runAutoScanTick = async () => {
        if (activeView !== 'main' || finalSolution || processingRef.current || !mainVideoRef.current || !mainVideoRef.current.videoWidth || !isAutoScanning) return;
        processingRef.current = true;
        const context = mainCanvasRef.current.getContext('2d');
        mainCanvasRef.current.width = mainVideoRef.current.videoWidth;
        mainCanvasRef.current.height = mainVideoRef.current.videoHeight;
        context.drawImage(mainVideoRef.current, 0, 0);

        try {
            const payload = { image: mainCanvasRef.current.toDataURL('image/jpeg'), face_name: "auto", preview: true, picker_mode: false };
            if (calibratedProfile?.mapping) {
                payload.custom_palette = Object.values(calibratedProfile.mapping);
            }

            const res = await axios.post(`${API_BASE_URL}/scan-raw`, payload);

            const cubePresent = !!res.data.cube_present;
            const currentValidCount = res.data.valid_count || 0;
            setIsCubePresent(cubePresent);
            setPresenceScore(res.data.presence_score || 0);
            setValidCount(currentValidCount);

            if (res.data.diagnostics) {
                setDiagnosticsData(res.data.diagnostics);
            }

            // Gating 1: Cube Presence Gatekeeper
            if (!cubePresent) {
                stabilityCounter.current = 0;
                setScanProgress(0);
                setDetectedFace("Align cube squarely in grid");
                processingRef.current = false;
                return;
            }

            // Gating 2: Strict 9-Sticker Gating (auto-scan only begins when ALL 9 stickers are valid)
            if (!res.data.success || currentValidCount < 9) {
                stabilityCounter.current = 0;
                setScanProgress(0);
                setDetectedFace(res.data.message || `Aligning Face (${currentValidCount}/9 valid)`);
                processingRef.current = false;
                return;
            }

            if (res.data.success && res.data.face_name !== "unknown") {
                const currentFaceName = res.data.face_name;
                const displayName = calibratedProfile?.mapping[currentFaceName]?.displayName || currentFaceName.toUpperCase();
                setDetectedFace(`${currentFaceName.toUpperCase()} (${displayName})`);

                if (currentFaceName === lastFaceRef.current) {
                    stabilityCounter.current += 1;
                } else {
                    stabilityCounter.current = 0;
                    setScanProgress(0);
                }
                lastFaceRef.current = currentFaceName;

                // 10 Ticks * 100ms = Exactly 1.0 Second hold
                const TARGET_TICKS = 10;
                setScanProgress(Math.min((stabilityCounter.current / TARGET_TICKS) * 100, 100));

                if (stabilityCounter.current >= TARGET_TICKS) {
                    await commitScan(currentFaceName);
                    stabilityCounter.current = 0;
                    setScanProgress(0);
                }
            } else {
                stabilityCounter.current = 0;
                setScanProgress(0);
                setDetectedFace(res.data.message || "Searching...");
            }
        } catch { /* ignore */ }
        processingRef.current = false;
    };

    const runAutoScanTickRef = useRef(runAutoScanTick);
    useEffect(() => {
        runAutoScanTickRef.current = runAutoScanTick;
    });

    useEffect(() => {
        const interval = setInterval(() => {
            if (runAutoScanTickRef.current) {
                runAutoScanTickRef.current();
            }
        }, 100);
        return () => clearInterval(interval);
    }, []);

    const resetForNewCube = () => {
        setIsPlaying(false);
        setIsAutoScanning(false);
        changeView('main');

        // Immediately wipe Main Scan screen state so it is completely fresh and empty as it slides into view
        setFaceData({ up: null, left: null, front: null, right: null, back: null, down: null });
        setScanProgress(0);
        setSolveError(null);
        setDetectedFace("Searching...");
        setIsCubePresent(false);
        setValidCount(0);
        axios.post(`${API_BASE_URL}/reset`).catch(() => { /* ignore */ });

        // Defer clearing Solution screen state until it is completely out of view
        setTimeout(() => {
            setFinalSolution(null);
            setSolutionMoves([]);
            setScrambledColors([]);
            setIsEasterEgg(false);
            hasCelebrated.current = false;
            setCurrentMoveIndex(0);
            setIsAutoScanning(true);
        }, 800);
    };

    const handleMoveComplete = () => {
        if (currentMoveIndex + 1 === solutionMoves.length && !hasCelebrated.current) {
            triggerConfetti();
            hasCelebrated.current = true;
        }
        if (isPlaying && currentMoveIndex < solutionMoves.length) setCurrentMoveIndex(prev => prev + 1);
        else setIsPlaying(false);
    };

    // Calibration wizard capture
    const captureCalibrationStep = async () => {
        if (!calibrateVideoRef.current || !calibrateVideoRef.current.videoWidth || isCalibratingLoading) return;
        setIsCalibratingLoading(true);
        setCalibrateWarning(null);

        const context = calibrateCanvasRef.current.getContext('2d');
        calibrateCanvasRef.current.width = calibrateVideoRef.current.videoWidth;
        calibrateCanvasRef.current.height = calibrateVideoRef.current.videoHeight;
        context.drawImage(calibrateVideoRef.current, 0, 0);

        try {
            const res = await axios.post(`${API_BASE_URL}/calibrate-face`, {
                image: calibrateCanvasRef.current.toDataURL('image/jpeg')
            });

            if (!res.data.is_cube_present) {
                setCalibrateWarning("Cube not detected in grid! Align your cube squarely.");
                setIsCalibratingLoading(false);
                return;
            }

            const isInitialCalibration = !calibratedProfile;
            const step = CALIBRATION_STEPS[calibrationIndex];
            const center = res.data.center;
            const updated = {
                ...calibratedSteps,
                [step.key]: {
                    face: step.key,
                    name: step.colorName,
                    displayName: step.name,
                    rgb: center.rgb,
                    lab: center.lab,
                    hsv: center.hsv
                }
            };

            setCalibratedSteps(updated);
            playSuccessSound();

            const totalDone = Object.keys(updated).length;

            if (totalDone === CALIBRATION_STEPS.length) {
                // All 6 faces calibrated! Save profile as Ground Truth
                const profile = { mapping: updated };
                setCalibratedProfile(profile);
                localStorage.setItem('rubiks_solver_calibrated_profile', JSON.stringify(profile));

                // Only auto-move to main scan screen if calibrating over default state
                if (isInitialCalibration) {
                    resetForNewCube();
                    changeView('main');
                }
            } else {
                // Advance to next unscanned face
                let nextIdx = (calibrationIndex + 1) % CALIBRATION_STEPS.length;
                for (let i = 0; i < CALIBRATION_STEPS.length; i++) {
                    const candidate = (calibrationIndex + 1 + i) % CALIBRATION_STEPS.length;
                    if (!updated[CALIBRATION_STEPS[candidate].key]) {
                        nextIdx = candidate;
                        break;
                    }
                }
                setCalibrationIndex(nextIdx);
            }
        } catch (err) {
            setCalibrateWarning(err.response?.data?.detail || "Capture failed. Check lighting and alignment.");
        }
        setIsCalibratingLoading(false);
    };

    const finishCalibrationManually = () => {
        if (Object.keys(calibratedSteps).length === 6) {
            const profile = { mapping: calibratedSteps };
            setCalibratedProfile(profile);
            localStorage.setItem('rubiks_solver_calibrated_profile', JSON.stringify(profile));
            resetForNewCube();
            changeView('main');
        }
    };

    let translatePos = '-100vw';
    if (activeView === 'calibrate') translatePos = '0vw';
    if (activeView === 'solution') translatePos = '-200vw';

    const currentStep = CALIBRATION_STEPS[calibrationIndex] || CALIBRATION_STEPS[0];
    const isCurrentStepDone = !!calibratedSteps[currentStep.key];
    const calibratedCount = Object.keys(calibratedSteps).length;
    const cinematicTransition = 'transform 0.75s cubic-bezier(0.64, 0, 0.36, 1)';

    return (
        <>
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', overflow: 'hidden', background: SPACE_BLACK, color: TEXT_PRIMARY }}>

                {/* Interactive Dot Matrix Canvas Background */}
                <DotMatrixBackground isTransitioning={isTransitioning} />

                <div style={{ position: 'relative', zIndex: 1, display: 'flex', width: '300vw', height: '100vh', transform: `translateX(${translatePos})`, transition: cinematicTransition }}>

                    {/* ================= STAGE 1: CALIBRATE CUBE ================= */}
                    <div style={{ width: '100vw', height: '100vh', padding: '24px', boxSizing: 'border-box', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>

                        <div style={{ position: 'absolute', top: '28px', right: '32px', zIndex: 10 }}>
                            <button onClick={() => changeView('main')} style={btnStyle}>
                                {calibratedCount === 6 ? 'MAIN SCANNER →' : 'SKIP TO SCANNER →'}
                            </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'stretch', gap: '32px', maxWidth: '1120px', width: '100%', justifyContent: 'center' }}>

                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', background: PANEL_BG,
                                padding: '28px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.12)',
                                boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8)', maxWidth: '720px', flex: '1 1 680px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                    <h1 style={{ color: TEXT_PRIMARY, margin: 0, fontSize: '1.9rem', fontWeight: '800' }}>Calibrate Cube</h1>
                                </div>
                                <p style={{ color: TEXT_SECONDARY, margin: '0 0 16px 0', fontSize: '14px', textAlign: 'center' }}>
                                    Samples your cube's actual physical stickers to completely overwrite defaults for perfect recognition.
                                </p>

                                <div style={{
                                    position: 'relative', width: '100%', maxWidth: '620px', aspectRatio: '16/9', minHeight: '340px',
                                    backgroundColor: '#000', borderRadius: '10px', border: `2px solid ${currentStep.colorHex}`,
                                    overflow: 'hidden'
                                }}>
                                    {!isCameraReady && <CameraSkeleton />}
                                    <video
                                        ref={calibrateVideoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        onLoadedData={() => setIsCameraReady(true)}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                                    />

                                    {/* 3x3 alignment grid */}
                                    <div style={{
                                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                        height: '80%', aspectRatio: '1/1', border: `2px dashed ${currentStep.colorHex}`,
                                        borderRadius: '8px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)',
                                        pointerEvents: 'none'
                                    }}>
                                        {[...Array(9)].map((_, i) => (
                                            <div key={i} style={{
                                                border: '1px solid rgba(255,255,255,0.18)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                {i === 4 && (
                                                    <div style={{
                                                        width: '50%', height: '50%', borderRadius: '50%',
                                                        border: `2px solid ${currentStep.colorHex}`,
                                                        background: `${currentStep.colorHex}33`
                                                    }} />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <canvas ref={calibrateCanvasRef} style={{ display: 'none' }} />

                                {calibrateWarning && (
                                    <div style={{
                                        marginTop: '12px', padding: '10px 16px', background: 'rgba(239, 68, 68, 0.12)',
                                        color: RED_ACCENT, border: `1px solid ${RED_ACCENT}`, borderRadius: '8px',
                                        fontWeight: '700', fontSize: '13px', textAlign: 'center', width: '100%', boxSizing: 'border-box'
                                    }}>
                                        {calibrateWarning}
                                    </div>
                                )}

                                <div style={{ marginTop: '16px', position: 'relative', width: '100%', maxWidth: '620px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <button
                                        onClick={captureCalibrationStep}
                                        disabled={isCalibratingLoading}
                                        style={{
                                            ...btnStyle, width: '270px', padding: '12px 14px', fontSize: '12.5px',
                                            background: isCalibratingLoading ? '#222' : 'rgba(255, 107, 0, 0.14)'
                                        }}
                                    >
                                        {isCalibratingLoading ? 'SAMPLING...' : (isCurrentStepDone ? `RE-CAPTURE ${currentStep.name.toUpperCase()} FACE` : `CAPTURE ${currentStep.name.toUpperCase()} FACE`)}
                                    </button>
                                    {calibrationIndex > 0 && (
                                        <button
                                            onClick={() => setCalibrationIndex(prev => prev - 1)}
                                            style={{
                                                ...neutralBtnStyle,
                                                position: 'absolute',
                                                right: 0,
                                                padding: '12px 14px',
                                                fontSize: '12px',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            ← PREVIOUS FACE
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Calibration Stepper & Guidelines Card */}
                            <div style={{
                                background: PANEL_BG, padding: '26px', borderRadius: '16px', display: 'flex',
                                flexDirection: 'column', height: '100%', justifyContent: 'space-between',
                                minWidth: '330px', maxWidth: '370px', flex: '0 0 350px',
                                border: '1px solid rgba(255, 255, 255, 0.12)', boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
                                boxSizing: 'border-box'
                            }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <span style={{ fontSize: '15px', fontWeight: '800', color: TEXT_PRIMARY }}>Calibration Steps</span>
                                        <span style={{ fontSize: '13px', fontWeight: '700', color: ORANGE_PRIMARY }}>{calibratedCount} / 6 Complete</span>
                                    </div>

                                    {/* 6 Step badges */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
                                        {CALIBRATION_STEPS.map((step, idx) => {
                                            const isDone = !!calibratedSteps[step.key];
                                            const isCurrent = idx === calibrationIndex;
                                            const saved = calibratedSteps[step.key];

                                            return (
                                                <div
                                                    key={step.key}
                                                    onClick={() => setCalibrationIndex(idx)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                                                        borderRadius: '8px', cursor: 'pointer',
                                                        background: isCurrent ? 'rgba(255, 107, 0, 0.08)' : (isDone ? 'rgba(255, 255, 255, 0.03)' : '#08090C'),
                                                        border: isCurrent ? `1.5px solid ${ORANGE_PRIMARY}` : (isDone ? '1px solid rgba(255, 255, 255, 0.16)' : '1px solid rgba(255, 255, 255, 0.06)'),
                                                        transition: 'all 0.2s ease'
                                                    }}
                                                >
                                                    <div style={{
                                                        width: '26px', height: '26px', borderRadius: '6px',
                                                        background: saved ? `rgb(${saved.rgb.join(',')})` : step.colorHex,
                                                        border: '1px solid rgba(255,255,255,0.25)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontWeight: '900', fontSize: '13px', color: step.textHex
                                                    }}>
                                                        {isDone ? '✓' : idx + 1}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: '700', fontSize: '13px', color: isCurrent ? ORANGE_PRIMARY : (isDone ? TEXT_PRIMARY : TEXT_SECONDARY) }}>
                                                            {step.name} <span style={{ fontSize: '11px', color: '#6E7687' }}>({step.badge})</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    {/* Current Step Instruction Box */}
                                    <div style={{ background: CARD_BG, padding: '14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
                                        <div style={{ fontSize: '13px', fontWeight: '800', color: TEXT_PRIMARY, marginBottom: '6px' }}>
                                            Step {calibrationIndex + 1}: {currentStep.name} ({currentStep.badge})
                                        </div>
                                        <p style={{ margin: 0, fontSize: '12px', color: TEXT_SECONDARY, lineHeight: '1.5' }}>
                                            {currentStep.desc}
                                        </p>
                                    </div>

                                    {calibratedCount === 6 && (
                                        <button
                                            onClick={finishCalibrationManually}
                                            style={{ ...btnStyle, marginTop: '16px', width: '100%', background: 'rgba(255, 107, 0, 0.16)' }}
                                        >
                                            SAVE & START SOLVING →
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ================= STAGE 2: MAIN SCANNER ================= */}
                    <div style={{ width: '100vw', height: '100vh', padding: '24px', boxSizing: 'border-box', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '32px', position: 'relative' }}>

                        {/* Top Left Toolbar */}
                        <div style={{ position: 'absolute', top: '28px', left: '32px', display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 10 }}>
                            <button
                                onClick={() => {
                                    setCalibrationIndex(0);
                                    if (!calibratedProfile) {
                                        setCalibratedSteps({});
                                    }
                                    changeView('calibrate');
                                }}
                                style={btnStyle}
                            >
                                Recalibrate Cube
                            </button>
                            {calibratedProfile && (
                                <button
                                    onClick={() => {
                                        setCalibratedProfile(null);
                                        setCalibratedSteps({});
                                        localStorage.removeItem('rubiks_solver_calibrated_profile');
                                        resetForNewCube();
                                    }}
                                    style={redBtnStyle}
                                >
                                    ↺ Revert to Defaults
                                </button>
                            )}
                            <button
                                onClick={() => setShowDiagnostics(prev => !prev)}
                                style={neutralBtnStyle}
                            >
                                {showDiagnostics ? 'Hide Diagnostics' : 'Diagnostics'}
                            </button>
                        </div>

                        {/* Main Video & Scanning Panel */}
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', background: PANEL_BG,
                            padding: '28px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.12)',
                            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8)'
                        }}>
                            <h1 style={{ color: TEXT_PRIMARY, marginBottom: '6px', fontSize: '2.4rem', marginTop: 0, fontWeight: '800', letterSpacing: '-0.5px' }}>
                                Rubik&apos;s Solver AI
                            </h1>

                            <div style={{ height: '28px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ color: TEXT_SECONDARY, fontSize: '14px', fontWeight: '600' }}>Status:</span>
                                <b style={{ color: (isCubePresent && validCount === 9) ? ORANGE_PRIMARY : '#E0E4EE', fontSize: '15px' }}>
                                    {detectedFace}
                                </b>
                            </div>

                            {/* Camera Viewport with Distinctive Outline */}
                            <div style={{
                                position: 'relative', width: '100%', maxWidth: '680px', aspectRatio: '16/9', minHeight: '340px',
                                backgroundColor: '#000', borderRadius: '12px',
                                border: isCubePresent && validCount === 9
                                    ? `2px solid ${ORANGE_PRIMARY}`
                                    : (isCubePresent ? '1.5px solid rgba(255, 107, 0, 0.5)' : '1px solid rgba(255, 255, 255, 0.16)'),
                                overflow: 'hidden', transition: 'border-color 0.2s ease'
                            }}>
                                {!isCameraReady && <CameraSkeleton />}
                                <video
                                    ref={mainVideoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    onLoadedData={() => setIsCameraReady(true)}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                                />

                                {/* 3x3 Overlay Grid */}
                                <div style={{
                                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                    height: '80%', aspectRatio: '1/1',
                                    border: isCubePresent && validCount === 9 ? `2px solid ${ORANGE_PRIMARY}` : '1.5px solid rgba(255, 255, 255, 0.3)',
                                    transition: 'border-color 0.2s', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr 1fr 1fr',
                                    borderRadius: '8px', overflow: 'hidden'
                                }}>
                                    {/* 1.0s Smooth Hold Countdown Progress Bar */}
                                    <div style={{
                                        position: 'absolute', top: 0, left: 0, width: `${scanProgress}%`, height: '5px',
                                        background: ORANGE_PRIMARY, transition: 'width 0.1s linear'
                                    }}/>
                                    {[...Array(9)].map((_, i) => <div key={i} style={{ border: '1px solid rgba(255, 255, 255, 0.15)' }} />)}
                                </div>

                                {/* No Cube Alignment Notice */}
                                {!isCubePresent && (
                                    <div style={{
                                        position: 'absolute', bottom: '15px', left: '50%', transform: 'translateX(-50%)',
                                        background: 'rgba(8, 9, 12, 0.88)', padding: '6px 16px', borderRadius: '6px',
                                        border: '1px solid rgba(255, 255, 255, 0.18)', color: '#D0D4DC', fontSize: '12px', fontWeight: '700',
                                        letterSpacing: '0.8px', textTransform: 'uppercase', backdropFilter: 'blur(4px)'
                                    }}>
                                        Hold Cube in Grid
                                    </div>
                                )}
                            </div>

                            <canvas ref={mainCanvasRef} style={{ display: 'none' }} />

                            {/* Diagnostics HUD Panel */}
                            {showDiagnostics && (
                                <div style={{
                                    marginTop: '12px', width: '100%', maxWidth: '680px', background: CARD_BG,
                                    border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '10px', padding: '14px', fontSize: '12px',
                                    display: 'flex', flexDirection: 'column', gap: '8px'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: '700', color: ORANGE_PRIMARY }}>Diagnostics Monitor</span>
                                        <span style={{ color: isCubePresent ? (validCount === 9 ? ORANGE_PRIMARY : '#E0E4EE') : TEXT_SECONDARY }}>
                                            Presence Score: <b>{Math.round(presenceScore * 100)}%</b> ({isCubePresent ? `${validCount}/9 Valid Colors` : 'No Cube Detected'})
                                        </span>
                                    </div>
                                    {diagnosticsData && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                                            {MIRRORED_DIAGNOSTIC_INDICES.map((idx) => {
                                                const col = diagnosticsData.detected_colors?.[idx];
                                                const isUnknown = !col || col === 'unknown';
                                                const textColor = DIAGNOSTIC_COLOR_MAP[col] || '#8A92A4';
                                                return (
                                                    <div key={idx} style={{
                                                        background: '#08090C', padding: '5px 8px', borderRadius: '4px',
                                                        border: isUnknown ? '1px solid rgba(255, 255, 255, 0.12)' : `1px solid ${textColor}55`,
                                                        fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                                    }}>
                                                        <span style={{ color: textColor, fontWeight: '700' }}>
                                                            {col ? col.toUpperCase() : 'UNKNOWN'}
                                                        </span>
                                                        <span style={{ color: '#7E8696' }}>{diagnosticsData.hue_angles?.[idx]}°</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {solveError && (
                                <div style={{ marginTop: '14px', padding: '12px 18px', background: 'rgba(239, 68, 68, 0.1)', color: RED_ACCENT, border: `1.5px solid ${RED_ACCENT}`, borderRadius: '8px', fontWeight: '700', textAlign: 'center' }}>
                                    {solveError}
                                </div>
                            )}
                        </div>

                        {/* Scanned Faces Grid Panel */}
                        <div style={{
                            background: PANEL_BG, padding: '26px', borderRadius: '16px', display: 'flex',
                            flexDirection: 'column', alignItems: 'center', minWidth: '320px',
                            border: '1px solid rgba(255, 255, 255, 0.12)', boxShadow: '0 24px 60px rgba(0,0,0,0.8)'
                        }}>
                            {/* Instructions at the Top */}
                            <div style={{ background: CARD_BG, padding: '14px', borderRadius: '10px', width: '100%', marginBottom: '16px', fontSize: '12px', lineHeight: '1.6', border: '1px solid rgba(255, 255, 255, 0.12)', boxSizing: 'border-box' }}>
                                <h3 style={{ marginTop: 0, color: TEXT_PRIMARY, marginBottom: '6px', fontSize: '13px', fontWeight: '800' }}>Instructions</h3>
                                <div style={{ fontWeight: '700', color: ORANGE_PRIMARY, marginBottom: '2px' }}>1. Orientation guide:</div>
                                <ul style={{ margin: 0, paddingLeft: '18px', color: TEXT_SECONDARY, marginBottom: '8px' }}>
                                    <li>White face: scan with Blue on top.</li>
                                    <li>Yellow face: scan with Green on top.</li>
                                    <li>Remaining sides must be scanned with White on top.</li>
                                </ul>
                                <div style={{ fontWeight: '700', color: ORANGE_PRIMARY, marginBottom: '2px' }}>2. How to scan:</div>
                                <div style={{ color: TEXT_SECONDARY }}>Align cube in grid and hold steady for 1 second.</div>
                            </div>

                            {/* Scanned Faces Title Below Instructions */}
                            <h2 style={{ margin: '0 0 10px 0', color: TEXT_PRIMARY, fontWeight: '800', letterSpacing: '-0.3px', fontSize: '1.3rem', alignSelf: 'flex-start' }}>
                                Scanned Faces
                            </h2>

                            {/* Divider Between Text and Cube Map */}
                            <div style={{ width: '100%', height: '1px', background: 'rgba(255, 255, 255, 0.10)', marginBottom: '16px' }} />

                            {/* Cube Map */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                                <div /> <FaceGrid faceObj={faceData.up} label="Up" /> <div /> <div />
                                <FaceGrid faceObj={faceData.left} label="Left" />
                                <FaceGrid faceObj={faceData.front} label="Front" />
                                <FaceGrid faceObj={faceData.right} label="Right" />
                                <FaceGrid faceObj={faceData.back} label="Back" />
                                <div /> <FaceGrid faceObj={faceData.down} label="Down" /> <div /> <div />
                            </div>
                        </div>
                    </div>

                    {/* ================= STAGE 3: SOLUTION ================= */}
                    <div style={{ width: '100vw', height: '100vh', padding: '24px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>

                        <div style={{
                            background: PANEL_BG, padding: '32px', borderRadius: '20px', width: '95%', maxWidth: '1140px', minHeight: '620px',
                            display: 'flex', gap: '32px', border: '1px solid rgba(255, 255, 255, 0.12)',
                            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.9)', alignItems: 'stretch', boxSizing: 'border-box'
                        }}>
                            <div style={{ flex: '1 1 38%', minWidth: '300px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <h1 style={{ marginTop: 0, marginBottom: '16px', color: TEXT_PRIMARY, fontSize: '2.4rem', fontWeight: '800', letterSpacing: '-0.5px', textAlign: 'center' }}>
                                        Solution Ready
                                    </h1>

                                    {isEasterEgg ? (
                                        <div style={{ textAlign: 'center', marginTop: '20px' }}>
                                            <p style={{ fontSize: '18px', color: TEXT_PRIMARY, margin: '20px 0', lineHeight: '1.5', fontWeight: '700' }}>{finalSolution}</p>
                                            <img src="/solved-cake.png" alt="Solved!" style={{ maxWidth: '240px', borderRadius: '12px', border: `2px solid ${ORANGE_PRIMARY}` }} />
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                            {/* Starting Orientation Container */}
                                            <div style={{
                                                padding: '12px 14px',
                                                background: CARD_BG,
                                                borderRadius: '10px',
                                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                                width: '100%',
                                                boxSizing: 'border-box'
                                            }}>
                                                <div style={{ fontSize: '11px', color: TEXT_SECONDARY, marginBottom: '6px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                    Starting Orientation:
                                                </div>
                                                <div style={{ fontSize: '12px', color: TEXT_PRIMARY, fontWeight: '700', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                    <span style={{
                                                        color: 'white',
                                                        background: calibratedProfile?.mapping.front ? `rgb(${calibratedProfile.mapping.front.rgb.join(',')})` : '#00C853',
                                                        padding: '4px 9px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)'
                                                    }}>
                                                        {(calibratedProfile?.mapping.front?.displayName || "GREEN").toUpperCase()} FRONT
                                                    </span>
                                                    <span style={{ color: TEXT_SECONDARY }}>+</span>
                                                    <span style={{
                                                        background: calibratedProfile?.mapping.up ? `rgb(${calibratedProfile.mapping.up.rgb.join(',')})` : '#FFFFFF',
                                                        color: calibratedProfile ? 'white' : 'black',
                                                        padding: '4px 9px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)'
                                                    }}>
                                                        {(calibratedProfile?.mapping.up?.displayName || "WHITE").toUpperCase()} TOP
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Solution Moves List */}
                                            <div style={{
                                                maxHeight: '220px', overflowY: 'auto', fontSize: '15px', fontFamily: 'monospace',
                                                fontWeight: '700', background: '#08090C', padding: '14px', borderRadius: '10px',
                                                border: '1px solid rgba(255, 255, 255, 0.10)', display: 'flex', flexWrap: 'wrap', gap: '8px', alignContent: 'flex-start'
                                            }}>
                                                {solutionMoves.map((move, index) => {
                                                    const isActive = index === currentMoveIndex;
                                                    return (
                                                        <span key={index} onClick={() => { setIsPlaying(false); setCurrentMoveIndex(index); }}
                                                            style={{
                                                                padding: '8px 13px', borderRadius: '6px', cursor: 'pointer',
                                                                background: isActive ? ORANGE_PRIMARY : CARD_BG,
                                                                color: isActive ? '#08090C' : TEXT_PRIMARY,
                                                                border: isActive ? `1.5px solid ${ORANGE_PRIMARY}` : '1px solid rgba(255, 255, 255, 0.10)',
                                                                opacity: index < currentMoveIndex ? 0.35 : 1,
                                                                transform: isActive ? 'scale(1.12)' : 'scale(1)',
                                                                transition: 'all 0.15s ease'
                                                            }}>
                                                            {move}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Solve Another Cube Button permanently anchored to the bottom */}
                                <button onClick={resetForNewCube} style={{ ...btnStyle, width: '100%', padding: '14px', fontSize: '15px', marginTop: 'auto' }}>
                                    ← SOLVE ANOTHER CUBE
                                </button>
                            </div>

                            {!isEasterEgg && (
                                <div style={{ flex: '1 1 56%', minWidth: '320px', width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                    <div style={{ height: '460px', width: '100%', borderRadius: '14px', overflow: 'hidden' }}>
                                        <Cube3D scrambledColors={scrambledColors} solutionMoves={solutionMoves} currentMoveIndex={currentMoveIndex} isPlaying={isPlaying} tps={tps} onMoveComplete={handleMoveComplete} />
                                    </div>
                                    <VisualizerControls isPlaying={isPlaying} setIsPlaying={setIsPlaying} tps={tps} setTps={setTps} currentMoveIndex={currentMoveIndex} totalMoves={solutionMoves.length} setCurrentMoveIndex={setCurrentMoveIndex} />
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </>
    );
};

export default Scanner;