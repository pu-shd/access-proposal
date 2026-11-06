import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  emptyModel, coerceModel, parseReply, buildProposal, toMarkdown, validate, buildSponsorEmail,
  mailtoHref, buildResearcherTemplate, normalizeUnits, normalizeGpus, normalizeParallelization,
  normalizeLibraries, normalizeLanguages, formatReference, formatPerson, joinAnd, fileBaseName,
  splitParagraphs,
} from '../site/proposal.js';

const reply = readFileSync(new URL('./fixtures/reply.txt', import.meta.url), 'utf8');

/** A complete, valid proposal model. */
function fullModel(overrides = {}) {
  return {
    ...emptyModel(),
    sponsors: [{ name: 'Pat Example', netid: 'pexample' }],
    researchers: [{ name: 'Sam Sample', netid: 'ssample', external: false }],
    ...parseReply(reply),
    ...overrides,
  };
}

/** @param {import('../site/proposal.js').ProposalDoc} doc */
const rowsOf = (doc, heading) => {
  const sec = doc.sections.find((s) => s.heading === heading);
  assert.ok(sec, `section ${heading} exists`);
  const table = sec.blocks.find((b) => b.type === 'table');
  assert.ok(table && table.type === 'table');
  return Object.fromEntries(table.rows);
};

test('normalizeUnits inserts a space and uppercases the unit', () => {
  assert.equal(normalizeUnits('256GB RAM'), '256 GB RAM');
  assert.equal(normalizeUnits('1tb'), '1 TB');
  assert.equal(normalizeUnits('100 GB'), '100 GB');
  assert.equal(normalizeUnits('no units'), 'no units');
});

test('normalizeGpus formats ranges and multiplication', () => {
  assert.equal(normalizeGpus('2/4 * A100'), '2–4 × A100');
  assert.equal(normalizeGpus('4x H100'), '4 × H100');
  assert.equal(normalizeGpus('None'), 'None');
});

test('normalizeParallelization turns a bare none into "None."', () => {
  for (const v of ['none', 'None', 'None.', ' n/a ', 'no']) assert.equal(normalizeParallelization(v), 'None.');
  assert.equal(normalizeParallelization('MPI'), 'MPI');
});

test('normalizeLibraries canonicalizes names, splits on "and", and dedupes', () => {
  assert.equal(
    normalizeLibraries('Pytorch, tensorflow, jax, matplotlib, cvxpy, mosek, numpy.'),
    'PyTorch, TensorFlow, JAX, Matplotlib, CVXPY, MOSEK, NumPy',
  );
  assert.equal(normalizeLibraries('torch and pytorch; SomeCustomLib'), 'PyTorch, SomeCustomLib');
  assert.equal(normalizeLanguages('python, c++'), 'Python, C++');
});

test('formatReference strips numbering and passes through unstructured lines', () => {
  assert.equal(
    formatReference('1. Imputing a convex objective function -- A Keshavarz, Y Wang, S Boyd, ISIC'),
    'A. Keshavarz, Y. Wang, and S. Boyd. “Imputing a Convex Objective Function.” ISIC.',
  );
  assert.equal(formatReference('[2] Plain citation, 2020.'), 'Plain citation, 2020.');
});

test('formatPerson and joinAnd', () => {
  assert.equal(formatPerson({ name: 'A B', netid: 'ab1' }), 'A B (ab1)');
  assert.equal(formatPerson({ name: 'Visitor', netid: '', external: true }), 'Visitor (RCU account requested)');
  assert.equal(joinAnd(['Della']), 'Della');
  assert.equal(joinAnd(['Della', 'Stellar']), 'Della and Stellar');
  assert.equal(joinAnd(['A', 'B', 'C']), 'A, B, and C');
});

test('splitParagraphs joins wrapped lines and splits on blank lines', () => {
  assert.deepEqual(splitParagraphs('one\ntwo\n\n three \n'), ['one two', 'three']);
});

