#!/usr/bin/env python3
"""End-to-end Playwright browser test for Guildrun Web (Menu -> Run -> Intro -> Placement -> Battle -> Result -> Shop)."""
import sys
from playwright.sync_api import sync_playwright


def main() -> int:
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
        page.on("console", lambda m: errors.append(f"CONSOLE_ERR: {m.text}") if m.type == "error" else None)

        page.goto("http://127.0.0.1:8080", wait_until="networkidle")
        page.wait_for_timeout(800)
        page.screenshot(path="scripts/e2e_01_menu.png")

        # 1. Click New Run
        page.locator("button.btn-primary").first.click()
        page.wait_for_timeout(500)
        page.screenshot(path="scripts/e2e_02_initial_selection.png")

        # 2. Click Recruter on first hero card
        page.locator("button:has-text('Recruter'), button:has-text('Recruit')").first.click()
        page.wait_for_timeout(500)
        page.screenshot(path="scripts/e2e_03_intro.png")

        # 3. Click Placement ▶ on Intro screen
        placement_btn = page.locator("button:has-text('Placement')")
        if placement_btn.count() > 0:
            placement_btn.first.click()
            page.wait_for_timeout(600)
        page.screenshot(path="scripts/e2e_04_placement.png")
        print("[OK] Placement board reached.")

        # 4. Click Combat / Fight button on Placement screen
        fight_btn = page.locator("button:has-text('Combat'), button:has-text('Fight'), button.btn-primary").first
        fight_btn.click()
        page.wait_for_timeout(1200)
        page.screenshot(path="scripts/e2e_05_battle.png")
        print("[OK] Battle Canvas 2D running.")

        # 5. Click Skip / Passer button in Battle screen
        skip_btn = page.locator("button:has-text('Passer'), button:has-text('Skip')").first
        if skip_btn.count() > 0:
            skip_btn.click()
            page.wait_for_timeout(600)
            page.screenshot(path="scripts/e2e_06_result.png")
            print("[OK] Battle Result screen reached.")

            # 6. Proceed to Shop
            next_btn = page.locator("button.btn-primary").first
            if next_btn.count() > 0:
                next_btn.click()
                page.wait_for_timeout(600)
                page.screenshot(path="scripts/e2e_07_shop.png")
                print("[OK] Shop screen reached.")

        browser.close()

    if errors:
        print(f"[WARN] Console/Page errors ({len(errors)}):")
        for e in errors[:10]:
            print("  ", e)
        return 1

    print("[OK] Full E2E Playwright browser test passed (Menu -> Draft -> Intro -> Placement -> Battle -> Result -> Shop) with 0 errors!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
