import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import worker,{verifiedOwner} from '../worker/index.js';
const env={ACCESS_TEAM_DOMAIN:'https://test-team.cloudflareaccess.com',ACCESS_AUD:'ledger-audience',OWNER_EMAIL:'owner@test.invalid'};
const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await webcrypto.subtle.exportKey('jwk',pair.publicKey),kid:'test-key'};
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{assert.equal(url,env.ACCESS_TEAM_DOMAIN+'/cdn-cgi/access/certs');return Response.json({keys:[jwk]})};
const base=()=>({iss:env.ACCESS_TEAM_DOMAIN,aud:[env.ACCESS_AUD],sub:'subject-1',email:env.OWNER_EMAIL,exp:Math.floor(Date.now()/1000)+300});
async function token(claims,algorithm='RS256'){
 const head=Buffer.from(JSON.stringify({alg:algorithm,kid:'test-key'})).toString('base64url'),body=Buffer.from(JSON.stringify(claims)).toString('base64url');
 const signature=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(head+'.'+body));
 return head+'.'+body+'.'+Buffer.from(signature).toString('base64url');
}
const request=t=>new Request('https://ledger.test/api/ledger',{headers:{'Cf-Access-Jwt-Assertion':t}});
test('Access authentication and API isolation',async()=>{
 try{
  assert.equal((await verifiedOwner(new Request('https://ledger.test'),{})).status,503);
  assert.equal((await verifiedOwner(new Request('https://ledger.test',{headers:{'oai-authenticated-user-id':'forged'}}),env)).status,401);
  const valid=await token(base());assert.equal((await verifiedOwner(request(valid),env)).user,'owner');
  for(const change of [{exp:1},{aud:['wrong']},{iss:'https://other.cloudflareaccess.com'},{nbf:Math.floor(Date.now()/1000)+1000},{sub:''}])assert.equal((await verifiedOwner(request(await token({...base(),...change})),env)).status,401);
  assert.equal((await verifiedOwner(request(await token({...base(),email:'other@test.invalid'})),env)).status,403);
  assert.equal((await verifiedOwner(request(await token(base(),'none')),env)).status,401);
  const pieces=valid.split('.');pieces[1]=Buffer.from(JSON.stringify({...base(),email:'other@test.invalid'})).toString('base64url');assert.equal((await verifiedOwner(request(pieces.join('.')),env)).status,401);
  let reads=0;const DB={prepare(sql){assert(sql.includes('SELECT'));return {bind(user){assert.equal(user,'owner');return {async first(){reads++;return null}}}}}};
  const unauth=await worker.fetch(new Request('https://ledger.test/api/ledger'),{...env,DB});assert.equal(unauth.status,401);assert.equal(reads,0);
  const accepted=await worker.fetch(request(valid),{...env,DB});assert.equal(accepted.status,200);assert.deepEqual(await accepted.json(),{version:0,data:null});assert.equal(reads,1);
  const crossOrigin=new Request('https://ledger.test/api/ledger',{method:'PUT',headers:{'Cf-Access-Jwt-Assertion':valid,'Content-Type':'application/json',Origin:'https://bad.test'},body:'{}'});assert.equal((await worker.fetch(crossOrigin,{...env,DB})).status,403);
 }finally{globalThis.fetch=originalFetch;}
});
