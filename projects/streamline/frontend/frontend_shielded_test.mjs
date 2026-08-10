import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";
import fs from "fs";
const log=(m)=>console.log(new Date().toISOString().slice(11,19),m);
log("start"); const p=await buildPoseidon(); const F=p.F; log("poseidon ready");
const H=(a,b)=>F.toObject(p([a,b])); const H3=(a,b,c)=>F.toObject(p([a,b,c]));
const DEPTH=20; const zeros=[0n]; for(let i=1;i<=DEPTH;i++) zeros[i]=H(zeros[i-1],zeros[i-1]);
const sk=12345n,rho_in=67890n,value_in=1000n; const pk_in=H(sk,0n),cm=H3(value_in,pk_in,rho_in);
const pe=[],pi=[]; let cur=cm; for(let i=0;i<DEPTH;i++){pe.push(zeros[i].toString());pi.push("0");cur=H(cur,zeros[i]);}
const root=cur;
const input={value_in:value_in.toString(),sk:sk.toString(),rho_in:rho_in.toString(),pathElements:pe,pathIndices:pi,v1:"700",pk1:H(11n,0n).toString(),rho1:"101",v2:"300",pk2:pk_in.toString(),rho2:"102"};
log("witness start");
const wc = await import("/Users/swarnimraj/StreamLine/circuits/build/shielded/shielded_js/witness_calculator.cjs").catch(()=>null);
// use snarkjs wtns.calculate for timing
await snarkjs.wtns.calculate(input, "/Users/swarnimraj/StreamLine/circuits/build/shielded/shielded_js/shielded.wasm", "/tmp/shielded.wtns");
log("witness done");
const {proof,publicSignals}=await snarkjs.groth16.prove("/Users/swarnimraj/StreamLine/circuits/build/shielded/shielded.zkey","/tmp/shielded.wtns");
log("prove done");
const vk=JSON.parse(fs.readFileSync("/Users/swarnimraj/StreamLine/circuits/build/shielded/shielded.vkey.json"));
log("verify="+await snarkjs.groth16.verify(vk,publicSignals,proof));
log("rootMatch="+(publicSignals[0]===root.toString()));
fs.writeFileSync("/tmp/shielded_out.json",JSON.stringify({cm:cm.toString(),root:root.toString(),zeros:zeros.map(String),nf:publicSignals[1],cm1:publicSignals[2],cm2:publicSignals[3]}));
log("done");
