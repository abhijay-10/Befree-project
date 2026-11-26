// Runs a simple Deluge function in Node for tests, with CRM and OpenAI replaced by the test.
const fs = require('fs');
class DM {
  constructor(o) { this.m = new Map(Object.entries(o || {}).map(([k, v]) => [k, wrap(v)])); }
  put(k, v) { this.m.set(k, v); }
  get(k) { const v = this.m.get(k); return v === undefined ? null : v; }
  keys() { return [...this.m.keys()]; }
  size() { return this.m.size; }
  toJSON() { return Object.fromEntries(this.m); }
  toString() { return JSON.stringify(this); }
}
const wrap = v => Array.isArray(v) ? v.map(wrap) : v && typeof v === 'object' && !(v instanceof DM) ? new DM(v) : v;
const own = (p, o) => Object.keys(o).map(k => { const old = Object.getOwnPropertyDescriptor(p, k); Object.defineProperty(p, k, { value: o[k], configurable: true, writable: true }); return () => old ? Object.defineProperty(p, k, old) : delete p[k]; });
const replace = String.prototype.replace, num = v => { if (String(v).trim() === '' || isNaN(v)) throw new Error('not a number: ' + v); return Number(v); };

function load(file, name, args) {
  const code = replace.call(fs.readFileSync(file, 'utf8'), /\r\n/g, '\n')
    .replace(/^\w+ \w+\.\w+\([^)]*\)/, 'function ' + name + '(' + args.join(', ') + ')')
    .replace(/for each\s+(\w+) in ([^\n]+)\n/g, 'for (const $1 of ($2 || []))\n')
    .replace(/invokeurl\s*\[([\s\S]*?)\n\s*\];/g, (m, b) => 'invoke({' + b.trim().split('\n').map(x => x.trim().replace(/^(\w+)\s*:\s*POST$/, '$1:"POST"')).join(',') + '});')
    .replace(/\.length\(\)/g, '.length').replace(/^(\s*)info (.*);$/gm, '$1log($2);').replace(/= \{("[^;]*")\};/g, '= [$1];')
    .replace(/(?<![.\w])Map\(\)/g, 'new DM()').replace(/(?<![.\w])List\(\)/g, '[]');
  const make = new Function('zoho', 'invoke', 'log', 'ifnull', 'DM', code + ';return ' + name);
  return function run(world, ...values) {
    const undo = [].concat(
      own(String.prototype, {
        matches(r) { return new RegExp('^(?:' + r + ')$').test(this); }, subString(a, b) { return this.substring(a, b); }, toLong() { return num(this); }, toMap() { return new DM(JSON.parse(this)); },
        equalsIgnoreCase(x) { return this.toLowerCase() === x.toLowerCase(); }, contains(x) { return this.includes(x); }, replaceAll(r, x) { return replace.call(this, new RegExp(r, 'g'), x); },
        toTime() { return { toLong: () => new Date(replace.call(this, ' ', 'T') + 'Z').getTime() }; }
      }),
      own(Number.prototype, { toLong() { return Math.trunc(this); }, round(d) { return Math.round(this * 10 ** d) / 10 ** d; } }),
      own(Array.prototype, { add(x) { this.push(x); }, contains(x) { return this.includes(x); }, size() { return this.length; }, toString() { return this.map(String).join(','); } }));
    const pad = n => String(n).padStart(2, '0'), d = world.now, day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, clock = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    const zoho = { crm: world.crm, currenttime: { toString: f => f === 'yyyy-MM-dd HH:mm' ? `${day} ${clock.slice(0, 5)}` : /'T'/.test(f) ? `${day}T${clock}+00:00` : `${day} ${clock}` }, currentdate: { toString: () => day, getYear: () => d.getUTCFullYear() } };
    try { return JSON.parse(make(zoho, world.invoke, x => world.logs.push(String(x)), (a, b) => a == null ? b : a, DM)(...values)); } finally { undo.reverse().forEach(f => f()); }
  };
}
module.exports = { load, wrap };
