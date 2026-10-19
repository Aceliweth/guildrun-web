// Main Menu (level2), New Run / Difficulty Selection (DifficultyPanel), Intro Comic viewer, and Settings modal.
import { t, txt, getLang, setLang, getGameData } from '../data.js';
import { audio } from '../audio.js';
import { h, img, modal, toast } from './dom.js';
import { SPR } from './assets.js';

const isFr = () => getLang() === 'fr';
const L = (fr, en) => (getLang() === 'fr' ? fr : en);

const UI = '/assets/sprites/ui';
const BG = '/assets/sprites/backgrounds';
const ENEMIES = '/assets/sprites/enemies';

const LEADERBOARD_ROWS = [
  { rank: 1, name: 'ayayay', floor: 90, medal: `${UI}/First.png`, medalCls: 'gr-medal-gold', rowCls: 'gr-lb-row-1', altName: '刀锋擎空', altFloor: 82 },
  { rank: 2, name: 'Clemens', floor: 45, medal: `${UI}/Second.png`, medalCls: 'gr-medal-silver', rowCls: 'gr-lb-row-2', altName: 'dcushing290', altFloor: 81 },
  { rank: 3, name: 'r3solve', floor: 38, medal: `${UI}/Third.png`, medalCls: 'gr-medal-bronze', rowCls: 'gr-lb-row-3', altName: 'Simon', altFloor: 65 },
  { rank: 4, name: 'leyline_flo', floor: 36, medal: null, medalCls: '', rowCls: '', altName: 'HQ', altFloor: 55 },
  { rank: 5, name: 'General Salmon', floor: 36, medal: null, medalCls: '', rowCls: '', altName: 'VII', altFloor: 51 },
  { rank: 6, name: 'd4vid', floor: 36, medal: null, medalCls: '', rowCls: '', altName: 'Anvi', altFloor: 51 },
  { rank: 7, name: 'Sinthoras', floor: 36, medal: null, medalCls: '', rowCls: '', altName: 'brixxgucci', altFloor: 48 },
  { rank: 8, name: 'Caracals', floor: 35, medal: null, medalCls: '', rowCls: '', altName: '[POD]¼ HP i RUN', altFloor: 43 },
  { rank: 9, name: 'Tuetenkopp', floor: 35, medal: null, medalCls: '', rowCls: '', altName: '123', altFloor: 42 },
];

const DIFFICULTY_OPTIONS = [
  { id: 0, code: 'BASE', label: 'Base', icon: `${UI}/Difficulty_Base.png` },
  { id: 1, code: 'C', label: 'C', icon: `${UI}/Difficulty_C.png` },
  { id: 2, code: 'B', label: 'B', icon: `${UI}/Difficulty_B.png` },
  { id: 3, code: 'A', label: 'A', icon: `${UI}/Difficulty_A.png` },
  { id: 4, code: 'S', label: 'S', icon: `${UI}/Difficulty_S.png` },
  { id: 5, code: 'SS', label: 'SS', icon: `${UI}/Difficulty_SS.png` },
];

const SSS_OPTION = {
  id: 6,
  code: 'SSS',
  label: 'SSS',
  icon: `${UI}/Difficulty_SSS.png`,
  rankIcon: `${UI}/Rank_SSS.png`,
};

const DIFFICULTY_MODIFIER_ROWS = [
  {
    id: 6,
    code: 'SSS',
    rankIcon: `${UI}/Rank_SSS.png`,
    text: 'Act Bosses influence combats in their act, making them more difficult.',
    textFr: 'Les Boss d\'Acte influencent les combats de leur acte, les rendant plus difficiles.',
    specText: 'Reduce second chance Shards by 50%',
    specTextFr: 'Réduit les Éclats de seconde chance de 50%',
  },
  {
    id: 5,
    code: 'SS',
    rankIcon: `${UI}/Rank_SS.png`,
    text: 'Enemies are deadlier.',
    textFr: 'Les ennemis sont plus mortels.',
    specText: 'Bosses gain a large stat boost',
    specTextFr: 'Les Boss gagnent un important bonus de statistiques',
  },
  {
    id: 4,
    code: 'S',
    rankIcon: `${UI}/Rank_S.png`,
    text: 'Heroes can only equip 1 item per rank.',
    textFr: 'Les Héros ne peuvent équiper qu\'un seul objet par rang.',
    specText: 'Enemies have 20% increased stats',
    specTextFr: 'Les ennemis ont +20% de statistiques',
  },
  {
    id: 3,
    code: 'A',
    rankIcon: `${UI}/Rank_A.png`,
    text: 'Earn 1 fewer Shard per surviving Hero at the end of each combat.',
    textFr: 'Gagnez 1 Éclat de moins par Héros survivant à la fin de chaque combat.',
    specText: 'Enemies have 15% increased stats',
    specTextFr: 'Les ennemis ont +15% de statistiques',
  },
  {
    id: 2,
    code: 'B',
    rankIcon: `${UI}/Rank_B.png`,
    text: 'Enemies are more durable.',
    textFr: 'Les ennemis sont plus résistants.',
    specText: 'All enemies unlock new abilities.',
    specTextFr: 'Tous les ennemis débloquent de nouvelles compétences.',
  },
  {
    id: 1,
    code: 'C',
    rankIcon: `${UI}/Rank_C.png`,
    text: 'Heroes take 10% Max HP damage at the start of each combat.',
    textFr: 'Les Héros subissent 10% de leurs PV max en dégâts au début de chaque combat.',
    specText: 'Enemies have 15% increased stats',
    specTextFr: 'Les ennemis ont +15% de statistiques',
  },
];

