import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Cube3D, VisualizerControls } from './CubeVisualizer';

const MODERN_FONT = 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const SPACE_GRAY = '#0B0C10';
const PANEL_BG = '#12151C';
const AMAZON_GREEN = '#1FA658';
const BANANA_YELLOW = '#FCD12A';
const POMEGRANATE_RED = '#D82B33';

const btnStyle = {
    padding: '12px 20px', background: 'rgba(31, 166, 88, 0.05)', color: AMAZON_GREEN,
    border: `2px solid ${AMAZON_GREEN}`, borderRadius: '8px', cursor: 'pointer',
    fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px',
    boxShadow: `0 0 12px rgba(31, 166, 88, 0.3), inset 0 0 5px rgba(31, 166, 88, 0.1)`,
    transition: 'all 0.2s ease-out'
};

const redBtnStyle = {
    ...btnStyle, color: POMEGRANATE_RED, border: `2px solid ${POMEGRANATE_RED}`, background: 'rgba(216, 43, 51, 0.05)',
    boxShadow: `0 0 12px rgba(216, 43, 51, 0.3), inset 0 0 5px rgba(216, 43, 51, 0.1)`
};

const formatColorName = (name) => {
    if (!name) return "";
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
};

const triggerConfetti = () => {
    const fire = () => window.confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, zIndex: 9999, colors: [AMAZON_GREEN, BANANA_YELLOW, POMEGRANATE_RED, '#ffffff'] });
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
            gain.gain.setValueAtTime(0.1, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            osc.stop(startTime + duration);
        };
        const now = ctx.currentTime;
        playNote(523.25, now, 0.15);
        playNote(659.25, now + 0.15, 0.15);
        playNote(783.99, now + 0.3, 0.15);
        playNote(1046.50, now + 0.45, 0.4);
    } catch(e) {}
};

const FaceGrid = ({ faceObj, label }) => {
    const isScanned = !!faceObj;
    const gridColors = faceObj ? faceObj.colors : Array(9).fill('#222');
    const hasWarning = faceObj && faceObj.hasWarning;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '4px', opacity: isScanned ? 1 : 0.4, transition: 'all 0.4s' }}>
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 18px)', gridTemplateRows: 'repeat(3, 18px)', gap: '2px', padding: '4px',
                backgroundColor: '#111', borderRadius: '6px',
                border: isScanned ? (hasWarning ? `2px solid ${POMEGRANATE_RED}` : `2px solid ${AMAZON_GREEN}`) : '2px solid #333',
                boxShadow: isScanned ? (hasWarning ? `0 0 15px rgba(216, 43, 51, 0.6)` : `0 0 15px rgba(31, 166, 88, 0.4)`) : 'none'
            }}>
                {gridColors.map((c, i) => <div key={i} style={{ backgroundColor: c, width: '100%', height: '100%', borderRadius: '2px' }} />)}
            </div>
            <span style={{ fontSize: '11px', color: isScanned ? (hasWarning ? POMEGRANATE_RED : AMAZON_GREEN) : '#666', marginTop: '6px', fontWeight: '800', letterSpacing: '1px' }}>{label}</span>
            {hasWarning && <span style={{ fontSize: '9px', color: POMEGRANATE_RED, marginTop: '2px', fontWeight: 'bold' }}>Mis-scanned?</span>}
        </div>
    );
};

