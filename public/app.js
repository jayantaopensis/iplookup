'use strict';

(async function () {
  const $ = (id) => document.getElementById(id);
  const urlInput = $('url');
  const output = $('output');
  const status = $('status');
  const timing = $('timing');
  const tbody = document.querySelector('#fieldsTable tbody');

  const prefix = `${location.origin}/json/`;
  urlInput.value = `${prefix}8.8.8.8`;

  const { fields, languages } = await (await fetch('/api/fields')).json();

  // --- URL helpers -------------------------------------------------------
  function setParam(key, value) {
    const url = new URL(urlInput.value, location.origin);
    if (value === null || value === '') url.searchParams.delete(key);
    else url.searchParams.set(key, value);
    urlInput.value = decodeURI(url.toString());
  }

  // Keep the endpoint prefix intact while the user edits the address part.
  urlInput.addEventListener('input', () => {
    if (!urlInput.value.startsWith(prefix)) urlInput.value = prefix;
  });

  // --- JSON rendering (built with text nodes, never innerHTML) ------------
  function renderJson(value, indent = 0) {
    const frag = document.createDocumentFragment();
    const pad = '  '.repeat(indent);
    const span = (cls, text) => {
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = text;
      return s;
    };
    const text = (t) => document.createTextNode(t);

    if (value === null) frag.append(span('j-null', 'null'));
    else if (typeof value === 'string') frag.append(span('j-str', JSON.stringify(value)));
    else if (typeof value === 'number') frag.append(span('j-num', String(value)));
    else if (typeof value === 'boolean') frag.append(span('j-bool', String(value)));
    else {
      const entries = Object.entries(value);
      frag.append(text('{\n'));
      entries.forEach(([k, v], i) => {
        frag.append(text(pad + '  '), span('j-key', JSON.stringify(k)), text(': '));
        frag.append(renderJson(v, indent + 1));
        frag.append(text(i < entries.length - 1 ? ',\n' : '\n'));
      });
      frag.append(text(pad + '}'));
    }
    return frag;
  }

  function setBadge(kind, label) {
    status.className = `badge ${kind}`;
    status.textContent = label;
  }

  // --- Tester --------------------------------------------------------------
  $('tester').addEventListener('submit', async (e) => {
    e.preventDefault();
    setBadge('', 'loading…');
    timing.textContent = '';
    const started = performance.now();
    try {
      const res = await fetch(urlInput.value);
      const ms = Math.round(performance.now() - started);
      const left = res.headers.get('X-Rl');
      timing.textContent = `HTTP ${res.status} · ${ms} ms${left !== null ? ` · ${left} requests left this minute` : ''}`;
      const body = await res.text();
      let data;
      try { data = JSON.parse(body); } catch { data = undefined; }
      output.replaceChildren(data === undefined ? document.createTextNode(body) : renderJson(data));
      const ok = res.ok && data && data.status === 'success';
      setBadge(ok ? 'ok' : 'fail', ok ? 'success' : (data && data.message) || 'error');
    } catch (err) {
      output.textContent = `Request failed: ${err.message}`;
      setBadge('fail', 'network error');
    }
  });

  // --- Language chips --------------------------------------------------------
  const langBox = $('langs');
  $('lang-list').textContent = languages.join(', ');
  for (const lang of languages) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = lang;
    b.addEventListener('click', () => {
      const active = b.classList.toggle('active');
      langBox.querySelectorAll('.btn').forEach((o) => o !== b && o.classList.remove('active'));
      setParam('lang', active && lang !== 'en' ? lang : null);
    });
    langBox.append(b);
  }

  // --- Field picker ----------------------------------------------------------
  const boxes = [];
  for (const f of fields) {
    const tr = document.createElement('tr');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = f.def;
    cb.dataset.bit = f.bit;
    cb.setAttribute('aria-label', f.name);
    boxes.push(cb);

    const cells = [cb, f.name, f.desc, f.example, f.type, String(f.bit)];
    for (const c of cells) {
      const td = document.createElement('td');
      td.append(c);
      tr.append(td);
    }
    tr.addEventListener('click', (e) => {
      if (e.target !== cb) cb.checked = !cb.checked;
      updateCode();
    });
    tbody.append(tr);
  }

  function updateCode() {
    const sum = boxes.reduce((acc, cb) => acc + (cb.checked ? Number(cb.dataset.bit) : 0), 0);
    $('fieldCode').textContent = String(sum);
    $('toggleAll').textContent = boxes.every((cb) => cb.checked) ? 'Clear all' : 'Select all';
  }

  $('toggleAll').addEventListener('click', () => {
    const target = !boxes.every((cb) => cb.checked);
    boxes.forEach((cb) => { cb.checked = target; });
    updateCode();
  });

  $('applyFields').addEventListener('click', () => {
    setParam('fields', $('fieldCode').textContent);
    $('try').scrollIntoView({ behavior: 'smooth' });
  });

  updateCode();
})();
