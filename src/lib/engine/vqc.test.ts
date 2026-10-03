import { describe, expect, it } from "vitest";
import {
  expectationZ0,
  expectationZZ,
  runCircuit,
  vqcReadout,
  VQC_WEIGHTS,
} from "./vqc";
import { ADVISOR_MAX_ADJUSTMENT } from "./constants";

/** Sum of probabilities must be one for a well-formed statevector. */
function norm(state: ReturnType<typeof runCircuit>): number {
  return state.reduce((sum, amplitude) => sum + amplitude[0] ** 2 + amplitude[1] ** 2, 0);
}

describe("statevector simulation", () => {
  it("applies the frozen rotations even when both features are zero", () => {
    // The circuit carries frozen weight rotations after the feature rotations, so
    // a zero feature pair is not the |00> state. What must hold is normalisation.
    const state = runCircuit(0, 0);
    expect(state[0][0]).toBeLessThan(1);
    expect(norm(state)).toBeCloseTo(1, 12);
  });

  it("produces an identical statevector on repeated evaluation", () => {
    expect(runCircuit(0.31, 0.72)).toEqual(runCircuit(0.31, 0.72));
  });

  it("preserves total probability for every input", () => {
    for (let a = 0; a <= 1.0001; a += 0.1) {
      for (let b = 0; b <= 1.0001; b += 0.1) {
        expect(norm(runCircuit(a, b))).toBeCloseTo(1, 10);
      }
    }
  });

  it("keeps every expectation inside its physical bounds", () => {
    for (let a = 0; a <= 1.0001; a += 0.05) {
      for (let b = 0; b <= 1.0001; b += 0.05) {
        expect(Math.abs(expectationZ0(runCircuit(a, b)))).toBeLessThanOrEqual(1 + 1e-9);
        expect(Math.abs(expectationZZ(runCircuit(a, b)))).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("clamps out-of-range and non-finite features", () => {
    expect(norm(runCircuit(-5, 9))).toBeCloseTo(1, 10);
    expect(norm(runCircuit(Number.NaN, Number.POSITIVE_INFINITY))).toBeCloseTo(1, 10);
    expect(runCircuit(2, 2)).toEqual(runCircuit(1, 1));
    expect(runCircuit(-1, 0)).toEqual(runCircuit(0, 0));
  });

  it("entangles the qubits, so Z alone cannot describe the state", () => {
    // (|01> + |10>)/sqrt(2) has <Z0> = 0 but <Z0Z1> = -1. The circuit reaches a
    // genuinely correlated state for at least some inputs.
    const correlated = Array.from({ length: 21 }, (_, i) => {
      const a = i / 20;
      const state = runCircuit(a, 1 - a);
      return Math.abs(expectationZZ(state)) > Math.abs(expectationZ0(state)) + 1e-6;
    });
    expect(correlated.some(Boolean)).toBe(true);
  });
});

describe("vqcReadout", () => {
  it("is deterministic across repeated calls", () => {
    const first = vqcReadout(0.3, 0.7);
    const second = vqcReadout(0.3, 0.7);
    expect(second).toEqual(first);
  });

  it("bounds the score adjustment to the published maximum", () => {
    for (let a = 0; a <= 1.0001; a += 0.02) {
      for (let b = 0; b <= 1.0001; b += 0.02) {
        const readout = vqcReadout(a, b);
        expect(Math.abs(readout.adjustment)).toBeLessThanOrEqual(ADVISOR_MAX_ADJUSTMENT + 1e-9);
        expect(Math.abs(readout.squashed)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("reproduces the linear combination from the published weights", () => {
    const readout = vqcReadout(0.42, 0.61);
    const expected =
      VQC_WEIGHTS.z * readout.expectationZ + VQC_WEIGHTS.zz * readout.expectationZZ + VQC_WEIGHTS.bias;
    expect(readout.rawSignal).toBeCloseTo(expected, 12);
    expect(readout.squashed).toBeCloseTo(Math.tanh(expected), 12);
    expect(readout.adjustment).toBeCloseTo(ADVISOR_MAX_ADJUSTMENT * Math.tanh(expected), 12);
  });

  it("separates the Shor-broken corner from the quantum-viable corner", () => {
    // feature1 is quantum weakness: 1 means Shor-broken.
    const broken = vqcReadout(1, 0);
    const viable = vqcReadout(0, 0);
    expect(broken.expectationZ).toBeLessThan(viable.expectationZ);
  });

  it("changes continuously, with no jump discontinuities", () => {
    let previous = vqcReadout(0, 0).expectationZ;
    for (let step = 1; step <= 100; step += 1) {
      const current = vqcReadout(step / 100, 0.5).expectationZ;
      expect(Math.abs(current - previous)).toBeLessThan(0.2);
      previous = current;
    }
  });
});