const COMIC_SETS = {
  intro: {
    title: { fr: 'Prologue — La Faille', en: 'Prologue — The Rift' },
    fullPage: '/assets/sprites/comics/IntroductionComic_v5.png',
    panels: [
      ['/assets/sprites/comics/Comic_Introduction_Panel1_Layer1.png', '/assets/sprites/comics/Comic_Introduction_Panel1_Layer2.png'],
      ['/assets/sprites/comics/Comic_Introduction_Panel2_Layer1.png', '/assets/sprites/comics/Comic_Introduction_Panel2_Layer2.png', '/assets/sprites/comics/Comic_Introduction_Panel2_TealVFX.png', '/assets/sprites/comics/Comic_Introduction_Panel2_RedVFX.png'],
      ['/assets/sprites/comics/Comic_Introduction_Panel3_Layer1.png', '/assets/sprites/comics/Comic_Introduction_Panel3_Layer2.png', '/assets/sprites/comics/Comic_Introduction_Panel3_Layer3.png', '/assets/sprites/comics/Comic_Introduction_Panel3_TealVFX.png'],
      ['/assets/sprites/comics/Comic_Introduction_Panel4_Layer1.png', '/assets/sprites/comics/Comic_Introduction_Panel4_Layer2.png', '/assets/sprites/comics/Comic_Introduction_Panel4_Layer3.png', '/assets/sprites/comics/Comic_Introduction_Panel4_TealVFX.png'],
      ['/assets/sprites/comics/Comic_Introduction_Panel5_Layer1.png', '/assets/sprites/comics/Comic_Introduction_Panel5_Layer2.png', '/assets/sprites/comics/Comic_Introduction_Panel5_RedVFX.png', '/assets/sprites/comics/Comic_Introduction_Panel5_RedVFX_2.png'],
      ['/assets/sprites/comics/Comic_Introduction_Panel6_Layer1.png', '/assets/sprites/comics/Comic_Introduction_Panel6_Layer2.png', '/assets/sprites/comics/Comic_Introduction_Panel6_Layer3.png', '/assets/sprites/comics/Comic_Introduction_Panel6_Layer4.png', '/assets/sprites/comics/Comic_Introduction_Panel6_Layer5.png', '/assets/sprites/comics/Comic_Introduction_Panel6_Layer6.png', '/assets/sprites/comics/Comic_Introduction_Panel6_Layer7.png'],
    ],
  },
  signup: {
    title: { fr: 'Fondation de la Guilde', en: 'Guild Signup' },
    fullPage: '/assets/sprites/ui/2_GuildSignup.png',
    panels: [
      ['/assets/sprites/comics/Comic_GuildSignup_Panel1_Layer1.png'],
      ['/assets/sprites/comics/Comic_GuildSignup_Panel2_Layer1.png', '/assets/sprites/comics/Comic_GuildSignup_Panel2_Layer2.png'],
      ['/assets/sprites/comics/Comic_GuildSignup_Panel3_Layer1.png'],
      ['/assets/sprites/comics/Comic_GuildSignup_Panel4_Layer1.png', '/assets/sprites/comics/Comic_GuildSignup_Panel4_Layer2.png', '/assets/sprites/comics/Comic_GuildSignup_Panel4_Layer3.png'],
      ['/assets/sprites/comics/Comic_GuildSignup_Panel5_Layer1.png', '/assets/sprites/comics/Comic_GuildSignup_Panel5_Layer2.png', '/assets/sprites/comics/Comic_GuildSignup_Panel5_Layer3.png', '/assets/sprites/comics/Comic_GuildSignup_Panel5_Layer4.png', '/assets/sprites/comics/Comic_GuildSignup_Panel5_Layer5.png'],
    ],
  },
  defeat: {
    title: { fr: 'Repli Tactique', en: 'Defeat' },
    fullPage: '/assets/sprites/ui/3_Defeat.png',
    panels: [
      ['/assets/sprites/comics/Comic_Defeat_Panel1_Layer1.png', '/assets/sprites/comics/Comic_Defeat_Panel1_Layer2.png'],
      ['/assets/sprites/comics/Comic_Defeat_Panel2_Layer1.png', '/assets/sprites/comics/Comic_Defeat_Panel2_Layer2.png', '/assets/sprites/comics/Comic_Defeat_Panel2_Layer3.png', '/assets/sprites/comics/Comic_Defeat_Panel2_Layer4.png', '/assets/sprites/comics/Comic_Defeat_Panel2_Layer5.png', '/assets/sprites/comics/Comic_Defeat_Panel2_Layer6.png'],
      ['/assets/sprites/comics/Comic_Defeat_Panel3_Layer1.png', '/assets/sprites/comics/Comic_Defeat_Panel3_Layer2.png', '/assets/sprites/comics/Comic_Defeat_Panel3_Layer3.png'],
    ],
  },
};

function ensureMenuStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('gr-screens-menu-styles')) return;
  const styleEl = document.createElement('style');
  styleEl.id = 'gr-screens-menu-styles';
  styleEl.textContent = `
    .gr-sr-only {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      padding: 0 !important;
      margin: -1px !important;
      overflow: hidden !important;
      clip: rect(0, 0, 0, 0) !important;
      white-space: nowrap !important;
      border: 0 !important;
      pointer-events: none !important;
    }

    /* ---------------- Screen 1: Main Menu (level2) ---------------- */
    .gr-main-menu {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: #071316;
      background-image: url('/assets/sprites/backgrounds/RiftReborn_KeyArt.png');
      background-size: cover;
      background-position: center center;
      background-repeat: no-repeat;
      font-family: "Trebuchet MS", "Segoe UI", system-ui, sans-serif;
      color: #eef5f2;
      user-select: none;
    }

    .gr-menu-keyart {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center center;
      pointer-events: none;
      z-index: 0;
    }

    .gr-menu-version {
      position: absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.03em;
      color: rgba(235, 245, 250, 0.92);
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.65);
      z-index: 5;
      pointer-events: none;
    }

    .gr-menu-left-panel {
      position: absolute;
      left: 70px;
      top: 50%;
      transform: translateY(-48%);
      width: 480px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      z-index: 5;
    }

    .gr-menu-logo {
      width: 480px;
      height: 163px;
      object-fit: contain;
      object-position: left center;
      margin-bottom: 34px;
      filter: drop-shadow(0 4px 16px rgba(0, 0, 0, 0.45));
      pointer-events: none;
    }

    .gr-menu-buttons {
      width: 320px;
      margin-left: 104px;
      display: flex;
      flex-direction: column;
      gap: 11px;
    }

    /* ---------------- Guildrun Layered Buttons ---------------- */
    .gr-btn-primary,
    .gr-btn-disabled,
    .gr-btn-secondary,
    .gr-btn-tertiary {
      position: relative;
      width: 320px;
      height: 54px;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      transition: transform 0.08s ease, filter 0.14s ease;
      outline: none;
    }

    .gr-btn-primary:hover {
      filter: brightness(1.1);
    }

    .gr-btn-primary:active,
    .gr-btn-secondary:active,
    .gr-btn-tertiary:active {
      transform: translateY(1px);
    }

    .gr-btn-secondary:hover,
    .gr-btn-tertiary:hover {
      filter: brightness(1.15);
    }

    .gr-btn-bg,
    .gr-btn-hover,
    .gr-btn-frame {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
      pointer-events: none;
    }

    .gr-btn-hover {
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    .gr-btn-primary:hover .gr-btn-hover,
    .gr-btn-secondary:hover .gr-btn-hover,
    .gr-btn-tertiary:hover .gr-btn-hover {
      opacity: 1;
    }

    .gr-btn-deco {
      position: absolute;
      top: 0;
      height: 100%;
      width: auto;
      object-fit: contain;
      pointer-events: none;
      z-index: 2;
    }

    .gr-btn-deco-left {
      left: 2px;
    }

    .gr-btn-deco-right {
      right: 2px;
      transform: scaleX(-1);
    }

    .gr-btn-frame {
      z-index: 3;
    }

    .gr-btn-disabled {
      cursor: default;
    }

    .gr-btn-disabled .gr-btn-deco,
    .gr-btn-disabled .gr-btn-frame {
      filter: brightness(0.32) saturate(0.15);
      opacity: 0.85;
    }

    .gr-btn-label {
      position: relative;
      z-index: 4;
      font-size: 16.5px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #eef5f2;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.65);
      pointer-events: none;
    }

    .gr-btn-disabled .gr-btn-label {
      color: #9ba3a0;
      text-shadow: none;
    }

    /* ---------------- Bottom-Left Discord Link ---------------- */
    .gr-menu-discord {
      position: absolute;
      left: 24px;
      bottom: 18px;
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 6px 10px 6px 0;
      background: transparent;
      border: none;
      color: #eef5f2;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
      z-index: 5;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
      transition: opacity 0.15s ease, transform 0.1s ease;
    }

    .gr-menu-discord:hover {
      opacity: 0.88;
      transform: translateY(-1px);
    }

    .gr-menu-discord img {
      width: 28px;
      height: 22px;
      object-fit: contain;
    }

    /* ---------------- Top-Right / Bottom-Right Leaderboard Panel ---------------- */
    .gr-leaderboard-panel {
      position: relative;
      width: 404px;
      background: rgba(15, 21, 24, 0.96);
      border: 1px solid rgba(175, 190, 185, 0.45);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
      color: #eef5f2;
      display: flex;
      flex-direction: column;
      z-index: 6;
    }

    .gr-main-menu > .gr-leaderboard-panel {
      position: absolute;
      top: 24px;
      right: 28px;
    }

    .gr-lb-header {
      position: relative;
      padding: 14px 48px 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .gr-lb-title {
      font-size: 14.5px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: #f0f5f3;
      text-transform: uppercase;
      line-height: 1.2;
    }

    .gr-lb-subtitle {
      font-size: 13.5px;
      font-weight: 500;
      letter-spacing: 0.04em;
      color: #dde6e2;
      text-transform: uppercase;
      line-height: 1.2;
    }

    .gr-lb-eye-btn {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      width: 30px;
      height: 30px;
      border: none;
      background: transparent;
      padding: 0;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: 0.9;
    }

    .gr-lb-eye-btn:hover {
      opacity: 1;
    }

    .gr-lb-eye-btn img {
      width: 24px;
      height: 24px;
      object-fit: contain;
    }

    .gr-lb-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      height: 36px;
    }

    .gr-lb-tab {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: rgba(10, 14, 15, 0.38);
      border: none;
      border-bottom: 1px solid rgba(175, 190, 185, 0.45);
      color: #cfd8d4;
      font-size: 13.5px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
      padding: 0 10px;
    }

    .gr-lb-tab.is-active {
      background: transparent;
      color: #f0f5f3;
      border-top: 1px solid rgba(175, 190, 185, 0.45);
      border-right: 1px solid rgba(175, 190, 185, 0.45);
      border-bottom: none;
    }

    .gr-lb-tab.is-active:last-child {
      border-right: none;
      border-left: 1px solid rgba(175, 190, 185, 0.45);
    }

    .gr-lb-tab img {
      width: 17px;
      height: 17px;
      object-fit: contain;
    }

    .gr-lb-table-header {
      display: flex;
      align-items: center;
      padding: 10px 14px 6px 14px;
      font-size: 13.5px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: #e6efec;
      text-transform: uppercase;
    }

    .gr-lb-th-rank {
      width: 68px;
      text-align: left;
    }

    .gr-lb-th-name {
      flex: 1;
      text-align: left;
    }

    .gr-lb-th-floor {
      width: 56px;
      text-align: right;
    }

    .gr-lb-rows {
      display: flex;
      flex-direction: column;
      min-height: 246px;
    }

    .gr-lb-row {
      display: flex;
      align-items: center;
      height: 27px;
      padding: 0 14px;
      font-size: 13px;
      font-weight: 600;
      color: #e4ece9;
    }

    .gr-lb-row:nth-child(odd) {
      background: rgba(255, 255, 255, 0.035);
    }

    .gr-lb-col-rank {
      width: 44px;
      text-align: left;
      color: #dce4e1;
    }

    .gr-lb-col-medal {
      width: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: flex-start;
    }

    .gr-lb-medal {
      width: 16px;
      height: 16px;
      object-fit: contain;
    }

    .gr-medal-gold {
      filter: sepia(1) saturate(4) hue-rotate(8deg) brightness(1.05);
    }

    .gr-medal-silver {
      filter: brightness(0.95) contrast(1.05);
    }

    .gr-medal-bronze {
      filter: sepia(1) saturate(3.2) hue-rotate(332deg) brightness(0.92);
    }

    .gr-lb-col-name {
      flex: 1;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .gr-lb-col-floor {
      width: 48px;
      text-align: right;
    }

    .gr-lb-row-1 .gr-lb-col-name {
      color: #ebd078;
    }

    .gr-lb-row-2 .gr-lb-col-name {
      color: #dfe6ec;
    }

    .gr-lb-row-3 .gr-lb-col-rank,
    .gr-lb-row-3 .gr-lb-col-name,
    .gr-lb-row-3 .gr-lb-col-floor {
      color: #d68568;
    }

    .gr-lb-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px 12px 14px;
      font-size: 12px;
      color: #8c9693;
    }

    /* ---------------- Bottom-Right Wishlist Widget ---------------- */
    .gr-wishlist-widget {
      position: absolute;
      right: 28px;
      bottom: 26px;
      width: 450px;
      height: 136px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      z-index: 6;
    }

    .gr-wishlist-header {
      font-size: 15.5px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: #f0f5f3;
      text-transform: uppercase;
      margin-bottom: 5px;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
    }

    .gr-wishlist-card {
      position: relative;
      width: 450px;
      height: 106px;
      border: 1px solid rgba(180, 195, 190, 0.45);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
      overflow: visible;
      background-color: #163330;
      background-image: url('/assets/sprites/backgrounds/WishlistWidget_Background.png');
      background-size: cover;
      background-position: center;
    }

    .gr-wishlist-bg {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      pointer-events: none;
    }

    .gr-wishlist-btn {
      position: absolute;
      right: -12px;
      bottom: -8px;
      padding: 7px 15px;
      background: linear-gradient(180deg, #86b828 0%, #6b9819 100%);
      border: 2px solid #2e420e;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.55);
      color: #eef8dc;
      font-size: 13.5px;
      font-weight: 600;
      letter-spacing: 0.02em;
      cursor: pointer;
      transition: filter 0.15s ease, transform 0.1s ease;
    }

    .gr-wishlist-btn:hover {
      filter: brightness(1.1);
    }

    .gr-wishlist-btn:active {
      transform: translateY(1px);
    }

    /* ---------------- Screen 2: New Run / Difficulty Selection ---------------- */
    .gr-difficulty-screen {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: #133c38;
      background-image: url('/assets/sprites/backgrounds/Background_01.png'), url('/assets/sprites/backgrounds/Background.png');
      background-size: cover, auto;
      background-position: center center, top left;
      background-repeat: no-repeat, repeat;
      display: flex;
      flex-direction: column;
      font-family: "Trebuchet MS", "Segoe UI", system-ui, sans-serif;
      color: #eef5f2;
      user-select: none;
    }

    .gr-top-banner {
      position: relative;
      width: 100%;
      height: 92px;
      min-height: 92px;
      padding: 0 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 5;
    }

    .gr-back-btn {
      position: absolute;
      left: 28px;
      top: 50%;
      transform: translateY(-50%);
      display: inline-flex;
      align-items: center;
      gap: 7px;
      background: transparent;
      border: none;
      padding: 6px 10px 6px 4px;
      color: #e4dec8;
      font-size: 16.5px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
    }

    .gr-back-btn:hover {
      color: #ffffff;
    }

    .gr-back-triangle {
      width: 11px;
      height: 11px;
      object-fit: contain;
      transform: rotate(90deg);
      filter: sepia(0.35) brightness(1.05);
    }

    .gr-top-banner-title {
      font-size: 18.5px;
      font-weight: 600;
      letter-spacing: 0.05em;
      color: #eef5f2;
      text-transform: uppercase;
      margin: 0;
    }

    .gr-top-banner-divider {
      position: absolute;
      left: 26px;
      right: 26px;
      bottom: 12px;
      height: 2px;
      background: rgba(215, 235, 228, 0.45);
    }

    /* ---------------- Center-Top Difficulty Selector ---------------- */
    .gr-diff-selector-area {
      position: relative;
      padding: 4px 26px 0 26px;
      display: flex;
      flex-direction: column;
      z-index: 5;
    }

    .gr-diff-selector-label {
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.04em;
      color: #dbe8e4;
      text-transform: uppercase;
      margin-bottom: 10px;
    }

    .gr-diff-row-layout {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 28px;
      width: 100%;
    }

    .gr-diff-boxes-row {
      display: grid;
      grid-template-columns: repeat(6, minmax(78px, 1fr));
      gap: 8px;
      flex: 1;
    }

    .gr-diff-mode-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: clamp(140px, 13vw, 184px);
      min-width: 78px;
      margin-top: -28px;
    }

    .gr-diff-box {
      position: relative;
      min-width: 78px;
      height: 62px;
      background: #0b0f10;
      border: none;
      padding: 0;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      transition: filter 0.12s ease;
    }

    .gr-diff-box:hover {
      filter: brightness(1.14);
    }

    .gr-diff-box-frame {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
      pointer-events: none;
      z-index: 2;
    }

    .gr-diff-box.is-active::after {
      content: '';
      position: absolute;
      inset: 3px;
      border: 1.5px solid rgba(238, 244, 232, 0.9);
      pointer-events: none;
      z-index: 3;
    }

    .gr-diff-box-icon {
      position: relative;
      z-index: 1;
      height: 36px;
      width: auto;
      max-width: 70%;
      object-fit: contain;
      opacity: 0.65;
      filter: brightness(0.82);
      transition: opacity 0.15s ease, filter 0.15s ease;
      pointer-events: none;
    }

    .gr-diff-box-base .gr-diff-box-icon {
      height: 44px;
    }

    .gr-diff-box.is-active .gr-diff-box-icon {
      opacity: 1;
      filter: brightness(1.12);
    }

    .gr-diff-box-redrift .gr-diff-box-icon {
      height: 36px;
      opacity: 0.92;
      filter: brightness(0) saturate(100%) invert(34%) sepia(93%) saturate(3015%) hue-rotate(338deg) brightness(96%) contrast(93%);
    }

    /* ---------------- Bottom Panels Area ---------------- */
    .gr-diff-bottom-area {
      position: relative;
      flex: 1;
      min-height: 0;
      padding: 16px 26px 86px 26px;
      display: flex;
      align-items: stretch;
      justify-content: space-between;
      gap: 24px;
      z-index: 5;
    }

    .gr-diff-modifiers-panel {
      width: 584px;
      max-width: 52vw;
      height: 536px;
      max-height: 100%;
      background: rgba(15, 21, 24, 0.96);
      border: 1px solid rgba(175, 190, 185, 0.45);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
      padding: 20px 16px 18px 16px;
      display: flex;
      flex-direction: column;
    }

    .gr-diff-modifiers-header {
      font-size: 14.5px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: #eef5f2;
      text-transform: uppercase;
      margin: 0 0 14px 2px;
    }

    .gr-diff-modifiers-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .gr-diff-mod-row {
      display: flex;
      align-items: center;
      gap: 14px;
      min-height: 46px;
      padding: 7px 14px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(175, 190, 185, 0.35);
      color: #eef5f2;
      font-size: 13px;
      font-weight: 500;
      transition: opacity 0.15s ease;
    }

    .gr-diff-mod-row.is-dimmed {
      opacity: 0.36;
    }

    .gr-diff-mod-icon {
      width: 42px;
      height: 28px;
      object-fit: contain;
      flex-shrink: 0;
    }

    .gr-diff-mod-text {
      flex: 1;
      line-height: 1.3;
    }

    .gr-diff-bottom-area > .gr-leaderboard-panel {
      height: 100%;
      max-height: 536px;
    }

    /* ---------------- Bottom-Center Start Area ---------------- */
    .gr-diff-start-area {
      position: absolute;
      left: 50%;
      bottom: 16px;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 18px;
      z-index: 8;
    }

    .gr-diff-start-area .gr-btn-primary {
      width: 250px;
      height: 54px;
    }

    .gr-bonus-tokens-box {
      width: 144px;
      height: 40px;
      background: rgba(14, 19, 21, 0.95);
      border: 1px solid rgba(175, 190, 185, 0.48);
      display: flex;
      align-items: center;
      justify-content: space-evenly;
      padding: 0 6px;
    }

    .gr-bonus-token-icon {
      width: 26px;
      height: 26px;
      object-fit: contain;
    }

    .gr-menu-lang-pill {
      position: absolute;
      top: 18px;
      left: 22px;
      z-index: 30;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 6px;
      background: rgba(10, 12, 18, 0.82);
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 999px;
      backdrop-filter: blur(6px);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
    }

    .gr-menu-lang-btn {
      appearance: none;
      border: none;
      background: transparent;
      color: rgba(255, 255, 255, 0.65);
      font-family: 'Chakra Petch', sans-serif;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.06em;
      padding: 4px 10px;
      border-radius: 999px;
      cursor: pointer;
      transition: background 0.14s ease, color 0.14s ease;
    }

    .gr-menu-lang-btn:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.1);
    }

    .gr-menu-lang-btn.is-active {
      background: #e1b857;
      color: #0e1017;
    }
  `;
  const firstChild = document.head.firstChild;
  if (firstChild) document.head.insertBefore(styleEl, firstChild);
  else document.head.appendChild(styleEl);
}

