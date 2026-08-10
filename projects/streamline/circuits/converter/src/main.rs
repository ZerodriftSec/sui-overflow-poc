//! snarkjs (BN254 Groth16) → Sui `sui::groth16` byte format.
//!
//! Reads `verification_key.json`, `proof.json`, `public.json` from a build dir
//! (arg 1, default `../build`) and prints hex for:
//!   - vk_bytes      → groth16::prepare_verifying_key(&bn254(), &vk_bytes)
//!   - proof_bytes   → groth16::proof_points_from_bytes(proof_bytes)
//!   - inputs_bytes  → groth16::public_proof_inputs_from_bytes(inputs_bytes)

use std::str::FromStr;

use ark_bn254::{Bn254, Fq, Fq2, Fr, G1Affine, G2Affine};
use ark_groth16::{Proof, VerifyingKey};
use ark_serialize::CanonicalSerialize;
use serde_json::Value;

/// snarkjs stores Fq2 as [c0, c1]; arkworks Fq2::new(c0, c1) = c0 + c1·u — same
/// ordering, so no swap (unlike the EVM precompile). Flip if verification fails.
const SWAP_FQ2: bool = false;

fn fq(s: &Value) -> Fq {
    Fq::from_str(s.as_str().expect("fq string")).expect("parse fq")
}

fn fr(s: &Value) -> Fr {
    Fr::from_str(s.as_str().expect("fr string")).expect("parse fr")
}

/// G1 point from snarkjs [x, y, z(=1)].
fn g1(v: &Value) -> G1Affine {
    G1Affine::new(fq(&v[0]), fq(&v[1]))
}

/// G2 point from snarkjs [[x0,x1],[y0,y1],[z0,z1]].
fn g2(v: &Value) -> G2Affine {
    let (x0, x1) = (fq(&v[0][0]), fq(&v[0][1]));
    let (y0, y1) = (fq(&v[1][0]), fq(&v[1][1]));
    let (x, y) = if SWAP_FQ2 {
        (Fq2::new(x1, x0), Fq2::new(y1, y0))
    } else {
        (Fq2::new(x0, x1), Fq2::new(y0, y1))
    };
    G2Affine::new(x, y)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn read(dir: &str, name: &str) -> Value {
    let path = format!("{dir}/{name}");
    let raw = std::fs::read_to_string(&path).unwrap_or_else(|_| panic!("read {path}"));
    serde_json::from_str(&raw).unwrap_or_else(|_| panic!("parse {path}"))
}

fn main() {
    let dir = std::env::args().nth(1).unwrap_or_else(|| "../build".to_string());

    let vk_json = read(&dir, "verification_key.json");
    let proof_json = read(&dir, "proof.json");
    let public_json = read(&dir, "public.json");

    // --- Verifying key (full, for prepare_verifying_key) ---
    let ic: Vec<G1Affine> = vk_json["IC"].as_array().unwrap().iter().map(g1).collect();
    let vk = VerifyingKey::<Bn254> {
        alpha_g1: g1(&vk_json["vk_alpha_1"]),
        beta_g2: g2(&vk_json["vk_beta_2"]),
        gamma_g2: g2(&vk_json["vk_gamma_2"]),
        delta_g2: g2(&vk_json["vk_delta_2"]),
        gamma_abc_g1: ic,
    };
    let mut vk_bytes = Vec::new();
    vk.serialize_compressed(&mut vk_bytes).unwrap();

    // --- Proof ---
    let proof = Proof::<Bn254> {
        a: g1(&proof_json["pi_a"]),
        b: g2(&proof_json["pi_b"]),
        c: g1(&proof_json["pi_c"]),
    };
    let mut proof_bytes = Vec::new();
    proof.serialize_compressed(&mut proof_bytes).unwrap();

    // --- Public inputs (each Fr, 32-byte LE, concatenated) ---
    let mut inputs_bytes = Vec::new();
    for s in public_json.as_array().unwrap() {
        fr(s).serialize_compressed(&mut inputs_bytes).unwrap();
    }

    eprintln!(
        "vk={}B proof={}B inputs={}B ({} signals)",
        vk_bytes.len(),
        proof_bytes.len(),
        inputs_bytes.len(),
        public_json.as_array().unwrap().len()
    );
    println!("VK_BYTES={}", hex(&vk_bytes));
    println!("PROOF_BYTES={}", hex(&proof_bytes));
    println!("INPUTS_BYTES={}", hex(&inputs_bytes));
}
