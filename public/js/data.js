// Guildrun Web — data loading + localization helpers (UI agent).
// CONTRACT: `export async function loadGameData()` and `t(key, vars)`.

let GAME_DATA = null;
let LANG = 'fr';
const langListeners = new Set();

// UI chrome strings that are not (or not reliably) present in the game localization table.
// Game localization (data.loc) always wins when a key exists there with a non-empty value.
const UI_STRINGS = {
  'ui.newRun': { fr: 'Nouvelle partie', en: 'New Run' },
  'ui.continue': { fr: 'Continuer', en: 'Continue' },
  'ui.continueRun': { fr: 'Reprendre la partie', en: 'Continue Run' },
  'ui.introComic': { fr: 'Bande dessinée d\'intro', en: 'Intro Comic' },
  'ui.settings': { fr: 'Paramètres', en: 'Settings' },
  'ui.back': { fr: 'Retour', en: 'Back' },
  'ui.close': { fr: 'Fermer', en: 'Close' },
  'ui.next': { fr: 'Suivant', en: 'Next' },
  'ui.skip': { fr: 'Passer', en: 'Skip' },
  'ui.start': { fr: 'Commencer', en: 'Start' },
  'ui.startGame': { fr: 'Nouvelle partie', en: 'Start Game' },
  'ui.quit': { fr: 'Quitter', en: 'Quit' },
  'ui.coop': { fr: 'Co-Op', en: 'Co-Op' },
  'ui.joinDiscord': { fr: 'Rejoignez notre communauté Discord', en: 'Join our Discord community' },
  'ui.language': { fr: 'Langue', en: 'Language' },
  'ui.volume': { fr: 'Volume général', en: 'Master Volume' },
  'ui.music': { fr: 'Musique', en: 'Music' },
  'ui.difficulty': { fr: 'Difficulté', en: 'Difficulty' },
  'ui.chooseDifficulty': { fr: 'Choisissez la difficulté', en: 'Choose difficulty' },
  'ui.selectDifficultyContract': { fr: 'Sélectionnez un niveau de difficulté pour votre contrat de Faille', en: 'Select a difficulty level for your Rift Contract' },
  'ui.difficultyModifiers': { fr: 'Modificateurs de difficulté', en: 'Difficulty Modifiers' },
  'ui.diffModSSS': { fr: 'Les boss d\'acte influencent les combats de leur acte, les rendant plus difficiles.', en: 'Act Bosses influence combats in their act, making them more difficult.' },
  'ui.diffModSS': { fr: 'Les ennemis sont plus redoutables.', en: 'Enemies are deadlier.' },
  'ui.diffModS': { fr: 'Les héros ne peuvent équiper qu\'un seul objet par rang.', en: 'Heroes can only equip 1 item per rank.' },
  'ui.diffModA': { fr: 'Gagnez 1 Éclat de moins par héros survivant à la fin de chaque combat.', en: 'Earn 1 fewer Shard per surviving Hero at the end of each combat.' },
  'ui.diffModB': { fr: 'Les ennemis sont plus résistants.', en: 'Enemies are more durable.' },
  'ui.diffModC': { fr: 'Les héros subissent 10 % de leurs PV max en dégâts au début de chaque combat.', en: 'Heroes take 10% Max HP damage at the start of each combat.' },
  'ui.global': { fr: 'Mondial', en: 'Global' },
  'ui.friendList': { fr: 'Liste d\'amis', en: 'Friend List' },
  'ui.timeUntilReset': { fr: 'Temps avant réinitialisation', en: 'Time until reset' },
  'ui.fourDays': { fr: '4 jours', en: '4 days' },
  'ui.endlessLeaderboard': { fr: 'Classement du mode Infini', en: 'Endless Mode Leaderboard' },
  'ui.chooseHero': { fr: 'Recrutez votre premier Breaker', en: 'Recruit your first Breaker' },
  'ui.chooseHeroTitle': { fr: 'Choisissez un héros', en: 'Choose Hero' },
  'ui.recruit': { fr: 'Recruter', en: 'Recruit' },
  'ui.placement': { fr: 'Placement', en: 'Placement' },
  'ui.fight': { fr: 'Combattre !', en: 'Fight!' },
  'ui.party': { fr: 'Équipe', en: 'Party' },
  'ui.reserve': { fr: 'Réserve', en: 'Reserve' },
  'ui.bench': { fr: 'Réserve', en: 'Bench' },
  'ui.inventory': { fr: 'Inventaire', en: 'Inventory' },
  'ui.relics': { fr: 'Reliques', en: 'Relics' },
  'ui.synergies': { fr: 'Classes', en: 'Classes' },
  'ui.shards': { fr: 'Éclats', en: 'Shards' },
  'ui.act': { fr: 'Acte', en: 'Act' },
  'ui.floor': { fr: 'Étage', en: 'Floor' },
  'ui.lives': { fr: 'Vies', en: 'Lives' },
  'ui.team': { fr: 'Équipe', en: 'Team' },
  'ui.teamSize': { fr: 'Taille d\'équipe', en: 'Team size' },
  'ui.buyTeamSize': { fr: '+1 place', en: '+1 slot' },
  'ui.shop': { fr: 'Boutique', en: 'Shop' },
  'ui.heroes': { fr: 'Héros', en: 'Heroes' },
  'ui.items': { fr: 'Objets', en: 'Items' },
  'ui.reroll': { fr: 'Relancer', en: 'Reroll' },
  'ui.rerollShop': { fr: 'Relancer la boutique', en: 'Reroll Shop' },
  'ui.freeze': { fr: 'Geler', en: 'Freeze' },
  'ui.freezeShop': { fr: 'Geler la boutique', en: 'Freeze Shop' },
  'ui.unfreeze': { fr: 'Dégeler', en: 'Unfreeze' },
  'ui.unfreezeShop': { fr: 'Dégeler la boutique', en: 'Unfreeze Shop' },
  'ui.sell': { fr: 'Vendre', en: 'Sell' },
  'ui.sold': { fr: 'Vendu', en: 'Sold' },
  'ui.buy': { fr: 'Acheter', en: 'Buy' },
  'ui.leaveShop': { fr: 'Quitter la boutique', en: 'Leave shop' },
  'ui.proceed': { fr: 'Continuer', en: 'Proceed' },
  'ui.sale': { fr: 'Promo', en: 'Sale' },
  'ui.crossroads': { fr: 'Carrefour', en: 'Crossroads' },
  'ui.choosePath': { fr: 'Choisissez votre chemin', en: 'Choose your path' },
  'ui.clickToEnter': { fr: 'Cliquer pour entrer ▶', en: 'Click to enter ▶' },
  'ui.event': { fr: 'Événement', en: 'Event' },
  'ui.targetHero': { fr: 'Héros ciblé :', en: 'Target Hero:' },
  'ui.campfire': { fr: 'Feu de camp', en: 'Campfire' },
  'ui.victory': { fr: 'Victoire', en: 'Victory' },
  'ui.defeat': { fr: 'Défaite', en: 'Defeat' },
  'ui.draw': { fr: 'Égalité', en: 'Draw' },
  'ui.battleWon': { fr: 'Combat gagné', en: 'Battle Won' },
  'ui.battleLost': { fr: 'Combat perdu', en: 'Battle Lost' },
  'ui.rewards': { fr: 'Récompenses', en: 'Rewards' },
  'ui.results': { fr: 'Résultats', en: 'Results' },
  'ui.speed': { fr: 'Vitesse', en: 'Speed' },
  'ui.battleSpeed': { fr: 'Vitesse de combat', en: 'Battle Speed' },
  'ui.skipBattle': { fr: 'Passer le combat', en: 'Skip battle' },
  'ui.battle': { fr: 'Combat', en: 'Battle' },
  'ui.endRun': { fr: 'Fin de la partie', en: 'Run over' },
  'ui.mainMenu': { fr: 'Menu principal', en: 'Main menu' },
  'ui.rankUp': { fr: 'Promotion', en: 'Rank up' },
  'ui.chooseUpgrade': { fr: 'Choisissez une amélioration', en: 'Choose an upgrade' },
  'ui.chooseRelicTitle': { fr: 'Choisissez une relique', en: 'Choose a Relic' },
  'ui.chooseItemTitle': { fr: 'Choisissez un objet', en: 'Choose an Item' },
  'ui.chooseUpgradeTitle': { fr: 'Choisissez une amélioration', en: 'Choose an Upgrade' },
  'ui.confirm': { fr: 'Confirmer', en: 'Confirm' },
  'ui.moduleMissing': { fr: 'Module manquant', en: 'Missing module' },
  'ui.moduleMissingDesc': { fr: 'Ce module logique n\'a pas pu être chargé. Le jeu ne peut pas démarrer de partie sans lui.', en: 'This logic module could not be loaded. Runs cannot start without it.' },
  'ui.dataMissing': { fr: 'Données introuvables', en: 'Game data not found' },
  'ui.error': { fr: 'Erreur', en: 'Error' },
  'ui.loading': { fr: 'Chargement…', en: 'Loading…' },
  'ui.dragHint': { fr: 'Glissez les héros sur les cases bleues. Glissez les objets sur un héros.', en: 'Drag heroes onto blue tiles. Drag items onto a hero.' },
  'ui.stats': { fr: 'Statistiques', en: 'Stats' },
  'ui.damageDealt': { fr: 'Dégâts infligés', en: 'Damage Dealt' },
  'ui.damageMitigated': { fr: 'Dégâts réduits', en: 'Damage Mitigated' },
  'ui.damageTaken': { fr: 'Dégâts subis', en: 'Damage Taken' },
  'ui.healingDone': { fr: 'Soins & Boucliers', en: 'Healing Done' },
  'ui.feedback': { fr: 'Donner un avis', en: 'Give us feedback' },
  'ui.trackerTab': { fr: 'Suivi', en: 'Tracker' },
  'ui.heroStatsTab': { fr: 'Stats des héros', en: 'Hero Stats' },
  'ui.combatDuration': { fr: 'Durée du combat', en: 'Combat Duration' },
  'ui.totalEarned': { fr: 'Total des gains', en: 'Total Earned' },
  'ui.price': { fr: 'Prix', en: 'Price' },
  'ui.rank': { fr: 'Rang', en: 'Rank' },
  'ui.slots': { fr: 'Emplacements', en: 'Slots' },
  'ui.questCompleted': { fr: '✓ Quête terminée', en: '✓ Quest Completed' },
  'ui.questProgress': { fr: 'Quête ({0} / {1})', en: 'Quest ({0} / {1})' },
  'ui.questLabel': { fr: 'Quête :', en: 'Quest:' },
  'ui.rewardLabel': { fr: 'Récompense :', en: 'Reward:' },
  'ui.empty': { fr: 'Vide', en: 'Empty' },
  'ui.mockMode': { fr: 'Mode démo (logique simulée)', en: 'Demo mode (mock logic)' },
  'ui.enemies': { fr: 'Ennemis', en: 'Enemies' },
  'ui.onBoard': { fr: 'Sur le terrain', en: 'On board' },
  'ui.abandon': { fr: 'Abandonner', en: 'Abandon' },
  'ui.AbandonRun': { fr: 'Abandonner la partie', en: 'Abandon Run' },
  'ui.time': { fr: 'Temps', en: 'Time' },
  'ui.modules': { fr: 'Modules', en: 'Modules' },
  'ui.compendium': { fr: 'Codex', en: 'Compendium' },
  'ui.sandbox': { fr: 'Arène libre', en: 'Sandbox Battle' },
  'ui.sfx': { fr: 'Effets sonores', en: 'SFX Volume' },
  'ui.mute': { fr: 'Muet', en: 'Mute' },
  'ui.seed': { fr: 'Graine (Seed)', en: 'Seed' },
  'ui.stabilizer': { fr: 'Stabilisateur', en: 'Emergency Rewind' },
  'ui.stabilizerActive': { fr: 'Actif', en: 'Active' },
  'ui.stabilizerBroken': { fr: 'Brisé', en: 'Broken' },
  'ui.superShop': { fr: 'Hôtel des ventes', en: 'Super Shop' },
  'ui.dropToSell': { fr: 'Déposez ici pour vendre', en: 'Drop here to sell' },
  'ui.sellMode': { fr: 'Mode vente : cliquez un héros/objet', en: 'Sell Mode: click Hero/Item' },
  'ui.rest': { fr: 'Se reposer', en: 'Rest' },
  'ui.train': { fr: 'Entraîner un héros', en: 'Train a Hero' },
  'ui.study': { fr: 'Étudier (Spécialisation)', en: 'Study (Specialization)' },
  'ui.recharge': { fr: 'Recharger le Stabilisateur', en: 'Recharge Rewind' },
  'ui.actionsLeft': { fr: 'Actions restantes', en: 'Actions remaining' },
  'ui.selectHero': { fr: 'Choisissez un héros', en: 'Select a hero' },
  'ui.unequip': { fr: 'Retirer', en: 'Unequip' },
  'ui.mvp': { fr: 'MVP du combat', en: 'Battle MVP' },
  'ui.pause': { fr: 'Pause', en: 'Pause' },
  'ui.resume': { fr: 'Reprendre', en: 'Resume' },
  'ui.clearData': { fr: 'Effacer la sauvegarde', en: 'Clear saved run' },
  'ui.Stage': { fr: 'Étape', en: 'Stage' },
  'ui.guilds': { fr: 'Guildes', en: 'Guilds' },
  'ui.lore': { fr: 'Histoire', en: 'Lore' },
  'ui.specializations': { fr: 'Spécialisations', en: 'Specializations' },
  'ui.search': { fr: 'Rechercher…', en: 'Search…' },
  'ui.clearBoard': { fr: 'Vider le plateau', en: 'Clear board' },
  'ui.presetStage': { fr: 'Étape prédéfinie', en: 'Preset stage' },

  // Bare tracker keys
  'DamageDealt': { fr: 'Dégâts infligés', en: 'Damage Dealt' },
  'DamageMitigated': { fr: 'Dégâts réduits', en: 'Damage Mitigated' },
  'DamageTaken': { fr: 'Dégâts subis', en: 'Damage Taken' },
  'HealingDone': { fr: 'Soins & Boucliers', en: 'Healing Done' },

  // Main Menu & Leaderboard UI.* keys
  'UI.MainMenu.StartNewGame': { fr: 'Nouvelle Partie', en: 'Start Game' },
  'UI.MainMenu.StartNewCoopGame': { fr: 'Co-Op', en: 'Co-Op' },
  'UI.MainMenu.StartNewCoopGame.Tooltip': { fr: 'Mode Co-Op à 2 joueurs en temps réel.', en: '2-player Co-op mode.' },
  'UI.MainMenu.HowToPlay': { fr: 'Comment Jouer', en: 'How-To-Play' },
  'UI.MainMenu.Settings': { fr: 'Paramètres', en: 'Settings' },
  'UI.MainMenu.Quit': { fr: 'Quitter', en: 'Quit' },
  'UI.MainMenu.JoinDiscord': { fr: 'Rejoignez notre communauté Discord', en: 'Join our Discord community' },
  'UI.MainMenu.WishlistOnSteam': { fr: 'Ajouter à la liste de souhaits', en: 'Wishlist Now' },
  'UI.Leaderboard.Title': { fr: 'Classement du mode Infini', en: 'Endless Mode Leaderboard' },
  'UI.Leaderboard.WinStreakTitle': { fr: 'Classement des séries de victoires', en: 'Win Streak Leaderboard' },
  'UI.Leaderboard.ChallengeModeTitle': { fr: 'Faille Rouge', en: 'Red Rift' },
  'UI.Leaderboard.ChallengeStreak': { fr: 'Série actuelle : {0}', en: 'Your current streak: {0}' },
  'UI.Leaderboard.Global': { fr: 'Mondial', en: 'Global' },
  'UI.Leaderboard.FriendList': { fr: 'Liste d\'amis', en: 'Friend List' },
  'UI.Leaderboard.Rank': { fr: 'Rang', en: 'Rank' },
  'UI.Leaderboard.Name': { fr: 'Nom', en: 'Name' },
  'UI.Leaderboard.Floor': { fr: 'Étage', en: 'Floor' },
  'UI.Leaderboard.ResetLabel': { fr: 'Temps avant réinitialisation', en: 'Time until reset' },
  'UI.Leaderboard.ResetDays': { fr: '{0:plural:1 jour|{} jours}', en: '{0:plural:1 day|{} days}' },
  'UI.Leaderboard.ResetToday': { fr: 'AUJOURD\'HUI', en: 'TODAY' },
  'UI.Leaderboard.Loading': { fr: 'Chargement…', en: 'Loading...' },
  'UI.Leaderboard.LoadFailed': { fr: 'Échec du chargement du classement', en: 'Failed to load leaderboard' },
  'UI.Leaderboard.YourScore': { fr: '{name} (VOUS)', en: '{name} (YOU)' },

  // Common UI.* keys
  'UI.Common.AllFilter': { fr: 'Tout', en: 'All' },
  'UI.Common.Back': { fr: 'Retour', en: 'Back' },
  'UI.Common.Cancel': { fr: 'Annuler', en: 'Cancel' },
  'UI.Common.Continue': { fr: 'Continuer', en: 'Continue' },
  'UI.Common.DontAskAgain': { fr: 'Ne plus demander', en: 'Don\'t ask again' },
  'UI.Common.Error': { fr: 'Erreur', en: 'Error' },
  'UI.Common.Exit': { fr: 'Fermer', en: 'Close' },
  'UI.Common.Heroes': { fr: 'Héros', en: 'Heroes' },
  'UI.Common.Items': { fr: 'Objets', en: 'Items' },
  'UI.Common.Loading': { fr: 'Chargement…', en: 'Loading...' },
  'UI.Common.Off': { fr: 'Désactivé', en: 'Off' },
  'UI.Common.Ok': { fr: 'Ok', en: 'Ok' },
  'UI.Common.On': { fr: 'Activé', en: 'On' },
  'UI.Common.Proceed': { fr: 'Continuer', en: 'Proceed' },
  'UI.Common.Quest': { fr: '[Quête]<quest> : {0}', en: '[Quest]<quest>: {0}' },
  'UI.Common.Relics': { fr: 'Reliques', en: 'Relics' },
  'UI.Common.Skip': { fr: 'Passer', en: 'Skip' },
  'UI.Common.Version': { fr: 'Version {0}', en: 'Version {0}' },

  // Difficulty UI.* keys
  'UI.Difficulty.Title': { fr: 'Nouvelle Partie', en: 'New Run' },
  'UI.Difficulty.Selection': { fr: 'Sélectionnez un niveau de difficulté pour votre contrat de Faille', en: 'Select a difficulty level for your Rift Contract' },
  'UI.Difficulty.Modifiers': { fr: 'Modificateurs de difficulté', en: 'Difficulty Modifiers' },
  'UI.Difficulty.Base': { fr: 'Base', en: 'Base' },
  'UI.Difficulty.Base.Description': { fr: 'Jouez sans modificateurs de difficulté.', en: 'Play without difficulty modifiers.' },
  'UI.Difficulty.C': { fr: 'Difficulté : C', en: 'Difficulty: C' },
  'UI.Difficulty.C.Description': { fr: 'Au début de chaque combat, les héros subissent des dégâts équivalents à 10 % de leurs PV max.', en: 'Heroes take 10% Max HP damage at the start of each combat.' },
  'UI.Difficulty.B': { fr: 'Difficulté : B', en: 'Difficulty: B' },
  'UI.Difficulty.B.Description': { fr: 'Les ennemis sont plus résistants.', en: 'Enemies are more durable.' },
  'UI.Difficulty.A': { fr: 'Difficulté : A', en: 'Difficulty: A' },
  'UI.Difficulty.A.Description': { fr: 'Gagnez 1 Éclat de moins par héros survivant à la fin de chaque combat.', en: 'Earn 1 fewer Shard per surviving Hero at the end of each combat.' },
  'UI.Difficulty.S': { fr: 'Difficulté : S', en: 'Difficulty: S' },
  'UI.Difficulty.S.Description': { fr: 'Les héros ne peuvent équiper qu\'un seul objet par rang.', en: 'Heroes can only equip 1 item per rank.' },
  'UI.Difficulty.SS': { fr: 'Difficulté : SS', en: 'Difficulty: SS' },
  'UI.Difficulty.SS.Description': { fr: 'Les ennemis sont plus redoutables.', en: 'Enemies are deadlier.' },
  'UI.Difficulty.SSS': { fr: 'Difficulté : SSS', en: 'Difficulty: SSS' },
  'UI.Difficulty.SSS.Description': { fr: 'Les boss d\'acte influencent les combats de leur acte, les rendant plus difficiles.', en: 'Act Bosses influence combats in their act, making them more difficult.' },
  'UI.Difficulty.RiftMode': { fr: 'La Faille Rouge', en: 'The Red Rift' },

  // Battle & Shop UI.* keys
  'UI.Battle.Fight': { fr: 'Combattre', en: 'Fight' },
  'UI.Battle.BattleSpeed': { fr: 'Vitesse de combat', en: 'Battle Speed' },
  'UI.Battle.BattleSpeed.Auto': { fr: 'Auto', en: 'Auto' },
  'UI.Battle.Party': { fr: 'Équipe', en: 'Party' },
  'UI.Battle.Reserve': { fr: 'Réserve', en: 'Reserve' },
  'UI.Battle.DamageDealt': { fr: 'Dégâts infligés', en: 'Damage Dealt' },
  'UI.Battle.DamageTaken': { fr: 'Dégâts subis', en: 'Damage Taken' },
  'UI.Battle.ShieldsHealing': { fr: 'Boucliers et Soins', en: 'Shields & Healing' },
  'UI.Battle.HeroPicker.Title': { fr: 'Choisissez un héros', en: 'Choose Hero' },
  'UI.Battle.ItemPicker.Title': { fr: 'Choisissez un objet', en: 'Choose Item' },
  'UI.Battle.RelicPicker.Title': { fr: 'Choisissez votre récompense', en: 'Choose Your Reward' },
  'UI.Battle.ResultPanel.BattleWon': { fr: 'Combat Gagné', en: 'Battle Won' },
  'UI.Battle.ResultPanel.BattleLost': { fr: 'Combat Perdu', en: 'Battle Lost' },
  'UI.Battle.ResultPanel.Results': { fr: 'Résultats', en: 'Results' },
  'UI.Battle.ResultPanel.TotalEarned': { fr: 'Total des gains', en: 'Total Earned' },
  'UI.Battle.ResultPanel.FightDuration': { fr: 'Durée du combat\n{0} s', en: 'Combat Duration\n{0} s' },
  'UI.Battle.ResultPanel.FightIndex': { fr: 'Combat #{0}', en: 'Combat #{0}' },
  'UI.Battle.ResultPanel.Stats.Title': { fr: 'Statistiques', en: 'Stats' },
  'UI.Battle.ResultPanel.Stats.Tracker': { fr: 'Suivi', en: 'Tracker' },
  'UI.Battle.ResultPanel.Stats.HeroStats': { fr: 'Statistiques des héros', en: 'Hero Stats' },
  'UI.Battle.ResultsPanel.Feedback': { fr: 'Donnez votre avis', en: 'Give us feedback' },
  'UI.Battle.ShopPanel.RerollShop': { fr: 'Relancer la Boutique [{0} {1}]', en: 'Reroll Shop [{0} {1}]' },
  'UI.Battle.ShopPanel.Freeze': { fr: 'Geler la Boutique', en: 'Freeze Shop' },
  'UI.Battle.ShopPanel.Unfreeze': { fr: 'Dégeler la Boutique', en: 'Unfreeze Shop' },
  'UI.Battle.ShopPanel.DropToSell': { fr: 'Déposez ici pour vendre', en: 'Drop here to sell' },
  'UI.Battle.ShopPanel.Sale': { fr: 'Promo', en: 'Sale' },
  'UI.Battle.ShopPanel.SuperShop': { fr: 'L\'hôtel des ventes', en: 'The auction house' },
  'UI.Battle.ShopPanel.TeamSizeRelics': { fr: 'Reliques de taille d\'équipe', en: 'Team size relics' },
  'UI.BattleInfo.ShardStabilizer.Title': { fr: 'Stabilisateur d\'Éclats', en: 'Emergency Rewind' },
  'UI.BattleInfo.ShardStabilizer.Description.Active': {
    fr: 'Le [Stabilisateur d\'Éclats]<bold> est actif. Après chaque victoire, il collecte [+{0} Éclats]<shard>. Si vous perdez un combat, le Stabilisateur s\'activera pour protéger votre partie et libérer tous ses [Éclats]<shard> accumulés.\n\n[Stabilisateur d\'Éclats]<bold> disponible.\n[Éclats]<shard> actuels : {1}',
    en: '[Emergency Rewind:]<bold> Gather [{0} Shards]<shard> after each combat victory while [Emergency Rewind]<bold> is available. If you are defeated in combat, [Emergency Rewind]<bold> will activate to protect your run and release all of its gathered [Shards]<shard>. If you are defeated in combat while [Emergency Rewind]<bold> is unavailable, your run will end in defeat.\n\n[Emergency Rewind]<bold> is available.\nCurrent [Shards]<shard>: {1}',
  },
  'UI.BattleInfo.ShardStabilizer.Description.Inactive': {
    fr: 'Le [Stabilisateur d\'Éclats]<bold> a été utilisé et est actuellement indisponible ! Si vous perdez un autre combat, votre partie se terminera par une défaite.',
    en: '[Emergency Rewind:]<bold> Gather [{0} Shards]<shard> after each combat victory while [Emergency Rewind]<bold> is available. If you are defeated in combat, [Emergency Rewind]<bold> will activate to protect your run and release all of its gathered [Shards]<shard>. If you are defeated in combat while [Emergency Rewind]<bold> is unavailable, your run will end in defeat.\n\n[Emergency Rewind]<bold> was used and is currently unavailable! If you lose another combat your run will end in defeat.',
  },

  // Tooltip UI.* keys
  'UI.Tooltip.ActiveAbility': { fr: 'Capacité Active', en: 'Active Ability' },
  'UI.Tooltip.PassiveAbility': { fr: 'Capacité Passive', en: 'Passive Ability' },
  'UI.Tooltip.RankModifier': { fr: 'Amélioration de Classe', en: 'Class Upgrade' },
  'UI.Tooltip.ItemCommon': { fr: 'Objet Commun', en: 'Common Item' },
  'UI.Tooltip.ItemRare': { fr: 'Objet Rare', en: 'Rare Item' },
  'UI.Tooltip.ItemEpic': { fr: 'Objet Épique', en: 'Epic Item' },
  'UI.Tooltip.ItemLegendary': { fr: 'Objet Légendaire', en: 'Legendary Item' },
  'UI.Tooltip.ItemUnique': { fr: 'Objet Unique', en: 'Unique Item' },
  'UI.Tooltip.RelicCommon': { fr: 'Relique Commune', en: 'Common Relic' },
  'UI.Tooltip.RelicRare': { fr: 'Relique Rare', en: 'Rare Relic' },
  'UI.Tooltip.RelicEpic': { fr: 'Relique Épique', en: 'Epic Relic' },
  'UI.Tooltip.RelicLegendary': { fr: 'Relique Légendaire', en: 'Legendary Relic' },
  'UI.Tooltip.RelicUnique': { fr: 'Relique Unique', en: 'Unique Relic' },
  'UI.Tooltip.RelicCommonQuest': { fr: 'Relique de Quête Commune', en: 'Common Quest Relic' },
  'UI.Tooltip.RelicRareQuest': { fr: 'Relique de Quête Rare', en: 'Rare Quest Relic' },
  'UI.Tooltip.RelicEpicQuest': { fr: 'Relique de Quête Épique', en: 'Epic Quest Relic' },
  'UI.Tooltip.RelicLegendaryQuest': { fr: 'Relique de Quête Légendaire', en: 'Legendary Quest Relic' },
  'UI.Tooltip.RelicEnemy': { fr: 'Relique d\'Ennemi', en: 'Enemy Relic' },
  'UI.Tooltip.RelicTeamSize': { fr: 'Relique de Taille d\'Équipe', en: 'Team Size Relic' },
  'UI.Tooltip.RelicActBoss': { fr: 'Relique de Boss', en: 'Boss Relic' },
  'UI.Tooltip.RelicSingleBattleBoost': { fr: 'Relique de Défi', en: 'Challenge Relic' },
  'UI.Tooltip.QuestCompleted': { fr: 'Quête terminée !', en: 'Quest completed!' },
  'UI.Tooltip.AllQuestsCompleted': { fr: 'Toutes les quêtes sont terminées !', en: 'All quests completed!' },
  'UI.Tooltip.ClassGain': { fr: 'Gain de Classe', en: 'Class Gain' },
  'UI.Tooltip.CountsAsClassDuringCombat': { fr: 'Compte comme cette classe pendant le combat.', en: 'Counts as class during combat.' },
};