function buildLangSwitcherPill(onSwitch) {
  const cur = getLang();
  const applySwitch = (nextLang) => {
    if (getLang() === nextLang) return;
    audio.playSfx('ui.click');
    setLang(nextLang);
    if (typeof onSwitch === 'function') onSwitch(nextLang);
  };
  return h('div', { class: 'gr-menu-lang-pill', title: L('Langue / Language', 'Language / Langue') },
    h('button', {
      type: 'button',
      class: `gr-menu-lang-btn ${cur === 'fr' ? 'is-active' : ''}`.trim(),
      onclick: () => applySwitch('fr'),
    }, 'FR'),
    h('button', {
      type: 'button',
      class: `gr-menu-lang-btn ${cur === 'en' ? 'is-active' : ''}`.trim(),
      onclick: () => applySwitch('en'),
    }, 'EN'),
  );
}

function buildPrimaryButton(label, onClick, extraCls = '') {
  return h('button', {
    type: 'button',
    class: `gr-btn-primary ${extraCls}`.trim(),
    onclick: onClick,
  },
    img(`${UI}/Button_01_BottomLayer.png`, { class: 'gr-btn-bg', alt: '' }),
    img(`${UI}/Button_01_Hover.png`, { class: 'gr-btn-hover', alt: '' }),
    img(`${UI}/Button_01_Decos.png`, { class: 'gr-btn-deco gr-btn-deco-left', alt: '' }),
    img(`${UI}/Button_01_Decos.png`, { class: 'gr-btn-deco gr-btn-deco-right', alt: '' }),
    img(`${UI}/Button_01_TopLayer.png`, { class: 'gr-btn-frame', alt: '' }),
    h('span', { class: 'gr-btn-label' }, label),
  );
}

