import fs from 'node:fs';
import path from 'node:path';

const b64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const buf = Buffer.from(b64Png, 'base64');
const target = path.resolve('benchmarks/fixtures/sample.png');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, buf);
console.log('Created valid binary sample.png at', target);
