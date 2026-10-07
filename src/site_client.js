// Web-site build only (site/index.html). The page reaches its shared storage and Google Sheets through
// window.claude.use(name); inside Claude the viewer supplies that. Here it is supplied by this file, which talks to the
// Google Apps Script back end (backend/Code.gs). Nothing in src/page.html changes for it.
//   db    → documents and short locks kept by the back end
//   mcp   → the three Google Sheets calls the page makes, carried out by the back end as the owner of the script
//   user  → everyone who knows the access code may save
// The access code is asked for once per browser and kept in localStorage; the back end checks it on every request.
(() => {
  'use strict';
  const BACKEND = '__BACKEND_URL__';
  if (!BACKEND) return;
  const KEY = 'status602:access', ADMIN_MS = 15 * 60000, TIMEOUT = 90000;
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const api = window.__status602 = { contact: null, admin(pw) { adminPw = String(pw || ''); adminUntil = Date.now() + ADMIN_MS; } };
  let adminPw = '', adminUntil = 0, code = '', local = false;
  try { code = localStorage.getItem(KEY) || ''; } catch (e) { code = ''; }

  /* ---------- one request to the back end ---------- */
  async function send(calls, useCode) {
    const body = JSON.stringify({ v: 1, code: useCode, admin: Date.now() < adminUntil ? adminPw : '', calls });
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      // text/plain keeps this a "simple" request: Apps Script web apps cannot answer a CORS preflight
      const r = await fetch(BACKEND, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, redirect: 'follow', signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(timer); }
  }

  /* ---------- the access screen ---------- */
  const domReady = new Promise((res) => { if (document.body) res(); else document.addEventListener('DOMContentLoaded', () => res(), { once: true }); });
  let gate = null;
  function overlay() {
    if (gate) return gate;
    const el = document.createElement('div');
    el.id = 'site-gate';
    el.innerHTML = '<form><h2>สภาพ บ.ประจำวัน ฝูง.602</h2><p class="m"></p>'
      + '<label>รหัสเข้าใช้งาน<input type="password" name="code" autocomplete="current-password" autocapitalize="off" spellcheck="false"></label>'
      + '<p class="e" role="alert"></p><div class="b"><button type="submit">เข้าใช้งาน</button><button type="button" class="q" hidden>ทำงานต่อโดยเก็บในเครื่องนี้</button></div></form>';
    const css = document.createElement('style');
    css.textContent = '#site-gate{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:16px;background:rgba(22,33,44,.72);font:16px system-ui,sans-serif}'
      + '#site-gate form{width:min(420px,100%);padding:24px;border-radius:10px;background:#fff;color:#16212c;box-shadow:0 12px 40px rgba(0,0,0,.35)}'
      + '#site-gate h2{margin:0 0 6px;font-size:20px}#site-gate p{margin:0 0 14px;font-size:14px;line-height:1.5;color:#52616f}#site-gate .e{min-height:1.5em;margin:10px 0 0;color:#b3261e}'
      + '#site-gate label{display:block;font-size:14px;font-weight:600}#site-gate input{display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:10px 12px;font:inherit;border:1px solid #9aa7b4;border-radius:6px}'
      + '#site-gate .b{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}#site-gate button{padding:10px 16px;font:inherit;font-weight:600;border-radius:6px;border:1px solid #1d4e7e;background:#1d4e7e;color:#fff;cursor:pointer}'
      + '#site-gate button.q{background:#fff;color:#1d4e7e}#site-gate button:disabled{opacity:.6;cursor:default}#site-gate[hidden]{display:none}';
    document.head.appendChild(css); document.body.appendChild(el);
    gate = { el, form: el.querySelector('form'), msg: el.querySelector('.m'), err: el.querySelector('.e'), input: el.querySelector('input'), go: el.querySelector('button[type=submit]'), quit: el.querySelector('.q') };
    return gate;
  }
  // Resolves once a code has been accepted (true) or the visitor chose to work without the back end (false).
  let unlocking = null;
  function unlock(first) {
    if (unlocking) return unlocking;
    unlocking = (async () => {
      await domReady;
      const check = async (c) => {
        const r = await send([{ op: 'ping' }], c);
        if (r && r.ok && r.results && r.results[0] && r.results[0].ok) { api.contact = r.results[0].contact || null; api.empty = !!r.results[0].empty; return 'ok'; }
        return (r && r.error && r.error.code) || 'error';
      };
      if (first && code) {
        try { const s = await check(code); if (s === 'ok') return true; if (s !== 'bad_code') throw new Error(s); code = ''; }
        catch (e) { /* shown below, with the code kept so "try again" can reuse it */ }
      }
      const g = overlay();
      g.el.hidden = false;
      const ask = (text, error, offline) => new Promise((res) => {
        g.msg.textContent = text; g.err.textContent = error || ''; g.quit.hidden = !offline; g.go.disabled = false; g.input.disabled = false;
        g.go.textContent = offline ? 'ลองอีกครั้ง' : 'เข้าใช้งาน';
        if (!offline) { g.input.value = ''; g.input.focus(); } else g.input.value = code;
        g.form.onsubmit = (ev) => { ev.preventDefault(); const v = g.input.value.trim(); if (!v) { g.err.textContent = 'พิมพ์รหัสเข้าใช้งาน'; return; } g.go.disabled = true; g.input.disabled = true; g.err.textContent = 'กำลังตรวจสอบ…'; res(v); };
        g.quit.onclick = () => res(null);
      });
      let text = 'พิมพ์รหัสเข้าใช้งานของหน่วย เครื่องนี้จะจำรหัสไว้ ครั้งต่อไปไม่ต้องพิมพ์อีก', error = '', offline = false;
      if (first && code) { error = 'ติดต่อระบบเก็บข้อมูลไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง'; offline = true; }
      for (;;) {
        const v = await ask(text, error, offline);
        if (v === null) { g.el.hidden = true; return false; }
        try {
          const s = await check(v);
          if (s === 'ok') { code = v; try { localStorage.setItem(KEY, v); } catch (e) { /* asked again next time */ } g.el.hidden = true; return true; }
          if (s === 'bad_code') { error = 'รหัสเข้าใช้งานไม่ถูกต้อง'; offline = false; }
          else if (s === 'not_ready') { error = 'ระบบเก็บข้อมูลยังตั้งค่าไม่เสร็จ แจ้งผู้ดูแลระบบ'; offline = true; code = v; }
          else { error = 'ติดต่อระบบเก็บข้อมูลไม่ได้ ลองอีกครั้ง'; offline = true; code = v; }
        } catch (e) { error = 'ติดต่อระบบเก็บข้อมูลไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง'; offline = true; code = v; }
      }
    })();
    unlocking.then(() => { unlocking = null; }, () => { unlocking = null; });
    return unlocking;
  }
  const ready = unlock(true).then((ok) => { local = !ok; return ok; });

  /* ---------- calls, gathered so that requests made together travel together ---------- */
  let queue = [], flushing = null;
  function call(c, retry) {
    return new Promise((resolve, reject) => {
      queue.push({ c, resolve, reject, retry: !!retry, tries: 0 });
      if (!flushing) flushing = setTimeout(flush, 0);
    });
  }
  async function flush() {
    flushing = null;
    const batch = queue; queue = [];
    if (!batch.length) return;
    let r;
    try { r = await send(batch.map((b) => b.c), code); }
    catch (e) {
      // the request may or may not have arrived: only calls that are safe to repeat are tried again
      for (const b of batch) { if (b.retry && b.tries < 2) { b.tries++; queue.push(b); } else b.reject({ code: 'server_unavailable', message: 'ติดต่อระบบเก็บข้อมูลไม่ได้' }); }
      if (queue.length && !flushing) flushing = setTimeout(flush, 1500);
      return;
    }
    if (r && !r.ok && r.error && r.error.code === 'bad_code') {
      // the code was changed by the administrator: ask again, then carry on with the same calls
      code = ''; try { localStorage.removeItem(KEY); } catch (e) { /* nothing kept */ }
      const ok = await unlock(false);
      if (!ok) { batch.forEach((b) => b.reject({ code: 'server_unavailable', message: 'ยังไม่ได้ใส่รหัสเข้าใช้งาน' })); return; }
      batch.forEach((b) => queue.push(b)); if (!flushing) flushing = setTimeout(flush, 0);
      return;
    }
    if (!r || !r.ok || !Array.isArray(r.results)) { const er = (r && r.error) || { code: 'upstream_error' }; batch.forEach((b) => b.reject({ code: er.code === 'busy' ? 'server_unavailable' : er.code, message: er.message })); return; }
    batch.forEach((b, i) => { const x = r.results[i]; if (x && x.ok) b.resolve(x); else b.reject((x && x.error) || { code: 'upstream_error' }); });
  }

  /* ---------- what the page sees ---------- */
  const doc = (path) => ({
    get: async () => { const r = await call({ op: 'doc.get', path }, true); return { exists: !!r.exists, id: path.split('/').pop(), data: () => clone(r.data), metadata: {} }; },
    set: async (data) => { await call({ op: 'doc.set', path, data: clone(data) }, true); },
    // The page renews a lock before every step of a long job. A renewal asked for while at least three quarters of the
    // lock's time is still left is answered here, without a trip to the back end; shortening a lock always goes there.
    acquire: async (o) => {
      const held = leases[path], now = Date.now();
      if (held && held.holder === o.holder && o.ttlMs === held.ttl && now - held.at < held.ttl / 4) return { acquired: true, holder: o.holder };
      delete leases[path];
      const r = await call({ op: 'doc.acquire', path, holder: o.holder, ttlMs: o.ttlMs }, true);
      if (!r.acquired) return { acquired: false, expiresAt: r.expiresAt };
      if (o.ttlMs >= 20000) leases[path] = { holder: o.holder, ttl: o.ttlMs, at: now };
      return { acquired: true, holder: r.holder };
    },
  });
  const leases = {};
  const collection = (name) => {
    let by = '', dir = 'asc', lim = 1000;
    const q = {
      orderBy(f, d) { by = f; dir = d || 'asc'; return q; },
      limit(n) { lim = n; return q; },
      get: async () => { const r = await call({ op: 'col.get', name, orderBy: by, dir, limit: lim }, true); return { docs: (r.docs || []).map((x) => ({ id: x.id, data: () => clone(x.data) })) }; },
    };
    return q;
  };
  const caps = {
    db: { doc, collection },
    user: { can: async () => true },
    // Google Sheets through the back end. A failed write is never repeated here: the page reads the sheet first and decides.
    mcp: { callTool: async (server, tool, input) => { const r = await call({ op: 'gs', tool, input: clone(input) }, tool !== 'update_spreadsheet'); return { payload: r.payload }; } },
  };
  api.ready = ready;

  /* ---------- an empty back end: offer to bring in the data exported from the Claude page ---------- */
  ready.then(async (ok) => {
    if (!ok || !api.empty) return;
    await domReady;
    const bar = document.createElement('div');
    bar.id = 'site-import';
    bar.innerHTML = '<style>#site-import{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 16px;background:#fff4d6;color:#4a3800;font:14px system-ui,sans-serif;border-bottom:1px solid #e2c56b}'
      + '#site-import input[type=password]{width:260px;max-width:100%;box-sizing:border-box;padding:6px 8px;font:inherit;border:1px solid #9aa7b4;border-radius:6px}#site-import button{padding:6px 12px;font:inherit;font-weight:600;border-radius:6px;border:1px solid #1d4e7e;background:#1d4e7e;color:#fff;cursor:pointer}'
      + '#site-import button.q{background:transparent;color:#1d4e7e}#site-import .s{flex-basis:100%}</style>'
      + '<span>ระบบเก็บข้อมูลยังว่าง ถ้ามีไฟล์ข้อมูลจากหน้าเดิม (seed.json) นำเข้าได้ที่นี่ก่อนเริ่มใช้งาน</span>'
      + '<input type="file" accept=".json,application/json" aria-label="ไฟล์ข้อมูลจากหน้าเดิม">'
      + '<input type="password" placeholder="รหัสผ่านสำหรับ Google Sheet" aria-label="รหัสผ่านสำหรับ Google Sheet" autocomplete="off">'
      + '<button type="button" class="go">นำเข้า</button><button type="button" class="q">ไม่นำเข้า เริ่มใหม่</button><span class="s" role="status"></span>';
    document.body.insertBefore(bar, document.body.firstChild);
    const file = bar.querySelector('input[type=file]'), pw = bar.querySelector('input[type=password]'), go = bar.querySelector('.go'), say = bar.querySelector('.s');
    bar.querySelector('.q').onclick = () => bar.remove();
    go.onclick = async () => {
      const f = file.files && file.files[0];
      if (!f) { say.textContent = 'เลือกไฟล์ seed.json ก่อน'; return; }
      if (!pw.value.trim()) { say.textContent = 'พิมพ์รหัสผ่านสำหรับ Google Sheet'; return; }
      go.disabled = true; say.textContent = 'กำลังนำเข้า…';
      try {
        const seed = JSON.parse(await f.text()), docs = seed && seed.docs;
        if (!docs || typeof docs !== 'object' || !docs['app/state']) throw { code: 'bad_file' };
        api.admin(pw.value.trim());
        const r = await call({ op: 'import', docs }, false);
        say.textContent = 'นำเข้าแล้ว ' + r.imported + ' รายการ กำลังเปิดหน้าใหม่…';
        setTimeout(() => location.reload(), 1200);
      } catch (e) {
        const c = e && e.code;
        say.textContent = c === 'admin_required' ? 'รหัสผ่านไม่ถูกต้อง' : c === 'not_empty' ? 'ระบบมีข้อมูลอยู่แล้ว จึงไม่นำเข้าทับ' : c === 'bad_file' || e instanceof SyntaxError ? 'ไฟล์นี้ไม่ใช่ไฟล์ข้อมูลของหน้านี้' : 'นำเข้าไม่สำเร็จ ลองอีกครั้ง';
        go.disabled = false;
      }
    };
  });
  window.claude = { use: (name) => ready.then((ok) => (ok ? (caps[name] || null) : null)) };
})();