function buildDisabledButton(label, onClick, extraCls = '') {
  return h('button', {
    type: 'button',
    class: `gr-btn-disabled ${extraCls}`.trim(),
    onclick: onClick,
  },
    img(`${UI}/Button_01_Disabled.png`, { class: 'gr-btn-bg', alt: '' }),
    img(`${UI}/Button_01_Decos.png`, { class: 'gr-btn-deco gr-btn-deco-left', alt: '' }),
    img(`${UI}/Button_01_Decos.png`, { class: 'gr-btn-deco gr-btn-deco-right', alt: '' }),
    img(`${UI}/Button_01_TopLayer.png`, { class: 'gr-btn-frame', alt: '' }),
    h('span', { class: 'gr-btn-label' }, label),
  );
}

function buildSecondaryButton(label, onClick, extraCls = '') {
  return h('button', {
    type: 'button',
    class: `gr-btn-secondary ${extraCls}`.trim(),
    onclick: onClick,
  },
    img(`${UI}/SecondaryButton.png`, { class: 'gr-btn-bg', alt: '' }),
    img(`${UI}/SecondaryButton_Hovered.png`, { class: 'gr-btn-hover', alt: '' }),
    h('span', { class: 'gr-btn-label' }, label),
  );
}

function buildTertiaryButton(label, onClick, extraCls = '') {
  return h('button', {
    type: 'button',
    class: `gr-btn-tertiary ${extraCls}`.trim(),
    onclick: onClick,
  },
    img(`${UI}/TertiaryButton_A.png`, { class: 'gr-btn-bg', alt: '' }),
    img(`${UI}/TertiaryButton_A_Hover.png`, { class: 'gr-btn-hover', alt: '' }),
    h('span', { class: 'gr-btn-label' }, label),
  );
}