const STAT_NAMES = {
  MaxHealth: { fr: 'PV max', en: 'Max HP' }, MaxMana: { fr: 'Mana max', en: 'Max Mana' },
  StartingMana: { fr: 'Mana initial', en: 'Starting Mana' }, ManaRegen: { fr: 'Régén. mana', en: 'Mana Regen' },
  MoveSpeed: { fr: 'Vitesse', en: 'Move Speed' }, Defense: { fr: 'Défense', en: 'Defense' },
  BaseAttackDamage: { fr: 'Dégâts de base', en: 'Base Damage' }, Attack: { fr: 'Attaque', en: 'Attack' },
  Magic: { fr: 'Magie', en: 'Magic' }, BaseAttackSpeed: { fr: 'Vit. d\'attaque de base', en: 'Base Attack Speed' },
  AttackSpeed: { fr: 'Vit. d\'attaque', en: 'Attack Speed' }, AttackRange: { fr: 'Portée', en: 'Range' },
  Crit: { fr: 'Critique', en: 'Crit' }, OmniVamp: { fr: 'Omnivamp', en: 'Omnivamp' },
  DamageAmp: { fr: 'Ampli. dégâts', en: 'Damage Amp' }, HPPerSecond: { fr: 'PV/s', en: 'HP/s' },
  ManaLockTime: { fr: 'Verrou mana', en: 'Mana Lock' }, Rank: { fr: 'Rang', en: 'Rank' },
};

