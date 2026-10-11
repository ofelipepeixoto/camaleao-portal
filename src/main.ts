import { gateway, isDemo } from './gateway';
import type { Membership, PortalRequest, RequestPayload, User } from './model';
import { brandedName, button, el, field, icon, input, modal, select } from './ui';
import './styles.css';
import { openDeliveryDialog, clearDeliveryDrafts } from './delivery-ui';
import { DemoGateway, DEMO_EXAMPLE_ID } from './demo-gateway';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Elemento principal indisponível.');

const categories: Record<string, string> = {
  peca_social: 'Peça social', campanha: 'Campanha', site: 'Site', automacao: 'Automação',
};
const goals: [string, string][] = [
  ['', 'Selecione o objetivo'],
  ['divulgar_servico', 'Divulgar um serviço ou produto'],
  ['gerar_oportunidades', 'Gerar oportunidades de negócio'],
  ['fortalecer_marca', 'Fortalecer a marca'],
  ['melhorar_experiencia', 'Melhorar a experiência do cliente'],
  ['organizar_operacao', 'Organizar ou automatizar a operação'],
  ['outro', 'Outro objetivo, descrito no contexto'],
];
const channels: [string, string][] = [
  ['', 'Selecione, se aplicável'], ['instagram', 'Instagram'], ['facebook', 'Facebook'],
  ['linkedin', 'LinkedIn'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'],
  ['site', 'Site'], ['interno', 'Operação interna'], ['outro', 'Outro, descrito no contexto'],
];
const formatOptions: [string, string][] = [
  ['', 'Selecione, se aplicável'], ['post', 'Post'], ['carrossel', 'Carrossel'],
  ['stories', 'Stories'], ['video', 'Vídeo'], ['landing_page', 'Landing page'],
  ['site_institucional', 'Site institucional'], ['fluxo', 'Fluxo de automação'],
  ['outro', 'Outro, descrito no contexto'],
];
const goalLabels = new Map(goals);
const channelLabels = new Map(channels);
const formatLabels = new Map(formatOptions);
const dateFormat = new Intl.DateTimeFormat('pt-BR', {day: '2-digit', month: 'short', year: 'numeric'});
const shortDateFormat = new Intl.DateTimeFormat('pt-BR', {day: '2-digit', month: 'short'});

type View = 'requests' | 'history' | 'queue';
let user: User | null = null;
let memberships: Membership[] = [];
let organizationId = '';
let requests: PortalRequest[] = [];
let currentView: View = 'requests';
let sessionEpoch = 0;
let refreshEpoch = 0;
let loading = false;
let pageError = '';
let notice = '';
let categoryFilter = '';
let statusFilter = '';
let query = '';
let openDialog: HTMLDialogElement | null = null;
let lastUpdate: Date | null = null;
const uncertainDrafts = new Map<string, {requestId: string; payload: RequestPayload}>();

function date(value: string | null | undefined, short = false): string {
  if (!value) return 'Sem prazo indicado';
  // Date-only deadlines should not shift to the previous day in Brazilian time zones.
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return 'Data indisponível';
  return (short ? shortDateFormat : dateFormat).format(parsed);
}

function displayError(error: unknown): string {
  const code = errorCode(error);
  if (['IDEMPOTENCY_CONFLICT', '23505', 'conflict'].includes(code)) return 'Este envio já foi registrado com dados diferentes. Feche a janela e inicie um novo pedido.';
  if (['RATE_LIMIT', '429', 'limit'].includes(code)) return 'O limite de pedidos foi atingido. Aguarde um pouco ou fale com a equipe.';
  if (['INVALID_INPUT', '22023', 'validation'].includes(code)) return 'Confira os campos do pedido e tente novamente.';
  if (isAccessError(error)) return 'Seu acesso precisa ser confirmado. Entre novamente para continuar.';
  return 'Não foi possível confirmar a operação. Confira sua conexão e tente novamente.';
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return String(record.code ?? record.status ?? '');
  }
  return '';
}

function isAccessError(error: unknown): boolean {
  const code = errorCode(error);
  return ['401', '403', '42501', 'AUTH_REQUIRED', 'FORBIDDEN', 'MEMBERSHIP_REVOKED', 'SESSION_EXPIRED', 'access_denied'].includes(code);
}

function currentMembership(): Membership | undefined {
  return memberships.find((membership) => membership.organizationId === organizationId);
}

function dismissDialog(): void {
  if (openDialog) {
    openDialog.close();
    openDialog.remove();
    openDialog = null;
  }
}

function clearPrivateState(): void {
  ++sessionEpoch;
  ++refreshEpoch;
  memberships = [];
  organizationId = '';
  requests = [];
  lastUpdate = null;
  query = '';
  categoryFilter = '';
  statusFilter = '';
  uncertainDrafts.clear();
  clearDeliveryDrafts();
  dismissDialog();
}

function statusBadge(status: string): HTMLElement {
  const label = status === 'em_triagem' ? 'Em triagem' : 'Recebido';
  return el('span', `status status-${status === 'em_triagem' ? 'triage' : 'received'}`, el('span', 'status-dot'), label);
}