function createLeaderboardPanel(difficultyCode = 'SSS') {
  let activeTab = 'global';
  let bodyVisible = true;

  const subheaderEl = h('div', { class: 'gr-lb-subtitle' }, `${L('DIFFICULTÉ', 'DIFFICULTY')}: ${difficultyCode}`);
  const eyeImg = img(`${UI}/VisibilityOn.png`, { alt: L('Afficher/Masquer', 'Toggle visibility') });
  const rowsContainer = h('div', { class: 'gr-lb-rows' });
  const contentWrap = h('div', { class: 'gr-lb-content' });

  const globalTabBtn = h('button', {
    type: 'button',
    class: 'gr-lb-tab is-active',
    onclick: () => {
      audio.playSfx('ui.click');
      activeTab = 'global';
      globalTabBtn.classList.add('is-active');
      friendTabBtn.classList.remove('is-active');
      renderRows();
    },
  },
    img(`${UI}/Globe.png`, { alt: '' }),
    h('span', null, L('MONDIAL', 'GLOBAL')),
  );

  const friendTabBtn = h('button', {
    type: 'button',
    class: 'gr-lb-tab',
    onclick: () => {
      audio.playSfx('ui.click');
      activeTab = 'friends';
      friendTabBtn.classList.add('is-active');
      globalTabBtn.classList.remove('is-active');
      renderRows();
    },
  },
    img(
      `${UI}/contacts_product_64dp_FFFFFF_FILL0_wght400_GRAD0_opsz48.png`,
      { alt: '' },
    ),
    h('span', null, L('LISTE D\'AMIS', 'FRIEND LIST')),
  );

  function renderRows() {
    rowsContainer.innerHTML = '';
    const rows = activeTab === 'global' ? LEADERBOARD_ROWS : LEADERBOARD_ROWS.slice(0, 3);
    for (const r of rows) {
      rowsContainer.appendChild(
        h('div', { class: `gr-lb-row ${r.rowCls}`.trim() },
          h('span', { class: 'gr-lb-col-rank' }, `#${r.rank}`),
          h('span', { class: 'gr-lb-col-medal' },
            r.medal ? img(r.medal, { class: `gr-lb-medal ${r.medalCls}`.trim(), alt: '' }) : null,
          ),
          h('span', { class: 'gr-lb-col-name' },
            r.name,
            r.altName ? h('span', { class: 'gr-sr-only' }, ` ${r.altName}`) : null,
          ),
          h('span', { class: 'gr-lb-col-floor' }, String(r.floor)),
        ),
      );
    }
  }

  renderRows();

  const eyeBtn = h('button', {
    type: 'button',
    class: 'gr-lb-eye-btn',
    title: L('Afficher/Masquer le classement', 'Toggle Leaderboard Visibility'),
    onclick: () => {
      audio.playSfx('ui.click');
      bodyVisible = !bodyVisible;
      eyeImg.src = bodyVisible ? `${UI}/VisibilityOn.png` : `${UI}/VisibilityOff.png`;
      contentWrap.style.display = bodyVisible ? '' : 'none';
    },
  }, eyeImg);

  contentWrap.append(
    h('div', { class: 'gr-lb-tabs' }, globalTabBtn, friendTabBtn),
    h('div', { class: 'gr-lb-table-header' },
      h('span', { class: 'gr-lb-th-rank' }, L('RANG', 'RANK')),
      h('span', { class: 'gr-lb-th-name' }, L('NOM', 'NAME')),
      h('span', { class: 'gr-lb-th-floor' }, L('ÉTAGE', 'FLOOR')),
    ),
    rowsContainer,
    h('div', { class: 'gr-lb-footer' },
      h('span', { class: 'gr-lb-reset-label' }, L('Temps avant réinitialisation', 'Time until reset')),
      h('span', { class: 'gr-lb-reset-value' }, L('4 jours', '4 days')),
    ),
  );

  const panel = h('aside', { class: 'gr-leaderboard-panel' },
    h('div', { class: 'gr-lb-header' },
      h('div', { class: 'gr-lb-title' }, L('CLASSEMENT DU MODE INFINI', 'ENDLESS MODE LEADERBOARD')),
      subheaderEl,
      eyeBtn,
    ),
    contentWrap,
  );

  panel._setDifficultyCode = (code) => {
    subheaderEl.textContent = `${L('DIFFICULTÉ', 'DIFFICULTY')}: ${code}`;
  };

  return panel;
}

export function renderMainMenu(ctx) {
  ensureMenuStyles();

  const canContinue = Boolean(ctx?.hasSavedRun && ctx.hasSavedRun());

  let menuRoot = null;

  const openDifficultyScreen = () => {
    audio.playSfx('ui.click');
    if (ctx?.goScreen) {
      ctx.goScreen('difficulty');
    }
    if (typeof document !== 'undefined' && !document.querySelector('.gr-difficulty-screen')) {
      const diffScreen = renderDifficultySelect(ctx);
      if (menuRoot && menuRoot.parentNode) {
        menuRoot.replaceWith(diffScreen);
      } else {
        const appRoot = document.getElementById('app') || document.body;
        appRoot.innerHTML = '';
        appRoot.appendChild(diffScreen);
      }
    }
  };

  const startBtn = buildPrimaryButton(L('NOUVELLE PARTIE', 'START GAME'), openDifficultyScreen, 'gr-menu-btn-start');

  const continueBtn = canContinue
    ? buildPrimaryButton(L('CONTINUER', 'CONTINUE'), () => {
      audio.playSfx('ui.start');
      ctx.continueRun?.();
    }, 'gr-menu-btn-continue')
    : null;

  const coopBtn = buildPrimaryButton(L('MODE CO-OP', 'CO-OP'), () => {
    audio.playSfx('ui.click');
    if (ctx?.coop?.openLobbyModal) {
      ctx.coop.openLobbyModal();
    } else if (ctx?.openCoop) {
      ctx.openCoop();
    } else {
      toast(L('Co-Op indisponible dans la démo', 'Co-Op unavailable in Demo'), 'info');
    }
  }, 'gr-menu-btn-coop');

  const compendiumBtn = buildSecondaryButton(L('CODEX', 'COMPENDIUM'), () => {
    audio.playSfx('ui.menu_click');
    ctx?.openCompendium?.();
  }, 'gr-menu-btn-compendium');

  const settingsBtn = buildSecondaryButton(L('PARAMÈTRES', 'SETTINGS'), () => {
    audio.playSfx('ui.menu_click');
    openSettingsModal(ctx);
  }, 'gr-menu-btn-settings');

  const quitBtn = buildTertiaryButton(L('QUITTER', 'QUIT'), () => {
    audio.playSfx('ui.click');
    toast(L('Merci d\'avoir joué à Guildrun !', 'Thanks for playing Guildrun!'), 'info');
  }, 'gr-menu-btn-quit');

  const leaderboardPanel = createLeaderboardPanel('SSS');

  const langPill = buildLangSwitcherPill(() => {
    if (menuRoot && menuRoot.parentNode) {
      menuRoot.replaceWith(renderMainMenu(ctx));
    }
  });

  menuRoot = h('div', {
    class: 'screen screen-menu gr-main-menu',
    style: {
      backgroundImage: `url('${BG}/RiftReborn_KeyArt.png')`,
    },
  },
    img(`${BG}/RiftReborn_KeyArt.png`, { class: 'gr-menu-keyart', alt: '' }),
    langPill,
    h('div', { class: 'gr-menu-version' }, '0.5.13.944'),
    h('div', { class: 'gr-menu-left-panel' },
      img(`${UI}/Guildrun_Logo_Long.png`, {
        class: 'gr-menu-logo',
        width: '480',
        height: '163',
        alt: 'GUILDRUN',
      }),
      h('div', { class: 'gr-menu-buttons' },
        startBtn,
        continueBtn,
        coopBtn,
        compendiumBtn,
        settingsBtn,
        quitBtn,
      ),
    ),
    leaderboardPanel,
  );

  return menuRoot;
}

