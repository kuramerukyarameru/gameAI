// Node adapter for testing the exact browser worker module, not a second engine.
import {parentPort} from 'node:worker_threads';
import fs from 'node:fs/promises';
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>String(url).startsWith('file:')?new Response(await fs.readFile(url),{headers:{'Content-Type':'application/wasm'}}):originalFetch(url);
globalThis.self=globalThis;
self.postMessage=message=>parentPort.postMessage(message);
const pending=[];
parentPort.on('message',message=>typeof self.onmessage==='function'?self.onmessage({data:message}):pending.push(message));
await import('../js/worker.js');
for(const message of pending)self.onmessage({data:message});
