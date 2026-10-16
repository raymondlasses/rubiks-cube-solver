import { useEffect, useRef } from 'react';

const DotMatrixBackground = ({ isTransitioning = false }) => {
    const canvasRef = useRef(null);
    const speedBoostRef = useRef(1.0);
    const timeRef = useRef(0);
    const rafIdRef = useRef(null);

    // Accelerate wave speed when transitioning between pages
    useEffect(() => {
        if (isTransitioning) {
            speedBoostRef.current = 5.5;
        }
    }, [isTransitioning]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = 0;
        let height = 0;
        let isVisible = true;

        const handleResize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        handleResize();
        window.addEventListener('resize', handleResize);

        const handleVisibilityChange = () => {
            isVisible = !document.hidden;
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        const SPACING = 28; // Grid dot spacing in pixels
        let lastTimestamp = performance.now();

        const render = (now) => {
            const delta = Math.min((now - lastTimestamp) / 1000, 0.1);
            lastTimestamp = now;

            if (isVisible) {
                // Smoothly decay acceleration back toward baseline (1.0)
                if (speedBoostRef.current > 1.0) {
                    speedBoostRef.current = Math.max(1.0, speedBoostRef.current - delta * 4.5);
                }

                timeRef.current += delta * speedBoostRef.current;
                const t = timeRef.current;

                ctx.fillStyle = '#08090C';
                ctx.fillRect(0, 0, width, height);

                const cols = Math.ceil(width / SPACING) + 1;
                const rows = Math.ceil(height / SPACING) + 1;

                for (let r = 0; r < rows; r++) {
                    const y = r * SPACING;
                    for (let c = 0; c < cols; c++) {
                        const x = c * SPACING;

                        // 2.5D composite sine-cosine wave motion
                        const w1 = Math.sin(x * 0.0055 + t * 1.4);
                        const w2 = Math.cos(y * 0.0065 + t * 1.8);
                        const w3 = Math.sin((x + y) * 0.0035 + t * 1.2);
                        const z = (w1 + w2 + w3) / 3; // range approx -1 to 1

                        // Normalized elevation from 0 to 1
                        const norm = (z + 1) * 0.5;

                        // Base dot radius with wave elevation
                        const radius = 1.0 + norm * 1.6;

                        // Color: Silver-grey at baseline, vibrant warm orange on wave crests
                        let fillStyle;
                        if (norm > 0.65) {
                            const orangeIntensity = (norm - 0.65) / 0.35;
                            const alpha = 0.3 + orangeIntensity * 0.55;
                            fillStyle = `rgba(255, 107, 0, ${alpha.toFixed(2)})`;
                        } else {
                            const alpha = 0.10 + norm * 0.15;
                            fillStyle = `rgba(165, 180, 205, ${alpha.toFixed(2)})`;
                        }

                        ctx.beginPath();
                        ctx.arc(x, y + z * 6.0, radius, 0, Math.PI * 2);
                        ctx.fillStyle = fillStyle;
                        ctx.fill();
                    }
                }
            }

            rafIdRef.current = requestAnimationFrame(render);
        };

        rafIdRef.current = requestAnimationFrame(render);

        return () => {
            window.removeEventListener('resize', handleResize);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 0,
                pointerEvents: 'none',
                display: 'block'
            }}
        />
    );
};

export default DotMatrixBackground;