function demoBanner(): HTMLElement | null {
  if (!isDemo) return null;
  const banner = el('aside', 'demo-banner', icon('shield'), el('span', '', el('strong', '', 'Demonstração local'), ' · dados fictícios · sem autenticação segura'));
  banner.setAttribute('aria-label', 'Demonstração local');
  return banner;
}

function loadingScreen(): void {
  app!.replaceChildren(demoBanner() ?? document.createTextNode(''), el('main', 'loading-screen', brandedName(), el('span', 'spinner'), el('p', '', 'Preparando sua área…')));
  app!.setAttribute('aria-busy', 'true');
}

function loginScreen(message = ''): void {
  app!.removeAttribute('aria-busy');
  const form = el('form', 'login-form');
  const email = input('email', 'email', 'voce@empresa.com.br');
  email.required = true;
  email.maxLength = 254;
  email.autocomplete = 'username';
  const password = input('password', 'password', 'Sua senha');
  password.required = true;
  password.autocomplete = 'current-password';
  const feedback = el('p', 'form-feedback');
  const loginStatus = el('p', 'muted');
  loginStatus.setAttribute('role', 'status');
  feedback.setAttribute('role', 'alert');
  feedback.textContent = message;
  feedback.hidden = !message;
  const submit = button('Entrar no portal', 'button button-primary');
  submit.type = 'submit';
  submit.append(icon('arrow'));
  form.append(field('E-mail', email), field('Senha', password), loginStatus, feedback, submit);
  let loginPending = false;
  const action = async (loginEmail: string, loginPassword: string, example = false) => {
    if (loginPending) return;
    loginPending = true;
    submit.disabled = true;
    submit.textContent = 'Confirmando acesso…';
    feedback.hidden = true;
    loginStatus.textContent = example ? 'Preparando o exemplo fictício…' : 'Confirmando acesso…';
    for (const control of login.querySelectorAll('button')) control.disabled = true;
    try {
      if (example && isDemo && gateway instanceof DemoGateway) await gateway.prepareExample();
      const signedIn = await gateway.signIn(loginEmail, loginPassword);
      if (!user || user.id !== signedIn.id) await changeSession(signedIn);
      if (example && isDemo) {
        await refresh();
        const request = requests.find(r => r.id === DEMO_EXAMPLE_ID);
        if (request && user?.id === signedIn.id) deliveriesDialog(request);
      }
    } catch {
      feedback.textContent = isDemo ? 'Não foi possível abrir a demonstração. Verifique se o navegador permite salvar dados locais e tente novamente.' : 'Não foi possível entrar. Confira seu e-mail e sua senha e tente novamente.';
      feedback.hidden = false;
      submit.disabled = false;
      submit.replaceChildren('Entrar no portal', icon('arrow'));
    } finally {
      loginPending = false;
      loginStatus.textContent = '';
      for (const control of login.querySelectorAll('button')) control.disabled = false;
    }
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (form.reportValidity()) void action(email.value.trim(), password.value);
  });

  const welcome = el('section', 'login-story',
    brandedName(),
    el('div', 'login-story-content',
      el('span', 'eyebrow', el('span', 'tiny-dot'), 'ÁREA DO CLIENTE'),
      el('h1', '', 'Boas ideias.', el('br'), 'Próximos passos ', el('em', '', 'claros.')),
      el('p', 'login-story-lead', 'Do primeiro pedido ao acompanhamento: um lugar para fazer seu projeto avançar junto com a Camaleão.'),
      el('div', 'story-note', icon('file'), el('div', '', el('strong', '', 'Menos mensagens espalhadas.'), el('span', '', 'Mais contexto, organização e clareza.'))),
    ),
    el('div', 'login-story-footer', el('span', '', 'AGÊNCIA CAMALEÃO'), el('span', '', 'Estratégia. Criação. Tecnologia.')),
  );
  const login = el('section', 'login-panel',
    el('div', 'login-panel-inner',
      el('span', 'eyebrow muted', 'PORTAL CAMALEÃO'),
      el('h2', '', 'Que bom ter você aqui.'),
      el('p', 'muted login-description', 'Entre com o acesso enviado pela equipe para acompanhar seus pedidos.'),
      form,
      el('p', 'login-invite-note', icon('shield'), 'O acesso é por convite. Precisa de ajuda? Fale com a equipe Camaleão pelo seu canal habitual.'),
    ),
    el('p', 'login-footnote', 'Seu projeto, em boa companhia.'),
  );
  if (isDemo) {
    const guide = el('section', 'demo-guide', el('h3', '', 'Do contexto à decisão'),
      el('p', '', 'Roteiro de 90 segundos: leia um pedido e uma versão já preparados, revise o texto e registre uma decisão fictícia.'),
      button('Revisar exemplo fictício', 'button button-primary', () => { void action('aurora@exemplo.test', 'demo-only', true); }),
      el('p', 'muted', 'Só neste navegador. Sem envio, IA ou automação. Suas decisões de demonstração serão preservadas.'));
    form.before(guide);
    guide.append(loginStatus, feedback);
    form.hidden = true;
    login.querySelector('.login-description')!.textContent = 'Experimente o papel do cliente em um cenário fictício. Não use dados reais.';
    login.querySelector('.login-invite-note')!.textContent = 'Para um piloto com clientes reais, acesso e integrações ainda precisam de homologação.';
    const demos = el('div', 'demo-login', el('p', '', 'Explore com uma identidade fictícia:'),
      button('Cliente Aurora', 'button button-soft', () => { void action('aurora@exemplo.test', 'demo-only'); }),
      button('Cliente Horizonte', 'button button-soft', () => { void action('horizonte@exemplo.test', 'demo-only'); }),
      button('Equipe Camaleão', 'button button-soft', () => { void action('equipe@exemplo.test', 'demo-only'); }),
    );
    form.after(demos);
  }
  app!.replaceChildren(demoBanner() ?? document.createTextNode(''), el('main', 'login-layout', welcome, login));
}

