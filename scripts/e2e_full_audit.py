#!/usr/bin/env python3
"""
Comprehensive Live-Browser E2E Audit for GuildRun Web (`http://127.0.0.1:8080`).

Tests:
1. Main Menu & Leaderboard rendering, image loading, and text cleanliness
2. Compendium Modal (Heroes + Rank C/B/A/S switcher, Items, Relics, Classes & Guilds, Enemies tabs + Tooltips)
3. Settings Modal & Localization (EN <-> FR full sweep across Compendium & UI)
4. Difficulty Selection (Base .. SSS + Red Rift toggle + Start Game)
5. Initial Selection (Starter Heroes, Starter Relics, Ability/Hero/Relic Tooltips, Reroll, Offer Selection)
6. Placement Phase (Hex Board, Party <-> Reserve, Item Equip/Unequip, Tooltips, Fight)
7. Live Battle & Post-Battle Result (Speed buttons 1x/2x/3x, Damage Tracker tabs, Result Tracker & Hero Stats tabs, Proceed)
8. Shop Phase (Buy Hero/Item/Relic, Freeze, Reroll, Sell Mode, Rank-Up Modal, Relic Picker Modal, Item Picker Modal)
9. Crossroads Screen (Gate portals, anchored boxes, gate selection)
10. Event Screen (12 diverse events swept + option selection)
11. Campfire Screen (Train/Study/Rest actions)
12. End-of-Run Summary Screen (Victory & Defeat states)
"""

import re
import sys
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:8080"

BAD_TEXT_PATTERNS = [
    (re.compile(r"\bundefined\b"), "literal 'undefined'"),
    (re.compile(r"\bNaN\b"), "literal 'NaN'"),
    (re.compile(r"\[object [A-Za-z]+\]"), "serialized '[object ...]'"),
    (re.compile(r"\{\d+\}"), "unresolved numeric placeholder '{N}'"),
    (re.compile(r"\{[A-Za-z_][\w.-]*\}"), "unresolved named placeholder '{var}'"),
    (re.compile(r"\[[^\[\]]*\]<[a-zA-Z_0-9/_-]+>"), "unparsed richText tag '[text]<tag>'"),
    (re.compile(r"<(?:statcalc|datatracking|customdata|hp/s|maxhp|basicstat|attackpower|abilitypower)", re.I), "raw richText angle tag"),
    (re.compile(r"\b(?:Hero|Item|Relic|Ability|Passive|Event|Crossroads|UI|Status)_[A-Za-z0-9_]+\b"), "raw localization key"),
]


