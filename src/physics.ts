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

export const T_NOM = 300; // Reference temperature (K) at which material I_s values are specified

/**
 * Temperature-scaled saturation current (SPICE diode model, XTI = 3):
 *
 *   I_s(T) = I_s(T_nom) · (T/T_nom)^(XTI/n) · exp( (q·E_g / (n·k)) · (1/T_nom − 1/T) )
 *
 * I_s rises steeply with temperature, which is why a real silicon diode's
 * forward voltage falls by roughly 2 mV/K at constant current.
 */
export function saturationCurrentAtT(
  I_s_nom: number,
  E_g: number,
  n: number,
  T: number,
  XTI = 3,
  T_nom = T_NOM
): number {
  const exponent = ((q * E_g) / (n * k)) * (1 / T_nom - 1 / T);
  return I_s_nom * Math.pow(T / T_nom, XTI / n) * Math.exp(exponent);
}

/**
 * Solve for the junction voltage V_d of a diode with series resistance R_s:
 *
 *   V_ext = V_d + R_s · I_s · (exp(V_d / V_0) − 1),   with V_0 = n·V_T
 *
 * The left-hand side is strictly increasing in V_d, so the root is unique and
 * bracketed by [0, V_ext]. Newton's method is used for speed, with a bisection
 * fallback whenever a Newton step leaves the bracket, so it always converges.
 */
export function solveDiodeVD(V_ext: number, I_s: number, R_s: number, V_0: number): number {
  if (R_s <= 0 || I_s <= 0 || V_ext <= 0) return V_ext;

  const f = (vd: number) => vd + R_s * I_s * Math.expm1(vd / V_0) - V_ext;
  const df = (vd: number) => 1 + ((R_s * I_s) / V_0) * Math.exp(vd / V_0);

  let lo = 0;
  let hi = V_ext;
  // Initial guess: the smaller of the "no R_s" and "all current limited by R_s" estimates
  let vd = Math.min(V_ext, V_0 * Math.log1p(V_ext / (R_s * I_s)));

  for (let i = 0; i < 100; i++) {
    const fv = f(vd);
    if (Math.abs(fv) < 1e-12) break;
    if (fv > 0) hi = vd; else lo = vd;

    let next = vd - fv / df(vd);
    if (!(next > lo && next < hi)) next = 0.5 * (lo + hi); // keep inside the bracket
    if (Math.abs(next - vd) < 1e-15) { vd = next; break; }
    vd = next;
  }

  return vd;
}

export function computeIV(
  I_s: number,
  n: number,
  T: number,
  R_s = 0,
  V_br = 15.0,
  V_min = -15.0,
  V_max = 4.0,
  n_points = 1500
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

  // Ideality factor and saturation current, fitted over the low-current forward
  // region (1 nA to 1 mA) where series-resistance flattening is negligible.
  //
  // Step 1: the classic log-linear fit, ln(I) = ln(I_s) + V/(n·V_T). This
  // assumes exp(V/nV_T) − 1 ≈ exp(V/nV_T), which fails when I_s is large
  // (low-bandgap materials, or any material when hot): the "−1" bends ln(I)
  // near V = 0 and biases the fit (≈5% error in n and ≈35% in I_s for Ge at
  // 300 K, worse at high temperature).
  //
  // Step 2: refine against the full Shockley form without that approximation,
  // alternating two closed-form least-squares updates until they converge:
  //   n   from ln(I/I_s + 1) = V/(n·V_T)            (line through the origin)
  //   I_s from ln(I_s) = mean[ ln(I / expm1(V/(n·V_T))) ]
  const xs: number[] = [];
  const Is_: number[] = [];
  for (let i = 0; i < V.length; i++) {
    if (V[i] > 0 && I[i] > 1e-9 && I[i] < 1e-3) {
      xs.push(V[i]);
      Is_.push(I[i]);
    }
  }

  if (xs.length >= 6) {
    const N = xs.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < N; i++) {
      const y = Math.log(Is_[i]);
      sumX += xs[i]; sumY += y; sumXY += xs[i] * y; sumXX += xs[i] * xs[i];
    }
    const slope = (N * sumXY - sumX * sumY) / (N * sumXX - sumX * sumX);
    let n = 1 / (slope * V_T); // slope = 1 / (n · V_T)
    let I_sat = Math.exp((sumY - slope * sumX) / N);

    for (let iter = 0; iter < 200; iter++) {
      let sVY = 0, sVV = 0;
      for (let i = 0; i < N; i++) {
        sVY += xs[i] * Math.log1p(Is_[i] / I_sat);
        sVV += xs[i] * xs[i];
      }
      const nNew = sVV / (sVY * V_T);

      let sLog = 0;
      for (let i = 0; i < N; i++) sLog += Math.log(Is_[i] / Math.expm1(xs[i] / (nNew * V_T)));
      const IsNew = Math.exp(sLog / N);

      const converged = Math.abs(nNew / n - 1) < 1e-10 && Math.abs(IsNew / I_sat - 1) < 1e-9;
      n = nNew;
      I_sat = IsNew;
      if (converged) break;
    }

    if (Number.isFinite(n) && Number.isFinite(I_sat) && n > 0) {
      results.n_ideality = n;
      results.I_sat = I_sat;
    }
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
  const I_s_base = saturationCurrentAtT(mat.I_s, mat.bandgap, mat.n, T);
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
