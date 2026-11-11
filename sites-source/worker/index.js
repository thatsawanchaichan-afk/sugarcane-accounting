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
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
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
    const user = request.headers.get('oai-authenticated-user-id');
    if (!user) return respond({ error: 'Sign in required' }, 401);
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