test('parseReply extracts every field from a researcher email', () => {
  const p = parseReply(reply);
  assert.match(p.background ?? '', /^Coastal flooding forecasts/);
  assert.match(p.background ?? '', /storm surges: they must match tide-gauge records\.$/, 'colons inside prose stay in the paragraph');
  assert.equal(splitParagraphs(p.background ?? '').length, 2);
  assert.equal(p.languages, 'python, C++');
  assert.equal(p.parallelization, 'none');
  assert.equal(p.libraries, 'Pytorch, jax, numpy and mpi4py.');
  assert.equal(p.cpuCores, '32');
  assert.equal(p.cpuMemory, '128GB RAM');
  assert.equal(p.gpus, '2/4 * A100', 'the hardware URL in the label is ignored');
  assert.equal(p.runTime, '40 GPU hours per week');
  assert.equal(p.diskSpace, '2TB');
  assert.equal(splitLines(p.references).length, 2);
  assert.doesNotMatch(p.references ?? '', /Please let me know|Thanks|Sam/, 'sign-off is excluded');
  assert.doesNotMatch(JSON.stringify(p), /should not be parsed/, 'quoted history is excluded');
});

const splitLines = (/** @type {string | undefined} */ s) => (s ?? '').split('\n').filter((l) => l.trim());

test('parseReply returns nothing for unrelated text', () => {
  assert.deepEqual(parseReply('Hello there,\nJust checking in.\nThanks'), {});
});

test('parseReply accepts the questionnaire with labels on their own lines', () => {
  const p = parseReply(buildResearcherTemplate(emptyModel()).replace('Number of CPU-cores:', 'Number of CPU-cores: 8'));
  assert.deepEqual(p, { cpuCores: '8' });
});

test('buildProposal produces the expected document with normalized values', () => {
  const doc = buildProposal(fullModel());
  assert.equal(doc.title, 'Della Cluster Access Proposal');
  assert.equal(doc.subtitle, '');
  assert.deepEqual(doc.sections.map((s) => s.heading), [
    'Project Summary', 'Scientific Background and Merit', 'Programming Approach', 'Resource Requirements', 'References',
  ]);
  const summary = rowsOf(doc, 'Project Summary');
  assert.equal(summary['System requested'], 'Della');
  assert.equal(summary['Sponsoring faculty member'], 'Pat Example (pexample)');
  assert.equal(summary['Researchers requiring accounts'], 'Sam Sample (ssample)');
  assert.equal('Shared storage' in summary, false, 'empty optional rows are omitted');
  assert.equal('Requested duration' in summary, false, 'empty optional rows are omitted');

  const prog = rowsOf(doc, 'Programming Approach');
  assert.equal(prog['Programming languages'], 'Python, C++');
  assert.equal(prog['Parallelization mechanism'], 'None.');
  assert.equal(prog['Required software libraries'], 'PyTorch, JAX, NumPy, mpi4py');

  const res = rowsOf(doc, 'Resource Requirements');
  assert.deepEqual(res, {
    'CPU cores': '32', 'CPU memory': '128 GB RAM', GPUs: '2–4 × A100',
    'Total run time': '40 GPU hours per week', 'Total disk space': '2 TB',
  });
});

test('buildProposal includes optional rows, plural labels, and RCU researchers when given', () => {
  const doc = buildProposal(fullModel({
    systems: ['Della', 'Stellar'],
    title: '  Surrogates  for coastal flooding ',
    sponsors: [{ name: 'Pat Example', netid: 'pexample' }, { name: 'Lee Other', netid: 'lother' }],
    researchers: [{ name: 'Sam Sample', netid: 'SSample' }, { name: 'Guest Person', netid: '', external: true }, { name: '', netid: '' }],
    sharedStorage: '1TB',
    duration: '12 months',
    justification: 'Because.',
    languages: 'Python',
  }));
  assert.equal(doc.title, 'Della and Stellar Cluster Access Proposal');
  assert.equal(doc.subtitle, 'Surrogates for coastal flooding');
  const summary = rowsOf(doc, 'Project Summary');
  assert.equal(summary['Systems requested'], 'Della and Stellar');
  assert.equal(summary['Sponsoring faculty members'], 'Pat Example (pexample); Lee Other (lother)');
  assert.equal(summary['Researchers requiring accounts'], 'Sam Sample (ssample); Guest Person (RCU account requested)');
  assert.equal(summary['Shared storage'], '1 TB');
  assert.equal(summary['Requested duration'], '12 months');
  assert.equal(rowsOf(doc, 'Programming Approach')['Programming language'], 'Python');
  const resources = doc.sections.find((s) => s.heading === 'Resource Requirements');
  assert.deepEqual(resources?.blocks[1], { type: 'paragraphs', items: ['Because.'] });
});