async function changeSession(nextUser: User | null): Promise<void> {
  clearPrivateState();
  user = nextUser;
  pageError = '';
  notice = '';
  loading = false;
  if (!user) {
    loginScreen();
    return;
  }
  currentView = 'requests';
  renderPortal();
  await refresh();
}

async function invalidateAccess(): Promise<void> {
  clearPrivateState();
  user = null;
  loading = false;
  loginScreen('Seu acesso foi encerrado ou mudou. Entre novamente para continuar.');
  try { await gateway.signOut(); } catch { /* Local private state is already cleared. */ }
}

async function refresh(): Promise<void> {
  if (!user) return;
  const epoch = sessionEpoch;
  const sequence = ++refreshEpoch;
  loading = true;
  pageError = '';
  renderPortal();
  try {
    // Revalidate membership on every refresh; an old organization selector is not authorization.
    const allowed = await gateway.memberships();
    if (epoch !== sessionEpoch || sequence !== refreshEpoch || !user) return;
    memberships = allowed;
    if (!allowed.length) {
      uncertainDrafts.clear();
      clearDeliveryDrafts();
      requests = [];
      organizationId = '';
      dismissDialog();
      loading = false;
      renderPortal();
      return;
    }
    if (organizationId && !allowed.some((membership) => membership.organizationId === organizationId)) {
      uncertainDrafts.clear();
      clearDeliveryDrafts();
      requests = [];
      organizationId = '';
      dismissDialog();
      notice = 'Seu acesso a uma organização mudou. Exibimos apenas as organizações disponíveis agora.';
    }
    if (!organizationId) organizationId = allowed[0].organizationId;
    const nextRequests = await gateway.listRequests(organizationId);
    if (epoch !== sessionEpoch || sequence !== refreshEpoch || !user) return;
    requests = nextRequests;
    if (currentMembership()?.role !== 'operator' && currentView === 'queue') currentView = 'requests';
    lastUpdate = new Date();
  } catch (error) {
    if (epoch !== sessionEpoch || sequence !== refreshEpoch) return;
    requests = [];
    dismissDialog();
    if (isAccessError(error)) {
      await invalidateAccess();
      return;
    }
    pageError = 'Não conseguimos carregar seus pedidos. Os dados anteriores foram retirados da tela. Tente atualizar novamente.';
  } finally {
    if (epoch === sessionEpoch && sequence === refreshEpoch && user) {
      loading = false;
      renderPortal();
    }
  }
}

function navItem(label: string, target: View, iconName: 'grid' | 'clock' | 'queue', count?: number): HTMLElement {
  const item = button('', `nav-item ${currentView === target ? 'active' : ''}`, () => {
    currentView = target;
    query = '';
    categoryFilter = '';
    statusFilter = '';
    renderPortal();
  });
  item.append(icon(iconName), el('span', '', label));
  if (count !== undefined) item.append(el('span', 'nav-count', String(count)));
  if (currentView === target) item.setAttribute('aria-current', 'page');
  return item;
}

function sidebar(): HTMLElement {
  const organization = currentMembership();
  const nav = el('nav', 'sidebar-nav', el('p', 'nav-caption', 'SEU ESPAÇO'), navItem('Meus pedidos', 'requests', 'grid', requests.length), navItem('Histórico', 'history', 'clock'));
  nav.setAttribute('aria-label', 'Áreas do portal');
  if (organization?.role === 'operator') {
    nav.append(el('p', 'nav-caption team-caption', 'EQUIPE'), navItem('Fila de triagem', 'queue', 'queue', requests.filter((request) => request.status === 'recebido').length));
  }
  const future = el('div', 'future-card', el('div', 'future-icon', icon('spark')), el('strong', '', 'Entregas e decisões'), el('p', '', 'Abra um pedido para revisar a versão apresentada pela equipe, aprovar ou pedir ajustes.'));
  const logout = button('', 'logout-button', () => { void logoutSession(); });
  logout.append(icon('logOut'), 'Sair da conta');
  const email = user?.email || 'Acesso por convite';
  const aside = el('aside', 'sidebar',
    el('div', 'sidebar-brand', brandedName(), el('span', 'portal-label', 'PORTAL DO CLIENTE')),
    nav,
    future,
    el('div', 'sidebar-account', el('div', 'account-avatar', email.charAt(0).toUpperCase()), el('div', 'account-info', el('strong', '', organization?.role === 'operator' ? 'Equipe Camaleão' : 'Sua conta'), el('span', 'account-email', email)), logout),
  );
  aside.setAttribute('aria-label', 'Navegação e conta');
  return aside;
}

