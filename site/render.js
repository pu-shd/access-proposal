// @ts-check
/**
 * Render a ProposalDoc into a container element. All user text is inserted
 * with textContent, never innerHTML.
 */

/**
 * @param {import('./proposal.js').ProposalDoc} doc
 * @param {HTMLElement} container
 */
export function renderProposal(doc, container) {
  const d = container.ownerDocument;
  /**
   * @param {string} tag
   * @param {string} [cls]
   * @param {string} [text]
   */
  const el = (tag, cls, text) => {
    const e = d.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  container.replaceChildren();
  const header = el('header', 'tex-header');
  header.append(el('h1', 'tex-title', doc.title));
  if (doc.subtitle) header.append(el('p', 'tex-subtitle', doc.subtitle));
  container.append(header);

  doc.sections.forEach((section, i) => {
    const sec = el('section', 'tex-section');
    const h = el('h2');
    h.append(el('span', 'tex-secnum', String(i + 1)), d.createTextNode(section.heading));
    sec.append(h);
    for (const block of section.blocks) {
      if (block.type === 'table') {
        const table = el('table', 'tex-table');
        if (block.header) {
          const thead = el('thead');
          const tr = el('tr');
          for (const label of block.header) {
            const th = el('th', undefined, label);
            th.setAttribute('scope', 'col');
            tr.append(th);
          }
          thead.append(tr);
          table.append(thead);
        }
        const tbody = el('tbody');
        for (const [label, value] of block.rows) {
          const tr = el('tr');
          const th = el('th', undefined, label);
          th.setAttribute('scope', 'row');
          const td = el('td', value ? undefined : 'tex-missing', value || '—');
          tr.append(th, td);
          tbody.append(tr);
        }
        table.append(tbody);
        sec.append(table);
      } else if (block.type === 'paragraphs') {
        for (const p of block.items) sec.append(el('p', undefined, p));
      } else {
        const ol = el('ol', 'tex-refs');
        for (const item of block.items) ol.append(el('li', undefined, item));
        sec.append(ol);
      }
    }
    container.append(sec);
  });
}
