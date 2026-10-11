// @ts-nocheck -- test-only imports of the running Vite gateway enable failure injection.
import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const key='camaleao-fictitious-deliveries-v1';
const draft='Trocar a abertura para destacar os pequenos negócios do bairro.';
async function example(page){
  await page.goto('/');
  await page.getByRole('button',{name:'Revisar exemplo fictício',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Versão 1 · atual',exact:true})).toBeVisible();
}
async function reopen(page){await page.getByRole('button',{name:/Revisar entregas do pedido/}).click();}
async function decisions(page){return page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).decisions,key);}
async function replaceVersion(page){
  await page.evaluate(async k=>{
    const all=JSON.parse(localStorage.getItem(k)!);
    const latest=all.deliveries.at(-1);const content='Nova versão fictícia com texto completamente revisado pela equipe.';
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content)))).map(b=>b.toString(16).padStart(2,'0')).join('');
    all.deliveries.push({...latest,id:crypto.randomUUID(),version:latest.version+1,content,contentHash:hash});
    localStorage.setItem(k,JSON.stringify(all));
  },key);
}

test('B3 entrada guiada, revisão deliberada, decisão preservada e próxima ação real',async({page})=>{
  const external:string[]=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:5173/'))external.push(r.url());});
  await example(page);
  await expect(page.getByText('Roteiro de 90 segundos · dados fictícios',{exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('A triagem não foi executada');
  await expect(page.getByRole('dialog')).toContainText('Estúdio Aurora · pedido CMP-DEMO-90 · Cliente');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('camaleao-fictitious-demo-v1')!)[0].status)).toBe('recebido');
  await page.getByRole('button',{name:'Aprovar',exact:true}).dblclick();
  expect(await decisions(page)).toHaveLength(0);
  await expect(page.getByRole('dialog')).toContainText('Não pode ser editada e não aprova versões futuras');
  await page.getByRole('button',{name:'Voltar à revisão',exact:true}).click();
  await expect(page.getByRole('button',{name:'Aprovar',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Aprovar',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar aprovação da versão 1',exact:true}).dblclick();
  await expect(page.getByText('Aprovada · versão 1',{exact:true})).toBeVisible();
  expect(await decisions(page)).toHaveLength(1);
  await page.getByRole('button',{name:'Criar outro pedido fictício',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Novo pedido');
  await page.getByLabel('Tipo de pedido *',{exact:true}).selectOption('site');
  await page.getByLabel('Objetivo *',{exact:true}).selectOption('gerar_oportunidades');
  await page.getByLabel('Conte o contexto *',{exact:true}).fill('Outro pedido fictício criado depois de revisar o exemplo.');
  await page.getByRole('button',{name:'Enviar pedido',exact:true}).click();
  await expect(page.locator('.request-list li')).toHaveCount(2);
  await page.getByRole('button',{name:'Sair da conta'}).click();
  await page.getByRole('button',{name:'Revisar exemplo fictício',exact:true}).click();
  await expect(page.getByText('Aprovada · versão 1',{exact:true})).toBeVisible();
  expect(await decisions(page)).toHaveLength(1);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('camaleao-fictitious-demo-v1')!).length)).toBe(2);
  expect(external).toEqual([]);
  await page.screenshot({path:'artifacts/b3-desktop.png',fullPage:true});
});

test('B3 rascunho de ajuste sobrevive a refresh/fechamento, mas não à troca de sessão',async({page})=>{
  await example(page);await page.getByRole('button',{name:'Pedir ajustes',exact:true}).click();
  const field=page.getByLabel('O que precisa mudar? *',{exact:true});await field.fill(draft);
  await page.getByRole('button',{name:'Atualizar versões',exact:true}).click();await expect(field).toHaveValue(draft);
  await page.keyboard.press('Escape');await reopen(page);await expect(field).toHaveValue(draft);
  expect(await page.evaluate(text=>Object.values(localStorage).some(value=>value.includes(text)),draft)).toBe(false);
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Sair da conta'}).click();
  await page.getByRole('button',{name:'Cliente Horizonte',exact:true}).click();
  await expect(page.locator('.request-list li')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/Revisar entregas do pedido/})).toHaveCount(0);
  await page.getByRole('button',{name:'Sair da conta'}).click();await page.getByRole('button',{name:'Cliente Aurora',exact:true}).click();
  await reopen(page);await page.getByRole('button',{name:'Pedir ajustes',exact:true}).click();await expect(field).toHaveValue('');
});