async function logoutSession(): Promise<void> {
  clearPrivateState();
  user = null;
  loading = false;
  loginScreen();
  try { await gateway.signOut(); } catch {
    loginScreen('A tela foi limpa, mas não foi possível confirmar a saída no serviço. Feche o navegador e tente novamente antes de trocar de conta.');
  }
}

function organizationPicker(): HTMLElement {
  if (!memberships.length) return el('span', 'organization-tag', 'Acesso por convite');
  const current = currentMembership();
  if (memberships.length === 1) return el('span', 'organization-tag', el('span', 'organization-avatar', (current?.organizationName || 'C').charAt(0)), current?.organizationName || 'Organização');
  const control = select(memberships.map((membership) => [membership.organizationId, membership.organizationName]), 'organization', organizationId);
  control.className = 'organization-select';
  control.setAttribute('aria-label', 'Selecionar organização');
  control.addEventListener('change', () => {
    ++refreshEpoch;
    uncertainDrafts.clear();
    clearDeliveryDrafts();
    requests = [];
    dismissDialog();
    organizationId = control.value;
    query = '';
    categoryFilter = '';
    statusFilter = '';
    void refresh();
  });
  return el('div', 'organization-picker', control, icon('chevron'));
}

function stats(): HTMLElement {
  const received = requests.filter((request) => request.status === 'recebido').length;
  const triage = requests.filter((request) => request.status === 'em_triagem').length;
  const cards: [string, number, string, 'file' | 'clock' | 'queue'][] = [
    ['Pedidos recentes', requests.length, 'Tudo organizado em um só lugar', 'file'],
    ['Recebidos', received, 'Aguardando a primeira análise', 'clock'],
    ['Em triagem', triage, 'A equipe está organizando o pedido', 'queue'],
  ];
  return el('section', 'stats', ...cards.map(([label, value, hint, glyph], index) => el('div', `stat-card ${index === 0 ? 'stat-featured' : ''}`, el('div', 'stat-top', el('span', '', label), icon(glyph)), el('strong', 'stat-number', loading ? '—' : String(value).padStart(2, '0')), el('span', 'stat-hint', hint))));
}

function renderPortal(): void {
  if (!user) return;
  const activeControl = document.activeElement;
  const focusedName = activeControl instanceof HTMLInputElement || activeControl instanceof HTMLSelectElement ? activeControl.name : '';
  const selection = activeControl instanceof HTMLInputElement && activeControl.type === 'search' ? [activeControl.selectionStart, activeControl.selectionEnd] : null;
  app!.removeAttribute('aria-busy');
  const isOperator = currentMembership()?.role === 'operator';
  const action = button('', `button ${isOperator && currentView === 'queue' ? 'button-soft' : 'button-primary'}`, () => {
    if (isOperator && currentView === 'queue') void refresh(); else createRequestDialog();
  });
  action.append(icon(isOperator && currentView === 'queue' ? 'queue' : 'plus'), isOperator && currentView === 'queue' ? 'Atualizar fila' : 'Novo pedido');
  action.disabled = !organizationId || loading;
  const topbar = el('header', 'topbar', el('div', 'breadcrumb', el('span', '', 'Portal Camaleão'), el('span', 'breadcrumb-slash', '/'), el('strong', '', currentView === 'history' ? 'Histórico' : currentView === 'queue' ? 'Triagem' : 'Meus pedidos')), organizationPicker());
  const heading = currentView === 'history' ? 'Cada passo, registrado.' : currentView === 'queue' ? 'Contexto antes de começar.' : 'Vamos tirar ideias do papel.';
  const lead = currentView === 'history' ? 'Consulte a criação e a última atualização dos seus pedidos.' : currentView === 'queue' ? 'Veja o que chegou e acompanhe a triagem manual da equipe.' : 'Crie seu próximo pedido e acompanhe o que acontece com ele.';
  const intro = el('section', 'page-intro', el('div', '', el('span', 'eyebrow', currentView === 'queue' ? 'ÁREA DA EQUIPE' : 'SEU PROJETO, EM MOVIMENTO'), el('h1', '', heading), el('p', 'muted', lead)), action);
  const content = el('div', 'page-content', intro);
  if (notice) {
    const notification = el('div', 'notice success-notice', icon('check'), el('span', '', notice));
    notification.setAttribute('role', 'status');
    const dismiss = button('', 'icon-button', () => { notice = ''; renderPortal(); });
    dismiss.setAttribute('aria-label', 'Fechar aviso');
    dismiss.append(icon('close'));
    notification.append(dismiss);
    content.append(notification);
  }
  if (!memberships.length && !loading) {
    content.append(el('section', 'empty-state no-access', icon('shield'), el('h2', '', 'Seu acesso ainda não está vinculado.'), el('p', '', 'Peça à equipe Camaleão para confirmar o convite e a organização da sua conta.'), button('Verificar novamente', 'button button-soft', () => { void refresh(); })));
  } else if (pageError) {
    const error = el('section', 'empty-state error-state', icon('shield'), el('h2', '', 'Vamos tentar novamente?'), el('p', '', pageError), button('Atualizar pedidos', 'button button-soft', () => { void refresh(); }));
    error.setAttribute('role', 'alert');
    content.append(error);
  } else {
    if (currentView !== 'history') content.append(stats());
    if (currentView === 'queue') content.append(el('div', 'notice queue-note', icon('queue'), el('span', '', el('strong', '', 'Triagem manual nesta entrega. '), 'O n8n processa os pedidos somente quando a equipe executa o workflow. Esta tela consulta a fila; não ativa automações.')));
    content.append(currentView === 'history' ? historyPanel() : requestsPanel());
  }
  const footer = el('footer', 'page-footer', el('span', '', 'Agência Camaleão · Primeira entrega do portal'), el('span', '', lastUpdate ? `Atualizado às ${lastUpdate.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}` : 'Acompanhamento de pedidos'));
  const main = el('main', 'main-area', topbar, content, footer);
  main.id = 'conteudo';
  main.tabIndex = -1;
  const skip = el('a', 'skip-link', 'Ir para o conteúdo');
  skip.href = '#conteudo';
  app!.replaceChildren(skip, demoBanner() ?? document.createTextNode(''), el('div', 'portal-layout', sidebar(), main));
  if (['search', 'category-filter', 'status-filter', 'organization'].includes(focusedName)) {
    const replacement = app!.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${focusedName}"]`);
    replacement?.focus({preventScroll: true});
    if (selection && replacement instanceof HTMLInputElement) replacement.setSelectionRange(selection[0], selection[1]);
  }
}

