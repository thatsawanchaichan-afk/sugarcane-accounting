# ติดตั้ง Cloudflare ของทัด

ชุดนี้เตรียมจาก source ล่าสุด พร้อม Workers + D1 และ Cloudflare Access แต่ยังไม่ได้สร้างทรัพยากรหรือย้ายข้อมูลจริงในบัญชีของทัด

## ทำผ่านเว็บบน iPad

1. เข้าบัญชีที่ https://dash.cloudflare.com/ ด้วยบัญชีของทัด
2. สร้างฐานข้อมูล **D1** ชื่อ `sugarcane-ledger` แล้วจด Database ID
3. เปิด Console ของฐานข้อมูลใหม่ และรัน SQL จาก `drizzle/0000_ledger.sql` หนึ่งครั้ง (สร้างตาราง `ledger_state`) ฐานข้อมูลใหม่นี้ต้องว่าง หากมีตารางนี้อยู่แล้วไม่ต้องสร้างซ้ำ
4. แก้ `sites-source/wrangler.json` ใน GitHub: ใส่ Database ID จริงแทน `REPLACE_WITH_D1_DATABASE_ID` ห้ามใส่ API token ในไฟล์
5. ที่ Workers & Pages สร้าง **Worker** จาก GitHub เลือก repo `thatsawanchaichan-afk/sugarcane-accounting`
   - Root directory: `sites-source`
   - Build command: `npm run build`
   - Deploy command: `npm run deploy`
   - Worker name: `sugarcane-accounting` (ต้องตรงกับ wrangler.json)
   - ตรวจ binding ชื่อ `DB` ว่าชี้ไปฐานข้อมูลของทัด
6. เปิด Zero Trust แล้วสร้างทีม Cloudflare Access หากยังไม่มี เลือกการตั้งค่าหรือแผนด้วยตัวเองตามที่ dashboard แสดง
7. Worker > Access > Protect this Worker behind Access > **All traffic** จากนั้นแก้นโยบายใน Zero Trust > Access > Applications ให้ Allow เฉพาะ **อีเมลของทัด** และใช้การเข้าสู่ระบบที่ทัดสะดวก เช่น One-time PIN หากเปิดใช้งานไว้ ห้ามเลือก Everyone หรือ Bypass
8. คัดลอก Team domain และ Application Audience (AUD) จาก Access แล้วตั้งใน Worker > Settings > Variables and Secrets:
   - `ACCESS_TEAM_DOMAIN`: `https://ชื่อทีม.cloudflareaccess.com` (ไม่มี / ท้าย)
   - `ACCESS_AUD`: AUD ของแอป Access นี้
   - `OWNER_EMAIL`: อีเมลที่ทัดใช้เข้าสู่ระบบและอนุญาตใน policy
   ตั้งเป็น Secret ได้ทั้งหมด ไม่ต้องใส่ค่าจริงใน GitHub
9. เปิด URL ของ Worker แล้วเข้าสู่ระบบ ขณะที่ยังตั้งค่าไม่ครบจะแสดงข้อความตั้งค่าหรือปฏิเสธการเข้าใช้งาน ไม่เปิดข้อมูลให้คนทั่วไป

## ย้ายข้อมูลอย่างเป็นส่วนตัว

1. เปิดเว็บ Sites เดิม > บัญชีไร่อ้อย > สำรองข้อมูล > ดาวน์โหลดสำรอง JSON (รวมทั้งสองบัญชี)
2. เก็บไฟล์ไว้ส่วนตัว ห้ามอัปขึ้น repo สาธารณะ
3. ในเว็บ Cloudflare ที่เข้าสู่ระบบแล้ว > สำรองข้อมูล > เลือกไฟล์ JSON ตรวจข้อความก่อนยืนยันนำเข้า: การนำเข้าจะแทนที่ข้อมูลในบัญชีปลายทาง
4. ตรวจจำนวนรายการ หนี้คงเหลือ ยอดแต่ละปีงบ โควต้า แปลง และข้อมูลครัวเรือนเทียบเว็บเดิมก่อนเริ่มบันทึกงานที่เว็บใหม่
5. เอกสารอ้างอิงเก่าที่ฝังในหน้าเว็บ เช่น ยอดหนี้อ้างอิงและสรุป Excel ไม่ได้รวมใน source สาธารณะ และไม่อยู่ใน JSON หากไม่เคยยืนยันเป็นรายการจริง ต้องย้ายส่วนนี้เพิ่มเติมผ่านช่องทางส่วนตัว ห้ามถือว่าการนำเข้า JSON ย้ายข้อมูลอ้างอิงเหล่านี้ครบแล้ว

บัญชีใหม่ใช้ user ID ภายใน `owner` ซึ่งผูกกับอีเมลที่ตรวจด้วย JWT แล้ว จึงไม่ต้องใช้ user ID ของ ChatGPT เก่า และไม่ได้แก้ฐานข้อมูล Sites

## ทางเลือกผ่านคอมพิวเตอร์ / CLI

```sh
cd sites-source
npx --yes wrangler@4 login
npm run db:create
# ใส่ database_id ที่ได้รับใน wrangler.json
npm run db:migrate
npm test
npm run deploy
# ตั้งค่า Access ให้ All traffic แล้วใส่ค่าที่ CLI ถามทีละตัว
npx --yes wrangler@4 secret put ACCESS_TEAM_DOMAIN
npx --yes wrangler@4 secret put ACCESS_AUD
npx --yes wrangler@4 secret put OWNER_EMAIL
```

ไม่ต้องนำ API token หรือรหัสผ่านมาวางในแชต / GitHub หากใช้ Workers Git integration ให้ Cloudflare จัดการสิทธิ์เชื่อม GitHub ผ่านหน้าเว็บ

## ข้อจำกัดการตรวจสอบ

ตรวจ build และทดสอบ JWT/สิทธิ์ด้วยกุญแจทดสอบในเครื่องแล้ว การสร้าง D1, Access policy, deploy และการนำเข้าข้อมูลจริงยังต้องตรวจในบัญชี Cloudflare ของทัด

อ้างอิง: https://developers.cloudflare.com/workers/configuration/cloudflare-access/ และ https://developers.cloudflare.com/d1/get-started/
