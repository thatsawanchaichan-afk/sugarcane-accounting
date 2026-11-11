# Sugarcane accounting — source export

โค้ดระบบบัญชีไร่อ้อยและครัวเรือน รุ่นล่าสุดจาก Sites (11 พฤศจิกายน 2569)

ต้นทาง commit: `211449026c78d00293ff80a8035e2e2d8de8e928`

โฟลเดอร์นี้เพิ่มแยกจาก index.html เดิม เพื่อเก็บเว็บ GitHub Pages เดิมไว้
ใช้ HTML/CSS/JavaScript, Cloudflare Worker และ D1 (SQLite)
รองรับปีงบ ต.ค.–ก.ย. ตามปีเริ่มต้น 2568–2572

## ไฟล์

- app.html: หน้าเว็บ สูตรคำนวณ และเมนู
- worker/index.js: API รับ–บันทึกข้อมูลและแปลงปีงบ
- drizzle/0000_ledger.sql: โครงสร้างฐานข้อมูล
- scripts/build.mjs: รวมหน้าเว็บเข้ากับ Worker

## Build

ต้องมี Node.js (ใช้รุ่น 24 ตอนตรวจสอบ) ไม่มี dependency ภายนอก

```sh
cd sites-source
npm run build
node --check dist/server/index.js
```

## ข้อมูลส่วนตัว

นี่คือ source export สำหรับ repository สาธารณะ ไม่ใช่สำเนาฐานข้อมูล
ไม่ได้รวมรายชื่อลูกไร่และยอดเงินจากเอกสาร หนี้ส่วนตัว ข้อมูลแปลง/รถส่วนตัว ใบเสร็จสหกรณ์ ลิงก์เอกสารส่วนตัว หรือข้อมูลบัญชีผู้ใช้จริงที่เคยฝังในโค้ด ข้อมูลใน Sites เดิมไม่ได้ถูกแก้ไขหรือลบ
ฟังก์ชันและสูตรยังอยู่ แต่ข้อมูลเริ่มต้นส่วนตัวถูกเว้นว่าง ต้องย้ายข้อมูลผ่านช่องทางส่วนตัวเมื่อย้ายระบบ

## ติดตั้งใน Cloudflare ของทัด

อ่าน [CLOUDFLARE-SETUP.md](CLOUDFLARE-SETUP.md) มีขั้นตอนบน iPad และ CLI

เพิ่ม wrangler.json, binding D1, คำสั่ง deploy/migration, ระบบตรวจลายเซ็น JWT ของ Cloudflare Access และ OWNER_EMAIL แล้ว ระบบไม่ใช้ header ระบุตัวตนของ ChatGPT อีกต่อไป

ต้องใส่ D1 Database ID จริงและตั้งค่า Access ในบัญชีของทัดก่อนใช้งาน ยังไม่ได้ deploy หรือย้ายฐานข้อมูลจริง

```sh
npm run build
npm test
```
