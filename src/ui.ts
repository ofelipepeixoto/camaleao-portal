type Child = Node | string | null | undefined | false;

/** All variable content goes through text nodes, never HTML interpolation. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) {
      node.append(typeof child === 'string' ? document.createTextNode(child) : child);
    }
  }
  return node;
}

export function button(label: string, className: string, action?: () => void): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  if (action) node.addEventListener('click', action);
  return node;
}

export type IconName = 'arrow' | 'plus' | 'grid' | 'clock' | 'logOut' | 'check' | 'close' | 'search' | 'file' | 'chevron' | 'shield' | 'queue' | 'spark' | 'calendar';
const paths: Record<IconName, string[]> = {
  arrow: ['M5 12h14', 'm13 6 6 6-6 6'],
  plus: ['M12 5v14', 'M5 12h14'],
  grid: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', 'M12 7v5l3 2'],
  logOut: ['M9 5H5v14h4', 'M9 12h11', 'm16 8 4 4-4 4'],
  check: ['m5 12 4 4L19 6'],
  close: ['m6 6 12 12', 'm6 18 12-12'],
  search: ['M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16', 'm17 17 4 4'],
  file: ['M14 3H5v18h14V8z', 'M14 3v5h5', 'M8 12h8', 'M8 16h5'],
  chevron: ['m6 9 6 6 6-6'],
  shield: ['m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6z', 'm8 11 3 3 5-5'],
  queue: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  spark: ['m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z'],
  calendar: ['M5 5h14v16H5z', 'M8 3v4', 'M16 3v4', 'M5 10h14'],
};

export function icon(name: IconName, className = ''): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `icon ${className}`);
  for (const d of paths[name]) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export function field(label: string, control: HTMLElement, help?: string): HTMLDivElement {
  const id = `field-${crypto.randomUUID()}`;
  control.id = id;
  const title = el('label', 'field-label', label);
  title.htmlFor = id;
  const group = el('div', 'field', title, control);
  if (help) {
    const hint = el('p', 'field-help', help);
    hint.id = `${id}-hint`;
    control.setAttribute('aria-describedby', hint.id);
    group.append(hint);
  }
  return group;
}

export function select(options: [string, string][], name: string, value = ''): HTMLSelectElement {
  const control = el('select', 'input');
  control.name = name;
  for (const [optionValue, label] of options) {
    const option = el('option', '', label);
    option.value = optionValue;
    control.append(option);
  }
  control.value = value;
  return control;
}

export function input(type: string, name: string, placeholder = ''): HTMLInputElement {
  const control = el('input', 'input');
  control.type = type;
  control.name = name;
  control.placeholder = placeholder;
  return control;
}

export function brandedName(): HTMLElement {
  return el('div', 'brand', el('span', 'brand-kicker', 'AGÊNCIA'), el('span', 'brand-name', 'camaleão', el('span', 'brand-dot', '.')));
}

export function modal(title: string, subtitle: string, body: HTMLElement, footer?: HTMLElement): {dialog: HTMLDialogElement; close: () => void} {
  const dialog = el('dialog', 'dialog');
  const titleId = `dialog-title-${crypto.randomUUID()}`;
  const heading = el('h2', 'dialog-title', title);
  heading.id = titleId;
  dialog.setAttribute('aria-labelledby', titleId);
  const closeButton = button('', 'icon-button');
  closeButton.setAttribute('aria-label', 'Fechar janela');
  closeButton.append(icon('close'));
  const header = el('header', 'dialog-header', el('div', '', heading, el('p', 'dialog-subtitle', subtitle)), closeButton);
  dialog.append(header, body);
  if (footer) dialog.append(footer);
  const previousFocus = document.activeElement;
  const close = () => {
    dialog.close();
    dialog.remove();
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
  };
  closeButton.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  document.body.append(dialog);
  dialog.showModal();
  return {dialog, close};
}