test('buildProposal omits References when none are given', () => {
  const doc = buildProposal(fullModel({ references: '' }));
  assert.equal(doc.sections.some((s) => s.heading === 'References'), false);
});

test('toMarkdown renders numbered sections, tables, and escapes pipes', () => {
  const md = toMarkdown(buildProposal(fullModel({ title: 'A "quoted" | title', cpuCores: '16 | 32' })));
  assert.match(md, /^---\ntitle: "Della Cluster Access Proposal"\nsubtitle: "A \\"quoted\\" \\| title"\n---/);
  assert.match(md, /^## 1\. Project Summary$/m);
  assert.match(md, /^## 5\. References$/m);
  assert.match(md, /^\| \*\*CPU cores\*\* \| 16 \\\| 32 \|$/m);
  assert.match(md, /^1\. R\. Lam et al\. “Learning Skillful Medium-range Global Weather Forecasting\.” Science, 2023\.$/m);
});

test('validate reports nothing for a complete proposal', () => {
  assert.deepEqual(validate(fullModel()), []);
});

test('validate reports each missing required field', () => {
  const issues = validate({ ...emptyModel(), systems: [] });
  const fields = issues.map((i) => i.field);
  for (const f of ['systems', 'sponsors', 'researchers', 'background', 'languages', 'parallelization', 'libraries',
    'cpuCores', 'cpuMemory', 'gpus', 'runTime', 'diskSpace', 'references']) {
    assert.ok(fields.includes(f), `missing ${f} is reported`);
  }
});

test('validate checks NetIDs but allows non-Princeton researchers without one', () => {
  const bad = validate(fullModel({ researchers: [{ name: 'X Y', netid: 'not a netid!' }] }));
  assert.equal(bad.length, 1);
  assert.match(bad[0].message, /valid NetID/);
  assert.deepEqual(validate(fullModel({ researchers: [{ name: 'X Y', netid: '', external: true }] })), []);
  assert.equal(validate(fullModel({ sponsors: [{ name: 'Prof', netid: '' }] }))[0].field, 'sponsors');
});

test('validate in sponsor mode does not require proposal sections', () => {
  const m = { ...emptyModel(), mode: 'sponsor', sponsors: [{ name: 'Pat Example', netid: 'pexample' }],
    researchers: [{ name: 'Sam Sample', netid: 'ssample' }] };
  assert.deepEqual(validate(m), []);
});

test('buildSponsorEmail addresses CSES and lists users, RCU requests, and access', () => {
  const e = buildSponsorEmail({
    ...emptyModel(), mode: 'sponsor', systems: ['Stellar'],
    sponsors: [{ name: 'Pat Example', netid: 'pexample' }],
    researchers: [{ name: 'Sam Sample', netid: 'ssample' }, { name: 'Guest Person', netid: '', external: true }],
    groupAccess: '/projects/EXAMPLE', notes: 'Starting next month.',
  });
  assert.equal(e.to, 'cses@princeton.edu');
  assert.equal(e.subject, 'Stellar account request: Sam Sample, Guest Person');
  assert.match(e.body, /following users for accounts on Stellar/);
  assert.match(e.body, /^- Sam Sample \(ssample\)$/m);
  assert.match(e.body, /^- Guest Person — no Princeton NetID; please create a Research Computer User \(RCU\) account/m);
  assert.match(e.body, /access to: \/projects\/EXAMPLE/);
  assert.match(e.body, /Starting next month\./);
  assert.match(e.body, /Thank you,\nPat Example \(pexample\)$/);
});

test('mailtoHref percent-encodes subject and body', () => {
  const href = mailtoHref({ to: 'cses@princeton.edu', subject: 'a & b', body: 'line1\nline2?' });
  assert.equal(href, 'mailto:cses@princeton.edu?subject=a%20%26%20b&body=line1%0Aline2%3F');
});

test('buildResearcherTemplate links hardware pages for selected systems and names the PI', () => {
  const t = buildResearcherTemplate({ ...emptyModel(), systems: ['Della', 'Tiger'], sponsors: [{ name: 'Pat Example', netid: 'pexample' }] });
  assert.match(t, /Della and Tiger access for Pat Example's group/);
  assert.match(t, /systems\/della#Hardware-Configuration, https:\/\/researchcomputing\.princeton\.edu\/systems\/tiger/);
});

test('coerceModel drops unknown keys, wrong types, and unknown systems', () => {
  const m = coerceModel({ mode: 'evil', systems: ['Della', 'Nope', 5], background: 42, extra: 'x',
    researchers: [{ name: 'A', netid: 'a1', external: 'yes' }, null] });
  assert.equal(m.mode, 'proposal');
  assert.deepEqual(m.systems, ['Della']);
  assert.equal(m.background, '');
  assert.equal('extra' in m, false);
  assert.deepEqual(m.researchers, [{ name: 'A', netid: 'a1', external: false }, { name: '', netid: '', external: false }]);
  assert.deepEqual(coerceModel(null), emptyModel());
  assert.deepEqual(coerceModel('junk'), emptyModel());
});

test('fileBaseName uses systems, request type, and sponsor surname', () => {
  assert.equal(fileBaseName(fullModel()), 'della-access-proposal-example');
  assert.equal(fileBaseName({ ...emptyModel(), mode: 'sponsor', systems: [] }), 'cluster-access-request');
});

test('optional system details are shown after the system name', () => {
  const summary = rowsOf(buildProposal(fullModel({ systemDetails: ' GPU partition,  NVIDIA A100 ' })), 'Project Summary');
  assert.equal(summary['System requested'], 'Della (GPU partition, NVIDIA A100)');
  assert.equal(rowsOf(buildProposal(fullModel()), 'Project Summary')['System requested'], 'Della');
});

test('optional software notes follow the programming table', () => {
  const doc = buildProposal(fullModel({ softwareNotes: 'Conda environments.\n\nMOSEK academic license.' }));
  const sec = doc.sections.find((s) => s.heading === 'Programming Approach');
  assert.deepEqual(sec?.blocks[1], { type: 'paragraphs', items: ['Conda environments.', 'MOSEK academic license.'] });
  assert.equal(buildProposal(fullModel()).sections.find((s) => s.heading === 'Programming Approach')?.blocks.length, 1);
});

test('the resource table has a Resource | Request header row', () => {
  const sec = buildProposal(fullModel()).sections.find((s) => s.heading === 'Resource Requirements');
  const table = sec?.blocks[0];
  assert.ok(table && table.type === 'table');
  assert.deepEqual(table.header, ['Resource', 'Request']);
  assert.match(toMarkdown(buildProposal(fullModel())), /^\| Resource \| Request \|\n\|---\|---\|\n\| \*\*CPU cores\*\*/m);
});

test('formatReference puts authors first with expanded initials and a title-cased title', () => {
  assert.equal(
    formatReference('Cross-regularization: Adaptive Model Complexity through Validation Gradients -- CS Brito, ICML 2025'),
    'C. S. Brito. “Cross-regularization: Adaptive Model Complexity through Validation Gradients.” ICML, 2025.',
  );
  assert.equal(
    formatReference('Imputing a convex objective function -- A Keshavarz, Y Wang, S Boyd, IEEE International Symposium on Intelligent Control'),
    'A. Keshavarz, Y. Wang, and S. Boyd. “Imputing a Convex Objective Function.” IEEE International Symposium on Intelligent Control.',
  );
  assert.equal(
    formatReference('Inverse optimization: Theory and applications -- TCY Chan, R Mahmood, IY Zhu, Operations Research'),
    'T. C. Y. Chan, R. Mahmood, and I. Y. Zhu. “Inverse Optimization: Theory and Applications.” Operations Research.',
  );
  assert.equal(
    formatReference('Learning skillful medium-range global weather forecasting -- R Lam et al., Science 2023'),
    'R. Lam et al. “Learning Skillful Medium-range Global Weather Forecasting.” Science, 2023.',
  );
  assert.equal(formatReference('A study -- J. Q. Public and J Doe, Nature 2020'), 'J. Q. Public and J. Doe. “A Study.” Nature, 2020.');
});

test('formatReference falls back to title-first when no authors are recognizable', () => {
  assert.equal(formatReference('Some report -- National Lab internal'), '“Some Report.” National Lab internal.');
});
