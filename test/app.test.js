import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { init } from '../site/app.js';

const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8')
  // The page boots itself with an inline module; tests call init() directly instead.
  .replace(/<script type="module">[\s\S]*?<\/script>/, '');
const reply = readFileSync(new URL('./fixtures/reply.txt', import.meta.url), 'utf8');

/** @type {JSDOM} */
let dom;
/** @type {Document} */
let doc;

function boot() {
  const win = /** @type {any} */ (dom.window);
  return init(win.document, win);
}

beforeEach(() => {
  dom = new JSDOM(html, { url: 'https://example.test/', pretendToBeVisual: true });
  doc = dom.window.document;
});

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (doc.getElementById(id));
/** @param {string} id @param {string} value */
function type(id, value) {
  const el = /** @type {HTMLInputElement} */ ($(id));
  el.value = value;
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}
/** @param {'sponsors' | 'researchers'} list @param {number} i @param {string} k @param {string} v */
function typePerson(list, i, k, v) {
  const input = /** @type {HTMLInputElement} */ ($(list).querySelectorAll('.person')[i].querySelector(`[data-k="${k}"]`));
  input.value = v;
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

test('boots with an empty proposal preview and lists missing fields', () => {
  boot();
  assert.equal($('paper').querySelector('h1')?.textContent, 'Della Cluster Access Proposal');
  assert.equal($('paper').querySelectorAll('h2').length, 4, 'References omitted when empty');
  assert.ok($('issues').querySelectorAll('li').length >= 10);
  assert.equal($('paper').hidden, false);
  assert.match($('template').textContent ?? '', /Number of CPU-cores:/);
});

test('pasting a reply fills the form and renders a complete proposal', () => {
  boot();
  typePerson('sponsors', 0, 'name', 'Pat Example');
  typePerson('sponsors', 0, 'netid', 'pexample');
  typePerson('researchers', 0, 'name', 'Sam Sample');
  typePerson('researchers', 0, 'netid', 'ssample');
  /** @type {HTMLTextAreaElement} */ ($('reply')).value = reply;
  $('parse-reply').click();

  assert.match($('parse-status').textContent ?? '', /^Filled 10 fields/);
  assert.equal(/** @type {HTMLInputElement} */ ($('cpuCores')).value, '32');
  const text = $('paper').textContent ?? '';
  for (const s of ['PyTorch, JAX, NumPy, mpi4py', 'None.', '128 GB RAM', '2–4 × A100', 'Pat Example (pexample)', 'Sam Sample (ssample)']) {
    assert.ok(text.includes(s), `preview contains ${s}`);
  }
  assert.equal($('paper').querySelectorAll('h2').length, 5);
  assert.equal($('paper').querySelectorAll('.tex-refs li').length, 2);
  const issues = [...$('issues').querySelectorAll('li')];
  assert.equal(issues.length, 1);
  assert.equal(issues[0].className, 'ok');
});

test('an unparseable reply reports an error and changes nothing', () => {
  boot();
  /** @type {HTMLTextAreaElement} */ ($('reply')).value = 'Hi,\nno fields here.';
  $('parse-reply').click();
  assert.match($('parse-status').textContent ?? '', /No recognizable fields/);
  assert.equal(/** @type {HTMLInputElement} */ ($('background')).value, '');
});

test('switching to sponsor mode hides the proposal and shows the CSES email', () => {
  boot();
  typePerson('sponsors', 0, 'name', 'Pat Example');
  typePerson('sponsors', 0, 'netid', 'pexample');
  typePerson('researchers', 0, 'name', 'Sam Sample');
  typePerson('researchers', 0, 'netid', 'ssample');
  const radio = /** @type {HTMLInputElement} */ (doc.querySelector('input[name="mode"][value="sponsor"]'));
  radio.checked = true;
  radio.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

  assert.equal($('paper').hidden, true);
  assert.equal($('background').closest('fieldset')?.hidden, true);
  assert.match($('email').textContent ?? '', /^To: cses@princeton\.edu\nSubject: Della account request: Sam Sample/);
  assert.match(/** @type {HTMLAnchorElement} */ ($('mailto')).href, /^mailto:cses@princeton\.edu\?subject=Della%20account/);
  assert.equal($('issues').querySelector('li')?.textContent, 'Ready to send.');
});

test('marking a researcher non-Princeton disables NetID and shows the RCU note', () => {
  boot();
  typePerson('researchers', 0, 'name', 'Guest Person');
  typePerson('researchers', 0, 'netid', 'guest');
  const ext = /** @type {HTMLInputElement} */ ($('researchers').querySelector('[data-k="external"]'));
  ext.checked = true;
  ext.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const netid = /** @type {HTMLInputElement} */ ($('researchers').querySelector('[data-k="netid"]'));
  assert.equal(netid.disabled, true);
  assert.equal(netid.value, '');
  assert.equal($('rcu-note').hidden, false);
  assert.ok(($('paper').textContent ?? '').includes('Guest Person (RCU account requested)'));
  assert.equal($('sponsors').querySelector('[data-k="external"]'), null, 'sponsors have no non-Princeton option');
});

test('add and remove person rows', () => {
  boot();
  /** @type {HTMLElement} */ (doc.querySelector('[data-add="researchers"]')).click();
  assert.equal($('researchers').querySelectorAll('.person').length, 2);
  /** @type {HTMLElement} */ ($('researchers').querySelector('.remove')).click();
  assert.equal($('researchers').querySelectorAll('.person').length, 1);
  typePerson('researchers', 0, 'name', 'Keep me?');
  /** @type {HTMLElement} */ ($('researchers').querySelector('.remove')).click();
  assert.equal($('researchers').querySelectorAll('.person').length, 1, 'the last row is cleared, not removed');
  assert.equal(/** @type {HTMLInputElement} */ ($('researchers').querySelector('[data-k="name"]')).value, '');
});

test('user input is rendered as text, never as markup', () => {
  boot();
  type('background', '<img src=x onerror="globalThis.pwned=1"><script>globalThis.pwned=1</script>');
  typePerson('researchers', 0, 'name', '<b>bold</b>');
  assert.equal($('paper').querySelectorAll('img, script, b').length, 0);
  assert.ok(($('paper').textContent ?? '').includes('<img src=x'));
});

test('the draft persists across reloads via localStorage', () => {
  boot();
  type('title', 'Persisted title');
  const saved = dom.window.localStorage.getItem('access-proposal:draft:v1');
  assert.ok(saved && saved.includes('Persisted title'));
  // Simulate a reload: a fresh page whose storage holds the saved draft.
  dom = new JSDOM(html, { url: 'https://example.test/' });
  doc = dom.window.document;
  dom.window.localStorage.setItem('access-proposal:draft:v1', saved);
  boot();
  assert.equal(/** @type {HTMLInputElement} */ ($('title')).value, 'Persisted title');
  assert.equal($('paper').querySelector('.tex-subtitle')?.textContent, 'Persisted title');
});

test('Save as PDF prints with a descriptive document title', () => {
  boot();
  typePerson('sponsors', 0, 'name', 'Pat Example');
  let titleAtPrint = '';
  dom.window.print = () => {
    titleAtPrint = doc.title;
  };
  $('print').click();
  assert.equal(titleAtPrint, 'della-access-proposal-example');
  assert.equal(doc.title, 'Access Proposal Builder', 'title restored after printing');
});

test('copy reports failure when the clipboard is unavailable', async () => {
  boot();
  $('copy-template').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.match($('parse-status').textContent ?? '', /Copy failed/);
});