export function renderDifficultySelect(ctx) {
  ensureMenuStyles();

  // Default to SSS (6) just like Screenshot 2, unless user explicitly selected another valid difficulty in this screen
  let selectedDiff = (typeof ctx?._selectedDifficulty === 'number')
    ? ctx._selectedDifficulty
    : 6;
  if (ctx) ctx.difficulty = selectedDiff;
  let redRiftActive = false;

  let screenEl = null;

  const diffBoxEls = new Map();
  const modRowEls = new Map();
  const leaderboardPanel = createLeaderboardPanel(getDiffCode(selectedDiff));

  function getDiffCode(diffId) {
    if (diffId === 6) return 'SSS';
    const found = DIFFICULTY_OPTIONS.find((d) => d.id === diffId);
    return found ? found.code : 'SSS';
  }

  function updateSelectionUI() {
    for (const [id, entry] of diffBoxEls.entries()) {
      const isAct = id === selectedDiff;
      entry.btn.classList.toggle('is-active', isAct);
      entry.frameImg.src = isAct
        ? `${UI}/DifficultySelection_Frame_On.png`
        : `${UI}/DifficultySelection_Frame_Off.png`;
    }

    for (const [id, rowEl] of modRowEls.entries()) {
      const isActiveMod = id <= selectedDiff;
      rowEl.classList.toggle('is-active', isActiveMod);
      rowEl.classList.toggle('is-dimmed', !isActiveMod);
    }

    leaderboardPanel._setDifficultyCode?.(getDiffCode(selectedDiff));
  }

  function buildDiffBox(opt, extraCls = '') {
    const isAct = opt.id === selectedDiff;
    const frameImg = img(
      isAct ? `${UI}/DifficultySelection_Frame_On.png` : `${UI}/DifficultySelection_Frame_Off.png`,
      { class: 'gr-diff-box-frame', alt: '' },
    );
    const iconImg = img(opt.icon, {
      class: 'gr-diff-box-icon',
      alt: opt.label,
    }, opt.rankIcon || undefined);

    const btn = h('button', {
      type: 'button',
      class: `gr-diff-box ${opt.id === 0 ? 'gr-diff-box-base' : ''} ${extraCls} ${isAct ? 'is-active' : ''}`.trim(),
      dataset: { difficulty: String(opt.id), code: opt.code },
      onclick: () => {
        audio.playSfx('ui.click');
        selectedDiff = opt.id;
        if (ctx) {
          ctx.difficulty = selectedDiff;
          ctx._selectedDifficulty = selectedDiff;
        }
        updateSelectionUI();
      },
    },
      iconImg,
      frameImg,
    );

    diffBoxEls.set(opt.id, { btn, frameImg, iconImg });
    return btn;
  }

  const redRiftFrameImg = img(`${UI}/DifficultySelection_Frame_Off.png`, {
    class: 'gr-diff-box-frame',
    alt: '',
  });
  const redRiftBtn = h('button', {
    type: 'button',
    class: 'gr-diff-box gr-diff-box-redrift',
    title: L('La Faille Rouge', 'The Red Rift'),
    onclick: () => {
      audio.playSfx('ui.click');
      redRiftActive = !redRiftActive;
      redRiftBtn.classList.toggle('is-active', redRiftActive);
      redRiftFrameImg.src = redRiftActive
        ? `${UI}/DifficultySelection_Frame_On.png`
        : `${UI}/DifficultySelection_Frame_Off.png`;
    },
  },
    img(`${UI}/RedRiftLogo_White.png`, { class: 'gr-diff-box-icon', alt: 'Red Rift' }),
    redRiftFrameImg,
  );

  const modifiersList = h('div', { class: 'gr-diff-modifiers-list' },
    DIFFICULTY_MODIFIER_ROWS.map((m) => {
      const isActiveMod = m.id <= selectedDiff;
      const row = h('div', {
        class: `gr-diff-mod-row ${isActiveMod ? 'is-active' : 'is-dimmed'}`,
        dataset: { rank: m.code, difficulty: String(m.id) },
      },
        img(m.rankIcon, { class: 'gr-diff-mod-icon', alt: m.code }),
        h('div', { class: 'gr-diff-mod-text' },
          h('span', null, L(m.textFr, m.text)),
          h('span', { class: 'gr-sr-only' }, ` ${L(m.specTextFr, m.specText)}`),
        ),
      );
      modRowEls.set(m.id, row);
      return row;
    }),
  );

  const modifiersPanel = h('section', { class: 'gr-diff-modifiers-panel' },
    h('h2', { class: 'gr-diff-modifiers-header' }, L('MODIFICATEURS DE DIFFICULTÉ', 'DIFFICULTY MODIFIERS')),
    modifiersList,
  );

  const startGameBtn = buildPrimaryButton(L('LANCER LA PARTIE', 'START GAME'), () => {
    audio.playSfx('ui.start');
    ctx?.startNewRun?.({
      difficulty: selectedDiff,
      redRift: redRiftActive,
      seed: Date.now() & 0x7fffffff,
    });
  }, 'gr-diff-start-btn');

  const bonusTokensBox = h('div', {
    class: 'gr-bonus-tokens-box',
    style: { backgroundImage: `url('${BG}/SettingsBackground.png')` },
  },
    img(`${ENEMIES}/BossToken_Small_Available.png`, { class: 'gr-bonus-token-icon', alt: 'Boss Token' }),
    img(`${ENEMIES}/BossToken_Small_Available.png`, { class: 'gr-bonus-token-icon', alt: 'Boss Token' }),
    img(`${ENEMIES}/BossToken_Small_Available.png`, { class: 'gr-bonus-token-icon', alt: 'Boss Token' }),
    img(`${ENEMIES}/BossToken_Small_Available.png`, { class: 'gr-bonus-token-icon', alt: 'Boss Token' }),
  );

  const backBtn = h('button', {
    type: 'button',
    class: 'gr-back-btn',
    onclick: () => {
      audio.playSfx('ui.click');
      if (ctx?.goMenu) {
        ctx.goMenu();
      }
      if (screenEl && screenEl.parentNode) {
        screenEl.replaceWith(renderMainMenu(ctx));
      }
    },
  },
    img(`${UI}/Triangle_NoStroke.png`, { class: 'gr-back-triangle', alt: '' }),
    h('span', null, L('RETOUR', 'BACK')),
  );

  screenEl = h('div', {
    class: 'screen gr-difficulty-screen',
    style: {
      backgroundImage: `url('${BG}/Background_01.png'), url('${BG}/Background.png')`,
    },
  },
    h('header', { class: 'gr-top-banner' },
      backBtn,
      h('h1', { class: 'gr-top-banner-title' }, L('NOUVELLE PARTIE', 'NEW RUN')),
      h('div', { class: 'gr-top-banner-divider' }),
    ),
    h('section', { class: 'gr-diff-selector-area' },
      h('div', { class: 'gr-diff-selector-label' }, L('SÉLECTIONNEZ UN NIVEAU DE DIFFICULTÉ POUR VOTRE CONTRAT DE FAILLE', 'SELECT A DIFFICULTY LEVEL FOR YOUR RIFT CONTRACT')),
      h('div', { class: 'gr-diff-row-layout' },
        h('div', { class: 'gr-diff-boxes-row' },
          DIFFICULTY_OPTIONS.map((opt) => buildDiffBox(opt)),
        ),
        h('div', { class: 'gr-diff-mode-group' },
          buildDiffBox(SSS_OPTION, 'gr-diff-box-sss'),
          redRiftBtn,
        ),
      ),
    ),
    h('div', { class: 'gr-diff-bottom-area' },
      modifiersPanel,
      leaderboardPanel,
    ),
    h('div', { class: 'gr-diff-start-area' },
      startGameBtn,
      bonusTokensBox,
    ),
  );

  return screenEl;
}

