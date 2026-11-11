import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync('app.html', 'utf8');
new vm.Script(html.split('<script>')[1].split('</script>')[0]);
mkdirSync('dist/server', { recursive: true });
mkdirSync('dist/.openai', { recursive: true });
writeFileSync('dist/server/index.js', 'const APP_HTML = ' + JSON.stringify(html) + ';\n' + readFileSync('worker/index.js', 'utf8'));
copyFileSync('.openai/hosting.json', 'dist/.openai/hosting.json');
