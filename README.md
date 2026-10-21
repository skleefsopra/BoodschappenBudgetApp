# Boodschappen Budget App: stap 1, prijzen per ingrediënt

Haalt de actuele prijzen van AH, Jumbo en Lidl op (open dataset van Checkjebon) en van Aldi (aldi.nl)
en koppelt elk ingrediënt aan de passende producten per supermarkt, met de prijs
per gram, milliliter of stuk.

## Gebruik

    python3 bouw_prijzen.py          # maakt ingredientprijzen.json
    python3 rapport.py kipfilet uien # laat de koppelingen zien om te controleren
    python3 -m pytest tests          # tests

De dataset (10 MB) wordt 12 uur bewaard in `cache/`.

## Bestanden

- `ingredienten.json`: de 41 basisingrediënten met zoektermen. Hier voeg je ingrediënten toe of verbeter je een koppeling.
- `prijzen/maat.py`: leest verpakkingsgroottes uit ('2 x 75 ml', 'ca. 350 g', '18st.', 'per stuk').
- `prijzen/koppel.py`: zoekt per ingrediënt de producten en rekent uit hoeveel verpakkingen je nodig hebt.
- `ingredientprijzen.json`: de uitvoer, per ingrediënt de 5 goedkoopste producten per keten. Dit kleine bestand (±140 KB) gebruikt de app.

## Hoe een ingrediënt werkt

    {"naam": "eieren", "eenheid": "stuk", "stuk_gewicht": 60,
     "zoek": ["*eieren"], "niet": ["paas*", "chocolade*"], "min_maat": 6}

- `zoek`: woorden die allemaal in de productnaam moeten staan. `*` vooraan of achteraan staat
  ook samenstellingen toe: `*eieren` vindt `Scharreleieren`.
- `niet`: woorden waardoor een product afvalt. Er is ook een vaste lijst voor alle
  ingrediënten (diervoer, babyvoeding, kant-en-klaarmaaltijden, chips).
- Een product waarin het ingrediënt pas na "met" of "en" staat telt niet ("Brokken met tonijn").
- `stuk_gewicht`: om grammen en stuks in elkaar om te rekenen (1,5 kg appels = 8 stuks).
- `standaard_maat`: voor producten zonder maat, zoals Lidl "Komkommer". Die prijzen krijgen `"geschat": true`.
- `min_maat` en `max_maat`: houden te kleine of te grote verpakkingen buiten de selectie.

## Wat je moet weten over de data

- AH en Jumbo zijn goed: vrijwel alle producten hebben een maat.
- Lidl komt via boodschaapje.nl en is gebaseerd op kassabonnen. Namen zijn afgekort
  ("Goudse 30+ jong bel.") en driekwart van de producten heeft geen maat. Daardoor
  ontbreken soms dingen (losse bananen, verse broccoli) en zijn sommige Lidl-prijzen geschat.
- Proefmandje van 18 basisproducten voor een week: Jumbo € 39,14, AH € 42,00, Lidl € 43,44.
  Het hogere Lidl-bedrag komt deels doordat Lidl-verpakkingen in de data ontbreken.
- Lidl-aanbiedingen komen daarnaast rechtstreeks van lidl.nl (`prijzen/lidl.py`). Lidl zet alleen de folder online,
  niet het vaste assortiment: zo'n 40 etenswaren, met prijs en verpakking. Alleen acties die nu lopen of binnen een
  week beginnen tellen mee; zo'n kandidaat heeft `"bron": "lidl.nl"` en `geldig_van`/`geldig_tot`. Volgorde voor
  Lidl: eigen prijzen, dan lidl.nl, dan boodschaapje. Is lidl.nl onbereikbaar, dan gaat het bouwen gewoon door
  zonder aanbiedingen. De folder wordt 12 uur bewaard in `cache/lidl.json`.
