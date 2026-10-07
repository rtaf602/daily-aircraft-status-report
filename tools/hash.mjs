// Prints the number the page stores for a password:  node tools/hash.mjs "NEWPASSWORD"
// Put the result into build.config.json (hashes.admin / hashes.hours / hashes.sheet) and run  node build.mjs
// The page compares h53('602:' + typed.trim().toUpperCase()) with these numbers, so passwords are not case-sensitive.
function h53(s) {
  let h1 = 0xdeadbeef ^ 7, h2 = 0x41c6ce57 ^ 7;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
for (const pw of process.argv.slice(2)) console.log(pw, '→', h53('602:' + pw.trim().toUpperCase()));
