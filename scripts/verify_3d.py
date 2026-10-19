"""Verify live animated 3D models in Placement and Combat (screenshots + console/404 check)."""
import os
from playwright.sync_api import sync_playwright

out_dir = "scripts/verify_screens"
os.makedirs(out_dir, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    errors = []
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
    page.on("response", lambda r: errors.append(f"HTTP {r.status}: {r.url}") if r.status >= 400 else None)

    page.goto("http://127.0.0.1:8080", wait_until="networkidle")
    page.evaluate("localStorage.setItem('guildrun.lang', 'en'); localStorage.removeItem('guildrun.save.v1');")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(800)
    page.locator(".gr-menu-buttons .gr-btn-primary").first.click()
    page.wait_for_timeout(600)
    page.locator(".gr-diff-start-area .gr-btn-primary").first.click()
    page.wait_for_timeout(900)
    page.locator(".gr-initial-choice-col .gr-hero-card, .gr-hero-card").first.click()
    page.wait_for_timeout(3500)

    info = page.evaluate("""() => ({
        canvas: !!document.querySelector('.gr-placement-3d-canvas'),
        units: document.querySelectorAll('.gr-board-unit').length,
        ready3d: document.querySelectorAll('.gr-board-unit.has-3d-model').length,
    })""")
    print("Placement 3D:", info)
    page.mouse.move(10, 10)
    page.screenshot(path=f"{out_dir}/4a_placement_3d.png")
    page.wait_for_timeout(700)
    page.screenshot(path=f"{out_dir}/4a_placement_3d_t2.png")

    fight = page.locator(".gr-fight-btn-placement").first
    if fight.count() > 0:
        fight.click()
        page.wait_for_timeout(1200)
        page.screenshot(path=f"{out_dir}/4b_battle_3d.png")
        frames = []
        for i in range(12):
            pth = f"{out_dir}/_burst_{i:02d}.png"
            page.screenshot(path=pth, clip={"x": 560, "y": 330, "width": 640, "height": 480})
            frames.append(pth)
            page.wait_for_timeout(220)
        page.screenshot(path=f"{out_dir}/4c_battle_3d.png")
        from PIL import Image
        sheet = Image.new("RGB", (4 * 320, 3 * 240))
        for i, pth in enumerate(frames):
            im = Image.open(pth).resize((320, 240))
            sheet.paste(im, ((i % 4) * 320, (i // 4) * 240))
            os.remove(pth)
        sheet.save(f"{out_dir}/4d_battle_burst.png")
    print("Errors/Warnings:", errors[:25])
    browser.close()
