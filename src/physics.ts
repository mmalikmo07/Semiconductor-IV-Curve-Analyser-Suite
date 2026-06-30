// -----------------------------------------------
// Physical Constants
// -----------------------------------------------
export const q = 1.602e-19;   // Electron charge (C)
export const k = 1.381e-23;   // Boltzmann constant (J/K)

// -----------------------------------------------
// Material Database
// -----------------------------------------------
export interface MaterialParams {
  I_s: number;
  n: number;
  color: string;
  bandgap: number;
  V_br: number;
  description: string;
}

export const MATERIALS: Record<string, MaterialParams> = {
  'Silicon (Si)': {
    I_s:       1e-14,
    n:         1.0,
    color:     '#3b82f6', // Premium blue
    bandgap:   1.12,
    V_br:      15.0,
    description: 'Standard semiconductor — baseline reference (Von ~0.65V)'
  },
  'Germanium (Ge)': {
    I_s:       1e-8,
    n:         1.0,
    color:     '#06b6d4', // Teal/Cyan
    bandgap:   0.67,
    V_br:      10.0,
    description: 'Low bandgap material — low turn-on voltage (Von ~0.3V), higher leakage'
  },
  'Gallium Arsenide (GaAs)': {
    I_s:       1e-20,
    n:         1.3,
    color:     '#ef4444', // Premium red
    bandgap:   1.42,
    V_br:      20.0,
    description: 'III-V compound — high electron mobility (Von ~1.3V)'
  },
  'Gallium Nitride (GaN)': {
    I_s:       1e-30,
    n:         2.0,
    color:     '#10b981', // Premium green
    bandgap:   3.40,
    V_br:      100.0,
    description: 'Wide bandgap — high power, high temperature applications (Von ~3.5V)'
  },
  'Indium Phosphide (InP)': {
    I_s:       1e-15,
    n:         1.2,
    color:     '#f97316', // Premium orange
    bandgap:   1.35,
    V_br:      25.0,
    description: 'III-V compound — high frequency (Von ~0.86V)'
  },
};

// -----------------------------------------------
// Seedable Random Number Generator (LCG)
// -----------------------------------------------
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  // Returns pseudo-random number in [0, 1)
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  // Box-Muller transform for Gaussian distribution (mean=0, std=1)
  nextGaussian(): number {
    const u1 = Math.max(1e-15, this.next());
    const u2 = this.next();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }
}

// -----------------------------------------------
// Core Physics Calculations
// -----------------------------------------------
export function thermalVoltage(T: number): number {
  return (k * T) / q;
}

export function solveDiodeVD(V_ext: number, I_s: number, R_s: number, V_0: number): number {
  const y = R_s * I_s;
  if (y <= 0) return V_ext;

  // Starting guess
  let V_d_m = V_0 * Math.log(Math.max(1e-15, V_ext / y));
  V_d_m = Math.max(0.0, Math.min(V_ext, V_d_m));

  // 8 iterations converge robustly
  for (let i = 0; i < 8; i++) {
    const numerator = Math.max(1e-15, V_ext - V_d_m + y);
    V_d_m = V_0 * Math.log(numerator / y);
    V_d_m = Math.max(0.0, Math.min(V_ext, V_d_m));
  }

  return V_d_m;
}

export function computeIV(
  I_s: number,
  n: number,
  T: number,
  R_s = 0,
  V_br = 15.0,
  V_min = -15.0,
  V_max = 4.0,
  n_points = 500
): { V: number[]; I: number[] } {
  const V_T = thermalVoltage(T);
  const V: number[] = [];
  const I: number[] = [];

  const step = (V_max - V_min) / (n_points - 1);
  for (let i = 0; i < n_points; i++) {
    const v = V_min + i * step;
    V.push(v);

    let current = 0;

    // 1. Forward bias contribution
    if (v > 0.01) {
      let v_d = v;
      if (R_s > 0) {
        v_d = solveDiodeVD(v, I_s, R_s, n * V_T);
      }
      current = I_s * (Math.exp(Math.min(500, v_d / (n * V_T))) - 1);
    } else {
      current = I_s * (Math.exp(Math.max(-500, v / (n * V_T))) - 1);
    }

    // 2. Reverse breakdown contribution
    if (v < -V_br) {
      let rev_current = 0;
      if (R_s > 0) {
        const V_ext_rev = -(v + V_br);
        const v_d_rev_m = solveDiodeVD(V_ext_rev, I_s, R_s, 0.05); // 0.05V slope
        const v_d_rev = -v_d_rev_m - V_br;
        rev_current = -I_s * (Math.exp(Math.min(500, -(v_d_rev + V_br) / 0.05)) - 1);
      } else {
        rev_current = -I_s * (Math.exp(Math.min(500, -(v + V_br) / 0.05)) - 1);
      }
      current += rev_current;
    }

    // Clamp current to +/- 2.0 A compliance range to prevent numerical overflow & SVG render failure
    current = Math.max(-2.0, Math.min(2.0, current));
    I.push(current);
  }

  return { V, I };
}

