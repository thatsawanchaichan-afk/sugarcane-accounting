import {readFileSync} from 'node:fs';
const c=JSON.parse(readFileSync('wrangler.json','utf8'));
const db=c.d1_databases?.find(x=>x.binding==='DB');
if(!db||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(db.database_id)||/^0{8}-/.test(db.database_id)){
 console.error('สร้าง D1 ในบัญชี Cloudflare ของทัด แล้วใส่ database_id จริงใน wrangler.json ก่อน');process.exit(1);
}
console.log('D1 configuration is set. Authentication settings must also be configured in Cloudflare.');
