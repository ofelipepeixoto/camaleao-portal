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
