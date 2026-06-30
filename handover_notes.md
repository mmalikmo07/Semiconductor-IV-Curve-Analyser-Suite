# Project Handover Notes: Semiconductor IV Curve Analyser

This document provides a comprehensive handover of the **Semiconductor IV Curve Analyser** project. It details the purpose of the project, file architecture, data types, current features, physical constants, and interactive modes.

---

## 🎯 Project Purpose
The **Semiconductor IV Curve Analyser** is an interactive web-based simulator designed to study, characterize, and export diode current-voltage (IV) characteristics. It serves as an academic and diagnostic tool to understand real-world semiconductor parameters (such as turn-on voltage, ideality factor, series resistance, and reverse breakdown voltage) using physical diode equations.

---

## 🛠️ Technology Stack & Languages
- **Framework**: React 19 + TypeScript + Vite 8
- **Styling**: Vanilla CSS (modern HSL token system in `src/index.css` supporting light/dark themes)
- **Visualizations**: Recharts 3 (interactive canvas graphing)
- **Icons**: Lucide React
- **Dependencies**: `html2canvas` and `jspdf` for visual and document exporting.

---

## 📂 File Structure & Responsibilities

```
IV Curve Analyser/
├── src/
│   ├── main.tsx          # React application mounting entry point (TypeScript React)
│   ├── App.tsx           # Monolithic UI view, state management, chart setups, and sidebar controls (TypeScript React)
│   ├── physics.ts        # Shockley diode solver, database, parameter extraction, math utilities (TypeScript)
│   ├── exports.ts        # Exporters for CSV spreadsheets, high-res PNG plots, and academic PDF reports (TypeScript)
│   ├── index.css         # Styling system (custom design tokens, Outfit typography, layout systems, theme toggles) (CSS)
│   └── App.css           # Unused layout classes (CSS)
├── public/               # Static public assets
├── index.html            # Main HTML page with custom SEO metadata and viewport adjustments
├── tsconfig.json         # TypeScript compiler configurations
└── package.json          # Node project dependencies, scripts, and details
```

---

## 📊 Core Simulation Modes
The application supports three interactive analysis modes (the obsolete Wafer Map Simulation has been removed):

1. **Single Material Mode**: Simulates and plots the forward/reverse bias IV curves of a single selected material at a specified temperature ($T$), series resistance ($R_s$), and breakdown voltage ($V_{br}$).
2. **Material Comparison Mode**: Directly overlays the IV curves of two distinct selected materials (or a custom material) on the same graph to compare thresholds.
3. **Temperature Sweep Mode**: Automatically sweeps the selected material at three distinct temperatures ($200\text{ K}$, user-selected $T$, and $500\text{ K}$) to visualize temperature-dependent behavior.

---

## 🧪 Physics Engine & Semiconductor Database (`src/physics.ts`)

Calculations are based on the **Shockley Diode Equation** incorporating series resistance parasitics ($R_s$) and reverse avalanche breakdown ($V_{br}$).

### 1. Calibrated Physical Database
Material parameters are calibrated to produce textbook-accurate turn-on voltages ($V_{on}$):
- **Germanium (Ge)**: $I_s = 1\times10^{-8}\text{ A}$, $n = 1.0 \Rightarrow V_{on} \approx 0.30\text{ V}$
- **Silicon (Si)**: $I_s = 1\times10^{-14}\text{ A}$, $n = 1.0 \Rightarrow V_{on} \approx 0.65\text{ V}$
- **Indium Phosphide (InP)**: $I_s = 1\times10^{-15}\text{ A}$, $n = 1.2 \Rightarrow V_{on} \approx 0.86\text{ V}$
- **Gallium Arsenide (GaAs)**: $I_s = 1\times10^{-20}\text{ A}$, $n = 1.3 \Rightarrow V_{on} \approx 1.30\text{ V}$
- **Gallium Nitride (GaN)**: $I_s = 1\times10^{-30}\text{ A}$, $n = 2.0 \Rightarrow V_{on} \approx 3.50\text{ V}$
- **Custom Material**: Users can customize saturation current ($I_s$), ideality factor ($n$), and bandgap ($E_g$) via sliders.

### 2. Numerical Solvers & Parameter Extraction
- **`solveDiodeVD`**: Uses a robust iterative log-based numerical solver (8 steps) to solve the transcendental diode voltage equation under series resistance:
  $$V_{ext} - V_d = I_s R_s \left( e^{\frac{V_d}{n V_T}} - 1 \right)$$
- **`computeIV`**: Calculates compliance-clamped current values ($\pm 2.0\text{ A}$ limit) across $500$ sweep points to prevent floating-point exponential overflow.
- **`extractParameters`**: Estimates diode properties from curves:
  - **Turn-on Voltage ($V_{on}$)**: Intercept voltage where $I \ge 1\text{ mA}$.
  - **Ideality ($n$) & Saturation Current ($I_sat$)**: Extracted using a logarithmic least-squares linear fit on the subthreshold region ($1\text{ nA}$ to $1\text{ mA}$).

---

## 🎨 Interactive & Visual Features

- **iOS-Style Animated Theme Toggle**: A custom sliding switch in the sidebar header with Sun (light) and Moon (dark) icons to transition between dark and light modes.
- **Dynamic Chart Title**: Automatically changes based on active mode (e.g. `"Material Comparison — Silicon (Si) vs Germanium (Ge)"`).
- **Autosnapping Hover Markers**: When the cursor gets within a capture tolerance of `0.08 V` of $V_{on}$ or $V_T$:
  - The dotted reference line shifts to a thick solid line.
  - A beige badge (for $V_{on}$) or orange badge (for $V_T$) pops up over the line.
  - The chart tooltip snaps and shows a highlighted header badge.
- **Custom Legend**: Automatically includes standard curve entries plus dashed reference line indicators for toggled settings.
- **Logarithmic Current**: Toggles the graph Y-axis to a logarithmic scale.
- **Zoom Forward Bias**: Narrows the graph X-axis to `[-0.5, 1.5] V` for forward-bias inspection.
- **Experimental CSV Overlay**: Allows drag-and-drop or file upload of external CSV datasets for side-by-side verification.

---

## 💾 Export Capabilities (`src/exports.ts`)

1. **Export CSV**: Downloads a clean CSV spreadsheet containing all extracted parameters from the table.
2. **Save Plot Image**: Captures the current chart container at a high-res **3× scaling factor** and exports it as a PNG (complete with dynamic title, gridlines, custom legend, and snapped reference lines).
3. **Export PDF**: Generates a professional academic white A4 portrait document featuring:
   - Centered high-res plot image with a border.
   - Structured key-value metadata block (without broken special characters or line-spacing issues).
   - Structured data table displaying the extracted parameters, sanitizing symbols (e.g. representing $\Omega$ as `Ohm`).
   - Clean footer containing the application version and date.
   - White-theme enforcement: If a user is on dark mode, the exporter overrides text and SVG components to dark colorings to ensure legibility on the white PDF background.
