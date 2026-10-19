import os
import time
from playwright.sync_api import sync_playwright

OUT_DIR = r"C:\Users\Aceliweth\.gemini\antigravity\brain\962cc5ca-a41c-4fba-9693-d4ca63ef796d"
URL = "http://127.0.0.1:8080/"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1600, "height": 900})
        page = context.new_page()

        errors = []
        page.on("pageerror", lambda err: errors.append(str(err)))

        page.goto(URL, wait_until="networkidle")
        page.wait_for_selector(".gr-main-menu", timeout=15000)
        time.sleep(0.4)

        # 1. Click CO-OP button on Main Menu
        page.click(".gr-menu-btn-coop")
        time.sleep(0.4)

        # 2. Click "CRÉER UN SALON CO-OP"
        page.click(".gr-coop-create-btn")
        time.sleep(0.6)

        # 3. Click "+ BOT ALLIÉ IA (ARIA)" so Slot 2 is filled
        page.click("button:has-text('ARIA')")
        time.sleep(0.5)
        page.screenshot(path=os.path.join(OUT_DIR, "coop_1_lobby.png"))
        print("Saved coop_1_lobby.png")

        # 4. Click "LANCER LA PARTIE CO-OP (2/2)"
        page.click("button:has-text('LANCER LA PARTIE CO-OP')")
        page.wait_for_selector(".gr-choose-hero-screen", timeout=10000)
        time.sleep(0.4)

        # 5. Pick starter hero + relic
        page.click(".gr-initial-choice-col >> nth=0 >> .gr-hero-card")
        page.wait_for_selector(".gr-placement-screen", timeout=10000)
        time.sleep(0.8)
        page.screenshot(path=os.path.join(OUT_DIR, "coop_2_placement_hud.png"))
        print("Saved coop_2_placement_hud.png")

        # 6. Open Trade Modal via Co-Op HUD widget
        page.click(".gr-coop-btn-trade")
        time.sleep(0.4)
        page.screenshot(path=os.path.join(OUT_DIR, "coop_3_trade_modal.png"))
        print("Saved coop_3_trade_modal.png")

        # 6b. Switch to "ESCOUADE ALLIÉE" tab
        page.click(".gr-coop-tab >> nth=1")
        time.sleep(0.4)
        page.screenshot(path=os.path.join(OUT_DIR, "coop_3b_squad_modal.png"))
        print("Saved coop_3b_squad_modal.png")

        # Switch back to Trade tab, send 5 shards to partner, and close window
        page.click(".gr-coop-tab >> nth=0")
        time.sleep(0.2)
        page.click("button:has-text('ENVOYER 5')")
        time.sleep(0.3)
        page.click(".gr-coop-back-btn")
        time.sleep(0.3)

        # 7. Start Battle and spawn Ally Reinforcements!
        page.click(".gr-fight-btn-placement")
        page.wait_for_selector(".gr-battle-canvas", timeout=10000)
        time.sleep(0.3)
        page.evaluate("""() => {
            const app = window.__GUILDRUN_APP__;
            if (app && app.ctx && app.ctx.activeBattle) {
                app.ctx.activeBattle.spawnReinforcements([
                    { uid: 'ally_1', heroId: 2, rank: 2, hpRatio: 0.9, items: [101] },
                    { uid: 'ally_2', heroId: 5, rank: 2, hpRatio: 0.85, items: [102] }
                ], 'ARIA · ALLIÉ');
            }
        }""")
        time.sleep(0.5)
        page.screenshot(path=os.path.join(OUT_DIR, "coop_4_reinforcements_battle.png"))
        print("Saved coop_4_reinforcements_battle.png")

        browser.close()
        if errors:
            print("ERRORS:", errors)
            raise SystemExit(1)
        print("COOP_IMPECCABLE_E2E_SUCCESS")

if __name__ == "__main__":
    main()
