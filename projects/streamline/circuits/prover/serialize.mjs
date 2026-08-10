// Pure-JS serializer: snarkjs Groth16 (BN254) artifacts → the arkworks-compressed
// byte format sui::groth16 expects. No Rust, no deps — runs in the browser, so
// the witness (hidden amounts/blindings) never leaves the user's device.
//
// Format (arkworks CanonicalSerialize, compressed):
//   G1  = LE(x) [32B], with flag bits in the top of byte 31
//   G2  = LE(x.c0)‖LE(x.c1) [64B], flag bits in the top of byte 63
//   flags: bit7 = y is the "larger" root (y > p−y); bit6 = point at infinity
//   VK  = alpha(G1)‖beta(G2)‖gamma(G2)‖delta(G2)‖u64LE(len(IC))‖IC[](G1)
//   proof = a(G1)‖b(G2)‖c(G1)
//   public = each Fr as LE [32B]

const P =
  21888242871839275222246405745257275088696311157297823662689037894645226208583n;

function leBytes(x) {
  let v = ((x % P) + P) % P;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** True if y is the lexicographically larger of {y, -y}: i.e. y > p − y. */
function yIsLarger(y) {
  const yy = ((y % P) + P) % P;
  const neg = (P - yy) % P;
  return yy > neg;
}

function g1(point) {
  const x = BigInt(point[0]);
  const y = BigInt(point[1]);
  const b = leBytes(x);
  if (yIsLarger(y)) b[31] |= 0x80;
  return b;
}

function g2(point) {
  // snarkjs Fq2 = [c0, c1]; arkworks Fq2::new(c0, c1). x = point[0], y = point[1].
  const x0 = BigInt(point[0][0]);
  const x1 = BigInt(point[0][1]);
  const y0 = BigInt(point[1][0]);
  const y1 = BigInt(point[1][1]);
  const out = new Uint8Array(64);
  out.set(leBytes(x0), 0);
  out.set(leBytes(x1), 32);
  // Sign of a quadratic-extension element: by the high coefficient c1, then c0.
  const negY0 = (P - ((y0 % P) + P) % P) % P;
  const negY1 = (P - ((y1 % P) + P) % P) % P;
  const larger = y1 === negY1 ? y0 > negY0 : y1 > negY1;
  if (larger) out[63] |= 0x80;
  return out;
}

function concat(arrays) {
  const len = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function u64le(n) {
  const out = new Uint8Array(8);
  let v = BigInt(n);
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

export function hex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Full verifying key bytes for groth16::prepare_verifying_key. */
export function vkToBytes(vk) {
  const ic = vk.IC.map(g1);
  return concat([
    g1(vk.vk_alpha_1),
    g2(vk.vk_beta_2),
    g2(vk.vk_gamma_2),
    g2(vk.vk_delta_2),
    u64le(ic.length),
    ...ic,
  ]);
}

/** Proof points bytes for groth16::proof_points_from_bytes. */
export function proofToBytes(proof) {
  return concat([g1(proof.pi_a), g2(proof.pi_b), g1(proof.pi_c)]);
}

/** Public inputs bytes for groth16::public_proof_inputs_from_bytes. */
export function publicToBytes(publicSignals) {
  return concat(publicSignals.map((s) => leBytes(BigInt(s))));
}