- Aldi staat niet in Checkjebon en komt helemaal van aldi.nl (`prijzen/aldi.py`): de aanbiedingen van deze en volgende
  week, plus de vaste prijs van elk product waarvan de naam op een zoekterm uit `ingredienten.json` lijkt (een paar
  honderd productpagina's, duurt een paar minuten). Een aanbieding heeft `"bron": "aldi.nl"` met `geldig_van`/`geldig_tot`,
  een vaste prijs alleen `"bron": "aldi.nl"`. Eigen prijzen gaan voor. Is aldi.nl onbereikbaar, dan heeft Aldi geen
  prijzen. Alles wordt 12 uur bewaard in `cache/aldi.json`.

# Stap 2: recepten en porties

- `recepten.json`: je vaste recepten (poke bowl, pasta bolognese, AVG met biefstuk, gym maaltijd, smash burger).
- `huishouden.json`: personen met een portiefactor, het weekbudget en de supermarkten om te vergelijken.
- `prijzen/recepten.py`: controleert recepten, rekent ze om naar het huishouden en maakt een boodschappenlijst per supermarkt.

## Een eigen recept toevoegen

Hoeveelheden zijn voor één volwassen portie, in de eenheid van het ingrediënt (g, ml of stuk):

    {"naam": "Spaghetti bolognese", "type": "diner", "bron": "eigen",
     "ingredienten": [{"naam": "spaghetti", "hoeveelheid": 100},
                      {"naam": "rundergehakt", "hoeveelheid": 125},
                      {"naam": "knoflook", "hoeveelheid": 0.1}],
     "bereiding": "Gehakt rul bakken, ..."}

- `type` is `ontbijt`, `lunch` of `diner`.
- Brood is in hele broden: één snee is ongeveer 0,045. Knoflook is in bollen: één teen is ongeveer 0,1.
- Een ingrediënt dat nog niet in `ingredienten.json` staat, voeg je daar eerst toe. De tests melden een onbekend ingrediënt of een verkeerde eenheid.

## Personen en porties

    {"personen": [{"naam": "Sander", "factor": 1.0}, {"naam": "kind", "factor": 0.6}],
     "budget_per_week": 50, "supermarkten": ["ah", "jumbo", "lidl"]}

Een factor van 0,6 betekent 60% van een volwassen portie. Alle recepten schalen mee met de som van de factoren.

# Zelf prijzen invullen (vooral voor Lidl)

Als de dataset een product of verpakkingsgrootte mist, vul je die zelf in via `eigen_prijzen.json`:

    {"lidl": {
        "bananen":   [{"product": "Bananen tros", "prijs": 1.29, "maat": "5 stuks", "datum": "2026-10-21"}],
        "paprika":   [{"product": "Paprika rood", "prijs": 0.89, "maat": "1 stuk"}],
        "komkommer": [{"product": "Komkommer", "prijs": 0.75, "maat": "1 stuk"}]
    }}

- De naam van het ingrediënt moet gelijk zijn aan die in `ingredienten.json`.
- `maat` schrijf je zoals op het schap of de kassabon: `500 g`, `1 kg`, `6 x 1 L`, `10 stuks`. Dit wordt omgerekend
  naar de eenheid van het ingrediënt (bananen in stuks: `1,8 kg` wordt 10 stuks).
- `datum` is optioneel, maar handig om te zien welke prijzen oud worden.
- Een zelf ingevuld product vervangt de geschatte producten van die supermarkt voor dat ingrediënt. Producten met
  een echte maat uit de dataset blijven meedoen, en de goedkoopste wint.
- Het werkt voor elke supermarkt, niet alleen Lidl.

`python3 bouw_prijzen.py` toont na het bouwen per supermarkt welke ingrediënten geen product hebben of alleen een
geschatte maat. Dat is je lijstje om in te vullen. In de telefoon-app (stap 4) komt hier een invulscherm voor.

# Stap 3: waar zijn je recepten het goedkoopst?

Je hebt vaste recepten in `recepten.json` (nu 5 diners). Per week vergelijkt de app wat die recepten samen kosten bij
AH, Jumbo, Lidl en Aldi, en maakt hij de boodschappenlijst voor de winkel die je kiest. De app stelt zelf geen recepten voor.

    python3 vergelijk.py                   # weekbedrag en kassabon per supermarkt
    python3 vergelijk.py jumbo             # plus de boodschappenlijst voor één supermarkt
    python3 vergelijk.py --dag 2026-10-26  # voor een andere boodschappendag

- Per recept stel je in de app in hoe vaak je het deze week maakt (0 tot 7 keer, standaard 1).
- **Twee bedragen.** Houdbare producten (`"houdbaar": true` in `ingredienten.json`, zoals rijst, pasta en sriracha mayo)
  tellen voor het weekbedrag alleen mee voor wat je deze week gebruikt. De kassabon is wat je nu afrekent.
- Een winkel waar een ingrediënt in de gegevens ontbreekt, komt achteraan met de lijst van wat mist. Vul het aan bij Prijzen.
- **Voorraad.** Wat je al in huis hebt (`"voorraad"` in `huishouden.json`, of bij Huishouden in de app) wordt niet gekocht.
- Aanbiedingen van lidl.nl en aldi.nl tellen alleen mee als ze op de boodschappendag geldig zijn.

Een recept toevoegen of wijzigen gaat via `recepten.json`; hoeveelheden zijn per volwassen portie.

# Stap 4: de app op je telefoon

De app staat in `web/` en is een web-app die je op je beginscherm zet. Hij rekent de vergelijking op de telefoon zelf
uit (`web/planner.js`, hetzelfde rekenwerk als `prijzen/recepten.py`) en heeft alleen de drie bestanden in `web/data/` nodig.

    python3 bouw_prijzen.py && python3 bouw_web.py   # nieuwe prijzen in de app zetten
    cd web && python3 -m http.server 8000             # proberen op http://localhost:8000
    node --test web/tests/planner.test.mjs            # tests van het rekenwerk in de app

Schermen:
- **Week**: per supermarkt het weekbedrag en de kassabon voor je recepten, en hoe vaak je elk recept deze week maakt.
  Tik een winkel aan om die te kiezen.
- **Lijst**: de boodschappenlijst als kassabon, met afvinken. Productnamen linken naar de winkel.
- **Recepten**: je vaste recepten met de prijs per supermarkt.
- **Prijzen**: wat per winkel ontbreekt of geschat is. Tik erop en vul prijs en verpakking in.
- **Huishouden**: budget, wie er meeeet (met portiegrootte), welke winkels, en wat je al in huis hebt.

Je instellingen, recepten en prijzen blijven op je telefoon (in de browser). Ze gaan niet naar een server.

## Installeren op je telefoon

Open het adres van de app in Safari (iPhone) of Chrome (Android).
- iPhone: deelknop, dan "Zet op beginscherm".
- Android: menu met drie puntjes, dan "App installeren" of "Toevoegen aan startscherm".

## Wekelijks bijwerken

`.github/workflows/prijzen.yml` haalt nieuwe prijzen op, draait de tests en zet de app op GitHub Pages. Hij draait
alleen als je hem zelf start: op GitHub ga je naar Actions, kies je "Prijzen en app bijwerken" en klik je op
"Run workflow". Doe dat ook na een wijziging in de code, anders komt die niet in de app. In de repository staat bij
Settings > Pages de bron op "GitHub Actions".