test('B3 rascunho antigo exige adaptação explícita e decisão usa apenas a nova versão',async({page})=>{
  await example(page);await page.getByRole('button',{name:'Pedir ajustes',exact:true}).click();
  await page.getByLabel('O que precisa mudar? *',{exact:true}).fill(draft);
  await replaceVersion(page);
  await page.getByRole('button',{name:'Enviar ajuste',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Confira o conteúdo atualizado');
  await expect(page.getByRole('heading',{name:'Rascunho de uma versão anterior',exact:true})).toBeVisible();
  await expect(page.getByLabel('O que precisa mudar? *',{exact:true})).toBeHidden();
  expect(await decisions(page)).toHaveLength(0);
  await page.getByRole('button',{name:'Adaptar rascunho à versão atual',exact:true}).click();
  const field=page.getByLabel('O que precisa mudar? *',{exact:true});await expect(field).toHaveValue(draft);await expect(field).toBeFocused();
  await field.fill('Na nova versão, incluir o nome do bairro no último parágrafo.');
  await page.getByRole('button',{name:'Enviar ajuste',exact:true}).click();
  await expect(page.getByText('Ajustes solicitados · versão 2',{exact:true})).toBeVisible();
  const saved=await decisions(page);expect(saved).toHaveLength(1);expect(saved[0].version).toBe(2);
  await page.getByText('Versões anteriores (1)',{exact:true}).click();
  await expect(page.getByText('Sem decisão registrada',{exact:true})).toBeVisible();
});

test('B3 falha de leitura tem recuperação, carregamento anunciado e saída por teclado',async({page})=>{
  await example(page);await page.keyboard.press('Escape');
  await page.evaluate(async()=>{
    const {gateway}=await import('/src/gateway.ts');const original=gateway.deliveryHistory.bind(gateway);let once=true;
    gateway.deliveryHistory=async(...args)=>{if(once){once=false;throw new Error('SYNTHETIC_READ_FAILURE');}return original(...args);};
  });
  await reopen(page);await expect(page.getByRole('button',{name:'Tentar carregar versões',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Tentar carregar versões',exact:true})).toBeFocused();
  expect(await decisions(page)).toHaveLength(0);
  await page.getByRole('button',{name:'Tentar carregar versões',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Versão 1 · atual',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:/Revisar entregas do pedido/})).toBeFocused();
  await page.evaluate(async()=>{
    const {gateway}=await import('/src/gateway.ts');const original=gateway.deliveryHistory.bind(gateway);
    gateway.deliveryHistory=async(...args)=>{await new Promise(resolve=>window.releaseHistory=resolve);return original(...args);};
  });
  await reopen(page);await expect(page.getByRole('status').filter({hasText:'Carregando versões'})).toBeVisible();
  await page.keyboard.press('Escape');await page.evaluate(()=>window.releaseHistory());
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('B3 equipe retoma texto após erro e limpa rascunho ao trocar organização',async({page})=>{
  await example(page);await page.keyboard.press('Escape');await page.getByRole('button',{name:'Sair da conta'}).click();
  await page.getByRole('button',{name:'Equipe Camaleão',exact:true}).click();await reopen(page);
  const field=page.getByLabel('Conteúdo da entrega *',{exact:true});await field.fill('Texto fictício de uma nova versão preparada pela equipe.');
  await page.evaluate(async()=>{
    const {gateway}=await import('/src/gateway.ts');const original=gateway.presentDelivery.bind(gateway);let once=true;
    gateway.presentDelivery=async(...args)=>{if(once){once=false;throw {code:'validation'};}return original(...args);};
  });
  await page.getByRole('button',{name:'Apresentar nova versão',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Seu rascunho foi preservado');
  await expect(field).toHaveValue('Texto fictício de uma nova versão preparada pela equipe.');
  await page.keyboard.press('Escape');await reopen(page);await expect(field).not.toHaveValue('');
  await page.keyboard.press('Escape');
  await page.getByLabel('Selecionar organização').selectOption('10000000-0000-4000-8000-000000000002');
  await expect(page.locator('.request-list li')).toHaveCount(0);
  await page.getByLabel('Selecionar organização').selectOption('10000000-0000-4000-8000-000000000001');
  await reopen(page);await expect(field).toHaveValue('');
});

test('B3 celular 320px: guia, foco, confirmação e acesso por teclado',async({page})=>{
  await page.setViewportSize({width:320,height:780});await page.goto('/');
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.getByRole('button',{name:'Revisar exemplo fictício',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Versão 1 · atual',exact:true})).toBeVisible();
  expect(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.getByRole('button',{name:'Aprovar',exact:true}).focus();await page.keyboard.press('Enter');
  expect(await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Confirmar aprovação da versão 1',exact:true})).toBeFocused();
  expect(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  const dialogBox=await page.getByRole('dialog').boundingBox();
  const confirmBox=await page.getByRole('button',{name:'Confirmar aprovação da versão 1',exact:true}).boundingBox();
  expect(confirmBox!.x+confirmBox!.width).toBeLessThanOrEqual(dialogBox!.x+dialogBox!.width);
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.screenshot({path:'artifacts/b3-mobile.png',fullPage:true});
  await page.keyboard.press('Enter');await expect(page.getByText('Aprovada · versão 1',{exact:true})).toBeVisible();
});

test('B3 pedido sem versão explica o próximo passo e valida texto sem apagar o rascunho',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Cliente Aurora',exact:true}).click();
  await page.getByRole('button',{name:'Novo pedido',exact:true}).click();
  await page.getByLabel('Tipo de pedido *',{exact:true}).selectOption('peca_social');
  await page.getByLabel('Objetivo *',{exact:true}).selectOption('divulgar_servico');
  await page.getByLabel('Conte o contexto *',{exact:true}).fill('Pedido fictício ainda sem nenhuma entrega apresentada.');
  await page.getByRole('button',{name:'Enviar pedido',exact:true}).click();await reopen(page);
  await expect(page.getByRole('heading',{name:'Ainda não há uma entrega',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Aprovar',exact:true})).toHaveCount(0);
  await page.getByText('Versões anteriores (0)',{exact:true}).click();
  await expect(page.getByText('O histórico começa quando a equipe apresenta uma versão.',{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Sair da conta'}).click();
  await page.getByRole('button',{name:'Equipe Camaleão',exact:true}).click();await reopen(page);
  const field=page.getByLabel('Conteúdo da entrega *',{exact:true});await field.fill('          x');
  await page.getByRole('button',{name:'Apresentar versão',exact:true}).click();await expect(field).toBeFocused();
  expect(await field.evaluate(e=>e.validity.customError)).toBe(true);
  await field.fill('Primeira versão fictícia com um conteúdo válido e revisável.');
  expect(await field.evaluate(e=>e.validity.customError)).toBe(false);
  await page.getByRole('button',{name:'Apresentar versão',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Versão 1 · atual',exact:true})).toBeVisible();
});
