import os
from playwright.sync_api import sync_playwright

out_dir = "scripts/verify_screens"
os.makedirs(out_dir, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    errors = []
    page.on(
        "console",
        lambda msg: errors.append(f"{msg.type}: {msg.text}")
        if msg.type in ("error", "warning")
        else None,
    )
    page.on("pageerror", lambda err: errors.append(f"PAGEERROR: {err}"))

    page.goto("http://127.0.0.1:8080", wait_until="networkidle")
    page.evaluate("localStorage.setItem('guildrun.lang', 'en'); localStorage.removeItem('guildrun.save.v1');")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1000)
    page.screenshot(path=f"{out_dir}/1_main_menu.png")
    print("Captured 1_main_menu.png")

    # Click START GAME on Main Menu -> opens Difficulty Select
    start_btn = page.locator(".gr-menu-buttons .gr-btn-primary").first
    if start_btn.count() > 0:
        start_btn.click()
        page.wait_for_timeout(800)
    page.screenshot(path=f"{out_dir}/2_difficulty.png")
    print("Captured 2_difficulty.png")

    # Click START GAME on Difficulty Select -> opens Choose Hero
    diff_start = page.locator(".gr-diff-start-area .gr-btn-primary").first
    if diff_start.count() > 0:
        diff_start.click()
        page.wait_for_timeout(1000)
    page.screenshot(path=f"{out_dir}/3_choose_hero.png")
    print("Captured 3_choose_hero.png")

    # Click first hero card on Choose Hero -> opens Placement
    card = page.locator(".gr-initial-choice-col .gr-hero-card, .gr-hero-card").first
    if card.count() > 0:
        card.click()
        page.wait_for_timeout(1000)
    page.screenshot(path=f"{out_dir}/4_placement.png")
    print("Captured 4_placement.png")

    # Click FIGHT -> wait for battle result
    fight_btn = page.locator(".gr-fight-btn-placement").first
    if fight_btn.count() > 0 and fight_btn.is_visible():
        fight_btn.click()
        page.wait_for_timeout(800)
        for _ in range(45):
            if page.locator(".gr-battle-result-overlay").count() > 0:
                break
            sp = page.locator(".gr-speed-btn[data-speed]").last
            if sp.count() > 0 and sp.is_visible():
                try:
                    sp.click(timeout=200)
                except Exception:
                    pass
            page.wait_for_timeout(400)
    page.mouse.move(10, 10)
    page.wait_for_timeout(150)
    page.screenshot(path=f"{out_dir}/5_battle_won.png")
    print("Captured 5_battle_won.png")

    # Click PROCEED on Battle Won -> opens Shop
    proc_btn = page.locator(".gr-battle-result-overlay .gr-btn-primary").first
    if proc_btn.count() > 0 and proc_btn.is_visible():
        proc_btn.click()
        page.mouse.move(10, 10)
        page.wait_for_timeout(1000)
    page.screenshot(path=f"{out_dir}/6_shop.png")
    print("Captured 6_shop.png")

    print("Errors/Warnings:", errors[:20])
    browser.close()