function filteredRequests(): PortalRequest[] {
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  return requests.filter((request) => (!categoryFilter || request.category === categoryFilter) && (!statusFilter || request.status === statusFilter) && (!normalized || [request.protocol, request.context, categories[request.category], goalLabels.get(request.goal) || request.goal].join(' ').toLocaleLowerCase('pt-BR').includes(normalized)));
}

function requestsPanel(): HTMLElement {
  const panel = el('section', 'requests-panel');
  panel.setAttribute('aria-label', currentView === 'queue' ? 'Fila de triagem' : 'Seus pedidos');
  const listContent = el('div', 'request-list-content');
  const resultCount = el('span', 'result-count');
  const refreshButton = button('Atualizar', 'text-button', () => { void refresh(); });
  refreshButton.disabled = loading;
  const search = input('search', 'search', 'Buscar protocolo ou contexto');
  search.value = query;
  search.setAttribute('aria-label', 'Buscar pedidos por protocolo ou contexto');
  const category = select([['', 'Todos os tipos'], ...Object.entries(categories)], 'category-filter', categoryFilter);
  category.setAttribute('aria-label', 'Filtrar por tipo de pedido');
  const status = select([['', 'Situação: todas'], ['recebido', 'Recebido'], ['em_triagem', 'Em triagem']], 'status-filter', statusFilter);
  status.setAttribute('aria-label', 'Filtrar por situação');
  const draw = () => {
    const filtered = filteredRequests();
    resultCount.textContent = loading ? 'Carregando…' : `${filtered.length} ${filtered.length === 1 ? 'pedido' : 'pedidos'}`;
    if (loading) {
      const skeleton = el('div', 'loading-list', el('span', 'spinner'), el('span', '', 'Carregando seus pedidos…'));
      skeleton.setAttribute('role', 'status');
      listContent.replaceChildren(skeleton);
      return;
    }
    if (!filtered.length) {
      const filtering = Boolean(query || categoryFilter || statusFilter);
      const empty = el('div', 'empty-state', el('div', 'empty-icon', icon(filtering ? 'search' : 'file')), el('h3', '', filtering ? 'Nenhum pedido com esses filtros.' : 'Seu próximo projeto começa aqui.'), el('p', '', filtering ? 'Tente outro termo ou limpe os filtros para ver seus pedidos.' : 'Conte o que você precisa. A Camaleão recebe o contexto e organiza os próximos passos.'));
      if (filtering) empty.append(button('Limpar filtros', 'button button-soft', () => { query = ''; categoryFilter = ''; statusFilter = ''; search.value = ''; category.value = ''; status.value = ''; draw(); }));
      else if (currentView !== 'queue') empty.append(button('Criar meu primeiro pedido', 'button button-primary', createRequestDialog));
      listContent.replaceChildren(empty);
      return;
    }
    const head = el('div', 'request-table-header', el('span', '', 'PEDIDO'), el('span', '', 'SITUAÇÃO'), el('span', '', 'PRAZO DESEJADO'), el('span', '', ''));
    head.setAttribute('aria-hidden', 'true');
    const list = el('ul', 'request-list', ...filtered.map(requestRow));
    listContent.replaceChildren(head, list);
  };
  search.addEventListener('input', () => { query = search.value; draw(); });
  category.addEventListener('change', () => { categoryFilter = category.value; draw(); });
  status.addEventListener('change', () => { statusFilter = status.value; draw(); });
  panel.append(el('div', 'panel-heading', el('div', 'panel-title', el('h2', '', currentView === 'queue' ? 'Pedidos para acompanhar' : 'Seus pedidos'), resultCount), refreshButton), el('div', 'filters', el('div', 'search-field', icon('search'), search), category, status), listContent, el('p', 'list-footnote', 'Até 100 pedidos mais recentes da organização. Prazo desejado é uma preferência; a equipe confirma o prazo de entrega.'));
  draw();
  return panel;
}

