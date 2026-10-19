"""Capture an ultimate in the browser: heroes start at max mana - 1 (test-only route patch), burst screenshots."""
import os
import re
from playwright.sync_api import sync_playwright

out_dir = "scripts/verify_screens"
os.makedirs(out_dir, exist_ok=True)
NO_ULT = {"IRINI", "NYX", "TILLY", "RIP", "MING"}


def patch_sim(route):
    resp = route.fetch()
    body = resp.text()
    body = body.replace("export function createBattle(", "function __createBattleOrig(", 1)
    body += (
        "\nexport function createBattle(a){const b=__createBattleOrig(a);"
        "for(const u of b.state.units){if(u.team===1&&u.maxMana>0)u.mana=u.maxMana-1;}return b;}\n"
    )
    route.fulfill(response=resp, body=body, headers={**resp.headers, "content-type": "application/javascript"})


with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    page = b.new_page(viewport={"width": 1920, "height": 1080})
    errors = []
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
    page.route(re.compile(r".*/js/sim/index\.js.*"), patch_sim)

    page.goto("http://127.0.0.1:8080", wait_until="networkidle")
    page.evaluate("localStorage.setItem('guildrun.lang', 'en'); localStorage.removeItem('guildrun.save.v1');")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(800)
    page.locator(".gr-menu-buttons .gr-btn-primary").first.click()
    page.wait_for_timeout(600)

    chosen = None
    for attempt in range(6):
        if attempt == 0:
            page.locator(".gr-diff-start-area .gr-btn-primary").first.click()
        page.wait_for_timeout(900)
        cards = page.locator(".gr-initial-choice-col .gr-hero-card")
        names = [cards.nth(i).locator(".gr-hero-card-name").inner_text().strip().upper() for i in range(cards.count())]
        print("offers:", names)
        pref = os.environ.get('PREF_HERO', '').upper()
        if pref and pref in names:
            chosen = (names.index(pref), pref)
            break
        for i, n in enumerate(names):
            if n not in NO_ULT and not pref:
                chosen = (i, n)
                break
        if chosen:
            break
        rr = page.locator(".gr-initial-reroll-btn")
        if rr.count() == 0:
            break
        rr.first.click()
    idx = chosen[0] if chosen else 0
    print("chosen:", chosen)
    page.locator(".gr-initial-choice-col .gr-hero-card").nth(idx).click()
    page.wait_for_timeout(2500)

    page.locator(".gr-fight-btn-placement").first.click()
    frames = []
    for i in range(16):
        pth = f"{out_dir}/_ult_{i:02d}.png"
        page.screenshot(path=pth, clip={"x": 600, "y": 380, "width": 560, "height": 420})
        frames.append(pth)
        page.wait_for_timeout(40)
    from PIL import Image
    sheet = Image.new("RGB", (4 * 400, 4 * 300))
    for i, pth in enumerate(frames):
        sheet.paste(Image.open(pth).resize((400, 300)), ((i % 4) * 400, (i // 4) * 300))
        os.remove(pth)
    sheet.save(f"{out_dir}/8_ultimate_burst.png")
    print("Errors/Warnings:", errors[:20])
    b.close()
