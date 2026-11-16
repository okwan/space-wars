// Copies the one-file web build into app/, the only game file the desktop build ships.
const fs = require('node:fs'), path = require('node:path');
const from = path.join(__dirname, '..', 'dist-single', 'index.html'), to = path.join(__dirname, 'app', 'index.html');
fs.mkdirSync(path.dirname(to), { recursive: true });
fs.copyFileSync(from, to);
console.log(`copied ${path.relative(process.cwd(), from)} -> ${path.relative(process.cwd(), to)}`);
