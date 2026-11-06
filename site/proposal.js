// @ts-check
/**
 * Pure logic for building Princeton Research Computing access requests.
 * No DOM access here, so everything is unit-testable.
 */

/**
 * @typedef {{ name: string, netid: string, external?: boolean }} Person
 * @typedef {{
 *   mode: 'proposal' | 'sponsor',
 *   systems: string[],
 *   otherSystem: string,
 *   systemDetails: string,
 *   sponsors: Person[],
 *   researchers: Person[],
 *   title: string,
 *   background: string,
 *   languages: string,
 *   parallelization: string,
 *   libraries: string,
 *   softwareNotes: string,
 *   cpuCores: string,
 *   cpuMemory: string,
 *   gpus: string,
 *   runTime: string,
 *   diskSpace: string,
 *   sharedStorage: string,
 *   duration: string,
 *   justification: string,
 *   references: string,
 *   groupAccess: string,
 *   notes: string,
 * }} Model
 * @typedef {{ type: 'table', rows: [string, string][], header?: [string, string] }
 *   | { type: 'paragraphs', items: string[] }
 *   | { type: 'list', items: string[] }} Block
 * @typedef {{ heading: string, blocks: Block[] }} Section
 * @typedef {{ title: string, subtitle: string, sections: Section[] }} ProposalDoc
 */

export const LARGE_CLUSTERS = ['Della', 'Stellar', 'Tiger'];
export const CSES_EMAIL = 'cses@princeton.edu';
export const MAX_PAGES = 3;

/** @type {Record<string, string>} */
export const HARDWARE_LINKS = {
  Della: 'https://researchcomputing.princeton.edu/systems/della#Hardware-Configuration',
  Stellar: 'https://researchcomputing.princeton.edu/systems/stellar',
  Tiger: 'https://researchcomputing.princeton.edu/systems/tiger',
};

/** @returns {Model} */
export function emptyModel() {
  return {
    mode: 'proposal',
    systems: ['Della'],
    otherSystem: '',
    systemDetails: '',
    sponsors: [{ name: '', netid: '' }],
    researchers: [{ name: '', netid: '', external: false }],
    title: '',
    background: '',
    languages: '',
    parallelization: '',
    libraries: '',
    softwareNotes: '',
    cpuCores: '',
    cpuMemory: '',
    gpus: '',
    runTime: '',
    diskSpace: '',
    sharedStorage: '',
    duration: '',
    justification: '',
    references: '',
    groupAccess: '',
    notes: '',
  };
}

/**
 * Merge untrusted JSON (e.g. an imported file or localStorage) into a valid model.
 * Unknown keys are dropped and every value is coerced to the expected type.
 * @param {unknown} raw
 * @returns {Model}
 */
export function coerceModel(raw) {
  const base = emptyModel();
  if (!raw || typeof raw !== 'object') return base;
  const r = /** @type {Record<string, unknown>} */ (raw);
  const str = (/** @type {unknown} */ v) => (typeof v === 'string' ? v.slice(0, 20000) : '');
  /** @param {unknown} v @returns {Person[]} */
  const people = (v) =>
    Array.isArray(v)
      ? v.slice(0, 50).map((p) => {
          const o = p && typeof p === 'object' ? /** @type {Record<string, unknown>} */ (p) : {};
          return { name: str(o.name), netid: str(o.netid), external: o.external === true };
        })
      : [];
  /** @type {Model} */
  const m = { ...base };
  for (const key of /** @type {(keyof Model)[]} */ (Object.keys(base))) {
    if (key === 'mode') m.mode = r.mode === 'sponsor' ? 'sponsor' : 'proposal';
    else if (key === 'systems')
      m.systems = Array.isArray(r.systems) ? r.systems.filter((s) => typeof s === 'string' && LARGE_CLUSTERS.includes(s)) : base.systems;
    else if (key === 'sponsors' || key === 'researchers') {
      const list = people(r[key]);
      m[key] = list.length ? list : base[key];
    } else m[key] = str(r[key]);
  }
  return m;
}

// ---------------------------------------------------------------- normalizers

