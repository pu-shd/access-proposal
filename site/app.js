// @ts-check
import {
  emptyModel, coerceModel, parseReply, buildProposal, toMarkdown, validate,
  buildSponsorEmail, mailtoHref, buildResearcherTemplate, fileBaseName, MAX_PAGES,
} from './proposal.js';
import { renderProposal } from './render.js';

const STORAGE_KEY = 'access-proposal:draft:v1';
const TEXT_FIELDS = /** @type {const} */ ([
  'otherSystem', 'title', 'background', 'languages', 'parallelization', 'libraries', 'cpuCores',
  'cpuMemory', 'gpus', 'runTime', 'diskSpace', 'sharedStorage', 'duration', 'justification',
  'references', 'groupAccess', 'notes',
]);
/** Letter paper (11in) minus 1in top and bottom margins, at 96 CSS px per inch. */
const PAGE_CONTENT_PX = 9 * 96;

/**
 * @param {Document} doc
 * @param {Window & typeof globalThis} win
 */
export function init(doc, win) {
  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (doc.getElementById(id));
  const form = /** @type {HTMLFormElement} */ ($('form'));
  const paper = $('paper');
  const personTpl = /** @type {HTMLTemplateElement} */ ($('person-row'));

  const storage = {
    /** @returns {unknown} */
    load() {
      try {
        const raw = win.localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    /** @param {unknown} v */
    save(v) {
      try {
        win.localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
      } catch {
        /* storage unavailable (private mode); the form still works */
      }
    },
    clear() {
      try {
        win.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    },
  };

  // ------------------------------------------------------------ people rows

  /**
   * @param {'sponsors' | 'researchers'} list
   * @param {import('./proposal.js').Person} person
   */
  function addPerson(list, person) {
    const frag = /** @type {DocumentFragment} */ (personTpl.content.cloneNode(true));
    const row = /** @type {HTMLElement} */ (frag.firstElementChild);
    const q = (/** @type {string} */ k) => /** @type {HTMLInputElement} */ (row.querySelector(`[data-k="${k}"]`));
    q('name').value = person.name;
    q('netid').value = person.netid;
    q('external').checked = Boolean(person.external);
    if (list === 'sponsors') /** @type {HTMLElement} */ (row.querySelector('.ext')).remove();
    $(list).append(row);
    syncExternal(row);
  }

  /** Non-Princeton researchers have no NetID. @param {HTMLElement} row */
  function syncExternal(row) {
    const ext = /** @type {HTMLInputElement | null} */ (row.querySelector('[data-k="external"]'));
    const netid = /** @type {HTMLInputElement} */ (row.querySelector('[data-k="netid"]'));
    netid.disabled = Boolean(ext?.checked);
    if (ext?.checked) netid.value = '';
  }

  /** @param {'sponsors' | 'researchers'} list */
  function readPeople(list) {
    return [...$(list).querySelectorAll('.person')].map((row) => {
      const v = (/** @type {string} */ k) => /** @type {HTMLInputElement | null} */ (row.querySelector(`[data-k="${k}"]`));
      return { name: v('name')?.value ?? '', netid: v('netid')?.value ?? '', external: Boolean(v('external')?.checked) };
    });
  }

  // ------------------------------------------------------------ model <-> form

  /** @returns {import('./proposal.js').Model} */
  function readForm() {
    const m = emptyModel();
    const mode = /** @type {HTMLInputElement | null} */ (form.querySelector('input[name="mode"]:checked'));
    m.mode = mode?.value === 'sponsor' ? 'sponsor' : 'proposal';
    m.systems = [.../** @type {NodeListOf<HTMLInputElement>} */ (form.querySelectorAll('input[name="systems"]:checked'))].map((c) => c.value);
    for (const f of TEXT_FIELDS) m[f] = /** @type {HTMLInputElement} */ ($(f)).value;
    m.sponsors = readPeople('sponsors');
    m.researchers = readPeople('researchers');
    return m;
  }

  /** @param {import('./proposal.js').Model} m */
  function writeForm(m) {
    for (const r of /** @type {NodeListOf<HTMLInputElement>} */ (form.querySelectorAll('input[name="mode"]'))) r.checked = r.value === m.mode;
    for (const c of /** @type {NodeListOf<HTMLInputElement>} */ (form.querySelectorAll('input[name="systems"]'))) c.checked = m.systems.includes(c.value);
    for (const f of TEXT_FIELDS) /** @type {HTMLInputElement} */ ($(f)).value = m[f];
    for (const list of /** @type {const} */ (['sponsors', 'researchers'])) {
      $(list).replaceChildren();
      for (const p of m[list].length ? m[list] : [{ name: '', netid: '' }]) addPerson(list, p);
    }
  }

  // ------------------------------------------------------------ output

  function update() {
    const m = readForm();
    storage.save(m);

    for (const node of /** @type {NodeListOf<HTMLElement>} */ (doc.querySelectorAll('[data-mode]'))) {
      node.hidden = node.dataset.mode !== m.mode;
    }
    $('rcu-note').hidden = !m.researchers.some((p) => p.external && p.name.trim());

    const issues = validate(m);
    const list = $('issues');
    list.replaceChildren(
      ...issues.map((i) => {
        const li = doc.createElement('li');
        li.textContent = i.message;
        return li;
      }),
    );
    if (!issues.length) {
      const li = doc.createElement('li');
      li.className = 'ok';
      li.textContent = m.mode === 'proposal' ? 'All required sections are filled in.' : 'Ready to send.';
      list.append(li);
    }

    if (m.mode === 'proposal') {
      renderProposal(buildProposal(m), paper);
      const pages = estimatePages();
      const pagesEl = $('pages');
      pagesEl.textContent = pages ? `≈ ${pages} page${pages === 1 ? '' : 's'} (limit ${MAX_PAGES})` : '';
      pagesEl.classList.toggle('over', pages > MAX_PAGES);
    } else {
      const email = buildSponsorEmail(m);
      $('email').textContent = `To: ${email.to}\nSubject: ${email.subject}\n\n${email.body}`;
      /** @type {HTMLAnchorElement} */ ($('mailto')).href = mailtoHref(email);
    }
    $('template').textContent = buildResearcherTemplate(m);
    return m;
  }

  /** Estimate printed pages from the preview's rendered height (0 when layout is unavailable). */
  function estimatePages() {
    const h = paper.scrollHeight;
    return h > 0 ? Math.max(1, Math.ceil(h / PAGE_CONTENT_PX)) : 0;
  }

  // ------------------------------------------------------------ helpers

  /** @param {string} text @param {HTMLElement} statusEl */
  async function copy(text, statusEl) {
    try {
      await win.navigator.clipboard.writeText(text);
      statusEl.textContent = 'Copied.';
    } catch {
      statusEl.textContent = 'Copy failed; select the text and copy it manually.';
    }
  }

  /** @param {string} name @param {string} type @param {string} content */
  function download(name, type, content) {
    const url = win.URL.createObjectURL(new win.Blob([content], { type }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = name;
    doc.body.append(a);
    a.click();
    a.remove();
    win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
  }

  // ------------------------------------------------------------ events

  form.addEventListener('input', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.matches('[data-k="external"]')) syncExternal(/** @type {HTMLElement} */ (t.closest('.person')));
    update();
  });
  form.addEventListener('change', () => update());
  form.addEventListener('submit', (e) => e.preventDefault());

  form.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const add = t.closest('[data-add]');
    if (add instanceof win.HTMLElement) {
      addPerson(/** @type {'sponsors' | 'researchers'} */ (add.dataset.add), { name: '', netid: '' });
      update();
    } else if (t.matches('.remove')) {
      const row = /** @type {HTMLElement} */ (t.closest('.person'));
      const parent = /** @type {HTMLElement} */ (row.parentElement);
      if (parent.children.length > 1) row.remove();
      else for (const i of row.querySelectorAll('input')) i.type === 'checkbox' ? (i.checked = false) : (i.value = '');
      update();
    }
  });

  $('parse-reply').addEventListener('click', () => {
    const parsed = parseReply(/** @type {HTMLTextAreaElement} */ ($('reply')).value);
    const keys = Object.keys(parsed);
    const status = $('parse-status');
    if (!keys.length) {
      status.textContent = 'No recognizable fields found. Check that the reply keeps the questionnaire labels.';
      status.classList.add('over');
      return;
    }
    const m = { ...readForm(), ...parsed };
    writeForm(m);
    update();
    status.classList.remove('over');
    status.textContent = `Filled ${keys.length} field${keys.length === 1 ? '' : 's'}. Review below.`;
  });

  $('copy-template').addEventListener('click', () => copy($('template').textContent ?? '', $('parse-status')));
  $('copy-email').addEventListener('click', () => copy($('email').textContent ?? '', $('email-status')));

  $('print').addEventListener('click', () => {
    const m = update();
    const prev = doc.title;
    doc.title = fileBaseName(m); // browsers use the title as the default PDF file name
    win.print();
    doc.title = prev;
  });

  $('download-md').addEventListener('click', () => {
    const m = update();
    download(`${fileBaseName(m)}.md`, 'text/markdown', toMarkdown(buildProposal(m)));
  });

  $('export-json').addEventListener('click', () => {
    const m = update();
    download(`${fileBaseName(m)}.json`, 'application/json', JSON.stringify(m, null, 2));
  });

  const importInput = /** @type {HTMLInputElement} */ ($('import-json'));
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    const status = $('io-status');
    if (!file) return;
    try {
      writeForm(coerceModel(JSON.parse(await file.text())));
      update();
      status.textContent = `Imported ${file.name}.`;
    } catch {
      status.textContent = `Could not read ${file.name}; it is not a valid form export.`;
    } finally {
      importInput.value = '';
    }
  });

  $('clear').addEventListener('click', () => {
    if (!win.confirm('Clear every field? Export first if you want to keep this request.')) return;
    storage.clear();
    writeForm(emptyModel());
    /** @type {HTMLTextAreaElement} */ ($('reply')).value = '';
    update();
  });

  writeForm(coerceModel(storage.load()));
  update();
  return { readForm, writeForm, update };
}
