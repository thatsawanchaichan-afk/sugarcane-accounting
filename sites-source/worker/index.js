// Cloudflare Access JWT verification; no trust in client-supplied identity headers.
const accessKeys = new Map();
function decodeJwtPart(part){
 const raw=atob(part.replace(/-/g,'+').replace(/_/g,'/'));
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
export async function verifiedOwner(request,env){
 const team=String(env.ACCESS_TEAM_DOMAIN||'').trim().replace(/\/$/,'');
 const audience=String(env.ACCESS_AUD||'').trim();
 const owner=String(env.OWNER_EMAIL||'').trim().toLowerCase();
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)||!audience||!owner||owner.includes('example.com'))return {status:503,error:'ตั้งค่า Cloudflare Access และอีเมลเจ้าของก่อนใช้งาน'};
 const token=request.headers.get('Cf-Access-Jwt-Assertion');
 if(!token||token.length>32768)return {status:401,error:'กรุณาเข้าสู่ระบบผ่าน Cloudflare Access'};
 let stage='token';
 try{
  const parts=token.split('.');if(parts.length!==3)throw Error('token');
  const header=JSON.parse(new TextDecoder().decode(decodeJwtPart(parts[0])));
  if(header.alg!=='RS256'||typeof header.kid!=='string')throw Error('algorithm');
  stage='keys_fetch';
  let cached=accessKeys.get(team);
  if(!cached||cached.until<Date.now()||!cached.keys.some(k=>k.kid===header.kid)){
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),15000);
   let body;
   try{
    const response=await fetch(team+'/cdn-cgi/access/certs',{redirect:'error',signal:controller.signal});
    stage='keys_http_'+response.status;
    if(!response.ok)throw Error('keys');
    stage='keys_json';body=await response.json();
   }finally{clearTimeout(timer);}
   stage='keys_format';if(!Array.isArray(body.keys))throw Error('keys');
   cached={keys:body.keys,until:Date.now()+300000};accessKeys.set(team,cached);
  }
  stage='key_match';
  const jwk=cached.keys.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)throw Error('key');
  stage='key_import';
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  stage='signature';
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodeJwtPart(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error('signature');
  const claims=JSON.parse(new TextDecoder().decode(decodeJwtPart(parts[1]))),now=Math.floor(Date.now()/1000);
  stage='issuer';if(claims.iss!==team)throw Error('issuer');
  stage='audience';if(!Array.isArray(claims.aud)||!claims.aud.includes(audience))throw Error('audience');
  stage='expiry';if(!Number.isFinite(claims.exp)||claims.exp<=now)throw Error('expiry');
  stage='not_before';if(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>now+30))throw Error('not_before');
  stage='subject';if(typeof claims.sub!=='string'||!claims.sub)throw Error('subject');
  if(typeof claims.email!=='string'||claims.email.trim().toLowerCase()!==owner)return {status:403,error:'บัญชีนี้ไม่มีสิทธิ์ใช้งาน'};
  // This application is owner-only. Stable ID keeps the ledger independent of IdP changes.
  return {user:'owner'};
 }catch{return {status:401,error:'Access verification failed',code:'ACCESS_'+stage.toUpperCase()};}
}
function fiscalYearOf(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return '';
 const [year,month,day]=date.split('-').map(Number),check=new Date(Date.UTC(year,month-1,day));
 if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)return '';
 return String(year+543-(month<10?1:0));
}
function migrateFiscal(data){
 if(data.fiscalVersion===1)return false;
 for(const key of ['ledger','work','quota','household'])for(const row of data[key]||[]){
  row.originalSeason??=row.season??'';
  const year=fiscalYearOf(row.date);row.season=year;row.fiscalNeedsReview=!year;
 }
 data.previousSeasonLocks??=structuredClone(data.closed||{});
 data.closed={};data.fiscalVersion=1;return true;
}
const respond = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
const keys = ['plots', 'ledger', 'work', 'quota', 'debts', 'assets', 'rates'];
async function loadLedger(db, user) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await db.prepare('SELECT version, payload FROM ledger_state WHERE user_id = ?').bind(user).first();
    if (!row) return respond({ version: 0, data: null });
    const data = JSON.parse(row.payload);
    let changed=migrateFiscal(data);
    if(!changed)return respond({version:row.version,data});
    const update = await db.prepare('UPDATE ledger_state SET payload = ?, version = version + 1 WHERE user_id = ? AND version = ?')
      .bind(JSON.stringify(data), user, row.version).run();
    if (update.meta.changes === 1) return respond({ version: row.version + 1, data });
  }
  return respond({ error: 'Ledger is being updated' }, 409);
}
export default {
  async fetch(request, env) {
    const identity=await verifiedOwner(request,env);
    if(!identity.user)return respond({error:identity.error,...(identity.code?{code:identity.code}:{})},identity.status);
    const user=identity.user;
    const url = new URL(request.url);
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(APP_HTML, { headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      } });
    }
    if (url.pathname !== '/api/ledger') return respond({ error: 'Not found' }, 404);
    try {
      if (request.method === 'GET') {
        return await loadLedger(env.DB, user);
      }
      if (request.method !== 'PUT') return respond({ error: 'Method not allowed' }, 405);
      if (request.headers.get('Origin') !== url.origin || !request.headers.get('Content-Type')?.startsWith('application/json')) {
        return respond({ error: 'Invalid origin or content type' }, 403);
      }
      const body = await request.text();
      if (body.length > 1_000_000) return respond({ error: 'Data exceeds the current size limit' }, 413);
      let input;
      try { input = JSON.parse(body); } catch { return respond({ error: 'Invalid JSON' }, 400); }
      const { version, data } = input ?? {};
      if (!Number.isSafeInteger(version) || version < 0 || !data || !data.closed || Array.isArray(data.closed)
          || typeof data.closed !== 'object' || ![...keys, ...(data.household === undefined ? [] : ['household']), ...(data.quotaOwners === undefined ? [] : ['quotaOwners'])].every(key => Array.isArray(data[key]) && data[key].every(row => row && typeof row.id === 'string'))) {
        return respond({ error: 'Invalid ledger' }, 400);
      }
      if (data.menuSettings !== undefined && (!data.menuSettings || Array.isArray(data.menuSettings) || typeof data.menuSettings !== 'object' || !['cane','household'].every(scope => Array.isArray(data.menuSettings[scope]) && data.menuSettings[scope].every(item => item && typeof item.id === 'string' && typeof item.name === 'string' && ['feature','folder','page'].includes(item.type))))) return respond({ error: 'Invalid menu settings' }, 400);
      migrateFiscal(data);
      const payload = JSON.stringify(data);
      const result = version === 0
        ? await env.DB.prepare('INSERT OR IGNORE INTO ledger_state (user_id, version, payload) VALUES (?, 1, ?)').bind(user, payload).run()
        : await env.DB.prepare('UPDATE ledger_state SET payload = ?, version = version + 1 WHERE user_id = ? AND version = ?').bind(payload, user, version).run();
      return result.meta.changes === 1 ? respond({ version: version + 1 }) : respond({ error: 'Version conflict' }, 409);
    } catch {
      return respond({ error: 'Storage unavailable' }, 503);
    }
  },
};