class AuditReport:
    def __init__(self):
        self.console_errors = []
        self.page_errors = []
        self.network_failures = []
        self.broken_images = []
        self.text_issues = []
        self.tooltip_issues = []
        self.interaction_issues = []
        self.steps_passed = []

    def check_page_health(self, page, context_label):
        # 1. Check visible text for bad patterns
        body_text = page.evaluate("""() => {
            return document.body ? document.body.innerText : '';
        }""")
        for regex, desc in BAD_TEXT_PATTERNS:
            m = regex.search(body_text)
            if m:
                snippet = body_text[max(0, m.start() - 30):min(len(body_text), m.end() + 30)].replace("\n", " ")
                issue = f"[{context_label}] Text issue ({desc}): matched '{m.group(0)}' in '...{snippet}...'"
                if issue not in self.text_issues:
                    self.text_issues.append(issue)

        # 2. Wait up to 2.5s for any visible in-flight images to finish loading, then check naturalWidth > 0
        page.evaluate("""() => new Promise((resolve) => {
            const imgs = Array.from(document.querySelectorAll('img')).filter((img) => {
                const rect = img.getBoundingClientRect();
                const style = window.getComputedStyle(img);
                return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
            });
            const pending = imgs.filter((img) => !img.complete);
            if (!pending.length) return resolve();
            let left = pending.length;
            const done = () => { if (--left <= 0) resolve(); };
            for (const img of pending) {
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
            }
            setTimeout(resolve, 2500);
        })""")
        bad_imgs = page.evaluate("""() => {
            const imgs = Array.from(document.querySelectorAll('img'));
            const broken = [];
            for (const img of imgs) {
                const rect = img.getBoundingClientRect();
                const style = window.getComputedStyle(img);
                if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) {
                    continue;
                }
                if (!img.complete || img.naturalWidth === 0) {
                    broken.push(img.getAttribute('src') || img.src);
                }
            }
            return broken;
        }""")
        for src in bad_imgs:
            issue = f"[{context_label}] Broken image (naturalWidth=0): {src}"
            if issue not in self.broken_images:
                self.broken_images.append(issue)

    def check_tooltip(self, page, selector, context_label, max_samples=5):
        els = page.locator(selector)
        count = els.count()
        if count == 0:
            return 0
        checked = 0
        for i in range(min(count, max_samples)):
            el = els.nth(i)
            if not el.is_visible():
                continue
            try:
                page.mouse.move(2, 2)
                page.wait_for_timeout(30)
                el.hover(timeout=2000)
                page.wait_for_timeout(60)
                tip_info = page.evaluate("""() => {
                    const t = document.querySelector('.tooltip.show');
                    if (!t) return { shown: false, text: '', html: '' };
                    return { shown: true, text: t.innerText || '', html: t.innerHTML || '' };
                }""")
                if not tip_info["shown"] or not tip_info["text"].strip():
                    self.tooltip_issues.append(f"[{context_label}] Tooltip did not show for {selector} (nth={i})")
                else:
                    for regex, desc in BAD_TEXT_PATTERNS:
                        m = regex.search(tip_info["text"])
                        if m:
                            self.tooltip_issues.append(
                                f"[{context_label}] Tooltip bad text ({desc}) on {selector}#{i}: '{m.group(0)}' in '{tip_info['text'][:120]}'"
                            )
                checked += 1
            except Exception as exc:
                self.tooltip_issues.append(f"[{context_label}] Hover failed on {selector}#{i}: {exc}")
        page.mouse.move(2, 2)
        return checked

    def summary_ok(self):
        return (
            len(self.console_errors) == 0
            and len(self.page_errors) == 0
            and len(self.network_failures) == 0
            and len(self.broken_images) == 0
            and len(self.text_issues) == 0
            and len(self.tooltip_issues) == 0
            and len(self.interaction_issues) == 0
        )


def close_top_modal(page):
    close_btn = page.locator(".modal-backdrop .modal-actions button, .modal-backdrop .modal-close").last
    if close_btn.is_visible():
        close_btn.click()
        page.wait_for_timeout(120)


