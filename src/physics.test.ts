import { describe, expect, it } from 'vitest';
import {
  MATERIALS,
  computeIV,
  extractParameters,
  saturationCurrentAtT,
  solveDiodeVD,
  thermalVoltage,
} from './physics';

const materials = Object.entries(MATERIALS);

describe('series-resistance solver', () => {
  it('satisfies KVL (V = V_d + I·R_s) across a wide parameter sweep', () => {
    let worst = 0;
    for (const R_s of [0.01, 0.1, 1, 10, 100]) {
      for (const n of [1, 1.5, 2]) {
        for (const I_s of [1e-30, 1e-20, 1e-14, 1e-8]) {
          const V0 = n * thermalVoltage(300);
          for (let v = 0.02; v <= 5; v += 0.01) {
            const vd = solveDiodeVD(v, I_s, R_s, V0);
            const I = I_s * Math.expm1(vd / V0);
            worst = Math.max(worst, Math.abs(vd + I * R_s - v));
          }
        }
      }
    }
    expect(worst).toBeLessThan(1e-9); // volts
  });
});

describe('parameter extraction (R_s = 0)', () => {
  for (const [name, m] of materials) {
    it(`recovers n and I_s for ${name} at 300 K`, () => {
      const { V, I } = computeIV(m.I_s, m.n, 300, 0, m.V_br, -1, 5, 2000);
      const p = extractParameters(V, I, 300);
      expect(Math.abs(p.n_ideality! / m.n - 1)).toBeLessThan(1e-3);
      expect(Math.abs(p.I_sat! / m.I_s - 1)).toBeLessThan(1e-2);
    });
  }
});

describe('parameter extraction across temperature (in-app voltage grid)', () => {
  // Hot or low-bandgap diodes have large I_s, so the whole 1 nA–1 mA window sits
  // where the Shockley "−1" term matters. A plain ln(I)-vs-V fit gets n wrong by
  // up to ~20% here (Si at 500 K); the refined fit must not.
  for (const [name, m] of materials) {
    it(`recovers n and I_s for ${name} from 200 K to 400 K`, () => {
      for (const T of [200, 300, 400]) {
        const I_s = saturationCurrentAtT(m.I_s, m.bandgap, m.n, T);
        const { V, I } = computeIV(I_s, m.n, T, 0, m.V_br, -16, 4);
        const p = extractParameters(V, I, T);
        expect(Math.abs(p.n_ideality! / m.n - 1)).toBeLessThan(1e-4);
        expect(Math.abs(p.I_sat! / I_s - 1)).toBeLessThan(1e-3);
      }
    });
  }

  it('stays within 1% on n with 1% Gaussian measurement noise', () => {
    let seed = 12345;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-15, rand()))) * Math.cos(2 * Math.PI * rand());
    for (const [, m] of materials) {
      for (let trial = 0; trial < 20; trial++) {
        const { V, I } = computeIV(m.I_s, m.n, 300, 0, m.V_br, -16, 4);
        const noisy = I.map((i) => i * (1 + 0.01 * gauss()));
        const p = extractParameters(V, noisy, 300);
        expect(Math.abs(p.n_ideality! / m.n - 1)).toBeLessThan(0.01);
      }
    }
  });
});

describe('parameter extraction with series resistance', () => {
  it('stays within 2% on n for Si with R_s = 10 Ω (I·R_s at the 1 mA window edge biases n by ~1.4%)', () => {
    const m = MATERIALS['Silicon (Si)'];
    const { V, I } = computeIV(m.I_s, m.n, 300, 10, m.V_br, -1, 2, 2000);
    const p = extractParameters(V, I, 300);
    expect(Math.abs(p.n_ideality! / m.n - 1)).toBeLessThan(0.02);
  });
});

describe('temperature dependence', () => {
  it('I_s(T_nom) is unchanged', () => {
    expect(saturationCurrentAtT(1e-14, 1.12, 1, 300)).toBeCloseTo(1e-14, 25);
  });

  it('Si forward voltage at 1 mA falls by ~2 mV/K (textbook −1.5 to −2.5 mV/K)', () => {
    const m = MATERIALS['Silicon (Si)'];
    const vAt1mA = (T: number) => {
      const I_s = saturationCurrentAtT(m.I_s, m.bandgap, m.n, T);
      return m.n * thermalVoltage(T) * Math.log1p(1e-3 / I_s);
    };
    const tc = (vAt1mA(350) - vAt1mA(250)) / 100; // V/K
    expect(tc * 1000).toBeLessThan(-1.5);
    expect(tc * 1000).toBeGreaterThan(-2.5);
  });

  it('turn-on voltage decreases monotonically with temperature for every material', () => {
    for (const [, m] of materials) {
      const vOn = [250, 300, 350].map((T) => {
        const { V, I } = computeIV(saturationCurrentAtT(m.I_s, m.bandgap, m.n, T), m.n, T, 0, m.V_br, -1, 5, 3000);
        return extractParameters(V, I, T).V_turn_on!;
      });
      expect(vOn[1]).toBeLessThan(vOn[0]);
      expect(vOn[2]).toBeLessThan(vOn[1]);
    }
  });
});
