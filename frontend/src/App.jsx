// frontend/src/App.jsx
import { useState } from 'react'
import Scanner from './components/Scanner'
import './App.css'

function App() {
    const [scannedData, setScannedData] = useState(null);

    const handleScan = (data) => {
        setScannedData(data);
        alert("Snapshot taken! Check console for Base64 data.");
    };

    return (
        <div className="app-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px' }}>
            <h1>Rubik's Solver AI</h1>
            <p>Align the cube in the center</p>

            <Scanner onScan={handleScan} />

            {/* Temporary preview of the captured image */}
            {scannedData && (
                <div style={{ marginTop: '20px' }}>
                    <h3>Last Scan:</h3>
                    <img src={scannedData} alt="Scanned" style={{ width: '150px', border: '1px solid white' }} />
                </div>
            )}
        </div>
    )
}

export default App