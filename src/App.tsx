import React, { useState, useEffect } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  ReferenceLine 
} from 'recharts';
import { 
  Play, 
  Upload, 
  Trash2, 
  Info,
  Sun,
  Moon,
  FileText
} from 'lucide-react';
import { 
  MATERIALS, 
  computeIV, 
  extractParameters, 
  formatParam
} from './physics';
import type { ExtractedParams } from './physics';
import { exportCSV, savePlotImage, exportPDF } from './exports';
import type { TableRow } from './exports';

export default function App() {
  // --- STATE ---
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [analysisMode, setAnalysisMode] = useState<string>('Single Material');
  const [mat1, setMat1] = useState<string>('Silicon (Si)');
  const [mat2, setMat2] = useState<string>('Select Material...');
  
  // Custom Material State
  const [customIsExp, setCustomIsExp] = useState<number>(-10);
  const [customN, setCustomN] = useState<number>(1.0);
  const [customEg, setCustomEg] = useState<number>(1.12);
  
  // Simulation Controls
  const [temperature, setTemperature] = useState<number>(300);
  const [seriesRes, setSeriesRes] = useState<number>(0.0);
  const [vbr, setVbr] = useState<number>(15.0);
  
  // Overlay Toggles
  const [showTurnOn, setShowTurnOn] = useState<boolean>(true);
  const [showThermal, setShowThermal] = useState<boolean>(false);
  const [isLogAxis, setIsLogAxis] = useState<boolean>(false);
  const [zoomForward, setZoomForward] = useState<boolean>(false);
  
  // CSV Experimental Overlay
  const [csvOverlay, setCsvOverlay] = useState<{
    V: number[];
    I: number[];
    filename: string;
    params: ExtractedParams;
  } | null>(null);

  // Plotted Results
  const [isPlotted, setIsPlotted] = useState<boolean>(false);
  const [chartData, setChartData] = useState<any[]>([]);
  const [activeCurves, setActiveCurves] = useState<Array<{
    key: string;
    absKey: string;
    name: string;
    color: string;
    vOn: number | null;
  }>>([]);
  const [thermalLines, setThermalLines] = useState<Array<{
    x: number;
    label: string;
  }>>([]);
  
  // Treeview Parameters Table Rows
  const [tableRows, setTableRows] = useState<Array<{
    name: string;
    vOn: string;
    n: string;
    I_sat: string;
    bandgap: string;
    rs: string;
    vbr: string;
  }>>([]);

  const [hoveredRefLine, setHoveredRefLine] = useState<string | null>(null);

  // --- THEME SYNC ---
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // --- MATERIAL HELPERS ---
  const getMaterialParams = (name: string) => {
    if (name === 'Custom...') {
      return {
        I_s: Math.pow(10, customIsExp),
        n: customN,
        color: '#a855f7', // Premium Custom Purple
        bandgap: customEg,
        V_br: vbr,
        description: 'User-defined custom material parameters'
      };
    }
    return MATERIALS[name];
  };

  // --- CSV PARSING ---
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      try {
        const lines = text.split('\n').map(line => line.trim()).filter(line => line !== '');
        if (lines.length < 2) throw new Error("CSV file must have a header and data rows.");

        // Parse header to find Voltage/Current columns
        const header = lines[0].split(/[;,]/).map(col => col.trim().toLowerCase());
        let vIdx = -1, iIdx = -1;
        for (let i = 0; i < header.length; i++) {
          if (header[i].includes('voltage') || header[i] === 'v' || header[i].includes('volt')) {
            vIdx = i;
          } else if (header[i].includes('current') || header[i] === 'i' || header[i].includes('amp') || header[i].includes('curr')) {
            iIdx = i;
          }
        }
        if (vIdx === -1 || iIdx === -1) {
          vIdx = 0;
          iIdx = 1;
        }

        const parsedV: number[] = [];
        const parsedI: number[] = [];

        for (let r = 1; r < lines.length; r++) {
          const row = lines[r].split(/[;,]/);
          if (row.length <= Math.max(vIdx, iIdx)) continue;
          const vVal = parseFloat(row[vIdx]);
          const iVal = parseFloat(row[iIdx]);
          if (!isNaN(vVal) && !isNaN(iVal)) {
            parsedV.push(vVal);
            parsedI.push(iVal);
          }
        }

        if (parsedV.length === 0) throw new Error("Could not parse any numeric rows.");

        // Detect if current is in mA and scale to Amps
        let isMa = header.some(col => col.includes('ma'));
        let I_arr = [...parsedI];
        const maxVal = Math.max(...I_arr.map(Math.abs));
        if (!isMa && maxVal > 2.0) {
          isMa = true;
        }
        if (isMa) {
          I_arr = I_arr.map(val => val / 1000.0);
        }

        const params = extractParameters(parsedV, I_arr, temperature);
        setCsvOverlay({
          V: parsedV,
          I: I_arr,
          filename: file.name,
          params
        });
        alert(`Successfully loaded '${file.name}' with ${parsedV.length} data points.`);
      } catch (err: any) {
        alert(`CSV Upload Error: ${err.message || err}`);
      }
    };
    reader.readAsText(file);
  };

  // --- RUN ANALYSIS / PLOTTING ---
  const runAnalysis = () => {
    // Validation Checks
    if (mat1 === 'Select Material...') {
      alert('Please select a material for Material 1 before running.');
      return;
    }
    if (analysisMode === 'Material Comparison') {
      if (mat2 === 'Select Material...') {
        alert('Please select a material for Material 2 to compare.');
        return;
      }
      if (mat1 === mat2) {
        alert('Please select two different materials for comparison.');
        return;
      }
    }

    setIsPlotted(true);
    const m1 = getMaterialParams(mat1);

    {
      
      // Calculate curves with dynamic voltage range
      const V_min = zoomForward ? -0.5 : -16.0;
      const V_max = zoomForward ? 1.5 : 4.0;

      const curves: Array<{
        V: number[];
        I: number[];
        color: string;
        name: string;
        params: ExtractedParams;
      }> = [];

      if (analysisMode === 'Single Material') {
        const { V, I } = computeIV(m1.I_s, m1.n, temperature, seriesRes, vbr, V_min, V_max);
        const params = extractParameters(V, I, temperature);
        curves.push({ V, I, color: m1.color, name: mat1, params });
      } else if (analysisMode === 'Material Comparison') {
        const m2 = getMaterialParams(mat2);
        
        // Curve 1
        const { V: V1, I: I1 } = computeIV(m1.I_s, m1.n, temperature, seriesRes, vbr, V_min, V_max);
        const params1 = extractParameters(V1, I1, temperature);
        curves.push({ V: V1, I: I1, color: m1.color, name: mat1, params: params1 });
        
        // Curve 2
        const { V: V2, I: I2 } = computeIV(m2.I_s, m2.n, temperature, seriesRes, vbr, V_min, V_max);
        const params2 = extractParameters(V2, I2, temperature);
        curves.push({ V: V2, I: I2, color: m2.color, name: mat2, params: params2 });
      } else { // Temperature Sweep
        const temps = [200, temperature, 500];
        const colors = ['#3b82f6', '#f59e0b', '#ef4444'];
        const labels = ['200 K (Cold)', `${temperature} K (Selected)`, '500 K (Hot)'];
        
        temps.forEach((t, idx) => {
          const { V, I } = computeIV(m1.I_s, m1.n, t, seriesRes, vbr, V_min, V_max);
          const params = extractParameters(V, I, t);
          curves.push({ V, I, color: colors[idx], name: labels[idx], params });
        });
      }

      // Generate merged Recharts dataset
      const pointsCount = curves[0].V.length;
      const combinedPoints: any[] = [];
      
      for (let i = 0; i < pointsCount; i++) {
        const rowData: any = { V: curves[0].V[i] };
        curves.forEach((c, cIdx) => {
          // Store both mA and Abs(A) depending on scale toggle
          rowData[`I_${cIdx}`] = c.I[i] * 1000; // in mA
          rowData[`absI_${cIdx}`] = Math.max(1e-15, Math.abs(c.I[i])); // in Amps
        });

        // Add CSV overlay points
        if (csvOverlay) {
          rowData['I_csv'] = csvOverlay.I[i] * 1000;
          rowData['absI_csv'] = Math.max(1e-15, Math.abs(csvOverlay.I[i]));
        }

        combinedPoints.push(rowData);
      }
      setChartData(combinedPoints);

      // Set Active curve metadata
      const active: any[] = curves.map((c, idx) => ({
        key: `I_${idx}`,
        absKey: `absI_${idx}`,
        name: c.name,
        color: theme === 'light' ? getCurveColor(c.name, c.color) : c.color,
        vOn: c.params.V_turn_on
      }));
      setActiveCurves(active);

      // Set thermal line markers
      if (showThermal) {
        const lines = curves.map(c => ({
          x: c.params.V_thermal,
          label: `VT (${c.name.split(' ')[0]})`
        }));
        setThermalLines(lines);
      } else {
        setThermalLines([]);
      }

      // Set Parameter Table Rows
      const rows = curves.map((c) => ({
        name: c.name,
        vOn: formatParam(c.params.V_turn_on, 'V'),
        n: formatParam(c.params.n_ideality, ''),
        I_sat: formatParam(c.params.I_sat, 'A'),
        bandgap: `${m1.bandgap} eV`,
        rs: `${seriesRes.toFixed(1)} \u03a9`,
        vbr: `${vbr.toFixed(1)} V`
      }));

      // Add CSV row if loaded
      if (csvOverlay) {
        rows.push({
          name: `CSV: ${csvOverlay.filename}`,
          vOn: formatParam(csvOverlay.params.V_turn_on, 'V'),
          n: formatParam(csvOverlay.params.n_ideality, ''),
          I_sat: formatParam(csvOverlay.params.I_sat, 'A'),
          bandgap: 'Unknown',
          rs: 'Unknown',
          vbr: 'Unknown'
        });
      }
      setTableRows(rows);
    }
  };

  // Trigger curve color recalibration if theme changes
  useEffect(() => {
    if (isPlotted) {
      runAnalysis();
    }
  }, [theme]);

  // Automatically refresh chart when visual options change
  useEffect(() => {
    if (isPlotted) {
      runAnalysis();
    }
  }, [showTurnOn, showThermal, isLogAxis, zoomForward]);

  // --- DYNAMIC GRAPH THEME COLORS ---
  const gridColor = theme === 'dark' ? '#282842' : '#e2e8f0';
  const labelColor = theme === 'dark' ? '#8a99ad' : '#64748b';

  // Helper to adjust curve colors inside getCurveColor
  const getCurveColor = (_label: string, color: string) => {
    if (theme === 'light') {
      if (color === '#4d9fff') return '#1d4ed8';
      if (color === '#ff5555') return '#dc2626';
      if (color === '#44dd88') return '#047857';
      if (color === '#ff9944') return '#c2410c';
      if (color === '#a855f7') return '#6d28d9';
    }
    return color;
  };
  // Snapping logic for mouse hover near ReferenceLines
  const handleChartMouseMove = (nextState: any) => {
    if (!nextState || !nextState.activeLabel) {
      setHoveredRefLine(null);
      return;
    }
    const vVal = parseFloat(nextState.activeLabel);
    let bestMatch: string | null = null;
    let minDiff = 0.08; // 0.08 V threshold
    
    if (showTurnOn) {
      activeCurves.forEach(c => {
        if (c.vOn !== null) {
          const diff = Math.abs(vVal - c.vOn);
          if (diff < minDiff) {
            minDiff = diff;
            bestMatch = `von_${c.key}`;
          }
        }
      });
    }
    if (showThermal) {
      thermalLines.forEach((l, lIdx) => {
        const diff = Math.abs(vVal - l.x);
        if (diff < minDiff) {
          minDiff = diff;
          bestMatch = `th_${lIdx}`;
        }
      });
    }
    
    setHoveredRefLine(bestMatch);
  };

  // --- DYNAMIC CHART TITLE ---
  const chartTitle = (() => {
    if (analysisMode === 'Single Material') return `Single Material \u2014 ${mat1}`;
    if (analysisMode === 'Material Comparison') return `Material Comparison \u2014 ${mat1} vs ${mat2}`;
    if (analysisMode === 'Temperature Analysis') return `Temperature Sweep \u2014 ${mat1}`;
    if (analysisMode === 'Wafer Map Simulation') return `Wafer Map Simulation \u2014 ${mat1}`;
    return 'IV Characteristic';
  })();

  return (
    <div className="app-container">
      {/* --- SIDEBAR --- */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="header-top">
            <h1 className="sidebar-title">IV Analyser</h1>
            <div className="theme-toggle-container">
              <Sun size={13} className={`theme-icon ${theme === 'light' ? 'active' : ''}`} />
              <label className="theme-toggle">
                <input 
                  type="checkbox" 
                  className="theme-checkbox" 
                  checked={theme === 'dark'}
                  onChange={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                />
                <span className="theme-track">
                  <span className="theme-thumb"></span>
                </span>
              </label>
              <Moon size={13} className={`theme-icon ${theme === 'dark' ? 'active' : ''}`} />
            </div>
          </div>
          <span className="sidebar-subtitle">
            Advanced Semiconductor<br />Characterisation Suite
          </span>
        </div>

        <div className="sidebar-body">
          {/* Section: Analysis Configuration */}
          <div>
            <h2 className="section-title">Analysis Mode</h2>
            <div className="form-group">
              <select 
                className="select-input"
                value={analysisMode}
                onChange={(e) => setAnalysisMode(e.target.value)}
              >
                <option value="Single Material">Single Material</option>
                <option value="Material Comparison">Material Comparison</option>
                <option value="Temperature Analysis">Temperature Sweep</option>

              </select>
            </div>
          </div>

          {/* Section: Materials */}
          <div>
            <h2 className="section-title">Material Selection</h2>
            <div className="form-group" style={{ gap: '10px' }}>
              <div className="form-group">
                <label className="form-label">Primary Semiconductor</label>
                <select 
                  className="select-input"
                  value={mat1}
                  onChange={(e) => setMat1(e.target.value)}
                >
                  {Object.keys(MATERIALS).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value="Custom...">Custom...</option>
                </select>
              </div>

              {analysisMode === 'Material Comparison' && (
                <div className="form-group">
                  <label className="form-label">Comparison Material</label>
                  <select 
                    className="select-input"
                    value={mat2}
                    onChange={(e) => setMat2(e.target.value)}
                  >
                    <option value="Select Material...">Select Material...</option>
                    {Object.keys(MATERIALS).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    <option value="Custom...">Custom...</option>
                  </select>
                </div>
              )}
            </div>

            {/* Custom parameters card */}
            {(mat1 === 'Custom...' || (analysisMode === 'Material Comparison' && mat2 === 'Custom...')) && (
              <div className="custom-params-card">
                <h3 className="card-title">Custom Material Params</h3>
                
                <div className="form-group">
                  <label className="form-label">
                    Sat. Current: <span className="value-badge">1.00e{customIsExp} A</span>
                  </label>
                  <input 
                    type="range" 
                    min="-30" max="-5" step="1"
                    className="slider-input"
                    value={customIsExp}
                    onChange={(e) => setCustomIsExp(parseInt(e.target.value))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Ideality Factor: <span className="value-badge">{customN.toFixed(2)}</span>
                  </label>
                  <input 
                    type="range" 
                    min="1.0" max="3.0" step="0.05"
                    className="slider-input"
                    value={customN}
                    onChange={(e) => setCustomN(parseFloat(e.target.value))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Bandgap: <span className="value-badge">{customEg.toFixed(2)} eV</span>
                  </label>
                  <input 
                    type="range" 
                    min="0.2" max="4.0" step="0.05"
                    className="slider-input"
                    value={customEg}
                    onChange={(e) => setCustomEg(parseFloat(e.target.value))}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section: Physical parameters */}
          <div>
            <h2 className="section-title">Physical Parameters</h2>
            <div className="form-group" style={{ gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">
                  Temperature 
                  <span className="value-badge">{temperature} K</span>
                </label>
                <input 
                  type="range" 
                  min="200" max="500" step="5"
                  className="slider-input"
                  value={temperature}
                  onChange={(e) => setTemperature(parseInt(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Series Resistance 
                  <span className="value-badge">{seriesRes.toFixed(1)} Ω</span>
                </label>
                <input 
                  type="range" 
                  min="0" max="100" step="1"
                  className="slider-input"
                  value={seriesRes}
                  onChange={(e) => setSeriesRes(parseFloat(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Breakdown Voltage 
                  <span className="value-badge">{vbr.toFixed(1)} V</span>
                </label>
                <input 
                  type="range" 
                  min="2" max="30" step="0.5"
                  className="slider-input"
                  value={vbr}
                  onChange={(e) => setVbr(parseFloat(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Section: Visual Options */}
          <div>
            <h2 className="section-title">Visual Options</h2>
            <div className="form-group">
              <div className="switch-group">
                <span className="switch-label" style={{ cursor: 'pointer' }} onClick={() => setShowTurnOn(!showTurnOn)}>
                  Show Turn-on Voltage
                </span>
                <label className="switch-control">
                  <input type="checkbox" checked={showTurnOn} onChange={(e) => setShowTurnOn(e.target.checked)} />
                  <span className="switch-slider"></span>
                </label>
              </div>

              <div className="switch-group">
                <span className="switch-label" style={{ cursor: 'pointer' }} onClick={() => setShowThermal(!showThermal)}>
                  Show Thermal Voltage
                </span>
                <label className="switch-control">
                  <input type="checkbox" checked={showThermal} onChange={(e) => setShowThermal(e.target.checked)} />
                  <span className="switch-slider"></span>
                </label>
              </div>

              <div className="switch-group">
                <span className="switch-label" style={{ cursor: 'pointer' }} onClick={() => setIsLogAxis(!isLogAxis)}>
                  Logarithmic Current
                </span>
                <label className="switch-control">
                  <input type="checkbox" checked={isLogAxis} onChange={(e) => setIsLogAxis(e.target.checked)} />
                  <span className="switch-slider"></span>
                </label>
              </div>

              <div className="switch-group">
                <span className="switch-label" style={{ cursor: 'pointer' }} onClick={() => setZoomForward(!zoomForward)}>
                  Zoom Forward Bias (-0.5V to 1.5V)
                </span>
                <label className="switch-control">
                  <input type="checkbox" checked={zoomForward} onChange={(e) => setZoomForward(e.target.checked)} />
                  <span className="switch-slider"></span>
                </label>
              </div>
            </div>
          </div>

          {/* Section: Experimental Overlay */}
          <div>
            <h2 className="section-title">Experimental CSV Overlay</h2>
            {csvOverlay ? (
              <div className="form-group">
                <div style={{ fontSize: '12px', fontStyle: 'italic', color: 'var(--success)', fontWeight: 'bold' }}>
                  Loaded: {csvOverlay.filename}
                </div>
                <button 
                  className="button-danger"
                  onClick={() => setCsvOverlay(null)}
                >
                  <Trash2 size={12} style={{ marginRight: '4px' }} /> Clear CSV
                </button>
              </div>
            ) : (
              <div className="form-group">
                <label className="button-secondary" style={{ cursor: 'pointer' }}>
                  <Upload size={14} /> Upload CSV
                  <input 
                    type="file" 
                    accept=".csv,.txt"
                    onChange={handleCsvUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <button className="button-primary" onClick={runAnalysis}>
            <Play size={14} fill="#ffffff" /> Run Analysis
          </button>
          <div className="app-version">
            IV Analyser Web Suite v3.0 | Malik Mohamed
          </div>
        </div>
      </aside>

      {/* --- MAIN DISPLAY --- */}
      <main className="main-display">
        <div className="panel-card tabs-container">
          <div className="tabs-header">
            <button className="tab-btn active">
              IV Characteristic
            </button>
          </div>

          <div className="tab-content">
            {!isPlotted ? (
              <div className="empty-state">
                <Info size={40} style={{ color: 'var(--accent)' }} />
                <div>
                  <strong>Engine Ready</strong>
                  <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
                    Configure the material simulation settings in the left panel and click "Run Analysis" to plot.
                  </p>
                </div>
              </div>
            ) : (
              <div data-chart-container="true" style={{ width: '100%', height: '100%', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <h3 style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--text-main)',
                textAlign: 'center',
                margin: '0 0 4px 0',
                letterSpacing: '-0.01em'
              }}>{chartTitle}</h3>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart 
                  data={chartData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  onMouseMove={handleChartMouseMove}
                  onMouseLeave={() => setHoveredRefLine(null)}
                >
                  <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="V" 
                    type="number"
                    domain={zoomForward ? [-0.5, 1.5] : [-16, 4]} 
                    tick={{ fill: labelColor, fontSize: 11 }}
                    label={{ value: 'Voltage (V)', position: 'bottom', fill: labelColor, fontSize: 12, offset: 5 }}
                  />
                  <YAxis 
                    type="number"
                    domain={isLogAxis ? [1e-15, 2] : [-20, 110]}
                    allowDataOverflow={true}
                    scale={isLogAxis ? 'log' : 'auto'}
                    tickFormatter={(tick) => isLogAxis ? tick.toExponential(0) : tick.toFixed(0)}
                    tick={{ fill: labelColor, fontSize: 11 }}
                    label={{ value: isLogAxis ? 'Current |I| (A)' : 'Current I (mA)', angle: -90, position: 'insideLeft', fill: labelColor, fontSize: 12 }}
                  />
                  <Tooltip 
                    content={(tooltipProps: any) => {
                      const { active, payload, label } = tooltipProps;
                      if (active && payload && payload.length) {
                        const vVal = parseFloat(label);
                        
                        // Find closest attached line for formatting
                        let attachedRef: any = null;
                        let minDiff = 0.08;
                        
                        if (showTurnOn) {
                          activeCurves.forEach(c => {
                            if (c.vOn !== null) {
                              const diff = Math.abs(vVal - c.vOn);
                              if (diff < minDiff) {
                                minDiff = diff;
                                attachedRef = { type: 'Turn-on Voltage', name: c.name, value: c.vOn, color: c.color };
                              }
                            }
                          });
                        }
                        if (showThermal && !attachedRef) {
                          thermalLines.forEach(l => {
                            const diff = Math.abs(vVal - l.x);
                            if (diff < minDiff) {
                              minDiff = diff;
                              attachedRef = { type: 'Thermal Voltage', name: l.label, value: l.x, color: '#ff8f00' };
                            }
                          });
                        }

                        return (
                          <div className="custom-chart-tooltip" style={{
                            backgroundColor: theme === 'dark' ? '#121224' : '#ffffff',
                            border: `1px solid ${attachedRef ? attachedRef.color : (theme === 'dark' ? '#282842' : '#cbd5e1')}`,
                            padding: '12px',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                          }}>
                            {attachedRef ? (
                              <div style={{
                                backgroundColor: attachedRef.type === 'Thermal Voltage' ? '#ffedd5' : '#fef3c7', // orange-100 or amber-100
                                color: attachedRef.type === 'Thermal Voltage' ? '#c2410c' : '#92400e', // orange-700 or amber-800
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: '700',
                                marginBottom: '8px',
                                textAlign: 'center',
                                border: `1px solid ${attachedRef.type === 'Thermal Voltage' ? '#fed7aa' : '#fde68a'}` // orange-200 or amber-200
                              }}>
                                📍 {attachedRef.type === 'Turn-on Voltage' ? `Turn-on Voltage ${attachedRef.name}:` : `Thermal Voltage ${attachedRef.name}:`} {attachedRef.value.toFixed(3)} V
                              </div>
                            ) : null}
                            
                            <div style={{ fontSize: '12px', fontWeight: '700', marginBottom: '4px', color: 'var(--text-main)' }}>
                              Voltage: {vVal.toFixed(3)} V
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              {payload.map((entry: any, index: number) => (
                                <div key={`tooltip_entry_${index}`} style={{ fontSize: '11.5px', color: entry.color, display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                                  <span>{entry.name}:</span>
                                  <span style={{ fontWeight: '600' }}>
                                    {isLogAxis ? `${entry.value.toExponential(2)} A` : `${entry.value.toFixed(3)} mA`}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    wrapperStyle={{ fontSize: '11px', color: 'var(--text-main)' }}
                    content={(legendProps: any) => {
                      const { payload } = legendProps;
                      // Build entries: curves + reference lines
                      const entries: Array<{ color: string; label: string; dashed?: boolean }> = [];
                      
                      // Standard curve entries from payload
                      if (payload) {
                        payload.forEach((entry: any) => {
                          entries.push({ color: entry.color, label: entry.value });
                        });
                      }
                      
                      // Turn-on voltage entries
                      if (showTurnOn) {
                        activeCurves.forEach(c => {
                          if (c.vOn !== null) {
                            entries.push({
                              color: c.color,
                              label: `Von ${c.name} (${c.vOn.toFixed(3)} V)`,
                              dashed: true
                            });
                          }
                        });
                      }
                      
                      // Thermal voltage entries
                      if (showThermal) {
                        thermalLines.forEach(l => {
                          entries.push({
                            color: '#ff8f00',
                            label: `${l.label} (${l.x.toFixed(4)} V)`,
                            dashed: true
                          });
                        });
                      }
                      
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', padding: '4px 0' }}>
                          {entries.map((e, i) => (
                            <div key={`legend_${i}`} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <svg width="16" height="10">
                                <line 
                                  x1="0" y1="5" x2="16" y2="5" 
                                  stroke={e.color} 
                                  strokeWidth={e.dashed ? 1.5 : 2}
                                  strokeDasharray={e.dashed ? '3 2' : undefined}
                                />
                                {!e.dashed && <circle cx="8" cy="5" r="2.5" fill={e.color} />}
                              </svg>
                              <span style={{ fontSize: '10.5px', color: 'var(--text-main)' }}>{e.label}</span>
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />
                  
                  {/* References Turn-on */}
                  {showTurnOn && activeCurves.map((c, idx) => c.vOn !== null && (
                    <ReferenceLine 
                      key={`ref_on_${c.key}`}
                      x={c.vOn} 
                      stroke={c.color} 
                      strokeWidth={hoveredRefLine === `von_${c.key}` ? 2.5 : 1.2}
                      strokeDasharray={hoveredRefLine === `von_${c.key}` ? undefined : '3 3'}
                      label={(props: any) => {
                        const { x, viewBox } = props;
                        if (x === undefined || viewBox === undefined) return null;
                        const yOffset = viewBox.y + 12 + (idx * 16);
                        return (
                          <g>
                            <rect 
                              x={x - 20} 
                              y={viewBox.y} 
                              width={40} 
                              height={viewBox.height} 
                              fill="transparent" 
                              style={{ cursor: 'pointer' }}
                              onMouseEnter={() => setHoveredRefLine(`von_${c.key}`)}
                              onMouseLeave={() => setHoveredRefLine(null)}
                            />
                            <text 
                              x={x} 
                              y={yOffset} 
                              fill={c.color} 
                              fontSize={10} 
                              fontWeight="bold" 
                              textAnchor="middle"
                              style={{ pointerEvents: 'none' }}
                            >
                              Von={c.vOn!.toFixed(3)}V
                            </text>
                            {hoveredRefLine === `von_${c.key}` && (
                              <g>
                                <rect 
                                  x={x - 100} 
                                  y={viewBox.y + viewBox.height / 2 - 14} 
                                  width={200} 
                                  height={28} 
                                  rx={6} 
                                  fill="#fef3c7"
                                  stroke={c.color} 
                                  strokeWidth={1.5}
                                />
                                <text 
                                  x={x} 
                                  y={viewBox.y + viewBox.height / 2 + 4} 
                                  fill="#92400e"
                                  fontSize={10} 
                                  fontWeight="bold" 
                                  textAnchor="middle"
                                >
                                  Turn-on Voltage {c.name}: {c.vOn!.toFixed(3)} V
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      }}
                    />
                  ))}

                  {/* References Thermal */}
                  {showThermal && thermalLines.map((l, lIdx) => (
                    <ReferenceLine 
                      key={`ref_th_${lIdx}`}
                      x={l.x} 
                      stroke="#ff8f00" 
                      strokeWidth={hoveredRefLine === `th_${lIdx}` ? 2.5 : 1.2}
                      strokeDasharray={hoveredRefLine === `th_${lIdx}` ? undefined : '2 2'}
                      label={(props: any) => {
                        const { x, viewBox } = props;
                        if (x === undefined || viewBox === undefined) return null;
                        const yOffset = viewBox.y + 12 + (lIdx * 16);
                        return (
                          <g>
                            <rect 
                              x={x - 20} 
                              y={viewBox.y} 
                              width={40} 
                              height={viewBox.height} 
                              fill="transparent" 
                              style={{ cursor: 'pointer' }}
                              onMouseEnter={() => setHoveredRefLine(`th_${lIdx}`)}
                              onMouseLeave={() => setHoveredRefLine(null)}
                            />
                            <text 
                              x={x} 
                              y={yOffset} 
                              fill="#ff8f00" 
                              fontSize={10} 
                              textAnchor="middle"
                              style={{ pointerEvents: 'none' }}
                            >
                              {l.label}={l.x.toFixed(3)}V
                            </text>
                            {hoveredRefLine === `th_${lIdx}` && (
                              <g>
                                <rect 
                                  x={x - 100} 
                                  y={viewBox.y + viewBox.height / 2 - 14} 
                                  width={200} 
                                  height={28} 
                                  rx={6} 
                                  fill="#ffedd5" // orange-100
                                  stroke="#fed7aa" // orange-200
                                  strokeWidth={1.5}
                                />
                                <text 
                                  x={x} 
                                  y={viewBox.y + viewBox.height / 2 + 4} 
                                  fill="#c2410c" // orange-700
                                  fontSize={10} 
                                  fontWeight="bold" 
                                  textAnchor="middle"
                                >
                                  Thermal Voltage {l.label}: {l.x.toFixed(3)} V
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      }}
                    />
                  ))}

                  {/* Draw Curves */}
                  {activeCurves.map(c => (
                    <Line 
                      key={c.key}
                      type="monotone"
                      dataKey={isLogAxis ? c.absKey : c.key}
                      name={c.name}
                      stroke={c.color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                  ))}

                  {/* Draw CSV Overlay */}
                  {csvOverlay && (
                    <Line 
                      type="monotone"
                      dataKey={isLogAxis ? 'absI_csv' : 'I_csv'}
                      name={`Exp: ${csvOverlay.filename}`}
                      stroke="#4f46e5"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* --- DYNAMIC COLLAPSIBLE PARAMETERS TABLE --- */}
        {isPlotted && tableRows.length > 0 && (
          <div className="results-card">
            <div className="results-header">
              <h2 className="results-title">Extracted Device Parameters</h2>
              <div className="results-actions">
                <button className="btn-pill-small" onClick={() => exportCSV(tableRows as TableRow[], analysisMode)}>
                  📊 Export CSV
                </button>
                <button className="btn-pill-small" onClick={() => savePlotImage('[data-chart-container]')}>
                  💾 Save Plot Image
                </button>
                <button className="btn-pill-small" onClick={() => {
                  const mats = analysisMode === 'Material Comparison' ? [mat1, mat2] : [mat1];
                  exportPDF('[data-chart-container]', tableRows as TableRow[], analysisMode, mats, temperature, seriesRes, vbr);
                }}>
                  <FileText size={12} /> Export PDF
                </button>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="param-table">
                <thead>
                  <tr>
                    <th>Material/Condition</th>
                    <th>Turn-on Voltage</th>
                    <th>Ideality Factor</th>
                    <th>Sat. Current</th>
                    <th>Bandgap</th>
                    <th>Series Res.</th>
                    <th>Breakdown Vbr</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, idx) => (
                    <tr key={`row_${idx}`}>
                      <td style={{ fontWeight: '600' }}>{row.name}</td>
                      <td>{row.vOn}</td>
                      <td>{row.n}</td>
                      <td>{row.I_sat}</td>
                      <td>{row.bandgap}</td>
                      <td>{row.rs}</td>
                      <td>{row.vbr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