def run_audit():
    report = AuditReport()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        page.on("pageerror", lambda err: report.page_errors.append(str(err)))
        page.on(
            "console",
            lambda msg: report.console_errors.append(msg.text)
            if msg.type == "error"
            else None,
        )
        page.on(
            "response",
            lambda res: report.network_failures.append(f"{res.status} {res.url}")
            if res.status >= 400
            else None,
        )

        print(f"Navigating to {BASE_URL} ...")
        page.goto(BASE_URL, wait_until="networkidle")
        page.wait_for_selector(".gr-main-menu", timeout=10000)
        page.wait_for_timeout(200)
        report.check_page_health(page, "Main Menu (Initial)")

        # Switch to English first so we test EN then FR systematically
        page.click(".gr-menu-btn-settings")
        page.wait_for_selector(".modal-backdrop", timeout=5000)
        page.locator(".settings-form .btn-group button").nth(1).click()
        page.wait_for_timeout(150)
        close_top_modal(page)
        report.check_page_health(page, "Main Menu (EN)")
        report.steps_passed.append("Main Menu loaded & verified")

        # ------------------------------------------------------------------
        # 1. Compendium Modal (EN)
        # ------------------------------------------------------------------
        print("Testing Compendium Modal (EN)...")
        page.click(".gr-menu-btn-compendium")
        page.wait_for_selector(".modal-compendium", timeout=5000)
        page.wait_for_timeout(150)
        report.check_page_health(page, "Compendium - Heroes Tab (EN)")

        # Test switching heroes and ranks in Compendium Heroes tab
        hero_btns = page.locator(".modal-compendium .comp-hero-btn")
        for h_idx in range(min(4, hero_btns.count())):
            hero_btns.nth(h_idx).click()
            page.wait_for_timeout(80)
            rank_btns = page.locator(".modal-compendium .comp-rank-switcher button")
            for r_idx in range(rank_btns.count()):
                rank_btns.nth(r_idx).click()
                page.wait_for_timeout(50)
            report.check_page_health(page, f"Compendium - Hero #{h_idx} Detail (EN)")

        # Test Items, Relics, Classes & Guilds, Enemies tabs
        comp_tabs = page.locator(".modal-compendium .comp-tabs button")
        for tab_idx, (tab_name, has_tooltip) in enumerate([
            ("Heroes", False),
            ("Items", True),
            ("Relics", True),
            ("Classes", False),
            ("Enemies", True),
        ]):
            if tab_idx == 0:
                continue
            comp_tabs.nth(tab_idx).click()
            page.wait_for_timeout(150)
            report.check_page_health(page, f"Compendium - {tab_name} Tab (EN)")
            if has_tooltip:
                report.check_tooltip(
                    page,
                    ".modal-compendium .comp-card-grid .comp-entry-card",
                    f"Compendium {tab_name} (EN)",
                    max_samples=6,
                )

        close_top_modal(page)
        report.steps_passed.append("Compendium Modal (EN) all 5 tabs + rank switcher + tooltips")

        # ------------------------------------------------------------------
        # 2. Settings Modal & French Localization Sweep
        # ------------------------------------------------------------------
        print("Testing Settings Modal & FR Localization...")
        page.click(".gr-menu-btn-settings")
        page.wait_for_selector(".modal-backdrop", timeout=5000)
        report.check_page_health(page, "Settings Modal (EN)")
        # Click Français (FR)
        page.locator(".settings-form .btn-group button").nth(0).click()
        page.wait_for_timeout(150)
        report.check_page_health(page, "Settings Modal (FR)")
        close_top_modal(page)
        report.check_page_health(page, "Main Menu (FR)")

        # Open Compendium in FR
        page.click(".gr-menu-btn-compendium")
        page.wait_for_selector(".modal-compendium", timeout=5000)
        page.wait_for_timeout(150)
        report.check_page_health(page, "Compendium - Heroes Tab (FR)")

        comp_tabs_fr = page.locator(".modal-compendium .comp-tabs button")
        for tab_idx, (tab_name, has_tooltip) in enumerate([
            ("Heroes", False),
            ("Items", True),
            ("Relics", True),
            ("Classes", False),
            ("Enemies", True),
        ]):
            if tab_idx == 0:
                continue
            comp_tabs_fr.nth(tab_idx).click()
            page.wait_for_timeout(120)
            report.check_page_health(page, f"Compendium - {tab_name} Tab (FR)")
            if has_tooltip:
                report.check_tooltip(
                    page,
                    ".modal-compendium .comp-card-grid .comp-entry-card",
                    f"Compendium {tab_name} (FR)",
                    max_samples=5,
                )

        close_top_modal(page)

        # Switch back to EN via Settings
        page.click(".gr-menu-btn-settings")
        page.wait_for_selector(".modal-backdrop", timeout=5000)
        page.locator(".settings-form .btn-group button").nth(1).click()
        page.wait_for_timeout(150)
        close_top_modal(page)
        report.steps_passed.append("Settings Modal & FR/EN localization sweep")

        # ------------------------------------------------------------------
        # 3. Difficulty Selection Screen
        # ------------------------------------------------------------------
        print("Testing Difficulty Selection Screen...")
        page.click(".gr-menu-btn-start")
        page.wait_for_selector(".gr-difficulty-screen", timeout=5000)
        page.wait_for_timeout(150)
        report.check_page_health(page, "Difficulty Select Screen")

        diff_boxes = page.locator(".gr-diff-box[data-difficulty]")
        for idx in range(diff_boxes.count()):
            diff_boxes.nth(idx).click()
            page.wait_for_timeout(50)
            report.check_page_health(page, f"Difficulty Select Tier #{idx}")

        # Toggle Red Rift on and off
        red_rift = page.locator(".gr-diff-box-redrift")
        if red_rift.is_visible():
            red_rift.click()
            page.wait_for_timeout(60)
            report.check_page_health(page, "Difficulty Select Red Rift ON")
            red_rift.click()
            page.wait_for_timeout(60)

        # Select Base difficulty (0) and click START GAME
        page.locator('.gr-diff-box[data-difficulty="0"]').click()
        page.wait_for_timeout(60)
        page.click(".gr-diff-start-btn")
        page.wait_for_selector(".gr-choose-hero-screen", timeout=5000)
        page.wait_for_timeout(150)
        report.steps_passed.append("Difficulty Selection (Base..SSS + Red Rift + Start Game)")

        # ------------------------------------------------------------------
        # 4. Initial Selection Screen (CHOOSE HERO)
        # ------------------------------------------------------------------
        print("Testing Initial Selection Screen...")
        report.check_page_health(page, "Initial Selection Screen")
        report.check_tooltip(page, ".gr-choose-hero-screen .gr-hero-card-help", "Initial Hero Help Tooltip", max_samples=3)
        report.check_tooltip(page, ".gr-choose-hero-screen .gr-diamond-slot.filled", "Initial Ability Diamond Tooltip", max_samples=3)
        report.check_tooltip(page, ".gr-choose-hero-screen .gr-initial-relic-box", "Initial Relic Box Tooltip", max_samples=3)

        # Test Reroll button
        reroll_btn = page.locator(".gr-initial-reroll-btn")
        if reroll_btn.is_visible() and not reroll_btn.is_disabled():
            reroll_btn.click()
            page.wait_for_timeout(150)
            report.check_page_health(page, "Initial Selection After Reroll")

        # Select the first Hero+Relic column -> enters Placement screen
        page.locator(".gr-initial-choice-col").first.click()
        page.wait_for_selector(".screen-placement", timeout=5000)
        page.wait_for_timeout(200)
        report.steps_passed.append("Initial Selection (Tooltips, Reroll, Offer Selection)")

        # ------------------------------------------------------------------
        # 5. Placement Phase & Board/Reserve/Item Interactions
        # ------------------------------------------------------------------
        print("Testing Placement Phase...")
        report.check_page_health(page, "Placement Phase")
        report.check_tooltip(page, ".gr-board-unit.hero-unit", "Placement Hero Unit Tooltip", max_samples=2)
        report.check_tooltip(page, ".gr-board-unit.enemy-unit", "Placement Enemy Unit Tooltip", max_samples=3)
        report.check_tooltip(page, ".relic-slot", "Placement Relic Slot Tooltip", max_samples=2)

        # Add a reserve hero and an inventory item to test Reserve <-> Board & Item Equip/Unequip
        page.evaluate("""() => {
            const { app, ctx } = window.__GUILDRUN_APP__;
            const st = app.run.serialize ? app.run.serialize() : app.run.getState();
            const heroIds = Object.keys(app.data.heroes).map(Number);
            const itemIds = Object.keys(app.data.items).map(Number);
            const ownedIds = new Set((st.heroes || []).map(h => Number(h.heroId)));
            const extraHeroId = heroIds.find(id => !ownedIds.has(id)) || heroIds[0];
            if (app.run.addOrMergeHero) {
                app.run.addOrMergeHero(extraHeroId, 1, { autoPlace: false });
            }
            if (app.run.grantItem) {
                app.run.grantItem(itemIds[0], { autoEquip: false });
            }
            ctx.rerender();
        }""")
        page.wait_for_timeout(150)
        report.check_page_health(page, "Placement Phase (With Reserve Hero & Inventory Item)")
        report.check_tooltip(page, ".item-slot.filled", "Placement Inventory Item Tooltip", max_samples=2)

        # Click the inventory item to equip it onto the board hero
        inv_item = page.locator(".inv-grid .item-slot.filled, .item-slot.filled").first
        if inv_item.is_visible():
            inv_item.click()
            page.wait_for_timeout(120)
            report.check_page_health(page, "Placement Phase (After Equipping Item)")

        # Click a filled reserve slot to deploy the reserve hero onto the board
        res_slot = page.locator(".gr-party-slot.reserve.filled").first
        if res_slot.is_visible():
            res_slot.click()
            page.wait_for_timeout(120)
            report.check_page_health(page, "Placement Phase (After Deploying Reserve Hero)")

        report.steps_passed.append("Placement Phase (Board, Reserve Deploy, Item Equip, Tooltips)")

        # ------------------------------------------------------------------
        # 6. Live Battle & Post-Battle Result Screen
        # ------------------------------------------------------------------
        print("Testing Live Battle & Post-Battle Result...")
        # Set battleSpeed = 3 and click FIGHT
        page.evaluate("""() => {
            window.__GUILDRUN_APP__.ctx.setSpeed(3);
        }""")
        page.click(".gr-fight-btn-placement")
        page.wait_for_selector(".screen-battle", timeout=5000)
        page.wait_for_timeout(200)
        report.check_page_health(page, "Battle Phase (Live)")

        # Click speed buttons (2X, 3X) and tracker tabs (TAKEN, HEALED, DEALT)
        for sp in ["2", "3"]:
            sp_btn = page.locator(f'.gr-speed-btn[data-speed="{sp}"]')
            if sp_btn.count() > 0 and sp_btn.first.is_visible():
                sp_btn.first.click()
                page.wait_for_timeout(40)

        for mode in ["taken", "healed", "dealt"]:
            tb = page.locator(f'.gr-tracker-tab[data-mode="{mode}"]')
            if tb.count() > 0 and tb.first.is_visible():
                tb.first.click()
                page.wait_for_timeout(40)

        # Fast-forward battle ticks if still running so test completes rapidly
        page.evaluate("""() => {
            const { app } = window.__GUILDRUN_APP__;
            const b = app.activeBattle;
            if (b && typeof b.tick === 'function' && typeof b.isOver === 'function') {
                let guard = 0;
                while (!b.isOver() && guard++ < 4000) {
                    b.tick(0.05);
                }
            }
        }""")

        page.wait_for_selector(".screen-result", timeout=15000)
        page.wait_for_timeout(200)
        report.check_page_health(page, "Post-Battle Result Screen (TRACKER Tab)")
        report.check_tooltip(page, ".gr-result-vs-unit", "Post-Battle Result VS Unit Tooltip", max_samples=4)

        # Switch to HERO STATS tab and back to TRACKER tab
        res_tabs = page.locator(".gr-result-tab")
        if res_tabs.count() >= 2:
            res_tabs.nth(1).click()
            page.wait_for_timeout(100)
            report.check_page_health(page, "Post-Battle Result Screen (HERO STATS Tab)")
            res_tabs.nth(0).click()
            page.wait_for_timeout(80)

        # Click PROCEED -> enters Shop
        page.click(".gr-result-proceed-btn")
        page.wait_for_timeout(200)
        report.steps_passed.append("Live Battle & Post-Battle Result (Speed, Tracker, Stats, Proceed)")

        # ------------------------------------------------------------------
        # 7. Shop Phase, Rank-Up Modal, Relic Picker Modal, Item Picker Modal
        # ------------------------------------------------------------------
        print("Testing Shop Phase & Modals...")
        # Dismiss any auto-opened modal first if present
        if page.locator(".modal-relic-picker .relic-picker-card").count() > 0:
            page.locator(".modal-relic-picker .relic-picker-card").first.click()
            page.wait_for_timeout(120)

        page.wait_for_selector(".screen-shop", timeout=5000)
        page.wait_for_timeout(150)
        report.check_page_health(page, "Shop Screen")
        report.check_tooltip(page, ".gr-shop-offer-row.is-item:not(.is-sold)", "Shop Item Offer Tooltip", max_samples=2)
        report.check_tooltip(page, ".gr-shop-offer-row.is-relic:not(.is-sold)", "Shop Relic Offer Tooltip", max_samples=2)
        report.check_tooltip(page, ".gr-shop-hero-col .gr-hero-card-help", "Shop Hero Card Tooltip", max_samples=3)

        # Give player 300 Shards to test Freeze, Reroll, Buy Item, Buy Relic, Buy Hero
        page.evaluate("""() => {
            const { app, ctx } = window.__GUILDRUN_APP__;
            const st = app.run.serialize();
            st.shards = 300;
            app.run.hydrate(st);
            ctx.rerender();
        }""")
        page.wait_for_timeout(120)

        # Test Freeze Shop button
        shop_btns = page.locator(".gr-shop-topbar .gr-shop-btn")
        if shop_btns.count() >= 2:
            shop_btns.nth(1).click()  # Freeze
            page.wait_for_timeout(80)
            report.check_page_health(page, "Shop Screen (Frozen)")
            shop_btns.nth(1).click()  # Unfreeze
            page.wait_for_timeout(80)
            shop_btns.nth(0).click()  # Reroll Shop
            page.wait_for_timeout(120)
            report.check_page_health(page, "Shop Screen (After Reroll)")

        # Buy an item offer
        item_offer = page.locator(".gr-shop-offer-row.is-item:not(.is-sold)").first
        if item_offer.is_visible():
            item_offer.click()
            page.wait_for_timeout(120)
            report.check_page_health(page, "Shop Screen (After Buying Item)")

        # Buy a relic offer
        relic_offer = page.locator(".gr-shop-offer-row.is-relic:not(.is-sold)").first
        if relic_offer.is_visible():
            relic_offer.click()
            page.wait_for_timeout(120)
            report.check_page_health(page, "Shop Screen (After Buying Relic)")

        # Buy a hero card
        hero_offer = page.locator(".gr-shop-hero-col .gr-hero-card:not(.is-sold)").first
        if hero_offer.is_visible():
            hero_offer.click()
            page.wait_for_timeout(120)
            report.check_page_health(page, "Shop Screen (After Buying Hero)")

        # Explicitly test Relic Picker Modal (`pendingRelicChoices`)
        page.evaluate("""() => {
            const { app, ctx } = window.__GUILDRUN_APP__;
            const st = app.run.serialize();
            const relicIds = Object.keys(app.data.relics).map(Number).slice(0, 3);
            st.pendingRelicChoices = { choices: relicIds, title: 'CHOOSE A RELIC', canSkip: true };
            app.run.hydrate(st);
            ctx.rerender();
        }""")
        page.wait_for_selector(".modal-relic-picker", timeout=5000)
        page.wait_for_timeout(150)
        report.check_page_health(page, "Relic Picker Modal")
        report.check_tooltip(page, ".modal-relic-picker .relic-picker-card", "Relic Picker Card Tooltip", max_samples=3)
        page.locator(".modal-relic-picker .relic-picker-card").first.click()
        page.wait_for_timeout(150)

        # Explicitly test Item Picker Modal (`pendingItemChoices`)
        page.evaluate("""() => {
            const { app, ctx } = window.__GUILDRUN_APP__;
            const st = app.run.serialize();
            const itemIds = Object.keys(app.data.items).map(Number).slice(0, 3);
            st.pendingItemChoices = { choices: itemIds, title: 'CHOOSE AN ITEM', canSkip: true };
            app.run.hydrate(st);
            ctx.rerender();
        }""")
        page.wait_for_selector(".modal-relic-picker", timeout=5000)
        page.wait_for_timeout(150)
        report.check_page_health(page, "Item Picker Modal")
        report.check_tooltip(page, ".modal-relic-picker .relic-picker-card", "Item Picker Card Tooltip", max_samples=3)
        page.locator(".modal-relic-picker .relic-picker-card").first.click()
        page.wait_for_timeout(150)

        # Explicitly test Rank-Up Modal (`pendingRankUp`)
        page.evaluate("""() => {
            const { app, ctx } = window.__GUILDRUN_APP__;
            const st = app.run.serialize();
            const h = st.heroes[0];
            const def = app.data.heroes[h.heroId];
            const specs = def?.specializationIds || Object.keys(app.data.specializations).map(Number).slice(0, 2);
            st.pendingRankUp = {
                heroUid: h.uid ?? h.instanceId,
                rank: 2,
                choices: specs,
            };
            app.run.hydrate(st);
            ctx.rerender();
        }""")
        page.wait_for_selector(".modal-rankup", timeout=5000)
        page.wait_for_timeout(150)
        report.check_page_health(page, "Rank-Up / Specialization Modal")
        report.check_tooltip(page, ".modal-rankup .rankup-card", "Rank-Up Card Tooltip", max_samples=2)
        page.locator(".modal-rankup .rankup-card").first.click()
        page.wait_for_timeout(150)
        report.steps_passed.append("Shop Phase (Freeze, Reroll, Buy Item/Relic/Hero) + Relic/Item/Rank-Up Modals")

        # Click PROCEED to leave Shop -> Crossroads
        page.click(".gr-shop-proceed-btn")
        page.wait_for_selector(".screen-crossroads", timeout=5000)
        page.wait_for_timeout(200)

        # ------------------------------------------------------------------
        # 8. Crossroads Phase
        # ------------------------------------------------------------------
        print("Testing Crossroads Screen...")
        report.check_page_health(page, "Crossroads Screen")
        gates = page.locator(".gr-crossroads-gate")
        if gates.count() == 0:
            report.interaction_issues.append("[Crossroads] No gate portals rendered on Crossroads screen")
        else:
            for g_idx in range(gates.count()):
                gates.nth(g_idx).hover()
                page.wait_for_timeout(60)
        report.steps_passed.append("Crossroads Screen (3 Gates + Hover States)")

        # ------------------------------------------------------------------
        # 9. Narrative Event Screen (Sweep 15 Events)
        # ------------------------------------------------------------------
        print("Testing Narrative Event Screen across 15 events...")
        event_ids = page.evaluate("""() => Object.keys(window.__GUILDRUN_APP__.app.data.events).map(Number).slice(0, 15)""")
        for eid in event_ids:
            page.evaluate(f"""() => {{
                const {{ app, ctx }} = window.__GUILDRUN_APP__;
                if (typeof app.run.openEventNode === 'function') {{
                    app.run.openEventNode({eid});
                }} else {{
                    const st = app.run.serialize();
                    st.phase = 'Event';
                    st.event = app.data.events[{eid}] || {{ id: {eid} }};
                    app.run.hydrate(st);
                }}
                ctx.rerender();
            }}""")
            page.wait_for_timeout(60)
            report.check_page_health(page, f"Event Screen (eventId={eid})")

        # Click an enabled event choice button
        choice_btn = page.locator(".gr-event-choice-btn:not([disabled])").first
        if choice_btn.is_visible():
            choice_btn.click()
            page.wait_for_timeout(150)
            # Dismiss any relic/item picker modal if the event choice opened one
            if page.locator(".modal-relic-picker .relic-picker-card").count() > 0:
                page.locator(".modal-relic-picker .relic-picker-card").first.click()
                page.wait_for_timeout(120)
            report.check_page_health(page, "After Picking Event Option")
        report.steps_passed.append("Narrative Event Screen (15 events swept + option choice)")

        # ------------------------------------------------------------------
        # 10. Campfire Screen
        # ------------------------------------------------------------------
        print("Testing Campfire Screen...")
        page.evaluate("""() => {
            const { app, ctx } = window.__GUILDRUN_APP__;
            if (typeof app.run.openCampfireNode === 'function') {
                app.run.openCampfireNode(600);
            } else {
                const st = app.run.serialize();
                st.phase = 'Campfire';
                st.event = null;
                st.campfire = { remainingActions: 1 };
                app.run.hydrate(st);
            }
            ctx.rerender();
        }""")
        page.wait_for_timeout(150)
        report.check_page_health(page, "Campfire Screen")

        camp_choice = page.locator(".gr-event-choice-btn:not([disabled])").first
        if camp_choice.is_visible():
            camp_choice.click()
            page.wait_for_timeout(150)
            if page.locator(".modal-rankup .rankup-card").count() > 0:
                page.locator(".modal-rankup .rankup-card").first.click()
                page.wait_for_timeout(120)
            report.check_page_health(page, "After Campfire Action")
        report.steps_passed.append("Campfire Screen")

        # ------------------------------------------------------------------
        # 11. End-of-Run Summary Screen (Victory & Defeat)
        # ------------------------------------------------------------------
        print("Testing End-of-Run Summary Screen...")
        page.evaluate("""() => {
            const { app, ctx } = window.__GUILDRUN_APP__;
            const st = app.run.serialize();
            st.phase = 'Complete';
            st.lastResult = { winner: 'players' };
            app.run.hydrate(st);
            ctx.rerender();
        }""")
        page.wait_for_selector(".screen-endrun", timeout=5000)
        page.wait_for_timeout(150)
        report.check_page_health(page, "End-of-Run Screen (Victory)")
        report.check_tooltip(page, ".screen-endrun .endrun-hero-card", "End-of-Run Hero Card Tooltip", max_samples=2)

        page.evaluate("""() => {
            const { app, ctx } = window.__GUILDRUN_APP__;
            const st = app.run.serialize();
            st.phase = 'Complete';
            st.lastResult = { winner: 'enemies' };
            st.lives = 0;
            app.run.hydrate(st);
            ctx.rerender();
        }""")
        page.wait_for_timeout(150)
        report.check_page_health(page, "End-of-Run Screen (Defeat)")
        report.steps_passed.append("End-of-Run Summary Screen (Victory & Defeat)")

        browser.close()

    # Print Report
    print("\n" + "=" * 72)
    print("GUILDRUN WEB LIVE-BROWSER E2E AUDIT REPORT")
    print("=" * 72)
    print(f"Steps Passed ({len(report.steps_passed)}):")
    for s in report.steps_passed:
        print(f"  [PASS] {s}")
    print("-" * 72)
    print(f"Page Errors:         {len(report.page_errors)}")
    for e in report.page_errors:
        print(f"  [PAGEERROR] {e}")
    print(f"Console Errors:      {len(report.console_errors)}")
    for e in report.console_errors:
        print(f"  [CONSOLE.ERROR] {e}")
    print(f"Network Failures:    {len(report.network_failures)}")
    for e in report.network_failures:
        print(f"  [NET_FAIL] {e}")
    print(f"Broken Images:       {len(report.broken_images)}")
    for e in report.broken_images:
        print(f"  [BROKEN_IMG] {e}")
    print(f"Text Issues:         {len(report.text_issues)}")
    for e in report.text_issues:
        print(f"  [TEXT_ISSUE] {e}")
    print(f"Tooltip Issues:      {len(report.tooltip_issues)}")
    for e in report.tooltip_issues:
        print(f"  [TOOLTIP_ISSUE] {e}")
    print(f"Interaction Issues:  {len(report.interaction_issues)}")
    for e in report.interaction_issues:
        print(f"  [INTERACTION_ISSUE] {e}")
    print("=" * 72)

    if not report.summary_ok():
        sys.exit(1)
    print("ALL E2E CHECKS PASSED WITH 0 ERRORS!")


if __name__ == "__main__":
    run_audit()
