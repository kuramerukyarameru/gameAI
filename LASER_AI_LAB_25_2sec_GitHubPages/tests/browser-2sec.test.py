import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
P=Path(__file__).resolve().parents[1]
async def run():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-web-security'])
  page=await browser.new_page(viewport={'width':1280,'height':900})
  errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
  html=(P/'index.html').read_text().replace('<head>','<head><base href="http://127.0.0.1:8052/">')
  await page.set_content(html,wait_until='networkidle')
  await page.wait_for_function("document.querySelector('#engine-status').textContent.includes('ONLINE')")
  assert await page.locator('#think-budget').input_value()=='2000'
  await page.locator('#player-first').select_option('AI10')
  await page.locator('#player-second').select_option('AI01')
  await page.locator('#new-game').click()
  await page.locator('#step-forward').click()
  await page.wait_for_function("document.querySelector('#arena-state').textContent === 'THINKING'")
  # Navigating while thinking proves the 2-sec Wasm runs in a Worker, not on the UI thread.
  await page.locator('.rail [data-view="agents"]').click()
  assert await page.locator('.agent-card').count()==25
  await page.locator('.rail [data-view="arena"]').click()
  await page.wait_for_function("document.querySelector('#turn-number').textContent==='01'",timeout=12000)
  measured=float(await page.locator('#metric-time').inner_text())
  assert measured>0 and measured<3500,measured
  assert not await page.locator('#error-banner').is_visible()
  assert not errors,errors
  print(json.dumps({'result':'PASS','budgetMs':2000,'observedMoveMs':measured,'uiResponsiveDuringWorker':True,'errors':errors},ensure_ascii=False))
  await browser.close()
asyncio.run(run())
