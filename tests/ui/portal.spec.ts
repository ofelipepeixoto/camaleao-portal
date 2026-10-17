import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function login(page: import('@playwright/test').Page, who = 'Cliente Aurora') {
  await page.goto('/');
  await page.getByRole('button', {name: who, exact: true}).click();
  await expect(page.getByRole('button', {name:'Novo pedido', exact:true})).toBeEnabled();
}
async function fill(page: import('@playwright/test').Page, context = 'Precisamos divulgar nosso novo serviço para o público do bairro.') {
  await page.getByRole('button', {name:'Novo pedido', exact:true}).click();
  await page.getByLabel('Tipo de pedido *', {exact:true}).selectOption('peca_social');
  await page.getByLabel('Objetivo *', {exact:true}).selectOption('divulgar_servico');
  await page.getByLabel('Conte o contexto *', {exact:true}).fill(context);
}

test('criar, persistir na demo, filtrar e consultar detalhes', async ({page}) => {
  await login(page);
  await fill(page);
  await page.getByRole('button', {name:'Enviar pedido', exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'registrado'})).toBeVisible();
  await expect(page.locator('.request-list li')).toHaveCount(1);
  await page.getByRole('button', {name:/Abrir pedido/}).click();
  await expect(page.getByRole('dialog')).toContainText('nosso novo serviço');
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name:'Sair da conta'}).click();
  await page.getByRole('button', {name:'Cliente Aurora', exact:true}).click();
  await expect(page.locator('.request-list li')).toHaveCount(1);
  await page.getByLabel('Filtrar por tipo de pedido').selectOption('site');
  await expect(page.getByText('Nenhum pedido com esses filtros.')).toBeVisible();
  await page.getByRole('button', {name:'Limpar filtros'}).click();
  await expect(page.locator('.request-list li')).toHaveCount(1);
});

test('identidades fictícias distintas e equipe com seleção de organização', async ({page}) => {
  await login(page);
  await fill(page);
  await page.getByRole('button', {name:'Enviar pedido', exact:true}).click();
  await expect(page.locator('.request-list li')).toHaveCount(1);
  await page.getByRole('button', {name:'Sair da conta'}).click();
  await page.getByRole('button', {name:'Cliente Horizonte', exact:true}).click();
  await expect(page.getByText('Seu próximo projeto começa aqui.')).toBeVisible();
  await expect(page.locator('.request-list li')).toHaveCount(0);
  await page.getByRole('button', {name:'Sair da conta'}).click();
  await page.getByRole('button', {name:'Equipe Camaleão', exact:true}).click();
  await expect(page.getByLabel('Selecionar organização')).toBeVisible();
  await expect(page.getByRole('button', {name:/Fila de triagem/})).toBeVisible();
  await page.getByLabel('Selecionar organização').selectOption('10000000-0000-4000-8000-000000000002');
  await expect(page.locator('.request-list li')).toHaveCount(0);
});

test('conteúdo malicioso é texto e demo não chama serviços remotos', async ({page}) => {
  const external: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:5173/')) external.push(request.url()); });
  await login(page);
  const payload = '<img src=x onerror=alert("fixture")> Conteúdo fictício.';
  await fill(page, payload);
  await page.getByRole('button', {name:'Enviar pedido', exact:true}).click();
  await expect(page.locator('.request-context')).toHaveText(payload);
  await page.getByRole('button', {name:/Abrir pedido/}).click();
  await expect(page.getByRole('dialog')).toContainText(payload);
  await expect(page.locator('img')).toHaveCount(0);
  expect(external).toEqual([]);
});

test('formulário exige campos e preserva foco ao fechar por teclado', async ({page}) => {
  await login(page);
  await page.getByRole('button', {name:'Novo pedido', exact:true}).click();
  await page.getByRole('button', {name:'Enviar pedido', exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Tipo de pedido *', {exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', {name:'Novo pedido', exact:true})).toBeFocused();
  await expect(page.locator('.request-list li')).toHaveCount(0);
});

test('celular 390px, navegação, formulário e acessibilidade automática', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await login(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await fill(page);
  expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.getByRole('button', {name:'Enviar pedido', exact:true}).click();
  await expect(page.locator('.request-list li')).toHaveCount(1);
  await page.getByRole('button', {name:/Histórico/}).click();
  await expect(page.getByText('Pedido registrado', {exact:true})).toBeVisible();
  await page.screenshot({path:'artifacts/portal-mobile.png',fullPage:true});
});

test('desktop acessível e visual da entrega', async ({page}) => {
  await login(page);
  await fill(page);
  await page.getByRole('button', {name:'Enviar pedido', exact:true}).click();
  await expect(page.locator('.request-list li')).toHaveCount(1);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.screenshot({path:'artifacts/portal-desktop.png',fullPage:true});
});