const Scanner = () => {
    const [activeView, setActiveView] = useState('main');

    const orbRefs = useRef([]);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const isWarpingRef = useRef(false);

    const mainVideoRef = useRef(null);
    const mainCanvasRef = useRef(null);
    const pickerVideoRef = useRef(null);
    const pickerCanvasRef = useRef(null);

    const hasCelebrated = useRef(false);
    const processingRef = useRef(false);
    const stabilityCounter = useRef(0);
    const lastFaceRef = useRef(null);

    const [faceData, setFaceData] = useState({ up: null, left: null, front: null, right: null, back: null, down: null });
    const [detectedFace, setDetectedFace] = useState("Searching...");
    const [scanProgress, setScanProgress] = useState(0);
    const [isAutoScanning, setIsAutoScanning] = useState(true);
    const [solveError, setSolveError] = useState(null);

    const [finalSolution, setFinalSolution] = useState(null);
    const [solutionMoves, setSolutionMoves] = useState([]);
    const [scrambledColors, setScrambledColors] = useState([]);
    const [isEasterEgg, setIsEasterEgg] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
    const [tps, setTps] = useState(0.5);

    const [pickerColors, setPickerColors] = useState([]);
    const [pickerNames, setPickerNames] = useState(["", "", "", "", "", ""]);
    const [prefFront, setPrefFront] = useState(null);
    const [prefTop, setPrefTop] = useState(null);
    const [customScheme, setCustomScheme] = useState(null);

    useEffect(() => {
        const baseDirections = [0, 45, 90, 135, 180, 225, 270, 315];
        const orbsData = baseDirections.map(baseAngle => {
            const angleDeg = baseAngle + (Math.random() - 0.5) * 20;
            const rad = angleDeg * Math.PI / 180;
            return {
                x: window.innerWidth / 2, y: window.innerHeight / 2,
                vx: Math.cos(rad), vy: Math.sin(rad),
            };
        });

        let reqId;
        const BASE_SPEED = 1.0;
        const WARP_SPEED_MULTIPLIER = 5.0;

        const updatePhysics = () => {
            const size = window.innerWidth * 0.25;
            const speed = isWarpingRef.current ? BASE_SPEED * WARP_SPEED_MULTIPLIER : BASE_SPEED;

            orbsData.forEach((orb, i) => {
                orb.x += orb.vx * speed;
                orb.y += orb.vy * speed;
                let bounced = false;

                if (orb.x <= 0) { orb.x = 0; orb.vx *= -1; bounced = true; }
                else if (orb.x >= window.innerWidth) { orb.x = window.innerWidth; orb.vx *= -1; bounced = true; }

                if (orb.y <= 0) { orb.y = 0; orb.vy *= -1; bounced = true; }
                else if (orb.y >= window.innerHeight) { orb.y = window.innerHeight; orb.vy *= -1; bounced = true; }

                if (bounced) {
                    let currentRad = Math.atan2(orb.vy, orb.vx);
                    currentRad += (Math.random() - 0.5) * (30 * Math.PI / 180);
                    orb.vx = Math.cos(currentRad);
                    orb.vy = Math.sin(currentRad);
                }

                if (orbRefs.current[i]) {
                    const offsetX = orb.x - (size / 2);
                    const offsetY = orb.y - (size / 2);
                    orbRefs.current[i].style.transform = `translate(${offsetX}px, ${offsetY}px)`;
                }
            });
            reqId = requestAnimationFrame(updatePhysics);
        };
        reqId = requestAnimationFrame(updatePhysics);
        return () => cancelAnimationFrame(reqId);
    }, []);

    useEffect(() => {
        setIsTransitioning(true);
        isWarpingRef.current = true;
        const timer = setTimeout(() => {
            setIsTransitioning(false);
            isWarpingRef.current = false;
        }, 800);
        return () => clearTimeout(timer);
    }, [activeView]);

    useEffect(() => {
        axios.post('http://localhost:8000/reset');
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 1280, height: 720 } })
            .then(stream => {
                if (mainVideoRef.current) mainVideoRef.current.srcObject = stream;
                if (pickerVideoRef.current) pickerVideoRef.current.srcObject = stream;
            })
            .catch(err => console.error("Camera failed", err));
    }, []);

    // --- TIMING UPDATE --- 100ms interval
    useEffect(() => {
        const interval = setInterval(runAutoScanTick, 100);
        return () => clearInterval(interval);
    }, [activeView, customScheme, finalSolution, isAutoScanning]);

    useEffect(() => {
        const savedScheme = localStorage.getItem('rubiks_solver_custom_scheme');
        if (savedScheme) {
            try { setCustomScheme({ mapping: JSON.parse(savedScheme) }); } catch (e) { }
        }
    }, []);

    const playSuccessSound = () => {
        const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
        audio.play().catch(e => {});
    };

    const resetForNewCube = () => {
        setFinalSolution(null);
        setSolutionMoves([]);
        setIsEasterEgg(false);
        hasCelebrated.current = false;
        setCurrentMoveIndex(0);
        setFaceData({ up: null, left: null, front: null, right: null, back: null, down: null });
        setScanProgress(0);
        setSolveError(null);
        setIsAutoScanning(true);
        setDetectedFace("Searching...");
        setActiveView('main');
        axios.post('http://localhost:8000/reset');
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
            if (customScheme) payload.custom_palette = Object.values(customScheme.mapping);

            const res = await axios.post('http://localhost:8000/scan-raw', payload);

            if (res.data.success && res.data.face_name !== "unknown") {
                const currentFaceName = res.data.face_name;
                setDetectedFace(currentFaceName.toUpperCase());
                if (currentFaceName === lastFaceRef.current) stabilityCounter.current += 1;
                else { stabilityCounter.current = 0; setScanProgress(0); }
                lastFaceRef.current = currentFaceName;

                // 10 Ticks * 100ms = Exactly 1.0 Seconds to scan
                const TARGET_TICKS = 10;
                setScanProgress(Math.min((stabilityCounter.current / TARGET_TICKS) * 100, 100));

                if (stabilityCounter.current >= TARGET_TICKS) {
                    await commitScan(currentFaceName);
                    stabilityCounter.current = 0; setScanProgress(0);
                }
            } else {
                stabilityCounter.current = 0; setScanProgress(0);
                setDetectedFace(res.data.message || "Searching...");
            }
        } catch (err) {}
        processingRef.current = false;
    };

    const commitScan = async (faceName) => {
        try {
            const payload = { image: mainCanvasRef.current.toDataURL('image/jpeg'), face_name: faceName, preview: false, picker_mode: false };
            if (customScheme) payload.custom_palette = Object.values(customScheme.mapping);

            const res = await axios.post('http://localhost:8000/scan-raw', payload);
            if (res.data.success) {
                playSuccessSound();
                setSolveError(null);
                const cssColors = res.data.rgb_preview.map(c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`);
                setFaceData(prev => ({ ...prev, [faceName]: { colors: cssColors, hasWarning: res.data.has_warnings } }));

                if (res.data.scanned_count === 6) {
                    setIsAutoScanning(false);
                    solve();
                } else {
                    setIsAutoScanning(false);
                    // Exactly 1.0 Second Cooldown
                    setTimeout(() => {
                        setScanProgress(0);
                        setIsAutoScanning(true);
                    }, 1000);
                }
            }
        } catch (err) {}
    };

    const solve = async () => {
        try {
            const res = await axios.post('http://localhost:8000/solve-global');
            const sol = res.data.solution;
            setFinalSolution(sol);
            setSolveError(null);

            const colorsFor3D = res.data.parsed_colors.map(face => {
                if (customScheme) return `rgb(${customScheme.mapping[face].rgb[0]}, ${customScheme.mapping[face].rgb[1]}, ${customScheme.mapping[face].rgb[2]})`;
                const standardMap = { 'up': 'white', 'down': 'yellow', 'front': 'green', 'back': 'blue', 'right': 'red', 'left': 'orange' };
                return standardMap[face];
            });
            setScrambledColors(colorsFor3D);

            if (sol.startsWith("Good news")) { setIsEasterEgg(true); setSolutionMoves([]); }
            else { setIsEasterEgg(false); setSolutionMoves(sol.split(' ')); }

            setActiveView('solution');

        } catch (err) {
            setSolveError(err.response?.data?.detail || "An unknown solver error occurred.");
            setIsAutoScanning(true);
        }
    };

    const handleMoveComplete = () => {
        if (currentMoveIndex + 1 === solutionMoves.length && !hasCelebrated.current) {
            triggerConfetti();
            hasCelebrated.current = true;
        }
        if (isPlaying && currentMoveIndex < solutionMoves.length) setCurrentMoveIndex(prev => prev + 1);
        else setIsPlaying(false);
    };

    const scanPickerCenter = async () => {
        if (!pickerVideoRef.current) return;
        const context = pickerCanvasRef.current.getContext('2d');
        pickerCanvasRef.current.width = pickerVideoRef.current.videoWidth;
        pickerCanvasRef.current.height = pickerVideoRef.current.videoHeight;
        context.drawImage(pickerVideoRef.current, 0, 0);

        try {
            const res = await axios.post('http://localhost:8000/scan-raw', {
                image: pickerCanvasRef.current.toDataURL('image/jpeg'), face_name: "auto", preview: true, picker_mode: true
            });
            if (res.data.raw_features) {
                setPickerColors(prev => [...prev, res.data.raw_features[4]]);
                playSuccessSound();
            }
        } catch (err) { }
    };

    const handleNameChange = (index, value) => {
        const newNames = [...pickerNames];
        newNames[index] = formatColorName(value);
        setPickerNames(newNames);
    };

    const applyCustomScheme = () => {
        const opposites = {0:2, 1:3, 2:0, 3:1, 4:5, 5:4};
        const u = prefTop; const f = prefFront;
        const getRightIdx = (f, u) => {
            if (u === 4) return {0:1, 1:2, 2:3, 3:0}[f]; if (u === 5) return {0:3, 1:0, 2:1, 3:2}[f];
            if (u === 0) return {4:1, 1:5, 5:3, 3:4}[f]; if (u === 2) return {4:3, 3:5, 5:1, 1:4}[f];
            if (u === 1) return {4:2, 2:5, 5:0, 0:4}[f]; if (u === 3) return {4:0, 0:5, 5:2, 2:4}[f]; return -1;
        }
        const r = getRightIdx(f, u);
        const mapping = {
            'up': { ...pickerColors[u], name: pickerNames[u] || `Color ${u+1}`, face: 'up' },
            'front': { ...pickerColors[f], name: pickerNames[f] || `Color ${f+1}`, face: 'front' },
            'right': { ...pickerColors[r], name: pickerNames[r] || `Color ${r+1}`, face: 'right' },
            'down': { ...pickerColors[opposites[u]], name: pickerNames[opposites[u]] || `Color ${opposites[u]+1}`, face: 'down' },
            'back': { ...pickerColors[opposites[f]], name: pickerNames[opposites[f]] || `Color ${opposites[f]+1}`, face: 'back' },
            'left': { ...pickerColors[opposites[r]], name: pickerNames[opposites[r]] || `Color ${opposites[r]+1}`, face: 'left' }
        };
        setCustomScheme({ mapping });
        localStorage.setItem('rubiks_solver_custom_scheme', JSON.stringify(mapping));
        setActiveView('main');
        resetForNewCube();
    };

    let translatePos = '-100vw';
    if (activeView === 'picker') translatePos = '0vw';
    if (activeView === 'solution') translatePos = '-200vw';

    const opposites = {0:2, 1:3, 2:0, 3:1, 4:5, 5:4};
    const isAdjacent = prefFront !== null && prefTop !== null && prefFront !== prefTop && opposites[prefFront] !== prefTop;

    const cinematicTransition = 'transform 0.8s cubic-bezier(0.64, 0, 0.36, 1)';
    const bgOpacity = isTransitioning ? 0.6 : 0.2;
    const bgScale = isTransitioning ? 'scale(1.2)' : 'scale(1)';
    const glowTransition = 'all 0.8s cubic-bezier(0.25, 1, 0.5, 1)';

    const ORB_COLORS = [
        { rgb: '31,166,88' },
        { rgb: '216,43,51' },
        { rgb: '252,209,42' },
        { rgb: '31,166,88' },
        { rgb: '216,43,51' },
        { rgb: '252,209,42' },
        { rgb: '31,166,88' },
        { rgb: '216,43,51' }
    ];

    return (
        <>
            <style>{`
                html, body { margin: 0; padding: 0; width: 100%; height: 100%; background-color: ${SPACE_GRAY}; overflow: hidden; }
            `}</style>

            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', overflow: 'hidden', background: SPACE_GRAY, fontFamily: MODERN_FONT, color: 'white' }}>

                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0, pointerEvents: 'none' }}>
                    {ORB_COLORS.map((orb, i) => (
                        <div key={i} ref={el => orbRefs.current[i] = el} style={{ position: 'absolute', top: 0, left: 0, width: '25vw', height: '25vw', willChange: 'transform' }}>
                            <div style={{ width: '100%', height: '100%', background: `radial-gradient(circle, rgba(${orb.rgb},1) 0%, rgba(${orb.rgb},0) 65%)`, filter: 'blur(90px)', opacity: bgOpacity, transform: bgScale, transition: glowTransition }} />
                        </div>
                    ))}
                </div>

                <div style={{ position: 'relative', zIndex: 1, display: 'flex', width: '300vw', height: '100vh', transform: `translateX(${translatePos})`, transition: cinematicTransition }}>

                    {/* ================= STAGE 1: COLOR SCHEME PICKER ================= */}
                    <div style={{ width: '100vw', height: '100vh', padding: '20px', boxSizing: 'border-box', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '30px', position: 'relative' }}>

                        <div style={{ position: 'absolute', top: '30px', right: '30px', zIndex: 10 }}>
                            <button onClick={() => setActiveView('main')} style={btnStyle}>MAIN SCANNER →</button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: PANEL_BG, padding: '25px', borderRadius: '15px', border: '1px solid #1f2533', boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(31, 166, 88, 0.05)' }}>
                            <h1 style={{ color: '#FFF', marginBottom: '15px', fontSize: '1.8rem', marginTop: 0, fontWeight: '800', textShadow: `0 0 10px ${AMAZON_GREEN}` }}>Color Scheme Picker</h1>

                            <div style={{ position: 'relative', width: '100%', maxWidth: '700px', aspectRatio: '16/9', backgroundColor: '#000', borderRadius: '10px', border: `4px solid ${BANANA_YELLOW}`, boxShadow: `0 0 20px rgba(252, 209, 42, 0.5)`, overflow: 'hidden' }}>
                                <video ref={pickerVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', height: '26.66%', aspectRatio: '1/1', border: `3px solid ${BANANA_YELLOW}`, borderRadius: '50%', boxShadow: '0 0 10px rgba(0,0,0,0.5)' }} />
                            </div>

                            <canvas ref={pickerCanvasRef} style={{ display: 'none' }} />
                            <div style={{marginTop: '20px', display: 'flex', gap: '10px', width: '100%'}}>
                                <button onClick={scanPickerCenter} disabled={pickerColors.length >= 6} style={{...btnStyle, flex: 2}}>SCAN SIDE</button>
                                <button onClick={() => setPickerColors(prev => prev.slice(0, -1))} disabled={pickerColors.length === 0} style={{...redBtnStyle, flex: 1}}>UNDO</button>
                            </div>
                        </div>

                        <div style={{ background: PANEL_BG, padding: '25px', borderRadius: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '320px', border: '1px solid #1f2533', boxShadow: '0 20px 50px rgba(0,0,0,0.8)' }}>
                            {pickerColors.length < 6 ? (
                                <div style={{color: '#9aa0a6', lineHeight: '1.5', width: '100%'}}>
                                    <h3 style={{marginTop:0, color:'white', marginBottom:'10px', fontSize:'16px', fontWeight:'800'}}>Instructions</h3>
                                    <div style={{ background: '#181b21', padding: '15px', borderRadius: '10px', borderLeft: `4px solid ${BANANA_YELLOW}` }}>
                                        {pickerColors.length === 0 && <p style={{margin:0}}>1. Scan <b style={{color:'white'}}>any side</b> of the cube.</p>}
                                        {pickerColors.length > 0 && pickerColors.length < 4 && <p style={{margin:0}}>{pickerColors.length + 1}. Rotate the cube <b style={{color:'white'}}>clockwise</b> and scan the next side.</p>}
                                        {pickerColors.length === 4 && <p style={{margin:0}}>5. Look at the <b style={{color:'white'}}>TOP</b> side relative to your last scan.</p>}
                                        {pickerColors.length === 5 && <p style={{margin:0}}>6. Look at the <b style={{color:'white'}}>BOTTOM</b> side relative to your last scan.</p>}
                                    </div>

                                    <div style={{marginTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                        <span style={{fontSize: '16px', fontWeight: 'bold', color: '#FFF'}}>Progress:</span>
                                        <span style={{fontSize: '16px', fontWeight: 'bold', color: BANANA_YELLOW, textShadow: `0 0 8px ${BANANA_YELLOW}`}}>{pickerColors.length} / 6</span>
                                    </div>
                                    {pickerColors.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px', width: '100%', background: '#0a0c10', padding: '10px', borderRadius: '8px', border: '1px solid #222' }}>
                                            {pickerColors.map((c, i) => (
                                                <div key={i} style={{ height: '20px', width: '100%', background: `rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`, borderRadius: '4px', boxShadow: `0 0 6px rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})` }} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{width: '100%'}}>
                                    <p style={{color: AMAZON_GREEN, fontWeight: '800', marginBottom: '15px', fontSize: '15px', textShadow: `0 0 5px ${AMAZON_GREEN}`}}>Name colors & pick orientation:</p>
                                    <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                                        {pickerColors.map((c, i) => (
                                            <div key={i} style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                                <div style={{width: '24px', height: '24px', background: `rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`, borderRadius: '6px', border: '2px solid #555', boxShadow: `0 0 6px rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`}} />
                                                <input value={pickerNames[i]} onChange={(e) => handleNameChange(i, e.target.value)} placeholder={`Color ${i+1}`} style={{width: '100px', padding: '6px', background: '#0a0c10', color: 'white', border: '1px solid #333', borderRadius: '4px', outline: 'none'}} />
                                                <button onClick={() => setPrefFront(i)} style={{padding: '6px', background: prefFront === i ? AMAZON_GREEN : '#222', color: prefFront === i ? '#000' : '#888', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s', boxShadow: prefFront === i ? `0 0 10px ${AMAZON_GREEN}` : 'none'}}>Front</button>
                                                <button onClick={() => setPrefTop(i)} style={{padding: '6px', background: prefTop === i ? AMAZON_GREEN : '#222', color: prefTop === i ? '#000' : '#888', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s', boxShadow: prefTop === i ? `0 0 10px ${AMAZON_GREEN}` : 'none'}}>Top</button>
                                            </div>
                                        ))}
                                    </div>
                                    {!isAdjacent && prefFront !== null && prefTop !== null && ( <p style={{color: POMEGRANATE_RED, fontSize: '12px', marginTop: '10px', fontWeight: 'bold', textShadow: `0 0 5px ${POMEGRANATE_RED}`}}>Front and Top must be adjacent!</p> )}
                                    <button onClick={applyCustomScheme} disabled={!isAdjacent} style={{...btnStyle, width: '100%', marginTop: '20px', opacity: isAdjacent ? 1 : 0.2}}>APPLY SCHEME</button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ================= STAGE 2: MAIN SCANNER ================= */}
                    <div style={{ width: '100vw', height: '100vh', padding: '20px', boxSizing: 'border-box', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '30px', position: 'relative' }}>

                        <div style={{position: 'absolute', top: '30px', left: '30px', display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 10}}>
                            <button onClick={() => { setPickerColors([]); setPickerNames(["", "", "", "", "", ""]); setPrefFront(null); setPrefTop(null); setActiveView('picker'); }} style={btnStyle}>← Color Scheme Picker</button>
                            {customScheme && (
                                <button onClick={() => { setCustomScheme(null); localStorage.removeItem('rubiks_solver_custom_scheme'); resetForNewCube(); }} style={redBtnStyle}>Revert Colors</button>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: PANEL_BG, padding: '25px', borderRadius: '15px', border: '1px solid #1f2533', boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 40px rgba(31, 166, 88, 0.03)' }}>
                            <h1 style={{ color: '#FFF', marginBottom: '10px', fontSize: '2.5rem', marginTop: 0, fontWeight: '900', letterSpacing: '-1px', textShadow: `0 0 15px ${AMAZON_GREEN}` }}>Rubik's Solver AI</h1>
                            <div style={{ height: '30px', marginBottom: '10px' }}>
                                <span style={{ color: '#888', fontSize: '16px', fontWeight: 'bold' }}>Detected: <b style={{color: '#FFF', textShadow: '0 0 5px white'}}>{detectedFace}</b></span>
                            </div>

                            <div style={{ position: 'relative', width: '100%', maxWidth: '700px', aspectRatio: '16/9', backgroundColor: '#000', borderRadius: '10px', border: `4px solid ${AMAZON_GREEN}`, boxShadow: `0 0 25px rgba(31, 166, 88, 0.3)`, overflow: 'hidden' }}>
                                <video ref={mainVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />

                                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', height: '80%', aspectRatio: '1/1', border: `4px solid ${scanProgress > 0 ? AMAZON_GREEN : '#555'}`, transition: 'border-color 0.2s', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr 1fr 1fr', borderRadius: '8px', overflow: 'hidden', boxShadow: scanProgress > 0 ? `0 0 15px ${AMAZON_GREEN}, inset 0 0 15px ${AMAZON_GREEN}` : 'none' }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, width: `${scanProgress}%`, height: '6px', background: AMAZON_GREEN, transition: 'width 0.1s linear', boxShadow: `0 0 10px ${AMAZON_GREEN}` }}/>
                                    {[...Array(9)].map((_, i) => <div key={i} style={{ border: '1px solid rgba(255,255,255,0.15)' }} />)}
                                </div>
                            </div>

                            <canvas ref={mainCanvasRef} style={{ display: 'none' }} />

                            {solveError && (
                                <div style={{ marginTop: '15px', padding: '12px 20px', background: 'rgba(216, 43, 51, 0.1)', color: POMEGRANATE_RED, border: `1px solid ${POMEGRANATE_RED}`, borderRadius: '8px', fontWeight: 'bold', textAlign: 'center', boxShadow: `0 0 10px rgba(216, 43, 51, 0.2)` }}>
                                    {solveError}
                                </div>
                            )}
                        </div>

                        <div style={{ background: PANEL_BG, padding: '25px', borderRadius: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '320px', border: '1px solid #1f2533', boxShadow: '0 20px 50px rgba(0,0,0,0.8)' }}>
                            <h2 style={{marginTop:0, color: '#FFF', fontWeight:'800', letterSpacing:'1px', textShadow: `0 0 10px ${AMAZON_GREEN}`}}>Scanned Faces</h2>
                            <div style={{ background: '#181b21', padding: '15px', borderRadius: '10px', width: '100%', marginBottom: '20px', fontSize: '12px', lineHeight: '1.6', borderLeft: `4px solid ${AMAZON_GREEN}` }}>
                                <h3 style={{marginTop:0, color:'white', marginBottom:'8px', fontSize:'14px', fontWeight:'800'}}>Instructions</h3>
                                <div style={{fontWeight: '800', color: AMAZON_GREEN, marginBottom: '2px'}}>1. Orientation guide:</div>
                                {customScheme ? (
                                    <ul style={{margin:0, paddingLeft:'20px', color: '#aaa', marginBottom:'10px'}}>
                                        <li>Main sides: hold <b style={{color:'white'}}>{customScheme.mapping.up.name}</b> on top.</li>
                                        <li>{customScheme.mapping.up.name} face: hold <b style={{color:'white'}}>{customScheme.mapping.back.name}</b> on top.</li>
                                        <li>{customScheme.mapping.down.name} face: hold <b style={{color:'white'}}>{customScheme.mapping.front.name}</b> on top.</li>
                                    </ul>
                                ) : (
                                    <ul style={{margin:0, paddingLeft:'20px', color: '#aaa', marginBottom:'10px'}}>
                                        <li>Main sides: hold <b style={{color:'white'}}>White</b> on top.</li>
                                        <li>White face: hold <b style={{color:'white'}}>Blue</b> on top.</li>
                                        <li>Yellow face: hold <b style={{color:'white'}}>Green</b> on top.</li>
                                    </ul>
                                )}
                                <div style={{fontWeight: '800', color: AMAZON_GREEN, marginBottom: '2px'}}>2. How to scan:</div>
                                <div style={{color: '#aaa'}}>Align in grid. Hold steady for 1 second.</div>
                            </div>
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
                    <div style={{ width: '100vw', height: '100vh', padding: '20px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>

                        <div style={{ background: PANEL_BG, padding: '30px', borderRadius: '20px', width: '95%', maxWidth: '1000px', display: 'flex', gap: '30px', border: '1px solid #1f2533', boxShadow: `0 20px 60px rgba(0,0,0,0.9), 0 0 50px rgba(31, 166, 88, 0.05)`, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 40%', minWidth: '280px' }}>
                                <h1 style={{marginTop:0, color: '#FFF', fontSize: '2.5rem', fontWeight:'900', letterSpacing:'-1px', textShadow: `0 0 20px ${AMAZON_GREEN}`}}>Solution Ready</h1>

                                {isEasterEgg ? (
                                    <div style={{ textAlign: 'center' }}>
                                        <p style={{ fontSize: '20px', color: '#FFF', margin: '20px 0', lineHeight: '1.5', fontWeight: 'bold' }}>{finalSolution}</p>
                                        <img src="/solved-cake.png" alt="Solved!" style={{ maxWidth: '250px', borderRadius: '15px', border: `4px solid ${AMAZON_GREEN}`, boxShadow: `0 0 20px rgba(31, 166, 88, 0.4)` }} />
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ margin: '20px 0', padding: '15px', background: '#181b21', borderRadius: '10px', borderLeft: `4px solid ${AMAZON_GREEN}` }}>
                                            <p style={{ fontSize: '13px', color: '#888', marginBottom: '8px', fontWeight: '800', textTransform: 'uppercase' }}>Starting Orientation:</p>
                                            <p style={{ fontSize: '14px', color: '#fff', fontWeight: 'bold', margin:0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                 <span style={{ color: 'white', background: customScheme ? `rgb(${customScheme.mapping.front.rgb.join(',')})` : '#1FA658', padding: '6px 10px', borderRadius: '4px', textShadow: '0 0 2px black', border: '1px solid rgba(255,255,255,0.2)' }}>
                                                     {(customScheme ? customScheme.mapping.front.name : "GREEN").toUpperCase()} FRONT
                                                 </span>
                                                <span style={{color: '#888'}}>+</span>
                                                <span style={{ color: 'white', background: customScheme ? `rgb(${customScheme.mapping.up.rgb.join(',')})` : '#e0e0e0', color: customScheme ? 'white' : 'black', padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', textShadow: customScheme ? '0 0 2px black' : 'none' }}>
                                                     {(customScheme ? customScheme.mapping.up.name : "WHITE").toUpperCase()} TOP
                                                 </span>
                                            </p>
                                        </div>

                                        <div style={{ maxHeight: '220px', overflowY: 'auto', fontSize: '16px', fontFamily: 'monospace', fontWeight: 'bold', background: '#0a0c10', padding:'15px', borderRadius:'10px', border: '1px solid #222', display:'flex', flexWrap:'wrap', gap:'10px', alignContent: 'flex-start' }}>
                                            {solutionMoves.map((move, index) => {
                                                const isActive = index === currentMoveIndex;
                                                return (
                                                    <span key={index} onClick={() => { setIsPlaying(false); setCurrentMoveIndex(index); }}
                                                          style={{
                                                              padding: '8px 14px', borderRadius: '6px', cursor: 'pointer',
                                                              background: isActive ? AMAZON_GREEN : '#181b21',
                                                              color: isActive ? '#000' : '#FFF',
                                                              border: isActive ? `1px solid ${AMAZON_GREEN}` : '1px solid #333',
                                                              boxShadow: isActive ? `0 0 15px rgba(31, 166, 88, 0.6)` : 'none',
                                                              opacity: index < currentMoveIndex ? 0.3 : 1,
                                                              transform: isActive ? 'scale(1.15)' : 'scale(1)',
                                                              transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
                                                          }}>
                                                        {move}
                                                    </span>
                                                )
                                            })}
                                        </div>
                                    </>
                                )}

                                <button onClick={resetForNewCube} style={{ ...btnStyle, marginTop: '20px', width: '100%', padding: '15px', fontSize: '16px', background: 'rgba(31, 166, 88, 0.05)' }}>
                                    ← SOLVE ANOTHER CUBE
                                </button>
                            </div>

                            {!isEasterEgg && (
                                <div style={{ flex: '1 1 50%', minWidth: '280px', width: '100%', display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ height: '400px', width: '100%', borderRadius: '15px', overflow: 'hidden', border: '1px solid #1f2533', boxShadow: '0 0 30px rgba(0,0,0,0.8)' }}>
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