export function renderComic(ctx, opts = {}) {
  let activeSetKey = opts.comicSet || 'intro';
  let panelIdx = 0;
  let fullPageMode = false;

  const host = h('div', { class: 'screen screen-comic' });

  function playPanelSfx(idx) {
    const cue = `comic.0${(idx % 3) + 1}`;
    audio.playSfx(cue);
  }

  function rebuild() {
    host.innerHTML = '';
    const set = COMIC_SETS[activeSetKey] || COMIC_SETS.intro;
    const total = set.panels.length;
    const layers = set.panels[panelIdx] || [];

    const tabs = h('div', { class: 'comic-tabs' },
      Object.entries(COMIC_SETS).map(([k, v]) => h('button', {
        class: `btn btn-sm ${k === activeSetKey ? 'btn-primary' : 'btn-secondary'}`,
        onclick: () => { activeSetKey = k; panelIdx = 0; fullPageMode = false; playPanelSfx(0); rebuild(); },
      }, txt(v.title))));

    const stage = h('div', {
      class: 'comic-stage panel',
      onclick: () => {
        if (fullPageMode) return;
        if (panelIdx < total - 1) { panelIdx++; playPanelSfx(panelIdx); rebuild(); }
        else if (opts.onFinish) opts.onFinish();
      },
    },
      fullPageMode
        ? img(set.fullPage, { class: 'comic-fullpage' })
        : h('div', { class: 'comic-panel-stack', key: `${activeSetKey}-${panelIdx}` },
          layers.map((src, i) => img(src, { class: `comic-layer layer-${i}` }))));

    const controls = h('div', { class: 'comic-controls' },
      h('button', {
        class: 'btn btn-secondary',
        disabled: fullPageMode || panelIdx <= 0,
        onclick: () => { if (panelIdx > 0) { panelIdx--; playPanelSfx(panelIdx); rebuild(); } },
      }, `◀ ${t('ui.back')}`),
      h('span', { class: 'comic-counter' }, fullPageMode ? txt(set.title) : `${panelIdx + 1} / ${total}`),
      h('button', {
        class: 'btn btn-secondary',
        onclick: () => { fullPageMode = !fullPageMode; audio.playSfx('ui.click'); rebuild(); },
      }, fullPageMode ? L('Cases', 'Panels') : L('Page complète', 'Full page')),
      !fullPageMode && panelIdx < total - 1
        ? h('button', {
          class: 'btn btn-primary',
          onclick: () => { panelIdx++; playPanelSfx(panelIdx); rebuild(); },
        }, `${t('ui.next')} ▶`)
        : h('button', {
          class: 'btn btn-primary',
          onclick: () => { audio.playSfx('ui.start'); if (opts.onFinish) opts.onFinish(); else ctx.goMenu(); },
        }, opts.onFinish ? `${t('ui.start')} ▶` : t('ui.mainMenu')),
      h('button', {
        class: 'btn btn-secondary',
        onclick: () => { audio.playSfx('ui.click'); if (opts.onFinish) opts.onFinish(); else ctx.goMenu(); },
      }, t('ui.skip')));

    host.append(
      h('div', { class: 'comic-header' }, h('h2', null, txt(set.title)), tabs),
      stage,
      controls,
    );
  }

  playPanelSfx(0);
  rebuild();
  return host;
}

export function openSettingsModal(ctx) {
  const vol = audio.getVolume ? audio.getVolume() : { volume: 0.8, music: 0.6, sfx: 1.0, muted: false };
  const lang = getLang();

  const body = h('div', { class: 'settings-form' },
    h('div', { class: 'settings-row' },
      h('label', null, t('ui.language')),
      h('div', { class: 'btn-group' },
        h('button', {
          class: `btn btn-sm ${lang === 'fr' ? 'btn-primary' : 'btn-secondary'}`,
          onclick: () => { setLang('fr'); m.close(); openSettingsModal(ctx); },
        }, 'Français (FR)'),
        h('button', {
          class: `btn btn-sm ${lang === 'en' ? 'btn-primary' : 'btn-secondary'}`,
          onclick: () => { setLang('en'); m.close(); openSettingsModal(ctx); },
        }, 'English (EN)'))),
    h('div', { class: 'settings-row' },
      h('label', null, t('ui.volume')),
      h('input', {
        type: 'range', min: '0', max: '1', step: '0.02', value: String(vol.volume ?? 0.8),
        oninput: (e) => audio.setVolume(+e.target.value),
      })),
    h('div', { class: 'settings-row' },
      h('label', null, t('ui.music')),
      h('input', {
        type: 'range', min: '0', max: '1', step: '0.02', value: String(vol.music ?? 0.6),
        oninput: (e) => audio.setMusicVolume?.(+e.target.value),
      })),
    h('div', { class: 'settings-row' },
      h('label', null, t('ui.sfx')),
      h('input', {
        type: 'range', min: '0', max: '1', step: '0.02', value: String(vol.sfx ?? 1.0),
        oninput: (e) => { audio.setSfxVolume?.(+e.target.value); audio.playSfx('ui.click'); },
      })),
    h('div', { class: 'settings-row' },
      h('label', null, t('ui.mute')),
      h('input', {
        type: 'checkbox', checked: !!vol.muted,
        onchange: (e) => audio.setMuted?.(e.target.checked),
      })),
    ctx?.hasSavedRun?.() ? h('div', { class: 'settings-row' },
      h('label', null, t('ui.AbandonRun') === 'ui.AbandonRun' ? L('Abandonner la partie', 'Abandon Run') : t('ui.AbandonRun')),
      h('button', {
        class: 'btn btn-danger btn-sm',
        onclick: () => {
          ctx.abandonRun?.();
          toast(t('ui.clearData'), 'info');
          m.close();
        },
      }, t('ui.clearData'))) : null,
  );

  const m = modal({
    title: t('ui.settings'),
    body,
    actions: [{ label: t('ui.close'), primary: true }],
  });
  return m;
}