/** Insert a space between a number and a storage unit: "256GB" -> "256 GB". @param {string} s */
export function normalizeUnits(s) {
  return s.replace(/(\d)\s*([KMGTP]B)\b/gi, (_, d, u) => `${d} ${u.toUpperCase()}`);
}

/** "2/4 * A100" -> "2–4 × A100". @param {string} s */
export function normalizeGpus(s) {
  return normalizeUnits(
    s
      .replace(/(\d+)\s*\/\s*(\d+)(?=\s*[*x×])/g, '$1–$2')
      .replace(/(\d)\s*[*x×]\s*(?=[A-Za-z])/g, '$1 × '),
  );
}

/** A bare "none" becomes "None." @param {string} s */
export function normalizeParallelization(s) {
  const t = s.trim();
  return /^(none|n\/a|na|no)\.?$/i.test(t) ? 'None.' : t;
}

/** @type {Record<string, string>} */
const LIBRARY_NAMES = {
  pytorch: 'PyTorch', torch: 'PyTorch', tensorflow: 'TensorFlow', jax: 'JAX', numpy: 'NumPy',
  scipy: 'SciPy', matplotlib: 'Matplotlib', cvxpy: 'CVXPY', mosek: 'MOSEK', gurobi: 'Gurobi',
  pandas: 'pandas', 'scikit-learn': 'scikit-learn', sklearn: 'scikit-learn', keras: 'Keras',
  mpi4py: 'mpi4py', openmpi: 'Open MPI', 'open mpi': 'Open MPI', cuda: 'CUDA', cudnn: 'cuDNN',
  hdf5: 'HDF5', netcdf: 'NetCDF', fftw: 'FFTW', petsc: 'PETSc', lammps: 'LAMMPS',
  gromacs: 'GROMACS', 'hugging face': 'Hugging Face', huggingface: 'Hugging Face',
  transformers: 'Transformers', xarray: 'xarray', dask: 'Dask', numba: 'Numba', cupy: 'CuPy',
  'pytorch lightning': 'PyTorch Lightning', mkl: 'MKL', lapack: 'LAPACK', blas: 'BLAS',
  eigen: 'Eigen', boost: 'Boost', openmp: 'OpenMP', mpi: 'MPI', jupyter: 'Jupyter',
};

/** @type {Record<string, string>} */
const LANGUAGE_NAMES = {
  python: 'Python', 'c++': 'C++', cpp: 'C++', c: 'C', fortran: 'Fortran', julia: 'Julia',
  r: 'R', matlab: 'MATLAB', cuda: 'CUDA', rust: 'Rust', java: 'Java', go: 'Go', bash: 'Bash',
  mathematica: 'Mathematica', stata: 'Stata', sql: 'SQL',
};

/**
 * Split a comma/semicolon/"and" separated list and apply canonical capitalization.
 * @param {string} s
 * @param {Record<string, string>} names
 */
function normalizeList(s, names) {
  const items = s
    .replace(/\s+and\s+/gi, ', ')
    .split(/[,;\n]/)
    .map((x) => x.trim().replace(/\.$/, '').trim())
    .filter(Boolean)
    .map((x) => names[x.toLowerCase()] ?? x);
  return [...new Set(items)].join(', ');
}

/** @param {string} s */
export const normalizeLibraries = (s) => normalizeList(s, LIBRARY_NAMES);
/** @param {string} s */
export const normalizeLanguages = (s) => normalizeList(s, LANGUAGE_NAMES);

/** @param {string} s */
const tidy = (s) => s.trim().replace(/[ \t]+/g, ' ');

/**
 * Apply all normalizations (the adjustments made by hand on earlier proposals).
 * @param {Model} m
 * @returns {Model}
 */
export function normalizeModel(m) {
  return {
    ...m,
    languages: normalizeLanguages(m.languages),
    libraries: normalizeLibraries(m.libraries),
    parallelization: normalizeParallelization(m.parallelization),
    cpuCores: tidy(m.cpuCores),
    cpuMemory: normalizeUnits(tidy(m.cpuMemory)),
    gpus: normalizeGpus(tidy(m.gpus)),
    runTime: tidy(m.runTime),
    diskSpace: normalizeUnits(tidy(m.diskSpace)),
    sharedStorage: normalizeUnits(tidy(m.sharedStorage)),
    sponsors: m.sponsors.map((p) => ({ ...p, name: tidy(p.name), netid: p.netid.trim().toLowerCase() })),
    researchers: m.researchers.map((p) => ({ ...p, name: tidy(p.name), netid: p.netid.trim().toLowerCase() })),
  };
}