function requestRow(request: PortalRequest): HTMLLIElement {
  const card = button('', 'request-row', () => detailsDialog(request));
  const title = goalLabels.get(request.goal) || request.goal;
  card.setAttribute('aria-label', `Abrir pedido ${request.protocol}: ${categories[request.category] || 'Pedido'}, ${title}, ${request.status === 'em_triagem' ? 'em triagem' : 'recebido'}`);
  card.append(
    el('div', 'request-summary', el('div', 'category-icon', icon(request.category === 'automacao' ? 'spark' : request.category === 'site' ? 'grid' : 'file')), el('div', 'request-summary-text', el('div', 'request-meta', el('span', 'request-protocol', request.protocol), el('span', '', '·'), el('span', '', categories[request.category] || 'Pedido')), el('strong', 'request-title', title), el('span', 'request-context', request.context))),
    el('div', 'request-status', statusBadge(request.status)),
    el('div', 'request-deadline', icon('calendar'), el('span', '', date(request.desiredDeadline, true)), request.urgency === 'urgente' ? el('span', 'urgent-note', 'Urgência relatada') : null),
    icon('arrow', 'row-arrow'),
  );
  const review = button('Revisar entregas', 'text-button request-review', () => deliveriesDialog(request));
  review.setAttribute('aria-label', `Revisar entregas do pedido ${request.protocol}`);
  return el('li', '', card, review);
}

function historyPanel(): HTMLElement {
  const events = requests.flatMap((request) => {
    const entries = [{request, at: request.createdAt, type: 'created'}];
    if (request.updatedAt !== request.createdAt) entries.push({request, at: request.updatedAt, type: 'updated'});
    return entries;
  }).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const panel = el('section', 'history-panel', el('div', 'panel-heading', el('div', 'panel-title', el('h2', '', 'Registros dos pedidos')), button('Atualizar', 'text-button', () => { void refresh(); })), el('p', 'history-help', 'Nesta entrega, o histórico mostra a criação e a última atualização. Para consultar versões e decisões, abra o pedido e escolha Entregas e decisões. Anexos ainda não estão disponíveis.'));
  if (loading) panel.append(el('div', 'loading-list', el('span', 'spinner'), el('span', '', 'Carregando registros…')));
  else if (!events.length) panel.append(el('div', 'empty-state', icon('clock'), el('h3', '', 'O histórico começa no primeiro pedido.'), el('p', '', 'Os registros aparecerão aqui depois que você enviar uma solicitação.')));
  else {
    const list = el('ol', 'history-list');
    for (const entry of events) {
      const open = button('Ver pedido', 'text-button', () => detailsDialog(entry.request));
      list.append(el('li', 'history-entry', el('div', 'history-marker', icon(entry.type === 'created' ? 'plus' : 'queue')), el('div', 'history-description', el('strong', '', entry.type === 'created' ? 'Pedido registrado' : 'Pedido atualizado'), el('span', '', `${entry.request.protocol} · ${categories[entry.request.category]}`)), el('time', 'history-time', date(entry.at)), open));
    }
    panel.append(list);
  }
  return panel;
}

function detailsDialog(request: PortalRequest): void {
  const details = el('div', 'dialog-body details-body', el('div', 'details-summary', statusBadge(request.status), el('span', 'muted', `Criado em ${date(request.createdAt)}`)));
  const rows: [string, string][] = [
    ['Tipo', categories[request.category] || request.category],
    ['Objetivo', goalLabels.get(request.goal) || request.goal],
    ['Canal', channelLabels.get(request.channel) || request.channel || 'Não indicado'],
    ['Formato', formatLabels.get(request.format) || request.format || 'Não indicado'],
    ['Prazo desejado', date(request.desiredDeadline)],
    ['Urgência relatada', request.urgency === 'urgente' ? 'Urgente' : 'Normal'],
  ];
  const definitions = el('dl', 'details-grid');
  for (const [label, value] of rows) definitions.append(el('div', '', el('dt', '', label), el('dd', '', value)));
  details.append(definitions, el('section', 'context-block', el('h3', '', 'Contexto do pedido'), el('p', '', request.context)), el('div', 'notice detail-note', icon('clock'), el('span', '', request.status === 'em_triagem' ? 'A equipe está organizando o pedido. O prazo informado é uma preferência; o compromisso de entrega será combinado com você.' : 'Seu pedido foi registrado. A equipe fará a triagem manual antes de definir os próximos passos e o prazo de entrega.')));
  details.append(button('Entregas e decisões', 'button button-primary', () => {
    result.close();
    if (openDialog === result.dialog) openDialog = null;
    deliveriesDialog(request);
  }));
  const result = modal(`Pedido ${request.protocol}`, 'Os detalhes que você compartilhou com a Camaleão.', details);
  openDialog = result.dialog;
  result.dialog.addEventListener('close', () => { if (openDialog === result.dialog) openDialog = null; });
}

