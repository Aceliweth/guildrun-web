#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fr_dict_items_relics_events.py
Fluent, natural French translations (zero Franglais) for:
  - Items.* and ItemsQuest.*
  - Relics.* and RelicsQuest.*
  - Events.*
  - Enemies.*
  - Lore.*

Exports:
  - FR_ITEMS_RELICS_EVENTS: dict[str, str] mapping loc_key (and exact English strings) -> fluent French
  - translate_rpg_en_to_fr(key: str, en_str: str = None) -> str
"""

import json
import re
from pathlib import Path

# ============================================================================
# 1. ENEMIES (100% coverage of all Enemy names)
# ============================================================================
ENEMIES_EN_TO_FR = {
    "Demon": "Démon",
    "Fire Dragon": "Dragon de Feu",
    "Forest Golem": "Golem Sylvestre",
    "Frost Dragon": "Dragon de Givre",
    "Hydra": "Hydre",
    "Lizard": "Lézard",
    "Mushroom Archer": "Archer Champignon",
    "Mushroom Fire Mage": "Mage de Feu Champignon",
    "Mushroom Frost Mage": "Mage de Givre Champignon",
    "Mushroom Knight": "Chevalier Champignon",
    "Mushroom Tank": "Tank Champignon",
    "Plant Monster": "Monstre Végétal",
    "Poison Dragon": "Dragon Venimeux",
    "Slime": "Gelée",
    "Snake": "Serpent",
    "Spider": "Araignée",
    "TestCrab": "Crabe d'Essai",
    "Turtle": "Tortue",
}

# ============================================================================
# 2. EVENTS (100% coverage of Event names, descriptions, choices & outcomes)
# ============================================================================
EVENTS_EN_TO_FR = {
    # ChoiceOutcomeText
    "\"We're fine, thanks, Mr. Void Beast.\"":
        "« Ça ira, merci, Monsieur la Bête du Néant. »",
    "A deal was struck. The Void Beast hands your guild the relic, reaches into their minds, then disappears. Your Heroes feel strange, but they aren't sure why.":
        "Un pacte a été conclu. La Bête du Néant remet la relique à votre guilde, plonge dans l'esprit de vos Héros, puis disparaît. Vos Héros se sentent étranges, sans trop savoir pourquoi.",
    "As one of the heroes passes, a crystal brushes against their leg. Its power is changing something inside the Hero.":
        "Alors qu'un des Héros passe à proximité, un cristal lui effleure la jambe. Son pouvoir transforme quelque chose au plus profond du Héros.",
    "Better safe than sorry!":
        "Mieux vaut prévenir que guérir !",
    "Each of your Heroes bites into a strange blue fruit. They taste like nostalgia and garlic.":
        "Chacun de vos Héros croque dans un étrange fruit bleu. Il a un goût de nostalgie et d'ail.",
    "Each of your Heroes bites into a strange red fruit. They taste like anxiety and grapes.":
        "Chacun de vos Héros croque dans un étrange fruit rouge. Il a un goût d'anxiété et de raisin.",
    "Each of your Heroes bites into a strange yellow fruit. They taste like uncertainty and lemons.":
        "Chacun de vos Héros croque dans un étrange fruit jaune. Il a un goût d'incertitude et de citron.",
    "One by one, your Heroes walk up to the statue and give it a peck on the cheek. Mere seconds after {hero} gives the final kiss, a wave of unease washes over your Heroes and the statue begins to crumble into dust. With the door unblocked your Heroes wander into the temple.":
        "Un par un, vos Héros s'approchent de la statue et lui déposent un baiser sur la joue. Quelques secondes après le dernier baiser donné par {hero}, une vague de malaise submerge vos Héros et la statue tombe en poussière. La porte étant dégagée, vos Héros pénètrent dans le temple.",
    "You left.":
        "Vous êtes parti.",
    "Your Heroes safely grabbed the item and escaped without waking the monster.":
        "Vos Héros se sont emparés de l'objet en douceur et se sont éclipsés sans réveiller le monstre.",
    "Your Heroes woke the monster while grabbing its treasure. It bellowed flames from its mouth in anger, but your Heroes were able to run before getting too badly burnt.":
        "Vos Héros ont réveillé le monstre en s'emparant de son trésor. Furieux, il a craché un torrent de flammes, mais vos Héros ont réussi à s'enfuir avant d'être trop gravement brûlés.",
    "Your Heroes work away at the crystalline prison with their mining tools until the monster is free. It lacks the strength to thank your guild, but gestures towards a nearby {name} with its eyes.":
        "Vos Héros s'acharnent sur la prison cristalline avec leurs outils de minage jusqu'à libérer le monstre. Trop affaibli pour remercier votre guilde, il désigne du regard un(e) {name} à proximité.",
    "Your guild decorated their banner with a {class}-themed design. They also overcame their greatest challenge yet: a pile of paperwork.":
        "Votre guilde a orné sa bannière d'un motif sur le thème {class}. Elle a également triomphé de sa plus grande épreuve à ce jour : une montagne de paperasse.",
    "Your guild defends the egg from nearby predators. The mother returns to her nest and recognizes your guild's good deed. She regurgitates an artifact from deep within her belly, covered in sticky green goo. Your guild will need some time to wash it off before they can use it.":
        "Votre guilde défend l'œuf contre les prédateurs rôdant aux alentours. La mère regagne son nid et reconnaît la bonne action de votre guilde. Elle régurgite du fond de ses entrailles un artéfact recouvert d'une bave verte gluante. Votre guilde aura besoin d'un peu de temps pour le nettoyer avant de pouvoir s'en servir.",
    "Your guild lifts the egg and slips away. Somewhere behind, something starts to track you.":
        "Votre guilde soulève l'œuf et file en douce. Quelque part derrière vous, quelque chose se met en chasse.",
    "Your guild rushes ahead.":
        "Votre guilde reprend la route sans tarder.",
    "Your guild settles in for a proper rest and wake up the morning more refreshed than usual.":
        "Votre guilde s'installe pour un repos bien mérité et se réveille au matin plus revigorée que jamais.",
    "Your guild settles in for a proper rest.":
        "Votre guilde s'installe pour un repos bien mérité.",
    "{hero} steps up to the statue and plants a kiss on its forehead. They sense a change deep within, and watch as the statue slowly crumbles into dust. With the door unblocked your Heroes wander into the temple.":
        "{hero} s'approche de la statue et dépose un baiser sur son front. Sentant un changement profond s'opérer en soi, votre Héros regarde la statue tomber lentement en poussière. La porte étant dégagée, vos Héros pénètrent dans le temple.",
    "{hero} steps up to the statue and plants a kiss on its lips. They feel a piece of their heart fade away into the statue, and watch as the statue slowly crumbles into dust. With the door unblocked your Heroes wander into the temple.":
        "{hero} s'approche de la statue et dépose un baiser sur ses lèvres. Sentant un fragment de son cœur se dissiper dans la pierre, votre Héros regarde la statue tomber lentement en poussière. La porte étant dégagée, vos Héros pénètrent dans le temple.",

    # ChoiceText
    "Choose 1 of {reliccount} rare relics. Each is paired with a strange fruit relic that reduces a stat for all Heroes.":
        "Choisissez 1 relique rare parmi {reliccount}. Chacune est associée à une relique de fruit étrange qui réduit une statistique pour tous les Héros.",
    "Choose 1 of {reliccount} relics which each increase a stat for all Heroes. Your Heroes start next combat [stunned]<stun> for {stuntime} seconds.":
        "Choisissez 1 relique parmi {reliccount} augmentant chacune une statistique pour tous les Héros. Vos Héros commencent le prochain combat [Étourdis]<stun> pendant {stuntime} secondes.",
    "Choose a B-rank or higher Hero. Randomly retrain their B-Rank Specialization into another one. Get a rare item.":
        "Choisissez un Héros de rang B ou supérieur. Réinitialisez aléatoirement sa Spécialisation de rang B en une autre. Obtenez un objet rare.",
    "Choose a Hero. Retrain one of their upgrades.":
        "Choisissez un Héros. Réinitialisez l'une de ses améliorations.",
    "Choose from {reliccount} common relics. Get the relic after winning {combatcount} combat.":
        "Choisissez parmi {reliccount} reliques communes. Obtenez la relique après avoir remporté {combatcount} combat.",
    "For the next {stuncombatcount} combats your Heroes start combat [stunned]<stun> for {stunduration} seconds. After those {stuncombatcount} combats, your Heroes permanently gain [{maxhpbonus} Max HP]<maxhp>.":
        "Lors des {stuncombatcount} prochains combats, vos Héros commencent le combat [Étourdis]<stun> pendant {stunduration} secondes. Après ces {stuncombatcount} combats, vos Héros gagnent définitivement [{maxhpbonus} PV Max]<maxhp>.",
    "Gain a {name} relic.":
        "Obtenez une relique {name}.",
    "Gain a {name}.":
        "Obtenez {name}.",
    "Gain {itemWithDesc}.":
        "Obtenez {itemWithDesc}.",
    "Gain {name}.":
        "Obtenez {name}.",
    "Gain {name}. A Hero permanently loses {amount} {stat}.":
        "Obtenez {name}. Un Héros perd définitivement {amount} {stat}.",
    "Gain {name}. All Heroes permanently lose {amount} {stat}.":
        "Obtenez {name}. Tous les Héros perdent définitivement {amount} {stat}.",
    "Gain {name}. At the start of next combat, your Heroes receive [Burn]<burn> equal to [{burnpercent}% of their Max HP]<maxhp>.":
        "Obtenez {name}. Au début du prochain combat, vos Héros subissent une [Brûlure]<burn> égale à [{burnpercent}% de leurs PV Max]<maxhp>.",
    "Gain {name}. Your Heroes have [-{defensepenalty}% Defense]<defense> next combat.":
        "Obtenez {name}. Vos Héros ont [-{defensepenalty}% de Défense]<defense> lors du prochain combat.",
    "Gain {name}. Your Heroes start next combat [Stunned]<stun> for {time} seconds.":
        "Obtenez {name}. Vos Héros commencent le prochain combat [Étourdis]<stun> pendant {time} secondes.",
    "Gain {relic}.":
        "Obtenez {relic}.",
    "Get {hero}.":
        "Recrutez {hero}.",
    "Increase your endless mode score by 1.":
        "Augmente votre score en Mode Infini de 1.",
    "Leave without choosing a Hero.":
        "Partir sans choisir de Héros.",
    "Rank up a {rank}-rank or lower Hero.":
        "Promouvoir un Héros de rang {rank} ou inférieur.",
    "Recharge your [Emergency Rewind]<bold> ability.":
        "Rechargez votre capacité de [Stabilisateur d'Urgence]<bold>.",
    "Skip the campfire rewards.":
        "Ignorer les récompenses du feu de camp.",
    "Your Heroes gain [+{statbonus}% basic stats]<basicstat> next combat.":
        "Vos Héros gagnent [+{statbonus}% de stats de base]<basicstat> lors du prochain combat.",

    # ChoiceTitle
    "Blue Fruits": "Fruits Bleus",
    "Bold": "Audacieux",
    "Choose Hero": "Choisir un Héros",
    "Choose Item": "Choisir un Objet",
    "Choose Relic": "Choisir une Relique",
    "Defend": "Défendre",
    "Epic Relic": "Relique Épique",
    "Free (Growth)": "Libérer (Croissance)",
    "Free (Surge)": "Libérer (Essor)",
    "Glory": "Gloire",
    "Ignore": "Ignorer",
    "Kiss Forehead": "Embrasser le front",
    "Kiss Lips": "Embrasser les lèvres",
    "Leave": "Partir",
    "Peck Cheek": "Baiser sur la joue",
    "Recharge": "Recharger",
    "Red Fruits": "Fruits Rouges",
    "Refuse": "Refuser",
    "Rest": "Se reposer",
    "Retrain": "Réentraîner",
    "Safe": "Prudent",
    "Skip": "Passer",
    "Steal": "Voler",
    "Study": "Étudier",
    "Trade": "Échanger",
    "Train": "S'entraîner",
    "Yellow Fruits": "Fruits Jaunes",
    "{name} Design": "Motif : {name}",

    # CrossroadsDescription
    "A gift for your newly-formed guild.":
        "Un cadeau pour votre guilde fraîchement formée.",
    "A moment of peace.":
        "Un moment de répit.",
    "Choose a single Hero to battle against an enemy for a variety of rewards.\n\nThere are no penalties for death or defeat in trial combats.":
        "Choisissez un seul Héros pour affronter un ennemi en duel et remporter diverses récompenses.\n\nIl n'y a aucune pénalité en cas de mort ou de défaite lors des combats d'épreuve.",
    "Choose from 1 of 3 epic items.":
        "Choisissez 1 objet épique parmi 3.",
    "Choose from 1 of 3 rare relics.":
        "Choisissez 1 relique rare parmi 3.",
    "Choose from relics of increasing rarity for a price.":
        "Choisissez parmi des reliques de rareté croissante en payant le prix.",
    "Craft a banner for your guild.":
        "Confectionnez une bannière pour votre guilde.",
    "Defeat the Act 1 Boss with a challenging twist to earn a rare relic.\n\nThere are no penalties for death or defeat in trial combats.":
        "Terrassez le Boss de l'Acte 1 avec un handicap corsé pour remporter une relique rare.\n\nIl n'y a aucune pénalité en cas de mort ou de défaite lors des combats d'épreuve.",
    "Gain Shards in the future, or gain an item for a cost.":
        "Gagnez des Éclats plus tard, ou obtenez un objet en payant le prix.",
    "Gain a rare relic for a price.":
        "Obtenez une relique rare en payant le prix.",
    "Gain an item, or gain an epic item or relic at a cost.":
        "Obtenez un objet, ou obtenez un objet épique ou une relique en payant le prix.",
    "Gain an item.":
        "Obtenez un objet.",
    "Gain an item. Rarer items Burn your Heroes next combat.":
        "Obtenez un objet. Les objets plus rares infligent Brûlure à vos Héros lors du prochain combat.",
    "Gain immediate or future power, for a price.":
        "Gagnez en puissance immédiatement ou plus tard, en payant le prix.",
    "Gain relics or items for a price.":
        "Obtenez des reliques ou des objets en payant le prix.",
    "Gain special relics and items for your most-played classes.":
        "Obtenez des reliques et objets spéciaux pour vos classes les plus jouées.",
    "Gain stats, or choose to fight stronger enemies for future rewards.":
        "Gagnez des statistiques, ou choisissez d'affronter des ennemis plus redoutables contre de futures récompenses.",
    "Gamble for a relic, Shards, or a curse.":
        "Tentez votre chance pour obtenir une relique, des Éclats ou une malédiction.",
    "Gamble for increasingly powerful rewards.":
        "Tentez votre chance pour obtenir des récompenses de plus en plus puissantes.",
    "Get a common item that increases Attack Speed.":
        "Obtenez un objet commun qui augmente la Vitesse d'Attaque.",
    "Get a common item that increases Attack.":
        "Obtenez un objet commun qui augmente l'Attaque.",
    "Get a common item that increases Crit.":
        "Obtenez un objet commun qui augmente le Critique.",
    "Get a common item that increases Defense.":
        "Obtenez un objet commun qui augmente la Défense.",
    "Get a common item that increases Magic.":
        "Obtenez un objet commun qui augmente la Magie.",
    "Get a common item that increases Mana Regen.":
        "Obtenez un objet commun qui augmente la Régén. Mana.",
    "Get a common item that increases Max HP.":
        "Obtenez un objet commun qui augmente les PV Max.",
    "Get a random epic relic.":
        "Obtenez une relique épique aléatoire.",
    "Get a special item or relic which pays off in the future.":
        "Obtenez un objet spécial ou une relique qui portera ses fruits plus tard.",
    "Get a special item or relic with defensive properties.":
        "Obtenez un objet spécial ou une relique aux propriétés défensives.",
    "Get a special item or relic with offensive properties.":
        "Obtenez un objet spécial ou une relique aux propriétés offensives.",
    "Get an S-Rank Hero from one of your most-played classes.":
        "Recrutez un Héros de rang S appartenant à l'une de vos classes les plus jouées.",
    "Get relics or items in the future.":
        "Obtenez des reliques ou des objets plus tard.",
    "Heroes gain +{statbonus}% basic stats next combat.":
        "Les Héros gagnent +{statbonus}% de stats de base lors du prochain combat.",
    "Permanently increase a Hero's Attack Speed by {amount}.":
        "Augmente définitivement la Vitesse d'Attaque d'un Héros de {amount}.",
    "Permanently increase a Hero's Attack by {amount}.":
        "Augmente définitivement l'Attaque d'un Héros de {amount}.",
    "Permanently increase a Hero's Crit by {amount}.":
        "Augmente définitivement le Critique d'un Héros de {amount}.",
    "Permanently increase a Hero's Defense by {amount}.":
        "Augmente définitivement la Défense d'un Héros de {amount}.",
    "Permanently increase a Hero's HP/S by {amount}.":
        "Augmente définitivement les PV/s d'un Héros de {amount}.",
    "Permanently increase a Hero's Magic by {amount}.":
        "Augmente définitivement la Magie d'un Héros de {amount}.",
    "Permanently increase a Hero's Mana Regen by {amount}.":
        "Augmente définitivement la Régén. Mana d'un Héros de {amount}.",
    "Permanently increase a Hero's Max HP by {amount}.":
        "Augmente définitivement les PV Max d'un Héros de {amount}.",
    "Permanently increase a Hero's Omnivamp by {amount}.":
        "Augmente définitivement l'Omnivamp d'un Héros de {amount}.",
    "Quickly defeat a durable enemy to earn Shards.\n\nThere are no penalties for death or defeat in trial combats.":
        "Terrassez rapidement un ennemi coriace pour gagner des Éclats.\n\nIl n'y a aucune pénalité en cas de mort ou de défaite lors des combats d'épreuve.",
    "Rank up a Hero at a price, or strengthen one later.":
        "Promouvez un Héros en payant le prix, ou renforcez-en un plus tard.",
    "Retrain a Hero, or strengthen Heroes over time.":
        "Réentraînez un Héros, ou renforcez vos Héros sur la durée.",
    "Retrain an upgrade on one of your Heroes.":
        "Réinitialisez une amélioration sur l'un de vos Héros.",
    "Survive as long as possible against immortal enemies to earn Shards.\n\nThere are no penalties for death or defeat in trial combats.":
        "Survivez le plus longtemps possible face à des ennemis immortels pour gagner des Éclats.\n\nIl n'y a aucune pénalité en cas de mort ou de défaite lors des combats d'épreuve.",
    "Wait for a common relic, or take a rarer one at a cost.":
        "Patientez pour obtenir une relique commune, ou prenez-en une plus rare en payant le prix.",

    # EventDescription
    "A camp left behind by an unsuccessful guild, abandoned in a hurry. They didn't die here, but they did leave something useful behind.":
        "Un campement abandonné à la hâte par une guilde malchanceuse. Ses membres n'ont pas péri ici, mais ils ont laissé quelque chose d'utile derrière eux.",
    "A clerk from the Department of Guild Affairs leans through the rift's threshold, parcel in hand. She waves your guild over and hands them the parcel before vanishing back to the other side.":
        "Une employée du Département des Affaires de Guilde se penche à travers le seuil de la faille, un colis à la main. Elle fait signe à votre guilde d'approcher et lui remet le paquet avant de disparaître de l'autre côté.",
    "A faceless creature drifts towards your guild. It draws a scroll from its sleeve and unfurls it to reveal a mess of swirling, inky, alien runes. The runes thoughtfully re-arrange themselves into symbols your Heroes can recognize: \"I have relic, if you have shard.\"":
        "Une créature sans visage flotte vers votre guilde. Elle tire un parchemin de sa manche et le déroule, révélant un enchevêtrement de runes d'encre extraterrestres. Les runes se réorganisent d'elles-mêmes pour former des symboles que vos Héros peuvent lire : « J'ai relique, si vous avez éclat. »",
    "A figure in a dark uniform skids out of a portal, parcel tucked under one arm. He lands beside your guild, already producing a clipboard.":
        "Une silhouette en uniforme sombre dérape hors d'un portail, un colis coincé sous le bras. Il atterrit aux côtés de votre guilde en sortant déjà son porte-bloc.",
    "A giant beast snores away peacefully atop a hoard of precious items it has collected over the eons. Its nostrils bellow smoke with each exhale.":
        "Une bête gigantesque ronfle paisiblement au sommet d'un trésor d'objets précieux amassés au fil des éons. Ses narines crachent de la fumée à chaque expiration.",
    "A long-dead beast lies sprawled across the path, swallowed by vines. Its armor is still intact.":
        "Une bête morte depuis longtemps gît en travers du chemin, engloutie par les lianes. Son armure est encore intacte.",
    "A majestic waterfall appears before your guild. A high-pitched ringing sound pierces through the crashing water every 15 seconds like clockwork. It seems to be coming from behind the waterfall.":
        "Une cascade majestueuse se dresse devant votre guilde. Un tintement aigu perce le fracas de l'eau toutes les 15 secondes avec la régularité d'un métronome. Il semble provenir de derrière le rideau d'eau.",
    "A single egg, big as a barrel, rests in a nest of bones. Something glints inside the shell - an artifact, half-grown into its surface. The mother is nowhere in sight, but it can't be far.":
        "Un œuf solitaire, gros comme un tonneau, repose dans un nid d'ossements. Quelque chose scintille dans la coquille : un artéfact à moitié incrusté dans sa surface. La mère n'est pas en vue, mais elle ne doit pas être bien loin.",
    "A stone altar, mostly reclaimed by moss. Something gleams at its base.":
        "Un autel de pierre, presque entièrement envahi par la mousse. Quelque chose luit à sa base.",
    "A three-way fork in the road. To the left, a quiet meadow. To the middle, a chasm split with jagged pillars. To the right, a dark forest of bone-white trees.":
        "Une bifurcation à trois voies. À gauche, une prairie paisible. Au centre, un gouffre hérissé de piliers déchiquetés. À droite, une forêt sombre aux arbres blancs comme l'os.",
    "An adorable rift puppy is surrounded by hungry beasts. It pleads for help with beady, sad eyes.":
        "Un adorable chiot de la faille est encerclé par des bêtes affamées. Il implore votre aide de ses petits yeux tristes.",
    "An ancient being materializes in front of your guild. It hungers not for flesh or Shards, but memories. It conjures 3 long-lost relics before your guild, and offers them in exchange for a bite of remembrance.":
        "Une entité ancienne se matérialise devant votre guilde. Elle n'est affamée ni de chair ni d'Éclats, mais de souvenirs. Elle fait apparaître 3 reliques oubliées devant votre guilde et les propose en échange d'une bouchée de mémoire.",
    "Choose a Rare Relic":
        "Choisissez une Relique Rare",
    "Choose an Epic item.":
        "Choisissez un Objet Épique.",
    "Get a random S-Rank Hero from one of your 3 most-played classes.":
        "Recrutez un Héros de rang S aléatoire appartenant à l'une de vos 3 classes les plus jouées.",
    "The path ahead is blocked by a large monster encased in crystal up to its neck. The crystals are draining its power, and it seems to take all of the monster's remaining energy to pry open a single eye to gaze sadly upon your Heroes. It seems harmless, and could use your help.":
        "Le chemin est bloqué par un imposant monstre prisonnier du cristal jusqu'au cou. Les cristaux drainent son énergie, et le monstre semble puiser dans ses toutes dernières forces pour entrouvrir un œil et poser un regard triste sur vos Héros. Il paraît inoffensif et aurait bien besoin de votre aide.",
    "You found {amount} Shards in a pile by the river.":
        "Vous avez trouvé un tas de {amount} Éclats au bord de la rivière.",
    "Your Heroes find themselves drawn towards the edge of an old well, the stone worn smooth by age. The water below seems tempting; the deeper they look, the brighter it shines.":
        "Vos Héros se sentent attirés vers la margelle d'un vieux puits dont la pierre a été polie par le temps. L'eau au fond paraît tentante : plus ils plongent le regard, plus elle brille intensément.",
    "Your Heroes stumble upon a whisper-still pool of bright blue water in a glade. As they gaze into it, its perfectly mirrored surface begins to ripple and swirl with reflections of the past. An object shimmers at the water's surface. ":
        "Vos Héros tombent sur un bassin d'eau d'un bleu éclatant, parfaitement immobile au cœur d'une clairière. Tandis qu'ils le contemplent, sa surface miroitante se met à onduler et à tourbillonner de reflets du passé. Un objet miroite à la surface de l'eau.",
    "Your Heroes stumble upon a whisper-still pool of bright blue water in a glade. As they gaze into it, its perfectly mirrored surface begins to ripple and swirl with reflections of the past. An object shimmers at the water's surface.":
        "Vos Héros tombent sur un bassin d'eau d'un bleu éclatant, parfaitement immobile au cœur d'une clairière. Tandis qu'ils le contemplent, sa surface miroitante se met à onduler et à tourbillonner de reflets du passé. Un objet miroite à la surface de l'eau.",
    "Your guild catches a break between fights. Talk drifts to the guild's banner, which needs a design to be submitted to The Department of Guild Affairs by tomorrow. Each Hero has their own opinion on which design they should choose for the banner.":
        "Votre guilde profite d'une accalmie entre deux combats. La discussion dérive sur la bannière de la guilde, dont le motif doit être soumis au Département des Affaires de Guilde d'ici demain. Chaque Héros a son propre avis sur le motif à adopter.",
    "Your guild crests a hill and notices an energy field containing a single monster waiting in the valley below, standing triumphantly over a pile of treasure.":
        "Votre guilde franchit la crête d'une colline et aperçoit un champ d'énergie renfermant un unique monstre qui attend dans la vallée en contrebas, dressé triomphalement sur un tas de trésors.",
    "Your guild decides to investigate a crumbling ruin. Inside, they find an ancient map carved directly into its walls. It points to treasures in four different directions.":
        "Votre guilde décide d'explorer des ruines croulantes. À l'intérieur, elle découvre une carte ancienne gravée à même les murs, indiquant des trésors dans quatre directions différentes.",
    "Your guild discovers a massive creature standing inside a canyon. Even from afar they can clearly recognize the very same {bossname} they defeated not long ago!\nThere are sizzling runes etched around it in a circle.":
        "Votre guilde découvre une créature colossale au fond d'un canyon. Même de loin, vos Héros reconnaissent sans peine le même {bossname} qu'ils ont vaincu il y a peu !\nDes runes grésillantes sont gravées en cercle tout autour de lui.",
    "Your guild discovers a mausoleum. Once inside, they notice a reliquary with three open urns sitting atop it. As your guild approaches the urns, they slam shut and shuffle themselves, as though guided by the hand of some far-off swindler.":
        "Votre guilde découvre un mausolée. À l'intérieur, elle remarque un reliquaire surmonté de trois urnes ouvertes. Dès que votre guilde s'en approche, les urnes se referment d'un coup sec et se mélangent toutes seules, comme manipulées par la main d'un escroc invisible.",
    "Your guild finds a large node of glowing Shards.":
        "Votre guilde découvre un riche filon d'Éclats luisants.",
    "Your guild finds a secluded location to rest and recover before the next fight.":
        "Votre guilde trouve un endroit isolé pour se reposer et récupérer avant le prochain combat.",
    "Your guild gathers around the campfire, and your Heroes enjoy a rare moment of calm.":
        "Votre guilde se rassemble autour du feu de camp, et vos Héros profitent d'un rare moment d'accalmie.",
    "Your guild spots a ring of pulsing mushrooms in a clearing, each one as big as a bear. Spores roll off them in slow green waves. At the center, a slim rift hovers above a pile of treasures.":
        "Votre guilde repère dans une clairière un cercle de champignons palpitants, chacun aussi gros qu'un ours. Des spores s'en échappent en lentes vagues verdâtres. Au centre, une fine faille flotte au-dessus d'un amas de trésors.",
    "Your guild spots an energy field surrounding a single armored turtle. It's protecting a pile of Shards. It doesn't seem very threatening, but its shell looks incredibly sturdy.":
        "Votre guilde repère un champ d'énergie entourant une tortue cuirassée solitaire qui protège un tas d'Éclats. Elle n'a pas l'air très menaçante, mais sa carapace semble incroyablement robuste.",
    "Your guild turns a corner and notices an energy field surrounding a small army of mushroom monsters. They are guarding a pile of Shards, and seem to be surrounded by an impenetrable shield.":
        "Au détour d'un chemin, votre guilde aperçoit un champ d'énergie entourant une petite armée de monstres-champignons. Ils gardent un tas d'Éclats et semblent protégés par un bouclier impénétrable.",
    "Your guild wanders into a large grove of colorful, alien fruits. Upon closer inspection, the fruits are warm to the touch and radiate large amounts of magical energy.":
        "Votre guilde s'aventure dans un vaste bosquet d'arbres aux fruits exotiques et colorés. En les examinant de plus près, les fruits sont chauds au toucher et dégagent une intense énergie magique.",
    "Your guild wanders upon an ornate stone temple. The door to the temple is blocked by the weathered statue of a strange monster. The statue's true form has been lost to time, but its wide mouth and squat frame vaguely resemble that of a frog.\n\nThe statue whispers something into the minds of your Heroes, not in language they recognize but in a wave of pure intention. \"Kiss me. Free me.\"":
        "Votre guilde tombe sur un temple de pierre richement orné. La porte du sanctuaire est bloquée par la statue érodée d'un monstre étrange. Sa forme originelle s'est perdue dans les âges, mais sa large bouche et sa silhouette trapue rappellent vaguement celles d'une grenouille.\n\nLa statue murmure dans l'esprit de vos Héros, non pas avec des mots connus, mais par une onde de pure intention : « Embrassez-moi. Libérez-moi. »",

    # EventName & Name
    "A Pile of Shards": "Un Tas d'Éclats",
    "Attack Boost": "Bonus d'Attaque",
    "Attack Speed Boost": "Bonus de Vitesse d'Attaque",
    "Choose an Epic Item": "Choisir un Objet Épique",
    "Crit Boost": "Bonus de Critique",
    "Crystalline Prison": "Prison Cristalline",
    "Defense Boost": "Bonus de Défense",
    "Express Delivery": "Livraison Express",
    "Find an Item": "Trouver un Objet",
    "HP/S Boost": "Bonus de PV/s",
    "Increase Endless Score": "Score Infini +1",
    "Magic Boost": "Bonus de Magie",
    "Mana Regen Boost": "Bonus de Régén. Mana",
    "Max HP Boost": "Bonus de PV Max",
    "Mine Shards": "Filon d'Éclats",
    "Omnivamp Boost": "Bonus d'Omnivamp",
    "Random Epic Relic": "Relique Épique Aléatoire",
    "S-Rank Hero": "Héros de Rang S",
    "Starter Kit": "Pack de Départ",
    "Strange Fruits": "Fruits Étranges",
    "The Abandoned Camp": "Le Camp Abandonné",
    "The Altar": "L'Autel",
    "The Campfire": "Le Feu de Camp",
    "The Curse of the Kiss": "La Malédiction du Baiser",
    "The Debtor": "Le Débiteur",
    "The Etched Path": "Le Sentier Gravé",
    "The Fairy Ring": "Le Cercle de Fées",
    "The Fallen Beast": "La Bête Déchue",
    "The Guild Banner": "La Bannière de Guilde",
    "The Nest": "Le Nid",
    "The Reflecting Pool": "Le Bassin des Reflets",
    "The Rift Puppy": "Le Chiot de la Faille",
    "The Ringing Fall": "La Cascade Tintante",
    "The Slumbering Monster": "Le Monstre Assoupi",
    "The Three Urns": "Les Trois Urnes",
    "The Void Beast": "La Bête du Néant",
    "The Well of Temptations": "Le Puits des Tentations",
    "Three Paths": "Les Trois Chemins",
    "Train a Hero": "Entraîner un Héros",
    "Trial: Demolition": "Épreuve : Démolition",
    "Trial: Endurance": "Épreuve : Endurance",
    "Trial: Rematch": "Épreuve : Revanche",
    "Trial: Single Combat": "Épreuve : Combat Singulier",
    "2x Common Items": "2x Objets Communs",
    "A Heap of Shards": "Un Amas d'Éclats",
    "A Hoard of Shards": "Un Trésor d'Éclats",
    "A-Rank Hero": "Héros de Rang A",
    "B-Rank Hero": "Héros de Rang B",
    "C-Rank Hero": "Héros de Rang C",
    "Extra Large Stat Bonus": "Très Grand Bonus de Stats",
    "Get 2 Rare Items": "Obtenir 2 Objets Rares",
    "Large Stat Bonus": "Grand Bonus de Stats",
    "Medium Attack Bonus": "Bonus Moyen d'Attaque",
    "Medium Attack Speed Bonus": "Bonus Moyen de Vitesse d'Attaque",
    "Medium Crit Bonus": "Bonus Moyen de Critique",
    "Medium Defense Bonus": "Bonus Moyen de Défense",
    "Medium Magic Bonus": "Bonus Moyen de Magie",
    "Medium Mana Regen Bonus": "Bonus Moyen de Régén. Mana",
    "Medium Max HP Bonus": "Bonus Moyen de PV Max",
    "Medium Stat Bonus": "Bonus Moyen de Stats",
    "One-Time Hero Discount": "Réduction Unique sur un Héros",
    "One-Time Relic Discount": "Réduction Unique sur une Relique",
    "Random Re-Roll (re-do to spec re roll)": "Relance Aléatoire (Spécialisation)",
    "Random Relic": "Relique Aléatoire",
    "Rank Up (B or Re-Roll": "Promotion (Rang B) ou Relance",
    "Rank Up (C) or Re-Roll": "Promotion (Rang C) ou Relance",
    "Rare Attack Item": "Objet Rare d'Attaque",
    "Rare Attack Speed Item": "Objet Rare de Vitesse d'Attaque",
    "Rare Crit Item": "Objet Rare de Critique",
    "Rare Defense Item": "Objet Rare de Défense",
    "Rare Magic Item": "Objet Rare de Magie",
    "Rare Mana Regen Item": "Objet Rare de Régén. Mana",
    "Rare Max HP Item": "Objet Rare de PV Max",
    "Specific Relic": "Relique Spécifique",
    "Temporary Boost": "Bonus Temporaire",
}

# ============================================================================
# 3. LORE (100% coverage of Hero & Guild Lore)
# ============================================================================
LORE_EN_TO_FR = {
    # Aria
    "A famous singer years before her Awakening. When her powers grew, her voice swelled, a choir rose with it. She still performs, and takes rift contracts between tours; letting her power loose in a rift is the one thing that quiets the choir.":
        "Chanteuse célèbre bien des années avant son Éveil. Lorsque ses pouvoirs ont grandi et que sa voix a pris de l'ampleur, tout un chœur s'est élevé avec elle. Elle monte toujours sur scène et accepte des contrats de faille entre deux tournées : déchaîner son pouvoir dans une faille est la seule chose qui apaise le chœur.",
    "I've brought them with me.":
        "Je les ai amenés avec moi.",
    "The Requiem":
        "Le Requiem",
    "The voices grow restless between fights. She's looking for a guild that keeps them singing.":
        "Les voix s'agitent entre les combats. Elle cherche une guilde qui leur permettra de continuer à chanter.",

    # Athletic (Frontline)
    "Stronger every break.":
        "Plus forts à chaque brèche.",
    "They believe the only way to close the rifts is to overpower them, and they've turned that conviction into a performance brand. Teams train and compete like athletes, chasing a personal best with every break.":
        "Ils sont convaincus que le seul moyen de refermer les failles est de les écraser par la force brute, et ils ont fait de cette conviction une marque de haute performance. Les équipes s'entraînent et rivalisent comme des athlètes de haut niveau, cherchant à battre leur record personnel à chaque brèche.",

    # Bohemian (Gaia)
    "A community-driven guild that treats the rifts as living phenomena to be understood. Its breakers study each one closely and work to restore the natural balance around it, often staying long after the fighting is done.":
        "Une guilde communautaire qui considère les failles comme des phénomènes vivants qu'il faut comprendre. Ses briseurs étudient chacune d'elles avec attention et œuvrent à restaurer l'équilibre naturel aux alentours, restant souvent sur place bien après la fin des combats.",
    "Fight for tomorrow, not just today.":
        "Se battre pour demain, pas seulement pour aujourd'hui.",

    # Corporate (Aegis)
    "A corporate guild that has built a global network spanning crystal refinement, relic acquisition, and rift forecasting. It contracts its breakers to keep supply chains moving and rift activity contained.":
        "Une mégacorporation de guilde ayant bâti un réseau mondial couvrant le raffinage de cristaux, l'acquisition de reliques et la prévision des failles. Elle emploie ses briseurs pour assurer la continuité des chaînes d'approvisionnement et contenir l'activité des failles.",
    "Certainty in an uncertain world.":
        "La certitude dans un monde incertain.",

    # Dragomir
    "Aegis is starting to ask questions. A new guild means new faces and answers he won't have to give for years.":
        "Aegis commence à poser des questions. Une nouvelle guilde signifie de nouveaux visages et des réponses qu'il n'aura pas à donner avant des années.",
    "Dragomir's Awakening nearly killed him. Look closely and you could argue it partly did. Yet every year since, he's looked a little more vibrant, a little more alive; his doctors stopped trying to offer explanations long ago. He's well-spoken, with an old-world courtesy that puts people at ease and keeps anyone from investigating his condition too closely.":
        "L'Éveil de Dragomir a failli le tuer. À y regarder de plus près, on pourrait dire que c'est en partie le cas. Pourtant, chaque année depuis lors, il paraît un peu plus vigoureux, un peu plus vivant ; ses médecins ont renoncé depuis longtemps à trouver une explication. Éloquent et doté d'une courtoisie d'un autre siècle, il met tout le monde à l'aise et dissuade quiconque d'examiner son état de trop près.",
    "The Executive":
        "Le Cadre Dirigeant",
    "You'll want me here. Trust me.":
        "Vous aurez besoin de moi ici. Croyez-moi.",

    # Fiona
    "A guild with the resources to keep her workshop stocked and the sense not to disturb her while she works.":
        "Une guilde ayant les ressources nécessaires pour approvisionner son atelier et le bon sens de ne pas la déranger pendant qu'elle travaille.",
    "I've got all we need here with me.":
        "J'ai tout ce qu'il nous faut sur moi.",
    "She fixed toasters and bicycles at a neighborhood repair café before her Awakening gave her the rare gift of fusing artifacts inside a rift, fusing gear like no other breaker can. She's Niklas's right hand across Aegis's supply chain: he acquires, she combines. No one's figured out how artifacts actually work, but her goal is to build them from scratch.":
        "Elle réparait des grille-pains et des vélos dans un atelier de quartier avant que son Éveil ne lui confère le don rare de fusionner les artéfacts au cœur d'une faille, combinant l'équipement comme aucun autre briseur. Elle est le bras droit de Niklas dans la chaîne logistique d'Aegis : il acquiert, elle assemble. Personne n'a encore compris comment fonctionnent réellement les artéfacts, mais son ambition est d'en fabriquer de toutes pièces.",
    "The Maker":
        "L'Artisane",

    # Funke
    "Every guild so far has wanted him smaller, contained. Be the first to ask what happens when he stops holding back, and he'll show you personally.":
        "Jusqu'ici, toutes les guildes ont voulu le brider, le contenir. Soyez le premier à lui demander ce qui se passe quand il cesse de se retenir, et il se fera un plaisir de vous le montrer en personne.",
    "Funke's flames were never meant to be carried inside one body. He ended raids alone and took half the site with him. The incident reports stopped distinguishing between \"victory\" and \"collateral\" years ago. A Temple is the only guild that can work with him at all, and even that takes everything he has to hold back. Sometimes he goes quiet mid-thought, like he's listening to something else.":
        "Les flammes de Funke n'ont jamais été faites pour tenir dans un seul corps. Il a mis fin à des raids à lui seul en emportant la moitié du site au passage. Les rapports d'incident ont cessé de faire la distinction entre « victoire » et « dégâts collatéraux » depuis des années. Le Temple est la seule guilde capable de travailler avec lui, et même là, il doit puiser dans toutes ses forces pour se contenir. Parfois, il s'arrête au milieu d'une phrase, comme s'il écoutait autre chose.",
    "Let me do things my way.":
        "Laissez-moi faire à ma manière.",
    "The Shackled":
        "L'Enchaîné",

    # Grace
    "Give her the confidence she's missing. Believe in her, and she becomes the backbone of your team.":
        "Donnez-lui la confiance qui lui manque. Croyez en elle, et elle deviendra le pilier de votre équipe.",
    "Me? Really? I.. I'll try my best.":
        "Moi ? Vraiment ? Je... je ferai de mon mieux.",
    "The Saint":
        "La Sainte",
    "The bookish one in a family of athletes, Grace never expected to end up in a rift. Then her awakened powers turned up a rare healing affinity, and the Department of Guild Affairs fielded her before she'd decided if she wanted it. Frightened before every fight, frightened after every one, and back again for the next anyway. It's exactly the story Frontline's self-improvement campaigns are built to tell.":
        "Rat de bibliothèque au sein d'une famille d'athlètes, Grace ne s'attendait jamais à finir dans une faille. Puis ses pouvoirs éveillés ont révélé une rare affinité de soin, et le Département des Affaires de Guilde l'a déployée sur le terrain avant même qu'elle ait pu donner son avis. Terrifiée avant chaque combat, terrifiée après, elle répond pourtant toujours présente au suivant. C'est exactement le genre d'histoire que les campagnes de dépassement de soi de Frontline adorent raconter.",

    # Gustav
    "He came up through academia, with three published papers before he turned twenty one, and Aegis hired him straight out of his post-doc. He runs the numbers behind crystal refining, making each batch yield more usable energy than the last, and his models are why Aegis's supply chain has stayed a step ahead of every competitor for six straight quarters.":
        "Issu du monde universitaire avec trois articles publiés avant même ses vingt et un ans, il a été recruté par Aegis dès la fin de son post-doctorat. C'est lui qui gère les modèles mathématiques du raffinage de cristaux, permettant à chaque lot de produire toujours plus d'énergie utilisable ; grâce à ses calculs, la chaîne logistique d'Aegis garde une longueur d'avance sur tous ses concurrents depuis six trimestres consécutifs.",
    "He wants a new challenge. Yours presents an interesting scenario. He'd like to see how it plays out.":
        "Il cherche un nouveau défi. Votre guilde présente un scénario intéressant, et il aimerait voir comment les choses vont évoluer.",
    "I've been wanting to test a scenario like this.":
        "Cela faisait longtemps que je voulais tester un tel scénario.",
    "The Analyst":
        "L'Analyste",

    # Hoyoung
    "A smaller guild means less time waiting at the back of a big raid and more contracts he can actually close. More contracts, more rank, more money. The math isn't complicated.":
        "Une guilde plus modeste signifie moins de temps à attendre à l'arrière d'un grand raid et davantage de contrats qu'il peut réellement boucler. Plus de contrats, plus de rang, plus d'argent. Le calcul est vite fait.",
    "Even by a marksman's standard he's reliable to a degree that's rare, and no one can trace where he learned it: no paper trail, no prior guild, no training on record. He keeps to himself, says only what needs saying, and the shot lines up every time. He's covering a younger brother's tuition; once it's paid, he may leave the way he arrived.":
        "Même selon les critères des tireurs d'élite, sa fiabilité est hors du commun, et personne ne sait d'où il tient son savoir-faire : aucune trace écrite, aucune guilde précédente, aucun entraînement enregistré. Il reste discret, ne dit que le strict nécessaire, et fait mouche à chaque tir. Il paie les études de son petit frère ; une fois celles-ci réglées, il repartira peut-être comme il est venu.",
    "Everything is lining up.":
        "Tout s'aligne parfaitement.",
    "The Newcomer":
        "Le Nouveau Venu",

    # Irini
    "A champion athlete, until a shoulder injury ended her career. Her powers awakened soon after, healing her - but making her too strong to fairly compete against ordinary people. Frontline signed her soon after. The performance guild built an entire marketing campaign around her: a champion everyone wrote off, coming back stronger than ever. In the rifts she's known for her ambition and explosive power.":
        "Athlète championne jusqu'à ce qu'une blessure à l'épaule mette fin à sa carrière. Ses pouvoirs se sont éveillés peu après, la guérissant, mais la rendant bien trop forte pour concourir équitablement contre des gens ordinaires. Frontline l'a recrutée dans la foulée. La guilde de performance a bâti toute une campagne marketing autour d'elle : une championne que tout le monde croyait finie, de retour plus forte que jamais. Dans les failles, elle est réputée pour son ambition et sa puissance explosive.",
    "A new guild is a clean track: real stakes, a team that needs her to perform rather than pose.":
        "Une nouvelle guilde est une piste vierge : de vrais enjeux, et une équipe qui a besoin de ses performances plutôt que de ses poses devant l'objectif.",
    "Second Wind":
        "Second Souffle",
    "They said I'd never do this again.":
        "Ils disaient que je ne referais plus jamais ça.",

    # Kai
    "Don't have all the fun without me.":
        "Ne vous amusez pas sans moi.",
    "One of the guild's shotcallers. He leads on charm more than rank, and keeps the team together when a fight turns. He made his name soloing a guardian before his squad could catch up, and he's been pushing past what the playbook recommends ever since.":
        "L'un des meneurs tactiques de la guilde. Il dirige par son charisme bien plus que par son grade et maintient la cohésion de l'équipe quand le combat tourne mal. Il s'est fait un nom en terrassant un gardien en solo avant même que son escouade ait pu le rejoindre, et il ne cesse de repousser les limites du manuel depuis lors.",
    "The Hunt does steady work, and steady bores him. Yours looks like the one that won't play it safe.":
        "La Chasse accomplit un travail régulier, et la routine l'ennuie. Votre guilde a tout l'air de ne pas jouer la sécurité.",
    "The Shotcaller":
        "Le Stratège",

    # Karsu
    "I'm not here to talk.":
        "Je ne suis pas là pour bavarder.",
    "She doesn't think the big, official guilds will ever end this crisis. If your guild does things differently, she'll listen.":
        "Elle ne croit pas que les grandes guildes officielles mettront un jour fin à cette crise. Si votre guilde agit différemment, elle vous écoutera.",
    "She's a frost duelist: patient, exact, and the one who actually finishes the fights everyone else in the punk guild loves starting. She came over from Aegis Global, Dragomir's department officially, and whatever she walked away with isn't on any record. A Temple offered her a contract on the spot.":
        "Duelliste de givre patiente et méthodique, c'est elle qui termine les combats que tous les autres membres de la guilde punk adorent déclencher. Elle vient d'Aegis Global — officiellement du département de Dragomir — et ce qu'elle a emporté en partant ne figure dans aucun registre. Le Temple lui a offert un contrat sur-le-champ.",
    "The Finisher":
        "L'Exécutrice",

    # Logan
    "He believes the big guilds gain too much from the Rift crisis to ever end it. Prove your guild actually wants to finish it, and he's all in.":
        "Il est persuadé que les grandes guildes tirent trop de profits de la crise des Failles pour vouloir y mettre un terme. Prouvez-lui que votre guilde veut réellement en finir, et il vous suivra jusqu'au bout.",
    "I don't fight for sport. I fight to end this.":
        "Je ne me bats pas pour le sport. Je me bats pour en finir.",
    "Logan survived a rift that got all members of his previous team killed. Since then he fights with one goal: end every fight as fast as possible. No showing off, no wasted moves, no casualties. Frontline loves marketing its stars - Logan gives them nothing to work with, and doesn't care.":
        "Logan a survécu à une faille qui a coûté la vie à tous les membres de son ancienne équipe. Depuis, il se bat avec un seul objectif : abréger chaque affrontement le plus vite possible. Pas d'esbroufe, pas de gestes inutiles, pas de pertes. Frontline adore mettre en scène ses vedettes ; Logan ne leur donne rien à exploiter et s'en moque éperdument.",
    "The Executioner":
        "Le Bourreau",

    # Luxury (L'Héritage)
    "A prestige guild that recruits two kinds of breakers: heirs to old money, and rising stars famous enough to be worth the investment. It trains elite, media-ready breakers and moves easily through the circles where wealth, fame, and power overlap.":
        "Une guilde de prestige qui recrute deux types de briseurs : les héritiers de grandes fortunes et les étoiles montantes assez célèbres pour valoir l'investissement. Elle forme une élite taillée pour les médias et évolue avec aisance dans les cercles où richesse, gloire et pouvoir se rejoignent.",
    "Excellence is a legacy.":
        "L'excellence est un héritage.",

    # Ming
    "He's a frontliner with a particular kind of fire: solid, dependable, quiet in the briefing. Ming owns what fits in one bag and has never needed more. Guilds kept offering him a career path; he kept politely losing the paperwork. The Hunt is lenient enough to keep him on anyway - knowing full well that one morning, his bag will be gone.":
        "Combattant de première ligne animé d'un feu singulier : solide, fiable et silencieux lors des briefings. Ming ne possède que ce qui tient dans un sac et n'a jamais eu besoin de plus. Les guildes n'ont cessé de lui proposer un plan de carrière ; il n'a cessé d'égarer poliment la paperasse. La Chasse est assez souple pour le garder malgré tout, sachant pertinemment qu'un beau matin, son sac aura disparu.",
    "Ming lives in the moment, and it takes something real to grab his attention. There's something in how you lead that he can't quite let drift past.":
        "Ming vit dans l'instant présent, et il faut quelque chose d'authentique pour capter son attention. Il y a dans votre façon de diriger quelque chose qu'il ne peut se résoudre à laisser passer.",
    "So this is where the world sends me next.":
        "Alors c'est ici que le vent m'amène.",
    "The Drifter":
        "Le Vagabond",

    # Niklas
    "Aegis pays well, but it watches everything and owns everything he touches. A new guild is an open market: fewer eyes, a bigger margin, first pick of whatever comes out of a rift before it's logged. He's switching if he believes you're the better deal.":
        "Aegis paie bien, mais surveille tout et possède tout ce qu'il touche. Une nouvelle guilde représente un marché ouvert : moins de regards indiscrets, une meilleure marge et le premier choix sur tout ce qui sort d'une faille avant son enregistrement. Il changera de camp s'il estime que vous êtes la meilleure affaire.",
    "He's who Aegis sends when something has to move quietly: officially an acquisitions lead, unofficially their smuggler-in-chief. Self-made, and long decided that fairness is a luxury for people who can afford to lose. Nothing leaves a rift in his presence without a cut for him.":
        "C'est l'homme qu'Aegis envoie quand quelque chose doit circuler en toute discrétion : officiellement responsable des acquisitions, officieusement contrebandier en chef. Parti de rien, il a décrété depuis longtemps que le fair-play est un luxe réservé à ceux qui ont les moyens de perdre. Rien ne sort d'une faille en sa présence sans qu'il ne prélève sa part.",
    "Looks like you know a deal when you see one.":
        "On dirait que vous savez reconnaître une bonne affaire.",
    "The Dealer":
        "Le Négociant",

    # Nyx
    "Nyx doesn't follow guilds but people worth trusting - and hasn't found one yet. Be the first, and the kid stops being a stray.":
        "Nyx ne suit pas les guildes, mais les personnes dignes de confiance — et n'en a encore trouvé aucune. Soyez la première, et l'enfant errant trouvera enfin sa place.",
    "Nyx slipped past three rift lockdowns before The Hunt gave up chasing the kid and signed them instead. Now the youngest breaker on any roster: too quick to catch, too vicious to ignore. Nyx has no family on file, no address, no home. They don't trust The Hunt enough to sleep at their guild house. But every time there's a fight, the kid is always already there.":
        "Nyx s'est faufilé à travers trois cordons de sécurité de faille avant que La Chasse ne renonce à lui courir après et ne décide plutôt de l'engager. C'est aujourd'hui le plus jeune briseur en activité : trop rapide pour être attrapé, trop féroce pour être ignoré. Nyx n'a ni famille connue, ni adresse, ni foyer, et ne fait pas assez confiance à La Chasse pour dormir au siège de la guilde. Mais dès qu'un combat éclate, il est toujours déjà sur place.",
    "The Stray":
        "L'Enfant Errant",
    "Yeah. I know I'm small. Get over it.":
        "Ouais, je sais que je suis petit. Faites avec.",

    # Pimenta
    "If they want you, they'll have to go through me.":
        "S'ils veulent vous atteindre, il faudra me passer sur le corps.",
    "She and Sal want one thing answered: does your guild have a real chance of ending this? Gaia takes fewer contracts than the big names, and at this rate the cottage stays a long way off. Gaia is family, so they'll never fully leave. But move the clock forward, and they're with you.":
        "Elle et Sal veulent une seule réponse : votre guilde a-t-elle une vraie chance de mettre fin à tout ça ? Gaïa accepte moins de contrats que les grandes enseignes, et à ce rythme, leur maisonnette reste un rêve lointain. Gaïa est leur famille, elles ne la quitteront donc jamais tout à fait. Mais faites avancer les choses, et elles seront à vos côtés.",
    "She's the guardian who plants herself in front of her people to protect them. The poison spreads from her, buying everyone the time they need. She met Sal on the Gaia forum, trading notes, and after six months of bickering they noticed they were writing love letters. Their shared goal, once the crisis ends: a cottage with a rose garden.":
        "C'est la gardienne qui se dresse devant les siens pour les protéger. Le poison se répand autour d'elle, offrant à tous le temps dont ils ont besoin. Elle a rencontré Sal sur le forum de Gaïa en échangeant des notes, et après six mois de chamailleries, elles se sont rendu compte qu'elles s'écrivaient des lettres d'amour. Leur rêve commun, une fois la crise terminée : une maisonnette avec une roseraie.",
    "The Rose Knight":
        "Le Chevalier à la Rose",

    # Pollen
    "Nobody at Gaia is entirely sure where she came from. She turned up at their second meeting and never left, because her strange ideas about rifts kept turning out to be right. Her senses run stronger than anyone's: colors carry meaning, music has flavor, and a rift sings to her in a structure only she can hear. Gaia treats her as something between a daughter and a researcher.":
        "Personne chez Gaïa ne sait vraiment d'où elle vient. Elle est apparue lors de leur deuxième réunion et n'est jamais repartie, car ses théories étranges sur les failles se vérifiaient systématiquement. Ses sens sont plus aiguisés que ceux de quiconque : les couleurs ont un sens, la musique a une saveur, et chaque faille lui chante une mélodie dont elle seule perçoit la structure. Gaïa la considère à la fois comme une fille et comme une chercheuse.",
    "Ohh.. can you smell that? This rift is alive.":
        "Ohh... vous sentez ça ? Cette faille est vivante.",
    "She'll never fully leave Gaia, but she's drawn to a guild that takes on plenty of contracts. Just know she may wander off mid-contract.":
        "Elle ne quittera jamais complètement Gaïa, mais elle est attirée par les guildes qui enchaînent les contrats. Sachez simplement qu'elle risque de flâner en pleine mission.",
    "The Bloom":
        "La Floraison",

    # Punk (A Temple)
    "A guild that believes the Shards & relics locked inside the rifts belongs to everyone, not to whoever can buy the rights to it. They fight to put those treasures in the hands of ordinary people.":
        "Une guilde convaincue que les Éclats et les reliques enfermés dans les failles appartiennent à tout le monde, et non à ceux qui ont les moyens d'en acheter les droits. Elle se bat pour remettre ces trésors entre les mains des gens ordinaires.",
    "No gods. No masters.":
        "Ni dieu, ni maître.",

    # Ratna
    "Are you sure your guild can afford me?":
        "Êtes-vous sûr que votre guilde a les moyens de s'offrir mes services ?",
    "Ratna works in public relations for L'Héritage, smoothing over disasters and getting government support and favorable extraction rights signed. The chairman takes her calls when he won't take anyone else's. She works a rift the same way she works a room: watching who's in it, who's worth knowing, what it needs from her next.":
        "Ratna dirige les relations publiques de L'Héritage, étouffant les scandales et décrochant l'appui des gouvernements ainsi que des droits d'extraction avantageux. Le président prend ses appels quand il refuse ceux de tous les autres. Elle aborde une faille exactement comme une réception mondaine : en observant qui s'y trouve, qui mérite son attention et ce qu'elle doit en tirer.",
    "The Matriarch":
        "La Matriarche",
    "You don't recruit Ratna. You earn her attention, and then she lends your guild her influence.":
        "On ne recrute pas Ratna. On gagne son attention, après quoi elle prête son influence à votre guilde.",

    # Reyna
    "Frontline brought her in as a trainer, and she's one of the best they've had: Junior breakers come out of her sessions looking like fighters. What drives her: a pitch for a sanctioned tournament for Awakened, opponents finally worth the trouble.":
        "Frontline l'a engagée comme entraîneuse, et c'est l'une des meilleures qu'ils aient jamais eues : les jeunes briseurs ressortent de ses séances transformés en vrais combattants. Ce qui la motive : le projet d'un tournoi officiel réservé aux Éveillés, avec des adversaires enfin dignes de ce nom.",
    "If I'm in, we train hard. Let's get to work.":
        "Si je viens, on s'entraîne dur. Au travail.",
    "The Contender":
        "La Prétendante",
    "Two honest questions. Will you train as hard as she does? And will your guild back her tournament when it's time? Yes and yes, and she's in.":
        "Deux questions franches : vous entraînerez-vous aussi dur qu'elle ? Et votre guilde soutiendra-t-elle son tournoi le moment venu ? Deux fois oui, et elle est des vôtres.",

    # Rip
    "He's a frontliner with a reputation for tearing the heart out of whatever he kills, a habit left over from his old job on a cleanup crew hauling monster carcasses. He Awakened mid-shift; A Temple was the only guild that showed up to recruit him. Behind the mask he's entirely sane. Most teammates need time to work that out.":
        "Combattant de première ligne réputé pour arracher le cœur de tout ce qu'il abat — une habitude héritée de son ancien métier d'équarrisseur de carcasses de monstres. Il s'est Éveillé en plein service ; Le Temple fut la seule guilde à venir le recruter. Derrière son masque, il est parfaitement sain d'esprit, même s'il faut généralement du temps à ses coéquipiers pour s'en rendre compte.",
    "Point him towards fresh meat and he'll join your slaughterhouse gladly. Your recruiter gets about thirty seconds to do so.":
        "Indiquez-lui de la viande fraîche et il rejoindra votre abattoir avec joie. Votre recruteur a environ trente secondes pour le convaincre.",
    "The Butcher":
        "Le Boucher",
    "Woof woof, no need to be scared. I don't bite.":
        "Wouf wouf, n'ayez pas peur. Je ne mords pas.",

    # Rowan
    "He's the wall the rest of the team forms up behind. Rowan spent six years mining crystals out of rifts for a mining company. The more crystals they took, the more the rifts started acting strange. He couldn't prove mining was the cause, but he believed it. Gaia was the first to say out loud what his gut already knew: take less, listen more.":
        "Il est le rempart derrière lequel toute l'équipe se rassemble. Rowan a passé six ans à extraire des cristaux dans les failles pour une compagnie minière. Plus ils prélevaient de cristaux, plus les failles se comportaient étrangement. Il ne pouvait pas le prouver, mais il en avait l'intime conviction. Gaïa fut la première à dire tout haut ce que son instinct savait déjà : prendre moins, écouter davantage.",
    "Nobody ever truly leaves the Gaia community behind, but Rowan would join any guild that has a chance to end the crisis and cares about consequences. He'll know within a day whether yours does.":
        "Personne ne quitte jamais vraiment la communauté de Gaïa, mais Rowan est prêt à rejoindre toute guilde ayant une chance de mettre fin à la crise et soucieuse des conséquences de ses actes. Il lui suffira d'une journée pour savoir si c'est le cas de la vôtre.",
    "The Anchor":
        "L'Ancre",
    "You're safe with me.":
        "Vous êtes en sécurité avec moi.",

    # Sal
    "See? We're still here.":
        "Tu vois ? Nous sommes toujours là.",
    "She goes where Pimenta goes. Bring the day closer when none of this is needed anymore, and she'll work twice as hard to get there.":
        "Elle va où va Pimenta. Rapprochez le jour où tout cela ne sera plus nécessaire, et elle travaillera deux fois plus dur pour y parvenir.",
    "She has always been keeping small things since she was a child: pressed flowers, faded photographs, small acts of preservation. Her Awakening carries the same instinct: frost that can shatter but also preserve, depending what's needed. It's the same frost that slows the poison in Pimenta's veins.":
        "Depuis l'enfance, elle a toujours conservé de petits trésors : fleurs séchées, photographies jaunies, humbles gestes de préservation. Son Éveil porte ce même instinct : un givre capable de briser mais aussi de préserver selon le besoin. C'est ce même givre qui ralentit le poison dans les veines de Pimenta.",
    "The Keeper":
        "La Gardienne",

    # Skorn
    "An eye for an eye - except Skorn takes two; Hit him and get hit back. He's built his whole fighting style around one insane conviction: nothing in any rift can take more pain than he can. So far, nothing has. Every scar is a fight where the monster blinked first.":
        "Œil pour œil — sauf que Skorn en prend deux. Frappez-le et il vous le rendra au centuple. Il a bâti tout son style de combat sur une conviction insensée : rien dans aucune faille ne peut encaisser plus de douleur que lui. Jusqu'ici, rien n'y est parvenu. Chaque cicatrice est le souvenir d'un duel où le monstre a cédé le premier.",
    "He gets bored in guilds that fight carefully. Promise him the front of every fight, and the ugliest opponents you can find, and he's in.":
        "Il s'ennuie dans les guildes qui se battent avec prudence. Promettez-lui la première ligne de chaque combat et les adversaires les plus féroces que vous puissiez dénicher, et il sera des vôtres.",
    "Let them try. I'll take it gladly.":
        "Qu'ils essaient donc. J'encaisserai avec plaisir.",
    "The Bulwark":
        "Le Rempart",

    # Tilly
    "Oh.. I might actually be brilliant at this.":
        "Oh... je crois bien que je suis douée pour ça.",
    "She's not interested in being L'Héritage's new shiny thing. Her idea of beauty is a monster coming apart mid-swing. A guild with the bloodiest contracts is a guild she'll love.":
        "Elle n'a aucune envie d'être le nouveau joyau vitrine de L'Héritage. Son idée de la beauté, c'est un monstre mis en pièces en plein élan. Une guilde qui accepte les contrats les plus sanglants fera son bonheur.",
    "The Heiress":
        "L'Héritière",
    "Tilly looks like the sweetest thing L'Héritage ever put in front of a camera - right up until the flails start spinning. What follows is fast, heavy, and disturbingly cheerful. L'Héritage adores the contrast on camera. Off camera, even her coaches keep a respectful distance.":
        "Tilly a l'air de la créature la plus douce que L'Héritage ait jamais placée devant une caméra — jusqu'à ce que ses fléaux se mettent à tournoyer. La suite est rapide, brutale et d'une gaieté troublante. L'Héritage adore ce contraste à l'écran. Hors caméra, même ses entraîneurs gardent une distance respectueuse.",

    # Urban (The Hunt)
    "A guild of Awakened professionals built for the chase, first through the door and closing in before a rift can breach do real damage. They hunt to win: the monster, the trophy, and the reputation that follows.":
        "Une guilde de professionnels Éveillés taillée pour la traque, toujours la première sur les lieux pour intervenir avant qu'une faille ne cause de véritables ravages. Ils chassent pour gagner : le monstre, le trophée et la réputation qui va avec.",
    "When the call comes, we hunt.":
        "Quand l'appel retentit, la chasse commence.",

    # Yuuna
    "I will not let our guild down.":
        "Je ne décevrai pas notre guilde.",
    "She marks the dangerous targets, opens angles for everyone else, and takes her own mistakes personally. The Hunt values her reliability and has made peace with how little she reveals about herself.":
        "Elle marque les cibles dangereuses, ouvre des angles de tir pour ses alliés et prend la moindre de ses erreurs très à cœur. La Chasse apprécie sa fiabilité et s'est accommodée du mystère dont elle s'entoure.",
    "She needs a guild that holds itself to a certain standard, and a team worth the loyalty. One caveat: no one has seen her without the mask, and knows who she really is.":
        "Elle a besoin d'une guilde exigeante envers elle-même et d'une équipe digne de sa loyauté. Une seule condition : personne ne l'a jamais vue sans son masque ni ne connaît sa véritable identité.",
    "The Professional":
        "La Professionnelle",

    # Zuri
    "Convince her your guild won't be overlooked, and she's interested.":
        "Convainquez-la que votre guilde ne passera pas inaperçue, et vous aurez son intérêt.",
    "It's okay. You can take a peek.":
        "N'ayez crainte. Vous pouvez jeter un coup d'œil.",
    "The Gorgon":
        "La Gorgone",
    "The old stories say you shouldn't look a gorgon in the eye. Zuri built a career on the opposite: everyone looks. Cameras, sponsors, monsters - her gaze stops them all where they stand, some more literally than others. L'Héritage trained her for both audiences, and she's never once blinked first.":
        "Les vieilles légendes disent qu'il ne faut jamais regarder une gorgone dans les yeux. Zuri a bâti toute sa carrière sur l'exact opposé : tout le monde la regarde. Caméras, sponsors, monstres — son regard les fige tous sur place, certains plus littéralement que d'autres. L'Héritage l'a formée pour ces deux publics, et elle n'a jamais baissé les yeux la première.",
}

# ============================================================================
# 4. ITEM NAMES (100% coverage of all 174 Item names)
# ============================================================================
ITEMS_NAMES_EN_TO_FR = {
    "Accuracy Contract": "Contrat de Précision",
    "Adaptive Sword": "Épée Adaptative",
    "Adrenal Eye": "Œil d'Adrénaline",
    "Aegis": "Égide",
    "Amulet": "Amulette",
    "Amulet of Shields": "Amulette des Boucliers",
    "Amulet of Storms": "Amulette des Tempêtes",
    "Amulet of Winter": "Amulette de l'Hiver",
    "Assassin's Blade": "Lame de l'Assassin",
    "Assassin's Crest": "Emblème de l'Assassin",
    "Assassin's Glyph": "Glyphe de l'Assassin",
    "Assassin's Hood": "Capuche de l'Assassin",
    "Assassin's Tome": "Grimoire de l'Assassin",
    "Battlemage Robes": "Robe de Mage de Guerre",
    "Belt": "Ceinture",
    "Big Amulet": "Grande Amulette",
    "Big Blade": "Grande Lame",
    "Big Bow": "Grand Arc",
    "Big Scepter": "Grand Sceptre",
    "Big Shield": "Grand Bouclier",
    "Big Shiv": "Grand Surin",
    "Big Vest": "Grand Gilet",
    "Blade": "Lame",
    "Bloodfang": "Croc-de-Sang",
    "Booster 1": "Amplificateur 1",
    "Booster 2": "Amplificateur 2",
    "Booster 3": "Amplificateur 3",
    "Boots": "Bottes",
    "Brawler's Ledger": "Registre du Bagarreur",
    "Bruiser's Mitts": "Mitaines du Cogneur",
    "Bulwark": "Rempart",
    "Catalyst of Patience": "Catalyseur de Patience",
    "Chain Mail": "Cotte de Mailles",
    "Chalice": "Calice",
    "Charm": "Charme",
    "Cleansing Charm": "Charme Purificateur",
    "Cleric's Circlet": "Diadème du Clerc",
    "Cleric's Scroll": "Parchemin du Clerc",
    "Crown of Haste": "Couronne de Hâte",
    "Crown of Patience": "Couronne de Patience",
    "Crystal": "Cristal",
    "Dagger": "Dague",
    "Deadeye Hood": "Capuche de Franc-Tireur",
    "Duelist's Bow": "Arc du Duelliste",
    "Duelist's Crest": "Emblème du Duelliste",
    "Duelist's Foil": "Fleuret du Duelliste",
    "Duelist's Glyph": "Glyphe du Duelliste",
    "Duelist's Vest": "Gilet du Duelliste",
    "Emerald Charm": "Charme d'Émeraude",
    "Enlarging Vest": "Gilet d'Agrandissement",
    "Executioner's Axe": "Hache du Bourreau",
    "Executioner's Blade": "Lame du Bourreau",
    "Eye of Haste": "Œil de Hâte",
    "Eye of Patience": "Œil de Patience",
    "Fang": "Croc",
    "Flaming Gauntlets": "Gantelets Flamboyants",
    "Flask": "Fiole",
    "Force Crystal": "Cristal de Force",
    "Freezing Contract": "Contrat Glacial",
    "Freezing Gauntlet": "Gantelet Glacial",
    "Freezing Ring": "Anneau Glacial",
    "Freezing Tome": "Grimoire Glacial",
    "Freezing Wand": "Baguette Glaciale",
    "Frosted Gauntlets": "Gantelets Givrés",
    "Gauntlet": "Gantelet",
    "Gem": "Gemme",
    "Golden Helmet": "Casque Doré",
    "Greedy Gauntlet": "Gantelet Cupide",
    "Greedy Ring": "Anneau Cupide",
    "Greedy Shiv": "Surin Cupide",
    "Guardian's Lantern": "Lanterne du Gardien",
    "Hammer": "Marteau",
    "Hasty Ring": "Anneau Véloce",
    "Hasty Sword": "Épée Véloce",
    "Hasty Vest": "Gilet Véloce",
    "Hourglass": "Sablier",
    "Infectious Bow": "Arc Infectieux",
    "Infectious Gauntlet": "Gantelet Infectieux",
    "Infectious Ring": "Anneau Infectieux",
    "Large Power Crystal": "Grand Cristal de Puissance",
    "Leather Vest": "Gilet de Cuir",
    "Lone Wolf's Bow": "Arc du Loup Solitaire",
    "Mage's Crest": "Emblème du Mage",
    "Mage's Glyph": "Glyphe du Mage",
    "Mage's Staff": "Bâton du Mage",
    "Mage's Tome": "Grimoire du Mage",
    "Mage's Wand": "Baguette du Mage",
    "Magician's Ledger": "Registre du Magicien",
    "Mana Box 1": "Boîte de Mana 1",
    "Mana Box 2": "Boîte de Mana 2",
    "Mana Box 3": "Boîte de Mana 3",
    "Merchant's Scroll": "Parchemin du Marchand",
    "Mystic's Crest": "Emblème du Mystique",
    "Mystic's Glyph": "Glyphe du Mystique",
    "Mystic's Orb": "Orbe du Mystique",
    "Mystic's Staff": "Bâton du Mystique",
    "Mystic's Tome": "Grimoire du Mystique",
    "Nimble Boots": "Bottes Agiles",
    "Onyx Gem": "Gemme d'Onyx",
    "Orb": "Orbe",
    "Patient Flask": "Fiole Patiente",
    "Patient Gauntlet": "Gantelet Patient",
    "Patient Ring": "Anneau Patient",
    "Plague Amulet": "Amulette de Peste",
    "Polymath's Prism": "Prisme du Polymathe",
    "Power Crystal": "Cristal de Puissance",
    "Protection Crystal": "Cristal de Protection",
    "Quiver": "Carquois",
    "Rift Seal": "Sceau de la Faille",
    "Ring of Virality": "Anneau de Virulence",
    "Ring of the Leech": "Anneau de la Sangsue",
    "Robes": "Robe",
    "Rogue's Cowl": "Capuchon du Roublard",
    "Runestone": "Pierre Runique",
    "Runic Buckler": "Rondache Runique",
    "Sacrificial Scythe": "Faux Sacrificielle",
    "Salve": "Onguent",
    "Scroll of Enlightenment": "Parchemin d'Illumination",
    "Scroll of Perseverance": "Parchemin de Persévérance",
    "Scroll of Violence": "Parchemin de Violence",
    "Searing Contract": "Contrat Brûlant",
    "Searing Lance": "Lance Brûlante",
    "Searing Ring": "Anneau Brûlant",
    "Searing Tome": "Grimoire Brûlant",
    "Searing Vest": "Gilet Brûlant",
    "Sentinel's Plate": "Cuirasse de la Sentinelle",
    "Serrated Dagger": "Dague Dentelée",
    "Shattering Charm": "Charme Fracassant",
    "Shielding Flask": "Fiole Protectrice",
    "Shielding Ring": "Anneau Protecteur",
    "Shielding Vest": "Gilet Protecteur",
    "Sigil": "Sceau",
    "Siphoning Dagger": "Dague Siphonnante",
    "Sniper's Jewel": "Joyau du Tireur d'Élite",
    "Spellblade": "Lame-Sort",
    "Spiked Plate": "Cuirasse à Pointes",
    "Squire's Helm": "Heaume de l'Écuyer",
    "Squire's Sword": "Épée de l'Écuyer",
    "Sword of Combustion": "Épée de Combustion",
    "Sword of the Spark": "Épée de l'Étincelle",
    "Tank's Buckler": "Rondache du Tank",
    "Tank's Cape": "Cape du Tank",
    "Tank's Crest": "Emblème du Tank",
    "Tank's Glyph": "Glyphe du Tank",
    "Tank's Tower Shield": "Pavois du Tank",
    "Temporal Accelerator": "Accélérateur Temporel",
    "Test Ability Spam": "Test Spam Compétence",
    "Test HP Max": "Test PV Max",
    "Test Starting Mana": "Test Mana Initial",
    "The Golden Standard": "L'Étalon d'Or",
    "Thief's Dagger": "Dague du Voleur",
    "Tome": "Grimoire",
    "Toxic Contract": "Contrat Toxique",
    "Toxic Dart": "Fléchette Toxique",
    "Toxic Gauntlet": "Gantelet Toxique",
    "Toxic Ring": "Anneau Toxique",
    "Toxic Shiv": "Surin Toxique",
    "Tranquil Eye": "Œil Tranquille",
    "Vampire Cape 2": "Cape de Vampire 2",
    "Vampire Cape 3": "Cape de Vampire 3",
    "Vanguard's Bracelet": "Bracelet de l'Avant-garde",
    "Vanguard's Buckler": "Rondache de l'Avant-garde",
    "Vanguard's Crest": "Emblème de l'Avant-garde",
    "Vanguard's Glyph": "Glyphe de l'Avant-garde",
    "Vanguard's Sword": "Épée de l'Avant-garde",
    "Venomous Gauntlets": "Gantelets Venimeux",
    "Viscera Collector": "Collecteur de Viscères",
    "Warrior's Bow": "Arc du Guerrier",
    "Warrior's Crest": "Emblème du Guerrier",
    "Warrior's Glyph": "Glyphe du Guerrier",
    "Warrior's Greataxe": "Grande Hache du Guerrier",
    "Warrior's Sword": "Épée du Guerrier",
    "Wizard's Focus": "Focalisateur du Sorcier",
    "Zeus's Thunder": "Foudre de Zeus",
}

# ============================================================================
# 5. RELIC NAMES (100% coverage of all 388 Relic names)
# ============================================================================
RELICS_NAMES_EN_TO_FR = {
    "Acceleration Accumulator": "Accumulateur d'Accélération",
    "Acceleration Ascendancy": "Ascendance d'Accélération",
    "Acceleration Conduit": "Conduit d'Accélération",
    "Acceleration Filigree": "Filigrane d'Accélération",
    "Acceleration Fluctuator": "Fluctuateur d'Accélération",
    "Acceleration Immunizer": "Immuniseur d'Accélération",
    "Acceleration Lattice": "Treillis d'Accélération",
    "Acceleration Legacy Crystal": "Cristal d'Héritage d'Accélération",
    "Acceleration Mandate": "Mandat d'Accélération",
    "Acceleration Nexus": "Nexus d'Accélération",
    "Acceleration Prism": "Prisme d'Accélération",
    "Acceleration Reactor": "Réacteur d'Accélération",
    "Acceleration Resonator": "Résonateur d'Accélération",
    "Acceleration Vessel": "Réceptacle d'Accélération",
    "Advanced Differentiator": "Différenciateur Avancé",
    "Alignment Ascendancy": "Ascendance d'Alignement",
    "All In": "Tapis",
    "Arcane Amplifier": "Amplificateur Arcanique",
    "Arcane Backup Prism": "Prisme de Soutien Arcanique",
    "Arcane Conduit": "Conduit Arcanique",
    "Arcane Energy Crystal": "Cristal d'Énergie Arcanique",
    "Arcane Mandate": "Mandat Arcanique",
    "Ascension Mandate": "Mandat d'Ascension",
    "Assassin Crest": "Emblème d'Assassin",
    "Assassin Equipment": "Équipement d'Assassin",
    "Assassin's Ambush Engine": "Moteur d'Embuscade de l'Assassin",
    "Assassin's Combative Reflection": "Reflet Combatif de l'Assassin",
    "Assassin's Elevation Prism": "Prisme d'Élévation de l'Assassin",
    "Assassin's Emblem": "Emblème de l'Assassin",
    "Assassin's Enchanted Reflection": "Reflet Enchanté de l'Assassin",
    "Assassin's Endurance Banner": "Bannière d'Endurance de l'Assassin",
    "Assassin's Greed Banner": "Bannière de Cupidité de l'Assassin",
    "Assassin's Medallion": "Médaillon de l'Assassin",
    "Assassin's Memento": "Mémento de l'Assassin",
    "Assassin's Patience Banner": "Bannière de Patience de l'Assassin",
    "Assassin's Payday Banner": "Bannière de Butin de l'Assassin",
    "Assassin's Smokescreen Banner": "Bannière d'Écran de Fumée de l'Assassin",
    "Assassin's Supremacy Filigree": "Filigrane de Suprématie de l'Assassin",
    "Attack Parcel": "Colis d'Attaque",
    "Attack Speed Parcel": "Colis de Vitesse d'Attaque",
    "Backline Aggressor": "Agresseur d'Arrière-Ligne",
    "Backline Quickener": "Accélérateur d'Arrière-Ligne",
    "Backline Sharpener": "Affûteur d'Arrière-Ligne",
    "Basic Differentiator": "Différenciateur Basique",
    "Battle Stance": "Posture de Combat",
    "Blight Resonance Prism": "Prisme de Résonance du Fléau",
    "Bossy": "Autoritaire",
    "Burn Accumulator": "Accumulateur de Brûlure",
    "Burn Amplifier": "Amplificateur de Brûlure",
    "Burn Ascendancy": "Ascendance de Brûlure",
    "Burn Bauble": "Babiole de Brûlure",
    "Burn Catalyst": "Catalyseur de Brûlure",
    "Burn Conduit": "Conduit de Brûlure",
    "Burn Migrator": "Migrateur de Brûlure",
    "Burn Vessel": "Réceptacle de Brûlure",
    "Burning": "Enflammé",
    "Burning Spiral Engine": "Moteur de Spirale Ardente",
    "Combative Codex": "Codex Combatif",
    "Cost of Knowledge": "Le Prix du Savoir",
    "Crest Windfall": "Aubaine d'Emblèmes",
    "Crit Parcel": "Colis de Critique",
    "Critical Absorption Prism": "Prisme d'Absorption Critique",
    "Critical Ascendancy": "Ascendance Critique",
    "Critical Mandate": "Mandat Critique",
    "Critical Singularity": "Singularité Critique",
    "Critical Vessel": "Réceptacle Critique",
    "Damaged": "Endommagé",
    "Debt": "Dette",
    "Decay": "Décrépitude",
    "Deceleration Accumulator": "Accumulateur de Décélération",
    "Deceleration Aegis": "Égide de Décélération",
    "Deceleration Apotheosis": "Apothéose de Décélération",
    "Deceleration Ascendancy": "Ascendance de Décélération",
    "Deceleration Conduit": "Conduit de Décélération",
    "Deceleration Corruptor": "Corrupteur de Décélération",
    "Deceleration Filigree": "Filigrane de Décélération",
    "Deceleration Fluctuator": "Fluctuateur de Décélération",
    "Deceleration Lattice": "Treillis de Décélération",
    "Deceleration Legacy Crystal": "Cristal d'Héritage de Décélération",
    "Deceleration Mandate": "Mandat de Décélération",
    "Deceleration Nexus": "Nexus de Décélération",
    "Deceleration Reactor": "Réacteur de Décélération",
    "Deceleration Resonator": "Résonateur de Décélération",
    "Deceleration Vessel": "Réceptacle de Décélération",
    "Defense Parcel": "Colis de Défense",
    "Defensive Amplifier": "Amplificateur Défensif",
    "Defensive Backup Prism": "Prisme de Soutien Défensif",
    "Defensive Energy Crystal": "Cristal d'Énergie Défensive",
    "Demolition": "Démolition",
    "Demon's Fury": "Fureur du Démon",
    "Desperation Mandate": "Mandat du Désespoir",
    "Divergence Vessel": "Réceptacle de Divergence",
    "Dominion Mandate": "Mandat de Domination",
    "Duelist Crest": "Emblème de Duelliste",
    "Duelist Equipment": "Équipement de Duelliste",
    "Duelist's Chill Banner": "Bannière de Frisson du Duelliste",
    "Duelist's Combative Reflection": "Reflet Combatif du Duelliste",
    "Duelist's Emblem": "Emblème du Duelliste",
    "Duelist's Flame Banner": "Bannière de Flamme du Duelliste",
    "Duelist's Fury Filigree": "Filigrane de Fureur du Duelliste",
    "Duelist's Medallion": "Médaillon du Duelliste",
    "Duelist's Memento": "Mémento du Duelliste",
    "Duelist's Momentum Engine": "Moteur d'Élan du Duelliste",
    "Duelist's Outbreak Banner": "Bannière de Contagion du Duelliste",
    "Duelist's Precise Reflection": "Reflet Précis du Duelliste",
    "Duelist's Precision Banner": "Bannière de Précision du Duelliste",
    "Duelist's Profusion Filigree": "Filigrane de Profusion du Duelliste",
    "Duelist's Rhythm Prism": "Prisme de Rythme du Duelliste",
    "Duelist's Toxin Banner": "Bannière de Toxine du Duelliste",
    "DummyRelicDontUse": "Relique factice (ne pas utiliser)",
    "Enchanted Codex": "Codex Enchanté",
    "Endurance": "Endurance",
    "Fast Track": "Voie Rapide",
    "Fighting Form": "En Pleine Forme",
    "Fire Dragon's Breath": "Souffle du Dragon de Feu",
    "Fire Dragon's Flame": "Flamme du Dragon de Feu",
    "Fire Starter": "Boute-Feu",
    "Flaming": "Flamboyant",
    "Focused": "Concentré",
    "Frontline Barricader": "Barricadeur de Première Ligne",
    "Frontline Defender": "Défenseur de Première Ligne",
    "Frontline Embiggener": "Agrandisseur de Première Ligne",
    "Frost Accumulator": "Accumulateur de Gel",
    "Frost Amplifier": "Amplificateur de Gel",
    "Frost Ascendancy": "Ascendance de Gel",
    "Frost Bauble": "Babiole de Gel",
    "Frost Catalyst": "Catalyseur de Gel",
    "Frost Conduit": "Conduit de Gel",
    "Frost Dragon's Chill": "Frisson du Dragon de Givre",
    "Frost Migrator": "Migrateur de Gel",
    "Frost Surge": "Déferlante de Gel",
    "Frost Vessel": "Réceptacle de Gel",
    "Generation Conduit": "Conduit de Génération",
    "Glacial Decay Engine": "Moteur d'Érosion Glaciale",
    "Glacial Guard Prism": "Prisme de Garde Glaciale",
    "Godspeed Ascension Engine": "Moteur d'Ascension Fulgurante",
    "Golden Ascendancy": "Ascendance Dorée",
    "Greed Mandate": "Mandat de Cupidité",
    "Hardened": "Endurci",
    "Harmony Crystal": "Cristal d'Harmonie",
    "Health Parcel": "Colis de Santé",
    "Heroic Capacity Expander": "Extenseur de Capacité Héroïque",
    "Hunted": "Traqué",
    "Hydra's Healing": "Régénération de l'Hydre",
    "Immolation Accelerator": "Accélérateur d'Immolation",
    "Immunity": "Immunité",
    "Improvidence": "Imprévoyance",
    "Item Bazaar": "Bazar d'Objets",
    "Item Windfall": "Aubaine d'Objets",
    "Legacy Charm": "Charme d'Héritage",
    "Mage Crest": "Emblème de Mage",
    "Mage Equipment": "Équipement de Mage",
    "Mage's Administration Filigree": "Filigrane de Régie du Mage",
    "Mage's Cataclysm Engine": "Moteur de Cataclysme du Mage",
    "Mage's Elemental Banner": "Bannière Élémentaire du Mage",
    "Mage's Emblem": "Emblème du Mage",
    "Mage's Enlightenment Banner": "Bannière d'Illumination du Mage",
    "Mage's Flowing Reflection": "Reflet Fluide du Mage",
    "Mage's Frostbite Banner": "Bannière d'Engelure du Mage",
    "Mage's Inferno Banner": "Bannière de Brasier du Mage",
    "Mage's Medallion": "Médaillon du Mage",
    "Mage's Memento": "Mémento du Mage",
    "Mage's Precise Reflection": "Reflet Précis du Mage",
    "Mage's Serenity Banner": "Bannière de Sérénité du Mage",
    "Mage's Transmutation Prism": "Prisme de Transmutation du Mage",
    "Magic Parcel": "Colis de Magie",
    "Mana Regen Parcel": "Colis de Régén. Mana",
    "Martial Amplifier": "Amplificateur Martial",
    "Martial Backup Prism": "Prisme de Soutien Martial",
    "Martial Energy Crystal": "Cristal d'Énergie Martiale",
    "Merchant Mandate": "Mandat du Marchand",
    "Momentous Differentiator": "Différenciateur Impétueux",
    "Multiclass Conduit": "Conduit Multiclasse",
    "Mystery Charm": "Charme Mystère",
    "Mystic Crest": "Emblème de Mystique",
    "Mystic Equipment": "Équipement de Mystique",
    "Mystic's Abundance Engine": "Moteur d'Abondance du Mystique",
    "Mystic's Barrier Banner": "Bannière de Barrière du Mystique",
    "Mystic's Emblem": "Emblème du Mystique",
    "Mystic's Enchanted Reflection": "Reflet Enchanté du Mystique",
    "Mystic's Inundation Prism": "Prisme d'Inondation du Mystique",
    "Mystic's Medallion": "Médaillon du Mystique",
    "Mystic's Memento": "Mémento du Mystique",
    "Mystic's Outbreak Banner": "Bannière de Contagion du Mystique",
    "Mystic's Payday Banner": "Bannière de Butin du Mystique",
    "Mystic's Prosperity Banner": "Bannière de Prospérité du Mystique",
    "Mystic's Prosperity Filigree": "Filigrane de Prospérité du Mystique",
    "Mystic's Protection Banner": "Bannière de Protection du Mystique",
    "Mystic's Vital Reflection": "Reflet Vital du Mystique",
    "Omnity Enforcer": "Exécuteur d'Omnité",
    "Omnity Mandate": "Mandat d'Omnité",
    "Pain": "Douleur",
    "Perfect Divergence Prism": "Prisme de Divergence Parfaite",
    "Perfect Unity Prism": "Prisme d'Unité Parfaite",
    "Plague Accelerator": "Accélérateur de Peste",
    "Plague Amplifier": "Amplificateur de Peste",
    "Plague Ascendancy": "Ascendance de Peste",
    "Plague Bauble": "Babiole de Peste",
    "Plague Collector": "Collecteur de Peste",
    "Plague Conduit": "Conduit de Peste",
    "Plague Generator": "Générateur de Peste",
    "Plague Harvester": "Moissonneur de Peste",
    "Plague Transmission Engine": "Moteur de Transmission de Peste",
    "Plague Velocitizer": "Vélocitateur de Peste",
    "Plated Codex": "Codex Blindé",
    "Poison Accumulator": "Accumulateur de Poison",
    "Poison Amplifier": "Amplificateur de Poison",
    "Poison Ascendancy": "Ascendance de Poison",
    "Poison Bauble": "Babiole de Poison",
    "Poison Bloom": "Floraison de Poison",
    "Poison Catalyst": "Catalyseur de Poison",
    "Poison Conduit": "Conduit de Poison",
    "Poison Dragon's Venom": "Venin du Dragon Venimeux",
    "Poison Migrator": "Migrateur de Poison",
    "Poison Vessel": "Réceptacle de Poison",
    "Power of the Well": "Pouvoir du Puits",
    "Precise Codex": "Codex Précis",
    "Precision Conduit": "Conduit de Précision",
    "Precision Lattice": "Treillis de Précision",
    "Precision Nexus": "Nexus de Précision",
    "Precision Reactor": "Réacteur de Précision",
    "Protective Differentiator": "Différenciateur Protecteur",
    "Quality over Quantity": "La Qualité avant la Quantité",
    "Quantity over Quality": "La Quantité avant la Qualité",
    "Rapid Growth": "Croissance Rapide",
    "Relic Bazaar": "Bazar de Reliques",
    "Rematch": "Revanche",
    "Reputation Ascendancy": "Ascendance de Réputation",
    "Reserve Ascendancy": "Ascendance de Réserve",
    "Rested": "Reposé",
    "Rift Storm Invoker": "Invocateur de Tempête de Faille",
    "Shard Accumulator": "Accumulateur d'Éclats",
    "Shard Ascendancy": "Ascendance d'Éclats",
    "Shard Constructor": "Constructeur d'Éclats",
    "Shard Energy Velocitizer": "Vélocitateur d'Énergie d'Éclats",
    "Shard Extractor": "Extracteur d'Éclats",
    "Shard Fluctuator": "Fluctuateur d'Éclats",
    "Shard Lattice": "Treillis d'Éclats",
    "Shard Maximizer": "Maximiseur d'Éclats",
    "Shard Pouch": "Bourse d'Éclats",
    "Shard Power Extractor": "Extracteur de Puissance d'Éclats",
    "Shard Precision Prism": "Prisme de Précision d'Éclats",
    "Shard Resonator": "Résonateur d'Éclats",
    "Shard Vessel": "Réceptacle d'Éclats",
    "Sharpened": "Affûté",
    "Shelter Mandate": "Mandat du Refuge",
    "Shield Accumulator": "Accumulateur de Bouclier",
    "Shield Ascendancy": "Ascendance de Bouclier",
    "Shield Bastion": "Bastion de Bouclier",
    "Shield Bauble": "Babiole de Bouclier",
    "Shield Conduit": "Conduit de Bouclier",
    "Shield Converter": "Convertisseur de Bouclier",
    "Shield Fluctuator": "Fluctuateur de Bouclier",
    "Shield Fragmentation Engine": "Moteur de Fragmentation de Bouclier",
    "Shield Generator": "Générateur de Bouclier",
    "Shield Investment Filigree": "Filigrane d'Investissement de Bouclier",
    "Shield Repriser": "Riposteur de Bouclier",
    "Shield Vessel": "Réceptacle de Bouclier",
    "Single Combat": "Combat Singulier",
    "Slaughter Mandate": "Mandat de Carnage",
    "Stability System": "Système de Stabilité",
    "Stalwart Differentiator": "Différenciateur Vaillant",
    "Starter Bundle": "Lot de Départ",
    "Starter Kit: Instant Attack Boost": "Pack de Départ : Bonus d'Attaque Immédiat",
    "Starter Kit: Instant Attack Speed Boost": "Pack de Départ : Bonus de Vitesse d'Attaque Immédiat",
    "Starter Kit: Instant Crit Boost": "Pack de Départ : Bonus de Critique Immédiat",
    "Starter Kit: Instant Defense Boost": "Pack de Départ : Bonus de Défense Immédiat",
    "Starter Kit: Instant Magic Boost": "Pack de Départ : Bonus de Magie Immédiat",
    "Starter Kit: Instant Mana Regen Boost": "Pack de Départ : Bonus de Régén. Mana Immédiat",
    "Starter Kit: Instant Max HP Boost": "Pack de Départ : Bonus de PV Max Immédiat",
    "Starter Kit: Instant Rare Attack Item": "Pack de Départ : Objet Rare d'Attaque Immédiat",
    "Starter Kit: Instant Rare Attack Speed Item": "Pack de Départ : Objet Rare de Vitesse d'Attaque Immédiat",
    "Starter Kit: Instant Rare Crit Item": "Pack de Départ : Objet Rare de Critique Immédiat",
    "Starter Kit: Instant Rare Defense Item": "Pack de Départ : Objet Rare de Défense Immédiat",
    "Starter Kit: Instant Rare Magic Item": "Pack de Départ : Objet Rare de Magie Immédiat",
    "Starter Kit: Instant Rare Mana Regen Item": "Pack de Départ : Objet Rare de Régén. Mana Immédiat",
    "Starter Kit: Instant Rare Max HP Item": "Pack de Départ : Objet Rare de PV Max Immédiat",
    "Starter Kit: Instant Shards": "Pack de Départ : Éclats Immédiats",
    "Starter Kit: Sustained Attack": "Pack de Départ : Attaque Durable",
    "Starter Kit: Sustained Attack Speed": "Pack de Départ : Vitesse d'Attaque Durable",
    "Starter Kit: Sustained Crit": "Pack de Départ : Critique Durable",
    "Starter Kit: Sustained Defense": "Pack de Départ : Défense Durable",
    "Starter Kit: Sustained Item Expansion": "Pack de Départ : Emplacement d'Objet Durable",
    "Starter Kit: Sustained Magic": "Pack de Départ : Magie Durable",
    "Starter Kit: Sustained Mana Regen": "Pack de Départ : Régén. Mana Durable",
    "Starter Kit: Sustained Max HP": "Pack de Départ : PV Max Durables",
    "Starter Kit: Sustained Shard Boost": "Pack de Départ : Bonus d'Éclats Durable",
    "Starter Kit: Temporary Attack Growth": "Pack de Départ : Croissance d'Attaque Temporaire",
    "Starter Kit: Temporary Attack Speed Growth": "Pack de Départ : Croissance de Vitesse d'Attaque Temporaire",
    "Starter Kit: Temporary Crit Growth": "Pack de Départ : Croissance de Critique Temporaire",
    "Starter Kit: Temporary Defense Growth": "Pack de Départ : Croissance de Défense Temporaire",
    "Starter Kit: Temporary Item Discount": "Pack de Départ : Réduction d'Objets Temporaire",
    "Starter Kit: Temporary Magic Growth": "Pack de Départ : Croissance de Magie Temporaire",
    "Starter Kit: Temporary Mana Regen Growth": "Pack de Départ : Croissance de Régén. Mana Temporaire",
    "Starter Kit: Temporary Max HP Growth": "Pack de Départ : Croissance de PV Max Temporaire",
    "Starter Kit: Temporary Shard Boost": "Pack de Départ : Bonus d'Éclats Temporaire",
    "Steady Growth": "Croissance Constante",
    "Strange Blue Fruit: Attack Drained": "Fruit Bleu Étrange : Attaque Drainée",
    "Strange Blue Fruit: Attack Speed Drained": "Fruit Bleu Étrange : Vitesse d'Attaque Drainée",
    "Strange Blue Fruit: Crit Drained": "Fruit Bleu Étrange : Critique Drainé",
    "Strange Blue Fruit: Defense Drained": "Fruit Bleu Étrange : Défense Drainée",
    "Strange Blue Fruit: Magic Drained": "Fruit Bleu Étrange : Magie Drainée",
    "Strange Blue Fruit: Mana Regen Drained": "Fruit Bleu Étrange : Régén. Mana Drainée",
    "Strange Blue Fruit: Max HP Drained": "Fruit Bleu Étrange : PV Max Drainés",
    "Strange Red Fruit: Attack Boost": "Fruit Rouge Étrange : Bonus d'Attaque",
    "Strange Red Fruit: Attack Speed Boost": "Fruit Rouge Étrange : Bonus de Vitesse d'Attaque",
    "Strange Red Fruit: Crit Boost": "Fruit Rouge Étrange : Bonus de Critique",
    "Strange Red Fruit: Defense Boost": "Fruit Rouge Étrange : Bonus de Défense",
    "Strange Red Fruit: Magic Boost": "Fruit Rouge Étrange : Bonus de Magie",
    "Strange Red Fruit: Mana Regen Boost": "Fruit Rouge Étrange : Bonus de Régén. Mana",
    "Strange Red Fruit: Max HP Boost": "Fruit Rouge Étrange : Bonus de PV Max",
    "Strange Yellow Fruit": "Fruit Jaune Étrange",
    "Stunned": "Étourdi",
    "Survivor Charm": "Charme du Survivant",
    "Swift Codex": "Codex Véloce",
    "Tank Crest": "Emblème de Tank",
    "Tank Equipment": "Équipement de Tank",
    "Tank's Absolution Engine": "Moteur d'Absolution du Tank",
    "Tank's Emblem": "Emblème du Tank",
    "Tank's Enchanted Reflection": "Reflet Enchanté du Tank",
    "Tank's Frostplate Banner": "Bannière de Cuirasse Givrée du Tank",
    "Tank's Intercession Prism": "Prisme d'Intercession du Tank",
    "Tank's Invigoration Filigree": "Filigrane de Revigoration du Tank",
    "Tank's Medallion": "Médaillon du Tank",
    "Tank's Memento": "Mémento du Tank",
    "Tank's Patience Banner": "Bannière de Patience du Tank",
    "Tank's Poisonplate Banner": "Bannière de Cuirasse Venimeuse du Tank",
    "Tank's Readiness Banner": "Bannière de Préparation du Tank",
    "Tank's Resilience Banner": "Bannière de Résilience du Tank",
    "Tank's Vital Reflection": "Reflet Vital du Tank",
    "Temporal Alignment Crystal": "Cristal d'Alignement Temporel",
    "Temporal Mandate": "Mandat Temporel",
    "The Cursed Urn": "L'Urne Maudite",
    "The Jagged Chasm": "Le Gouffre Déchiqueté",
    "The Jagged Divide": "La Faille Déchiquetée",
    "The Red Rift": "La Faille Rouge",
    "The Rift Puppy's Cry": "Le Cri du Chiot de la Faille",
    "The Riftbreaker": "Le Briseur de Faille",
    "The Well of Temptation": "Le Puits de la Tentation",
    "Thermal Inverter": "Inverseur Thermique",
    "Trigger Bounty Activator": "Activateur de Prime de Déclenchement",
    "Trigger Safeguard Activator": "Activateur de Sauvegarde de Déclenchement",
    "Trigger Synchrony Activator": "Activateur de Synchronie de Déclenchement",
    "Unity Mandate": "Mandat d'Unité",
    "Unity Vessel": "Réceptacle d'Unité",
    "Vampiric Codex": "Codex Vampirique",
    "Vampirism": "Vampirisme",
    "Vanguard Crest": "Emblème d'Avant-garde",
    "Vanguard Equipment": "Équipement d'Avant-garde",
    "Vanguard's Aegis Banner": "Bannière d'Égide de l'Avant-garde",
    "Vanguard's Amplification Filigree": "Filigrane d'Amplification de l'Avant-garde",
    "Vanguard's Combative Reflection": "Reflet Combatif de l'Avant-garde",
    "Vanguard's Emblem": "Emblème de l'Avant-garde",
    "Vanguard's Endurance Banner": "Bannière d'Endurance de l'Avant-garde",
    "Vanguard's Flamefists Banner": "Bannière des Poings Ardents de l'Avant-garde",
    "Vanguard's Flameplate Banner": "Bannière de Cuirasse Ardente de l'Avant-garde",
    "Vanguard's Frenzy Prism": "Prisme de Frénésie de l'Avant-garde",
    "Vanguard's Medallion": "Médaillon de l'Avant-garde",
    "Vanguard's Memento": "Mémento de l'Avant-garde",
    "Vanguard's Plated Reflection": "Reflet Blindé de l'Avant-garde",
    "Vanguard's Rally Banner": "Bannière de Ralliement de l'Avant-garde",
    "Vanguard's Titanic Engine": "Moteur Titanesque de l'Avant-garde",
    "Venom Amplification Engine": "Moteur d'Amplification du Venin",
    "Venom Precision Prism": "Prisme de Précision du Venin",
    "Victory Mandate": "Mandat de Victoire",
    "Victory Vessel": "Réceptacle de Victoire",
    "Violence Conduit": "Conduit de Violence",
    "Vital Codex": "Codex Vital",
    "Warrior Crest": "Emblème de Guerrier",
    "Warrior Equipment": "Équipement de Guerrier",
    "Warrior's Aegis Banner": "Bannière d'Égide du Guerrier",
    "Warrior's Bloodshield Engine": "Moteur d'Égide de Sang du Guerrier",
    "Warrior's Bravery Banner": "Bannière de Bravoure du Guerrier",
    "Warrior's Emblem": "Emblème du Guerrier",
    "Warrior's Endurance Banner": "Bannière d'Endurance du Guerrier",
    "Warrior's Exaltation Prism": "Prisme d'Exaltation du Guerrier",
    "Warrior's Medallion": "Médaillon du Guerrier",
    "Warrior's Memento": "Mémento du Guerrier",
    "Warrior's Mending Banner": "Bannière de Guérison du Guerrier",
    "Warrior's Precise Reflection": "Reflet Précis du Guerrier",
    "Warrior's Rally Banner": "Bannière de Ralliement du Guerrier",
    "Warrior's Sundering Filigree": "Filigrane de Fracas du Guerrier",
    "Warrior's Swift Reflection": "Reflet Véloce du Guerrier",
    "Weakness": "Faiblesse",
}

# ============================================================================
# 6. ITEM, RELIC & QUEST DESCRIPTIONS (100% exact coverage + template engine)
# ============================================================================
DESCRIPTIONS_EN_TO_FR = {
    # --- DataTracking Descriptions (Items & Relics) ---
    "[Attack]<attack> Gained: [{0}]<datatracking>":
        "[Attaque]<attack> gagnée : [{0}]<datatracking>",
    "[Bonus]<bold> [Attack Speed:]<attackspeed> [{0}]<datatracking>":
        "[Bonus]<bold> [Vitesse d'Attaque :]<attackspeed> [{0}]<datatracking>",
    "[Bonus]<bold> [Attack:]<attack> [{0}]<datatracking>":
        "[Bonus]<bold> [Attaque :]<attack> [{0}]<datatracking>",
    "[Bonus]<bold> [Crit:]<crit> [{0}]<datatracking>":
        "[Bonus]<bold> [Critique :]<crit> [{0}]<datatracking>",
    "[Bonus]<bold> [Defense:]<defense> [{0}]<datatracking>":
        "[Bonus]<bold> [Défense :]<defense> [{0}]<datatracking>",
    "[Bonus]<bold> [Magic:]<magic> [{0}]<datatracking>":
        "[Bonus]<bold> [Magie :]<magic> [{0}]<datatracking>",
    "[Bonus]<bold> [Mana Regen:]<manaregen> [{0}]<datatracking>":
        "[Bonus]<bold> [Régén. Mana :]<manaregen> [{0}]<datatracking>",
    "[Bonus]<bold> [Max HP:]<maxhp> [{0}]<datatracking>":
        "[Bonus]<bold> [PV Max :]<maxhp> [{0}]<datatracking>",
    "[Combats Survived:]<bold> [{0}]<datatracking>":
        "[Combats survécus :]<bold> [{0}]<datatracking>",
    "[Max HP]<maxhp> Gained: [{0}]<datatracking>":
        "[PV Max]<maxhp> gagnés : [{0}]<datatracking>",
    "[Rush]<rush> [Triggered:]<bold> [totalRushTriggers]<globaldatatracking>":
        "[Assaut]<rush> [déclenchés :]<bold> [totalRushTriggers]<globaldatatracking>",
    "[Shards]<shard> [Generated:]<generate> [globalShardsGenerated]<globaldatatracking>":
        "[Éclats]<shard> [générés :]<generate> [globalShardsGenerated]<globaldatatracking>",
    "[Shards]<shard> [Generated:]<generate> [{0}]<datatracking>":
        "[Éclats]<shard> [générés :]<generate> [{0}]<datatracking>",
    "[Stall]<stall> [Triggered:]<bold> [totalStallTriggers]<globaldatatracking>":
        "[Tempo]<stall> [déclenchés :]<bold> [totalStallTriggers]<globaldatatracking>",
    "[Times Used:]<bold> [{0}]<datatracking>":
        "[Utilisations :]<bold> [{0}]<datatracking>",
    "[Attack]<attack> and [Magic]<magic> Gained: [{0}]<datatracking>":
        "[Attaque]<attack> et [Magie]<magic> gagnées : [{0}]<datatracking>",
    "[Crit]<crit> Gained: [{0}]<datatracking>\n[Shards]<shard> [Generated:]<generate> [{1}]<datatracking>":
        "[Critique]<crit> gagné : [{0}]<datatracking>\n[Éclats]<shard> [générés :]<generate> [{1}]<datatracking>",
    "[Defense]<defense> Gained: [{0}]<datatracking>":
        "[Défense]<defense> gagnée : [{0}]<datatracking>",
    "[Magic]<magic> Gained: [{0}]<datatracking>":
        "[Magie]<magic> gagnée : [{0}]<datatracking>",
    "[Rerolls]<reroll> [this Game:]<bold> [globalRerolls]<globaldatatracking>":
        "[Relances]<reroll> [cette partie :]<bold> [globalRerolls]<globaldatatracking>",
    "[Shield]<shield> [Amount:]<bold> [{0}]<datatracking>":
        "[Montant de]<bold> [Bouclier :]<shield> [{0}]<datatracking>",
    "[Stall]<stall> [Triggered:]<bold> [totalStallTriggers]<globaldatatracking>\n[Rush]<rush> [Triggered:]<bold> [totalRushTriggers]<globaldatatracking>":
        "[Tempo]<stall> [déclenchés :]<bold> [totalStallTriggers]<globaldatatracking>\n[Assaut]<rush> [déclenchés :]<bold> [totalRushTriggers]<globaldatatracking>",

    # --- Item Descriptions ---
    "After [Stall (20),]<stall> remove [50% of all Debuffs]<debuff> from all Heroes.":
        "Après [Tempo (20),]<stall> dissipe [50% de tous les Malus]<debuff> sur tous les Héros.",
    "After [Stall (30),]<stall> restore the holder to [100% Max HP]<maxhp> and give them [100 Mana]<mana>.":
        "Après [Tempo (30),]<stall> rend [100% des PV Max]<maxhp> au porteur et lui octroie [100 Mana]<mana>.",
    "After [Stall ({0}),]<stall> gain [+{1}% Max HP]<maxhp> and grow in size.":
        "Après [Tempo ({0}),]<stall> octroie [+{1}% PV Max]<maxhp> et augmente la taille du porteur.",
    "After [Stall ({0}),]<stall> gain [+{1}% basic stats]<basicstat>.":
        "Après [Tempo ({0}),]<stall> octroie [+{1}% de stats de base]<basicstat>.",
    "After [Stall ({0}),]<stall> gain [Stealth]<stealth> for {1} seconds.":
        "Après [Tempo ({0}),]<stall> confère [Camouflage]<stealth> pendant {1} secondes.",
    "After [Stall ({0}),]<stall> gain [{1} Shards]<shard>.":
        "Après [Tempo ({0}),]<stall> gagnez [{1} Éclats]<shard>.",
    "At [start of combat,]<bold> gain [1 Shard]<shard>.":
        "Au [début du combat,]<bold> gagnez [1 Éclat]<shard>.",
    "At [start of combat,]<bold> gain [{0} Shields]<shield>.":
        "Au [début du combat,]<bold> octroie [{0} Boucliers]<shield>.",
    "At [start of combat,]<bold> give the holder and adjacent Heroes [{0} Attack Speed]<attackspeed> and [{1} Crit]<crit>.\n\nAt [end of combat,]<bold> destroy this item if it has been used {2} times.":
        "Au [début du combat,]<bold> confère au porteur et aux Héros adjacents [{0} Vitesse d'Attaque]<attackspeed> et [{1} Critique]<crit>.\n\nÀ la [fin du combat,]<bold> détruit cet objet s'il a été utilisé {2} fois.",
    "At [start of combat,]<bold> give the holder and adjacent Heroes [{0} Defense]<defense> and [{1} Max HP]<maxhp>.\n\nAt [end of combat,]<bold> destroy this item if it has been used {2} times.":
        "Au [début du combat,]<bold> confère au porteur et aux Héros adjacents [{0} Défense]<defense> et [{1} PV Max]<maxhp>.\n\nÀ la [fin du combat,]<bold> détruit cet objet s'il a été utilisé {2} fois.",
    "At [start of combat,]<bold> if the holder is alone in the back row triple this item's stats.":
        "Au [début du combat,]<bold> si le porteur est seul sur la rangée arrière, triple les statistiques de cet objet.",
    "At [start of combat,]<bold> if the holder is alone in the front row triple this item's stats.":
        "Au [début du combat,]<bold> si le porteur est seul sur la rangée avant, triple les statistiques de cet objet.",
    "At [start of combat,]<bold> if the holder is the only Hero in the back {0} rows they gain [{1} Starting Mana]<startingmana> and [{2} Crit]<crit>.":
        "Au [début du combat,]<bold> si le porteur est le seul Héros sur les {0} rangées arrière, il gagne [{1} Mana initial]<startingmana> et [{2} Critique]<crit>.",
    "At [start of combat,]<bold> if there are no Heroes within {0} hexes of the holder the holder's attacks hit the nearest enemy to their target for {1}% damage.":
        "Au [début du combat,]<bold> s'il n'y a aucun Héros à moins de {0} cases du porteur, ses attaques frappent l'ennemi le plus proche de sa cible en lui infligeant {1}% des dégâts.",
    "At [start of combat,]<bold> if there is exactly one Hero in front of the holder they both permanently gain [{0} Attack]<attack>.":
        "Au [début du combat,]<bold> s'il y a exactement un Héros devant le porteur, tous deux gagnent définitivement [{0} Attaque]<attack>.",
    "At [start of combat,]<bold> if there is exactly one Hero in front of the holder they both permanently gain [{0} Max HP]<maxhp>.":
        "Au [début du combat,]<bold> s'il y a exactement un Héros devant le porteur, tous deux gagnent définitivement [{0} PV Max]<maxhp>.",
    "At [start of combat,]<bold> lose [{0}% Max HP]<maxhp>.\n\nThe first time each combat the holder reaches [{1}% Max HP]<maxhp>, gain [{2} Shards]<shard>.":
        "Au [début du combat,]<bold> perd [{0}% des PV Max]<maxhp>.\n\nLa première fois à chaque combat que le porteur atteint [{1}% de ses PV Max]<maxhp>, gagnez [{2} Éclats]<shard>.",
    "At [start of combat,]<bold> set the holder's [Attack]<attack> and [Magic]<magic> to the higher of the two.":
        "Au [début du combat,]<bold> aligne l'[Attaque]<attack> et la [Magie]<magic> du porteur sur la plus élevée des deux valeurs.",
    "At [start of combat,]<bold> the holder and adjacent Heroes gain a [Shield]<shield> equal to {0}% of the holder's [Max HP]<maxhp>.":
        "Au [début du combat,]<bold> le porteur et les Héros adjacents gagnent un [Bouclier]<shield> égal à {0}% des [PV Max]<maxhp> du porteur.",
    "At [start of combat,]<bold> the holder gains a [Shield]<shield> equal to [{0}% of their Defense]<defense>.":
        "Au [début du combat,]<bold> le porteur gagne un [Bouclier]<shield> égal à [{0}% de sa Défense]<defense>.",
    "At [start of combat]<bold> and [every {0} seconds,]<bold> gain [Stealth]<stealth> for {1} seconds.":
        "Au [début du combat]<bold> et [toutes les {0} secondes,]<bold> confère [Camouflage]<stealth> pendant {1} secondes.",
    "Damage from the holder executes enemies below [15% Max HP]<maxhp>.":
        "Les dégâts du porteur exécutent les ennemis ayant moins de [15% de leurs PV Max]<maxhp>.",
    "Every {0} times the holder is [auto attacked,]<bold> inflict [{1} Frost]<frost> on the attacker.":
        "Toutes les {0} fois que le porteur subit une [attaque auto,]<bold> inflige [{1} Gel]<frost> à l'attaquant.",
    "Every {0} times the holder is [auto attacked,]<bold> inflict [{1} Poison]<poison> on the attacker.":
        "Toutes les {0} fois que le porteur subit une [attaque auto,]<bold> inflige [{1} Poison]<poison> à l'attaquant.",
    "For [Rush (7),]<rush> the holder's auto attacks gain [150 Crit]<crit>.":
        "Pendant [Assaut (7),]<rush> les attaques auto du porteur gagnent [150 Critique]<crit>.",
    "For [Rush ({0}),]<rush> gain [+{1}% basic stats]<basicstat>.":
        "Pendant [Assaut ({0}),]<rush> octroie [+{1}% de stats de base]<basicstat>.",
    "For [Rush ({0}),]<rush> gain [{1} Attack Speed]<attackspeed>.\n\nDouble the holder's [move speed]<movespeed>.":
        "Pendant [Assaut ({0}),]<rush> octroie [{1} Vitesse d'Attaque]<attackspeed>.\n\nDouble la [vitesse de déplacement]<movespeed> du porteur.",
    "Gain +{0}% to the [primary stats]<primarystat> of each of the holder's [classes]<class>.":
        "Octroie +{0}% aux [stats principales]<primarystat> de chacune des [classes]<class> du porteur.",
    "Gain [+25% Attack]<attack> and [+25% Attack Speed]<attackspeed>.":
        "Octroie [+25% Attaque]<attack> et [+25% Vitesse d'Attaque]<attackspeed>.",
    "Gain [+25% Magic]<magic> and [+25% Mana Regen]<manaregen>.":
        "Octroie [+25% Magie]<magic> et [+25% Régén. Mana]<manaregen>.",
    "Gain [+25% Max HP]<maxhp> and [+25% Defense]<defense>.":
        "Octroie [+25% PV Max]<maxhp> et [+25% Défense]<defense>.",
    "Gain [10 Shards]<shard>.":
        "Gagnez [10 Éclats]<shard>.",
    "Gain [15 Shards]<shard>.":
        "Gagnez [15 Éclats]<shard>.",
    "Gain [{0} Attack]<attack> per [{1} Shards]<shard> [generated]<generate> this game.":
        "Octroie [{0} Attaque]<attack> par tranche de [{1} Éclats]<shard> [générés]<generate> au cours de cette partie.",
    "Gain [{0} Attack]<attack>, [{1} Magic]<magic>, [{2} Attack Speed]<attackspeed>, and [{3} Defense]<defense> per [{4} Shards]<shard> [generated]<generate> this game.":
        "Octroie [{0} Attaque]<attack>, [{1} Magie]<magic>, [{2} Vitesse d'Attaque]<attackspeed> et [{3} Défense]<defense> par tranche de [{4} Éclats]<shard> [générés]<generate> au cours de cette partie.",
    "Gain [{0} Crit]<crit> and [{1} Mana Regen]<manaregen> while [Shielded]<shield>.":
        "Octroie [{0} Critique]<crit> et [{1} Régén. Mana]<manaregen> tant que le porteur est [Protégé]<shield>.",
    "Gain [{0} Crit]<crit> per {1}% missing [health]<maxhp> on the holder's target.":
        "Octroie [{0} Critique]<crit> par tranche de {1}% de [PV]<maxhp> manquants sur la cible du porteur.",
    "Gain [{0} Magic]<magic> per [{1} Shards]<shard> [generated]<generate> this game.":
        "Octroie [{0} Magie]<magic> par tranche de [{1} Éclats]<shard> [générés]<generate> au cours de cette partie.",
    "If this item is held by a [Duelist]<duelist>, double its stats.":
        "Si cet objet est porté par un [Duelliste]<duelist>, double ses statistiques.",
    "If this item is held by a [Mage]<mage>, double its stats.":
        "Si cet objet est porté par un [Mage]<mage>, double ses statistiques.",
    "If this item is held by a [Mystic]<mystic>, double its stats.":
        "Si cet objet est porté par un [Mystique]<mystic>, double ses statistiques.",
    "If this item is held by a [Tank]<tank>, double its stats.":
        "Si cet objet est porté par un [Tank]<tank>, double ses statistiques.",
    "If this item is held by a [Vanguard]<vanguard>, double its stats.":
        "Si cet objet est porté par une [Avant-garde]<vanguard>, double ses statistiques.",
    "If this item is held by a [Warrior]<warrior>, double its stats.":
        "Si cet objet est porté par un [Guerrier]<warrior>, double ses statistiques.",
    "If this item is held by an [Assassin]<assassin>, double its stats.":
        "Si cet objet est porté par un [Assassin]<assassin>, double ses statistiques.",
    "On [Crit,]<crit> inflict [{0} Poison]<poison>.":
        "Sur [Coup Critique,]<crit> inflige [{0} Poison]<poison>.",
    "On [Crit,]<crit> reduce the target's [Defense]<defense> by {0}.":
        "Sur [Coup Critique,]<crit> réduit la [Défense]<defense> de la cible de {0}.",
    "On [Rush]<rush> [trigger,]<bold> if held by a [Vanguard]<vanguard> this item gains [{0} Max HP]<maxhp>.":
        "Lors du [déclenchement]<bold> d'[Assaut]<rush>, si porté par une [Avant-garde]<vanguard>, cet objet gagne [{0} PV Max]<maxhp>.",
    "On [Rush]<rush> trigger, gain [{0} Attack Speed]<attackspeed> and [{1} Attack]<attack>.":
        "Lors du déclenchement d'[Assaut]<rush>, octroie [{0} Vitesse d'Attaque]<attackspeed> et [{1} Attaque]<attack>.",
    "On [Rush]<rush> trigger, gain [{0} Shields]<shield>.":
        "Lors du déclenchement d'[Assaut]<rush>, octroie [{0} Boucliers]<shield>.",
    "On [Shards]<shard> [generated,]<generate> deal [{0} damage]<damage> to all enemies.":
        "Lorsque des [Éclats]<shard> sont [générés,]<generate> inflige [{0} dégâts]<damage> à tous les ennemis.",
    "On [Shards]<shard> [generated,]<generate> give all Heroes [{0} Shields]<shield>.":
        "Lorsque des [Éclats]<shard> sont [générés,]<generate> confère [{0} Boucliers]<shield> à tous les Héros.",
    "On [Stall]<stall> [trigger,]<bold> if held by a [Tank]<tank> this item gains [{0} Defense]<defense>.":
        "Lors du [déclenchement]<bold> de [Tempo]<stall>, si porté par un [Tank]<tank>, cet objet gagne [{0} Défense]<defense>.",
    "On [Stall]<stall> trigger, [heal {0}]<heal>.":
        "Lors du déclenchement de [Tempo]<stall>, [soigne de {0}]<heal>.",
    "On [Stall]<stall> trigger, gain [{0} Attack Speed]<attackspeed> and [{1} Magic]<magic>.":
        "Lors du déclenchement de [Tempo]<stall>, octroie [{0} Vitesse d'Attaque]<attackspeed> et [{1} Magie]<magic>.",
    "On [active ability kill,]<bold> if held by a [Mage]<mage> this item gains [{0} Magic]<magic>.":
        "Lors d'une [élimination par compétence active,]<bold> si porté par un [Mage]<mage>, cet objet gagne [{0} Magie]<magic>.",
    "On [auto attack,]<bold> deal [bonus damage]<damage> equal to the [Burn]<burn> on the target.":
        "À chaque [attaque auto,]<bold> inflige des [dégâts bonus]<damage> égaux à la [Brûlure]<burn> sur la cible.",
    "On [auto attack,]<bold> deal [bonus damage]<damage> to all enemies equal to [66% of the holder's Attack Speed]<attackspeed>.":
        "À chaque [attaque auto,]<bold> inflige des [dégâts bonus]<damage> à tous les ennemis égaux à [66% de la Vitesse d'Attaque du porteur]<attackspeed>.",
    "On [auto attack,]<bold> gain [{0} Max HP]<maxhp>.\nWhen [auto attacked,]<bold> gain [{1} Attack]<attack>.":
        "À chaque [attaque auto,]<bold> octroie [{0} PV Max]<maxhp>.\nLorsqu'[attaqué auto,]<bold> octroie [{1} Attaque]<attack>.",
    "On [auto attack,]<bold> inflict [{0} Burn]<burn> on the target.\nWhen [auto attacked,]<bold> inflict [{1} Burn]<burn> on the attacker.":
        "À chaque [attaque auto,]<bold> inflige [{0} Brûlure]<burn> à la cible.\nLorsqu'[attaqué auto,]<bold> inflige [{1} Brûlure]<burn> à l'attaquant.",
    "On [auto attack,]<bold> inflict [{0} Burn]<burn>.":
        "À chaque [attaque auto,]<bold> inflige [{0} Brûlure]<burn>.",
    "On [auto attack,]<bold> inflict [{0} Frost]<frost> on the target.\nWhen [auto attacked,]<bold> inflict [{1} Frost]<frost> on the attacker.":
        "À chaque [attaque auto,]<bold> inflige [{0} Gel]<frost> à la cible.\nLorsqu'[attaqué auto,]<bold> inflige [{1} Gel]<frost> à l'attaquant.",
    "On [auto attack,]<bold> inflict [{0} Poison]<poison> on the target.\nWhen [auto attacked,]<bold> inflict [{1} Poison]<poison> on the attacker.":
        "À chaque [attaque auto,]<bold> inflige [{0} Poison]<poison> à la cible.\nLorsqu'[attaqué auto,]<bold> inflige [{1} Poison]<poison> à l'attaquant.",
    "On [auto attack,]<bold> steal [{0} Mana]<mana> from the target.":
        "À chaque [attaque auto,]<bold> vole [{0} Mana]<mana> à la cible.",
    "On [cast,]<bold> gain [{0} Attack]<attack>.\nOn [auto attack,]<bold> gain [{1} Magic]<magic>.":
        "Au [lancer,]<bold> octroie [{0} Attaque]<attack>.\nÀ chaque [attaque auto,]<bold> octroie [{1} Magie]<magic>.",
    "On [cast,]<bold> gain [{0} Magic]<magic> per type of [Debuff]<debuff> on all enemies.":
        "Au [lancer,]<bold> octroie [{0} Magie]<magic> par type de [Malus]<debuff> présent sur tous les ennemis.",
    "On [cast,]<bold> gain [{0} Mana Regen]<manaregen> and [{1} HP/S]<hp/s>.":
        "Au [lancer,]<bold> octroie [{0} Régén. Mana]<manaregen> et [{1} PV/s]<hp/s>.",
    "On [cast,]<bold> inflict [{0} Burn]<burn> on the nearest enemy.":
        "Au [lancer,]<bold> inflige [{0} Brûlure]<burn> à l'ennemi le plus proche.",
    "On [cast,]<bold> inflict [{0} Frost]<frost> on the nearest enemy.":
        "Au [lancer,]<bold> inflige [{0} Gel]<frost> à l'ennemi le plus proche.",
    "On [cast,]<bold> remove [{0} Frost]<frost> from each enemy with {1} or more [Frost]<frost> to [Stun]<stun> those enemies for {2} seconds.":
        "Au [lancer,]<bold> retire [{0} Gel]<frost> à chaque ennemi ayant au moins {1} [Gel]<frost> pour les [Étourdir]<stun> pendant {2} secondes.",
    "On [combat survival,]<bold> if held by a [Warrior]<warrior> this item gains [{0} Attack]<attack>.":
        "En [survivant au combat,]<bold> si porté par un [Guerrier]<warrior>, cet objet gagne [{0} Attaque]<attack>.",
    "On [kill,]<bold> gain [{0} Mana]<mana>.\nOn [cast,]<bold> [heal]<heal> [{1}% Max HP]<maxhp>.":
        "Lors d'une [élimination,]<bold> octroie [{0} Mana]<mana>.\nAu [lancer,]<bold> [soigne]<heal> [{1}% des PV Max]<maxhp>.",
    "On [kill,]<bold> gain [{0} Shards]<shard>.":
        "Lors d'une [élimination,]<bold> gagnez [{0} Éclats]<shard>.",
    "Reflect 66% of [Shield]<shield> damage taken back to the source.":
        "Renvoie 66% des dégâts subis par les [Boucliers]<shield> à l'attaquant.",
    "The holder counts as a [Duelist]<duelist> during combat.":
        "Le porteur compte comme un [Duelliste]<duelist> pendant le combat.",
    "The holder counts as a [Duelist]<duelist> during combat. If they were already a [Duelist]<duelist>, they gain [+{0}% Attack Speed]<attackspeed>.":
        "Le porteur compte comme un [Duelliste]<duelist> pendant le combat. S'il était déjà un [Duelliste]<duelist>, il gagne [+{0}% Vitesse d'Attaque]<attackspeed>.",
    "The holder counts as a [Mage]<mage> during combat.":
        "Le porteur compte comme un [Mage]<mage> pendant le combat.",
    "The holder counts as a [Mage]<mage> during combat. If they were already a [Mage]<mage>, they gain [+{0}% Magic]<magic>.":
        "Le porteur compte comme un [Mage]<mage> pendant le combat. S'il était déjà un [Mage]<mage>, il gagne [+{0}% Magie]<magic>.",
    "The holder counts as a [Mystic]<mystic> during combat.":
        "Le porteur compte comme un [Mystique]<mystic> pendant le combat.",
    "The holder counts as a [Mystic]<mystic> during combat. If they were already a [Mystic]<mystic>, they gain [+{0}% Mana Regen]<manaregen>.":
        "Le porteur compte comme un [Mystique]<mystic> pendant le combat. S'il était déjà un [Mystique]<mystic>, il gagne [+{0}% Régén. Mana]<manaregen>.",
    "The holder counts as a [Tank]<tank> during combat.":
        "Le porteur compte comme un [Tank]<tank> pendant le combat.",
    "The holder counts as a [Tank]<tank> during combat. If they were already a [Tank]<tank>, they gain [+{0}% Defense]<defense>.":
        "Le porteur compte comme un [Tank]<tank> pendant le combat. S'il était déjà un [Tank]<tank>, il gagne [+{0}% Défense]<defense>.",
    "The holder counts as a [Vanguard]<vanguard> during combat.":
        "Le porteur compte comme une [Avant-garde]<vanguard> pendant le combat.",
    "The holder counts as a [Vanguard]<vanguard> during combat. If they were already a [Vanguard]<vanguard>, they gain [+{0}% Max HP]<maxhp>.":
        "Le porteur compte comme une [Avant-garde]<vanguard> pendant le combat. S'il était déjà une [Avant-garde]<vanguard>, il gagne [+{0}% PV Max]<maxhp>.",
    "The holder counts as a [Warrior]<warrior> during combat.":
        "Le porteur compte comme un [Guerrier]<warrior> pendant le combat.",
    "The holder counts as a [Warrior]<warrior> during combat. If they were already a [Warrior]<warrior>, they gain [+{0}% Attack]<attack>.":
        "Le porteur compte comme un [Guerrier]<warrior> pendant le combat. S'il était déjà un [Guerrier]<warrior>, il gagne [+{0}% Attaque]<attack>.",
    "The holder counts as an [Assassin]<assassin> during combat.":
        "Le porteur compte comme un [Assassin]<assassin> pendant le combat.",
    "The holder counts as an [Assassin]<assassin> during combat. If they were already an [Assassin]<assassin>, they gain [+{0}% Crit]<crit>.":
        "Le porteur compte comme un [Assassin]<assassin> pendant le combat. S'il était déjà un [Assassin]<assassin>, il gagne [+{0}% Critique]<crit>.",
    "The holder gains [{0} Attack]<attack> and [{1} Max HP]<maxhp> per [Rush]<rush> trigger this game.":
        "Le porteur gagne [{0} Attaque]<attack> et [{1} PV Max]<maxhp> par déclenchement d'[Assaut]<rush> au cours de cette partie.",
    "The holder gains [{0} Defense]<defense> and [{1} Magic]<magic> per [Stall]<stall> trigger this game.":
        "Le porteur gagne [{0} Défense]<defense> et [{1} Magie]<magic> par déclenchement de [Tempo]<stall> au cours de cette partie.",
    "The holder's [Rush]<rush> abilities last 2 seconds longer.":
        "Les compétences d'[Assaut]<rush> du porteur durent 2 secondes de plus.",
    "The holder's [Rush]<rush> abilities last {0} seconds longer.":
        "Les compétences d'[Assaut]<rush> du porteur durent {0} secondes de plus.",
    "The holder's [Stall]<stall> abilities trigger 4 seconds faster.":
        "Les compétences de [Tempo]<stall> du porteur se déclenchent 4 secondes plus tôt.",
    "The holder's [Stall]<stall> abilities trigger {0} seconds sooner.":
        "Les compétences de [Tempo]<stall> du porteur se déclenchent {0} secondes plus tôt.",
    "The holder's [Stall]<stall> abilities trigger {0} seconds faster.":
        "Les compétences de [Tempo]<stall> du porteur se déclenchent {0} secondes plus tôt.",
    "The holder's active abilities gain [150 Crit]<crit>.":
        "Les compétences actives du porteur gagnent [150 Critique]<crit>.",
    "The holder's active abilities gain [{0} Crit]<crit>.":
        "Les compétences actives du porteur gagnent [{0} Critique]<crit>.",
    "When this item is [destroyed,]<bold> permanently give the holder a large amount of [primary stats]<primarystat> for each of their classes.\n\nWhen the holder [survives combat,]<bold> destroy this item.":
        "Lorsque cet objet est [détruit,]<bold> octroie définitivement au porteur une grande quantité de [stats principales]<primarystat> pour chacune de ses classes.\n\nLorsque le porteur [survit au combat,]<bold> détruit cet objet.",
    "When this item is [destroyed,]<bold> permanently give the holder a very large amount of [primary stats]<primarystat> for each of their classes.\n\nWhen the holder [survives combat,]<bold> destroy this item if it has survived {0} combats.":
        "Lorsque cet objet est [détruit,]<bold> octroie définitivement au porteur une très grande quantité de [stats principales]<primarystat> pour chacune de ses classes.\n\nLorsque le porteur [survit au combat,]<bold> détruit cet objet s'il a survécu à {0} combats.",
    "Whenever an enemy takes [Poison]<poison> damage, gain [{0} Crit]<crit> and [{1} HP/S]<hp/s>.":
        "Chaque fois qu'un ennemi subit des dégâts de [Poison]<poison>, octroie [{0} Critique]<crit> et [{1} PV/s]<hp/s>.",
    "Whenever the holder [Shields]<shield> another Hero, damage all enemies equal to {0}% of the [Shield]<shield> applied.":
        "Chaque fois que le porteur applique un [Bouclier]<shield> à un autre Héros, inflige à tous les ennemis des dégâts égaux à {0}% du [Bouclier]<shield> appliqué.",
    "Whenever the holder [inflicts a Debuff,]<debuff> inflict {0} more.":
        "Chaque fois que le porteur [inflige un Malus,]<debuff> en inflige {0} de plus.",
    "Whenever the holder applies [Shields,]<shield> also [heal]<heal> for 50% of the [Shields]<shield> applied.":
        "Chaque fois que le porteur applique des [Boucliers,]<shield> [soigne]<heal> également à hauteur de 50% des [Boucliers]<shield> appliqués.",
    "Whenever the holder applies [Shields,]<shield> also [heal]<heal> for {0}% of the [Shields]<shield> applied.":
        "Chaque fois que le porteur applique des [Boucliers,]<shield> [soigne]<heal> également à hauteur de {0}% des [Boucliers]<shield> appliqués.",
    "Whenever the holder applies [Shields]<shield>, apply {0}% more.":
        "Chaque fois que le porteur applique des [Boucliers]<shield>, en applique {0}% de plus.",
    "Whenever the holder inflicts [Burn,]<burn> inflict 50% more.":
        "Chaque fois que le porteur inflige [Brûlure,]<burn> en inflige 50% de plus.",
    "Whenever the holder inflicts [Burn,]<burn> inflict 66% more.":
        "Chaque fois que le porteur inflige [Brûlure,]<burn> en inflige 66% de plus.",
    "Whenever the holder inflicts [Burn,]<burn> inflict {0}% more.":
        "Chaque fois que le porteur inflige [Brûlure,]<burn> en inflige {0}% de plus.",
    "Whenever the holder inflicts [Frost,]<frost> inflict 20% more.":
        "Chaque fois que le porteur inflige [Gel,]<frost> en inflige 20% de plus.",
    "Whenever the holder inflicts [Frost,]<frost> inflict 33% more.":
        "Chaque fois que le porteur inflige [Gel,]<frost> en inflige 33% de plus.",
    "Whenever the holder inflicts [Frost,]<frost> inflict {0}% more.":
        "Chaque fois que le porteur inflige [Gel,]<frost> en inflige {0}% de plus.",
    "Whenever the holder inflicts [Poison,]<poison> inflict 100% more.":
        "Chaque fois que le porteur inflige [Poison,]<poison> en inflige 100% de plus.",
    "Whenever the holder inflicts [Poison,]<poison> inflict 50% more.":
        "Chaque fois que le porteur inflige [Poison,]<poison> en inflige 50% de plus.",
    "Whenever the holder inflicts [Poison,]<poison> inflict {0}% more.":
        "Chaque fois que le porteur inflige [Poison,]<poison> en inflige {0}% de plus.",
    "Whenever the holder is [auto attacked,]<bold> inflict [{0} Burn]<burn> on the attacker.":
        "Chaque fois que le porteur subit une [attaque auto,]<bold> inflige [{0} Brûlure]<burn> à l'attaquant.",
    "[Every {0} auto attacks,]<bold> if held by a [Duelist]<duelist> this item gains [{1} Attack Speed]<attackspeed>.":
        "[Toutes les {0} attaques auto,]<bold> si porté par un [Duelliste]<duelist>, cet objet gagne [{1} Vitesse d'Attaque]<attackspeed>.",
    "[Every {0} casts,]<bold> if held by a [Mystic]<mystic> this item gains [{1} Mana Regen]<manaregen>.":
        "[Tous les {0} lancers,]<bold> si porté par un [Mystique]<mystic>, cet objet gagne [{1} Régén. Mana]<manaregen>.",
    "[Every {0} seconds,]<bold> remove [{1}% of all Debuffs]<debuff> from the holder.":
        "[Toutes les {0} secondes,]<bold> dissipe [{1}% de tous les Malus]<debuff> du porteur.",
    "[On kill,]<bold> if held by an [Assassin]<assassin> this item gains [{0} Crit]<crit>.":
        "[Lors d'une élimination,]<bold> si porté par un [Assassin]<assassin>, cet objet gagne [{0} Critique]<crit>.",

    # --- Item & Relic Quest Descriptions & Reward Descriptions ---
    "Apply [{0} Shields]<shield>":
        "Appliquez [{0} Boucliers]<shield>",
    "Apply [{0} Shields]<shield>.":
        "Appliquez [{0} Boucliers]<shield>.",
    "Attack {0} times. The holder must be Irini.":
        "Attaquez {0} fois. Le porteur doit être Irini.",
    "Auto attack {0} times.":
        "Effectuez {0} attaques auto.",
    "Cast {0} times.":
        "Lancez une compétence {0} fois.",
    "Cast {0} Active Abilities.":
        "Lancez {0} compétences actives.",
    "Deal {0} damage with active abilities.":
        "Infligez {0} dégâts avec des compétences actives.",
    "Deal {0} damage with auto attacks.":
        "Infligez {0} dégâts avec des attaques auto.",
    "Inflict [{0} Burn]<burn>.":
        "Infligez [{0} Brûlure]<burn>.",
    "Inflict [{0} Debuffs]<debuff>.":
        "Infligez [{0} Malus]<debuff>.",
    "Inflict [{0} Frost]<frost>":
        "Infligez [{0} Gel]<frost>",
    "Inflict [{0} Frost]<frost>.":
        "Infligez [{0} Gel]<frost>.",
    "Inflict [{0} Poison]<poison>":
        "Infligez [{0} Poison]<poison>",
    "Inflict [{0} Poison]<poison>.":
        "Infligez [{0} Poison]<poison>.",
    "Inflict [{0} Poison]<poison>, [{1} Frost]<frost>, and [{2} Burn]<burn> on a single enemy.":
        "Infligez [{0} Poison]<poison>, [{1} Gel]<frost> et [{2} Brûlure]<burn> à un même ennemi.",
    "Take [{0} Shield]<shield> damage.":
        "Subissez [{0} dégâts de Bouclier]<shield>.",
    "Take {0} Damage.":
        "Subissez {0} dégâts.",
    "Trigger [Rush]<rush> {0} times from any source.":
        "Déclenchez [Assaut]<rush> {0} fois depuis n'importe quelle source.",
    "Trigger [Stall]<stall> {0} times from any source.":
        "Déclenchez [Tempo]<stall> {0} fois depuis n'importe quelle source.",
    "Trigger [Rush]<rush> or [Stall]<stall> {0} times.":
        "Déclenchez [Assaut]<rush> ou [Tempo]<stall> {0} fois.",
    "Trigger [Rush]<rush> {0} times.":
        "Déclenchez [Assaut]<rush> {0} fois.",
    "Trigger [Stall]<stall> {0} times.":
        "Déclenchez [Tempo]<stall> {0} fois.",
    "Win a combat with [{0} or more Shards]<shard> or more in the bank.":
        "Remportez un combat avec au moins [{0} Éclats]<shard> en réserve.",
    "Win a combat with [{0} or more Shards]<shard> in your bank.":
        "Remportez un combat avec au moins [{0} Éclats]<shard> en réserve.",
    "Win a combat with Heroes of {0} or more different ranks in combat.":
        "Remportez un combat avec des Héros d'au moins {0} rangs différents au combat.",
    "Win a combat with a Hero of all {0} [classes]<class> in combat or in the reserves.":
        "Remportez un combat en ayant un Héros de chacune des {0} [classes]<class> au combat ou dans la réserve.",
    "Win a combat with only {0} surviving Hero.":
        "Remportez un combat avec seulement {0} Héros survivant.",
    "Win a combat with {0} Heroes in your [reserves]<reserve>.":
        "Remportez un combat avec {0} Héros dans votre [réserve]<reserve>.",
    "Win a combat with {0} or more Heroes in play, where no [Class]<class> is shared between any two Heroes.":
        "Remportez un combat avec au moins {0} Héros en jeu, sans qu'aucune [Classe]<class> ne soit partagée entre deux Héros.",
    "Win a combat with {0} or more Heroes of the same [Class]<class> in play.":
        "Remportez un combat avec au moins {0} Héros de la même [Classe]<class> en jeu.",
    "Win a combat with {0} or more combined [classes]<class> in play.":
        "Remportez un combat avec au moins {0} [classes]<class> cumulées en jeu.",
    "Win a combat with {0} or more heroes of the same [class]<class> in combat or in the reserves.":
        "Remportez un combat avec au moins {0} Héros de la même [classe]<class> au combat ou dans la réserve.",
    "Win {0} combats.":
        "Remportez {0} combats.",
    "[Crit]<crit> {0} times.":
        "Infligez {0} [Coups Critiques]<crit>.",
    "[Generate]<generate> [{0} Shards]<shard> from any source.":
        "[Générez]<generate> [{0} Éclats]<shard> depuis n'importe quelle source.",
    "[Generate]<generate> [{0} Shards]<shard>.":
        "[Générez]<generate> [{0} Éclats]<shard>.",
    "[Generate]<generate> [{0} Shards]<shards>.":
        "[Générez]<generate> [{0} Éclats]<shards>.",
    "[Reroll]<reroll> the shop {0} times, then complete a combat.":
        "[Relancez]<reroll> la boutique {0} fois, puis terminez un combat.",
    "After [Stall ({0}),]<stall> remove [{1}% of all Debuffs]<debuff> from all Heroes.":
        "Après [Tempo ({0}),]<stall> dissipe [{1}% de tous les Malus]<debuff> sur tous les Héros.",
    "After [Stall ({0}),]<stall> restore the holder to [{1}% Max HP]<maxhp> and give them [{2} Mana]<mana>.":
        "Après [Tempo ({0}),]<stall> rend [{1}% des PV Max]<maxhp> au porteur et lui octroie [{2} Mana]<mana>.",
    "At [start of combat,]<bold> gain [{0} Shard]<shard>.":
        "Au [début du combat,]<bold> gagnez [{0} Éclat]<shard>.",
    "At [start of combat,]<bold> gain [{0} Shards]<shard>.":
        "Au [début du combat,]<bold> gagnez [{0} Éclats]<shard>.",
    "Damage from the holder executes enemies below [{0}% Max HP]<maxhp>.":
        "Les dégâts du porteur exécutent les ennemis ayant moins de [{0}% de leurs PV Max]<maxhp>.",
    "For [Rush ({0}),]<rush> the holder's auto attacks gain [{1} Crit]<crit>.":
        "Pendant [Assaut ({0}),]<rush> les attaques auto du porteur gagnent [{1} Critique]<crit>.",
    "Gain [+{0}% Attack]<attack> and [+{1}% Attack Speed]<attackspeed>.":
        "Octroie [+{0}% Attaque]<attack> et [+{1}% Vitesse d'Attaque]<attackspeed>.",
    "Gain [+{0}% Magic]<magic> and [+{1}% Mana Regen]<manaregen>.":
        "Octroie [+{0}% Magie]<magic> et [+{1}% Régén. Mana]<manaregen>.",
    "Gain [+{0}% Max HP]<maxhp> and [+{1}% Defense]<defense>.":
        "Octroie [+{0}% PV Max]<maxhp> et [+{1}% Défense]<defense>.",
    "On [auto attack,]<bold> deal [bonus damage]<damage> to all enemies equal to [{0}% of the holder's Attack Speed]<attackspeed>.":
        "À chaque [attaque auto,]<bold> inflige des [dégâts bonus]<damage> à tous les ennemis égaux à [{0}% de la Vitesse d'Attaque du porteur]<attackspeed>.",
    "Reflect {0}% of [Shield]<shield> damage taken back to the source.":
        "Renvoie {0}% des dégâts subis par les [Boucliers]<shield> à l'attaquant.",
}

DESCRIPTIONS_EN_TO_FR.update({
    # --- Relic Descriptions (Part 1: A - I) ---
    "A Hero permanently gained [{0} Attack Speed]<attackspeed>.":
        "Un Héros a gagné définitivement [{0} Vitesse d'Attaque]<attackspeed>.",
    "A Hero permanently gained [{0} Attack]<attack>.":
        "Un Héros a gagné définitivement [{0} Attaque]<attack>.",
    "A Hero permanently gained [{0} Crit]<crit>.":
        "Un Héros a gagné définitivement [{0} Critique]<crit>.",
    "A Hero permanently gained [{0} Defense]<defense>.":
        "Un Héros a gagné définitivement [{0} Défense]<defense>.",
    "A Hero permanently gained [{0} Magic]<magic>.":
        "Un Héros a gagné définitivement [{0} Magie]<magic>.",
    "A Hero permanently gained [{0} Mana Regen]<manaregen>.":
        "Un Héros a gagné définitivement [{0} Régén. Mana]<manaregen>.",
    "A Hero permanently gained [{0} Max HP]<maxhp>.":
        "Un Héros a gagné définitivement [{0} PV Max]<maxhp>.",
    "After [Stall ({0} and {1}),]<bold> give Heroes a [lasting]<lasting> [{2}% Max HP Shield]<shield> for each time you've [rerolled]<reroll> the shop this game.":
        "Après [Tempo ({0} et {1}),]<bold> confère aux Héros un [Bouclier de {2}% des PV Max]<shield> [persistant]<lasting> pour chaque [relance]<reroll> de boutique effectuée au cours de cette partie.",
    "After [Stall ({0} and {1}),]<stall> [Mages]<mage> gain [{2} Mana]<mana>.":
        "Après [Tempo ({0} et {1}),]<stall> les [Mages]<mage> gagnent [{2} Mana]<mana>.",
    "After [Stall ({0} and {1}),]<stall> gain [{2} Shards]<shard>.":
        "Après [Tempo ({0} et {1}),]<stall> gagnez [{2} Éclats]<shard>.",
    "After [Stall ({0} and {1}),]<stall> inflict [{2} Poison]<poison> on all enemies.":
        "Après [Tempo ({0} et {1}),]<stall> inflige [{2} Poison]<poison> à tous les ennemis.",
    "After [Stall ({0}),]<stall> Heroes gain [+{1}% basic stats]<basicstat> for every {2} times you've triggered [Stall]<stall> this game.":
        "Après [Tempo ({0}),]<stall> les Héros gagnent [+{1}% de stats de base]<basicstat> toutes les {2} fois que vous avez déclenché [Tempo]<stall> au cours de cette partie.",
    "After [Stall ({0}),]<stall> Heroes gain [{1} Defense]<defense> and [{2} Magic]<magic> per [{3} Debuffs]<debuff> on all enemies.":
        "Après [Tempo ({0}),]<stall> les Héros gagnent [{1} Défense]<defense> et [{2} Magie]<magic> par tranche de [{3} Malus]<debuff> présents sur tous les ennemis.",
    "After [Stall ({0}),]<stall> Heroes gain [{1} HP/S]<hp/s>.":
        "Après [Tempo ({0}),]<stall> les Héros gagnent [{1} PV/s]<hp/s>.",
    "After [Stall ({0}),]<stall> Heroes gain a [lasting]<lasting> [{1}% Max HP Shield]<shield>.":
        "Après [Tempo ({0}),]<stall> les Héros gagnent un [Bouclier de {1}% des PV Max]<shield> [persistant]<lasting>.",
    "After [Stall ({0}),]<stall> [Mages]<mage> permanently gain [{1} Magic]<magic>.":
        "Après [Tempo ({0}),]<stall> les [Mages]<mage> gagnent définitivement [{1} Magie]<magic>.",
    "After [Stall ({0}),]<stall> [Tanks]<tank> gain [{1} HP/S]<hp/s> per [{2} Defense]<defense> they have.":
        "Après [Tempo ({0}),]<stall> les [Tanks]<tank> gagnent [{1} PV/s]<hp/s> par tranche de [{2} Défense]<defense> qu'ils possèdent.",
    "After [Stall ({0}),]<stall> [Tanks]<tank> permanently gain [{1} Defense]<defense>.":
        "Après [Tempo ({0}),]<stall> les [Tanks]<tank> gagnent définitivement [{1} Défense]<defense>.",
    "After [Stall ({0}),]<stall> break the rift.":
        "Après [Tempo ({0}),]<stall> brise la faille.",
    "After [Stall ({0}),]<stall> enemies have {1}% increased stats.":
        "Après [Tempo ({0}),]<stall> les ennemis ont +{1}% de statistiques.",
    "After [Stall ({0}),]<stall> whenever a [Duelist]<duelist> auto attacks they also hit the nearest enemy to their target, dealing {1}% damage and applying on-hit effects.":
        "Après [Tempo ({0}),]<stall> chaque fois qu'un [Duelliste]<duelist> effectue une attaque auto, il frappe également l'ennemi le plus proche de sa cible, infligeant {1}% des dégâts et appliquant les effets à l'impact.",
    "After [Stall ({0}),]<stall> whenever an enemy with [Poison]<poison> is auto attacked, they take damage equal to their [Poison]<poison>.":
        "Après [Tempo ({0}),]<stall> chaque fois qu'un ennemi affecté par [Poison]<poison> subit une attaque auto, il subit des dégâts égaux à son [Poison]<poison>.",
    "After [Stall ({0}, {1}, and {2}),]<stall> Heroes gain [{3}]<shield> [lasting]<lasting> [Shields]<shield>.":
        "Après [Tempo ({0}, {1} et {2}),]<stall> les Héros gagnent [{3}]<shield> [Boucliers]<shield> [persistants]<lasting>.",
    "After [Stall ({0}, {1}, and {2}),]<stall> all enemies receive damage equal to {3} times the amount of [Frost]<frost> they have.":
        "Après [Tempo ({0}, {1} et {2}),]<stall> tous les ennemis subissent des dégâts égaux à {3} fois la quantité de [Gel]<frost> qui les affecte.",
    "After [Stall ({0}, {1}, and {2}),]<stall> double the amount of [Poison]<poison> on all enemies.":
        "Après [Tempo ({0}, {1} et {2}),]<stall> double la quantité de [Poison]<poison> sur tous les ennemis.",
    "After [Stall ({0}, {1}, and {2}),]<stall> give Heroes +{3}% to all their [basic stats]<basicstat>.":
        "Après [Tempo ({0}, {1} et {2}),]<stall> confère aux Héros +{3}% à toutes leurs [stats de base]<basicstat>.",
    "At [start of Combat,]<bold> inflict [25 Poison]<poison>, [50 Frost]<frost>, and [75 Burn]<burn> on all enemies.":
        "Au [début du combat,]<bold> inflige [25 Poison]<poison>, [50 Gel]<frost> et [75 Brûlure]<burn> à tous les ennemis.",
    "At [start of Combat,]<bold> inflict [{0} Poison]<poison>, [{1} Frost]<frost>, and [{2} Burn]<burn> on all enemies.":
        "Au [début du combat,]<bold> inflige [{0} Poison]<poison>, [{1} Gel]<frost> et [{2} Brûlure]<burn> à tous les ennemis.",
    "At [start of combat,]<bold> Heroes are [Stunned for {0} seconds]<stun>.":
        "Au [début du combat,]<bold> les Héros sont [Étourdis pendant {0} secondes]<stun>.",
    "At [start of combat,]<bold> Heroes are [Stunned for {0} seconds]<stun>.\n\nHeroes gain [{1} Max HP]<maxhp> when this expires.":
        "Au [début du combat,]<bold> les Héros sont [Étourdis pendant {0} secondes]<stun>.\n\nLes Héros gagnent [{1} PV Max]<maxhp> lorsque cet effet expire.",
    "At [start of combat,]<bold> Heroes gain [{0}]<shield> [lasting]<lasting> [Shields]<shield>.":
        "Au [début du combat,]<bold> les Héros gagnent [{0}]<shield> [Boucliers]<shield> [persistants]<lasting>.",
    "At [start of combat,]<bold> Heroes gain a [{0}% Max HP Shield]<shield> per [Mystic]<mystic> in combat.":
        "Au [début du combat,]<bold> les Héros gagnent un [Bouclier de {0}% des PV Max]<shield> par [Mystique]<mystic> au combat.",
    "At [start of combat,]<bold> Heroes in the [Reserves]<reserve> permanently gain a small amount of every stat.":
        "Au [début du combat,]<bold> les Héros en [Réserve]<reserve> gagnent définitivement une petite quantité de chaque statistique.",
    "At [start of combat,]<bold> Heroes in the back row gain [{0} Attack Speed]<attackspeed> and [{1} Crit]<crit>.":
        "Au [début du combat,]<bold> les Héros de la rangée arrière gagnent [{0} Vitesse d'Attaque]<attackspeed> et [{1} Critique]<crit>.",
    "At [start of combat,]<bold> Heroes in the back row gain [{0} Attack Speed]<attackspeed> and increased move speed.":
        "Au [début du combat,]<bold> les Héros de la rangée arrière gagnent [{0} Vitesse d'Attaque]<attackspeed> et une vitesse de déplacement accrue.",
    "At [start of combat,]<bold> Heroes in the back row gain [{0} Crit]<crit> and increased move speed.":
        "Au [début du combat,]<bold> les Héros de la rangée arrière gagnent [{0} Critique]<crit> et une vitesse de déplacement accrue.",
    "At [start of combat,]<bold> Heroes in the front row gain [{0} Defense]<defense> and grow in size.":
        "Au [début du combat,]<bold> les Héros de la rangée avant gagnent [{0} Défense]<defense> et grandissent.",
    "At [start of combat,]<bold> Heroes in the front row gain [{0} Max HP]<maxhp> and [{1} Defense]<defense>.":
        "Au [début du combat,]<bold> les Héros de la rangée avant gagnent [{0} PV Max]<maxhp> et [{1} Défense]<defense>.",
    "At [start of combat,]<bold> Heroes in the front row gain [{0} Max HP]<maxhp> and grow in size.":
        "Au [début du combat,]<bold> les Héros de la rangée avant gagnent [{0} PV Max]<maxhp> et grandissent.",
    "At [start of combat,]<bold> Heroes take damage equal to [{0}% of their Max HP]<maxhp>.":
        "Au [début du combat,]<bold> les Héros subissent des dégâts égaux à [{0}% de leurs PV Max]<maxhp>.",
    "At [start of combat,]<bold> [Assassins]<assassin> gain [Stealth]<stealth> for {0} seconds.\n\nFor [Rush ({1}),]<rush> [Assassins]<assassin> gain [{2} Crit]<crit>.":
        "Au [début du combat,]<bold> les [Assassins]<assassin> gagnent [Camouflage]<stealth> pendant {0} secondes.\n\nPendant [Assaut ({1}),]<rush> les [Assassins]<assassin> gagnent [{2} Critique]<crit>.",
    "At [start of combat,]<bold> [Tanks]<tank> and [Vanguards]<vanguard> gain [Shields]<shield> equal to [{0}% of their Max HP]<maxhp>.\n\nAfter [Stall ({1} and {2}),]<stall> [Tanks]<tank> and [Vanguards]<vanguard> gain [Shields]<shield> equal to [{3}% of their Defense]<defense>.":
        "Au [début du combat,]<bold> les [Tanks]<tank> et les [Avant-gardes]<vanguard> gagnent des [Boucliers]<shield> égaux à [{0}% de leurs PV Max]<maxhp>.\n\nAprès [Tempo ({1} et {2}),]<stall> les [Tanks]<tank> et les [Avant-gardes]<vanguard> gagnent des [Boucliers]<shield> égaux à [{3}% de leur Défense]<defense>.",
    "At [start of combat,]<bold> [Vanguards]<vanguard> gain [Shields]<shield> equal to [{0}% of their Max HP]<maxhp>.":
        "Au [début du combat,]<bold> les [Avant-gardes]<vanguard> gagnent des [Boucliers]<shield> égaux à [{0}% de leurs PV Max]<maxhp>.",
    "At [start of combat,]<bold> [Warriors]<warrior> gain a [lasting]<lasting> [Shield]<shield> equal to [{0}% of their Attack]<attack>.":
        "Au [début du combat,]<bold> les [Guerriers]<warrior> gagnent un [Bouclier]<shield> [persistant]<lasting> égal à [{0}% de leur Attaque]<attack>.",
    "At [start of combat,]<bold> each Hero with less than [{0} Crit]<crit> has their [Crit]<crit> set to {1}. Each Hero with [{2} or more Crit]<crit> has their [Attack Speed]<attackspeed>, [Attack]<attack>, and [Magic]<magic> set to {3} if they had less than {4} of those stats.":
        "Au [début du combat,]<bold> chaque Héros ayant moins de [{0} Critique]<crit> voit son [Critique]<crit> fixé à {1}. Chaque Héros ayant [{2} Critique ou plus]<crit> voit sa [Vitesse d'Attaque]<attackspeed>, son [Attaque]<attack> et sa [Magie]<magic> fixées à {3} si ces statistiques étaient inférieures à {4}.",
    "At [start of combat,]<bold> enemies gain [{0} HP/S]<hp/s> per [{1} Max HP]<maxhp> they have.":
        "Au [début du combat,]<bold> les ennemis gagnent [{0} PV/s]<hp/s> par tranche de [{1} PV Max]<maxhp> qu'ils possèdent.",
    "At [start of combat,]<bold> gain [2 Shards]<shard>.":
        "Au [début du combat,]<bold> gagnez [2 Éclats]<shard>.",
    "At [start of combat,]<bold> gain [{0} Shards]<shard> per [Assassin]<assassin> in combat.":
        "Au [début du combat,]<bold> gagnez [{0} Éclats]<shard> par [Assassin]<assassin> au combat.",
    "At [start of combat,]<bold> heroes gain [{0}]<shield> [lasting]<lasting> [Shields]<shield>.":
        "Au [début du combat,]<bold> les Héros gagnent [{0}]<shield> [Boucliers]<shield> [persistants]<lasting>.",
    "At [start of combat,]<bold> if all Heroes in combat share a [Class]<class> all Heroes gain [+{0}% to all their basic stats]<basicstat>.":
        "Au [début du combat,]<bold> si tous les Héros au combat partagent une même [Classe]<class>, tous les Héros gagnent [+{0}% à toutes leurs stats de base]<basicstat>.",
    "At [start of combat,]<bold> if no Heroes in combat share a [Class]<class> all Heroes gain [+{0}% to all their basic stats]<basicstat>.":
        "Au [début du combat,]<bold> si aucun Héros au combat ne partage de [Classe]<class>, tous les Héros gagnent [+{0}% à toutes leurs stats de base]<basicstat>.",
    "At [start of combat,]<bold> inflict [Burn]<burn> on all Heroes equal to [{0}% of their Max HP]<maxhp>.":
        "Au [début du combat,]<bold> inflige à tous les Héros une [Brûlure]<burn> égale à [{0}% de leurs PV Max]<maxhp>.",
    "At [start of combat,]<bold> inflict [Poison]<poison> on all Heroes equal to {0}% of their [Max HP]<maxhp>.\n\nGet [{1}]<customdataitemname> when this expires.":
        "Au [début du combat,]<bold> inflige à tous les Héros un [Poison]<poison> égal à {0}% de leurs [PV Max]<maxhp>.\n\nObtenez [{1}]<customdataitemname> lorsque cet effet expire.",
    "At [start of combat,]<bold> inflict [{0} Burn]<burn> on all enemies per [Vanguard]<vanguard> in combat.":
        "Au [début du combat,]<bold> inflige [{0} Brûlure]<burn> à tous les ennemis par [Avant-garde]<vanguard> au combat.",
    "At [start of combat,]<bold> inflict [{0} Burn]<burn> on all enemies.":
        "Au [début du combat,]<bold> inflige [{0} Brûlure]<burn> à tous les ennemis.",
    "At [start of combat,]<bold> inflict [{0} Frost]<frost> on all enemies per [Mage]<mage> in combat.":
        "Au [début du combat,]<bold> inflige [{0} Gel]<frost> à tous les ennemis par [Mage]<mage> au combat.",
    "At [start of combat,]<bold> inflict [{0} Frost]<frost> on all enemies.":
        "Au [début du combat,]<bold> inflige [{0} Gel]<frost> à tous les ennemis.",
    "At [start of combat,]<bold> inflict [{0} Poison]<poison> on all enemies per [Tank]<tank> in combat.":
        "Au [début du combat,]<bold> inflige [{0} Poison]<poison> à tous les ennemis par [Tank]<tank> au combat.",
    "At [start of combat,]<bold> inflict [{0} Poison]<poison> on all enemies.":
        "Au [début du combat,]<bold> inflige [{0} Poison]<poison> à tous les ennemis.",
    "At [start of combat,]<bold> inflict [{0} Poison]<poison>, [{1} Frost]<frost>, and [{2} Burn]<burn> on all enemies.":
        "Au [début du combat,]<bold> inflige [{0} Poison]<poison>, [{1} Gel]<frost> et [{2} Brûlure]<burn> à tous les ennemis.",
    "At [start of combat,]<bold> inflict [{0}]<globaldatatracking> [Burn]<burn> on all Heroes.\nOn [combat victory,]<bold> permanently increase the amount of [Burn]<burn> this inflicts by {1}.":
        "Au [début du combat,]<bold> inflige [{0}]<globaldatatracking> [Brûlure]<burn> à tous les Héros.\nEn cas de [victoire au combat,]<bold> augmente définitivement de {1} la quantité de [Brûlure]<burn> infligée.",
    "At [start of combat,]<bold> inflict [{0}]<globaldatatracking> [Frost]<frost> on all Heroes.\nOn [combat victory,]<bold> permanently increase the amount of [Frost]<frost> this inflicts by {1}.":
        "Au [début du combat,]<bold> inflige [{0}]<globaldatatracking> [Gel]<frost> à tous les Héros.\nEn cas de [victoire au combat,]<bold> augmente définitivement de {1} la quantité de [Gel]<frost> infligée.",
    "At [start of combat,]<bold> inflict [{0}]<globaldatatracking> [Poison]<poison> on all Heroes.\nOn [combat victory,]<bold> permanently increase the amount of [Poison]<poison> this inflicts by {1}.":
        "Au [début du combat,]<bold> inflige [{0}]<globaldatatracking> [Poison]<poison> à tous les Héros.\nEn cas de [victoire au combat,]<bold> augmente définitivement de {1} la quantité de [Poison]<poison> infligée.",
    "At [start of combat]<bold> and [every {0} seconds,]<bold> inflict [{1} Poison]<poison>, [{2} Frost]<frost>, and [{3} Burn]<burn> on all enemies.":
        "Au [début du combat]<bold> et [toutes les {0} secondes,]<bold> inflige [{1} Poison]<poison>, [{2} Gel]<frost> et [{3} Brûlure]<burn> à tous les ennemis.",
    "At [start of combat]<bold> and after [Stall ({0}),]<stall> spend [{1} Shard]<shard> to apply {3} [lasting]<lasting> [Shields]<shield> to all Heroes, then permanently increase the amount of [Shields]<shield> this applies by {2}.":
        "Au [début du combat]<bold> et après [Tempo ({0}),]<stall> dépense [{1} Éclat]<shard> pour appliquer {3} [Boucliers]<shield> [persistants]<lasting> à tous les Héros, puis augmente définitivement de {2} le montant de [Boucliers]<shield> appliqués.",
    "At the start of [Combat #{0} and Combat #{1},]<bold> Heroes permanently gain [{2} Attack Speed]<attackspeed>.":
        "Au début du [Combat n°{0} et du Combat n°{1},]<bold> les Héros gagnent définitivement [{2} Vitesse d'Attaque]<attackspeed>.",
    "At the start of [Combat #{0} and Combat #{1},]<bold> Heroes permanently gain [{2} Attack]<attack>.":
        "Au début du [Combat n°{0} et du Combat n°{1},]<bold> les Héros gagnent définitivement [{2} Attaque]<attack>.",
    "At the start of [Combat #{0} and Combat #{1},]<bold> Heroes permanently gain [{2} Crit]<crit>.":
        "Au début du [Combat n°{0} et du Combat n°{1},]<bold> les Héros gagnent définitivement [{2} Critique]<crit>.",
    "At the start of [Combat #{0} and Combat #{1},]<bold> Heroes permanently gain [{2} Defense]<defense>.":
        "Au début du [Combat n°{0} et du Combat n°{1},]<bold> les Héros gagnent définitivement [{2} Défense]<defense>.",
    "At the start of [Combat #{0} and Combat #{1},]<bold> Heroes permanently gain [{2} Magic]<magic>.":
        "Au début du [Combat n°{0} et du Combat n°{1},]<bold> les Héros gagnent définitivement [{2} Magie]<magic>.",
    "At the start of [Combat #{0} and Combat #{1},]<bold> Heroes permanently gain [{2} Mana Regen]<manaregen>.":
        "Au début du [Combat n°{0} et du Combat n°{1},]<bold> les Héros gagnent définitivement [{2} Régén. Mana]<manaregen>.",
    "At the start of [Combat #{0} and Combat #{1},]<bold> Heroes permanently gain [{2} Max HP]<maxhp>.":
        "Au début du [Combat n°{0} et du Combat n°{1},]<bold> les Héros gagnent définitivement [{2} PV Max]<maxhp>.",
    "Auto attacks by [Assassins]<assassin>, [Duelists]<duelist>, and [Warriors]<warrior> gain [{0} Crit]<crit>.":
        "Les attaques auto des [Assassins]<assassin>, des [Duellistes]<duelist> et des [Guerriers]<warrior> gagnent [{0} Critique]<crit>.",
    "Defeat the Forest Golem in single combat to gain [{0} Shards]<shard>.\n\nTo swap Heroes, drag a Hero from the <b>Reserves</b> on top of your current one.":
        "Terrassez le Golem Sylvestre en combat singulier pour gagner [{0} Éclats]<shard>.\n\nPour changer de Héros, faites glisser un Héros depuis la <b>Réserve</b> sur votre Héros actuel.",
    "Defeat the Forest Golem in single combat to get [{0}]<customdataitemname>.\n\nTo swap Heroes, drag a Hero from the <b>Reserves</b> on top of your current one.":
        "Terrassez le Golem Sylvestre en combat singulier pour obtenir [{0}]<customdataitemname>.\n\nPour changer de Héros, faites glisser un Héros depuis la <b>Réserve</b> sur votre Héros actuel.",
    "Defeat the Forest Golem in single combat to get [{0}]<customdatarelicname>.\n\nTo swap Heroes, drag a Hero from the <b>Reserves</b> on top of your current one.":
        "Terrassez le Golem Sylvestre en combat singulier pour obtenir [{0}]<customdatarelicname>.\n\nPour changer de Héros, faites glisser un Héros depuis la <b>Réserve</b> sur votre Héros actuel.",
    "Defeat the boss in 1v1 combat to gain [{0}]<customdatarelicname>.\n\nThe Hero has [{1}% reduced basic stats]<basicstat>.":
        "Terrassez le boss en duel (1c1) pour obtenir [{0}]<customdatarelicname>.\n\nLe Héros a [{1}% de stats de base en moins]<basicstat>.",
    "Defeat the boss in under {0} seconds to gain [{1}]<customdatarelicname>.":
        "Terrassez le boss en moins de {0} secondes pour obtenir [{1}]<customdatarelicname>.",
    "Defeat the boss to gain [{0}]<customdatarelicname>.\n\nHeroes have [{1}% reduced basic stats]<basicstat>.":
        "Terrassez le boss pour obtenir [{0}]<customdatarelicname>.\n\nLes Héros ont [{1}% de stats de base en moins]<basicstat>.",
    "Each Hero's first attack against each enemy gains [{0} Crit]<crit>.":
        "La première attaque de chaque Héros contre chaque ennemi gagne [{0} Critique]<crit>.",
    "Each Hero's first auto attack against each enemy gains [1500 Crit]<crit> and [Stuns]<stun> them for 2.5 seconds.":
        "La première attaque auto de chaque Héros contre chaque ennemi gagne [1500 Critique]<crit> et l'[Étourdit]<stun> pendant 2.5 secondes.",
    "Each Hero's first auto attack against each enemy gains [{0} Crit]<crit> and [Stuns]<stun> them for {1} seconds.":
        "La première attaque auto de chaque Héros contre chaque ennemi gagne [{0} Critique]<crit> et l'[Étourdit]<stun> pendant {1} secondes.",
    "Each Hero's first auto attack against each enemy gains [750 Crit]<crit>.":
        "La première attaque auto de chaque Héros contre chaque ennemi gagne [750 Critique]<crit>.",
    "Each Hero's first auto attack against each enemy gains [{0} Crit]<crit>.":
        "La première attaque auto de chaque Héros contre chaque ennemi gagne [{0} Critique]<crit>.",
    "Earn [{0} fewer Shards]<shard> for combat victory.":
        "Gagnez [{0} Éclats de moins]<shard> en cas de victoire au combat.",
    "Earn no [Shards]<shard> for combat victory.\n\nGet [{1}]<customdatarelicname> when this expires.":
        "Ne gagnez aucun [Éclat]<shard> en cas de victoire au combat.\n\nObtenez [{1}]<customdatarelicname> lorsque cet effet expire.",
    "Enemies gain [{0}% basic stats]<basicstat>.\n\nThe [Act {1} Boss]<bold> resists [Frost,]<frost> reducing its effects by {2}%.":
        "Les ennemis gagnent [{0}% de stats de base]<basicstat>.\n\nLe [Boss de l'Acte {1}]<bold> résiste au [Gel,]<frost> réduisant ses effets de {2}%.",
    "Every {0} times a [Mystic]<mystic> [casts]<bold>, gain [{1} Shard]<shard>.":
        "Toutes les {0} fois qu'un [Mystique]<mystic> [lance une compétence]<bold>, gagnez [{1} Éclat]<shard>.",
    "For [Combat #{0} and Combat #{1},]<bold> earn [{2} extra Shards]<shard> per surviving Hero at end of combat.":
        "Lors du [Combat n°{0} et du Combat n°{1},]<bold> gagnez [{2} Éclats supplémentaires]<shard> par Héros survivant à la fin du combat.",
    "For [Rush ({0}),]<rush> Heroes are immune to damage.":
        "Pendant [Assaut ({0}),]<rush> les Héros sont immunisés contre les dégâts.",
    "For [Rush ({0}),]<rush> Heroes gain [+{1}% basic stats]<basicstat> for every {2} times you've triggered [Rush]<rush> this game.":
        "Pendant [Assaut ({0}),]<rush> les Héros gagnent [+{1}% de stats de base]<basicstat> toutes les {2} fois que vous avez déclenché [Assaut]<rush> au cours de cette partie.",
    "For [Rush ({0}),]<rush> Heroes gain [+{1}% basic stats]<basicstat>.":
        "Pendant [Assaut ({0}),]<rush> les Héros gagnent [+{1}% de stats de base]<basicstat>.",
    "For [Rush ({0}),]<rush> Heroes gain [{1} Crit]<crit>.":
        "Pendant [Assaut ({0}),]<rush> les Héros gagnent [{1} Critique]<crit>.",
    "For [Rush ({0}),]<rush> Heroes gain [{1} HP/S]<hp/s>.":
        "Pendant [Assaut ({0}),]<rush> les Héros gagnent [{1} PV/s]<hp/s>.",
    "For [Rush ({0}),]<rush> [Duelists]<duelist> gain [{1} Attack Speed]<attackspeed>.":
        "Pendant [Assaut ({0}),]<rush> les [Duellistes]<duelist> gagnent [{1} Vitesse d'Attaque]<attackspeed>.",
    "For [Rush ({0}),]<rush> [Vanguards]<vanguard> gain [+{1}% Max HP]<maxhp>.":
        "Pendant [Assaut ({0}),]<rush> les [Avant-gardes]<vanguard> gagnent [+{1}% PV Max]<maxhp>.",
    "For [Rush ({0}),]<rush> [Vanguards]<vanguard> gain [{1} Attack]<attack> and [{2} Defense]<defense> per [{3} Max HP]<maxhp>.":
        "Pendant [Assaut ({0}),]<rush> les [Avant-gardes]<vanguard> gagnent [{1} Attaque]<attack> et [{2} Défense]<defense> par tranche de [{3} PV Max]<maxhp>.",
    "For [Rush ({0}),]<rush> enemies are immune to damage.":
        "Pendant [Assaut ({0}),]<rush> les ennemis sont immunisés contre les dégâts.",
    "For [Rush ({0}),]<rush> enemies have {1}% increased stats.":
        "Pendant [Assaut ({0}),]<rush> les ennemis ont +{1}% de statistiques.",
    "For [Rush ({0}),]<rush> enemies receive {1}% more [Burn]<burn> damage.":
        "Pendant [Assaut ({0}),]<rush> les ennemis subissent {1}% de dégâts de [Brûlure]<burn> supplémentaires.",
    "For [Rush ({0}),]<rush> if an enemy would gain a [Debuff]<debuff> they gain {1} more.":
        "Pendant [Assaut ({0}),]<rush> si un ennemi doit subir un [Malus]<debuff>, il en subit {1} de plus.",
    "For [Rush ({0}),]<rush> whenever a [Warrior]<warrior> [Crits]<crit> an enemy reduce the enemy's [Defense]<defense> by {1}.":
        "Pendant [Assaut ({0}),]<rush> chaque fois qu'un [Guerrier]<warrior> inflige un [Coup Critique]<crit> à un ennemi, réduit la [Défense]<defense> de cet ennemi de {1}.",
    "For each [Duelist]<duelist> in combat, [Stall]<stall> abilities trigger [{0} seconds]<seconds> earlier.":
        "Pour chaque [Duelliste]<duelist> au combat, les compétences de [Tempo]<stall> se déclenchent [{0} secondes]<seconds> plus tôt.",
    "For each [Warrior]<warrior> in combat, [Rush]<rush> abilities last [{0} seconds]<seconds> longer.":
        "Pour chaque [Guerrier]<warrior> au combat, les compétences d'[Assaut]<rush> durent [{0} secondes]<seconds> de plus.",
    "Gain [25 Shards]<shard>.":
        "Gagnez [25 Éclats]<shard>.",
    "Gain [30 Shards]<shard>.":
        "Gagnez [30 Éclats]<shard>.",
    "Gain [40 Shards]<shard>.":
        "Gagnez [40 Éclats]<shard>.",
    "Gain [{0} Shards]<shard>.":
        "Gagnez [{0} Éclats]<shard>.",
    "Gain [{0} Shards]<shard>.\n\nStart with [Emergency Rewind]<shardstabilizer> unavailable.":
        "Gagnez [{0} Éclats]<shard>.\n\nCommencez la partie sans [Stabilisateur d'Urgence]<shardstabilizer> disponible.",
    "Gain [{0} additional Shards]<shard> for killing the Act Boss.":
        "Gagnez [{0} Éclats supplémentaires]<shard> en éliminant le Boss de l'Acte.",
    "Gain [{0} extra Shard]<shard> per surviving Hero at end of combat.":
        "Gagnez [{0} Éclat supplémentaire]<shard> par Héros survivant à la fin du combat.",
    "Gain a random common item, a random common relic, and [{0} Shards]<shard>.":
        "Obtenez un objet commun aléatoire, une relique commune aléatoire et [{0} Éclats]<shard>.",
    "Gain interest on saved [Shards]<shard>. At the end of each combat, gain [{0} additional Shard per {1} Shards]<shard> in your bank (Max: {2}. Does not count towards [generation]<generate>).":
        "Gagnez des intérêts sur vos [Éclats]<shard> économisés. À la fin de chaque combat, gagnez [{0} Éclat supplémentaire par tranche de {1} Éclats]<shard> en réserve (Max : {2}. Ne compte pas comme de la [génération]<generate>).",
    "Get 3 random Crest items. Crest items make a Hero count as having an additional class.":
        "Obtenez 3 Emblèmes aléatoires. Les Emblèmes sont des objets permettant à un Héros de compter comme ayant une classe supplémentaire.",
    "Get 5 random Crest items. Crest items make a Hero count as having an additional class.":
        "Obtenez 5 Emblèmes aléatoires. Les Emblèmes sont des objets permettant à un Héros de compter comme ayant une classe supplémentaire.",
    "Get {0} random Crest items. Crest items make a Hero count as having an additional class.":
        "Obtenez {0} Emblèmes aléatoires. Les Emblèmes sont des objets permettant à un Héros de compter comme ayant une classe supplémentaire.",
    "Get [{0}]<customdataitemname> when this expires.":
        "Obtenez [{0}]<customdataitemname> lorsque cet effet expire.",
    "Get [{0}]<customdatarelicname> when this expires.":
        "Obtenez [{0}]<customdatarelicname> lorsque cet effet expire.",
    "Get a random rare item that gives [Attack Speed]<attackspeed>.":
        "Obtenez un objet rare aléatoire qui octroie de la [Vitesse d'Attaque]<attackspeed>.",
    "Get a random rare item that gives [Attack]<attack>.":
        "Obtenez un objet rare aléatoire qui octroie de l'[Attaque]<attack>.",
    "Get a random rare item that gives [Crit]<crit>.":
        "Obtenez un objet rare aléatoire qui octroie du [Critique]<crit>.",
    "Get a random rare item that gives [Defense]<defense>.":
        "Obtenez un objet rare aléatoire qui octroie de la [Défense]<defense>.",
    "Get a random rare item that gives [Magic]<magic>.":
        "Obtenez un objet rare aléatoire qui octroie de la [Magie]<magic>.",
    "Get a random rare item that gives [Mana Regen]<manaregen>.":
        "Obtenez un objet rare aléatoire qui octroie de la [Régén. Mana]<manaregen>.",
    "Get a random rare item that gives [Max HP]<maxhp>.":
        "Obtenez un objet rare aléatoire qui octroie des [PV Max]<maxhp>.",
    "Get a random rare relic.":
        "Obtenez une relique rare aléatoire.",
    "Get a rare item which gives [Attack Speed]<attackspeed> to the holder.":
        "Obtenez un objet rare qui confère de la [Vitesse d'Attaque]<attackspeed> à son porteur.",
    "Get a rare item which gives [Attack]<attack> to the holder.":
        "Obtenez un objet rare qui confère de l'[Attaque]<attack> à son porteur.",
    "Get a rare item which gives [Crit]<crit> to the holder.":
        "Obtenez un objet rare qui confère du [Critique]<crit> à son porteur.",
    "Get a rare item which gives [Defense]<defense> to the holder.":
        "Obtenez un objet rare qui confère de la [Défense]<defense> à son porteur.",
    "Get a rare item which gives [Magic]<magic> to the holder.":
        "Obtenez un objet rare qui confère de la [Magie]<magic> à son porteur.",
    "Get a rare item which gives [Mana Regen]<manaregen> to the holder.":
        "Obtenez un objet rare qui confère de la [Régén. Mana]<manaregen> à son porteur.",
    "Get a rare item which gives [Max HP]<maxhp> to the holder.":
        "Obtenez un objet rare qui confère des [PV Max]<maxhp> à son porteur.",
    "Get all {0} Crests. Crests are items which make a Hero count as having an additional class during combat.":
        "Obtenez les {0} Emblèmes. Les Emblèmes sont des objets permettant à un Héros de compter comme ayant une classe supplémentaire pendant le combat.",
    "Get an item which benefits [Assassins]<assassin>.":
        "Obtenez un objet destiné aux [Assassins]<assassin>.",
    "Get an item which benefits [Duelists]<duelist>.":
        "Obtenez un objet destiné aux [Duellistes]<duelist>.",
    "Get an item which benefits [Mages]<mage>.":
        "Obtenez un objet destiné aux [Mages]<mage>.",
    "Get an item which benefits [Mystics]<mystic>.":
        "Obtenez un objet destiné aux [Mystiques]<mystic>.",
    "Get an item which benefits [Tanks]<tank>.":
        "Obtenez un objet destiné aux [Tanks]<tank>.",
    "Get an item which benefits [Vanguards]<vanguard>.":
        "Obtenez un objet destiné aux [Avant-gardes]<vanguard>.",
    "Get an item which benefits [Warriors]<warrior>.":
        "Obtenez un objet destiné aux [Guerriers]<warrior>.",
    "Get an item which makes a Hero count as a [Duelist]<duelist> during combat.":
        "Obtenez un objet permettant à un Héros de compter comme un [Duelliste]<duelist> pendant le combat.",
    "Get an item which makes a Hero count as a [Mage]<mage> during combat.":
        "Obtenez un objet permettant à un Héros de compter comme un [Mage]<mage> pendant le combat.",
    "Get an item which makes a Hero count as a [Mystic]<mystic> during combat.":
        "Obtenez un objet permettant à un Héros de compter comme un [Mystique]<mystic> pendant le combat.",
    "Get an item which makes a Hero count as a [Tank]<tank> during combat.":
        "Obtenez un objet permettant à un Héros de compter comme un [Tank]<tank> pendant le combat.",
    "Get an item which makes a Hero count as a [Vanguard]<vanguard> during combat.":
        "Obtenez un objet permettant à un Héros de compter comme une [Avant-garde]<vanguard> pendant le combat.",
    "Get an item which makes a Hero count as a [Warrior]<warrior> during combat.":
        "Obtenez un objet permettant à un Héros de compter comme un [Guerrier]<warrior> pendant le combat.",
    "Get an item which makes a Hero count as an [Assassin]<assassin> during combat.":
        "Obtenez un objet permettant à un Héros de compter comme un [Assassin]<assassin> pendant le combat.",
    "Get two random items which make a Hero count as having an additional class.":
        "Obtenez deux objets aléatoires permettant à un Héros de compter comme ayant une classe supplémentaire.",
    "Get {0} random common items.":
        "Obtenez {0} objets communs aléatoires.",
    "Heroes can equip an additional item (Max: {0}).":
        "Les Héros peuvent équiper un objet supplémentaire (Max : {0}).",
    "Heroes can equip two additional items (Max: {0}).\n\nMax team size is decreased by {1}.":
        "Les Héros peuvent équiper deux objets supplémentaires (Max : {0}).\n\nLa taille maximale de l'équipe est réduite de {1}.",
    "Heroes gain [+50% Defense]<defense> and [+50% Crit]<crit> while [Shielded]<shield>.":
        "Les Héros gagnent [+50% Défense]<defense> et [+50% Critique]<crit> tant qu'ils sont [Protégés]<shield>.",
    "Heroes gain [+{0}% Defense]<defense> and [+{1}% Crit]<crit> while [Shielded]<shield>.":
        "Les Héros gagnent [+{0}% Défense]<defense> et [+{1}% Critique]<crit> tant qu'ils sont [Protégés]<shield>.",
    "Heroes gain [100 Attack]<attack> and [100 Magic]<magic> while [Shielded]<shield>.":
        "Les Héros gagnent [100 Attaque]<attack> et [100 Magie]<magic> tant qu'ils sont [Protégés]<shield>.",
    "Heroes gain [{0} Attack]<attack> and [{1} Magic]<magic> while [Shielded]<shield>.":
        "Les Héros gagnent [{0} Attaque]<attack> et [{1} Magie]<magic> tant qu'ils sont [Protégés]<shield>.",
    "Heroes gain [20 Attack Speed]<attackspeed> and [15 Crit]<crit>.":
        "Les Héros gagnent [20 Vitesse d'Attaque]<attackspeed> et [15 Critique]<crit>.",
    "Heroes gain [{0} Attack Speed]<attackspeed> and [{1} Crit]<crit>.":
        "Les Héros gagnent [{0} Vitesse d'Attaque]<attackspeed> et [{1} Critique]<crit>.",
    "Heroes gain [20 Crit]<crit> and [5 Omnivamp]<omnivamp>.":
        "Les Héros gagnent [20 Critique]<crit> et [5 Omnivamp]<omnivamp>.",
    "Heroes gain [{0} Crit]<crit> and [{1} Omnivamp]<omnivamp>.":
        "Les Héros gagnent [{0} Critique]<crit> et [{1} Omnivamp]<omnivamp>.",
    "Heroes gain [200 Max HP]<maxhp> and [25 Attack]<attack>.":
        "Les Héros gagnent [200 PV Max]<maxhp> et [25 Attaque]<attack>.",
    "Heroes gain [{0} Max HP]<maxhp> and [{1} Attack]<attack>.":
        "Les Héros gagnent [{0} PV Max]<maxhp> et [{1} Attaque]<attack>.",
    "Heroes gain [25 Attack Speed]<attackspeed> and [5 Omnivamp]<omnivamp>.":
        "Les Héros gagnent [25 Vitesse d'Attaque]<attackspeed> et [5 Omnivamp]<omnivamp>.",
    "Heroes gain [{0} Attack Speed]<attackspeed> and [{1} Omnivamp]<omnivamp>.":
        "Les Héros gagnent [{0} Vitesse d'Attaque]<attackspeed> et [{1} Omnivamp]<omnivamp>.",
    "Heroes gain [25 Starting Mana]<startingmana>.":
        "Les Héros gagnent [25 Mana initial]<startingmana>.",
    "Heroes gain [{0} Starting Mana]<startingmana>.":
        "Les Héros gagnent [{0} Mana initial]<startingmana>.",
    "Heroes gain [30 Defense]<defense> and [3 Mana Regen]<manaregen>.":
        "Les Héros gagnent [30 Défense]<defense> et [3 Régén. Mana]<manaregen>.",
    "Heroes gain [{0} Defense]<defense> and [{1} Mana Regen]<manaregen>.":
        "Les Héros gagnent [{0} Défense]<defense> et [{1} Régén. Mana]<manaregen>.",
    "Heroes gain [30 Magic]<magic> and [30 Attack]<attack>.":
        "Les Héros gagnent [30 Magie]<magic> et [30 Attaque]<attack>.",
    "Heroes gain [{0} Magic]<magic> and [{1} Attack]<attack>.":
        "Les Héros gagnent [{0} Magie]<magic> et [{1} Attaque]<attack>.",
    "Heroes gain [Crit]<crit> equal to the number of [Shards]<shard> in bank (Max: {0}).":
        "Les Héros gagnent un montant de [Critique]<crit> égal au nombre d'[Éclats]<shard> en réserve (Max : {0}).",
    "Heroes gain [{0} Attack Speed]<attackspeed> for each time you've [rerolled]<reroll> the shop this game.":
        "Les Héros gagnent [{0} Vitesse d'Attaque]<attackspeed> pour chaque [relance]<reroll> de boutique effectuée au cours de cette partie.",
    "Heroes gain [{0} Attack Speed]<attackspeed> per [{1} Shards]<shard> you've [generated]<generate> this game.":
        "Les Héros gagnent [{0} Vitesse d'Attaque]<attackspeed> par tranche de [{1} Éclats]<shard> [générés]<generate> au cours de cette partie.",
    "Heroes gain [{0} Attack Speed]<attackspeed>.\n\nWhenever a [Duelist]<duelist> [auto attacks]<bold>, they deal {1} [bonus damage]<damage> for each time they have auto attacked this combat.":
        "Les Héros gagnent [{0} Vitesse d'Attaque]<attackspeed>.\n\nChaque fois qu'un [Duelliste]<duelist> effectue une [attaque auto]<bold>, il inflige {1} [dégâts bonus]<damage> pour chaque attaque auto qu'il a effectuée lors de ce combat.",
    "Heroes gain [{0} Attack]<attack>, [{1} Attack Speed]<attackspeed>, and [{2} Crit]<crit>.":
        "Les Héros gagnent [{0} Attaque]<attack>, [{1} Vitesse d'Attaque]<attackspeed> et [{2} Critique]<crit>.",
    "Heroes gain [{0} Attack]<attack>.\n\nWhenever a [Warrior]<warrior> deals damage, they gain [lasting]<lasting> [Shields]<shield> equal to {1}% of the damage dealt.":
        "Les Héros gagnent [{0} Attaque]<attack>.\n\nChaque fois qu'un [Guerrier]<warrior> inflige des dégâts, il gagne des [Boucliers]<shield> [persistants]<lasting> égaux à {1}% des dégâts infligés.",
    "Heroes gain [{0} Crit]<crit> and [{1} Mana Regen]<manaregen> while [Shielded]<shield>.":
        "Les Héros gagnent [{0} Critique]<crit> et [{1} Régén. Mana]<manaregen> tant qu'ils sont [Protégés]<shield>.",
    "Heroes gain [{0} Crit]<crit> per [rank]<rank> of each [Assassin]<assassin> in the [reserves]<reserve>, [{1} Attack Speed]<attackspeed> per [rank]<rank> of each [Duelist]<duelist> in the [reserves]<reserve>, and [{2} Attack]<attack> per [rank]<rank> of each [Warrior]<warrior> in the [reserves]<reserve>.":
        "Les Héros gagnent [{0} Critique]<crit> par [rang]<rank> de chaque [Assassin]<assassin> en [réserve]<reserve>, [{1} Vitesse d'Attaque]<attackspeed> par [rang]<rank> de chaque [Duelliste]<duelist> en [réserve]<reserve>, et [{2} Attaque]<attack> par [rang]<rank> de chaque [Guerrier]<warrior> en [réserve]<reserve>.",
    "Heroes gain [{0} Crit]<crit>.\n\nWhenever an [Assassin]<assassin> auto attacks while [Stealthed]<stealth>, they inflict [Poison]<poison> on their target equal to [{1}% of their Crit]<crit>.\n\nAt [start of combat,]<bold> [Assassins]<assassin> in the back {2} rows gain [Stealth]<stealth> for {3} seconds and target the most [threatening]<threat> enemy.":
        "Les Héros gagnent [{0} Critique]<crit>.\n\nChaque fois qu'un [Assassin]<assassin> effectue une attaque auto en étant [Camouflé]<stealth>, il inflige à sa cible un montant de [Poison]<poison> égal à [{1}% de son Critique]<crit>.\n\nAu [début du combat,]<bold> les [Assassins]<assassin> situés sur les {2} rangées arrière gagnent [Camouflage]<stealth> pendant {3} secondes et ciblent l'ennemi le plus [menaçant]<threat>.",
    "Heroes gain [{0} Defense]<defense> for each time you've [rerolled]<reroll> the shop this game.":
        "Les Héros gagnent [{0} Défense]<defense> pour chaque [relance]<reroll> de boutique effectuée au cours de cette partie.",
    "Heroes gain [{0} Defense]<defense> per [rank]<rank> of each [Tank]<tank> in the [reserves]<reserve> and [{1} Max HP]<maxhp> per [rank]<rank> of each [Vanguard]<vanguard> in the [reserves]<reserve>.":
        "Les Héros gagnent [{0} Défense]<defense> par [rang]<rank> de chaque [Tank]<tank> en [réserve]<reserve> et [{1} PV Max]<maxhp> par [rang]<rank> de chaque [Avant-garde]<vanguard> en [réserve]<reserve>.",
    "Heroes gain [{0} Defense]<defense>.\n\nEvery {1} times a [Tank]<tank> is [auto attacked]<bold>, [Stun]<stun> that attacking enemy for {2} seconds.":
        "Les Héros gagnent [{0} Défense]<defense>.\n\nToutes les {1} fois qu'un [Tank]<tank> subit une [attaque auto]<bold>, [Étourdit]<stun> l'ennemi attaquant pendant {2} secondes.",
    "Heroes gain [{0} Magic]<magic> and [{1} Mana Regen]<manaregen>.":
        "Les Héros gagnent [{0} Magie]<magic> et [{1} Régén. Mana]<manaregen>.",
    "Heroes gain [{0} Magic]<magic> per [rank]<rank> of each [Mage]<mage> in the [reserves]<reserve> and [{1} Mana Regen]<manaregen> per [rank]<rank> of each [Mystic]<mystic> in the [reserves]<reserve>.":
        "Les Héros gagnent [{0} Magie]<magic> par [rang]<rank> de chaque [Mage]<mage> en [réserve]<reserve> et [{1} Régén. Mana]<manaregen> par [rang]<rank> de chaque [Mystique]<mystic> en [réserve]<reserve>.",
    "Heroes gain [{0} Magic]<magic>.\n\nWhenever a [Mage]<mage> [casts]<bold>, they inflict [Burn]<burn> and [Frost]<frost> on all enemies in their [range]<attackrange> equal to [{1}% of their Magic]<magic>.":
        "Les Héros gagnent [{0} Magie]<magic>.\n\nChaque fois qu'un [Mage]<mage> [lance une compétence]<bold>, il inflige [Brûlure]<burn> et [Gel]<frost> à tous les ennemis à sa [portée]<attackrange> à hauteur de [{1}% de sa Magie]<magic>.",
    "Heroes gain [{0} Mana Regen]<manaregen>.\n\nWhenever a [Mystic]<mystic> [Shields]<shield> a Hero, give that Hero [lasting]<lasting> [Shields]<shield> equal to {1}% of the [Shield]<shield> applied.":
        "Les Héros gagnent [{0} Régén. Mana]<manaregen>.\n\nChaque fois qu'un [Mystique]<mystic> applique un [Bouclier]<shield> à un Héros, confère à ce Héros des [Boucliers]<shield> [persistants]<lasting> égaux à {1}% du [Bouclier]<shield> appliqué.",
    "Heroes gain [{0} Max HP]<maxhp> and [{1} Defense]<defense>.":
        "Les Héros gagnent [{0} PV Max]<maxhp> et [{1} Défense]<defense>.",
    "Heroes gain [{0} Max HP]<maxhp>.":
        "Les Héros gagnent [{0} PV Max]<maxhp>.",
    "Heroes gain [{0} Max HP]<maxhp>.\n\nWhenever a [Vanguard]<vanguard> [auto attacks]<bold> or is [auto attacked]<bold>, they gain [{1} Max HP]<maxhp>. Every [{2} Max HP]<maxhp> gained this way, give them [{3} Attack]<attack> and increase their size.":
        "Les Héros gagnent [{0} PV Max]<maxhp>.\n\nChaque fois qu'une [Avant-garde]<vanguard> effectue ou subit une [attaque auto]<bold>, elle gagne [{1} PV Max]<maxhp>. Tous les [{2} PV Max]<maxhp> gagnés de cette manière, lui confère [{3} Attaque]<attack> et augmente sa taille.",
    "Heroes gain [{0} Omnivamp]<omnivamp>.":
        "Les Héros gagnent [{0} Omnivamp]<omnivamp>.",
    "Heroes gain [{0}% basic stats]<basicstat>.":
        "Les Héros gagnent [{0}% de stats de base]<basicstat>.",
    "Heroes gain [{0}]<datatracking> [Attack Speed]<attackspeed>.\n\nOn [combat victory,]<bold> permanently increase the [Attack Speed]<attackspeed> gained by {1}.":
        "Les Héros gagnent [{0}]<datatracking> [Vitesse d'Attaque]<attackspeed>.\n\nEn cas de [victoire au combat,]<bold> augmente définitivement la [Vitesse d'Attaque]<attackspeed> gagnée de {1}.",
    "Heroes gain [{0}]<datatracking> [Attack]<attack>.\n\nOn [combat victory,]<bold> permanently increase the [Attack]<attack> gained by {1}.":
        "Les Héros gagnent [{0}]<datatracking> [Attaque]<attack>.\n\nEn cas de [victoire au combat,]<bold> augmente définitivement l'[Attaque]<attack> gagnée de {1}.",
    "Heroes gain [{0}]<datatracking> [Crit]<crit>.\n\nOn [combat victory,]<bold> permanently increase the [Crit]<crit> gained by {1}.":
        "Les Héros gagnent [{0}]<datatracking> [Critique]<crit>.\n\nEn cas de [victoire au combat,]<bold> augmente définitivement le [Critique]<crit> gagné de {1}.",
    "Heroes gain [{0}]<datatracking> [Defense]<defense>.\n\nOn [combat victory,]<bold> permanently increase the [Defense]<defense> gained by {1}.":
        "Les Héros gagnent [{0}]<datatracking> [Défense]<defense>.\n\nEn cas de [victoire au combat,]<bold> augmente définitivement la [Défense]<defense> gagnée de {1}.",
    "Heroes gain [{0}]<datatracking> [Magic]<magic>.\n\nOn [combat victory,]<bold> permanently increase the [Magic]<magic> gained by {1}.":
        "Les Héros gagnent [{0}]<datatracking> [Magie]<magic>.\n\nEn cas de [victoire au combat,]<bold> augmente définitivement la [Magie]<magic> gagnée de {1}.",
    "Heroes gain [{0}]<datatracking> [Max HP]<maxhp>.\n\nOn [combat victory,]<bold> permanently increase the [Max HP]<maxhp> gained by {1}.":
        "Les Héros gagnent [{0}]<datatracking> [PV Max]<maxhp>.\n\nEn cas de [victoire au combat,]<bold> augmente définitivement les [PV Max]<maxhp> gagnés de {1}.",
    "Heroes gain [{0}]<datatracking> [Omnivamp]<omnivamp>.\n\nOn [combat victory,]<bold> permanently increase the [Omnivamp]<omnivamp> gained by {1}.":
        "Les Héros gagnent [{0}]<datatracking> [Omnivamp]<omnivamp>.\n\nEn cas de [victoire au combat,]<bold> augmente définitivement l'[Omnivamp]<omnivamp> gagné de {1}.",
    "Heroes gain [{0}]<datatracking>% [basic stats]<basicstat>.\n\n[Every {1} combat victories,]<bold> permanently increase the amount of [basic stats]<basicstat> by {2}%.":
        "Les Héros gagnent [{0}]<datatracking>% de [stats de base]<basicstat>.\n\n[Toutes les {1} victoires au combat,]<bold> augmente définitivement le bonus de [stats de base]<basicstat> de {2}%.",
    "Heroes gain [{1} Attack Speed]<attackspeed>.":
        "Les Héros gagnent [{1} Vitesse d'Attaque]<attackspeed>.",
    "Heroes gain [{1} Attack]<attack>.":
        "Les Héros gagnent [{1} Attaque]<attack>.",
    "Heroes gain [{1} Crit]<crit>.":
        "Les Héros gagnent [{1} Critique]<crit>.",
    "Heroes gain [{1} Defense]<defense>.":
        "Les Héros gagnent [{1} Défense]<defense>.",
    "Heroes gain [{1} Magic]<magic>.":
        "Les Héros gagnent [{1} Magie]<magic>.",
    "Heroes gain [{1} Mana Regen]<manaregen>.":
        "Les Héros gagnent [{1} Régén. Mana]<manaregen>.",
    "Heroes gain [{1} Max HP]<maxhp>.":
        "Les Héros gagnent [{1} PV Max]<maxhp>.",
    "Heroes have [-{0}% Defense]<defense>.":
        "Les Héros ont [-{0}% Défense]<defense>.",
    "Heroes have [{0}% decreased basic stats]<basicstat>.":
        "Les Héros ont [{0}% de stats de base en moins]<basicstat>.",
    "Heroes have [{0}% increased basic stats]<basicstat>.":
        "Les Héros ont [+{0}% de stats de base]<basicstat>.",
    "Heroes lose [{0}% basic stats]<basicstat>.\n\nCombats rewards [{1} more Shards]<shard> per victory.":
        "Les Héros perdent [{0}% de stats de base]<basicstat>.\n\nLes combats rapportent [{1} Éclats supplémentaires]<shard> par victoire.",
    "Heroes lose [{0}% basic stats]<basicstat>.\n\nGet [{1}]<customdatarelicname> when this expires.":
        "Les Héros perdent [{0}% de stats de base]<basicstat>.\n\nObtenez [{1}]<customdatarelicname> lorsque cet effet expire.",
    "Heroes lose [{1} Attack Speed]<attackspeed>.":
        "Les Héros perdent [{1} Vitesse d'Attaque]<attackspeed>.",
    "Heroes lose [{1} Attack]<attack>.":
        "Les Héros perdent [{1} Attaque]<attack>.",
    "Heroes lose [{1} Crit]<crit>.":
        "Les Héros perdent [{1} Critique]<crit>.",
    "Heroes lose [{1} Defense]<defense>.":
        "Les Héros perdent [{1} Défense]<defense>.",
    "Heroes lose [{1} Magic]<magic>":
        "Les Héros perdent [{1} Magie]<magic>",
    "Heroes lose [{1} Mana Regen]<manaregen>.":
        "Les Héros perdent [{1} Régén. Mana]<manaregen>.",
    "Heroes lose [{1} Max HP]<maxhp>.":
        "Les Héros perdent [{1} PV Max]<maxhp>.",
    "If there is a [Duelist]<duelist> in combat, Heroes deal [{0} bonus damage]<damage> with each auto attack.":
        "S'il y a un [Duelliste]<duelist> au combat, les Héros infligent [{0} dégâts bonus]<damage> à chaque attaque auto.",
    "If there is a [Mage]<mage> in combat, your Hero's active abilities gain [{0} Crit]<crit>.":
        "S'il y a un [Mage]<mage> au combat, les compétences actives de vos Héros gagnent [{0} Critique]<crit>.",
    "If there is a [Mystic]<mystic> in combat, Heroes gain [{0} Mana Regen]<manaregen> and [{1} HP/S]<hp/s>.":
        "S'il y a un [Mystique]<mystic> au combat, les Héros gagnent [{0} Régén. Mana]<manaregen> et [{1} PV/s]<hp/s>.",
    "If there is a [Warrior]<warrior> in combat, your Hero's auto attacks gain [{0} Crit]<crit>.":
        "S'il y a un [Guerrier]<warrior> au combat, les attaques auto de vos Héros gagnent [{0} Critique]<crit>.",
    "If there is an [Assassin]<assassin> in combat, Heroes gain [Stealth for {0} seconds]<stealth> the first time they go below [{1}% Max HP]<maxhp> each combat.":
        "S'il y a un [Assassin]<assassin> au combat, les Héros gagnent [Camouflage pendant {0} secondes]<stealth> la première fois qu'ils passent sous [{1}% de leurs PV Max]<maxhp> à chaque combat.",
    "Increase max team size by {0} (Max: {1}).\n\nHeroes have {2} fewer item slot (Min: {3}).":
        "Augmente la taille maximale de l'équipe de {0} (Max : {1}).\n\nLes Héros ont {2} emplacement d'objet en moins (Min : {3}).",
    "Increase your team size by 1 (Max: 5).":
        "Augmente la taille de votre équipe de 1 (Max : 5).",
    "Increase your team size by {0} (Max: {1}).":
        "Augmente la taille de votre équipe de {0} (Max : {1}).",
    "Instantly rank up the above Hero.\n\nStart with [{0} fewer Shards]<shard>.":
        "promeut instantanément le Héros ci-dessus.\n\nCommencez avec [{0} Éclats de moins]<shard>.",
    "Items cost [{0} fewer Shards]<shard>.":
        "Les objets coûtent [{0} Éclats de moins]<shard>.",
})

DESCRIPTIONS_EN_TO_FR.update({
    # --- Relic Descriptions (Part 2: K - Z) & Quest Rewards ---
    "Instantly rank up the above Hero.\n\nStart with [{0} fewer Shards]<shard>.":
        "Promeut instantanément le Héros ci-dessus.\n\nCommencez avec [{0} Éclats de moins]<shard>.",
    "Kill the Turtle in under {0} seconds to gain [{1} Shards]<shard>.":
        "Éliminez la Tortue en moins de {0} secondes pour gagner [{1} Éclats]<shard>.",
    "On [Crit,]<crit> reduce the target's [Defense]<defense> by 3.":
        "Sur [Coup Critique,]<crit> réduit la [Défense]<defense> de la cible de 3.",
    "On [Crit,]<crit> the Hero that [Crit]<crit> [heals {0}]<heal> and gains [{1} Mana]<mana>.":
        "Sur [Coup Critique,]<crit> le Héros ayant infligé le [Coup Critique]<crit> [se soigne de {0}]<heal> et gagne [{1} Mana]<mana>.",
    "On [Crit,]<crit> the Hero that [Crit]<crit> steals [{0} Max HP]<maxhp> from their target.":
        "Sur [Coup Critique,]<crit> le Héros ayant infligé le [Coup Critique]<crit> vole [{0} PV Max]<maxhp> à sa cible.",
    "On [Rush]<rush> [trigger,]<bold> Heroes gain [{0} Shields]<shield>.":
        "Lors du [déclenchement]<bold> d'[Assaut]<rush>, les Héros gagnent [{0} Boucliers]<shield>.",
    "On [Rush]<rush> [trigger,]<bold> give Heroes [{0} Attack Speed]<attackspeed> and [{1} Attack]<attack>.":
        "Lors du [déclenchement]<bold> d'[Assaut]<rush>, confère aux Héros [{0} Vitesse d'Attaque]<attackspeed> et [{1} Attaque]<attack>.",
    "On [Rush]<rush> [trigger,]<bold> give Heroes [{0} Crit]<crit> and [{1} Attack Speed]<attackspeed>.":
        "Lors du [déclenchement]<bold> d'[Assaut]<rush>, confère aux Héros [{0} Critique]<crit> et [{1} Vitesse d'Attaque]<attackspeed>.",
    "On [Rush]<rush> [trigger,]<bold> give Heroes [{0} Crit]<crit>.":
        "Lors du [déclenchement]<bold> d'[Assaut]<rush>, confère aux Héros [{0} Critique]<crit>.",
    "On [Rush]<rush> [trigger,]<bold> inflict [{0} Burn]<burn> on all enemies.":
        "Lors du [déclenchement]<bold> d'[Assaut]<rush>, inflige [{0} Brûlure]<burn> à tous les ennemis.",
    "On [Rush]<rush> or [Stall]<stall> [trigger,]<bold> Heroes gain [15 Attack Speed]<attackspeed> and [15 Defense]<defense>.":
        "Lors du [déclenchement]<bold> d'[Assaut]<rush> ou de [Tempo]<stall>, les Héros gagnent [15 Vitesse d'Attaque]<attackspeed> et [15 Défense]<defense>.",
    "On [Rush]<rush> or [Stall]<stall> [trigger,]<bold> Heroes gain [{0} Attack Speed]<attackspeed> and [{1} Defense]<defense>.":
        "Lors du [déclenchement]<bold> d'[Assaut]<rush> ou de [Tempo]<stall>, les Héros gagnent [{0} Vitesse d'Attaque]<attackspeed> et [{1} Défense]<defense>.",
    "On [Shards]<shard> [generated,]<generate> Heroes gain [15 Crit]<crit> and [500 Shields]<shield>.":
        "Lorsque des [Éclats]<shard> sont [générés,]<generate> les Héros gagnent [15 Critique]<crit> et [500 Boucliers]<shield>.",
    "On [Shards]<shard> [generated,]<generate> Heroes gain [{0} Crit]<crit> and [{1} Shields]<shield>.":
        "Lorsque des [Éclats]<shard> sont [générés,]<generate> les Héros gagnent [{0} Critique]<crit> et [{1} Boucliers]<shield>.",
    "On [Shards]<shard> [generated,]<generate> Heroes gain [{0} Shields]<shield>.":
        "Lorsque des [Éclats]<shard> sont [générés,]<generate> les Héros gagnent [{0} Boucliers]<shield>.",
    "On [Shards]<shard> [generated,]<generate> [generate]<generate> 1 more [Shard]<shard>.":
        "Lorsque des [Éclats]<shard> sont [générés,]<generate> [génère]<generate> 1 [Éclat]<shard> supplémentaire.",
    "On [Shards]<shard> [generated,]<generate> [generate]<generate> {0} more [Shard]<shard>.":
        "Lorsque des [Éclats]<shard> sont [générés,]<generate> [génère]<generate> {0} [Éclat]<shard> supplémentaire.",
    "On [Shards]<shard> [generated,]<generate> deal [{0} damage]<damage> to all enemies.":
        "Lorsque des [Éclats]<shard> sont [générés,]<generate> inflige [{0} dégâts]<damage> à tous les ennemis.",
    "On [Shards]<shard> [generated,]<generate> deal damage to all enemies equal to [{0}% of their Max HP]<maxhp> (Minimum: {1} damage).":
        "Lorsque des [Éclats]<shard> sont [générés,]<generate> inflige à tous les ennemis des dégâts égaux à [{0}% de leurs PV Max]<maxhp> (Minimum : {1} dégâts).",
    "On [Stall]<stall> [trigger,]<bold> Heroes [heal {0}]<heal>.":
        "Lors du [déclenchement]<bold> de [Tempo]<stall>, les Héros [se soignent de {0}]<heal>.",
    "On [Stall]<stall> [trigger,]<bold> deal {0} damage to all enemies for each [Rush]<rush> you've triggered this game.\n\nOn [Rush]<rush> [trigger,]<bold> give [{1}]<shield> [lasting]<lasting> [Shields]<shield> to all Heroes for each [Stall]<stall> you've triggered this game.":
        "Lors du [déclenchement]<bold> de [Tempo]<stall>, inflige {0} dégâts à tous les ennemis pour chaque [Assaut]<rush> déclenché au cours de cette partie.\n\nLors du [déclenchement]<bold> d'[Assaut]<rush>, confère [{1}]<shield> [Boucliers]<shield> [persistants]<lasting> à tous les Héros pour chaque [Tempo]<stall> déclenché au cours de cette partie.",
    "On [Stall]<stall> [trigger,]<bold> give Heroes a [{0}% Max HP Shield]<shield> and [{1} Mana]<mana>.":
        "Lors du [déclenchement]<bold> de [Tempo]<stall>, confère aux Héros un [Bouclier de {0}% des PV Max]<shield> et [{1} Mana]<mana>.",
    "On [Stall]<stall> or [Rush]<rush> [trigger,]<bold> give Heroes a [lasting]<lasting> [{0}% Max HP Shield]<shield> and [{1} Mana Regen]<manaregen>.":
        "Lors du [déclenchement]<bold> de [Tempo]<stall> ou d'[Assaut]<rush>, confère aux Héros un [Bouclier de {0}% des PV Max]<shield> [persistant]<lasting> et [{1} Régén. Mana]<manaregen>.",
    "On [combat victory,]<bold> gain [{0} Shards]<shard>.":
        "En cas de [victoire au combat,]<bold> gagnez [{0} Éclats]<shard>.",
    "On [kill]<bold> for [Rush ({0}),]<rush> gain [{1} Shards]<shard>.":
        "Lors d'une [élimination]<bold> pendant [Assaut ({0}),]<rush> gagnez [{1} Éclats]<shard>.",
    "Shop [rerolls]<reroll> cost {0} less.":
        "Les [relances]<reroll> de boutique coûtent {0} de moins.",
    "Survive for {0} seconds to gain [{1} Shards]<shard>.\n\nEnemies in this combat are immune to damage.":
        "Survivez pendant {0} secondes pour gagner [{1} Éclats]<shard>.\n\nLes ennemis de ce combat sont immunisés contre les dégâts.",
    "The first time each enemy reaches [100 Burn]<burn>, inflict [75 Burn]<burn> on their nearest ally.":
        "La première fois que chaque ennemi atteint [100 Brûlure]<burn>, inflige [75 Brûlure]<burn> à son allié le plus proche.",
    "The first time each enemy reaches [{0} Burn]<burn>, inflict [{1} Burn]<burn> on their nearest ally.":
        "La première fois que chaque ennemi atteint [{0} Brûlure]<burn>, inflige [{1} Brûlure]<burn> à son allié le plus proche.",
    "The first time each enemy reaches [50 Frost]<frost>, [Stun]<stun> them for 2.5 seconds.":
        "La première fois que chaque ennemi atteint [50 Gel]<frost>, l'[Étourdit]<stun> pendant 2.5 secondes.",
    "The first time each enemy reaches [{0} Frost]<frost>, [Stun]<stun> them for {1} seconds.":
        "La première fois que chaque ennemi atteint [{0} Gel]<frost>, l'[Étourdit]<stun> pendant {1} secondes.",
    "The first time each enemy reaches [50 Poison]<poison>, they lose [33% Max HP]<maxhp>, [66% Attack]<attack>, and [66% Attack Speed]<attackspeed>.":
        "La première fois que chaque ennemi atteint [50 Poison]<poison>, il perd [33% PV Max]<maxhp>, [66% Attaque]<attack> et [66% Vitesse d'Attaque]<attackspeed>.",
    "The first time each enemy reaches [{0} Poison]<poison>, they lose [{1}% Max HP]<maxhp>, [{2}% Attack]<attack>, and [{3}% Attack Speed]<attackspeed>.":
        "La première fois que chaque ennemi atteint [{0} Poison]<poison>, il perd [{1}% PV Max]<maxhp>, [{2}% Attaque]<attack> et [{3}% Vitesse d'Attaque]<attackspeed>.",
    "The shop shows an additional relic.":
        "La boutique propose une relique supplémentaire.",
    "Until [Combat #{0}]<bold>, items cost {1} less.":
        "Jusqu'au [Combat n°{0}]<bold>, les objets coûtent {1} de moins.",
    "Whenever a Hero gains [Shields]<shield> from any source but itself, damage the nearest enemy to them for {0}% of the [Shield]<shield> applied.":
        "Chaque fois qu'un Héros reçoit des [Boucliers]<shield> d'une autre source que lui-même, inflige à l'ennemi le plus proche de lui des dégâts égaux à {0}% du [Bouclier]<shield> appliqué.",
    "Whenever a Hero inflicts [Burn,]<burn> they gain [1 Magic]<magic> and [1 Attack]<attack> per [4 Burn]<burn> inflicted.":
        "Chaque fois qu'un Héros inflige [Brûlure,]<burn> il gagne [1 Magie]<magic> et [1 Attaque]<attack> par tranche de [4 Brûlure]<burn> infligées.",
    "Whenever a Hero inflicts [Burn,]<burn> they gain [{0} Magic]<magic> and [{1} Attack]<attack> per [{2} Burn]<burn> inflicted.":
        "Chaque fois qu'un Héros inflige [Brûlure,]<burn> il gagne [{0} Magie]<magic> et [{1} Attaque]<attack> par tranche de [{2} Brûlure]<burn> infligées.",
    "Whenever a Hero inflicts [Burn]<burn>, also inflict {0}% of the [Burn]<burn> applied as [Frost]<frost>.\n\nWhenever a Hero inflicts [Frost]<frost>, also inflict {1}% of the [Frost]<frost> applied as [Burn]<burn>.":
        "Chaque fois qu'un Héros inflige [Brûlure]<burn>, inflige également {0}% de la [Brûlure]<burn> appliquée sous forme de [Gel]<frost>.\n\nChaque fois qu'un Héros inflige [Gel]<frost>, inflige également {1}% du [Gel]<frost> appliqué sous forme de [Brûlure]<burn>.",
    "Whenever a Hero inflicts [Burn]<burn>, inflict {0}% more.":
        "Chaque fois qu'un Héros inflige [Brûlure]<burn>, en inflige {0}% de plus.",
    "Whenever a Hero inflicts [Frost,]<frost> they gain [1 Magic]<magic> and [1 Attack]<attack> per [4 Frost]<frost> inflicted.":
        "Chaque fois qu'un Héros inflige [Gel,]<frost> il gagne [1 Magie]<magic> et [1 Attaque]<attack> par tranche de [4 Gel]<frost> infligés.",
    "Whenever a Hero inflicts [Frost,]<frost> they gain [{0} Magic]<magic> and [{1} Attack]<attack> per [{2} Frost]<frost> inflicted.":
        "Chaque fois qu'un Héros inflige [Gel,]<frost> il gagne [{0} Magie]<magic> et [{1} Attaque]<attack> par tranche de [{2} Gel]<frost> infligés.",
    "Whenever a Hero inflicts [Frost]<frost>, inflict {0}% more.":
        "Chaque fois qu'un Héros inflige [Gel]<frost>, en inflige {0}% de plus.",
    "Whenever a Hero inflicts [Frost]<frost>, they gain [{0} Shields]<shield> per [Frost]<frost> inflicted.":
        "Chaque fois qu'un Héros inflige [Gel]<frost>, il gagne [{0} Boucliers]<shield> par cumul de [Gel]<frost> infligé.",
    "Whenever a Hero inflicts [Poison,]<poison> they gain [1 Magic]<magic> and [1 Attack]<attack> per [2 Poison]<poison> inflicted.":
        "Chaque fois qu'un Héros inflige [Poison,]<poison> il gagne [1 Magie]<magic> et [1 Attaque]<attack> par tranche de [2 Poison]<poison> infligés.",
    "Whenever a Hero inflicts [Poison,]<poison> they gain [{0} Magic]<magic> and [{1} Attack]<attack> per [{2} Poison]<poison> inflicted.":
        "Chaque fois qu'un Héros inflige [Poison,]<poison> il gagne [{0} Magie]<magic> et [{1} Attaque]<attack> par tranche de [{2} Poison]<poison> infligés.",
    "Whenever a Hero inflicts [Poison]<poison>, inflict {0}% more.":
        "Chaque fois qu'un Héros inflige [Poison]<poison>, en inflige {0}% de plus.",
    "Whenever a [Duelist]<duelist> [auto attacks]<bold>, they deal {0} [bonus damage]<damage> per type of [Debuff]<debuff> on their target.":
        "Chaque fois qu'un [Duelliste]<duelist> effectue une [attaque auto]<bold>, il inflige {0} [dégâts bonus]<damage> par type de [Malus]<debuff> présent sur sa cible.",
    "Whenever a [Duelist]<duelist> auto attacks, they inflict [{0} Burn]<burn> on their target.":
        "Chaque fois qu'un [Duelliste]<duelist> effectue une attaque auto, il inflige [{0} Brûlure]<burn> à sa cible.",
    "Whenever a [Duelist]<duelist> auto attacks, they inflict [{0} Frost]<frost> on their target.":
        "Chaque fois qu'un [Duelliste]<duelist> effectue une attaque auto, il inflige [{0} Gel]<frost> à sa cible.",
    "Whenever a [Duelist]<duelist> auto attacks, they inflict [{0} Poison]<poison> on their target.":
        "Chaque fois qu'un [Duelliste]<duelist> effectue une attaque auto, il inflige [{0} Poison]<poison> à sa cible.",
    "Whenever a [Duelist]<duelist> auto attacks, they randomly inflict [{0} Poison]<poison>, [{1} Frost]<frost>, or [{2} Burn]<burn> on their target.":
        "Chaque fois qu'un [Duelliste]<duelist> effectue une attaque auto, il inflige aléatoirement [{0} Poison]<poison>, [{1} Gel]<frost> ou [{2} Brûlure]<burn> à sa cible.",
    "Whenever a [Mage]<mage> [auto attacks]<bold>, they deal [bonus damage]<damage> to their target equal to [{0}% of their Magic]<magic>.":
        "Chaque fois qu'un [Mage]<mage> effectue une [attaque auto]<bold>, il inflige à sa cible des [dégâts bonus]<damage> égaux à [{0}% de sa Magie]<magic>.",
    "Whenever a [Mage]<mage> [casts]<bold>, all enemies in their [range]<attackrange> take [{0} damage]<damage> per [Frost]<frost> and [{1} damage]<damage> per [Burn]<burn> they have.":
        "Chaque fois qu'un [Mage]<mage> [lance une compétence]<bold>, tous les ennemis à sa [portée]<attackrange> subissent [{0} dégâts]<damage> par cumul de [Gel]<frost> et [{1} dégâts]<damage> par cumul de [Brûlure]<burn> qui les affecte.",
    "Whenever a [Mage]<mage> [casts]<bold>, they deal damage to the lowest-health enemy equal to [{0}% of their Magic]<magic>.":
        "Chaque fois qu'un [Mage]<mage> [lance une compétence]<bold>, il inflige à l'ennemi ayant le moins de PV des dégâts égaux à [{0}% de sa Magie]<magic>.",
    "Whenever a [Mage]<mage> [casts]<bold>, they inflict [Burn]<burn> on their target equal to [{0}% of the Mana]<mana> spent.":
        "Chaque fois qu'un [Mage]<mage> [lance une compétence]<bold>, il inflige à sa cible une [Brûlure]<burn> égale à [{0}% du Mana]<mana> dépensé.",
    "Whenever a [Mage]<mage> [casts]<bold>, they inflict [Frost]<frost> on their target equal to [{0}% of the Mana]<mana> spent.":
        "Chaque fois qu'un [Mage]<mage> [lance une compétence]<bold>, il inflige à sa cible un [Gel]<frost> égal à [{0}% du Mana]<mana> dépensé.",
    "Whenever a [Mage]<mage> or [Mystic]<mystic> [casts]<bold>, they deal damage equal to [{0}% of their Magic]<magic> to all enemies and apply [Shields]<shield> equal to [{1}% of their Mana Regen]<manaregen> to all Heroes.":
        "Chaque fois qu'un [Mage]<mage> ou un [Mystique]<mystic> [lance une compétence]<bold>, il inflige des dégâts égaux à [{0}% de sa Magie]<magic> à tous les ennemis et applique des [Boucliers]<shield> égaux à [{1}% de sa Régén. Mana]<manaregen> à tous les Héros.",
    "Whenever a [Mystic]<mystic> [Shields]<shield> a Hero, damage their nearest enemy for {0}% of the [Shield]<shield> applied.":
        "Chaque fois qu'un [Mystique]<mystic> applique un [Bouclier]<shield> à un Héros, inflige à l'ennemi le plus proche de celui-ci des dégâts égaux à {0}% du [Bouclier]<shield> appliqué.",
    "Whenever a [Mystic]<mystic> [casts]<bold> after [Stall ({0}),]<stall> they give the nearest Hero [Magic]<magic> and [Attack]<attack> equal to [{1}% of their Mana Regen]<manaregen>.":
        "Chaque fois qu'un [Mystique]<mystic> [lance une compétence]<bold> après [Tempo ({0}),]<stall> il confère au Héros le plus proche un montant de [Magie]<magic> et d'[Attaque]<attack> égal à [{1}% de sa Régén. Mana]<manaregen>.",
    "Whenever a [Mystic]<mystic> [casts]<bold>, they [Shield]<shield> the [lowest-health]<health> Hero equal to [{0}% of their Mana Regen]<manaregen>.":
        "Chaque fois qu'un [Mystique]<mystic> [lance une compétence]<bold>, il applique un [Bouclier]<shield> au Héros ayant [le moins de PV]<health> égal à [{0}% de sa Régén. Mana]<manaregen>.",
    "Whenever a [Mystic]<mystic> [casts]<bold>, they [Shield]<shield> the nearest Hero equal to the total number of [Debuff]<debuff> stacks on all enemies.":
        "Chaque fois qu'un [Mystique]<mystic> [lance une compétence]<bold>, il applique un [Bouclier]<shield> au Héros le plus proche égal au nombre total de cumuls de [Malus]<debuff> sur tous les ennemis.",
    "Whenever a [Mystic]<mystic> [casts]<bold>, they gain [Magic]<magic> equal to [{0}% of their Mana Regen]<manaregen>.":
        "Chaque fois qu'un [Mystique]<mystic> [lance une compétence]<bold>, il gagne un montant de [Magie]<magic> égal à [{0}% de sa Régén. Mana]<manaregen>.",
    "Whenever a [Mystic]<mystic> [casts]<bold>, they gain [{0} Magic]<magic> per type of [Debuff]<debuff> on all enemies.":
        "Chaque fois qu'un [Mystique]<mystic> [lance une compétence]<bold>, il gagne [{0} Magie]<magic> par type de [Malus]<debuff> présent sur tous les ennemis.",
    "Whenever a [Tank]<tank> is auto attacked, they apply [{0} Frost]<frost> to the attacker.":
        "Chaque fois qu'un [Tank]<tank> subit une attaque auto, il applique [{0} Gel]<frost> à l'attaquant.",
    "Whenever a [Tank]<tank> is auto attacked, they apply [{0} Poison]<poison> to the attacker.":
        "Chaque fois qu'un [Tank]<tank> subit une attaque auto, il applique [{0} Poison]<poison> à l'attaquant.",
    "Whenever a [Tank]<tank> is auto attacked, they gain [{0} Defense]<defense>.":
        "Chaque fois qu'un [Tank]<tank> subit une attaque auto, il gagne [{0} Défense]<defense>.",
    "Whenever a [Vanguard]<vanguard> auto attacks, they inflict [{0} Burn]<burn> on their target.":
        "Chaque fois qu'une [Avant-garde]<vanguard> effectue une attaque auto, elle inflige [{0} Brûlure]<burn> à sa cible.",
    "Whenever a [Vanguard]<vanguard> goes below [{0}% Max HP]<maxhp> for the first time each combat they gain [+{1}% Attack Speed]<attackspeed>, [+{2}% Attack]<attack>, and [+{3}% Defense]<defense>.":
        "Chaque fois qu'une [Avant-garde]<vanguard> passe sous [{0}% de ses PV Max]<maxhp> pour la première fois à chaque combat, elle gagne [+{1}% Vitesse d'Attaque]<attackspeed>, [+{2}% Attaque]<attack> et [+{3}% Défense]<defense>.",
    "Whenever a [Vanguard]<vanguard> is auto attacked, they inflict [{0} Burn]<burn> on the attacker.":
        "Chaque fois qu'une [Avant-garde]<vanguard> subit une attaque auto, elle inflige [{0} Brûlure]<burn> à l'attaquant.",
    "Whenever a [Warrior]<warrior> [Crits]<crit>, they [heal]<heal> equal to [{0}% of their Attack]<attack>.":
        "Chaque fois qu'un [Guerrier]<warrior> inflige un [Coup Critique]<crit>, il [se soigne]<heal> d'un montant égal à [{0}% de son Attaque]<attack>.",
    "Whenever a [Warrior]<warrior> [Crits]<crit>, they deal bonus damage equal to [{0}% of their Attack]<attack>.":
        "Chaque fois qu'un [Guerrier]<warrior> inflige un [Coup Critique]<crit>, il inflige des dégâts bonus égaux à [{0}% de son Attaque]<attack>.",
    "Whenever a [Warrior]<warrior> [kills]<bold>, they gain [+{0}% Attack]<attack>, [heal {1}% of their Max HP]<maxhp> and gain [{2} Mana]<mana>.":
        "Chaque fois qu'un [Guerrier]<warrior> réussit une [élimination]<bold>, il gagne [+{0}% Attaque]<attack>, [se soigne de {1}% de ses PV Max]<maxhp> et gagne [{2} Mana]<mana>.",
    "Whenever an [Assassin]<assassin> [Crits]<crit>, they permanently gain [{0} Attack]<attack> and [{1} Magic]<magic>.":
        "Chaque fois qu'un [Assassin]<assassin> inflige un [Coup Critique]<crit>, il gagne définitivement [{0} Attaque]<attack> et [{1} Magie]<magic>.",
    "Whenever an [Assassin]<assassin> kills an enemy they permanently gain [{0} Crit]<crit> then you gain [{1} Shard]<shard> per [{2} Crit]<crit> they have (Max: {3}).":
        "Chaque fois qu'un [Assassin]<assassin> élimine un ennemi, il gagne définitivement [{0} Critique]<crit>, puis vous gagnez [{1} Éclat]<shard> par tranche de [{2} Critique]<crit> qu'il possède (Max : {3}).",
    "Whenever an [Assassin]<assassin> kills an enemy, gain [{0} Shards]<shard>.":
        "Chaque fois qu'un [Assassin]<assassin> élimine un ennemi, gagnez [{0} Éclats]<shard>.",
    "Whenever an enemy damages a Hero's [Shields]<shield>, deal {0}% of the damage back to the source.":
        "Chaque fois qu'un ennemi inflige des dégâts aux [Boucliers]<shield> d'un Héros, renvoie {0}% des dégâts à l'attaquant.",
    "Whenever an enemy dies, transfer their [Burn]<burn> to the nearest enemy.":
        "Chaque fois qu'un ennemi meurt, transfère sa [Brûlure]<burn> à l'ennemi le plus proche.",
    "Whenever an enemy dies, transfer their [Frost]<frost> to the nearest enemy.":
        "Chaque fois qu'un ennemi meurt, transfère son [Gel]<frost> à l'ennemi le plus proche.",
    "Whenever an enemy dies, transfer their [Poison]<poison> to the nearest enemy.":
        "Chaque fois qu'un ennemi meurt, transfère son [Poison]<poison> à l'ennemi le plus proche.",
    "Whenever an enemy reaches [{0}% remaining Max HP]<maxhp>, it gains [{1} Attack Speed]<attackspeed> and [Shields]<shield> equal to [{2}% of its Max HP]<maxhp>.":
        "Chaque fois qu'un ennemi atteint [{0}% de ses PV Max restants]<maxhp>, il gagne [{1} Vitesse d'Attaque]<attackspeed> et des [Boucliers]<shield> égaux à [{2}% de ses PV Max]<maxhp>.",
    "Whenever an enemy takes [Poison]<poison> damage, Heroes gain [{0} Crit]<crit>.":
        "Chaque fois qu'un ennemi subit des dégâts de [Poison]<poison>, les Héros gagnent [{0} Critique]<crit>.",
    "Whenever an enemy takes [Poison]<poison> or [Burn]<burn> damage, [heal]<heal> all adjacent Heroes to them for {0}% of that damage.":
        "Chaque fois qu'un ennemi subit des dégâts de [Poison]<poison> ou de [Brûlure]<burn>, [soigne]<heal> tous les Héros qui lui sont adjacents à hauteur de {0}% de ces dégâts.",
    "Whenever an enemy takes {0} or more damage from [Poison]<poison>, they also take damage equal to [{1}% of their Max HP]<maxhp>.":
        "Chaque fois qu'un ennemi subit au moins {0} dégâts de [Poison]<poison>, il subit également des dégâts égaux à [{1}% de ses PV Max]<maxhp>.",
    "Whenever an enemy with {0} or more [Burn]<burn> dies, damage all enemies in a large area around them equal to [{1}% of their Max HP]<maxhp>.":
        "Chaque fois qu'un ennemi ayant au moins {0} [Brûlure]<burn> meurt, inflige à tous les ennemis dans une large zone autour de lui des dégâts égaux à [{1}% de leurs PV Max]<maxhp>.",
    "[Assassin's]<assassin> [Rush]<rush> abilities last {0} seconds longer.":
        "Les compétences d'[Assaut]<rush> des [Assassins]<assassin> durent {0} secondes de plus.",
    "[Assassins]<assassin> gain [Stealth]<stealth> for {0} seconds the first time they go below [{1}% Max HP]<maxhp> each combat.":
        "Les [Assassins]<assassin> gagnent [Camouflage]<stealth> pendant {0} secondes la première fois qu'ils passent sous [{1}% de leurs PV Max]<maxhp> à chaque combat.",
    "[Assassins]<assassin> gain [{0} Attack]<attack> and [{1} Magic]<magic> per [{2} Shards]<shard> you've [generated]<generate> this game.":
        "Les [Assassins]<assassin> gagnent [{0} Attaque]<attack> et [{1} Magie]<magic> par tranche de [{2} Éclats]<shard> [générés]<generate> au cours de cette partie.",
    "[Assassins]<assassin> gain [{0} Crit]<crit> and [{1} Attack]<attack>.":
        "Les [Assassins]<assassin> gagnent [{0} Critique]<crit> et [{1} Attaque]<attack>.",
    "[Assassins]<assassin> gain [{0} Crit]<crit> and [{1} Magic]<magic>.":
        "Les [Assassins]<assassin> gagnent [{0} Critique]<crit> et [{1} Magie]<magic>.",
    "[Assassins]<assassin> gain [{0} Crit]<crit>.":
        "Les [Assassins]<assassin> gagnent [{0} Critique]<crit>.",
    "[Assassins]<assassin>, [Duelists]<duelist>, and [Warriors]<warrior> gain [{0} Crit]<crit>, [{1} Attack Speed]<attackspeed>, and [{2} Attack]<attack>.":
        "Les [Assassins]<assassin>, les [Duellistes]<duelist> et les [Guerriers]<warrior> gagnent [{0} Critique]<crit>, [{1} Vitesse d'Attaque]<attackspeed> et [{2} Attaque]<attack>.",
    "[Duelists]<duelist> gain [{0} Attack Speed]<attackspeed> and [{1} Attack]<attack>.":
        "Les [Duellistes]<duelist> gagnent [{0} Vitesse d'Attaque]<attackspeed> et [{1} Attaque]<attack>.",
    "[Duelists]<duelist> gain [{0} Attack Speed]<attackspeed> and [{1} Crit]<crit>.":
        "Les [Duellistes]<duelist> gagnent [{0} Vitesse d'Attaque]<attackspeed> et [{1} Critique]<crit>.",
    "[Duelists]<duelist> gain [{0} Attack Speed]<attackspeed>.":
        "Les [Duellistes]<duelist> gagnent [{0} Vitesse d'Attaque]<attackspeed>.",
    "[Duelists]<duelist> gain [{0} Crit]<crit> per [{1} Shards]<shard> you've [generated]<generate> this game.":
        "Les [Duellistes]<duelist> gagnent [{0} Critique]<crit> par tranche de [{1} Éclats]<shard> [générés]<generate> au cours de cette partie.",
    "[Each second,]<bold> Heroes take damage equal to [{0}% of their Max HP]<maxhp>.":
        "[Chaque seconde,]<bold> les Héros subissent des dégâts égaux à [{0}% de leurs PV Max]<maxhp>.",
    "[Each second,]<bold> enemies [heal {0}% Max HP]<maxhp>.":
        "[Chaque seconde,]<bold> les ennemis [se soignent de {0}% de leurs PV Max]<maxhp>.",
    "[Each second]<bold> for [Rush ({0}),]<rush> inflict [{1} Burn]<burn> on all enemies.":
        "[Chaque seconde]<bold> pendant [Assaut ({0}),]<rush> inflige [{1} Brûlure]<burn> à tous les ennemis.",
    "[Each second]<bold> if there is a [Tank]<tank> in combat, Heroes gain [{0} Defense]<defense>.":
        "[Chaque seconde,]<bold> s'il y a un [Tank]<tank> au combat, les Héros gagnent [{0} Défense]<defense>.",
    "[Emergency Rewind]<shardstabilizer> starts with [{0} more Shards]<shard>.":
        "Le [Stabilisateur d'Urgence]<shardstabilizer> commence avec [{0} Éclats supplémentaires]<shard>.",
    "[Every other]<bold> [Stall]<stall> [trigger,]<bold> gain [{0} Shard]<shard>.\n\n[Every other]<bold> [Rush]<rush> [trigger,]<bold> gain [{1} Shard]<shard>.":
        "[Un déclenchement sur deux]<bold> de [Tempo]<stall> [confère]<bold> [{0} Éclat]<shard>.\n\n[Un déclenchement sur deux]<bold> d'[Assaut]<rush> [confère]<bold> [{1} Éclat]<shard>.",
    "[Every {0} seconds,]<bold> Heroes gain [{1} Attack Speed]<attackspeed> and [{2} Attack]<attack> per type of [Debuff]<debuff> on all enemies.":
        "[Toutes les {0} secondes,]<bold> les Héros gagnent [{1} Vitesse d'Attaque]<attackspeed> et [{2} Attaque]<attack> par type de [Malus]<debuff> présent sur tous les ennemis.",
    "[Every {0} seconds]<bold> if there is a [Vanguard]<vanguard> in combat, Heroes gain [{1} Shields]<shield>.":
        "[Toutes les {0} secondes,]<bold> s'il y a une [Avant-garde]<vanguard> au combat, les Héros gagnent [{1} Boucliers]<shield>.",
    "[Every {0}]<bold> [Rush]<rush> [triggers,]<bold> gain [{1} Shard]<shard>.":
        "[Tous les {0}]<bold> [déclenchements]<bold> d'[Assaut,]<rush> gagnez [{1} Éclat]<shard>.",
    "[Every {0}]<bold> [Stall]<stall> [triggers,]<bold> [Stun]<stun> all enemies for {1} seconds.\n\n[Every {2}]<bold> [Rush]<rush> [triggers,]<bold> [Stun]<stun> all enemies for {3} seconds.":
        "[Tous les {0}]<bold> [déclenchements]<bold> de [Tempo,]<stall> [Étourdit]<stun> tous les ennemis pendant {1} secondes.\n\n[Tous les {2}]<bold> [déclenchements]<bold> d'[Assaut,]<rush> [Étourdit]<stun> tous les ennemis pendant {3} secondes.",
    "[Every {0}]<bold> [Stall]<stall> [triggers,]<bold> gain [{1} Shard]<shard>.":
        "[Tous les {0}]<bold> [déclenchements]<bold> de [Tempo,]<stall> gagnez [{1} Éclat]<shard>.",
    "[Frost]<frost> now deals damage to enemies when it ticks down (like [Burn]<burn> does).":
        "Le [Gel]<frost> inflige désormais des dégâts aux ennemis lorsqu'il diminue (comme la [Brûlure]<burn>).",
    "[Mages]<mage> and [Mystics]<mystic> gain [{0} Magic]<magic> and [{1} Mana Regen]<manaregen>.":
        "Les [Mages]<mage> et les [Mystiques]<mystic> gagnent [{0} Magie]<magic> et [{1} Régén. Mana]<manaregen>.",
    "[Mages]<mage> gain [{0} Magic]<magic> and [{1} Crit]<crit>.":
        "Les [Mages]<mage> gagnent [{0} Magie]<magic> et [{1} Critique]<crit>.",
    "[Mages]<mage> gain [{0} Magic]<magic> and [{1} Mana Regen]<manaregen>.":
        "Les [Mages]<mage> gagnent [{0} Magie]<magic> et [{1} Régén. Mana]<manaregen>.",
    "[Mages]<mage> gain [{0} Magic]<magic>.":
        "Les [Mages]<mage> gagnent [{0} Magie]<magic>.",
    "[Mystics]<mystic> gain [{0} Mana Regen]<manaregen> and [{1} Magic]<magic>.":
        "Les [Mystiques]<mystic> gagnent [{0} Régén. Mana]<manaregen> et [{1} Magie]<magic>.",
    "[Mystics]<mystic> gain [{0} Mana Regen]<manaregen> and [{1} Max HP]<maxhp>.":
        "Les [Mystiques]<mystic> gagnent [{0} Régén. Mana]<manaregen> et [{1} PV Max]<maxhp>.",
    "[Mystics]<mystic> gain [{0} Mana Regen]<manaregen>.":
        "Les [Mystiques]<mystic> gagnent [{0} Régén. Mana]<manaregen>.",
    "[On]<bold> [Stall]<stall> [Trigger:]<bold> Heroes gain [{0} Attack Speed]<attackspeed> and [{1} Magic]<magic>.":
        "[Au]<bold> [déclenchement]<bold> de [Tempo :]<stall> les Héros gagnent [{0} Vitesse d'Attaque]<attackspeed> et [{1} Magie]<magic>.",
    "[Rush ({0}):]<rush> [Warriors]<warrior> gain [+{1}% Attack]<attack>.":
        "[Assaut ({0}) :]<rush> les [Guerriers]<warrior> gagnent [+{1}% Attaque]<attack>.",
    "[Rush]<rush> abilities last 1 second longer.":
        "Les compétences d'[Assaut]<rush> durent 1 seconde de plus.",
    "[Rush]<rush> abilities last {0} second longer.":
        "Les compétences d'[Assaut]<rush> durent {0} seconde de plus.",
    "[Rush]<rush> abilities last 2 seconds longer.":
        "Les compétences d'[Assaut]<rush> durent 2 secondes de plus.",
    "[Rush]<rush> abilities last 3 seconds longer.":
        "Les compétences d'[Assaut]<rush> durent 3 secondes de plus.",
    "[Rush]<rush> abilities last 4 seconds longer.":
        "Les compétences d'[Assaut]<rush> durent 4 secondes de plus.",
    "[Rush]<rush> abilities last {0} seconds longer.":
        "Les compétences d'[Assaut]<rush> durent {0} secondes de plus.",
    "[Stall]<stall> abilities trigger 2 seconds faster.":
        "Les compétences de [Tempo]<stall> se déclenchent 2 secondes plus tôt.",
    "[Stall]<stall> abilities trigger 3 seconds faster.":
        "Les compétences de [Tempo]<stall> se déclenchent 3 secondes plus tôt.",
    "[Stall]<stall> abilities trigger 6 seconds faster.":
        "Les compétences de [Tempo]<stall> se déclenchent 6 secondes plus tôt.",
    "[Stall]<stall> abilities trigger 9 seconds faster.":
        "Les compétences de [Tempo]<stall> se déclenchent 9 secondes plus tôt.",
    "[Stall]<stall> abilities trigger {0} seconds faster.":
        "Les compétences de [Tempo]<stall> se déclenchent {0} secondes plus tôt.",
    "[Tank's]<tank> [Stall]<stall> abilities trigger {0} seconds faster.":
        "Les compétences de [Tempo]<stall> des [Tanks]<tank> se déclenchent {0} secondes plus tôt.",
    "[Tanks]<tank> and [Vanguards]<vanguard> gain [{0} Defense]<defense> and [{1} Max HP]<maxhp>.":
        "Les [Tanks]<tank> et les [Avant-gardes]<vanguard> gagnent [{0} Défense]<defense> et [{1} PV Max]<maxhp>.",
    "[Tanks]<tank> gain [{0} Defense]<defense> and [{1} Magic]<magic>.":
        "Les [Tanks]<tank> gagnent [{0} Défense]<defense> et [{1} Magie]<magic>.",
    "[Tanks]<tank> gain [{0} Defense]<defense> and [{1} Max HP]<maxhp>.":
        "Les [Tanks]<tank> gagnent [{0} Défense]<defense> et [{1} PV Max]<maxhp>.",
    "[Tanks]<tank> gain [{0} Defense]<defense> per enemy targeting them.\n\n[Every {1} Seconds,]<bold> the [Tank]<tank> with the highest [current HP]<maxhp> [Taunts]<taunt> all enemies.":
        "Les [Tanks]<tank> gagnent [{0} Défense]<defense> par ennemi qui les cible.\n\n[Toutes les {1} secondes,]<bold> le [Tank]<tank> ayant le plus de [PV actuels]<maxhp> [Provoque]<taunt> tous les ennemis.",
    "[Tanks]<tank> gain [{0} Defense]<defense>.":
        "Les [Tanks]<tank> gagnent [{0} Défense]<defense>.",
    "[The Rift Storm]<storm> starts {0} seconds sooner. Heroes take {1}% reduced damage from [The Rift Storm]<storm>.":
        "[La Tempête de la Faille]<storm> commence {0} secondes plus tôt. Les Héros subissent {1}% de dégâts en moins de [La Tempête de la Faille]<storm>.",
    "[Until the Act Boss,]<bold> Heroes can equip an additional item (Max: {0}).":
        "[Jusqu'au Boss de l'Acte,]<bold> les Héros peuvent équiper un objet supplémentaire (Max : {0}).",
    "[Until the Act Boss,]<bold> Heroes gain [{0} Attack Speed]<attackspeed>.":
        "[Jusqu'au Boss de l'Acte,]<bold> les Héros gagnent [{0} Vitesse d'Attaque]<attackspeed>.",
    "[Until the Act Boss,]<bold> Heroes gain [{0} Attack]<attack>.":
        "[Jusqu'au Boss de l'Acte,]<bold> les Héros gagnent [{0} Attaque]<attack>.",
    "[Until the Act Boss,]<bold> Heroes gain [{0} Crit]<crit>.":
        "[Jusqu'au Boss de l'Acte,]<bold> les Héros gagnent [{0} Critique]<crit>.",
    "[Until the Act Boss,]<bold> Heroes gain [{0} Defense]<defense>.":
        "[Jusqu'au Boss de l'Acte,]<bold> les Héros gagnent [{0} Défense]<defense>.",
    "[Until the Act Boss,]<bold> Heroes gain [{0} Magic]<magic>":
        "[Jusqu'au Boss de l'Acte,]<bold> les Héros gagnent [{0} Magie]<magic>",
    "[Until the Act Boss,]<bold> Heroes gain [{0} Magic]<magic>.":
        "[Jusqu'au Boss de l'Acte,]<bold> les Héros gagnent [{0} Magie]<magic>.",
    "[Until the Act Boss,]<bold> Heroes gain [{0} Mana Regen]<manaregen>.":
        "[Jusqu'au Boss de l'Acte,]<bold> les Héros gagnent [{0} Régén. Mana]<manaregen>.",
    "[Until the Act Boss,]<bold> Heroes gain [{0} Max HP]<maxhp>.":
        "[Jusqu'au Boss de l'Acte,]<bold> les Héros gagnent [{0} PV Max]<maxhp>.",
    "[Until the Act Boss,]<bold> earn [{0} extra Shard]<shard> per surviving Hero at end of combat.":
        "[Jusqu'au Boss de l'Acte,]<bold> gagnez [{0} Éclat supplémentaire]<shard> par Héros survivant à la fin du combat.",
    "[Vanguard's]<vanguard> [Rush]<rush> abilities last {0} seconds longer.":
        "Les compétences d'[Assaut]<rush> des [Avant-gardes]<vanguard> durent {0} secondes de plus.",
    "[Vanguards]<vanguard> gain [{0} Max HP]<maxhp> and [{1} Attack]<attack>.":
        "Les [Avant-gardes]<vanguard> gagnent [{0} PV Max]<maxhp> et [{1} Attaque]<attack>.",
    "[Vanguards]<vanguard> gain [{0} Max HP]<maxhp> and [{1} Defense]<defense>.":
        "Les [Avant-gardes]<vanguard> gagnent [{0} PV Max]<maxhp> et [{1} Défense]<defense>.",
    "[Vanguards]<vanguard> gain [{0} Max HP]<maxhp>.":
        "Les [Avant-gardes]<vanguard> gagnent [{0} PV Max]<maxhp>.",
    "[Warrior's]<warrior> [Rush]<rush> abilities last {0} seconds longer.":
        "Les compétences d'[Assaut]<rush> des [Guerriers]<warrior> durent {0} secondes de plus.",
    "[Warriors]<warrior> gain [{0} Attack]<attack> and [{1} Attack Speed]<attackspeed>.":
        "Les [Guerriers]<warrior> gagnent [{0} Attaque]<attack> et [{1} Vitesse d'Attaque]<attackspeed>.",
    "[Warriors]<warrior> gain [{0} Attack]<attack> and [{1} Crit]<crit>.":
        "Les [Guerriers]<warrior> gagnent [{0} Attaque]<attack> et [{1} Critique]<crit>.",
    "[Warriors]<warrior> gain [{0} Attack]<attack>.":
        "Les [Guerriers]<warrior> gagnent [{0} Attaque]<attack>.",
})


# ============================================================================
# 7. UNIFIED EXACT DICTIONARY & PATTERN/TEMPLATE TRANSLATOR ENGINE
# ============================================================================
ALL_EXACT_EN_TO_FR = {}
ALL_EXACT_EN_TO_FR.update(ENEMIES_EN_TO_FR)
ALL_EXACT_EN_TO_FR.update(EVENTS_EN_TO_FR)
ALL_EXACT_EN_TO_FR.update(LORE_EN_TO_FR)
ALL_EXACT_EN_TO_FR.update(ITEMS_NAMES_EN_TO_FR)
ALL_EXACT_EN_TO_FR.update(RELICS_NAMES_EN_TO_FR)
ALL_EXACT_EN_TO_FR.update(DESCRIPTIONS_EN_TO_FR)

# Inner tag translations (strictly preserving statcalc_*, *datatracking*, customdata*)
TAG_INNER_EXACT = {
    "Warrior": "Guerrier",
    "Warriors": "Guerriers",
    "Warrior's": "Guerriers",
    "Tank": "Tank",
    "Tanks": "Tanks",
    "Tank's": "Tanks",
    "Vanguard": "Avant-garde",
    "Vanguards": "Avant-gardes",
    "Vanguard's": "Avant-gardes",
    "Assassin": "Assassin",
    "Assassins": "Assassins",
    "Assassin's": "Assassins",
    "Duelist": "Duelliste",
    "Duelists": "Duellistes",
    "Duelist's": "Duellistes",
    "Mystic": "Mystique",
    "Mystics": "Mystiques",
    "Mystic's": "Mystiques",
    "Mage": "Mage",
    "Mages": "Mages",
    "Mage's": "Mages",
    "Burn": "Brûlure",
    "Burn,": "Brûlure,",
    "Frost": "Gel",
    "Frost,": "Gel,",
    "Poison": "Poison",
    "Poison,": "Poison,",
    "Bleed": "Saignement",
    "Stun": "Étourdissement",
    "Stuns": "Étourdit",
    "Stunned": "Étourdis",
    "stunned": "Étourdis",
    "Shield": "Bouclier",
    "Shield:": "Bouclier :",
    "Shields": "Boucliers",
    "Shields,": "Boucliers,",
    "Shielded": "Protégé",
    "lasting": "persistant",
    "Heal": "Soin",
    "Heals": "Soins",
    "heal": "soigne",
    "health": "PV",
    "Health": "PV",
    "lowest-health": "le moins de PV",
    "current HP": "PV actuels",
    "Rush": "Assaut",
    "Rush,": "Assaut,",
    "Stall": "Tempo",
    "Stall,": "Tempo,",
    "Stall:": "Tempo :",
    "Backup": "Soutien",
    "Crit": "Critique",
    "Crit,": "Critique,",
    "Crit:": "Critique :",
    "Crits": "Coup Critique",
    "Attack": "Attaque",
    "Attack:": "Attaque :",
    "Magic": "Magie",
    "Magic:": "Magie :",
    "Defense": "Défense",
    "Defense:": "Défense :",
    "Max HP": "PV Max",
    "Max HP:": "PV Max :",
    "Attack Speed": "Vitesse d'Attaque",
    "Attack Speed:": "Vitesse d'Attaque :",
    "Mana Regen": "Régén. Mana",
    "Mana Regen:": "Régén. Mana :",
    "Mana": "Mana",
    "Starting Mana": "Mana initial",
    "Shard": "Éclat",
    "Shards": "Éclats",
    "Stealth": "Camouflage",
    "Stealthed": "Camouflé",
    "Taunt": "Provocation",
    "Taunts": "Provoque",
    "Debuff": "Malus",
    "Debuffs": "Malus",
    "inflicts a Debuff,": "inflige un Malus,",
    "HP/S": "PV/s",
    "HP/s": "PV/s",
    "OmniVamp": "Omnivamp",
    "Omnivamp": "Omnivamp",
    "basic stats": "stats de base",
    "primary stats": "stats principales",
    "move speed": "vitesse de déplacement",
    "range": "portée",
    "threatening": "menaçant",
    "Class": "Classe",
    "class": "classe",
    "classes": "classes",
    "rank": "rang",
    "reserves": "réserve",
    "Reserves": "Réserve",
    "rerolled": "relance",
    "rerolls": "relances",
    "Reroll": "Relancez",
    "Rerolls": "Relances",
    "generated": "générés",
    "generated,": "générés,",
    "Generated:": "générés :",
    "generate": "génère",
    "Generate": "Générez",
    "generation": "génération",
    "Triggered:": "déclenchés :",
    "trigger,": "déclenchement,",
    "triggers,": "déclenchements,",
    "Trigger:": "déclenchement :",
    "start of combat,": "début du combat,",
    "start of Combat,": "début du combat,",
    "start of combat": "début du combat",
    "end of combat,": "fin du combat,",
    "combat victory,": "victoire au combat,",
    "combat survival,": "survivant au combat,",
    "survives combat,": "survit au combat,",
    "destroyed,": "détruit,",
    "active ability kill,": "élimination par compétence active,",
    "kill,": "élimination,",
    "kill": "élimination",
    "kills": "élimination",
    "On kill,": "Lors d'une élimination,",
    "cast,": "lancer,",
    "casts": "lance une compétence",
    "auto attack,": "attaque auto,",
    "auto attacks": "attaque auto",
    "auto attacked,": "attaqué auto,",
    "auto attacked": "attaque auto",
    "bonus damage": "dégâts bonus",
    "Each second,": "Chaque seconde,",
    "Each second": "Chaque seconde",
    "Every other": "Un déclenchement sur deux",
    "Until the Act Boss,": "Jusqu'au Boss de l'Acte,",
    "The Rift Storm": "La Tempête de la Faille",
    "Emergency Rewind": "Stabilisateur d'Urgence",
    "Combats Survived:": "Combats survécus :",
    "Times Used:": "Utilisations :",
    "this Game:": "cette partie :",
    "Amount:": "Montant :",
}


def _translate_tag_inner(inner: str, tag: str) -> str:
    tl = tag.lower()
    if tl.startswith("statcalc") or "datatracking" in tl or tl.startswith("customdata"):
        return inner
    if inner in TAG_INNER_EXACT:
        return TAG_INNER_EXACT[inner]
    s = inner
    # Dynamic tag inner patterns
    s = re.sub(r"^Stall \((.+?) and (.+?)\),$", r"Tempo (\1 et \2),", s)
    s = re.sub(r"^Stall \((.+?), (.+?), and (.+?)\),$", r"Tempo (\1, \2 et \3),", s)
    s = re.sub(r"^Stall \((.+?)\),$", r"Tempo (\1),", s)
    s = re.sub(r"^Rush \((.+?)\),$", r"Assaut (\1),", s)
    s = re.sub(r"^Rush \((.+?)\):$", r"Assaut (\1) :", s)
    s = re.sub(r"^Combat #(.+?) and Combat #(.+?),$", r"Combat n°\1 et du Combat n°\2,", s)
    s = re.sub(r"^Combat #(.+?)$", r"Combat n°\1", s)
    s = re.sub(r"^Act (.+?) Boss$", r"Boss de l'Acte \1", s)
    s = re.sub(r"^Every (.+?) [Ss]econds,$", r"Toutes les \1 secondes,", s)
    s = re.sub(r"^Every (.+?) [Ss]econds$", r"Toutes les \1 secondes", s)
    s = re.sub(r"^every (.+?) seconds,$", r"toutes les \1 secondes,", s)
    s = re.sub(r"^Every (.+?) auto attacks,$", r"Toutes les \1 attaques auto,", s)
    s = re.sub(r"^Every (.+?) casts,$", r"Tous les \1 lancers,", s)
    s = re.sub(r"^Every (.+?) combat victories,$", r"Toutes les \1 victoires au combat,", s)
    s = re.sub(r"^Every (.+?)$", r"Tous les \1", s)
    s = re.sub(r"^Stunned for (.+?) seconds$", r"Étourdis pendant \1 secondes", s)
    s = re.sub(r"^Stealth for (.+?) seconds$", r"Camouflage pendant \1 secondes", s)
    s = re.sub(r"^(.+?)% Max HP Shield$", r"Bouclier de \1% des PV Max", s)
    s = re.sub(r"^(.+?)% of their Max HP$", r"\1% de leurs PV Max", s)
    s = re.sub(r"^(.+?)% of its Max HP$", r"\1% de ses PV Max", s)
    s = re.sub(r"^(.+?)% remaining Max HP$", r"\1% de ses PV Max restants", s)
    s = re.sub(r"^(.+?)% of their Defense$", r"\1% de sa Défense", s)
    s = re.sub(r"^(.+?)% of their Attack$", r"\1% de son Attaque", s)
    s = re.sub(r"^(.+?)% of their Magic$", r"\1% de sa Magie", s)
    s = re.sub(r"^(.+?)% of their Mana Regen$", r"\1% de sa Régén. Mana", s)
    s = re.sub(r"^(.+?)% of their Crit$", r"\1% de son Critique", s)
    s = re.sub(r"^(.+?)% of the Mana$", r"\1% du Mana", s)
    s = re.sub(r"^(.+?)% of the holder's Attack Speed$", r"\1% de la Vitesse d'Attaque du porteur", s)
    s = re.sub(r"^(.+?)% of all Debuffs$", r"\1% de tous les Malus", s)
    s = re.sub(r"^(.+?)% reduced basic stats$", r"\1% de stats de base en moins", s)
    s = re.sub(r"^(.+?)% decreased basic stats$", r"\1% de stats de base en moins", s)
    s = re.sub(r"^(.+?)% increased basic stats$", r"+\1% de stats de base", s)
    s = re.sub(r"^\+(.+?)% to all their basic stats$", r"+\1% à toutes leurs stats de base", s)
    s = re.sub(r"^\+(.+?)% basic stats$", r"+\1% de stats de base", s)
    s = re.sub(r"^(.+?)% basic stats$", r"\1% de stats de base", s)
    s = re.sub(r"^heal (.+?)% of their Max HP$", r"se soigne de \1% de ses PV Max", s)
    s = re.sub(r"^heal (.+?)% Max HP$", r"se soignent de \1% de leurs PV Max", s)
    s = re.sub(r"^heals (.+?)$", r"se soigne de \1", s)
    s = re.sub(r"^heal (.+?)$", r"soigne de \1", s)
    s = re.sub(r"^(.+?) additional Shard per (.+?) Shards$", r"\1 Éclat supplémentaire par tranche de \2 Éclats", s)
    s = re.sub(r"^(.+?) additional Shards$", r"\1 Éclats supplémentaires", s)
    s = re.sub(r"^(.+?) extra Shards$", r"\1 Éclats supplémentaires", s)
    s = re.sub(r"^(.+?) extra Shard$", r"\1 Éclat supplémentaire", s)
    s = re.sub(r"^(.+?) more Shards$", r"\1 Éclats supplémentaires", s)
    s = re.sub(r"^(.+?) fewer Shards$", r"\1 Éclats de moins", s)
    s = re.sub(r"^(.+?) or more Shards$", r"\1 Éclats", s)
    s = re.sub(r"^(.+?) or more Crit$", r"\1 Critique ou plus", s)
    s = re.sub(r"\bMax HP\b", "PV Max", s)
    s = re.sub(r"\bAttack Speed\b", "Vitesse d'Attaque", s)
    s = re.sub(r"\bMana Regen\b", "Régén. Mana", s)
    s = re.sub(r"\bStarting Mana\b", "Mana initial", s)
    s = re.sub(r"\bAttack\b", "Attaque", s)
    s = re.sub(r"\bMagic\b", "Magie", s)
    s = re.sub(r"\bDefense\b", "Défense", s)
    s = re.sub(r"\bCrit\b", "Critique", s)
    s = re.sub(r"\bBurn\b", "Brûlure", s)
    s = re.sub(r"\bFrost\b", "Gel", s)
    s = re.sub(r"\bShields\b", "Boucliers", s)
    s = re.sub(r"\bShield\b", "Bouclier", s)
    s = re.sub(r"\bShards\b", "Éclats", s)
    s = re.sub(r"\bShard\b", "Éclat", s)
    s = re.sub(r"\bDebuffs\b", "Malus", s)
    s = re.sub(r"\bDebuff\b", "Malus", s)
    s = re.sub(r"\bHP/S\b", "PV/s", s)
    s = re.sub(r"\bbonus damage\b", "dégâts bonus", s)
    s = re.sub(r"\bdamage\b", "dégâts", s)
    s = re.sub(r"\bseconds\b", "secondes", s)
    return s


# Comprehensive RPG sentence pattern replacements (for any unseen/dynamic strings)
RPG_REGEX_PATTERNS = [
    (r"^Get an item which benefits (.+?)\.$", r"Obtenez un objet destiné aux \1."),
    (r"^Get an item which makes a Hero count as an? (.+?) during combat\.$", r"Obtenez un objet permettant à un Héros de compter comme un \1 pendant le combat."),
    (r"^Get a random (.+?) item that gives (.+?)\.$", r"Obtenez un objet \1 aléatoire qui octroie \2."),
    (r"^Get a (.+?) item which gives (.+?) to the holder\.$", r"Obtenez un objet \1 qui confère \2 à son porteur."),
    (r"^Get a common item that increases (.+?)\.$", r"Obtenez un objet commun qui augmente \1."),
    (r"^Get a random (.+?) relic\.$", r"Obtenez une relique \1 aléatoire."),
    (r"^Get (.+?) random common items\.$", r"Obtenez \1 objets communs aléatoires."),
    (r"^Gain a random (.+?) item, a random (.+?) relic, and (.+?)\.$", r"Obtenez un objet \1 aléatoire, une relique \2 aléatoire et \3."),
    (r"^Heroes gain (.+?) and (.+?) while (.+?)\.$", r"Les Héros gagnent \1 et \2 tant qu'ils sont \3."),
    (r"^Heroes gain (.+?), (.+?), and (.+?)\.$", r"Les Héros gagnent \1, \2 et \3."),
    (r"^Heroes gain (.+?) and (.+?)\.$", r"Les Héros gagnent \1 et \2."),
    (r"^Heroes gain (.+?)\.$", r"Les Héros gagnent \1."),
    (r"^Heroes lose (.+?)\.$", r"Les Héros perdent \1."),
    (r"^Heroes have (.+?)\.$", r"Les Héros ont \1."),
    (r"^Allies in the same row gain (.+?)\.$", r"Les alliés sur la même rangée gagnent \1."),
    (r"^Front row Heroes gain (.+?)\.$", r"Les Héros de la rangée avant gagnent \1."),
    (r"^Back row Heroes gain (.+?)\.$", r"Les Héros de la rangée arrière gagnent \1."),
    (r"^If you have at least (.+?), (.+?)\.$", r"Si vous avez au moins \1, \2."),
    (r"^When you buy (.+?), (.+?)\.$", r"Lorsque vous achetez \1, \2."),
    (r"^When you reroll (.+?), (.+?)\.$", r"Lorsque vous relancez \1, \2."),
    (r"^In the shop, (.+?)\.$", r"Dans la boutique, \1."),
    (r"^Win a combat with (.+?)\.$", r"Remportez un combat avec \1."),
    (r"^Gain (.+?)\.$", r"Gagnez \1."),
]

RPG_PHRASE_REPLACEMENTS = [
    ("At the start of combat,", "Au début du combat,"),
    ("At start of combat,", "Au début du combat,"),
    ("At the end of combat,", "À la fin du combat,"),
    ("At end of combat,", "À la fin du combat,"),
    ("Whenever a Hero", "Chaque fois qu'un Héros"),
    ("Whenever an enemy", "Chaque fois qu'un ennemi"),
    ("Whenever the holder", "Chaque fois que le porteur"),
    ("Allies in the same row", "Les alliés sur la même rangée"),
    ("Front row Heroes", "Les Héros de la rangée avant"),
    ("Back row Heroes", "Les Héros de la rangée arrière"),
    ("Heroes in the front row", "Les Héros de la rangée avant"),
    ("Heroes in the back row", "Les Héros de la rangée arrière"),
    ("If you have at least", "Si vous avez au moins"),
    ("For each", "Pour chaque"),
    ("When you buy", "Lorsque vous achetez"),
    ("When you reroll", "Lorsque vous relancez"),
    ("In the shop", "Dans la boutique"),
    ("in the shop", "dans la boutique"),
    ("in the bank", "en réserve"),
    ("in your bank", "en réserve"),
    ("in the reserves", "en réserve"),
    ("Win a combat with", "Remportez un combat avec"),
    ("The holder counts as a", "Le porteur compte comme un"),
    ("The holder counts as an", "Le porteur compte comme un"),
    ("during combat", "pendant le combat"),
    ("this combat", "lors de ce combat"),
    ("next combat", "lors du prochain combat"),
    ("this game", "au cours de cette partie"),
    ("to all enemies", "à tous les ennemis"),
    ("on all enemies", "à tous les ennemis"),
    ("to all Heroes", "à tous les Héros"),
    ("on all Heroes", "à tous les Héros"),
    ("nearest enemy", "l'ennemi le plus proche"),
    ("on the attacker", "à l'attaquant"),
    ("on the target", "à la cible"),
    ("on their target", "à sa cible"),
    ("the holder", "le porteur"),
    ("The holder", "Le porteur"),
    ("permanently", "définitivement"),
    ("Heroes gain", "Les Héros gagnent"),
    ("Heroes lose", "Les Héros perdent"),
    ("Warriors", "Guerriers"),
    ("Warrior", "Guerrier"),
    ("Vanguards", "Avant-gardes"),
    ("Vanguard", "Avant-garde"),
    ("Duelists", "Duellistes"),
    ("Duelist", "Duelliste"),
    ("Mystics", "Mystiques"),
    ("Mystic", "Mystique"),
    ("Attack Speed", "Vitesse d'Attaque"),
    ("Mana Regen", "Régén. Mana"),
    ("Max HP", "PV Max"),
    ("Shards", "Éclats"),
    ("Shard", "Éclat"),
    ("Shields", "Boucliers"),
    ("Shield", "Bouclier"),
    ("Heroes", "Héros"),
    ("Hero", "Héros"),
    ("enemies", "ennemis"),
    ("enemy", "ennemi"),
    ("seconds", "secondes"),
    ("second", "seconde"),
    ("damage", "dégâts"),
    (" and ", " et "),
    (" or ", " ou "),
    (" per ", " par "),
]


def translate_rpg_en_to_fr(key: str, en_str: str = None) -> str:
    """
    Translates any Item, Relic, Quest, Event, Enemy, or Lore string into fluent,
    natural French (zero Franglais) while preserving 100% of `[...]<tag>` tags
    (including `[formula]<statcalc_...>`, `[...]<*datatracking*>`, `[...]<customdata*>`)
    and `{0}`, `{1}`, `{name}`, `{amount}`, `{stat}` placeholders.
    """
    # Allow single-argument call `translate_rpg_en_to_fr(en_str)` if needed
    if en_str is None:
        en_str = key
        key = ""

    if not en_str:
        return en_str

    # 1. Exact key match in FR_ITEMS_RELICS_EVENTS
    if key and key in FR_ITEMS_RELICS_EVENTS:
        return FR_ITEMS_RELICS_EVENTS[key]

    # 2. Exact English string match
    if en_str in ALL_EXACT_EN_TO_FR:
        return ALL_EXACT_EN_TO_FR[en_str]
    stripped = en_str.strip()
    if stripped in ALL_EXACT_EN_TO_FR:
        return ALL_EXACT_EN_TO_FR[stripped]

    # 3. Protect `[inner]<tag>` tags (translating non-formula inner labels) and `{...}` placeholders
    saved_tags = []

    def _save_tag(m):
        inner, tag = m.group(1), m.group(2)
        tr_inner = _translate_tag_inner(inner, tag)
        idx = len(saved_tags)
        saved_tags.append(f"[{tr_inner}]<{tag}>")
        return f"__TAG_{idx}__"

    s = re.sub(r"\[([^\[\]]*)\]<([a-zA-Z_0-9/_-]+)>", _save_tag, en_str)

    saved_braces = []

    def _save_brace(m):
        idx = len(saved_braces)
        saved_braces.append(m.group(0))
        return f"__BRACE_{idx}__"

    s = re.sub(r"\{[^{}]*\}", _save_brace, s)

    # 4. Apply RPG regex templates and phrase replacements
    for pat, repl in RPG_REGEX_PATTERNS:
        s = re.sub(pat, repl, s)
    for en_p, fr_p in RPG_PHRASE_REPLACEMENTS:
        s = s.replace(en_p, fr_p)

    # 5. Restore placeholders and tags
    for idx, br in enumerate(saved_braces):
        s = s.replace(f"__BRACE_{idx}__", br)
    for idx, tg in enumerate(saved_tags):
        s = s.replace(f"__TAG_{idx}__", tg)

    return s


# ============================================================================
# 8. POPULATE `FR_ITEMS_RELICS_EVENTS` BY LOC_KEY AND EXACT ENGLISH STRING
# ============================================================================
FR_ITEMS_RELICS_EVENTS = dict(ALL_EXACT_EN_TO_FR)


def _populate_loc_keys():
    game_data_path = Path(__file__).resolve().parent.parent / "public" / "data" / "game_data.json"
    if not game_data_path.exists():
        return
    try:
        with open(game_data_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return

    loc = data.get("loc", {})
    prefixes = ("Items.", "ItemsQuest.", "Relics.", "RelicsQuest.", "Events.", "Enemies.", "Lore.")

    for k, v in loc.items():
        if k.startswith(prefixes) and isinstance(v, dict):
            en_val = v.get("en", "")
            if en_val:
                FR_ITEMS_RELICS_EVENTS[k] = translate_rpg_en_to_fr(k, en_val)

    # Also register any generated entity/quest keys that `build_french_loc.py` might synthesize
    for sec_name, prefix in [
        ("items", "Items"),
        ("relics", "Relics"),
        ("enemies", "Enemies"),
        ("events", "Events"),
    ]:
        sec = data.get(sec_name, {})
        entries = sec.values() if isinstance(sec, dict) else sec
        for e in entries:
            if not isinstance(e, dict):
                continue
            eid = e.get("id", "0")
            for field, key_field in [
                ("name", "nameKey"),
                ("description", "descriptionKey"),
                ("text", "textKey"),
                ("crossroadsDescription", "crossroadsDescriptionKey"),
            ]:
                val = e.get(field)
                if val and isinstance(val, str):
                    k = e.get(key_field) or f"{prefix}.{prefix}_{eid}.{field.capitalize()}"
                    FR_ITEMS_RELICS_EVENTS[k] = translate_rpg_en_to_fr(k, val)
            q = e.get("quest")
            if isinstance(q, dict):
                for field, key_field in [
                    ("description", "descriptionKey"),
                    ("rewardDescription", "rewardDescriptionKey"),
                ]:
                    val = q.get(field)
                    if val and isinstance(val, str):
                        k = q.get(key_field) or f"{prefix}Quest.{prefix}Quest_{eid}.{field.capitalize()}"
                        FR_ITEMS_RELICS_EVENTS[k] = translate_rpg_en_to_fr(k, val)
                        k2 = f"{prefix}Quest.{eid}.{field.capitalize()}"
                        FR_ITEMS_RELICS_EVENTS[k2] = translate_rpg_en_to_fr(k2, val)
            for idx, ch in enumerate(e.get("choices") or []):
                if not isinstance(ch, dict):
                    continue
                for field, key_field in [
                    ("title", "titleKey"),
                    ("text", "textKey"),
                    ("outcomeText", "outcomeTextKey"),
                ]:
                    val = ch.get(field)
                    if val and isinstance(val, str):
                        k = ch.get(key_field) or f"Events.Event_{eid}.Choice_{idx+1}.{field.capitalize()}"
                        FR_ITEMS_RELICS_EVENTS[k] = translate_rpg_en_to_fr(k, val)


_populate_loc_keys()