// ---------------------------------------------------------------- formatting

/** @param {Person} p */
export function formatPerson(p) {
  if (p.external) return `${p.name} (RCU account requested)`;
  return p.netid ? `${p.name} (${p.netid})` : p.name;
}

/** @param {string[]} items */
export function joinAnd(items) {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** @param {Model} m */
export function selectedSystems(m) {
  const other = m.otherSystem.trim();
  return [...m.systems, ...(other ? [other] : [])];
}

const SMALL_WORDS = new Set(('a an the and but or nor for so yet as at by in of off on per to up via from into onto ' +
  'over with through upon vs versus').split(' '));

/**
 * Title-case a title: capitalize the first letter of each word except short
 * function words; words that already contain capitals and hyphenated tails are kept.
 * @param {string} title
 */
export function titleCase(title) {
  let startOfPhrase = true;
  return title
    .split(/(\s+)/)
    .map((word) => {
      if (/^\s+$/.test(word) || !word) return word;
      const bare = word.toLowerCase().replace(/[^a-z]/g, '');
      const keep = /[A-Z]/.test(word) || (!startOfPhrase && SMALL_WORDS.has(bare));
      const out = keep ? word : word.charAt(0).toUpperCase() + word.slice(1);
      startOfPhrase = /[:?!]$/.test(word);
      return out;
    })
    .join('');
}

/** Words that mark the start of a venue rather than an author surname. */
const VENUE_WORDS = /^(Transactions|Journal|Proceedings|Conference|Review|Reviews|Letters|Research|Science|Nature|Press|Symposium|Workshop|Annals|Communications|Physical|Advances)$/;
/** "CS Brito", "C. S. Brito", "TCY Chan", "R Lam et al." */
const AUTHOR_RE = /^((?:[A-Z]\.\s?){1,3}|[A-Z]{1,3})\s+([A-Z][a-z][A-Za-z'’-]*)(\s+et\s+al\.?)?$/;

/**
 * @param {string} seg
 * @returns {{ name: string, etAl: boolean } | null}
 */
function parseAuthor(seg) {
  const m = seg.trim().match(AUTHOR_RE);
  if (!m || VENUE_WORDS.test(m[2])) return null;
  const initials = m[1].replace(/[.\s]/g, '').split('').map((c) => `${c}.`).join(' ');
  return { name: `${initials} ${m[2]}`, etAl: Boolean(m[3]) };
}

/**
 * Format one free-form reference line. "Title -- Authors, Venue Year" becomes
 * Authors. “Title.” Venue, Year. Lines without " -- " are kept as written.
 * @param {string} line
 */
export function formatReference(line) {
  const t = line.trim().replace(/^(\[\d+\]|\d+[.)]|[-*•])\s*/, '');
  const parts = t.split(/\s+(?:--|—|–)\s+/);
  if (parts.length < 2) return t;
  const title = titleCase(parts[0].trim().replace(/[.,]$/, ''));
  let rest = parts.slice(1).join(', ').trim().replace(/\.$/, '');

  /** @type {string[]} */
  const authors = [];
  let etAl = false;
  while (rest && !etAl) {
    const m = rest.match(/^(.+?)(?:\s*,\s*(?:and\s+)?|\s+and\s+|$)/);
    if (!m) break;
    const segment = m[1];
    if (/^et\s+al\.?$/.test(segment.trim()) && authors.length) {
      etAl = true;
    } else {
      const a = parseAuthor(segment);
      if (!a) break;
      authors.push(a.name);
      etAl = a.etAl;
    }
    rest = rest.slice(m[0].length).trim();
  }

  const venue = rest.replace(/,?\s+((?:19|20)\d{2})$/, ', $1');
  if (!authors.length) return `“${title}.” ${venue}.`;
  const who = etAl ? `${authors[0]} et al.` : `${joinAnd(authors)}.`;
  return venue ? `${who} “${title}.” ${venue}.` : `${who} “${title}.”`;
}

/** @param {string} s */
export function splitParagraphs(s) {
  return s
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

/** @param {string} s */
export function splitLines(s) {
  return s.split('\n').map((l) => l.trim()).filter(Boolean);
}

const named = (/** @type {Person} */ p) => p.name.trim() !== '';

/** @param {string} s */
const countItems = (s) => s.split(',').filter((x) => x.trim()).length;

/**
 * Build the proposal as a structured document (rendered to HTML and Markdown).
 * Empty optional fields are omitted rather than shown as placeholders.
 * @param {Model} input
 * @returns {ProposalDoc}
 */
export function buildProposal(input) {
  const m = normalizeModel(input);
  const systems = selectedSystems(m);
  const sponsors = m.sponsors.filter(named);
  const researchers = m.researchers.filter(named);
  const details = tidy(m.systemDetails).replace(/^\((.*)\)$/, '$1');

  /** @type {[string, string][]} */
  const summary = [
    [systems.length > 1 ? 'Systems requested' : 'System requested', joinAnd(systems) + (details ? ` (${details})` : '')],
    [sponsors.length > 1 ? 'Sponsoring faculty members' : 'Sponsoring faculty member', sponsors.map(formatPerson).join('; ')],
    ['Researchers requiring accounts', researchers.map(formatPerson).join('; ')],
  ];
  if (m.sharedStorage) summary.push(['Shared storage', m.sharedStorage]);
  if (m.duration.trim()) summary.push(['Requested duration', tidy(m.duration)]);

  /** @type {[string, string][]} */
  const programming = [
    [countItems(m.languages) > 1 ? 'Programming languages' : 'Programming language', m.languages],
    ['Parallelization mechanism', m.parallelization],
    ['Required software libraries', m.libraries],
  ];

  /** @type {[string, string][]} */
  const resources = [
    ['CPU cores', m.cpuCores],
    ['CPU memory', m.cpuMemory],
    ['GPUs', m.gpus],
    ['Total run time', m.runTime],
    ['Total disk space', m.diskSpace],
  ];

  /** @type {Block[]} */
  const programmingBlocks = [{ type: 'table', rows: programming }];
  const softwareNotes = splitParagraphs(m.softwareNotes);
  if (softwareNotes.length) programmingBlocks.push({ type: 'paragraphs', items: softwareNotes });

  /** @type {Block[]} */
  const resourceBlocks = [{ type: 'table', rows: resources, header: ['Resource', 'Request'] }];
  const justification = splitParagraphs(m.justification);
  if (justification.length) resourceBlocks.push({ type: 'paragraphs', items: justification });

  /** @type {Section[]} */
  const sections = [
    { heading: 'Project Summary', blocks: [{ type: 'table', rows: summary }] },
    { heading: 'Scientific Background and Merit', blocks: [{ type: 'paragraphs', items: splitParagraphs(m.background) }] },
    { heading: 'Programming Approach', blocks: programmingBlocks },
    { heading: 'Resource Requirements', blocks: resourceBlocks },
  ];
  const refs = splitLines(m.references).map(formatReference);
  if (refs.length) sections.push({ heading: 'References', blocks: [{ type: 'list', items: refs }] });

  return {
    title: `${joinAnd(systems) || 'Cluster'} Cluster Access Proposal`,
    subtitle: tidy(m.title),
    sections,
  };
}

/**
 * Render a ProposalDoc to pandoc-flavored Markdown.
 * @param {ProposalDoc} doc
 */
export function toMarkdown(doc) {
  const esc = (/** @type {string} */ s) => s.replace(/\|/g, '\\|').replace(/"/g, '\\"');
  const out = ['---', `title: "${esc(doc.title)}"`];
  if (doc.subtitle) out.push(`subtitle: "${esc(doc.subtitle)}"`);
  out.push('---', '');
  doc.sections.forEach((sec, i) => {
    out.push(`## ${i + 1}. ${sec.heading}`, '');
    for (const b of sec.blocks) {
      if (b.type === 'table') {
        const cell = (/** @type {string} */ s) => s.replace(/\|/g, '\\|');
        out.push(b.header ? `| ${cell(b.header[0])} | ${cell(b.header[1])} |` : '| | |', '|---|---|');
        for (const [k, v] of b.rows) out.push(`| **${k.replace(/\|/g, '\\|')}** | ${v.replace(/\|/g, '\\|')} |`);
      } else if (b.type === 'paragraphs') {
        out.push(b.items.join('\n\n'));
      } else {
        b.items.forEach((item, j) => out.push(`${j + 1}. ${item}`));
      }
      out.push('');
    }
  });
  return out.join('\n');
}

/** Suggested PDF/Markdown file name. @param {Model} m */
export function fileBaseName(m) {
  const sys = selectedSystems(m).join('-') || 'cluster';
  const sponsor = m.sponsors.find(named);
  const last = sponsor ? sponsor.name.trim().split(/\s+/).pop() ?? '' : '';
  return [sys, 'access', m.mode === 'sponsor' ? 'request' : 'proposal', last]
    .filter(Boolean)
    .join('-')
    .replace(/[^A-Za-z0-9-]+/g, '')
    .toLowerCase();
}

// ---------------------------------------------------------------- validation

export const NETID_RE = /^[a-z][a-z0-9]{1,7}$/;

/**
 * @param {Model} input
 * @returns {{ field: string, message: string }[]}
 */
export function validate(input) {
  const m = normalizeModel(input);
  /** @type {{ field: string, message: string }[]} */
  const issues = [];
  const need = (/** @type {string} */ field, /** @type {string} */ value, /** @type {string} */ label) => {
    if (!value.trim()) issues.push({ field, message: `${label} is required.` });
  };

  if (!selectedSystems(m).length) issues.push({ field: 'systems', message: 'Select at least one system.' });

  const sponsors = m.sponsors.filter(named);
  if (!sponsors.length) issues.push({ field: 'sponsors', message: 'At least one sponsoring faculty member is required.' });
  for (const p of sponsors) {
    if (!NETID_RE.test(p.netid)) issues.push({ field: 'sponsors', message: `Sponsor “${p.name}” needs a valid Princeton NetID.` });
  }

  const researchers = m.researchers.filter(named);
  if (!researchers.length) issues.push({ field: 'researchers', message: 'List at least one researcher who needs an account.' });
  for (const p of researchers) {
    if (!p.external && !NETID_RE.test(p.netid)) {
      issues.push({ field: 'researchers', message: `“${p.name}” needs a valid NetID, or mark them as non-Princeton (RCU).` });
    }
  }

  if (m.mode === 'proposal') {
    need('background', m.background, 'Scientific background');
    need('languages', m.languages, 'Programming language(s)');
    need('parallelization', m.parallelization, 'Parallelization mechanism');
    need('libraries', m.libraries, 'Required software libraries');
    need('cpuCores', m.cpuCores, 'Number of CPU cores');
    need('cpuMemory', m.cpuMemory, 'CPU memory');
    need('gpus', m.gpus, 'GPUs (enter “None” if not needed)');
    need('runTime', m.runTime, 'Total run time');
    need('diskSpace', m.diskSpace, 'Total disk space');
    need('references', m.references, 'References');
  }
  return issues;
}

// ---------------------------------------------------------------- emails

/**
 * The email the faculty member sends to CSES to sponsor users on an existing project.
 * @param {Model} input
 * @returns {{ to: string, subject: string, body: string }}
 */
export function buildSponsorEmail(input) {
  const m = normalizeModel(input);
  const systems = joinAnd(selectedSystems(m)) || '[system]';
  const sponsors = m.sponsors.filter(named);
  const researchers = m.researchers.filter(named);
  const lines = [
    'Hello,',
    '',
    `I would like to sponsor the following ${researchers.length === 1 ? 'user' : 'users'} for ${researchers.length === 1 ? 'an account' : 'accounts'} on ${systems} under my group's approved project:`,
    '',
    ...researchers.map((p) =>
      p.external
        ? `- ${p.name} — no Princeton NetID; please create a Research Computer User (RCU) account, which I am sponsoring.`
        : `- ${formatPerson(p)}`,
    ),
  ];
  if (m.groupAccess.trim()) {
    lines.push('', `Please also grant ${researchers.length === 1 ? 'this user' : 'these users'} access to: ${tidy(m.groupAccess)}`);
  }
  if (m.notes.trim()) lines.push('', m.notes.trim());
  lines.push('', 'Thank you,', sponsors.map(formatPerson).join(', ') || '[faculty member]');
  const who = researchers.map((p) => p.name).join(', ') || 'new users';
  return { to: CSES_EMAIL, subject: `${systems} account request: ${who}`, body: lines.join('\n') };
}

/** @param {{ to: string, subject: string, body: string }} e */
export function mailtoHref(e) {
  return `mailto:${e.to}?subject=${encodeURIComponent(e.subject)}&body=${encodeURIComponent(e.body)}`;
}

/**
 * The questionnaire sent to a researcher; its labels are what parseReply() understands.
 * @param {Model} m
 */
export function buildResearcherTemplate(m) {
  const systems = selectedSystems(m);
  const sponsor = m.sponsors.find(named);
  const links = systems.filter((s) => HARDWARE_LINKS[s]).map((s) => HARDWARE_LINKS[s]);
  return [
    'Hi,',
    '',
    `To request ${joinAnd(systems) || 'cluster'} access${sponsor ? ` for ${sponsor.name.trim()}'s group` : ''}, please reply with the following. Keep each label and put your answer after its colon.`,
    '',
    'Project title (optional):',
    '',
    'The scientific background for your project including scientific merit of the proposed work:',
    '',
    'The programming approach for your project:',
    'Programming language(s):',
    'Parallelization mechanism (e.g., MPI or OpenMP, or None):',
    'Required software libraries:',
    '',
    'The resource requirements for your project:',
    'Number of CPU-cores:',
    'CPU memory:',
    `GPUs${links.length ? ` (${links.join(', ')})` : ''}:`,
    'Total run time:',
    'Total disk space:',
    '',
    'A few references or citations (one per line):',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------- reply parser

/** @type {[keyof Model, RegExp][]} */
const LABELS = [
  ['title', /^project title\b/i],
  ['background', /scientific background|^background\b/i],
  ['languages', /^programming languages?\b/i],
  ['parallelization', /^parallel/i],
  ['libraries', /software librar|^librar/i],
  ['cpuCores', /cpu[- ]?cores?|^(number of )?cores\b/i],
  ['cpuMemory', /cpu memory|^memory\b|^ram\b/i],
  ['gpus', /^gpus?\b/i],
  ['runTime', /run ?time|^wall/i],
  ['diskSpace', /disk space|^storage\b|^disk\b/i],
  ['justification', /^justification\b/i],
  ['references', /references|citations/i],
];

const SIGNOFF = /^(please let me know|let me know|thanks|thank you|best|regards|cheers|sincerely|warmly)\b/i;
const GREETING = /^(hi|hello|dear|hey)\b[^.]{0,60},?$/i;

/**
 * Parse a researcher's emailed reply into model fields. Quoted history
 * ("On ... wrote:" and ">" lines) and sign-offs are ignored.
 * @param {string} text
 * @returns {Partial<Model>}
 */
export function parseReply(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  /** @type {Record<string, string[]>} */
  const acc = {};
  /** @type {string | null} */
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\((?:see\s+)?https?:\/\/[^)]*\)/gi, '').trim();
    if (/^On\b.*\bwrote:\s*$/.test(line) || /^-{2,}\s*Original Message/i.test(line)) break;
    if (line.startsWith('>')) continue;
    if (SIGNOFF.test(line)) break;
    if (!current && GREETING.test(line)) continue;

    const labelMatch = line.match(/^(?:[-*•]\s*)?([^:]{2,100}?)\s*:\s*(.*)$/);
    if (labelMatch && !/^https?$/i.test(labelMatch[1])) {
      const label = labelMatch[1].trim();
      const hit = LABELS.find(([, re]) => re.test(label));
      if (hit) {
        current = hit[0];
        acc[current] = labelMatch[2] ? [labelMatch[2]] : [];
        continue;
      }
      if (!labelMatch[2]) {
        current = null; // a section header such as "The resource requirements for your project:"
        continue;
      }
    }
    if (current) acc[current].push(line);
  }

  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, vals] of Object.entries(acc)) {
    const value = vals.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (value) out[key] = value;
  }
  return /** @type {Partial<Model>} */ (out);
}
