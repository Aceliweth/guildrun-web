from playwright.sync_api import sync_playwright

out = "C:/Users/Aceliweth/.gemini/antigravity/brain/962cc5ca-a41c-4fba-9693-d4ca63ef796d"

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(
        viewport={"width": 874, "height": 402},
        device_scale_factor=3,
        is_mobile=True,
        has_touch=True,
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    )
    page = ctx.new_page()
    page.goto("http://127.0.0.1:8080/?ios=1", wait_until="networkidle")
    page.wait_for_timeout(800)
    page.screenshot(path=f"{out}/iphone_1_menu.png")
    print("1. Main Menu captured")

    page.locator(".gr-menu-btn-start, .gr-btn-primary").first.click()
    page.wait_for_timeout(600)
    page.screenshot(path=f"{out}/iphone_2_diff.png")
    print("2. Difficulty captured")

    page.locator(".gr-diff-start-area .gr-btn-primary").first.click()
    page.wait_for_timeout(700)
    skip = page.locator(".comic-skip-btn, .gr-comic-skip")
    if skip.count() > 0:
        skip.first.click()
        page.wait_for_timeout(600)
    page.screenshot(path=f"{out}/iphone_3_choose.png")
    print("3. Choose Hero captured")

    page.locator(".gr-initial-choice-col, .gr-hero-card").first.click()
    page.wait_for_timeout(1200)
    page.screenshot(path=f"{out}/iphone_4_placement.png")
    print("4. Placement captured")

    # Test Portrait Auto-Rotation (402x874)
    page.set_viewport_size({"width": 402, "height": 874})
    page.wait_for_timeout(600)
    page.screenshot(path=f"{out}/iphone_4_portrait_autorotated.png")
    print("4b. Portrait Auto-Rotated captured")

    # Back to Landscape (874x402) and start Battle
    page.set_viewport_size({"width": 874, "height": 402})
    page.wait_for_timeout(400)
    page.locator(".gr-fight-btn-placement").first.click()
    page.wait_for_timeout(1500)
    page.screenshot(path=f"{out}/iphone_5_battle.png")
    print("5. Battle captured")

    b.close()
print("ALL SCREENSHOTS CAPTURED OK")
