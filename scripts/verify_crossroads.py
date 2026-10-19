"""Reach the Crossroads screen and capture it (plus a hover state)."""
import os
from playwright.sync_api import sync_playwright

out_dir = "scripts/verify_screens"
os.makedirs(out_dir, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    page = b.new_page(viewport={"width": 1920, "height": 1080})
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
    page.locator(".gr-hero-card").first.click()
    page.wait_for_timeout(1500)

    for step in range(8):
        if page.locator(".gr-crossroads-gate").count() > 0:
            break
        if page.locator(".gr-fight-btn-placement").count() > 0:
            page.locator(".gr-fight-btn-placement").first.click()
            for _ in range(80):
                if page.locator(".gr-battle-result-overlay").count() > 0:
                    break
                page.wait_for_timeout(400)
        elif page.locator(".gr-battle-result-overlay .gr-btn-primary").count() > 0:
            page.locator(".gr-battle-result-overlay .gr-btn-primary").first.click()
        elif page.locator(".gr-shop-window .gr-btn-primary").count() > 0:
            page.locator(".gr-shop-window .gr-btn-primary").first.click()
        page.wait_for_timeout(1200)

    page.mouse.move(5, 5)
    page.wait_for_timeout(800)
    page.screenshot(path=f"{out_dir}/7_crossroads.png")
    gates = page.locator(".gr-gate-portal")
    print("gates:", gates.count())
    if gates.count() > 0:
        gates.first.hover()
        page.wait_for_timeout(400)
        page.screenshot(path=f"{out_dir}/7_crossroads_hover.png")
    print("Errors/Warnings:", errors[:20])
    b.close()
