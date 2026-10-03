/**
 * A two-qubit variational quantum classifier, evaluated by exact statevector
 * simulation.
 *
 * Why exact rather than sampled: a shot-based circuit is non-deterministic, and
 * the engine, the REST endpoint and the MCP tool must all return byte-identical
 * results for identical input. Exact simulation removes sampling noise entirely,
 * so the circuit is a deterministic, reproducible function of the features —
 * while remaining a real quantum circuit rather than a classical stand-in.
 *
 * Circuit (q0 = control, q1 = target), in order:
 *   1. RY(theta1) on q0        theta1 = PI * feature1
 *   2. RY(theta2) on q1        theta2 = PI * feature2
 *   3. CNOT q0 -> q1
 *   4. RZ(phi1) on q0          phi1 is a frozen published weight
 *   5. CNOT q1 -> q0
 *   6. RY(phi2) on q1          phi2 is a frozen published bias
 *
 * Readout: <Z0> and <Z0 Z1>. Signal = wZ*<Z0> + wZZ*<Z0Z1> + bias, squashed by
 * tanh into -1..1 and scaled to at most ADVISOR_MAX_ADJUSTMENT points.
 */

import { ADVISOR_MAX_ADJUSTMENT } from "./constants";

/** Frozen, published classifier weights. Changing them is a version bump. */
export const VQC_WEIGHTS = {
  z: 0.62,
  zz: 0.41,
  bias: -0.08,
  /** Rotation angles, radians. */
  phi1: 0.9,
  phi2: -0.55,
} as const;

export const VQC_CIRCUITS = "2 qubits, 5 gates (RY, RY, CNOT, RZ, CNOT), 2 measured observables";
export const VQC_DESCRIPTION =
  "A 2-qubit variational circuit scoring a key against the Shor-broken / quantum-viable boundary. Simulated by exact statevector arithmetic, so there is no shot noise and the same inputs always yield the same signal.";

type Complex = readonly [number, number];

const add = (a: Complex, b: Complex): Complex => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Complex, b: Complex): Complex => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0],
];
/** Multiply a complex amplitude by a real scalar. */
const scale1 = (a: Complex, k: number): Complex => [a[0] * k, a[1] * k];

/** exp(i * theta). */
function expI(theta: number): Complex {
  return [Math.cos(theta), Math.sin(theta)];
}

/** Statevector in the basis |q1 q0> = |00>,|01>,|10>,|11>. */
type State = readonly [Complex, Complex, Complex, Complex];

const ZERO: State = [
  [1, 0],
  [0, 0],
  [0, 0],
  [0, 0],
];

/** Single-qubit RY on q0 (the low bit of the |q1 q0> basis). */
function ryOnQ0(state: State, theta: number): State {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  const [a, b, d, e] = state;
  return [
    add(scale1(a, c), scale1(b, -s)),
    add(scale1(a, s), scale1(b, c)),
    add(scale1(d, c), scale1(e, -s)),
    add(scale1(d, s), scale1(e, c)),
  ];
}

/** Single-qubit RY on q1 (the high bit of the |q1 q0> basis). */
function ryOnQ1(state: State, theta: number): State {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  const [a, b, d, e] = state;
  return [
    add(scale1(a, c), scale1(d, -s)),
    add(scale1(b, c), scale1(e, -s)),
    add(scale1(a, s), scale1(d, c)),
    add(scale1(b, s), scale1(e, c)),
  ];
}

/** RZ(phi) on q0: the q0=0 arm takes e^{-i*phi/2}, the q0=1 arm e^{+i*phi/2}. */
function rzOnQ0(state: State, phi: number): State {
  const half = expI(phi / 2);
  const minus: Complex = [half[0], -half[1]];
  const [a, b, d, e] = state;
  return [mul(a, minus), mul(b, half), mul(d, minus), mul(e, half)];
}

function cnotQ0ToQ1(state: State): State {
  const [a, b, d, e] = state;
  // |q1 q0>: control q0 is the low bit, so 10<->11 swap.
  return [a, b, e, d];
}

function cnotQ1ToQ0(state: State): State {
  const [a, b, d, e] = state;
  // Control q1 is the high bit, so 01<->11 swap.
  return [a, e, d, b];
}

/** <Z0>, the expectation of the Pauli-Z operator on q0. */
export function expectationZ0(state: State): number {
  const [a, b, d, e] = state;
  const p00 = a[0] ** 2 + a[1] ** 2;
  const p01 = b[0] ** 2 + b[1] ** 2;
  const p10 = d[0] ** 2 + d[1] ** 2;
  const p11 = e[0] ** 2 + e[1] ** 2;
  return p00 + p01 - p10 - p11;
}

/** <Z0 Z1>, the correlation of the two qubits. */
export function expectationZZ(state: State): number {
  const [a, b, d, e] = state;
  const p00 = a[0] ** 2 + a[1] ** 2;
  const p01 = b[0] ** 2 + b[1] ** 2;
  const p10 = d[0] ** 2 + d[1] ** 2;
  const p11 = e[0] ** 2 + e[1] ** 2;
  return p00 - p01 - p10 + p11;
}

/** Run the frozen circuit for two features in 0..1. Pure and deterministic. */
export function runCircuit(feature1: number, feature2: number): State {
  const clamp = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  const theta1 = Math.PI * clamp(feature1);
  const theta2 = Math.PI * clamp(feature2);

  let state: State = ZERO;
  state = ryOnQ0(state, theta1);
  state = ryOnQ1(state, theta2);
  state = cnotQ0ToQ1(state);
  state = rzOnQ0(state, VQC_WEIGHTS.phi1);
  state = cnotQ1ToQ0(state);
  state = ryOnQ1(state, VQC_WEIGHTS.phi2);
  return state;
}

export interface VqcReadout {
  expectationZ: number;
  expectationZZ: number;
  /** Linear combination before squashing. */
  rawSignal: number;
  /** tanh of the raw signal, bounded to -1..1. */
  squashed: number;
  /** Points the advisor adds to the harvest score. */
  adjustment: number;
}

export function vqcReadout(feature1: number, feature2: number): VqcReadout {
  const state = runCircuit(feature1, feature2);
  const readoutZ = expectationZ0(state);
  const readoutZZ = expectationZZ(state);
  const rawSignal = VQC_WEIGHTS.z * readoutZ + VQC_WEIGHTS.zz * readoutZZ + VQC_WEIGHTS.bias;
  const squashed = Math.tanh(rawSignal);
  return {
    expectationZ: readoutZ,
    expectationZZ: readoutZZ,
    rawSignal,
    squashed,
    adjustment: ADVISOR_MAX_ADJUSTMENT * squashed,
  };
}