function deliveriesDialog(request: PortalRequest): void {
    if (!user || request.organizationId !== organizationId || !currentMembership()) return;
    const epoch = sessionEpoch;
    const org = organizationId;
    dismissDialog();
    openDeliveryDialog({ gateway, request, operator: currentMembership()?.role === 'operator',
      organizationName: currentMembership()!.organizationName,
      demoNext: isDemo && request.id === DEMO_EXAMPLE_ID ? createRequestDialog : undefined,
      valid: () => epoch === sessionEpoch && org === organizationId && Boolean(user),
      accessDenied: () => { void invalidateAccess(); },
      register: dialog => { openDialog = dialog; dialog.addEventListener('close', () => { if (openDialog === dialog) openDialog = null; }); },
    });
}

function createRequestDialog(): void {
  if (!user || !organizationId || loading) return;
  const operationEpoch = sessionEpoch;
  const targetOrganization = organizationId;
  const previousDraft = uncertainDrafts.get(targetOrganization);
  const requestId = previousDraft?.requestId ?? crypto.randomUUID();
  let pending = false;
  let capturedPayload: RequestPayload | null = previousDraft?.payload ?? null;
  let conflict = false;
  const form = el('form', 'request-form');
  const category = select([['', 'Escolha o tipo de pedido'], ...Object.entries(categories)], 'category');
  category.required = true;
  const goal = select(goals, 'goal');
  goal.required = true;
  const channel = select(channels, 'channel');
  const format = select(formatOptions, 'format');
  const deadline = input('date', 'desiredDeadline');
  const urgency = select([['normal', 'Normal'], ['urgente', 'Urgente']], 'urgency', 'normal');
  const context = el('textarea', 'input textarea');
  context.name = 'context';
  context.placeholder = 'Ex.: precisamos divulgar o novo serviço. Nosso público é… A mensagem principal é…';
  context.required = true;
  context.minLength = 10;
  context.maxLength = 2000;
  context.rows = 5;
  const counter = el('span', 'character-count', '0 / 2.000');
  counter.setAttribute('aria-live', 'off');
  context.addEventListener('input', () => { counter.textContent = `${context.value.length.toLocaleString('pt-BR')} / 2.000`; });
  const contextField = field('Conte o contexto *', context, 'O que precisa acontecer? Inclua o público, a mensagem e o que já foi combinado. Pelo menos 10 caracteres.');
  const briefingGuide = el('details', 'context-block');
  briefingGuide.append(el('summary', '', 'O que incluir no briefing?'),
    el('p', '', 'Descreva o público, a oferta e a ação que você espera. Indique o tom da marca e as condições da oferta.'),
    el('p', '', 'Para números, resultados e depoimentos, informe a referência autorizada. Se faltar uma informação, escreva “a confirmar”.'),
    el('p', '', 'Inclua apenas informações necessárias ao pedido. Evite senhas e dados pessoais. A equipe revisará o texto antes de apresentar uma entrega.'));
  contextField.append(counter, briefingGuide);
  const optionalFields = el('div', 'field-grid', field('Canal', channel), field('Formato', format));
  category.addEventListener('change', () => {
    // These optional selectors guide the briefing without silently changing submitted values.
    channel.required = false;
    format.required = false;
  });
  const feedback = el('p', 'form-feedback');
  feedback.setAttribute('role', 'alert');
  feedback.hidden = true;
  const submit = button('', 'button button-primary');
  submit.type = 'submit';
  submit.append('Enviar pedido', icon('arrow'));
  const cancel = button('Cancelar', 'button button-soft');
  const footer = el('div', 'dialog-footer', el('span', 'required-note', '* Campos obrigatórios'), el('div', 'dialog-actions', cancel, submit));
  form.append(
    el('div', 'dialog-body', el('div', 'briefing-step', el('span', '', '01'), el('div', '', el('strong', '', 'O que vamos construir?'), el('p', 'muted', 'Um bom contexto ajuda a equipe a começar melhor.'))),
      el('div', 'field-grid', field('Tipo de pedido *', category), field('Objetivo *', goal)),
      optionalFields,
      el('div', 'field-grid', field('Prazo desejado', deadline, 'É uma preferência, sem compromisso automático de entrega.'), field('Como está a urgência?', urgency, 'A prioridade de trabalho será definida pela equipe.')),
      contextField,
      el('div', 'attachment-note', icon('file'), el('div', '', el('strong', '', 'Referências e anexos'), el('p', '', 'O envio de arquivos ainda não está disponível nesta entrega. Você pode descrever as referências no contexto.'))),
      feedback,
    ), footer,
  );
  const result = modal('Novo pedido', `Para ${currentMembership()?.organizationName || 'sua organização'} · todos os campos com * são obrigatórios.`, form);
  openDialog = result.dialog;
  const close = () => { result.close(); if (openDialog === result.dialog) openDialog = null; };
  cancel.addEventListener('click', close);
  result.dialog.addEventListener('cancel', (event) => {
    if (pending) {
      event.preventDefault();
      event.stopImmediatePropagation();
      feedback.textContent = 'Aguarde a confirmação do envio antes de fechar. Isso ajuda a evitar um pedido repetido.';
      feedback.hidden = false;
    }
  }, {capture: true});
  result.dialog.addEventListener('close', () => { if (openDialog === result.dialog) openDialog = null; });
  const controls = [category, goal, channel, format, deadline, urgency, context];
  const lock = (locked: boolean) => {
    for (const control of controls) control.disabled = locked;
    cancel.disabled = pending;
    submit.disabled = pending;
    const dismiss = result.dialog.querySelector<HTMLButtonElement>('.dialog-header .icon-button');
    if (dismiss) dismiss.disabled = pending;
  };
  if (capturedPayload) {
    category.value = capturedPayload.category;
    goal.value = capturedPayload.goal;
    channel.value = capturedPayload.channel;
    format.value = capturedPayload.format;
    deadline.value = capturedPayload.desiredDeadline ?? '';
    urgency.value = capturedPayload.urgency;
    context.value = capturedPayload.context;
    counter.textContent = `${context.value.length.toLocaleString('pt-BR')} / 2.000`;
    feedback.textContent = 'Um envio anterior ainda precisa de confirmação. Ao tentar novamente, mantemos os mesmos dados e identificador para evitar duplicatas.';
    feedback.hidden = false;
    submit.replaceChildren('Confirmar envio anterior', icon('arrow'));
    lock(true);
  }
  if (!capturedPayload) category.focus();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    if (context.value.trim().length < 10) {
      feedback.textContent = 'Conte um pouco mais sobre o pedido: precisamos de pelo menos 10 caracteres.';
      feedback.hidden = false;
      context.focus();
      return;
    }
    capturedPayload ??= {
      category: category.value as RequestPayload['category'],
      goal: goal.value,
      channel: channel.value,
      format: format.value,
      context: context.value.trim(),
      desiredDeadline: deadline.value || null,
      urgency: urgency.value as RequestPayload['urgency'],
    };
    uncertainDrafts.set(targetOrganization, {requestId, payload: capturedPayload});
    pending = true;
    lock(true);
    feedback.hidden = true;
    submit.textContent = 'Confirmando pedido…';
    try {
      const saved = await gateway.createRequest(targetOrganization, requestId, capturedPayload);
      if (operationEpoch !== sessionEpoch || !user || targetOrganization !== organizationId) return;
      uncertainDrafts.delete(targetOrganization);
      close();
      notice = `Pedido ${saved.protocol} registrado. A equipe recebeu seu contexto para a triagem.`;
      currentView = 'requests';
      query = '';
      categoryFilter = '';
      statusFilter = '';
      await refresh();
    } catch (error) {
      if (operationEpoch !== sessionEpoch || !user || targetOrganization !== organizationId) return;
      if (isAccessError(error)) { await invalidateAccess(); return; }
      if (errorCode(error) === 'validation') { capturedPayload = null; uncertainDrafts.delete(targetOrganization); }
      if (errorCode(error) === 'conflict') { conflict = true; uncertainDrafts.delete(targetOrganization); }
      // Keep both ID and payload stable after an uncertain response. A retry cannot become a second request.
      feedback.textContent = `${displayError(error)} Ao tentar novamente, usamos o mesmo envio para evitar duplicatas.`;
      feedback.hidden = false;
    } finally {
      pending = false;
      if (result.dialog.isConnected) {
        lock(Boolean(capturedPayload));
        cancel.disabled = false;
        submit.disabled = conflict;
        submit.replaceChildren(capturedPayload ? 'Tentar confirmar novamente' : 'Enviar pedido', icon('arrow'));
      }
    }
  });
}

async function start(): Promise<void> {
  loadingScreen();
  try {
    const currentUser = await gateway.init();
    await changeSession(currentUser);
    gateway.onSessionChanged((nextUser: User | null) => {
      if (user && nextUser && user.id === nextUser.id) {
        user = nextUser;
        if (!openDialog) void refresh();
        return;
      }
      void changeSession(nextUser);
    });
  } catch {
    loginScreen('Não foi possível preparar o acesso. Confira a configuração do portal e tente novamente.');
  }
}

// Refresh only in a visible, signed-in portal. No n8n job is activated by this polling.
window.setInterval(() => { if (user && !loading && !openDialog && document.visibilityState === 'visible') void refresh(); }, 30_000);
document.addEventListener('visibilitychange', () => { if (user && document.visibilityState === 'visible' && !openDialog) void refresh(); });
void start();