function fillVars(str, vars) {
  if (!vars || typeof str !== 'string') return str;
  return str.replace(/\{([A-Za-z0-9_.]+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

function resolveLocEntry(data, key, lang) {
  if (!key) return null;
  const locEntry = data?.loc?.[key];
  const uiEntry = UI_STRINGS[key];
  if (typeof locEntry === 'string' && locEntry !== '') return locEntry;
  if (typeof uiEntry === 'string' && uiEntry !== '') return uiEntry;
  const vLoc = locEntry?.[lang];
  if (vLoc != null && vLoc !== '') return vLoc;
  const vUi = uiEntry?.[lang];
  if (vUi != null && vUi !== '') return vUi;
  return null;
}

/**
 * Mutates localized display fields on GAME_DATA entities in place for `lang` ('fr' | 'en'),
 * while preserving original English snapshots (`_enName`, `_enDesc`, etc.) on first run.
 */
export function applyLocaleToGameData(data = GAME_DATA, lang = LANG) {
  if (!data || typeof data !== 'object') return data;

  const resolveKeyOrFallback = (key, fallbackEn, vars) => {
    const raw = resolveLocEntry(data, key, lang);
    if (raw != null && raw !== '') {
      return vars ? fillVars(raw, vars) : raw;
    }
    return fallbackEn;
  };

  const entityCollections = [
    data.guilds,
    data.classes,
    data.heroes,
    data.specializations,
    data.activeAbilities,
    data.passiveAbilities,
    data.items,
    data.relics,
    data.rankModifiers,
    data.enemies,
    data.crossroads,
  ];

  for (const col of entityCollections) {
    if (!col || typeof col !== 'object') continue;
    for (const entity of Object.values(col)) {
      if (!entity || typeof entity !== 'object') continue;
      if (!('_enName' in entity)) entity._enName = entity.name;
      if (!('_enDesc' in entity)) entity._enDesc = entity.description;

      if (entity.nameKey || entity._enName !== undefined) {
        entity.name = resolveKeyOrFallback(entity.nameKey, entity._enName, null);
      }
      if (entity.descriptionKey || entity._enDesc !== undefined) {
        entity.description = resolveKeyOrFallback(entity.descriptionKey, entity._enDesc, entity.descriptionVars);
      }

      if (entity.taglineKey || '_enTagline' in entity) {
        if (!('_enTagline' in entity)) entity._enTagline = entity.tagline;
        entity.tagline = resolveKeyOrFallback(entity.taglineKey, entity._enTagline, null);
      }

      if (entity.lore && typeof entity.lore === 'object') {
        const lore = entity.lore;
        if (!('_enAlias' in lore)) lore._enAlias = lore.alias;
        if (!('_enSubtitle' in lore)) lore._enSubtitle = lore.subtitle;
        if (!('_enCurrentGuild' in lore)) lore._enCurrentGuild = lore.currentGuild;
        if (!('_enMotivation' in lore)) lore._enMotivation = lore.motivation;
        if (lore.aliasKey || lore._enAlias !== undefined) {
          lore.alias = resolveKeyOrFallback(lore.aliasKey, lore._enAlias, null);
        }
        if (lore.subtitleKey || lore._enSubtitle !== undefined) {
          lore.subtitle = resolveKeyOrFallback(lore.subtitleKey, lore._enSubtitle, null);
        }
        if (lore.currentGuildKey || lore._enCurrentGuild !== undefined) {
          lore.currentGuild = resolveKeyOrFallback(lore.currentGuildKey, lore._enCurrentGuild, null);
        }
        if (lore.motivationKey || lore._enMotivation !== undefined) {
          lore.motivation = resolveKeyOrFallback(lore.motivationKey, lore._enMotivation, null);
        }
      }

      if (entity.quest && typeof entity.quest === 'object') {
        const q = entity.quest;
        if (!('_enDesc' in q)) q._enDesc = q.description;
        if (!('_enRewardDesc' in q)) q._enRewardDesc = q.rewardDescription;
        if (q.descriptionKey || q._enDesc !== undefined) {
          q.description = resolveKeyOrFallback(q.descriptionKey, q._enDesc, q.descriptionVars);
        }
        if (q.rewardDescriptionKey || q._enRewardDesc !== undefined) {
          q.rewardDescription = resolveKeyOrFallback(q.rewardDescriptionKey, q._enRewardDesc, q.rewardDescriptionVars);
        }
        // Quest items/relics where top-level description mirrors quest.rewardDescription
        if (!entity.descriptionKey && entity._enDesc && entity._enDesc === q._enRewardDesc && q.rewardDescription) {
          entity.description = q.rewardDescription;
        }
      }
    }
  }

  if (data.events && typeof data.events === 'object') {
    for (const ev of Object.values(data.events)) {
      if (!ev || typeof ev !== 'object') continue;
      if (!('_enName' in ev)) ev._enName = ev.name;
      if (!('_enTitle' in ev)) ev._enTitle = ev.title;
      if (!('_enText' in ev)) ev._enText = ev.text;
      if (!('_enCrossroadsDesc' in ev)) ev._enCrossroadsDesc = ev.crossroadsDescription;

      if (ev.nameKey || ev._enName !== undefined) {
        ev.name = resolveKeyOrFallback(ev.nameKey, ev._enName, null);
      }
      if (ev.titleKey) {
        ev.title = resolveKeyOrFallback(ev.titleKey, ev._enTitle, null);
      } else if (lang === 'fr' && ev.nameKey && resolveLocEntry(data, ev.nameKey, 'fr')) {
        ev.title = ev.name;
      } else if (ev._enTitle !== undefined) {
        ev.title = ev._enTitle;
      }
      if (ev.textKey || ev._enText !== undefined) {
        ev.text = resolveKeyOrFallback(ev.textKey, ev._enText, ev.textVars);
      }
      if (ev.crossroadsDescriptionKey || ev._enCrossroadsDesc !== undefined) {
        ev.crossroadsDescription = resolveKeyOrFallback(ev.crossroadsDescriptionKey, ev._enCrossroadsDesc, ev.crossroadsDescriptionVars);
      }

      if (Array.isArray(ev.choices)) {
        for (const ch of ev.choices) {
          if (!ch || typeof ch !== 'object') continue;
          if (!('_enTitle' in ch)) ch._enTitle = ch.title;
          if (!('_enText' in ch)) ch._enText = ch.text;
          if (!('_enOutcome' in ch)) ch._enOutcome = ch.outcome;
          if (!('_enOutcomeText' in ch)) ch._enOutcomeText = ch.outcomeText;

          if (ch.titleKey || ch._enTitle !== undefined) {
            ch.title = resolveKeyOrFallback(ch.titleKey, ch._enTitle, ch.textVars);
          }
          if (ch.textKey || ch._enText !== undefined) {
            ch.text = resolveKeyOrFallback(ch.textKey, ch._enText, ch.textVars);
          }
          const outKey = ch.outcomeTextKey || ch.outcomeKey;
          if (outKey || ch._enOutcome !== undefined) {
            ch.outcome = resolveKeyOrFallback(outKey, ch._enOutcome, ch.outcomeVars);
          }
          if (outKey || ch._enOutcomeText !== undefined) {
            ch.outcomeText = resolveKeyOrFallback(outKey, ch._enOutcomeText ?? ch._enOutcome, ch.outcomeVars);
          }
        }
      }
    }
  }

  return data;
}

export async function loadGameData(url = './data/game_data.json') {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} while loading ${url}`);
  GAME_DATA = await res.json();
  applyLocaleToGameData(GAME_DATA, LANG);
  return GAME_DATA;
}

export function getGameData() { return GAME_DATA; }
export function setGameData(d) {
  GAME_DATA = d;
  applyLocaleToGameData(GAME_DATA, LANG);
}

export function getLang() { return LANG; }
export function setLang(lang) {
  LANG = lang === 'en' ? 'en' : 'fr';
  try { localStorage.setItem('guildrun.lang', LANG); } catch { /* ignore */ }
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = LANG;
  }
  applyLocaleToGameData(GAME_DATA, LANG);
  langListeners.forEach((fn) => { try { fn(LANG); } catch (e) { console.error(e); } });
}
export function onLangChange(fn) { langListeners.add(fn); return () => langListeners.delete(fn); }
try { const saved = localStorage.getItem('guildrun.lang'); if (saved) LANG = saved === 'en' ? 'en' : 'fr'; } catch { /* ignore */ }

function pick(entry) {
  if (entry == null) return null;
  if (typeof entry === 'string') return entry;
  const v = entry[LANG];
  if (v != null && v !== '') return v;
  const en = entry.en;
  if (en != null && en !== '') return en;
  const fr = entry.fr;
  return fr != null && fr !== '' ? fr : null;
}

function lookupKey(key) {
  if (key == null) return null;
  const locEntry = GAME_DATA?.loc?.[key];
  const uiEntry = UI_STRINGS[key];
  if (typeof locEntry === 'string' && locEntry !== '') return locEntry;
  if (typeof uiEntry === 'string' && uiEntry !== '') return uiEntry;
  // Prefer current LANG in data.loc, then UI_STRINGS[key][LANG], before falling back to English
  const vLoc = locEntry?.[LANG];
  if (vLoc != null && vLoc !== '') return vLoc;
  const vUi = uiEntry?.[LANG];
  if (vUi != null && vUi !== '') return vUi;
  const enLoc = locEntry?.en;
  if (enLoc != null && enLoc !== '') return enLoc;
  const enUi = uiEntry?.en;
  if (enUi != null && enUi !== '') return enUi;
  const frLoc = locEntry?.fr;
  if (frLoc != null && frLoc !== '') return frLoc;
  const frUi = uiEntry?.fr;
  if (frUi != null && frUi !== '') return frUi;
  return null;
}

/** Localize a key. Lookup order: data.loc[LANG] → UI_STRINGS[LANG] → data.loc.en → UI_STRINGS.en → key itself. */
export function t(key, vars) {
  if (key == null) return '';
  let s = lookupKey(key);
  if (s == null) s = String(key);
  return fillVars(s, vars);
}

/** True when a localization key resolves to real text. */
export function hasKey(key) {
  return lookupKey(key) != null;
}

/**
 * Resolve a "text-ish" value from game_data: may be a loc key, a {fr,en} object, or plain text.
 */
export function txt(value, vars) {
  if (value == null) return '';
  if (typeof value === 'object') return fillVars(pick(value) || '', vars);
  const s = String(value);
  const resolved = lookupKey(s);
  if (resolved != null) return fillVars(resolved, vars);
  return fillVars(s, vars);
}

export function statName(stat) {
  const e = STAT_NAMES[stat];
  return e ? pick(e) : String(stat);
}
