from playwright.sync_api import sync_playwright

ART = r"C:\Users\Aceliweth\.gemini\antigravity\brain\962cc5ca-a41c-4fba-9693-d4ca63ef796d"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": 1600, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto("http://127.0.0.1:8080", wait_until="networkidle")
    page.wait_for_timeout(800)

    # 1. Switch to FR and screenshot Main Menu
    page.evaluate("import('/js/data.js').then(m => m.setLang('fr'))")
    page.wait_for_timeout(400)
    page.screenshot(path=f"{ART}/lang_1_menu_fr.png")

    # 2. Switch to EN and screenshot Main Menu
    page.evaluate("import('/js/data.js').then(m => m.setLang('en'))")
    page.wait_for_timeout(400)
    page.screenshot(path=f"{ART}/lang_2_menu_en.png")

    # 3. Switch back to FR, start a run -> Choose Hero in FR (and hover a hero card for tooltip!)
    page.evaluate("import('/js/data.js').then(m => m.setLang('fr'))")
    page.wait_for_timeout(300)
    page.evaluate("window.__GUILDRUN_APP__.ctx.startNewRun({ difficulty: 6, seed: 12345 })")
    page.wait_for_timeout(600)
    help_btn = page.locator(".gr-hero-card-help").first
    if help_btn.count() > 0:
        help_btn.hover()
        page.wait_for_timeout(250)
    page.screenshot(path=f"{ART}/lang_3_choose_fr.png")

    # 4. Switch to EN on Choose Hero screen and screenshot
    page.evaluate("import('/js/data.js').then(m => m.setLang('en'))")
    page.wait_for_timeout(500)
    help_btn2 = page.locator(".gr-hero-card-help").first
    if help_btn2.count() > 0:
        help_btn2.hover()
        page.wait_for_timeout(250)
    page.screenshot(path=f"{ART}/lang_4_choose_en.png")

    print("Errors:", errors)
    b.close()