async function openDeliveries(page: import('@playwright/test').Page) {
  await page.getByRole('button', {name:/Abrir pedido/}).click();
  await page.getByRole('button', {name:'Entregas e decisões',exact:true}).click();
}
async function presentText(page: import('@playwright/test').Page,content:string,first=true) {
  await page.getByLabel('Conteúdo da entrega *',{exact:true}).fill(content);
  await page.getByRole('button',{name:first?'Apresentar versão':'Apresentar nova versão',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Versão apresentada'})).toBeVisible();
}
async function switchAccount(page: import('@playwright/test').Page,who:string) {
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Sair da conta'}).click();
  await page.getByRole('button',{name:who,exact:true}).click();
  await expect(page.getByRole('button',{name:'Novo pedido',exact:true})).toBeEnabled();
}
async function prepareDelivery(page: import('@playwright/test').Page) {
  await login(page);await fill(page);await page.getByRole('button',{name:'Enviar pedido',exact:true}).click();
  await expect(page.locator('.request-list li')).toHaveCount(1);
  await switchAccount(page,'Equipe Camaleão');await openDeliveries(page);
  await presentText(page,'Entrega fictícia versão inicial: divulgar o novo serviço no bairro.');
}
test('B apresentar, aprovar versão exata, histórico e nova versão sem aprovação herdada',async({page})=>{
  await prepareDelivery(page);await switchAccount(page,'Cliente Aurora');await openDeliveries(page);
  await expect(page.getByRole('heading',{name:'Versão 1 · atual'})).toHaveCount(1);
  await expect(page.getByText(/SHA-256: [a-f0-9]{64}/)).toHaveCount(1);
  await page.getByRole('button',{name:'Aprovar',exact:true}).dblclick();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('camaleao-fictitious-deliveries-v1')!).decisions.length)).toBe(0);
  await page.getByRole('button',{name:/Confirmar aprovação da versão/}).dblclick();
  await expect(page.getByText('Aprovada · versão 1',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Aprovar',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('camaleao-fictitious-deliveries-v1')!).decisions.length)).toBe(1);
  await switchAccount(page,'Equipe Camaleão');await openDeliveries(page);
  await presentText(page,'Segunda versão fictícia: mensagem revisada para a campanha.',false);
  await switchAccount(page,'Cliente Aurora');await openDeliveries(page);
  await expect(page.getByRole('button',{name:'Aprovar',exact:true})).toBeVisible();
  await page.getByText('Versões anteriores (1)',{exact:true}).click();
  await expect(page.getByText('Versão 1 · anterior',{exact:true})).toBeVisible();
  await expect(page.getByText('Registro anterior; não é a decisão vigente.',{exact:true})).toBeVisible();
});
test('B celular, ajustes guiados, persistência e texto seguro sem serviços externos',async({page})=>{
  const external:string[]=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:5173/'))external.push(r.url());});
  await page.setViewportSize({width:390,height:844});await prepareDelivery(page);
  await switchAccount(page,'Cliente Aurora');await openDeliveries(page);
  await page.getByRole('button',{name:'Pedir ajustes',exact:true}).click();
  const text=page.getByLabel('O que precisa mudar? *',{exact:true});await expect(text).toBeFocused();
  await text.fill('<img src=x onerror=alert(1)> Ajustar a descrição do serviço.');
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  expect(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await page.getByRole('button',{name:'Enviar ajuste',exact:true}).click();
  await expect(page.getByText('Ajustes solicitados · versão 1',{exact:true})).toBeVisible();
  expect(await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement))).toBe(true);
  await expect(page.locator('img')).toHaveCount(0);
  await page.screenshot({path:'artifacts/b2-mobile.png',fullPage:true});
  await switchAccount(page,'Cliente Aurora');await openDeliveries(page);
  await expect(page.getByText('Ajustes solicitados · versão 1',{exact:true})).toBeVisible();
  expect(external).toEqual([]);
});
test('B stale version conflict refreshes content and requires a new deliberate decision',async({page})=>{
  await prepareDelivery(page);await switchAccount(page,'Cliente Aurora');await openDeliveries(page);
  // Another fictional team presentation while this dialog retains the old version.
  await page.evaluate(async()=>{
    const all=JSON.parse(localStorage.getItem('camaleao-fictitious-deliveries-v1')!);
    const first=all.deliveries[0];const content='Versão mais recente fictícia apresentada em outra sessão.';
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content)))).map(b=>b.toString(16).padStart(2,'0')).join('');
    all.deliveries.push({...first,id:crypto.randomUUID(),version:2,content,contentHash:hash});
    localStorage.setItem('camaleao-fictitious-deliveries-v1',JSON.stringify(all));
  });
  await page.getByRole('button',{name:'Aprovar',exact:true}).click();
  await page.getByRole('button',{name:/Confirmar aprovação da versão/}).click();
  await expect(page.getByRole('alert')).toContainText('Confira o conteúdo atualizado antes de decidir');
  await expect(page.getByText('Versão mais recente fictícia apresentada em outra sessão.',{exact:true})).toHaveCount(1);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('camaleao-fictitious-deliveries-v1')!).decisions.length)).toBe(0);
  await page.getByRole('button',{name:'Aprovar',exact:true}).click();
  await page.getByRole('button',{name:/Confirmar aprovação da versão/}).click();
  await expect(page.getByText('Aprovada · versão 2',{exact:true})).toBeVisible();
  await page.screenshot({path:'artifacts/b2-desktop.png',fullPage:true});
});
test('B another fictional organization sees no private delivery and logout clears dialog',async({page})=>{
  await prepareDelivery(page);await switchAccount(page,'Cliente Horizonte');
  await expect(page.locator('.request-list li')).toHaveCount(0);
  await expect(page.getByText('Entrega fictícia versão inicial:',{exact:false})).toHaveCount(0);
  await page.getByRole('button',{name:'Sair da conta'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('B lost response retries same decision and never duplicates effective result',async({page})=>{
  await prepareDelivery(page);await switchAccount(page,'Cliente Aurora');await openDeliveries(page);
  await page.evaluate(async()=>{
    const {gateway}=await import('/src/gateway.ts');
    const original=gateway.decideDelivery.bind(gateway);let once=true;
    gateway.decideDelivery=async(...args:Parameters<typeof original>)=>{
      const result=await original(...args);if(once){once=false;throw new Error('SIMULATED_LOST_RESPONSE');}return result;
    };
  });
  await page.getByRole('button',{name:'Aprovar',exact:true}).click();
  await page.getByRole('button',{name:/Confirmar aprovação da versão/}).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível confirmar');
  await page.keyboard.press('Escape');await openDeliveries(page);
  await page.getByRole('button',{name:'Confirmar envio anterior',exact:true}).click();
  await expect(page.getByText('Aprovada · versão 1',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('camaleao-fictitious-deliveries-v1')!).decisions.length)).toBe(1);
});
test('B late private response after session change cannot repopulate dialog',async({page})=>{
  await prepareDelivery(page);await switchAccount(page,'Cliente Aurora');
  await page.evaluate(async()=>{
    const {gateway}=await import('/src/gateway.ts');
    const original=gateway.deliveryHistory.bind(gateway);
    gateway.deliveryHistory=async(...args:Parameters<typeof original>)=>{
      const rows=await original(...args);
      await gateway.signOut();
      return rows;
    };
  });
  await page.getByRole('button',{name:/Abrir pedido/}).click();
  await page.getByRole('button',{name:'Entregas e decisões',exact:true}).click();
  await expect(page.getByRole('button',{name:'Cliente Aurora',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Entrega fictícia versão inicial:',{exact:false})).toHaveCount(0);
});

 test('orientações opcionais preservam o briefing e não enviam dados externos', async ({page}) => {
  const external:string[]=[];
  page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:5173/'))external.push(r.url());});
  await login(page); await fill(page, 'Briefing fictício informado pelo cliente, sem alteração automática.');
  await page.getByText('O que incluir no briefing?',{exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('a confirmar');
  await expect(page.getByLabel('Conte o contexto *',{exact:true})).toHaveValue('Briefing fictício informado pelo cliente, sem alteração automática.');
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.getByRole('button',{name:'Enviar pedido',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'registrado'})).toBeVisible();
  expect(external).toEqual([]);
});

test('navegação mantém foco e campos opcionais vazios são claros', async ({page}) => {
  await login(page);
  await fill(page);
  await page.getByRole('button', {name:'Enviar pedido', exact:true}).click();
  await page.getByRole('button', {name:'Histórico', exact:true}).click();
  await expect(page.getByRole('heading', {level:1})).toBeFocused();
  await page.getByRole('button', {name:'Ver pedido', exact:true}).click();
  await expect(page.getByRole('dialog')).not.toContainText('Selecione, se aplicável');
  await expect(page.getByRole('dialog').getByText('Não indicado', {exact:true})).toHaveCount(2);
});

test('fila vazia explica o próximo destino e mantém foco', async ({page}) => {
  await login(page, 'Equipe Camaleão');
  await page.getByRole('button', {name:/Fila de triagem/}).click();
  await expect(page.getByRole('heading', {level:1})).toBeFocused();
  await expect(page.getByText('Nenhum pedido aguardando triagem.', {exact:true})).toBeVisible();
  await expect(page.getByLabel('Filtrar por situação')).toBeDisabled();
});