// -----------------------------------------------
// Parameter Extraction from IV Data
// -----------------------------------------------
export interface ExtractedParams {
  V_turn_on: number | null;
  n_ideality: number | null;
  I_sat: number | null;
  V_thermal: number;
}

export function extractParameters(V: number[], I: number[], T: number): ExtractedParams {
  const V_T = thermalVoltage(T);
  const results: ExtractedParams = {
    V_turn_on: null,
    n_ideality: null,
    I_sat: null,
    V_thermal: V_T,
  };

  // Turn-on voltage — where forward current exceeds 1mA (0.001 A)
  for (let i = 0; i < V.length; i++) {
    if (I[i] > 1e-3) {
      results.V_turn_on = V[i];
      break;
    }
  }

  // Ideality factor and saturation current from log-linear fit:
  // We fit in low-current region (1nA to 1mA) to avoid series resistance flattening
  const xVals: number[] = [];
  const yVals: number[] = [];
  for (let i = 0; i < V.length; i++) {
    if (V[i] > 0 && I[i] > 1e-9 && I[i] < 1e-3) {
      xVals.push(V[i]);
      yVals.push(Math.log(I[i]));
    }
  }

  if (xVals.length > 5) {
    const N = xVals.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < N; i++) {
      sumX += xVals[i];
      sumY += yVals[i];
      sumXY += xVals[i] * yVals[i];
      sumXX += xVals[i] * xVals[i];
    }

    const slope = (N * sumXY - sumX * sumY) / (N * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / N;

    // slope = 1 / (n * V_T) => n = 1 / (slope * V_T)
    results.n_ideality = 1 / (slope * V_T);
    results.I_sat = Math.exp(intercept);
  }

  return results;
}

// -----------------------------------------------
// Wafer Map Generation
// -----------------------------------------------
export interface DieData {
  x: number;
  y: number;
  r: number;
  n_sim: number;
  Is_sim: number;
  Rs_sim: number;
  Vbr_sim: number;
  V: number[];
  I: number[];
  params: ExtractedParams;
}

export function generateWaferData(
  materialName: string,
  T: number,
  R_s: number,
  V_br: number,
  gridSize = 11
): { dies: DieData[]; waferRadius: number } {
  const mat = MATERIALS[materialName] || MATERIALS['Silicon (Si)'];
  const I_s_base = mat.I_s;
  const n_base = mat.n;
  const waferRadius = 5.2;

  const xRange: number[] = [];
  const yRange: number[] = [];
  const startCoord = -5;
  const endCoord = 5;
  const step = (endCoord - startCoord) / (gridSize - 1);

  for (let i = 0; i < gridSize; i++) {
    xRange.push(startCoord + i * step);
    yRange.push(startCoord + i * step);
  }

  const rng = new SeededRandom(42); // Match Python seed
  const dies: DieData[] = [];

  for (const x of xRange) {
    for (const y of yRange) {
      const r = Math.sqrt(x * x + y * y);
      if (r <= waferRadius) {
        const normR = r / waferRadius;

        // Radial gradients + Gaussian variance
        let n_var = n_base * (1.0 + 0.15 * normR * normR + 0.04 * rng.nextGaussian());
        n_var = Math.max(0.9, Math.min(3.0, n_var));

        const leakageFactor = Math.pow(10, 2.0 * normR * normR + 0.2 * rng.nextGaussian());
        const I_s_var = I_s_base * leakageFactor;

        let R_s_var = R_s > 0 ? R_s * (1.0 + 0.4 * normR * normR + 0.1 * rng.nextGaussian()) : 0.0;
        R_s_var = Math.max(0.0, R_s_var);

        let V_br_var = V_br * (1.0 - 0.15 * normR * normR + 0.03 * rng.nextGaussian());
        V_br_var = Math.max(2.0, V_br_var);

        const { V: V_die, I: I_die } = computeIV(I_s_var, n_var, T, R_s_var, V_br_var);
        const params = extractParameters(V_die, I_die, T);

        dies.push({
          x,
          y,
          r,
          n_sim: n_var,
          Is_sim: I_s_var,
          Rs_sim: R_s_var,
          Vbr_sim: V_br_var,
          V: V_die,
          I: I_die,
          params
        });
      }
    }
  }

  return { dies, waferRadius };
}

// -----------------------------------------------
// Parameter Formatting
// -----------------------------------------------
export function formatParam(value: number | null, unit: string, decimals = 4): string {
  if (value === null || value === undefined) return 'N/A';
  if (unit.includes('e') || Math.abs(value) < 1e-3) {
    return `${value.toExponential(2)} ${unit}`;
  }
  return `${value.toFixed(decimals)} ${unit}`;
}
