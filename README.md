# Semiconductor IV Curve Analyser (Web Application)

A premium, interactive web-based characterisation suite for simulating, visualising, and extracting parameters from semiconductor IV (current-voltage) characteristics. Built to mirror real-world compound semiconductor characterisation techniques used in industry.

This application has been modernized from a desktop application into a state-of-the-art React, TypeScript, and Vite web app, featuring a sleek modern design, dynamic charts with Recharts, interactive wafer maps, and responsive user controls.

---

## Project Structure

```
IV Curve Analyser/
├── src/
│   ├── physics.ts        # Physics engine — diode equations & parameter extraction
│   ├── App.tsx           # Main web application dashboard layout and controls
│   ├── index.css         # Premium CSS stylesheet with custom styling tokens
│   ├── main.tsx          # React application entry point
│   └── App.css           # Additional layout styles
├── public/               # Public assets
├── index.html            # Main HTML wrapper (with SEO optimization)
├── package.json          # Node dependencies & npm scripts
└── README.md             # This file
```

---

## Physics Background

The physics model is based on the **Shockley Diode Equation** with parasitics and breakdown:

$$I = I_s \cdot \left(\exp\left(\frac{V - I R_s}{n V_T}\right) - 1\right)$$

Where:
- $I_s$ — Saturation current (A) — leakage current at zero bias
- $n$ — Ideality factor — how close to a perfect diode (1 = ideal, 2 = recombination dominated)
- $V_T$ — Thermal voltage $= kT/q \approx 25.9\text{ mV}$ at room temperature ($300\text{ K}$)
- $R_s$ — Series parasitic resistance ($\Omega$) which flattens the forward current curve at high biases
- $V_{br}$ — Reverse breakdown voltage ($V$) causing sharp avalanche conduction at high reverse biases

### Parameter Extraction
The app performs **log-linear fitting** over the low-current forward bias region ($1\text{ nA}$ to $1\text{ mA}$) to extract:
1. **Turn-on Voltage ($V_{on}$)**: Voltage at which $I$ exceeds $1\text{ mA}$.
2. **Ideality Factor ($n$)**: Calculated from the slope of $\log(I)$ vs $V$.
3. **Saturation Current ($I_s$)**: Recovered from the y-intercept of the $\log(I)$ vs $V$ fit.

---

## Material Database

| Material | Symbol | Bandgap | Ideality Factor | Saturation Current | Application |
|---|---|---|---|---|---|
| Silicon | Si | 1.12 eV | 1.0 | $1 \times 10^{-10}\text{ A}$ | General purpose baseline |
| Gallium Arsenide | GaAs | 1.42 eV | 1.3 | $1 \times 10^{-12}\text{ A}$ | RF chips, photonics, solar |
| Gallium Nitride | GaN | 3.40 eV | 2.0 | $1 \times 10^{-30}\text{ A}$ | High power, high temperature |
| Indium Phosphide | InP | 1.35 eV | 1.2 | $1 \times 10^{-11}\text{ A}$ | High frequency, fibre optic lasers |

---

## Web App Features

- **Four Interactive Modes**:
  - **Single Material**: Simulates and plots the chosen material's IV curve.
  - **Material Comparison**: Overlays two materials on the same axis.
  - **Temperature Sweep**: Visualises a material at $200\text{ K}$ (Cold), selected temp, and $500\text{ K}$ (Hot).
  - **Wafer Map Simulation**: Simulates spatial device parameter variation (radial degradation gradients + random noise) across a circular wafer grid of dies.
- **Interactive Wafer Map**: Click any individual die on the wafer grid to plot its unique IV curve and inspect its localized electrical parameters.
- **Experimental Data Overlay**: Upload raw CSV measurements containing Voltage/Current columns to overlay laboratory data against simulations.
- **Visual Controls**: Real-time sliders for temperature ($200\text{ K}$ to $500\text{ K}$), series resistance ($0$ to $100\ \Omega$), and breakdown voltage.
- **Logarithmic Scale Switch**: Toggle logarithmic current axis to view low-bias leakage and breakdown characteristics.
- **Dynamic Extracted Parameters Table**: Interactive table presenting $V_{on}$, ideality, $I_{sat}$, bandgap, $R_s$, and $V_{br}$ for each curve.
- **Premium Aesthetics**: Fully responsive dual-theme (Dark/Light) UI built with high-end Outfit typography, smooth animations, and tailored HSL color tokens.

---

## How to Run Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the local development server:
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to `http://localhost:5173/`.

4. Build the application for production:
   ```bash
   npm run build
   ```

---

## Author

**Malik Mohamed**
MEng Electrical & Electronic Engineering — Swansea University

GitHub: [github.com/mmalikmo07](https://github.com/mmalikmo07)
LinkedIn: [linkedin.com/in/malik-mohamed-eng/](https://www.linkedin.com/in/malik-mohamed-eng/)
