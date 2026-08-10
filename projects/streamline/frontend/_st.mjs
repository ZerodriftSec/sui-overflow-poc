import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";
import fs from "fs";
const p = await buildPoseidon(); const F = p.F;
const H = (a,b)=>F.toObject(p([a,b])); const H3=(a,b,c)=>F.toObject(p([a,b,c]));
const DEPTH=20;
const zeros=[0n]; for(let i=1;i<=DEPTH;i++) zeros[i]=H(zeros[i-1],zeros[i-1]);
const sk=12345n, rho_in=67890n, value_in=1000n;
const pk_in=H(sk,0n), cm=H3(value_in,pk_in,rho_in);
const pathElements=[], pathIndices=[]; let cur=cm;
for(let i=0;i<DEPTH;i++){pathElements.push(zeros[i].toString());pathIndices.push("0");cur=H(cur,zeros[i]);}
const root=cur;
const input={value_in:value_in.toString(),sk:sk.toString(),rho_in:rho_in.toString(),pathElements,pathIndices,
  v1:"700",pk1:H(11n,0n).toString(),rho1:"101",v2:"300",pk2:pk_in.toString(),rho2:"102"};
const t=Date.now();
const {proof,publicSignals}=await snarkjs.groth16.fullProve(input,"/Users/swarnimraj/StreamLine/circuits/build/shielded/shielded_js/shielded.wasm","/Users/swarnimraj/StreamLine/circuits/build/shielded/shielded.zkey");
const vk=JSON.parse(fs.readFileSync("/Users/swarnimraj/StreamLine/circuits/build/shielded/shielded.vkey.json"));
console.log("verifies:",await snarkjs.groth16.verify(vk,publicSignals,proof),"in",((Date.now()-t)/1000).toFixed(1)+"s");
console.log("proven root == computed root:",publicSignals[0]===root.toString());
console.log("ROOT="+root.toString()); console.log("ZERO1="+zeros[1].toString());
fs.writeFileSync("/tmp/shielded_pub.json",JSON.stringify(publicSignals));
