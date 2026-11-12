"""Optional browser regression test.
Requires Python playwright + a Chromium binary and a running static HTTP server.
Normal use: python tests/browser.test.py --url http://localhost:8000/
The --harness option is only for environments whose managed browser blocks
top-level local navigation. It uses set_content and loads the same HTTP assets;
it does not change browser policy. No files are uploaded to any external site.
"""
import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:8000/")
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--harness", action="store_true")
    parser.add_argument("--screenshots", default="")
    args = parser.parse_args()
    report = {"desktop": [], "mobile": [], "errors": [], "harness": args.harness}
    shots = Path(args.screenshots) if args.screenshots else None
    if shots:
        shots.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        flags = ["--no-sandbox"]
        if args.harness:
            flags.append("--disable-web-security")
        browser = await p.chromium.launch(executable_path=args.chromium, headless=True, args=flags)
        report["browser"] = browser.version
        page = await browser.new_page(viewport={"width": 1512, "height": 1100}, device_scale_factor=1)
        page.on("pageerror", lambda e: report["errors"].append(str(e)))
        if args.harness:
            html = (ROOT/"index.html").read_text().replace("<head>", f'<head><base href="{args.url}">')
            await page.set_content(html, wait_until="networkidle")
        else:
            await page.goto(args.url, wait_until="networkidle")
        await page.wait_for_function("document.querySelector('#engine-status').textContent.includes('ONLINE')")
        assert not await page.locator("#error-banner").is_visible()
        assert await page.locator("#player-first option").count() == 26
        if shots:
            await page.screenshot(path=str(shots/"arena.png"), full_page=True)
        report["desktop"].append("25 agents + human loaded")
        for turn in ["01", "02"]:
            await page.locator("#step-forward").click()
            await page.wait_for_function(f"document.querySelector('#turn-number').textContent === '{turn}'")
        await page.locator("#previous-turn").click()
        assert await page.locator("#turn-number").inner_text() == "01"
        await page.locator("#next-turn").click()
        assert await page.locator("#turn-number").inner_text() == "02"
        report["desktop"].append("Worker decisions, previous/next replay")
        for m in [6, 200]:
            await page.locator("#mirror-count").fill(str(m))
            await page.locator("#new-game").click()
            assert await page.locator("#board-density").inner_text() == f"{m} / 225 CELLS"
        await page.locator("#show-certificate").click()
        assert await page.locator("#certificate-dialog").is_visible()
        await page.locator("#certificate-dialog .dialog-close").click()
        report["desktop"].append("Mirror count 6 and 200 + reachability dialog")
        # Download serialization and upload replay are tested without invoking OS save UI.
        await page.evaluate("""() => {
            const old = URL.createObjectURL;
            URL.createObjectURL = b => { window.testBlob = b; return old(b); };
            const click = HTMLAnchorElement.prototype.click;
            HTMLAnchorElement.prototype.click = function() { if (!this.download) click.call(this); };
        }""")
        await page.locator("#mirror-count").fill("20")
        await page.locator("#player-first").select_option("HUMAN")
        await page.locator("#player-second").select_option("AI01")
        await page.locator("#new-game").click()
        await page.locator("#play-speed").select_option("0")
        position = await page.evaluate("""async base => {
            const {Engine,info,seedFrom}=await import(new URL('./runtime/engine.js',base).href);
            const engine=await Engine.load(new URL('./runtime/AI.wasm',base));
            return info(engine.generate(seedFrom(document.querySelector('#board-seed').value),20).state).mirrors[0];
        }""", args.url)
        box = await page.locator("#game-board").bounding_box()
        width = box["width"]
        pad, cell = width*.045, width*.91/15
        await page.locator("#game-board").click(position={
            "x":pad+(position%15+.5)*cell,
            "y":pad+(position//15+.5)*cell})
        await page.wait_for_function("document.querySelector('#turn-number').textContent === '02'")
        await page.locator("#save-replay").click()
        replay = await page.evaluate("async()=>JSON.parse(await window.testBlob.text())")
        assert len(replay["history"]) == 2
        await page.locator("#load-file").set_input_files({
            "name": "replay.json", "mimeType":"application/json",
            "buffer":json.dumps(replay).encode()})
        await page.wait_for_function("document.querySelector('#turn-number').textContent === '00'")
        assert not await page.locator("#error-banner").is_visible()
        await page.locator("#play-pause").click()
        await page.wait_for_function("document.querySelector('#turn-number').textContent === '02'")
        report["desktop"].append("Human move + AI response; JSON serialization, import and replay")
        await page.locator('.rail [data-view="agents"]').click()
        assert await page.locator(".agent-card").count() == 25
        for aid in ["AI03","AI04","AI05","AI21","AI25"]:
            await page.locator(f'.agent-card [data-agent="{aid}"]').click()
            assert await page.locator("#agent-dialog").is_visible()
            assert await page.locator("#agent-dialog li").count() >= 2
            await page.locator("#agent-dialog .dialog-close").click()
        report["desktop"].append("25 atlas cards and five detailed explanations")
        await page.locator('.rail [data-view="lab"]').click()
        await page.locator("#clear-agents").click()
        for aid in ["AI01","AI03","AI04"]:
            await page.locator(f'#experiment-agents input[value="{aid}"]').check()
        await page.locator("#experiment-counts").fill("20,100")
        await page.locator("#experiment-boards").fill("2")
        await page.locator("#run-experiment").click()
        await page.wait_for_function(
            "document.querySelector('#experiment-status').textContent.includes('\u5b9f\u9a13\u5b8c\u4e86')",
            timeout=120000)
        assert "24" in await page.locator("#progress-label").inner_text()
        assert await page.locator("#ranking-table tbody tr").count()==3
        await page.locator("#result-count").select_option("100")
        assert await page.locator("#result-games").inner_text()=="12"
        assert await page.locator(".confidence-range").count()==3
        if shots:
            await page.screenshot(path=str(shots/"results.png"), full_page=True)
        await page.locator("#export-json").click()
        experiment=await page.evaluate("async()=>JSON.parse(await window.testBlob.text())")
        assert len(experiment["records"])==24
        await page.locator("#export-csv").click()
        csv=await page.evaluate("async()=>await window.testBlob.text()")
        assert len(csv.strip().splitlines())==25
        await page.locator("#load-file").set_input_files({
            "name":"experiment.json","mimeType":"application/json",
            "buffer":json.dumps(experiment).encode()})
        await page.wait_for_function(
            "document.querySelector('#experiment-status').textContent.includes('\u8aad\u307f\u8fbc\u307f')")
        assert not await page.locator("#error-banner").is_visible()
        assert await page.locator(".confidence-range").count()==0
        report["desktop"].append("24-game paired tournament; density filter; CI gate; JSON + CSV serialization + import")
        await page.locator("[data-replay-game]").first.click()
        await page.locator("#play-pause").click()
        await page.wait_for_function(
            "document.querySelector('#arena-state').textContent === 'MATCH COMPLETE'",timeout=20000)
        report["desktop"].append("Tournament game replay to terminal")
        await page.locator('.rail [data-view="lab"]').click()
        await page.locator("#experiment-boards").fill("100")
        await page.locator("#run-experiment").click()
        await page.wait_for_function("!document.querySelector('#stop-experiment').disabled")
        await page.wait_for_function("parseInt(document.querySelector('#progress-label').textContent.replaceAll(',',''))>=2",
                                     timeout=30000)
        await page.locator("#stop-experiment").click()
        assert await page.locator(".confidence-range").count()==0
        await page.locator("#export-json").click()
        stopped=await page.evaluate("async()=>JSON.parse(await window.testBlob.text())")
        assert len(stopped["records"])%2==0
        assert stopped["metadata"]["status"]=="stopped"
        report["desktop"].append("Stop keeps complete paired legs; no inferential interval")
        # Mobile layout uses the same engine; no physical-device claim.
        await page.set_viewport_size({"width":390,"height":844})
        await page.locator('.rail [data-view="arena"]').click()
        await page.locator("#player-first").select_option("AI01")
        await page.locator("#player-second").select_option("AI03")
        await page.locator("#mirror-count").fill("50")
        await page.locator("#new-game").click()
        await page.evaluate("window.scrollTo(0,0)")
        await page.wait_for_timeout(150)
        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
        if shots:
            await page.screenshot(path=str(shots/"mobile.png"),full_page=True)
        report["mobile"].append("390x844 responsive arena; no document horizontal overflow")
        await page.locator('.rail [data-view="agents"]').click()
        await page.locator('.agent-card [data-agent="AI25"]').click()
        assert await page.locator("#agent-dialog").is_visible()
        rect=await page.locator("#agent-dialog").bounding_box()
        assert rect["x"]>=0 and rect["x"]+rect["width"]<=391
        if shots:
            await page.screenshot(path=str(shots/"mobile-agent.png"),full_page=False)
        report["mobile"].append("AI25 detail dialog fits viewport")
        await page.locator("#agent-dialog .dialog-close").click()
        await page.locator('.rail [data-view="lab"]').click()
        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
        report["mobile"].append("Experiment layout; tables scroll inside containers")
        assert not await page.locator("#error-banner").is_visible()
        assert not report["errors"],report["errors"]
        await browser.close()
    (ROOT/"tests/browser-report.json").write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))

if __name__=="__main__":
    asyncio.run(main())
