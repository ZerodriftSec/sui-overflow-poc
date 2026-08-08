import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";
import fs from "fs";
const p=await buildPoseidon(); const F=p.F;
const H=(a,b)=>F.toObject(p([a,b])); const H3=(a,b,c)=>F.toObject(p([a,b,c]));
const DEPTH=20; const zeros=[0n]; for(let i=1;i<=DEPTH;i++) zeros[i]=H(zeros[i-1],zeros[i-1]);
const sk=12345n,rho_in=67890n,value_in=1000n; const pk_in=H(sk,0n),cm=H3(value_in,pk_in,rho_in);
const pe=[],pi=[]; let cur=cm; for(let i=0;i<DEPTH;i++){pe.push(zeros[i].toString());pi.push("0");cur=H(cur,zeros[i]);}
const input={value_in:value_in.toString(),sk:sk.toString(),rho_in:rho_in.toString(),pathElements:pe,pathIndices:pi,v1:"700",pk1:H(11n,0n).toString(),rho1:"101",v2:"300",pk2:pk_in.toString(),rho2:"102"};
const dir="/Users/swarnimraj/StreamLine/circuits/build/shielded";
await snarkjs.wtns.calculate(input, dir+"/shielded_js/shielded.wasm", "/tmp/sh.wtns");
const {proof,publicSignals}=await snarkjs.groth16.prove(dir+"/shielded.zkey","/tmp/sh.wtns");
console.log("verify:", await snarkjs.groth16.verify(JSON.parse(fs.readFileSync(dir+"/shielded.vkey.json")), publicSignals, proof));
fs.writeFileSync(dir+"/proof.json",JSON.stringify(proof));
fs.writeFileSync(dir+"/public.json",JSON.stringify(publicSignals));
fs.copyFileSync(dir+"/shielded.vkey.json", dir+"/verification_key.json");
console.log("DONE");
