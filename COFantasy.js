// jshint undef:true
// jshint eqeqeq:false
/* globals Set */
/* globals getAttrByName */
/* globals findObjs */
/* globals _ */
/* globals createObj */
/* globals log */
/* globals sendChat */
/* globals state */
/* globals Campaign */
/* globals getObj */
/* globals randomInteger */
/* globals spawnFx */
/* globals spawnFxBetweenPoints */
/* globals VecMath */
/* globals on */
/* globals toFront */
/* globals playerIsGM */
/* globals HealthColors */

// Needs the Vector Math scripty

var COF_loaded = false;

var COFantasy = COFantasy || function() {

  "use strict";

  var PIX_PER_UNIT = 70;
  var HISTORY_SIZE = 150;
  var eventHistory = [];
  var updateNextInitSet = new Set();

  var BS_LABEL = 'text-transform: uppercase; display: inline; padding: .2em .6em .3em; font-size: 75%; line-height: 2; color: #fff; text-align: center; white-space: nowrap; vertical-align: baseline; border-radius: .25em;';
  var BS_LABEL_DEFAULT = 'background-color: #777;';
  var BS_LABEL_PRIMARY = 'background-color: #337ab7;';
  var BS_LABEL_SUCCESS = 'background-color: #5cb85c;';
  var BS_LABEL_INFO = 'background-color: #5bc0de;';
  var BS_LABEL_WARNING = 'background-color: #f0ad4e;';
  var BS_LABEL_DANGER = 'background-color: #d9534f;';

  var bs_alert = 'padding: 5px; border: 1px solid transparent; border-radius: 4px;';
  var bs_alert_success = 'color: #3c763d; background-color: #dff0d8; border-color: #d6e9c6;';
  var bs_alert_danger = 'color: #a94442; background-color: #f2dede; border-color: #ebccd1;';

  var defaultOptions = {
    regles: {
      explications: "Options qui influent sur les règles du jeu",
      type: 'options',
      val: {
        blessures_graves: {
          explications: "Si les DMs dépassent CON+niveau, ou si on arrive à 0 PV, on perd un PR, et si plus de PR, affaibli.",
          val: true,
          type: 'bool'
        },
        dm_minimum: {
          explications: "Dégâts minimum d'une attaque ou autre source de DM.",
          val: 0,
          type: 'int'
        },
        forme_d_arbre_amelioree: {
          explications: "+50% à l'effet de la peau d'écorce en forme d'arbre.",
          val: true,
          type: 'bool'
        },
        initiative_variable: {
          explications: "Ajoute 1d6 à l'initiative, lancé une fois par combat",
          val: false,
          type: 'bool'
        },
        usure_DEF: {
          explications: "Malus de -2 en DEF tous les n tours. Mettre à 0 pour ne pas avoir de malus d'usure",
          val: 5,
          type: 'int'
        },
        mana_totale: {
          explications: "Tous les sorts ont un coût, celui des tempêtes de mana est multiplié par 3",
          val: false,
          type: 'bool'
        },
      }
    },
    affichage: {
      explications: "Options d'affichage",
      type: 'options',
      val: {
        MJ_voit_actions: {
          explications: "À chaque nouveau personnage en combat, montre le choix d'actions au MJ, même pour les PJs.",
          val: false,
          type: 'bool'
        },
        avatar_dans_cadres: {
          explications: "Si faux, on utilise l'image du token.",
          val: true,
          type: 'bool'
        },
        manoeuvres: {
          explications: "Affiche les manoeuvres dans la liste d'actions",
          val: true,
          type: 'bool'
        },
      }
    },
    images: {
      explications: "Images par défaut",
      type: 'options',
      val: {
        image_double: {
          explications: 'Image utilisée pour la capacité dédoublement',
          type: 'image',
          val: "https://s3.amazonaws.com/files.d20.io/images/33854984/q10B3KtWsCxcMczLo4BSUw/thumb.png?1496303265"
        },
        image_ombre: {
          explications: "Image utilisée pour l'ombre mortelle",
          type: 'image',
          val: "https://s3.amazonaws.com/files.d20.io/images/2781735/LcllgIHvqvu0HAbWdXZbJQ/thumb.png?13900368485"
        },
        image_arbre: {
          explications: "Image utilisée pour la forme d'arbre",
          type: 'image',
          val: "https://s3.amazonaws.com/files.d20.io/images/52767134/KEGYUXeKnxZr5dbDwQEO4Q/thumb.png?15248300835"
        },
      }
    }
  };

  function copyOptions(dst, src) {
    for (var o in src) {
      var opt = src[o];
      var isOption = opt.type == 'options';
      if (dst[o] === undefined) {
        dst[o] = {
          explications: opt.explications,
          val: {},
          type: opt.type,
        };
        if (!isOption) dst[o].val = opt.val;
      }
      if (isOption) copyOptions(dst[o].val, opt.val);
    }
  }

  var aura_token_on_turn = false;
  var stateCOF = state.COFantasy;

  function setStateCOF() {
    stateCOF = state.COFantasy;
    if (stateCOF.options === undefined) stateCOF.options = {};
    copyOptions(stateCOF.options, defaultOptions);
  }

  // List of states:
  var cof_states = {
    assome: 'status_pummeled',
    mort: 'status_dead',
    surpris: 'status_lightning-helix',
    renverse: 'status_back-pain',
    aveugle: 'status_bleeding-eye',
    affaibli: 'status_half-heart',
    etourdi: 'status_half-haze',
    paralyse: 'status_fishing-net',
    ralenti: 'status_snail',
    immobilise: 'status_cobweb',
    endormi: 'status_sleepy',
    apeure: 'status_screaming',
    invisible: 'status_ninja-mask',
    blessé: 'status_arrowed',
    encombre: 'status_frozen-orb'
  };

  function etatRendInactif(etat) {
    var res =
      etat == 'mort' || etat == 'surpris' || etat == 'assome' ||
      etat == 'etourdi' || etat == 'paralyse' || etat == 'endormi' ||
      etat == 'apeure';
    return res;
  }

  function error(msg, obj) {
    log(msg);
    log(obj);
    sendChat("COFantasy", msg);
  }

  // retourne un tableau contenant la liste des ID de joueurs connectés controlant le personnage lié au Token
  function getPlayerIds(perso) {
    var character = getObj('character', perso.charId);
    if (character === undefined) return;
    var charControlledby = character.get('controlledby');
    if (charControlledby === '') return [];
    var playerIds = [];
    charControlledby.split(",").forEach(function(controlledby) {
      var player = getObj('player', controlledby);
      if (player === undefined) return;
      if (player.get('online')) playerIds.push(controlledby);
    });
    return playerIds;
  }

  function persoEstPNJ(perso) {
    if (perso.pnj) return true;
    var typePerso = getAttrByName(perso.charId, 'type_personnage');
    return typePerso == 'PNJ';
  }

  var attackNameRegExp = new RegExp(/^(repeating_armes_.*_)armenom$/);
  var attackNamePNJRegExp = new RegExp(/^(repeating_pnj.*_)armenom$/);

  //Met perso.pnj à true si on a un PNJ
  function getAttack(attackLabel, perso) {
    var res;
    var attributes = findObjs({
      _type: 'attribute',
      _characterid: perso.charId,
    });
    var findAttack = function(n) {
      return attackNameRegExp.exec(n);
    };
    if (perso.pnj) {
      findAttack = function(n) {
        return attackNamePNJRegExp.exec(n);
      };
    }
    var trouve;
    attributes.forEach(function(a) {
      if (trouve) return;
      if (a.get('name').toLowerCase() == 'type_personnage') {
        trouve = true;
        if (a.get('current') == 'PNJ') {
          perso.pnj = true;
          findAttack = function(n) {
            return attackNamePNJRegExp.exec(n);
          };
        }
      }
    });
    attributes.forEach(function(a) {
      if (res) return;
      var an = a.get('name');
      var m = findAttack(an);
      if (m) {
        var attPrefix = m[1];
        var weaponName = a.get('current');
        if (weaponName === undefined || weaponName === "") {
          error("Pas de nom pour une attaque");
          return;
        }
        var weaponLabel = weaponName.split(' ', 1)[0];
        if (weaponLabel == attackLabel) {
          weaponName = weaponName.substring(weaponName.indexOf(' ') + 1);
          res = {
            attackPrefix: attPrefix,
            weaponName: weaponName
          };
        }
      }
    });
    return res;
  }

  function getPictoStyleFromCommand(fullCommand, perso) {
    if (fullCommand === undefined) return {
      picto: '',
      style: ''
    };
    var style = '';
    var picto = '';
    var command = fullCommand.split(' ');
    // Pictos : https://wiki.roll20.net/CSS_Wizardry#Pictos
    switch (command[0]) {
      case "#Attaque":
      case "!cof-attack":
      case "!cof-attaque":
        var portee = 0;
        if (command.length > 3) {
          var attackLabel = command[3];
          if (!attackLabel.startsWith('?')) {
            var att = getAttack(attackLabel, perso);
            if (att !== undefined) {
              portee = getPortee(perso.charId, att.attackPrefix);
            } else {
              var thisWeapon = [];
              try {
                thisWeapon = JSON.parse(attackLabel);
                if (Array.isArray(thisWeapon) && thisWeapon.length > 4) {
                  portee = thisWeapon[4];
                }
              } catch (e) {
                log("Impossible de trouver la portée pour " + attackLabel);
              }
            }
          }
        }
        if (fullCommand.indexOf('--sortileg') !== -1) {
          // attaque magique
          picto = '<span style="font-family: \'Pictos Three\'">g</span> ';
          style = 'background-color:#9900ff';
        } else if (portee > 0) {
          // attaque distance
          picto = '<span style="font-family: \'Pictos Custom\'">[</span> ';
          style = 'background-color:#48b92c';
        } else {
          // attaque contact
          picto = '<span style="font-family: \'Pictos Custom\'">t</span> ';
          style = 'background-color:#cc0000';
        }
        break;
      case "!cof-lancer-sort":
      case "!cof-injonction":
        picto = '<span style="font-family: \'Pictos Three\'">g</span> ';
        style = 'background-color:#9900ff';
        break;
      case "!cof-soin":
      case "!cof-transe-guerison":
        picto = '<span style="font-family: \'Pictos\'">k</span> ';
        style = 'background-color:#ffe599;color:#333';
        break;
      case "!cof-effet":
      case "!cof-effet-temp":
      case "!cof-effet-combat":
        picto = '<span style="font-family: \'Pictos\'">S</span> ';
        style = 'background-color:#4a86e8';
        break;
      case "!cof-enduire-poison":
        picto = '<span style="font-family: \'Pictos Three\'">i</span> ';
        style = 'background-color:#05461c';
        break;
      case "!cof-desarmer":
        picto = '<span style="font-family: \'Pictos Custom\'">t</span> ';
        style = 'background-color:#cc0000';
        break;
      case "!cof-surprise":
        picto = '<span style="font-family: \'Pictos\'">e</span> ';
        style = 'background-color:#4a86e8';
        break;
      case "!cof-recharger":
        picto = '<span style="font-family: \'Pictos\'">0</span> ';
        style = 'background-color:#e69138';
        break;
      case "!cof-action-defensive":
        picto = '<span style="font-family: \'Pictos Three\'">b</span> ';
        style = 'background-color:#cc0000';
        break;
      case "!cof-manoeuvre":
        picto = '<span style="font-family: \'Pictos Three\'">d</span> ';
        style = 'background-color:#cc0000';
        break;
      case "!cof-attendre":
        picto = '<span style="font-family: \'Pictos\'">t</span> ';
        style = 'background-color:#999999';
        break;
      case "!cof-aoe": //deprecated
      case "!cof-dmg":
        picto = '<span style="font-family: \'Pictos\'">\'</span> ';
        style = 'background-color:#cc0000';
        break;
      case "!cof-peur":
        picto = '<span style="font-family: \'Pictos\'">`</span> ';
        style = 'background-color:#B445FE';
        break;
      case "!cof-consommables":
        picto = '<span style="font-family: \'Pictos\'">b</span> ';
        style = 'background-color:#ce0f69';
        break;
      case "!cof-liste-actions":
        picto = '<span style="font-family: \'Pictos\'">l</span> ';
        style = 'background-color:#272751';
        break;
      default:
        picto = '';
        style = '';
    }
    return {
      picto: picto,
      style: style
    };
  }

  function getState(personnage, etat) {
    var token = personnage.token;
    var charId = personnage.charId;
    var res = false;
    if (token !== undefined) {
      res = token.get(cof_states[etat]);
      if (token.get('bar1_link') === "") return res;
      // else, look for the character value, if any
      if (charId === undefined) charId = token.get('represents');
    }
    if (charId === "") {
      error("token with a linked bar1 but representing no character", token);
      return false;
    }
    if (etat == 'affaibli') { //special case due to new character sheet
      var de = parseInt(getAttrByName(charId, 'ETATDE'));
      if (de === 20) {
        if (res && token !== undefined) token.set(cof_states[etat], false);
        return false;
      } else if (de === 12) {
        if (!res && token !== undefined) token.set(cof_states[etat], true);
        return true;
      }
    }
    var attr = findObjs({
      _type: 'attribute',
      _characterid: charId,
      name: etat
    });
    if (attr.length === 0) {
      if (res && token !== undefined) token.set(cof_states[etat], false);
      return false;
    }
    if (!res && token !== undefined) token.set(cof_states[etat], true);
    return true;
  }

  //Met le champ field à value du token dans evt, pour permettre le undo
  function affectToken(token, field, value, evt) {
    evt.affectes = evt.affectes || {};
    var aff = evt.affectes[token.id];
    if (aff === undefined) {
      aff = {
        affecte: token,
        prev: {}
      };
      evt.affectes[token.id] = aff;
    }
    if (aff.prev[field] === undefined) aff.prev[field] = value;
    return aff;
  }

  function estAffaibli(perso) {
    if (getState(perso, 'affaibli')) return true;
    if (getState(perso, 'blessé')) return true;
    return false;
  }

  function setToken(token, field, newValue, evt) {
    var prevValue = token.get(field);
    affectToken(token, field, prevValue, evt);
    token.set(field, newValue);
  }

  function isActive(perso) {
    var inactif =
      getState(perso, 'mort') || getState(perso, 'surpris') ||
      getState(perso, 'assome') || getState(perso, 'etourdi') ||
      getState(perso, 'paralyse') || getState(perso, 'endormi') ||
      getState(perso, 'apeure') || attributeAsBool(perso, 'statueDeBois');
    return !inactif;
  }

  function sendChar(charId, msg) {
    var dest = '';
    if (charId) dest = 'character|' + charId;
    sendChat(dest, msg);
  }

  //Chuchote le message à tous les joueurs présents qui controllent le 
  //personnage, plus le MJ
  function whisperChar(charId, msg) {
    var character = getObj('character', charId);
    if (character) {
      var controlled = character.get('controlledby');
      if (controlled.includes('all')) sendChar(charId, msg);
      else {
        controlled.split(',').forEach(function(c) {
          if (c !== '' && !playerIsGM(c)) {
            var p = getObj('player', c);
            if (p && p.get('online')) {
              sendChar(charId, '/w "' + p.get('_displayname') + '" ' + msg);
            }
          }
        });
        sendChar(charId, "/w GM " + msg);
      }
    } else {
      sendChar(charId, "/w GM " + msg);
    }
  }

  //Renvoie 1dk + bonus, avec le texte
  //champs val et roll
  function rollDePlus(de, bonus) {
    bonus = bonus || 0;
    var jetDe = randomInteger(de);
    var roll = jetDe;
    var res = {
      val: jetDe + bonus
    };
    var msg = '<span style="display: inline-block; border-radius: 5px; padding: 0 4px; background-color: #F1E6DA; color: #000;" title="1d';
    msg += de;
    if (bonus > 0) {
      msg += '+' + bonus;
      roll += '+' + bonus;
    } else if (bonus < 0) {
      msg += bonus;
      roll += bonus;
    }
    msg += ' = ' + roll + '" class="a inlinerollresult showtip tipsy-n">';
    msg += res.val + "</span>";
    res.roll = msg;
    return res;
  }

  //fonction avec callback, mais synchrone
  function soigneToken(perso, soins, evt, callTrue, callMax) {
    var token = perso.token;
    var bar1 = parseInt(token.get("bar1_value"));
    var pvmax = parseInt(token.get("bar1_max"));
    if (isNaN(bar1) || isNaN(pvmax)) {
      error("Soins sur un token sans points de vie", token);
      return;
    }
    var updateBar1;
    if (bar1 >= pvmax) bar1 = pvmax;
    else updateBar1 = true;
    if (soins < 0) soins = 0;
    if (bar1 === 0) {
      if (attributeAsBool(perso, 'etatExsangue')) {
        removeTokenAttr(perso, 'etatExsangue', evt, "retrouve des couleurs");
      }
    }
    if (charAttributeAsBool(perso, 'vieArtificielle')) {
      soins = Math.floor(soins / 2);
    }
    bar1 += soins;
    var soinsEffectifs = soins;
    if (bar1 > pvmax) {
      if (attributeAsBool(perso, 'formeDArbre')) {
        var apv = tokenAttribute(perso, 'anciensPV');
        if (apv.length > 0) {
          apv = apv[0];
          var anciensPV = parseInt(apv.get('current'));
          var anciensMax = parseInt(apv.get('max'));
          if (!(isNaN(anciensPV) || isNaN(anciensMax)) &&
            anciensPV < anciensMax) {
            anciensPV += bar1 - pvmax;
            soinsEffectifs += bar1 - pvmax;
            if (anciensPV > anciensMax) {
              soinsEffectifs -= anciensPV - anciensMax;
              anciensPV = anciensMax;
            }
            setTokenAttr(perso, 'anciensPV', anciensPV, evt, undefined, anciensMax);
          }
        }
      }
      soinsEffectifs -= (bar1 - pvmax);
      bar1 = pvmax;
    }
    if (updateBar1) updateCurrentBar(token, 1, bar1, evt);
    if (soinsEffectifs > 0) {
      if (callTrue) callTrue(soinsEffectifs);
    } else {
      if (callMax) callMax();
    }
  }

  function setState(personnage, etat, value, evt) {
    var token = personnage.token;
    var charId = personnage.charId;
    var aff =
      affectToken(token, 'statusmarkers', token.get('statusmarkers'), evt);
    if (value && etatRendInactif(etat) && isActive(personnage)) {
      if (etat != 'surpris' || !surveillance(personnage))
        removeFromTurnTracker(token.id, evt);
    }
    token.set(cof_states[etat], value);
    if (!value) { //On enlève le save si il y en a un
      removeTokenAttr(personnage, etat + 'Save', evt);
    }
    var pageId = token.get('pageid');
    if (etat == 'aveugle') {
      // We also change vision of the token
      if (aff.prev.light_losangle === undefined)
        aff.prev.light_losangle = token.get('light_losangle');
      if (value) token.set('light_losangle', 0);
      else token.set('light_losangle', 360);
    } else if (value && etat == 'mort') {
      //On libère les personnages enveloppés, si il y en a.
      var attrEnveloppe = tokenAttribute(personnage, 'enveloppe');
      attrEnveloppe.forEach(function(a) {
        var cible = tokenOfIdName(a.get('current'), pageId);
        if (cible) {
          evt.deletedAttributes = evt.deletedAttributes || [];
          var attrCible = tokenAttribute(cible, 'enveloppePar');
          attrCible.forEach(function(a) {
            var cube = tokenOfIdName(a.get('current', pageId));
            if (cube.token.id == personnage.id) {
              sendChar(cible.charId, 'se libère de ' + cube.tokName);
              toFront(cible.token);
              evt.deletedAttributes.push(a);
              a.remove();
            }
          });
        }
        evt.deletedAttributes.push(a);
        a.remove();
      });
      if (charAttributeAsBool(personnage, 'armeeConjuree')) {
        removeFromTurnTracker(personnage.token.id, evt);
        personnage.token.remove();
        sendChar(personnage.charId, 'disparaît');
        var armeeChar = getObj('character', personnage.charId);
        if (armeeChar) {
          evt.deletedCharacters = evt.deletedCharacters || [];
          evt.deletedCharacters.push({
            id: personnage.charId,
            name: armeeChar.get('name'),
            avatar: armeeChar.get('avatar'),
            attributes: findObjs({
              _type: 'attributes',
              _characterid: personnage.charId
            }),
            abilities: findObjs({
              _type: 'ability',
              _characterid: personnage.charId
            })
          });
          armeeChar.remove();
        }
      } else if (!estNonVivant(personnage)) {
        //Cherche si certains peuvent siphoner l'âme
        var allToks =
          findObjs({
            _type: "graphic",
            _pageid: pageId,
            _subtype: "token",
            layer: "objects"
          });
        allToks.forEach(function(tok) {
          if (tok.id == token.id) return;
          var ci = tok.get('represents');
          if (ci === '') return;
          var p = {
            token: tok,
            charId: ci
          };
          if (getState(p, 'mort')) return;
          if (distanceCombat(token, tok, pageId) > 20) return;
          if (charIdAttributeAsBool(ci, 'siphonDesAmes')) {
            var bonus = charIdAttributeAsBool(ci, 'siphonDesAmes', 0);
            var soin = rollDePlus(6, bonus);
            soigneToken(p, soin.val, evt,
              function(s) {
                var siphMsg = "siphone l'âme de " + token.get('name') +
                  ". Il récupère ";
                if (s == soin.val) siphMsg += soin.roll + " pv.";
                else siphMsg += s + " pv (jet " + soin.roll + ").";
                sendChar(ci, siphMsg);
              },
              function() {
                sendChar(ci, "est déjà au maximum de point de vie. Il laisse échapper l'âme de " + token.get('name'));
              });
          }
        });
      }
    }
    if (token.get('bar1_link') !== "") {
      if (charId === '') {
        error("token with a linked bar1 but representing no character", token);
        return;
      }
      if (etat == 'affaibli') { //special case due to new character sheet
        var attr =
          findObjs({
            _type: 'attribute',
            _characterid: charId,
            name: 'ETATDE'
          }, {
            caseInsensitive: true
          });
        if (value) {
          if (attr.length === 0) {
            attr =
              createObj('attribute', {
                characterid: charId,
                name: 'ETATDE',
                current: 12
              });
            if (evt.attributes)
              evt.attributes.push({
                attribute: attr,
                current: null
              });
            else evt.attributes = [{
              attribute: attr,
              current: null
            }];
          } else {
            attr = attr[0];
            if (parseInt(attr.get('current')) != 12) {
              if (evt.attributes)
                evt.attributes.push({
                  attribute: attr,
                  current: 20
                });
              else evt.attributes = [{
                attribute: attr,
                current: 20
              }];
              attr.set('current', 12);
            }
          }
        } else {
          if (attr.length > 0) {
            attr = attr[0];
            if (parseInt(attr.get('current')) != 20) {
              if (evt.attributes)
                evt.attributes.push({
                  attribute: attr,
                  current: 12
                });
              else evt.attributes = [{
                attribute: attr,
                current: 12
              }];
              attr.set('current', 20);
            }
          }
        }
      } else {
        var attrEtat =
          findObjs({
            _type: 'attribute',
            _characterid: charId,
            name: etat
          });
        if (value) {
          if (attrEtat.length === 0) {
            attrEtat =
              createObj('attribute', {
                characterid: charId,
                name: etat,
                current: value
              });
            if (evt.attributes)
              evt.attributes.push({
                attribute: attrEtat,
                current: null
              });
            else evt.attributes = [{
              attribute: attrEtat,
              current: null
            }];
          }
        } else {
          if (attrEtat.length > 0) {
            attrEtat[0].remove();
            if (evt.deletedAttributes) {
              evt.deletedAttributes.push(attrEtat[0]);
            } else {
              evt.deletedAttributes = [attrEtat[0]];
            }
          }
        }
      }
    }
    if (!value && etatRendInactif(etat) && isActive(personnage) ||
      etat == 'aveugle') updateInit(token, evt);
  }

  function logEvents() {
    var l = eventHistory.length;
    log("Historique de taille " + l);
    eventHistory.forEach(function(evt, i) {
      log("evt " + i);
      log(evt);
    });
  }

  function addEvent(evt) {
    evt.id = stateCOF.eventId++;
    eventHistory.push(evt);
    if (eventHistory.length > HISTORY_SIZE) {
      eventHistory.shift();
    }
  }

  function findEvent(id) {
    return eventHistory.find(function(evt) {
      return (evt.id == id);
    });
  }

  function lastEvent() {
    var l = eventHistory.length;
    if (l === 0) return undefined;
    return eventHistory[l - 1];
  }

  //Si evt n'est pas défini, annule le dernier evt
  function undoEvent(evt) {
    if (evt === undefined) {
      if (eventHistory.length === 0) {
        sendChat('COF', "/w GM Historique d'évènements vide");
        return;
      }
      evt = eventHistory.pop();
    } else {
      eventHistory = eventHistory.filter(function(e) {
        return (e.id != evt.id);
      });
    }
    if (evt === undefined) {
      error("No event to undo", eventHistory);
      return;
    }
    sendChat("COF", "/w GM undo " + evt.type);
    if (evt.affectes) undoTokenEffect(evt);
    if (evt.attributes) {
      // some attributes where modified too
      evt.attributes.forEach(function(attr) {
        if (attr.current === null) attr.attribute.remove();
        else {
          attr.attribute.set('current', attr.current);
          if (attr.max) attr.attribute.set('max', attr.max);
        }
      });
    }
    if (evt.deletedCharacters) {
      evt.deletedCharacters.forEach(function(character) {
        var nameDel = character.name;
        log("Restoring character " + nameDel);
        var newCharacter =
          createObj('character', {
            name: nameDel,
            avatar: character.avatar
          });
        var charId = newCharacter.id;
        var tokens = findObjs({
          _type: 'graphic',
          represents: character.id
        });
        tokens.forEach(function(tok) {
          tok.set('represents', charId);
        });
        eventHistory.forEach(function(evt) {
          if (evt.characters) {
            evt.characters = evt.characters.map(function(oldCharac) {
              if (oldCharac.id == character.id) return newCharacter;
              return oldCharac;
            });
          }
          if (evt.deletedAttributes) {
            evt.deletedAttributes.forEach(function(attr) {
              if (attr.id == character.id) attr.newCharId = charId;
            });
          }
        });
        //Maintenant on remet les attributs
        if (character.attributes) {
          character.attributes.forEach(function(attr) {
            var oldId = attr.id;
            var newAttr = createObj('attribute', {
              characterid: charId,
              name: attr.get('name'),
              current: attr.get('current'),
              max: attr.get('max')
            });
            eventHistory.forEach(function(evt) {
              if (evt.attributes) {
                evt.attributes.forEach(function(attr) {
                  if (attr.attribute.id == oldId) attr.attribute = newAttr;
                });
              }
            });
            tokens.forEach(function(tok) {
              if (tok.get('bar1_link') == oldId)
                tok.set('bar1_link', newAttr.id);
            });
          });
        }
        if (character.abilities) {
          character.abilities.forEach(function(ab) {
            var newAb = createObj('ability', {
              characterid: charId,
              name: ab.get('name'),
              action: ab.get('action'),
              istokenaction: ab.get('istokenaction')
            });
          });
        }
      });
    }
    // deletedAttributes have a quadratic cost in the size of the history
    if (evt.deletedAttributes) {
      evt.deletedAttributes.forEach(function(attr) {
        var oldId = attr.id;
        var nameDel = attr.get('name');
        log("Restoring attribute " + nameDel);
        var newAttr =
          createObj('attribute', {
            characterid: attr.newCharId || attr.get('characterid'),
            name: nameDel,
            current: attr.get('current'),
            max: attr.get('max')
          });
        eventHistory.forEach(function(evt) {
          if (evt.attributes !== undefined) {
            evt.attributes.forEach(function(attr) {
              if (attr.attribute.id == oldId) attr.attribute = newAttr;
            });
          }
        });
      });
    }
    if (evt.characters) {
      evt.characters.forEach(function(character) {
        var charId = character.id;
        findObjs({
          _type: 'attribute',
          _characterid: charId
        }).forEach(function(attr) {
          attr.remove();
        });
        findObjs({
          _type: 'ability',
          _characterid: charId
        }).forEach(function(ab) {
          ab.remove();
        });
        character.remove();
      });
    }
    if (evt.tokens) {
      evt.tokens.forEach(function(token) {
        token.remove();
      });
    }
    if (_.has(evt, 'combat')) stateCOF.combat = evt.combat;
    if (_.has(evt, 'combat_pageid')) stateCOF.combat_pageid = evt.combat_pageid;
    if (_.has(evt, 'tour')) stateCOF.tour = evt.tour;
    if (_.has(evt, 'init')) stateCOF.init = evt.init;
    if (_.has(evt, 'activeTokenId')) stateCOF.activeTokenId = evt.activeTokenId;
    if (_.has(evt, 'updateNextInitSet'))
      updateNextInitSet = evt.updateNextInitSet;
    if (_.has(evt, 'turnorder'))
      Campaign().set('turnorder', evt.turnorder);
    if (_.has(evt, 'initiativepage'))
      Campaign().set('initiativepage', evt.initiativepage);
    return;
  }

  function undoTokenEffect(evt) {
    var HTdeclared;
    try {
      HTdeclared = HealthColors;
    } catch (e) {
      if (e.name != "ReferenceError") throw (e);
    }
    _.each(evt.affectes, function(aff) {
      var prev = aff.prev;
      var tok = aff.affecte;
      if (prev === undefined || tok === undefined) {
        error("Pas d'état précédant", aff);
        return;
      }
      var prevTok;
      if (HTdeclared) prevTok = JSON.parse(JSON.stringify(tok));
      _.each(prev, function(val, key) {
        tok.set(key, val);
      });
      if (HTdeclared) HealthColors.Update(tok, prevTok);
      sendChat("COF", "État de " + tok.get("name") + " restauré.");
    });
  }

  function caracOfMod(m) {
    switch (m) {
      case 'FOR':
        return 'FORCE';
      case 'DEX':
        return 'DEXTERITE';
      case 'CON':
        return 'CONSTITUTION';
      case 'INT':
        return 'INTELLIGENCE';
      case 'SAG':
        return 'SAGESSE';
      case 'CHA':
        return 'CHARISME';
      default:
        return;
    }
  }

  //Retourne le mod de la caractéristque entière.
  //si carac n'est pas une carac, retourne 0
  function modCarac(perso, carac) {
    var res = Math.floor((ficheAttributeAsInt(perso, carac, 10) - 10) / 2);
    if (carac == 'FORCE' && attributeAsBool(perso, 'mutationMusclesHypertrophies')) res += 2;
    else if (carac == 'DEXTERITE' && attributeAsBool(perso, 'mutationSilhouetteFiliforme')) res += 4;
    return res;
  }

  //Renvoie le token et le charId. Si l'id ne correspond à rien, cherche si 
  //on trouve un nom de token, sur la page passée en argument (ou sinon
  //sur la page active de la campagne)
  function tokenOfId(id, name, pageId) {
    var token = getObj('graphic', id);
    if (token === undefined) {
      if (name === undefined) return undefined;
      if (pageId === undefined) {
        pageId = Campaign().get('playerpageid');
      }
      var tokens = findObjs({
        _type: 'graphic',
        _subtype: 'token',
        _pageid: pageId,
        name: name
      });
      if (tokens.length === 0) return undefined;
      if (tokens.length > 1) {
        error("Ambigüité sur le choix d'un token : il y a " +
          tokens.length + " tokens nommés" + name, tokens);
      }
      token = tokens[0];
    }
    var charId = token.get('represents');
    if (charId === '') {
      error("le token sélectionné ne représente pas de personnage", token);
      return undefined;
    }
    return {
      token: token,
      charId: charId
    };
  }

  function tokenOfIdName(idn, pageId) {
    var pos = idn.indexOf(' ');
    if (pos < 1 || pos >= idn.length) {
      error("IdName mal formé", idn);
      return;
    }
    var name = idn.substring(pos + 1);
    var perso = tokenOfId(idn.substring(0, pos), name, pageId);
    perso.tokName = perso.token.get('name');
    if (perso.tokName == name) return perso;
    log("En cherchant le token " + idn + ", on trouve " + perso.tokName);
    log(perso);
    return perso;
  }

  function boutonSimple(action, style, texte) {
    action = action.replace(/%/g, '&#37;').replace(/\)/g, '&#41;').replace(/\?/g, '&#63;').replace(/@/g, '&#64;').replace(/\[/g, '&#91;').replace(/]/g, '&#93;').replace(/"/g, '&#34;');
    action = action.replace(/\'/g, '&apos;'); // escape quotes
    return '<a href="' + action + '"' + style + '>' + texte + '</a>';
  }

  // on, remplace tous les selected par @{character name|attr}
  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
  }

  //Remplace une macro ou ability par sa définition (récursivement)
  function replaceAction(action, perso, macros, abilities) {
    var remplacement = false;
    if (action.indexOf('#') >= 0) {
      macros = macros || findObjs({
        _type: 'macro'
      });
      macros.forEach(function(m, i) {
        var mName = '#' + m.get('name');
        if (action.indexOf(mName) >= 0) {
          action = action.replace(mName, m.get('action'));
          if (!remplacement)
            macros = macros.filter(function(m, k) {
              return (k != i);
            }); //Pour éviter la récursion
          remplacement = true;
        }
      });
    }
    if (action.indexOf('%') >= 0) {
      abilities = abilities || findObjs({
        _type: 'ability',
        _characterid: perso.charId
      });
      abilities.forEach(function(a, i) {
        var aName = a.get('name');
        var daName = '%' + aName;
        if (action.indexOf(daName) >= 0) {
          action = action.replace(daName, a.get('action'));
          if (!remplacement) abilities = abilities.splice(i); //Pour éviter la récursion
          remplacement = true;
        }
        daName = '%{selected|' + aName + '}';
        if (action.indexOf(daName) >= 0) {
          action = action.replace(daName, a.get('action'));
          if (!remplacement)
            abilities = abilities.filter(function(m, k) {
              return (k != i);
            }); //Pour éviter la récursion
          remplacement = true;
        }
      });
    }
    if (remplacement) return replaceAction(action, perso, macros, abilities);
    return action;
  }

  //ressource est optionnel, et si présent doit être un attribut
  function bouton(action, text, perso, ressource, overlay, style) {
    if (action === undefined || action.trim().length === 0) return text;
    else action = action.trim();
    //Expansion des macros et abilities
    action = replaceAction(action, perso);
    var tid = perso.token.id;
    perso.tokName = perso.tokName || perso.token.get('name');
    if (perso.name === undefined) {
      var character = getObj('character', perso.charId);
      if (character) perso.name = character.get('name');
      else perso.name = perso.tokName;
    }
    //Cas de plusieurs actions après expansion
    var actions = action.split('\n');
    actions = actions.map(function(act) {
      act = act.trim();
      if (act.startsWith("/as ")) {
        act = "!cof-as" + act.substring(3);
      }
      switch (act.charAt(0)) {
        case '!':
          if (act.startsWith('!cof')) {
            if (ressource) act += " --decrAttribute " + ressource.id;
          } else if (!act.startsWith('!&#13')) return act; //On ne touche pas aux commandes des autres scripts
          break;
        default:
          if (ressource) {
            act = "!cof-utilise-consommable " + tid + " " + ressource.id + " --message " + act;
          } else {
            act = "!cof-lancer-sort 0 " + act;
          }
      }
      if (act.indexOf('@{selected') !== -1) {
        // cas spécial pour @{selected|token_id} où l'on remplace toutes les occurences par token.id
        act = act.replace(new RegExp(escapeRegExp('@{selected|token_id}'), 'g'), tid);
        act = act.replace(new RegExp(escapeRegExp('@{selected|token_name}'), 'g'), perso.tokName);
        var tmp = act.split('@{selected');
        tmp.forEach(function(elem) {
          if (elem.startsWith('|')) {
            // attribut demandé
            var attribute_name = elem.substring(0, elem.indexOf("}")).substr(1);
            var attrs = findObjs({
              type: 'attribute',
              charid: perso.charId,
              name: attribute_name
            });
            var replacement;
            if (attrs.length === 0)
              replacement = '@{' + perso.name + '|' + attribute_name + '}';
            else
              replacement = attrs[0].get('current');
            act = act.replace(new RegExp(escapeRegExp('@{selected|' + attribute_name + '}'), 'g'), replacement);
          }
        });
      }
      if (act.startsWith('!cof-lancer-sort') && act.indexOf('--lanceur') == -1) {
        act = "!cof-lancer-sort --lanceur " + tid + act.substr(16);
      }
      if (act.indexOf('@{target|') == -1 &&
        act.indexOf('cof-lancer-sort') == -1 &&
        act.indexOf('cof-surprise') == -1 &&
        act.indexOf('cof-attack') == -1 &&
        act.indexOf('cof-soin') == -1 &&
        act.indexOf('cof-as ') == -1 &&
        act.indexOf('--equipe') == -1 &&
        act.indexOf('--target ' + tid) == -1) {
        //Si on n'a pas de cible, on fait comme si le token était sélectionné.
        var add_token = " --target " + tid;
        if (act.indexOf(' --allie') >= 0) {
          if (act.indexOf('--lanceur') == -1)
            add_token = " --lanceur " + tid;
          else add_token = ""; //La cible sont les alliés de --lanceur.
        }
        if (act.indexOf(' --message ') != -1) act = act.replace(' --message ', add_token + ' --message ');
        else act += add_token;
      }
      return act;
    });
    var pictoStyle = getPictoStyleFromCommand(action, perso);
    if (actions.length == 1) action = actions[0];
    else
      action = "!cof-multi-command " + actions.join(' --cof-multi-command ');
    text = pictoStyle.picto + text;
    var buttonStyle = '';
    if (style) buttonStyle = ' style="' + style + '"';
    else if (pictoStyle.style)
      buttonStyle = ' style="' + pictoStyle.style + '"';
    if (overlay) overlay = ' title="' + overlay + '"';
    else overlay = '';
    return boutonSimple(action, buttonStyle + overlay, text);
  }

  function improve_image(image_url) {
    if (image_url) {
      image_url = image_url.replace('/med.png', '/thumb.png');
      image_url = image_url.substring(0, image_url.indexOf('?'));
      return image_url;
    }
  }

  //Fonction séparée pour pouvoir envoyer un frame à plusieurs joueurs
  function addFramedHeader(display, playerId, chuchote) {
    var perso1 = display.perso1;
    var perso2 = display.perso2;
    var action = display.action;
    var playerBGColor = '#333';
    var playerTXColor = '#FFF';
    var displayname;
    var player = getObj('player', playerId);
    if (player !== undefined) {
      playerBGColor = player.get("color");
      playerTXColor = (getBrightness(playerBGColor) < 50) ? "#FFF" : "#000";
      displayname = player.get('displayname');
    }
    var res = '/direct ';
    if (chuchote) {
      var who;
      if (chuchote !== true) who = chuchote;
      else who = displayname;
      if (who) res = '/w "' + who + '" ';
      else chuchote = false;
    }
    var name1, name2 = '';
    var avatar1, avatar2;
    if (perso2) {
      var img2 = improve_image(perso2.token.get('imgsrc'));
      if (stateCOF.options.affichage.val.avatar_dans_cadres.val) {
        var character2 = getObj('character', perso2.charId);
        if (character2) img2 = improve_image(character2.get('avatar')) || img2;
      }
      if (img2) {
        avatar2 = '<img src="' + img2 + '" style="width: 50%; display: block; max-width: 100%; height: auto; border-radius: 6px; margin: 0 auto;">';
        name2 = perso2.tokName;
        if (name2 === undefined) name2 = perso2.token.get('name');
        name2 = '<b>' + name2 + '</b>';
      }
    }
    if (perso1) {
      var img1 = improve_image(perso1.token.get('imgsrc'));
      if (stateCOF.options.affichage.val.avatar_dans_cadres.val) {
        var character1 = getObj('character', perso1.charId);
        if (character1) img1 = improve_image(character1.get('avatar')) || img1;
      }
      if (img1) {
        avatar1 = '<img src="' + img1 + '" style="width: ' + (avatar2 ? 50 : 100) + '%; display: block; max-width: 100%; height: auto; border-radius: 6px; margin: 0 auto;">';
        if (perso1.tokName) name1 = perso1.tokName;
        else name1 = perso1.token.get('name');
        name1 = '<b>' + name1 + '</b>';
      }
    }
    res +=
      '<div class="all_content" style="-webkit-box-shadow: 2px 2px 5px 0px rgba(0,0,0,0.75); -moz-box-shadow: 2px 2px 5px 0px rgba(0,0,0,0.75); box-shadow: 2px 2px 5px 0px rgba(0,0,0,0.75); border: 1px solid #000; border-radius: 6px; -moz-border-radius: 6px; -webkit-border-radius: 6px; overflow: hidden; position: relative;">';
    if (avatar1) {
      res +=
        '<div class="line_header" style="overflow:auto; text-align: center; vertical-align: middle; padding: 5px 5px; border-bottom: 1px solid #000; color: ' + playerTXColor + '; background-color: ' + playerBGColor + ';" title=""> ' +
        '<table>';
      if (avatar2) {
        res +=
          '<tr style="text-align: center">' +
          '<td style="width: 44%; vertical-align: middle;">' + name1 + '</td>' +
          '<td style="width: 12%;height: 28px;line-height: 30px;border: 2px solid #900;border-radius: 100%;position: absolute;margin-top: 25px;font-weight: bold;background-color: #EEE;color: #900;">' + 'VS' + '</td>' +
          '<td style="width: 44%; vertical-align: middle;">' + name2 + '</td>' +
          '</tr>' +
          '<tr style="text-align: center">' +
          '<td style="width: 42%; vertical-align: middle;">' + avatar1 + '</td>' +
          '<td style="width: 16%; vertical-align: middle;">&nbsp;</td>' +
          '<td style="width: 42%; vertical-align: middle;">' + avatar2 + '</td>' +
          '</tr>';
      } else {
        var bar1_info = '',
          bar2_info = '',
          bar3_info = '';
        if (chuchote) {
          // on chuchote donc on peut afficher les informations concernant les barres du Token
          if (perso1.token.get('bar1_link').length > 0) {
            var bar1 = findObjs({
              _type: 'attribute',
              _id: perso1.token.get('bar1_link')
            });
            if (bar1[0] !== undefined) bar1_info = '<b>' + bar1[0].get('name') + '</b> : ' + bar1[0].get('current') + ' / ' + bar1[0].get('max') + '';
          }
          if (perso1.token.get('bar2_link').length > 0) {
            var bar2 = findObjs({
              _type: 'attribute',
              _id: perso1.token.get('bar2_link')
            });
            if (bar2[0] !== undefined) bar2_info = '<b>' + bar2[0].get('name') + '</b> : ' + bar2[0].get('current') + ' / ' + bar2[0].get('max') + '';
          }
          if (perso1.token.get('bar3_link').length > 0) {
            var bar3 = findObjs({
              _type: 'attribute',
              _id: perso1.token.get('bar3_link')
            });
            if (bar3[0] !== undefined) bar3_info = '<b>' + bar3[0].get('name') + '</b> : ' + bar3[0].get('current') + ' / ' + bar3[0].get('max') + '';
          }
        }
        res +=
          '<tr style="text-align: left">' +
          '<td style="width:25%; vertical-align: middle;">' + avatar1 +
          '</td>' +
          '<td style="width:75%; vertical-align: middle; position: relative;">' +
          '<div>' + name1 + '</div>' +
          '<div style="position: absolute;top: -6px;right: -5px;border: 1px solid #000;background-color: #333;">' +
          '<div style="text-align: right; margin: 0 5px; color: #7cc489">' + bar1_info + '</div>' +
          '<div style="text-align: right; margin: 0 5px; color: #7c9bc4">' + bar2_info + '</div>' +
          '<div style="text-align: right; margin: 0 5px; color: #b21d1d">' + bar3_info + '</div>' +
          '</div>' +
          '</td>' +
          '</tr>';
      }
      res +=
        '</table>' +
        '</div>'; // line_header
    }
    res +=
      '<div class="line_title" style="font-size: 85%; text-align: left; vertical-align: middle; padding: 5px 5px; border-bottom: 1px solid #000; color: #a94442; background-color: #f2dede;" title=""> ' +
      action +
      '</div>'; // line_title
    res += '<div class="line_content">';
    display.header = res;
  }

  //Si options.chuchote est vrai, la frame est chuchotée au joueur qui fait l'action
  //Si options.chuchote est un nom, on chuchote la frame à ce nom
  //Pour retarder la décision sur la cible de chuchotement, utiliser options.retarder
  function startFramedDisplay(playerId, action, perso, options) {
    options = options || {};
    var display = {
      output: '',
      isOdd: true,
      isfirst: true,
      perso1: perso,
      perso2: options.perso2,
      action: action
    };
    if (options.retarde === undefined)
      addFramedHeader(display, playerId, options.chuchote);
    return display;
  }

  function addLineToFramedDisplay(display, line, size, newLine) {
    size = size || 100;
    newLine = (newLine !== undefined) ? newLine : true;
    var background_color, border = '',
      separator = '';
    if (!newLine) display.isOdd = !display.isOdd;
    if (display.isOdd) {
      background_color = "#FFF";
      display.isOdd = false;
    } else {
      background_color = "#f3f3f3";
      display.isOdd = true;
    }
    if (size < 100) background_color = "#fcf8e3";
    if (!display.isfirst) {
      if (newLine) border = "border-top: 1px solid #333;";
    } else display.isfirst = false;
    var formatedLine = '<div style="padding: 0 5px 0; background-color: ' + background_color + '; color: #000;' + border + '">';

    if (!newLine) separator = "border-top: 1px solid #ddd;";
    formatedLine += '<div style="padding: 4px 0; font-size: ' + size + '%;' + separator + '">' + line + '</div>';
    formatedLine += '</div>';
    display.output += formatedLine;
  }

  function startTableInFramedDisplay(display) {
    display.output += "<table>";
    display.endColumn = true;
  }

  function endTableInFramedDisplay(display) {
    if (!display.endColumn) display.output += "</tr>";
    display.output += "</table>";
  }

  //newLine indique qu'on commence une nouvelle rangée
  function addCellInFramedDisplay(display, cell, size, newLine) {
    size = size || 100;
    if (display.endColumn) {
      display.output += '<tr>';
      display.endColumn = false;
    } else if (newLine) display.output += '</tr><tr>';
    display.output += '<td style="background-color: #FFF; font-size: ' + size + '%; height: ' + size + '%">' + cell + '</td>';
  }

  function endFramedDisplay(display) {
    if (display.header === undefined) {
      error("Pas de titre pour le cadre", display);
      return;
    }
    var res = display.header + display.output;
    res += '</div>'; // line_content
    res += '</div>'; // all_content
    return res;
  }

  function tokenAttribute(personnage, name) {
    var token = personnage.token;
    if (token) {
      var link = token.get('bar1_link');
      if (link === "") name += "_" + token.get('name');
    }
    return findObjs({
      _type: 'attribute',
      _characterid: personnage.charId,
      name: name
    });
  }

  function charAttribute(charId, name, option) {
    return findObjs({
      _type: 'attribute',
      _characterid: charId,
      name: name
    }, option);
  }

  function attrAsInt(attr, def) {
    if (attr.length === 0) return def;
    attr = parseInt(attr[0].get('current'));
    if (isNaN(attr)) return def;
    return attr;
  }

  function attrAsBool(attr) {
    if (attr.length === 0) return false;
    attr = attr[0].get('current');
    if (attr == '0') return false;
    if (attr) return true;
    return false;
  }

  // Caution : does not work with repeating attributes!!!!
  function ficheAttribute(personnage, name, def) {
    var attr = charAttribute(personnage.charId, name, {
      caseInsensitive: true
    });
    if (attr.length === 0) return def;
    return attr[0].get('current');
  }

  function ficheAttributeAsInt(personnage, name, def) {
    var attr = charAttribute(personnage.charId, name, {
      caseInsensitive: true
    });
    return attrAsInt(attr, def);
  }

  function ficheAttributeAsBool(personnage, name) {
    var attr = charAttribute(personnage.charId, name, {
      caseInsensitive: true
    });
    return attrAsBool(attr);
  }

  // Caution not to use token when the attribute should not be token dependant
  function attributeAsInt(personnage, name, def) {
    var attr = tokenAttribute(personnage, name);
    return attrAsInt(attr, def);
  }

  function attributeAsBool(personnage, name) {
    var attr = tokenAttribute(personnage, name);
    return attrAsBool(attr);
  }

  function charAttributeAsInt(perso, name, def) {
    var attr = charAttribute(perso.charId, name);
    return attrAsInt(attr, def);
  }

  function charAttributeAsBool(perso, name) {
    var attr = charAttribute(perso.charId, name);
    return attrAsBool(attr);
  }

  function charIdAttributeAsBool(charId, name) {
    var attr = charAttribute(charId, name);
    return attrAsBool(attr);
  }

  // Test de caractéristique
  // options : bonusAttrs, bonus, roll
  // Après le test, lance callback(testRes)
  // testRes.texte est l'affichage du jet de dé
  // testRes.reussite indique si le jet est réussi
  // testRes.echecCritique, testRes.critique pour le type
  function testCaracteristique(personnage, carac, seuil, options, evt, callback) { //asynchrone
    options = options || {};
    var token = personnage.token;
    var bonusCarac = bonusTestCarac(carac, personnage, evt);
    if (options.bonusAttrs) {
      options.bonusAttrs.forEach(function(attr) {
        bonusCarac += charAttributeAsInt(personnage, attr, 0);
      });
    }
    if (options.bonus) bonusCarac += options.bonus;
    var testRes = {};
    if (carac == 'SAG' || carac == 'INT' || carac == 'CHA') {
      if (charAttributeAsBool(personnage, 'sansEsprit')) {
        testRes.reussite = true;
        testRes.texte = "(sans esprit : réussite automatique)";
        callback(testRes);
        return;
      }
    }
    var carSup = nbreDeTestCarac(carac, personnage);
    var de = computeDice(personnage, {
      nbDe: carSup,
      carac: carac
    });
    var rollExpr = "[[" + de + "cs20cf1]]";
    var name = personnage.name || getObj('character', personnage.charId).get('name');
    sendChat("", rollExpr, function(res) {
      var roll = options.roll || res[0].inlinerolls[0];
      testRes.roll = roll;
      var d20roll = roll.results.total;
      var bonusText = (bonusCarac > 0) ? "+" + bonusCarac : (bonusCarac === 0) ? "" : bonusCarac;
      testRes.texte = buildinline(roll) + bonusText;
      if (d20roll == 20) {
        testRes.reussite = true;
        testRes.critique = true;
      } else if (d20roll == 1) {
        testRes.reussite = false;
        testRes.echecCritique = true;
        diminueMalediction(personnage, evt);
      } else if (d20roll + bonusCarac >= seuil) {
        testRes.reussite = true;
      } else {
        diminueMalediction(personnage, evt);
        testRes.reussite = false;
      }
      callback(testRes);
    });
  }

  function jetPerso(perso, caracteristique, difficulte, titre, playerId, options) {
    options = options || {};
    var evt = options.evt || {
      type: "Jet de " + caracteristique
    };
    var display = startFramedDisplay(playerId, titre, perso, {
      chuchote: options.secret
    });
    if (difficulte === undefined) {
      jetCaracteristique(perso, caracteristique, options, evt, function(rt) {
        addLineToFramedDisplay(display, "<b>Résultat :</b> " + rt.texte);
        addStatistics(playerId, ["Jet de carac", caracteristique], rt.roll);
        // Maintenant, on diminue la malédiction si le test est un échec
        var attrMalediction = tokenAttribute(perso, 'malediction');
        if (attrMalediction.length > 0) {
          if (rt.echecCritique)
            diminueMalediction(perso, evt, attrMalediction);
          else if (!rt.critique) {
            var action = "!cof-resultat-jet " + stateCOF.eventId;
            var ligne = "L'action est-elle ";
            ligne += bouton(action + " reussi", "réussie", perso);
            ligne += " ou " + bouton(action + " rate", "ratée", perso);
            ligne += " ?";
            addLineToFramedDisplay(display, ligne);
            evt.personnage = perso;
            evt.attenteResultat = true;
          }
        }
        addEvent(evt);
        sendChat('', endFramedDisplay(display));
      });
    } else {
      if (options.chance) options.bonus = options.chance * 10;
      testCaracteristique(perso, caracteristique, difficulte, options, evt,
        function(tr) {
          addLineToFramedDisplay(display, "<b>Résultat :</b> " + tr.texte);
          addEvent(evt);
          if (tr.reussite) {
            addLineToFramedDisplay(display, "C'est réussi.");
          } else {
            //TODO : ajouter le pacte sanglant, la prouesse et le tour de force
            var msgRate = "C'est raté.";
            evt.personnage = perso;
            evt.action = {
              caracteristique: caracteristique,
              difficulte: difficulte,
              titre: titre,
              playerId: playerId,
              options: options
            };
            evt.type = 'jetPerso';
            var pc = attributeAsInt(perso, 'PC', 0);
            if (pc > 0) {
              options.roll = options.roll || tr.roll;
              msgRate += ' ' +
                bouton("!cof-bouton-chance " + evt.id, "Chance", perso) +
                " (reste " + pc + " PC)";
            }
            if (charAttributeAsBool(perso, 'runeDEnergie') && (caracteristique == 'FOR' || caracteristique == 'CON' || caracteristique == 'DEX')) {
              msgRate += ' ' + bouton("!cof-bouton-rune-energie " + evt.id, "Rune d'énergie", perso);
            }
            addLineToFramedDisplay(display, msgRate);
          }
          sendChat('', endFramedDisplay(display));
        });
    }
  }

  //Par construction, msg.content ne doit pas contenir d'option --nom,
  //et commencer par !cof-jet 
  function boutonsCompetences(display, perso, carac, msg) {
    var action = msg.content;
    action = action.replace(/ --competences /, '');
    action = action.replace(/ --competences/, ''); //au cas où ce serait le dernier argument
    var args = action.substring(9); //on enlève !cof-jet
    if (!args.startsWith(carac)) action = "!cof-jet " + carac + " " + args;
    var pictoCarac = carac;
    var overlay;
    switch (carac) {
      case 'FOR':
        pictoCarac = '<span style="font-family: \'Pictos\'">S</span>';
        overlay = 'Force';
        break;
      case 'DEX':
        pictoCarac = '<span style="font-family: \'Pictos Custom\'">t</span>';
        overlay = 'Dextérité';
        break;
      case 'CON':
        pictoCarac = '<span style="font-family: \'Pictos\'">k</span>';
        overlay = 'Constitution';
        break;
      case 'INT':
        pictoCarac = '<span style="font-family: \'Pictos Custom\'">y</span>';
        overlay = 'Intelligence';
        break;
      case 'SAG':
        pictoCarac = '&#9775;';
        overlay = 'Sagesse';
        break;
      case 'CHA':
        pictoCarac = '<span style="font-family: \'Pictos\'">w</span>';
        overlay = 'Charisme';
        break;
    }
    var cell = bouton(action, pictoCarac, perso, undefined, overlay);
    addCellInFramedDisplay(display, cell, 150, true);
    var comps = listeCompetences[carac];
    cell = '';
    var sec = false;
    comps.forEach(function(comp) {
      if (sec) cell += ' ';
      else sec = true;
      cell += bouton(action + " --nom " + comp, comp, perso, undefined, undefined, "background-color:#996600");
    });
    addCellInFramedDisplay(display, cell, 80, false);
  }

  //options peut avoir les champs:
  // - strict1 = true si on considère que tok1 doit avoir une taille nulle
  // - strict2
  // - allonge
  function distanceCombat(tok1, tok2, pageId, options) {
    if (pageId === undefined) {
      pageId = tok1.get('pageid');
    }
    var page = getObj("page", pageId);
    var scale = page.get('scale_number');
    var pt1 = tokenCenter(tok1);
    var pt2 = tokenCenter(tok2);
    var distance_pix = VecMath.length(VecMath.vec(pt1, pt2));
    options = options || {};
    if (!options.strict1) distance_pix -= tokenSize(tok1, PIX_PER_UNIT);
    if (!options.strict2) distance_pix -= tokenSize(tok2, PIX_PER_UNIT);
    if (options.allonge) distance_pix -= (options.allonge * PIX_PER_UNIT) / scale;
    if ((!options.strict1 || !options.strict2) && distance_pix < PIX_PER_UNIT * 1.5) return 0; //cases voisines
    return ((distance_pix / PIX_PER_UNIT) * scale);
  }

  function getPageId(playerId) {
    var pageId;
    if (playerIsGM(playerId)) {
      var player = getObj('player', playerId);
      pageId = player.get('lastpage');
    }
    if (pageId === undefined || pageId === "") {
      var pages = Campaign().get('playerspecificpages');
      if (pages && pages[playerId] !== undefined) {
        return pages[playerId];
      }
      return Campaign().get('playerpageid');
    }
    return pageId;
  }

  // callback(selected, playerId)
  function getSelected(msg, callback, options) {
    var playerId = getPlayerIdFromMsg(msg);
    var pageId;
    if (options && options.pageId) pageId = options.pageId;
    else pageId = getPageId(playerId);
    var args = msg.content.split(' --');
    var selected = [];
    var enleveAuxSelected = [];
    var count = args.length - 1;
    var called;
    options = options || {};
    var actif = options.lanceur;
    var finalCall = function() {
      called = true;
      var seen = new Set();
      var res = selected.filter(function(sel) {
        if (seen.has(sel._id)) return false;
        seen.add(sel._id);
        var interdit = enleveAuxSelected.find(function(i) {
          return (i._id == sel._id);
        });
        return (interdit === undefined);
      });
      callback(res, playerId);
    };
    if (args.length > 1) {
      args.shift();
      args.forEach(function(cmd) {
        count--;
        var cmdSplit = cmd.split(' ');
        switch (cmdSplit[0]) {
          case 'equipe':
            var nomEquipe = 'Equipe' + cmd.substring(cmd.indexOf(' '));
            var equipes = findObjs({
              _type: 'handout',
              name: nomEquipe
            });
            if (equipes.length === 0) {
              error(nomEquipe + " inconnue", msg.content);
              return;
            }
            if (equipes.length > 1) {
              error("Plus d'une " + nomEquipe, cmd);
            }
            count += equipes.length;
            equipes.forEach(function(equipe) {
              equipe.get('notes', function(note) { //asynchrone
                var persos = charactersInHandout(note, nomEquipe);
                var tokens = findObjs({
                  _type: 'graphic',
                  _subtype: 'token',
                  _pageid: pageId,
                  layer: 'objects'
                });
                var uneCible = false;
                tokens.forEach(function(tok) {
                  var tokCharId = tok.get('represents');
                  if (persos.has(tokCharId)) {
                    uneCible = true;
                    selected.push({
                      _id: tok.id
                    });
                  }
                });
                if (!uneCible) {
                  error("Pas de token de l'" + nomEquipe + " sur la page");
                }
                count--;
                if (count === 0) finalCall();
                return;
              });
            });
            return;
          case 'allies':
          case 'saufAllies':
            var selection = selected;
            var saufAllies = (cmdSplit[0] == 'saufAllies');
            if (saufAllies) selection = enleveAuxSelected;
            var actives = [];
            var allies = new Set();
            // First get the acting token (in msg.selected)
            if (actif) {
              actives = [actif];
              allies = alliesParPerso[actif.charId] || allies;
              if (saufAllies) allies = (new Set(allies)).add(actif.charId);
            } else {
              if (msg.selected === undefined || msg.selected.length === 0) {
                error("Pas d'allié car pas de token sélectionné", msg);
                return;
              }
              iterSelected(msg.selected, function(personnage) {
                actives.push(personnage);
                var alliesPerso = alliesParPerso[personnage.charId];
                if (alliesPerso) {
                  alliesPerso.forEach(function(ci) {
                    allies.add(ci);
                  });
                }
                if (saufAllies) allies.add(personnage.charId);
              });
            }
            var tokens = findObjs({
              _type: 'graphic',
              _subtype: 'token',
              _pageid: pageId,
              layer: 'objects'
            });
            tokens.forEach(function(tok) {
              var ci = tok.get('represents');
              if (ci === '') return;
              if (!allies.has(ci)) return;
              //On enlève le token actif, mais seulement pour allies
              if (cmdSplit[0] == 'allies') {
                if (actives.indexOf(function(perso) {
                    return perso.charId == ci;
                  }) >= 0) return;
              }
              selection.push({
                _id: tok.id
              });
            });
            return;
          case 'self':
            if (actif) {
              selected.push({
                _id: actif.token.id
              });
              return;
            }
            if (msg.selected === undefined) return;
            msg.selected.forEach(function(obj) {
              var inSelf = selected.findIndex(function(o) {
                return (o._id == obj._id);
              });
              if (inSelf < 0) selected.push(obj);
            });
            return;
          case 'target':
            if (cmdSplit.length < 2) {
              error("Il manque l'id de la cible (après --target)", cmd);
              return;
            }
            selected.push({
              _id: cmdSplit[1]
            });
            return;
          case 'disque':
            if (cmdSplit.length < 3) {
              error("Pas assez d'argument pour définir un disque", cmdSplit);
              return;
            }
            var centre = tokenOfId(cmdSplit[1], cmdSplit[1], pageId);
            if (centre === undefined) {
              error("le premier argument du disque n'est pas un token valide", cmdSplit);
              return;
            }
            var tokenCentre = centre.token;
            var rayon = parseInt(cmdSplit[2]);
            if (isNaN(rayon) || rayon < 0) {
              error("Rayon du disque mal défini", cmdSplit);
              return;
            }
            var portee;
            if (cmdSplit.length > 3) {
              portee = parseInt(cmdSplit[3]);
              if (isNaN(portee) || portee < 0) {
                error("La portée du disque est mal formée", cmdSplit);
                return;
              }
              if (actif === undefined) {
                if (msg.selected === undefined || msg.selected.length != 1) {
                  error("Pas de token sélectionné pour calculer la distance du disque", msg);
                  return;
                }
                actif = tokenOfId(msg.selected[0]._id, msg.selected[0]._id, pageId);
              }
              if (distanceCombat(tokenCentre, actif.token, pageId, {
                  strict1: true
                }) > portee) {
                sendChar(actif.charId, "Le centre de l'effet est placé trop loin (portée " + portee + " m)");
                return;
              }
            }
            var allToksDisque =
              findObjs({
                _type: "graphic",
                _pageid: pageId,
                _subtype: "token",
                layer: "objects"
              });
            allToksDisque.forEach(function(obj) {
              if (portee === 0 && obj.id == actif.token.id) return; //on ne se cible pas si le centre de l'aoe est soi-même
              var objCharId = obj.get('represents');
              if (objCharId === '') return;
              if (getState({
                  token: obj,
                  charId: objCharId
                }, 'mort')) return; //pas d'effet aux morts
              if (obj.get('bar1_max') == 0) return; // jshint ignore:line
              var objChar = getObj('character', objCharId);
              if (objChar === undefined) return;
              var distanceCentre = distanceCombat(tokenCentre, obj, pageId, {
                strict1: true
              });
              if (distanceCentre > rayon) return;
              selected.push({
                _id: obj.id
              });
            });
            if (options.targetFx) {
              spawnFx(tokenCentre.get('left'), tokenCentre.get('top'), options.targetFx, pageId);
            }
            if (tokenCentre.get('bar1_max') == 0) { // jshint ignore:line
              //C'est juste un token utilisé pour définir le disque
              tokenCentre.remove(); //On l'enlève, normalement plus besoin
              delete options.targetFx;
            }
            return;
          default:
        }
      });
    }
    if (count === 0) {
      if (selected.length === 0) {
        if (msg.selected) {
          if (!called) {
            var res = msg.selected.filter(function(sel) {
              var interdit = enleveAuxSelected.find(function(i) {
                return (i._id == sel._id);
              });
              return (interdit === undefined);
            });
            callback(res, playerId);
          }
          return;
        }
        if (!called) callback([], playerId);
        return;
      }
      if (!called) finalCall();
      return;
    }
  }

  function getPlayerIdFromMsg(msg) {
    var playerId = msg.playerid;
    if (playerId == 'API') {
      var nom = msg.who;
      if (nom === undefined) return playerId;
      nom = nom.replace(/ \(GM\)/, '');
      //On regarde si un joueur s'appelle nom
      var players = findObjs({
        type: 'player',
        displayname: nom
      });
      if (players.length === 0) {
        var characters = findObjs({
          type: 'character',
          name: nom
        });
        if (characters.length === 0) {
          error("Impossible de trouver l'id du joueur " + nom);
          return playerId;
        }
        var pids = characters[0].get('controlledby');
        pids = pids.split(',');
        if (pids[0] == 'all') {
          players = findObjs({
            type: 'player'
          });
          playerId = players[0].id;
        } else playerId = pids[0];
      } else playerId = players[0].id;
    }
    return playerId;
  }

  //origin peut être un message ou un nom de joueur
  function sendPlayer(origin, msg) {
    var dest = origin;
    if (origin.who) {
      if (playerIsGM(getPlayerIdFromMsg(origin))) dest = 'GM';
      else dest = origin.who;
    }
    sendChat('COF', '/w "' + dest + '" ' + msg);
  }

  function isCarac(x) {
    switch (x) {
      case 'FOR':
      case 'DEX':
      case 'CON':
      case 'SAG':
      case 'INT':
      case 'CHA':
        return true;
      default:
        return false;
    }
  }

  function jet(msg) {
    // Les arguments pour cof-jet sont :
    // - Caracteristique (FOR, DEX, CON, INT, SAG, CHA)
    // Les tokens sélectionnés sont ceux qui doivent faire le jet
    var opts = msg.content.split(' --');
    var cmd = opts.shift().split(' ');
    var options = {
      bonusAttrs: []
    };
    opts.forEach(function(o) {
      var args = o.split(' ');
      switch (args[0]) {
        case "nom":
          if (args.length < 2) {
            error("Il manque un argument à l'option " + args[0], opts);
            return;
          }
          options.nom = args[1];
          options.bonusAttrs.push(args[1].toLowerCase());
          return;
        case "attribut":
          if (args.length < 2) {
            error("Il manque un argument à l'option " + args[0], opts);
            return;
          }
          options.bonusAttrs.push(args[1]);
          return;
        case 'bonus':
          if (args.length < 2) {
            error("Il manque un argument à l'option " + args[0], opts);
            return;
          }
          var bonus = parseInt(args[1]);
          if (isNaN(bonus)) {
            error("Le bonus doit être un nombre", opts);
            return;
          }
          options.bonus = (options.bonus || 0) + bonus;
          return;
        case 'secret':
        case 'competences':
          options[args[0]] = true;
          return;
      }
    });
    getSelected(msg, function(selected, playerId) {
      if (selected.length === 0) {
        sendPlayer(msg, "!cof-jet sans sélection de token");
        log("!cof-jet requiert de sélectionner des tokens");
        return;
      }
      if (cmd.length < 2) { //On demande la carac et la compétence, si définies dans un handout Compétence
        if (options.nom) {
          error("Il manque la caractéristique à utiliser pour la compétence " + options.nom, msg.content);
          return;
        }
        iterSelected(selected, function(perso) {
          var display = startFramedDisplay(playerId, "Jet de caractéristique", perso, {
            chuchote: true
          });
          startTableInFramedDisplay(display);
          boutonsCompetences(display, perso, 'FOR', msg);
          boutonsCompetences(display, perso, 'DEX', msg);
          boutonsCompetences(display, perso, 'CON', msg);
          boutonsCompetences(display, perso, 'SAG', msg);
          boutonsCompetences(display, perso, 'INT', msg);
          boutonsCompetences(display, perso, 'CHA', msg);
          endTableInFramedDisplay(display);
          sendChat('', endFramedDisplay(display));
        }); //fin de iterSelected
        return;
      }
      var caracteristique = cmd[1];
      if (!isCarac(caracteristique)) {
        error("Caracteristique '" + caracteristique + "' non reconnue (FOR, DEX, CON, INT, SAG, CHA).", cmd);
        return;
      }
      if (options.competences && options.nom === undefined) {
        iterSelected(selected, function(perso) {
          var display = startFramedDisplay(playerId, "Jet de " + caracteristique, perso, {
            chuchote: true
          });
          addLineToFramedDisplay(display, "Choisissez la compétence");
          startTableInFramedDisplay(display);
          boutonsCompetences(display, perso, caracteristique, msg);
          endTableInFramedDisplay(display);
          sendChat('', endFramedDisplay(display));
        }); //fin de iterSelected
        return;
      }
      var difficulte;
      if (cmd.length > 2) {
        difficulte = parseInt(cmd[2]);
        if (isNaN(difficulte)) difficulte = undefined;
      }
      var titre = "Jet d";
      var nomJet;
      if (options.nom && options.nom.length > 0) {
        nomJet = options.nom;
      } else {
        nomJet = caracOfMod(caracteristique).toLowerCase();
      }
      var nj = nomJet.toLowerCase();
      switch (nj[0]) {
        case 'a':
        case 'e':
        case 'i':
        case 'o':
        case 'u':
          titre += "'<b>";
          break;
        default:
          titre += "e <b>";
      }
      titre += nomJet;
      titre += "</b>";
      if (nj == 'perception') {
        options.bonusAttrs = options.bonusAttrs || [];
        options.bonusAttrs.push('diversionManoeuvreValeur');
      }
      if (options.bonus)
        titre += " (" + ((options.bonus > 0) ? '+' : '') + options.bonus + ")";
      if (difficulte !== undefined) titre += " difficulté " + difficulte;
      iterSelected(selected, function(perso) {
        jetPerso(perso, caracteristique, difficulte, titre, playerId, options);
      }); //fin de iterSelected
    }); //fin de getSelected
  }

  function resultatJet(msg) {
    var args = msg.content.split(' ');
    if (args.length < 3) {
      error("La fonction !cof-resultat-jet n'a pas assez d'arguments", args);
      return;
    }
    var evt = findEvent(args[1]);
    if (evt === undefined) {
      error("Le jet est trop ancien ou éte annulé", args);
      return;
    }
    if (evt.personnage === undefined) {
      error("Erreur interne ", evt);
      return;
    }
    if (evt.attenteResultat) {
      var message = evt.type + " ";
      if (args[2] == 'rate') {
        diminueMalediction(evt.personnage, evt);
        message += "raté.";
      } else message += "réussi.";
      sendChar(evt.personnage.charId, message);
      delete evt.attenteResultat;
    } else {
      sendPlayer(msg, "Résultat déjà décidé");
    }
  }

  var tempeteDeManaCourante = {
    vide: true
  };

  function ajouterOptionTempete(display, option, texte, restant, perso) {
    var line = texte + " : ";
    if (tempeteDeManaCourante[option])
      line += bouton("!cof-tempete-de-mana -" + option, "Oui", perso);
    else if (restant > 0)
      line += bouton("!cof-tempete-de-mana " + option, "Non", perso);
    else line += "Non";
    addLineToFramedDisplay(display, line);
  }

  function optionsDeTempeteDeMana(msg) {
    if (tempeteDeManaCourante.vide) {
      error("Pas de tempête de mana en cours", tempeteDeManaCourante);
      return;
    }
    var perso = tempeteDeManaCourante.perso;
    var cmd = msg.content.split(' ');
    if (cmd.length > 1) {
      switch (cmd[1]) {
        case 'duree':
        case 'portee':
        case 'rapide':
          if (tempeteDeManaCourante[cmd[1]]) break;
          tempeteDeManaCourante[cmd[1]] = true;
          tempeteDeManaCourante.cout++;
          break;
        case '-duree':
        case '-portee':
        case '-rapide':
        case '-altruiste':
          var opt = cmd[1].substring(1);
          if (tempeteDeManaCourante[opt]) {
            tempeteDeManaCourante[opt] = false;
            tempeteDeManaCourante.cout--;
          }
          break;
        case 'altruiste':
          if (cmd.length < 3) {
            error("Il manque l'id du token pour l'option altruiste de la tempete de mana", cmd);
            return;
          }
          var cible = tokenOfId(cmd[2]);
          if (cmd[2] == perso.token.id) cible = undefined;
          if (cible) {
            if (!tempeteDeManaCourante.altruiste) tempeteDeManaCourante.cout++;
          } else {
            if (tempeteDeManaCourante.altruiste) tempeteDeManaCourante.cout--;
          }
          tempeteDeManaCourante.altruiste = cible;
          break;
        default:
          var it = parseInt(cmd[1]);
          if (isNaN(it) || it < 0) {
            error("Argument de !cof-tempete-de-mana inconnu", cmd);
            return;
          }
          if (tempeteDeManaCourante.intense === undefined)
            tempeteDeManaCourante.intense = 0;
          tempeteDeManaCourante.cout += it - tempeteDeManaCourante.intense;
          tempeteDeManaCourante.intense = it;
      }
    }
    var title = "Tempête de mana";
    if (tempeteDeManaCourante.cout) {
      title += " de puissance " + tempeteDeManaCourante.cout;
    }
    var restant = 100;
    if (tempeteDeManaCourante.max) {
      title += " (max " + tempeteDeManaCourante.max + ")";
      restant = tempeteDeManaCourante.max - tempeteDeManaCourante.cout;
    }
    var display = startFramedDisplay(tempeteDeManaCourante.playerId, title, perso, {
      chuchote: true
    });
    if (tempeteDeManaCourante.dureeDeBase &&
      tempeteDeManaCourante.dm === undefined &&
      tempeteDeManaCourante.soins === undefined)
      ajouterOptionTempete(display, "duree", "Durée", restant, perso);
    if (tempeteDeManaCourante.porteeDeBase)
      ajouterOptionTempete(display, "portee", "Portée", restant, perso);
    ajouterOptionTempete(display, "rapide", "Rapide", restant, perso);
    if (tempeteDeManaCourante.altruistePossible) {
      var la = 'Magie altruiste : ';
      if (restant || tempeteDeManaCourante.altruiste) {
        var tla = "Sélectionner";
        if (tempeteDeManaCourante.altruiste) {
          tla = tempeteDeManaCourante.altruiste.token.get('name');
        }
        la += bouton("!cof-tempete-de-mana altruiste @{target|token_id}", tla, perso);
      } else la += 'Non';
      addLineToFramedDisplay(display, la);
    }
    var line = "Magie intense :";
    var magieIntense = 0;
    if (tempeteDeManaCourante.intense)
      magieIntense = tempeteDeManaCourante.intense;
    var maxMagieIntense = magieIntense + restant;
    if (maxMagieIntense > 5 && restant > 0) maxMagieIntense = magieIntense + 1;
    for (var i = 0; i <= maxMagieIntense; i++) {
      if (i == magieIntense) line += " " + i;
      else line += " " + bouton("!cof-tempete-de-mana " + i, i, perso);
    }
    addLineToFramedDisplay(display, line);
    var v = tempeteDeManaCourante.cmd;
    var vopt = '';
    if (tempeteDeManaCourante.cout) {
      vopt = "--tempeteDeMana";
      if (tempeteDeManaCourante.duree) vopt += " duree";
      if (tempeteDeManaCourante.portee) vopt += " portee";
      if (tempeteDeManaCourante.rapide) vopt += " rapide";
      if (tempeteDeManaCourante.altruiste)
        vopt += " altruiste " + tempeteDeManaCourante.altruiste.token.id;
      if (tempeteDeManaCourante.intense)
        vopt += " " + tempeteDeManaCourante.intense;
    }
    v = v.replace(/--tempeteDeMana/, vopt);
    addLineToFramedDisplay(display, bouton(v, "Valider", perso));
    sendChat("", endFramedDisplay(display));
  }

  function setTempeteDeMana(playerId, perso, cmd, options) {
    tempeteDeManaCourante = {
      perso: perso,
      playerId: playerId,
      cmd: cmd,
      rapide: options.rapide,
      dm: options.dm,
      soins: options.soins,
      intense: options.intense,
      porteeDeBase: options.portee,
      dureeDeBase: options.duree,
      altruistePossible: options.altruiste,
      cout: options.cout || 0
    };
    var max;
    if (options.rang) max = options.rang;
    var mana = options.mana || 0;
    var niveau = ficheAttributeAsInt(perso, 'NIVEAU', 1);
    var cout_par_effet = 1;
    if (stateCOF.options.regles.val.mana_totale.val) cout_par_effet = 3;
    if (max === undefined || max > niveau - (mana / cout_par_effet))
      max = Math.floor(niveau - (mana / cout_par_effet));
    if (max < 1) {
      sendChar(perso.charId, "ne peut pas dépenser plus de mana en tempête de mana (niveau " + niveau + ", mana déjà dépensée " + mana + ")");
      return;
    }
    tempeteDeManaCourante.max = max;
    optionsDeTempeteDeMana({
      content: '!cof-tempete-de-mana'
    });
  }

  function parseTempeteDeMana(cmd, options) {
    cmd.shift();
    options.tempeteDeMana = {
      cout: 0
    };
    var altruiste = false;
    cmd.forEach(function(ta) {
      switch (ta) {
        case 'portee':
          if (options.tempeteDeManaPortee) break;
          options.tempeteDeMana.cout++;
          options.tempeteDeManaPortee = true;
          altruiste = false;
          break;
        case 'duree':
          if (options.tempeteDeManaDuree) break;
          options.tempeteDeMana.cout++;
          options.tempeteDeManaDuree = true;
          altruiste = false;
          break;
        case 'rapide':
          options.tempeteDeMana.cout++;
          break;
        case 'altruiste':
          options.altruiste = true;
          altruiste = true;
          break;
        default:
          if (altruiste) {
            altruiste = false;
            var cible = tokenOfId(ta);
            if (cible) {
              options.tempeteDeMana.cout++;
              options.tempeteDeMana.altruiste = cible;
            }
          } else {
            var intensite = parseInt(ta);
            if (isNaN(ta) || ta <= 0) {
              error("Option de tempête de mana " + ta + " non reconnue", cmd);
              break;
            }
            options.tempeteDeManaIntense = options.tempeteDeManaIntense || 0;
            options.tempeteDeManaIntense += intensite;
            options.tempeteDeMana.cout += intensite;
          }
      }
    });
    options.mana = options.mana || 0;
    if (stateCOF.options.regles.val.mana_totale.val)
      options.mana += options.tempeteDeMana.cout * 3;
    else options.mana += options.tempeteDeMana.cout;
  }

  function parseCondition(args) {
    if (args.length > 0 && (args[0] == 'crit' || args[0] == 'critique')) {
      return {
        type: 'critique'
      };
    }
    if (args.length < 2) {
      error("condition non reconnue", args);
      return undefined;
    }
    switch (args[0]) {
      case "etat":
        if (_.has(cof_states, args[1])) {
          return {
            type: 'etat',
            etat: args[1],
            text: args[1]
          };
        }
        return {
          type: 'attribut',
          attribute: args[1],
          text: args[1]
        };
      case "etatCible":
        if (_.has(cof_states, args[1])) {
          return {
            type: 'etatCible',
            etat: args[1],
            text: args[1]
          };
        }
        return {
          type: 'attributCible',
          attribute: args[1],
          text: args[1]
        };
      case "deAttaque":
        var valeurDeAttaque = parseInt(args[1]);
        if (isNaN(valeurDeAttaque)) {
          error("La condition de dé d'attaque doit être un nombre", args);
          // on continue exprès pour tomber dans le cas par défaut
        } else {
          return {
            type: 'deAttaque',
            seuil: valeurDeAttaque,
            text: args[1]
          };
        }
        /* falls through */
      default:
        return {
          type: args[0],
          attribute: args[1],
          text: args[1]
        };
    }
  }

  function closeIte(scope) {
    var ps = scope.parentScope;
    if (ps === undefined) return;
    log("Il manque un endif");
    delete scope.parentScope;
    closeIte(ps);
  }

  function getFx(cmd, argName, obj, funName) {
    if (cmd.length < 2) {
      var errMsg = "Il manque un argument à l'option --" + argName;
      if (funName) errMsg += " de " + funName;
      sendChat("COF", errMsg);
      return;
    }
    if (cmd[1] == 'custom' && cmd.length > 2) {
      var effet = findObjs({
        _type: 'custfx',
        name: cmd[2]
      });
      if (effet.length === 0) {
        sendChat("COF", "L'effet custom " + cmd[2] + " est inconnu.");
        return;
      }
      obj[argName] = effet[0].id;
    } else obj[argName] = cmd[1];
  }

  function parseAttack(msg) {
    // Arguments to cof-attack should be:
    // - attacking token
    // - target token
    // - attack number (referring to the character sheet)
    // - some optional arguments, preceded by --

    var optArgs = msg.content.split(" --");
    var args = optArgs[0].split(" ");
    optArgs.shift();
    if (args.length < 4) {
      error("Pas assez d'arguments pour !cof-attack: " + msg.content, args);
      return;
    }
    var attaquant = tokenOfId(args[1]);
    if (attaquant === undefined) {
      error("Le premier argument de !cof-attack n'est pas un token valide" + msg.content, args[1]);
      return;
    }
    var targetToken = getObj("graphic", args[2]);
    if (targetToken === undefined) {
      error("le second argument de !cof-attack doit être un token" + msg.content, args[2]);
      return;
    }
    var attackLabel = args[3];
    var playerId = getPlayerIdFromMsg(msg);
    // Optional arguments
    var options = {};
    var lastEtat; //dernier de etats et effets
    var scope = options; //Pour les conditionnelles
    optArgs.forEach(function(arg) {
      arg = arg.trim();
      var cmd = arg.split(" ");
      cmd = cmd.filter(function(c) {
        return c !== '';
      });
      if (cmd.length === 0) cmd = [arg];
      switch (cmd[0]) {
        case "pressionMortelle":
        case "ignoreRD":
        case "ignoreMoitieRD":
        case "tempDmg":
        case "vampirise":
        case "enflamme":
        case "malediction":
        case "pietine":
        case "maxDmg":
          scope[cmd[0]] = true;
          return;
        case 'arc':
        case "affute":
        case "argent":
        case "artificiel":
        case "asDeLaGachette":
        case "attaqueMentale":
        case "auto":
        case "avecd12":
        case "contondant":
        case "demiAuto":
        case "explodeMax":
        case "feinte":
        case "ignoreObstacles":
        case "m2d20":
        case "mainsDEnergie":
        case "pasDeDmg":
        case "percant":
        case "pointsVitaux":
        case "poudre":
        case "metal":
        case "reroll1":
        case "reroll2":
        case "semonce":
        case "sortilege":
        case "strigeSuce":
        case "tirDeBarrage":
        case "tranchant":
        case "test":
        case "traquenard":
        case "tueurDeGeants":
        case "grenaille":
        case "attaqueArmeeConjuree":
        case "difficultePVmax":
        case "lamesJumelles":
        case "riposte":
          options[cmd[0]] = true;
          return;
        case "imparable": //deprecated
          options.m2d20 = true;
          return;
        case "tirDouble":
          if (cmd.length > 1)
            options.tirDouble = {
              label: cmd[1]
            };
          else options.tirDouble = options.tirDouble || true;
          return;
        case "magique":
          var niveauMagie = 1;
          if (cmd.length > 1) {
            niveauMagie = parseInt(cmd[1]);
            if (isNaN(niveauMagie) || niveauMagie < 1) {
              error("Le niveau de magie doit être au moins 1", cmd);
              niveauMagie = 1;
            }
          }
          options.magique = niveauMagie;
          return;
        case "si":
          options.conditionAttaquant = parseCondition(cmd.slice(1));
          return;
        case 'tempsRecharge':
          if (cmd.length < 3) {
            error("Il manque un argument à l'option --tempsRecharge de !cof-attack", cmd);
            return;
          }
          if (!estEffetTemp(cmd[1])) {
            error("Le premier argument de l'option --tempsRecharge doit être un effet temporaire répertorié", cmd);
            return;
          }
          var tr = parseInt(cmd[2]);
          if (isNaN(tr)) {
            error("Le deuxième argument de l'option --tempsRecharge doit être un nombre", cmd);
            return;
          }
          options.tempsRecharge = {
            effet: cmd[1],
            duree: tr
          };
          return;
        case "plus":
          if (cmd.length < 2) {
            error("Il manque un argument à l'option --plus de !cof-attack", cmd);
            return;
          }
          var val = arg.substring(arg.indexOf(' ') + 1);
          scope.additionalDmg = scope.additionalDmg || [];
          scope.additionalDmg.push({
            value: val
          });
          break;
        case "effet":
          if (cmd.length < 2) {
            error("Il manque un argument à l'option --effet de !cof-attack", cmd);
            return;
          }
          if (estEffetTemp(cmd[1])) {
            if (cmd.length < 3) {
              error("Il manque un argument à l'option --effet de !cof-attack", cmd);
              return;
            }
            var duree;
            duree = parseInt(cmd[2]);
            if (isNaN(duree) || duree < 1) {
              error(
                "Le deuxième argument de --effet doit être un nombre positif",
                cmd);
              return;
            }
            var m = messageOfEffetTemp(cmd[1]);
            lastEtat = {
              effet: cmd[1],
              duree: duree,
              message: m
            };
            scope.seulementVivant = m && m.seulementVivant;
          } else if (estEffetCombat(cmd[1])) {
            lastEtat = {
              effet: cmd[1]
            };
          } else {
            error(cmd[1] + " n'est pas un effet temporaire répertorié", cmd);
            return;
          }
          scope.effets = scope.effets || [];
          scope.effets.push(lastEtat);
          return;
        case 'valeur':
          if (cmd.length < 2) {
            error("Il manque un argument à l'option --valeur de !cof-attack", cmd);
            return;
          }
          if (scope.effets === undefined || scope.effets.length === 0) {
            error("Il faut un effet avant l'option --valeur", optArgs);
            return;
          }
          scope.effets[0].valeur = cmd[1];
          if (cmd.length > 2) scope.effets[0].valeurMax = cmd[2];
          return;
        case "etatSi":
        case "etat":
          if (cmd.length < 3 && cmd[0] == 'etatSi') {
            error("Il manque un argument à l'option --etatSi de !cof-attack", cmd);
            return;
          } else if (cmd.length < 2) {
            error("Il manque un argument à l'option --etat de !cof-attack", cmd);
            return;
          }
          var etat = cmd[1];
          if (!_.has(cof_states, etat)) {
            error("Etat non reconnu", cmd);
            return;
          }
          var condition = 'toujoursVrai';
          if (cmd[0] == 'etatSi') {
            condition = parseCondition(cmd.slice(2));
            if (condition === undefined) return;
          }
          scope.etats = scope.etats || [];
          lastEtat = {
            etat: etat,
            condition: condition
          };
          if (cmd[0] == 'etat' && cmd.length > 3) {
            if (isCarac(cmd[2])) {
              lastEtat.saveCarac = cmd[2];
              var opposition = tokenOfId(cmd[3]);
              if (opposition) {
                lastEtat.saveDifficulte = cmd[3] + ' ' + opposition.token.get('name');
              } else {
                lastEtat.saveDifficulte = parseInt(cmd[3]);
                if (isNaN(lastEtat.saveDifficulte)) {
                  error("Difficulté du jet de sauvegarde incorrecte", cmd);
                  delete lastEtat.saveCarac;
                  delete lastEtat.saveDifficulte;
                }
              }
            }
          }
          scope.etats.push(lastEtat);
          return;
        case "psi": //deprecated
          var psil = 0;
          if (scope.adiitionalDmg) psil = scope.additionalDmg.length;
          if (psil === 0) {
            error("option --psi non précédée d'un --plus", optArgs);
            return;
          }
          var psiCond = parseCondition(cmd.slice(1));
          if (psiCond) {
            var psiDmg = scope.additionalDmg[psil - 1];
            psiDmg.conditions = psiDmg.conditions || [];
            psiDmg.conditions.push(psiCond);
          }
          return;
        case "peur":
          if (cmd.length < 3) {
            error("Il manque un argument à l'option --peur de !cof-attack", cmd);
            return;
          }
          scope.peur = {
            seuil: parseInt(cmd[1]),
            duree: parseInt(cmd[2])
          };
          if (isNaN(scope.peur.seuil)) {
            error("Le premier argument de --peur doit être un nombre (le seuil)", cmd);
          }
          if (isNaN(scope.peur.duree) || scope.peur.duree <= 0) {
            error("Le deuxième argument de --peur doit être un nombre positif (la durée)", cmd);
          }
          return;
        case "feu":
        case "froid":
        case "acide":
        case "electrique":
        case "sonique":
        case "poison":
        case "maladie":
          var l = 0;
          if (scope.additionalDmg) l = scope.additionalDmg.length;
          if (l > 0) {
            scope.additionalDmg[l - 1].type = cmd[0];
          } else {
            scope.type = cmd[0];
          }
          return;
        case "nature":
        case "naturel":
          scope.nature = true;
          return;
        case "sournoise":
        case "de6Plus": //deprecated
          if (cmd.length < 2) {
            sendChat("COF", "Il manque un argument à l'option --sournoise de !cof-attack");
            return;
          }
          if (scope.sournoise === undefined) scope.sournoise = 0;
          scope.sournoise += parseInt(cmd[1]);
          if (isNaN(scope.sournoise) || scope.sournoise < 0) {
            error("L'option --sournoise de !cof-attack attend un argument entier positif", cmd);
            return;
          }
          break;
        case "fx":
          getFx(cmd, 'fx', scope, '!cof-attack');
          return;
        case "targetFx":
          getFx(cmd, 'targetFx', scope, '!cof-attack');
          return;
        case 'psave':
          var psaveopt = scope;
          if (cmd.length > 3 && cmd[3] == 'local') {
            var psavel = 0;
            if (scope.additionalDmg) psavel = scope.additionalDmg.length;
            if (psavel > 0) {
              psaveopt = scope.additionalDmg[psavel - 1];
            }
          }
          var psaveParams = parseSave(cmd);
          if (psaveParams) {
            psaveopt.partialSave = psaveParams;
            psaveopt.attaquant = attaquant;
          }
          return;
        case 'save':
          if (lastEtat) {
            if (lastEtat.save) {
              error("Redéfinition de la condition de save pour un effet", optArgs);
            }
            var saveParams = parseSave(cmd);
            if (saveParams) {
              lastEtat.save = saveParams;
              return;
            }
            return;
          }
          error("Pas d'effet auquel appliquer le save", optArgs);
          return;
        case 'saveParTour':
          if (lastEtat) {
            if (lastEtat.saveParTour) {
              error("Redéfinition de la condition de save pour un effet", optArgs);
            }
            var saveParTourParams = parseSave(cmd);
            if (saveParTourParams) {
              lastEtat.saveParTour = saveParTourParams;
              return;
            }
            return;
          }
          error("Pas d'effet auquel appliquer le save", optArgs);
          return;
        case "mana":
          if (cmd.length < 2) {
            error("Usage : --mana coût", cmd);
            return;
          }
          var mana = parseInt(cmd[1]);
          if (isNaN(mana) || mana < 1) {
            error("Le coût en mana doit être un nombre positif");
            return;
          }
          if (scope.mana === undefined) scope.mana = 0;
          scope.mana += mana;
          break;
        case "tempeteDeMana":
          parseTempeteDeMana(cmd, options);
          return;
        case "rang":
          if (cmd.length < 2) {
            error("Usage : --rang r", cmd);
            return;
          }
          var rang = parseInt(cmd[1]);
          if (isNaN(rang) || rang < 1) {
            error("Le rang doit être un nombre positif");
            return;
          }
          scope.rang = rang;
          break;
        case "bonusAttaque":
        case "bonusContreBouclier":
          if (cmd.length < 2) {
            error("Usage : --" + cmd[0] + " b", cmd);
            return;
          }
          var bAtt = parseInt(cmd[1]);
          if (isNaN(bAtt)) {
            error("Le bonus (" + cmd[0] + ") doit être un nombre");
            return;
          }
          if (scope[cmd[0]] === undefined) scope[cmd[0]] = 0;
          scope[cmd[0]] += bAtt;
          return;
        case "bonusCritique":
          if (cmd.length < 2) {
            error("Usage : --" + cmd[0] + " b", cmd);
            return;
          }
          var b2Att = parseInt(cmd[1]);
          if (isNaN(b2Att)) {
            error("Le bonus (" + cmd[0] + ") doit être un nombre");
            return;
          }
          if (options[cmd[0]] === undefined) options[cmd[0]] = 0;
          options[cmd[0]] += b2Att;
          return;
        case 'puissant':
          if (cmd.length < 2) {
            scope.puissant = true;
            return;
          }
          switch (cmd[1]) {
            case 'oui':
            case 'Oui':
              scope.puissant = true;
              return;
            case 'non':
            case 'Non':
              scope.puissant = false;
              return;
            case 'duree':
              scope.puissantDuree = true;
              return;
            default:
              scope.puissant = attributeAsBool(attaquant, cmd[1] + "Puissant");
          }
          return;
        case "rate":
        case "touche":
        case "critique":
        case "echecCritique":
          if (options.triche === undefined) {
            options.triche = cmd[0];
          } else {
            error("Option incompatible", optArgs);
          }
          return;
        case 'munition':
          if (cmd.length < 2) {
            error("Pour les munitions, il faut préciser le nom", cmd);
            return;
          }
          var tauxPertes = 100; //Par défaut, les munitions sont perdues
          if (cmd.length > 2)
            tauxPertes = parseInt(cmd[2]);
          if (isNaN(tauxPertes) || tauxPertes < 0 || tauxPertes > 100) {
            error("Le taux de pertes des munitions doit être un nombre entre 0 et 100");
            tauxPertes = 100;
          }
          options.munition = {
            nom: cmd[1],
            taux: tauxPertes
          };
          return;
        case "ligne":
          if (options.aoe) {
            error("Deux options pour définir une aoe", args);
            return;
          }
          options.aoe = {
            type: 'ligne'
          };
          return;
        case "disque":
          if (options.aoe) {
            error("Deux options pour définir une aoe", args);
            return;
          }
          if (cmd.length < 2) {
            error("Il manque le rayon du disque", cmd);
            return;
          }
          options.aoe = {
            type: 'disque',
            rayon: parseInt(cmd[1])
          };
          if (isNaN(options.aoe.rayon) || options.aoe.disque < 0) {
            error("le rayon du disque n'est pas un nombre positif", cmd);
            delete options.aoe;
          }
          return;
        case "cone":
          if (options.aoe) {
            error("Deux options pour définir une aoe", args);
            return;
          }
          var angle = 90;
          if (cmd.length > 1) {
            angle = parseInt(cmd[1]);
            if (isNaN(angle) || angle < 0 || angle > 360) {
              error("Paramètre d'angle du cone incorrect", cmd);
              angle = 90;
            }
          }
          options.aoe = {
            type: 'cone',
            angle: angle
          };
          return;
        case 'target':
          if (cmd.length < 2) {
            error("Il manque l'id de la cible", cmd);
            return;
          }
          var targetS = tokenOfId(cmd[1]);
          if (targetS === undefined) {
            error("Cible supplémentaire invalide", cmd);
            return;
          }
          if (targetToken.id == targetS.token.id) return;
          targetS.tokName = targetS.token.get('name');
          options.ciblesSupplementaires = options.ciblesSupplementaires || [];
          options.ciblesSupplementaires.push(targetS);
          return;
        case 'limiteParJour':
          if (cmd.length < 2) {
            error("Il manque la limite journalière", cmd);
            return;
          }
          var limiteParJour = parseInt(cmd[1]);
          if (isNaN(limiteParJour) || limiteParJour < 1) {
            error("La limite journalière doit être un nombre positif", cmd);
            return;
          }
          scope.limiteParJour = limiteParJour;
          if (cmd.length > 2) {
            cmd.splice(0, 2);
            scope.limiteParJourRessource = cmd.joins('_');
          }
          return;
        case 'limiteParCombat':
          if (cmd.length < 2) {
            scope.limiteParCombat = 1;
            return;
          }
          var limiteParCombat = parseInt(cmd[1]);
          if (isNaN(limiteParCombat) || limiteParCombat < 1) {
            error("La limite par combat doit être un nombre positif", cmd);
            return;
          }
          scope.limiteParCombat = limiteParCombat;
          if (cmd.length > 2) {
            cmd.splice(0, 2);
            scope.limiteParCombatRessource = cmd.join('_');
          }
          return;
        case 'decrAttribute':
          if (cmd.length < 2) {
            error("Erreur interne d'une commande générée par bouton", cmd);
            return;
          }
          var attr = getObj('attribute', cmd[1]);
          if (attr === undefined) {
            attr = tokenAttribute(attaquant, cmd[1]);
            if (attr.length === 0) {
              log("Attribut à changer perdu");
              log(cmd);
              return;
            }
            attr = attr[0];
          }
          scope.decrAttribute = attr;
          return;
        case "incrDmgCoef":
          scope.dmgCoef = (scope.dmgCoef || 1);
          if (cmd.length > 1) {
            var incrDmgCoef = parseInt(cmd[1]);
            if (isNaN(incrDmgCoef)) {
              error("L'option --incrDmgCoef attend un entier", cmd);
              return;
            }
            scope.dmgCoef += incrDmgCoef;
            return;
          }
          scope.dmgCoef++; //Par défaut, incrémente de 1
          return;
        case "incrCritCoef":
          scope.critCoef = (scope.critCoef || 1);
          if (cmd.length > 1) {
            var incrCritCoef = parseInt(cmd[1]);
            if (isNaN(incrCritCoef)) {
              error("L'option --incrCritCoef attend un entier", cmd);
              return;
            }
            scope.critCoef += incrCritCoef;
            return;
          }
          scope.critCoef++; //Par défaut, incrémente de 1
          return;
        case "if":
          var ifCond = parseCondition(cmd.slice(1));
          if (ifCond === undefined) return;
          var ifThen = {
            parentScope: scope
          };
          scope.ite = scope.ite || [];
          scope.ite.push({
            condition: ifCond,
            then: ifThen
          });
          scope = ifThen;
          return;
        case "endif":
          var psEndif = scope.parentScope;
          if (psEndif === undefined) {
            error("--endIf sans --if correspondant", cmd);
            return;
          }
          delete scope.parentScope; //To remove circular dependencies in options
          scope = psEndif;
          return;
        case "else":
          var psElse = scope.parentScope;
          if (psElse === undefined) {
            error("--else sans --if correspondant", cmd);
            return;
          }
          var iteL = psElse.ite[psElse.ite.length - 1];
          if (iteL.else) {
            error("Il y a déjà un --else pour ce --if", cmd);
            return;
          }
          delete scope.parentScope;
          var ifElse = {
            parentScope: psElse
          };
          iteL.else = ifElse;
          scope = ifElse;
          return;
        case 'message':
          if (cmd.length < 2) {
            error("Il manque le message après --message", cmd);
            return;
          }
          scope.messages = scope.messages || [];
          scope.messages.push(cmd.slice(1).join(' '));
          return;
        case 'allonge':
          if (cmd.length < 2) {
            error("Il manque le message après --allonge", cmd);
            return;
          }
          if (options.allonge !== undefined) {
            log("Redéfinition de l'allong");
          }
          options.allonge = parseFloat(cmd[1]);
          if (isNaN(options.allonge)) {
            error("L'argument de --allonge n'est pas un nombre", cmd);
          }
          return;
        case 'enveloppe':
          scope.enveloppe = {
            difficulte: 15,
            type: 'label',
            expression: attackLabel
          };
          if (cmd.length > 1) {
            scope.enveloppe.difficulte = parseInt(cmd[1]);
            if (isNaN(scope.enveloppe.difficulte))
              scope.enveloppe.difficulte = 15;
          }
          if (cmd.length > 3) {
            scope.enveloppe.type = cmd[2];
            scope.enveloppe.expression = cmd[3];
          }
          return;
        default:
          sendChat("COF", "Argument de !cof-attack '" + arg + "' non reconnu");
      }
    });
    closeIte(scope); //pour fermer les endif mal formés et éviter les boucles
    options.additionalDmg = options.additionalDmg || [];
    if (options.tempeteDeMana) {
      if (options.tempeteDeMana.cout === 0) {
        //On demande de préciser les options
        var optMana = {
          mana: options.mana,
          rang: options.rang,
          portee: true //Pour avoir l'option
        };
        if (!options.pasDeDmg) optMana.dm = true;
        if (options.effets) {
          options.effets.forEach(function(ef) {
            if (ef.effet) {
              if (estEffetTemp(ef.effet)) {
                optMana.dm = optMana.dm || (ef.message && ef.message.dm);
                optMana.soins = optMana.soins || (ef.message && ef.message.soins);
                optMana.duree = true;
              }
            } else if (estEffetCombat(ef.effet)) {
              optMana.dm = optMana.dm || messageEffetCombat[ef.effet].dm;
              optMana.soins = optMana.soins || messageEffetCombat[ef.effet].soins;
            }
          });
        }
        setTempeteDeMana(playerId, attaquant, msg.content, optMana);
        return;
      } else {
        if (options.rang && options.tempeteDeMana.cout > options.rang) {
          sendChar(attaquant.charId, "Attention, le coût de la tempête de mana (" + options.tempeteDeMana.cout + ") est supérieur au rang du sort");
        }
      }
    }
    if (options.tempeteDeManaDuree || options.puissantDuree) {
      if (options.pasDeDmg) {
        if (options.peur && options.peur.duree)
          options.peur.duree = options.peur.duree * 2;
        if (options.effets) {
          options.effets.forEach(function(ef) {
            if (ef.effet && ef.duree && !ef.message.dm && !ef.message.soins) {
              ef.duree = ef.duree * 2;
            }
          });
        }
      } else {
        if (options.tempeteDeManDuree) {
          sendChar(attaquant.charId, "Attention, l'option tempête de mana pour la durée n'est pas prise en compte. Utiliser l'option --pasDeDmg si le sort ne fait pas de DM");
          options.tempeteDeManaDuree = false;
          if (options.tempeteDeMana && options.tempeteDeMana.cout)
            options.tempeteDeMana.cout--;
          if (options.mana) {
            if (stateCOF.options.regles.val.mana_totale.val) options.mana -= 3;
            else options.mana--;
          }
        }
      }
    }
    attack(playerId, attaquant, targetToken, attackLabel, options);
  }

  //Si evt est défini, alors on considère qu'il faut y mettre la valeur actuelle
  function updateCurrentBar(token, barNumber, val, evt, maxVal) {
    var prevToken;
    var HTdeclared;
    try {
      HTdeclared = HealthColors;
    } catch (e) {
      if (e.name != "ReferenceError") throw (e);
    }
    if (HTdeclared) {
      //Pour pouvoir annuler les effets de HealthColor sur le statut
      affectToken(token, 'statusmarkers', token.get('statusmarkers'), evt);
      prevToken = JSON.parse(JSON.stringify(token));
    }
    var fieldv = 'bar' + barNumber + '_value';
    var fieldm;
    if (maxVal) fieldm = 'bar' + barNumber + '_max';
    var attrId = token.get("bar" + barNumber + "_link");
    if (attrId === "") {
      var prevVal = token.get(fieldv);
      if (evt) affectToken(token, fieldv, prevVal, evt);
      token.set(fieldv, val);
      if (maxVal) {
        var prevMax = token.get(fieldm);
        if (evt) affectToken(token, fieldm, token.get(fieldm), evt);
        token.set(fieldm, val);
      }
      if (HTdeclared) HealthColors.Update(token, prevToken);
      return;
    }
    var attr = getObj('attribute', attrId);
    if (evt) {
      evt.attributes = evt.attributes || [];
      evt.attributes.push({
        attribute: attr,
        current: attr.get('current'),
        max: attr.get('max')
      });
    }
    attr.set('current', val);
    if (maxVal) attr.set('max', maxVal);
    if (HTdeclared) HealthColors.Update(token, prevToken);
    return;
  }

  // Fait dépenser de la mana, et si pas possible, retourne false
  function depenseMana(personnage, cout, msg, evt) {
    if (cout === 0) return true;
    var token = personnage.token;
    var charId = personnage.charId;
    var manaAttr = findObjs({
      _type: 'attribute',
      _characterid: charId,
      name: 'PM'
    });
    var hasMana = false;
    if (manaAttr.length > 0) {
      var manaMax = parseInt(manaAttr[0].get('max'));
      hasMana = !isNaN(manaMax) && manaMax > 0;
    }
    if (hasMana) {
      var bar2 = parseInt(token.get("bar2_value"));
      if (isNaN(bar2)) {
        if (token.get('bar1_link') === '') bar2 = 0;
        else { //devrait être lié à la mana courante
          sendChar(charId, "*** Attention, la barre de mana du token n'est pas liée à la mana de la fiche ***");
          bar2 = parseInt(manaAttr[0].get('current'));
        }
      }
      if (bar2 < cout) {
        msg = msg || '';
        sendChar(charId, " n'a pas assez de points de mana pour " + msg);
        return false;
      }
      updateCurrentBar(token, 2, bar2 - cout, evt);
      var niveau = ficheAttributeAsInt(personnage, 'NIVEAU', 1);
      if (stateCOF.options.regles.val.mana_totale.val) {
        if (cout > niveau * 3) {
          sendChar(charId, "Attention, la dépense totale de mana est supérieure au niveau * 3");
        }
      } else {
        if (cout > niveau) {
          sendChar(charId, "Attention, la dépense totale de mana est supérieure au niveau");
        }
      }
      return true;
    }
    sendChar(charId, " n'a pas de points de mana, action impossible");
    return false;
  }

  function parseSave(cmd) {
    if (cmd.length < 3) {
      error("Usage : --save carac seuil", cmd);
      return;
    }
    var carac1;
    var carac2;
    if (cmd[1].length == 3) {
      carac1 = cmd[1];
      if (!isCarac(cmd[1])) {
        error("Le premier argument de save n'est pas une caractéristique", cmd);
        return;
      }
    } else if (cmd[1].length == 6) { //Choix parmis 2 caracs
      carac1 = cmd[1].substr(0, 3);
      carac2 = cmd[1].substr(3, 3);
      if (!isCarac(carac1) || !isCarac(carac2)) {
        error("Le premier argument de save n'est pas une caractéristique", cmd);
        return;
      }
    } else {
      error("Le premier argument de save n'est pas une caractéristique", cmd);
      return;
    }

    var res = {
      carac: carac1,
      carac2: carac2,
      seuil: parseInt(cmd[2])
    };
    if (isNaN(res.seuil)) {
      error("Le deuxième argument de --psave n'est pas un nombre", cmd);
      return;
    }
    if (cmd.length > 3) {
      switch (cmd[3]) {
        case 'carac':
        case 'carac2':
        case 'seuil':
          error("Argument supplémentaire de save inconnu", cmd);
          break;
        default:
          res[cmd[3]] = true;
      }
    }
    return res;
  }

  function testCondition(cond, attaquant, cibles, deAttaque) {
    if (cond == 'toujoursVrai') return true;
    switch (cond.type) {
      case "moins":
        // Au cas où on utilise les MOD au lieu de l'attribut de base:
        var attribute = caracOfMod(cond.attribute);
        if (attribute) cond.attribute = attribute;
        var attackerAttr = charAttributeAsInt(attaquant, cond.attribute, 0);
        var resMoins = true;
        cibles.forEach(function(target) {
          if (resMoins) {
            var targetAttr = charAttributeAsInt(target, cond.attribute, 0);
            if (targetAttr >= attackerAttr) resMoins = false;
          }
        });
        return resMoins;
      case "etat":
        return (getState(attaquant, cond.etat));
      case "etatCible":
        var resEtatCible = true;
        cibles.forEach(function(target) {
          if (resEtatCible && !getState(target, cond.etat))
            resEtatCible = false;
        });
        return resEtatCible;
      case "attribut":
        return (attributeAsBool(attaquant, cond.attribute));
      case "attributCible":
        var resAttrCible = true;
        cibles.forEach(function(target) {
          if (resAttrCible && !attributeAsBool(target, cond.attribute))
            resAttrCible = false;
        });
        return resAttrCible;
      case "deAttaque":
        if (deAttaque === undefined) {
          error("Condition de dé d'attaque non supportée ici", cond);
          return true;
        }
        if (deAttaque < cond.seuil) return false;
        return true;
      case "critique":
        return cibles.every(function(target) {
          if (target.critique) return true;
          return false;
        });
      default:
        error("Condition non reconnue", cond);
    }
    return false;
  }

  //Evaluation récursive des if-then-else
  function evalITE(attaquant, target, deAttaque, options, evt, explications, scope, inTarget) {
    if (scope.ite === undefined) return;
    scope.ite = scope.ite.filter(function(ite) {
      var condInTarget = inTarget;
      var resCondition;
      if (ite.condition == 'toujoursVrai') resCondition = true;
      switch (ite.condition.type) {
        case 'etat':
        case 'attribut':
          resCondition = testCondition(ite.condition, attaquant, [], deAttaque);
          break;
        case 'deAttaque':
          if (deAttaque === undefined) return true;
          resCondition = testCondition(ite.condition, attaquant, [], deAttaque);
          break;
        case 'moins':
        case 'etatCible':
        case 'attributCible':
          if (target === undefined) return true;
          condInTarget = true;
          resCondition = testCondition(ite.condition, attaquant, [target], deAttaque);
          break;
        case 'critique':
          if (target === undefined || deAttaque === undefined) return true;
          condInTarget = true;
          resCondition = testCondition(ite.condition, attaquant, [target], deAttaque);
          break;
        default:
          error("Condition non reconnue", ite.condition);
          resCondition = true;
      }
      var branch;
      if (resCondition) branch = ite.then;
      else branch = ite.else;
      if (branch === undefined) return condInTarget; //On garde l'ite si on dépende de la cible
      //On copie les champs de scope dans options ou dans target
      var opt = options;
      if (condInTarget) opt = target;
      for (var field in branch) {
        switch (field) {
          case 'additionalDmg':
          case 'effets':
          case 'etats':
            opt[field] = opt[field] || [];
            opt[field] = opt[field].concat(branch[field]);
            break;
          case 'sournoise':
          case 'mana':
          case 'bonusAttaque':
          case 'bonusContreBouclier':
            opt[field] = opt[field] || 0;
            opt[field] += branch[field];
            break;
          case 'dmgCoef':
          case 'critCoef':
            if (opt[field] === undefined) {
              if (condInTarget) opt[field] = 0;
              else opt[field] = 1;
            }
            opt[field] += branch[field] - 1;
            break;
          case 'messages':
            if (condInTarget) target.messages.concat(branch.messages);
            else { /*jshint loopfunc: true */
              branch.messages.forEach(function(m) {
                explications.push(m);
              });
            }
            break;
          case 'decrAttribute':
            var attr = branch.decrAttribute;
            var oldval = parseInt(attr.get('current'));
            if (isNaN(oldval) || oldval < 1) {
              sendChar(attr.get('characterid'), "ne peut plus faire cela");
              break;
            }
            evt.attributes = evt.attributes || [];
            evt.attributes.push({
              attribute: attr,
              current: oldval,
              max: attr.get('max')
            });
            attr.set('current', oldval - 1);
            break;
          default:
            opt[field] = branch[field];
        }
      }
      evalITE(attaquant, target, deAttaque, options, evt, explications, branch, condInTarget);
      return condInTarget;
    });
  }

  // evt et msg peuvent être undefined
  function removeTokenAttr(personnage, attribute, evt, msg) {
    var charId = personnage.charId;
    var token = personnage.token;
    // check if the token is linked to the character. If not, use token name
    // in attribute name (token ids don't persist over API reload)
    if (token) {
      var link = token.get('bar1_link');
      if (link === '') attribute += "_" + token.get('name');
    }
    var attr = findObjs({
      _type: 'attribute',
      _characterid: charId,
      name: attribute
    });
    if (attr.length === 0) return;
    if (msg !== undefined) {
      sendChar(charId, msg);
    }
    attr = attr[0];
    if (evt) {
      evt.deletedAttributes = evt.deletedAttributes || [];
      evt.deletedAttributes.push(attr);
    }
    attr.remove();
  }

  function removeAllAttributes(name, evt, attrs) {
    if (attrs === undefined) {
      attrs = findObjs({
        _type: 'attribute'
      });
    }
    var attrsNamed = allAttributesNamed(attrs, name);
    if (attrsNamed.length === 0) return attrs;
    if (evt.deletedAttributes === undefined) evt.deletedAttributes = [];
    attrsNamed.forEach(function(attr) {
      evt.deletedAttributes.push(attr);
      attr.remove();
    });
    attrs = attrs.filter(function(attr) {
      var ind = attrsNamed.findIndex(function(nattr) {
        return nattr.id == attr.id;
      });
      return (ind == -1);
    });
    return attrs;
  }

  function onGenre(charId, male, female) {
    var sex = getAttrByName(charId, 'SEXE');
    if (sex.startsWith('F')) return female;
    return male;
  }

  function tokenInit(perso, evt) {
    var persoMonte = tokenAttribute(perso, 'estMontePar');
    if (persoMonte.length > 0) {
      var cavalier = tokenOfId(persoMonte[0].get('current'), persoMonte[0].get('max'), perso.token.get('pageid'));
      if (cavalier !== undefined) return tokenInit(cavalier, evt);
    }
    var init;
    if (getAttrByName(perso.charId, 'type_personnage') == 'PNJ') {
      init = ficheAttributeAsInt(perso, 'pnj_init');
    } else {
      init = ficheAttributeAsInt(perso, 'DEXTERITE', 10);
      init += ficheAttributeAsInt(perso, 'INIT_DIV', 0);
    }
    //Règle optionelle : +1d6, à lancer en entrant en combat
    if (stateCOF.options.regles.val.initiative_variable.val) {
      var bonusVariable = attributeAsInt(perso, 'bonusInitVariable', 0);
      if (bonusVariable === 0) {
        var rollD6 = rollDePlus(6);
        bonusVariable = rollD6.val;
        var msg = "entre en combat. ";
        msg += onGenre(perso.charId, 'Il', 'Elle') + " fait " + rollD6.roll;
        msg += " à son jet d'initiative";
        setTokenAttr(perso, 'bonusInitVariable', bonusVariable, evt, msg);
      }
      init += bonusVariable;
    }
    if (attributeAsBool(perso, 'formeDArbre')) init = 7;
    if (getState(perso, 'aveugle')) init -= 5;
    // Voie du compagnon animal rang 2 (surveillance)
    init += attributeAsInt(perso, 'bonusInitEmbuscade', 0);
    // Voie du chef d'armée rang 2 (Capitaine)
    if (aUnCapitaine(perso, evt)) init += 2;
    if (charAttributeAsBool(perso, 'graceFeline')) {
      init += modCarac(perso, 'CHARISME');
    }
    if (attributeAsBool(perso, 'masqueDuPredateur')) {
      init += getValeurOfEffet(perso, 'masqueDuPredateur', modCarac(perso, 'SAGESSE'));
    }
    if (charAttributeAsBool(perso, 'controleDuMetabolisme')) {
      init += getValeurOfEffet(perso, 'controleDuMetabolisme', modCarac(perso, 'CHARISME'));
    }
    // Voie du pistolero rang 1 (plus vite que son ombre)
    var armeEnMain = tokenAttribute(perso, 'armeEnMain');
    if (armeEnMain.length > 0) {
      var armeL = armeEnMain[0].get('current');
      if (charAttributeAsInt(perso, "charge_" + armeL, 0) > 0) {
        init += charAttributeAsInt(perso, 'initEnMain' + armeL, 0);
      }
    }
    return init;
  }

  function initiative(selected, evt, recompute) { //set initiative for selected tokens
    // Always called when entering combat mode
    // set the initiative counter, if not yet set
    // Assumption: all tokens that have not acted yet are those before the turn 
    // counter.
    // When initiative for token not present, assumes it has not acted
    // When present, stays in same group, but update position according to
    // current initiative.
    // Tokens appearing before the turn are sorted
    if (!Campaign().get('initiativepage')) evt.initiativepage = false;
    if (!stateCOF.combat) { //actions de début de combat
      evt.combat = false;
      evt.combat_pageid = stateCOF.combat_pageid;
      stateCOF.combat = true;
      Campaign().set({
        turnorder: JSON.stringify([{
          id: "-1",
          pr: 1,
          custom: "Tour",
          formula: "+1"
        }]),
        initiativepage: true
      });
      evt.tour = stateCOF.tour;
      stateCOF.tour = 1;
      evt.init = stateCOF.init;
      stateCOF.init = 1000;
      removeAllAttributes('transeDeGuérison', evt);
    }
    if (!Campaign().get('initiativepage')) {
      Campaign().set('initiativepage', true);
    }
    var to = getTurnOrder(evt);
    if (to.pasAgi.length === 0) { // Fin de tour, on met le tour à la fin et on retrie
      to.pasAgi = to.dejaAgi;
      to.dejaAgi = [];
    }
    iterSelected(selected, function(perso) {
      stateCOF.combat_pageid = perso.token.get('pageid');
      if (!isActive(perso)) return;
      var init = tokenInit(perso, evt);
      // On place le token à sa place dans la liste du tour
      var dejaIndex =
        to.dejaAgi.findIndex(function(elt) {
          return (elt.id == perso.token.id);
        });
      if (dejaIndex == -1) { //Le personnage doit encore agir
        var push = true;
        to.pasAgi =
          to.pasAgi.filter(function(elt) {
            if (elt.id == perso.token.id) {
              if (recompute) return false; //On enlève le perso des pasAgi
              push = false; //Sinon, comme on ne recalcule pas, on le laisse
              return true;
            }
            return true;
          });
        if (push)
          to.pasAgi.push({
            id: perso.token.id,
            pr: init,
            custom: ''
          });
      } else {
        to.dejaAgi[dejaIndex].pr = init;
      }
    });
    setTurnOrder(to, evt);
  }

  function initPerso(personnage, evt, recompute) {
    initiative([{
      _id: personnage.token.id
    }], evt, recompute);
  }

  function setTokenAttr(personnage, attribute, value, evt, msg, maxval) {
    var charId = personnage.charId;
    var token = personnage.token;
    if (msg !== undefined) {
      sendChar(charId, msg);
    }
    evt.attributes = evt.attributes || [];
    var agrandir = false;
    if (attribute == 'agrandissement' && token) agrandir = true;
    var formeArbre = false;
    if (attribute == 'formeDArbre' && token) formeArbre = true;
    // check if the token is linked to the character. If not, use token name
    // in attribute name (token ids don't persist over API reload)
    if (token) {
      var link = token.get('bar1_link');
      if (link === "") attribute += "_" + token.get('name');
    }
    var attr = findObjs({
      _type: 'attribute',
      _characterid: charId,
      name: attribute
    });
    if (attr.length === 0) {
      if (maxval === undefined) maxval = '';
      attr = createObj('attribute', {
        characterid: charId,
        name: attribute,
        current: value,
        max: maxval
      });
      evt.attributes.push({
        attribute: attr,
        current: null
      });
      if (agrandir) {
        var width = token.get('width');
        var height = token.get('height');
        affectToken(token, 'width', width, evt);
        affectToken(token, 'height', height, evt);
        width += width / 2;
        height += height / 2;
        token.set('width', width);
        token.set('height', height);
      } else if (formeArbre) {
        //On copie les PVs pour pouvoir les restaurer à la fin de l'effet
        setTokenAttr(personnage, 'anciensPV', token.get('bar1_value'), evt, undefined, token.get('bar1_max'));
        //On va créer une copie de token, mais avec une image d'arbre
        var tokenFields = {
          _pageid: token.get('pageid'),
          represents: personnage.charId,
          left: token.get('left'),
          top: token.get('top'),
          width: token.get('width'),
          height: token.get('height'),
          rotation: token.get('rotation'),
          layer: 'objects',
          name: token.get('name'),
          bar1_value: token.get('bar1_value'),
          bar1_max: token.get('bar1_max'),
          bar1_link: token.get('bar1_link'),
          bar2_value: token.get('bar2_value'),
          bar2_max: token.get('bar2_max'),
          bar2_link: token.get('bar2_link'),
          bar3_value: token.get('bar3_value'),
          bar3_max: token.get('bar3_max'),
          aura1_radius: token.get('aura1_radius'),
          aura1_color: token.get('aura1_color'),
          aura1_square: token.get('aura1_square'),
          showplayers_aura1: token.get('showplayers_aura1'),
          aura2_radius: token.get('aura2_radius'),
          aura2_color: token.get('aura2_color'),
          aura2_square: token.get('aura2_square'),
          showplayers_aura2: token.get('showplayers_aura2'),
          statusmarkers: token.get('statusmarkers'),
          light_radius: token.get('light_radius'),
          light_dimradius: token.get('light_dimradius'),
          light_otherplayers: token.get('light_otherplayers'),
          light_hassight: token.get('light_hassight'),
          light_angle: token.get('light_angle'),
          light_losangle: token.get('light_losangle'),
          light_multiplier: token.get('light_multiplier'),
          showname: token.get('showname'),
          showplayers_name: token.get('showplayers_name'),
          showplayers_bar1: token.get('showplayers_bar1'),
        };
        var tokenArbre;
        var imageArbre = findObjs({
          _type: 'attribute',
          _characterid: personnage.charId,
          name: 'tokenFormeDArbre'
        });
        if (imageArbre.length > 0) {
          tokenFields.imgsrc = imageArbre[0].get('current');
          tokenArbre = createObj('graphic', tokenFields);
        }
        if (tokenArbre === undefined) {
          tokenFields.imgsrc = stateCOF.options.images.val.image_arbre.val;
          tokenArbre = createObj('graphic', tokenFields);
        }
        if (tokenArbre) {
          //On met l'ancien token dans le gmlayer, car si l'image vient du merketplace, il est impossible de le recréer depuis l'API
          setToken(token, 'layer', 'gmlayer', evt);
          setTokenAttr(personnage, 'changementDeToken', true, evt);
          replaceInTurnTracker(token.id, tokenArbre.id, evt);
          personnage.token = tokenArbre;
          token = tokenArbre;
        }
        //On met maintenant les nouveaux PVs
        //selon Kegron http://www.black-book-editions.fr/forums.php?topic_id=4800&tid=245841#msg245841
        var niveau = ficheAttributeAsInt(personnage, 'NIVEAU', 1);
        var nouveauxPVs = getValeurOfEffet(personnage, 'formeDArbre', niveau * 5);
        updateCurrentBar(token, 1, nouveauxPVs, evt, nouveauxPVs);
        //L'initiative change
        initPerso(personnage, evt, true);
      }
      return attr;
    }
    attr = attr[0];
    evt.attributes.push({
      attribute: attr,
      current: attr.get('current'),
      max: attr.get('max')
    });
    attr.set('current', value);
    if (maxval !== undefined) attr.set('max', maxval);
    return attr;
  }

  // bonus d'attaque d'un token, indépendament des options
  // Mise en commun pour attack et attaque-magique
  function bonusDAttaque(personnage, explications, evt) {
    explications = explications || [];
    var charId = personnage.charId;
    var tempAttkMod; // Utilise la barre 3 de l'attaquant
    tempAttkMod = parseInt(personnage.token.get("bar3_value"));
    if (tempAttkMod === undefined || isNaN(tempAttkMod) || tempAttkMod === "") {
      tempAttkMod = 0;
    }
    var attBonus = tempAttkMod;
    var fortifie = attributeAsInt(personnage, 'fortifie', 0);
    if (fortifie > 0) {
      attBonus += 3;
      fortifie--;
      explications.push("Effet du fortifiant => +3 en Attaque. Il sera encore actif pour " + fortifie + " tests");
      if (fortifie === 0) {
        removeTokenAttr(personnage, 'fortifie', evt);
      } else {
        setTokenAttr(personnage, 'fortifie', fortifie, evt);
      }
    }
    attBonus += charAttributeAsInt(personnage, 'actionConcertee', 0);
    if (attributeAsBool(personnage, 'chantDesHeros')) {
      var bonusChantDesHeros = getValeurOfEffet(personnage, 'chantDesHeros', 1);
      var chantDesHerosIntense = attributeAsInt(personnage, 'chantDesHerosTempeteDeManaIntense', 0);
      bonusChantDesHeros += chantDesHerosIntense;
      attBonus += bonusChantDesHeros;
      explications.push("Chant des héros => +" + bonusChantDesHeros + " en Attaque");
      if (chantDesHerosIntense)
        removeTokenAttr(personnage, 'chantDesHerosTempeteDeManaIntense', evt);
    }
    if (attributeAsBool(personnage, 'benediction')) {
      var bonusBenediction = getValeurOfEffet(personnage, 'benediction', 1);
      var benedictionIntense = attributeAsInt(personnage, 'benedictionTempeteDeManaIntense', 0);
      bonusBenediction += benedictionIntense;
      attBonus += bonusBenediction;
      explications.push("Bénédiction => +" + bonusBenediction + " en Attaque");
      if (benedictionIntense)
        removeTokenAttr(personnage, 'benedictionTempeteDeManaIntense', evt);
    }
    if (attributeAsBool(personnage, 'lameDeLigneePerdue')) {
      attBonus -= 1;
      explications.push("Lame de lignée perdue => -1 en Attaque");
    }
    if (attributeAsBool(personnage, 'strangulation')) {
      var malusStrangulation =
        1 + attributeAsInt(personnage, 'dureeStrangulation', 0);
      attBonus -= malusStrangulation;
      explications.push("L'attaquant est étranglé => -" + malusStrangulation + " en Attaque");
    }
    if (getState(personnage, 'renverse')) {
      attBonus -= 5;
      explications.push("Attaquant à terre => -5 en Attaque");
    }
    var attrPosture = tokenAttribute(personnage, 'postureDeCombat');
    if (attrPosture.length > 0) {
      attrPosture = attrPosture[0];
      var posture = attrPosture.get('max');
      var postureVal;
      if (posture.startsWith('ATT')) {
        postureVal = parseInt(attrPosture.get('current'));
        attBonus -= postureVal;
        explications.push("Posture de combat => -" + postureVal + " en Attaque");
      } else if (posture.endsWith('ATT')) {
        postureVal = parseInt(attrPosture.get('current'));
        attBonus += postureVal;
        explications.push("Posture de combat => +" + postureVal + " en Attaque");
      }
    }
    if (attributeAsBool(personnage, 'danseIrresistible')) {
      attBonus -= 4;
      explications.push("En train de danser => -4 en Attaque");
    }
    if (aUnCapitaine(personnage, evt)) {
      attBonus += 2;
      explications.push("Un capitaine donne des ordres => +2 en Attaque");
    }
    if (attributeAsBool(personnage, 'forceDeGeant')) {
      var bonusForceDeGeant = getValeurOfEffet(personnage, 'forceDeGeant', 2);
      attBonus += bonusForceDeGeant;
      explications.push("Force de géant => +" + bonusForceDeGeant + " en Attaque");
    }
    if (attributeAsBool(personnage, 'nueeDInsectes')) {
      var malusNuee = 2 + attributeAsInt(personnage, 'nueeDInsectesTempeteDeManaIntense', 0);
      attBonus -= malusNuee;
      explications.push("Nuée d’insectes => -" + malusNuee + " en Attaque");
      if (malusNuee > 2)
        removeTokenAttr(personnage, 'nueeDInsectesTempeteDeManaIntense', evt);
    }
    if (attributeAsBool(personnage, 'etatExsangue')) {
      attBonus -= 2;
      explications.push("Exsangue => -2 en Attaque");
    }
    if (attributeAsBool(personnage, 'armeBrulante')) {
      attBonus -= 2;
      explications.push("Arme brûlante => -2 en Attaque");
    }
    if (attributeAsBool(personnage, 'marcheSylvestre')) {
      attBonus += 2;
      explications.push("Marche sylvestre : +2 en Attaque");
    }
    if (attributeAsBool(personnage, 'prisonVegetale')) {
      attBonus -= getValeurOfEffet(personnage, 'prisonVegetale', 2);
      explications.push("Prison végétale : -2 en Attaque");
    }
    if (attributeAsBool(personnage, 'masqueDuPredateur')) {
      var bonusMasque = getValeurOfEffet(personnage, 'masqueDuPredateur', modCarac(personnage, 'SAGESSE'));
      var masqueIntense = attributeAsInt(personnage, 'masqueDuPredateurTempeteDeManaIntense', 0);
      bonusMasque += masqueIntense;
      attBonus += bonusMasque;
      explications.push("Masque du prédateur : +" + bonusMasque + " en Attaque et DM");
      if (masqueIntense)
        removeTokenAttr(personnage, 'masqueDuPredateurTempeteDeManaIntense', evt);
    }
    if (attributeAsBool(personnage, 'rageDuBerserk')) {
      attBonus += 2;
      explications.push("Rage du berserk : +2 en Attaque et +1d6 aux DM");
    }
    if (attributeAsBool(personnage, 'armeSecreteBarde')) {
      attBonus -= 10;
      explications.push("Déstabilisé par une action de charme => -10 en Attaque");
    }
    return attBonus;
  }

  function rollNumber(s) {
    return parseInt(s.substring(3, s.indexOf(']')));
  }

  function getWeaponStats(perso, attackLabel) {
    var att = getAttack(attackLabel, perso);
    if (att === undefined) return;
    var attPrefix = att.attackPrefix;
    var weaponStats = {
      name: att.weaponName
    };
    var charId = perso.charId;
    weaponStats.attSkill = getAttrByName(charId, attPrefix + "armeatk");
    weaponStats.attNbDices = getAttrByName(charId, attPrefix + "armedmnbde") || 1;
    weaponStats.attDice = getAttrByName(charId, attPrefix + "armedmde") || 4;
    weaponStats.crit = getAttrByName(charId, attPrefix + "armecrit") || 20;
    weaponStats.divers = getAttrByName(charId, attPrefix + "armespec");
    if (perso.pnj) {
      if (weaponStats.attSkill === undefined) weaponStats.attSkill = 0;
      weaponStats.attDMBonusCommun = getAttrByName(charId, attPrefix + "armedm");
    } else {
      if (!weaponStats.attSkill)
        weaponStats.attSkill = "@{ATKCAC}";
      weaponStats.attSkillDiv = getAttrByName(charId, attPrefix + "armeatkdiv") || 0;
      weaponStats.attCarBonus =
        getAttrByName(charId, attPrefix + "armedmcar") ||
        modCarac(perso, "FORCE");
      weaponStats.attDMBonusCommun = getAttrByName(charId, attPrefix + "armedmdiv");
    }
    weaponStats.portee = getPortee(charId, attPrefix);
    //On cherche si c'est une arme à 2 mains
    var t = weaponStats.name.toLowerCase();
    if (t.includes('2 mains') || t.includes('deux mains')) {
      weaponStats.deuxMains = true;
    } else {
      t = weaponStats.divers;
      if (t) {
        t = t.toLowerCase();
        if (t.includes('2 mains') || t.includes('deux mains')) {
          weaponStats.deuxMains = true;
        }
      }
    }
    //On cherche si c'est un arc
    var p = weaponStats.name.search(/\barc\b/i);
    if (p >= 0) weaponStats.arc = true;
    else if (weaponStats.divers) {
      p = weaponStats.divers.search(/\barc\b/i);
      if (p >= 0) weaponStats.arc = true;
    }
    return weaponStats;
  }

  function surveillance(personnage) {
    var surveillance = findObjs({
      _type: 'attribute',
      _characterid: personnage.charId,
      name: 'surveillance'
    });
    if (surveillance.length > 0) {
      var compagnon = surveillance[0].get('current');
      var compToken = findObjs({
        _type: 'graphic',
        _subtype: 'token',
        _pageid: personnage.token.get('pageid'),
        layer: 'objects',
        name: compagnon
      });
      var compagnonPresent = false;
      compToken.forEach(function(tok) {
        var compCharId = tok.get('represents');
        if (compCharId === '') return;
        if (isActive({
            token: tok,
            charId: compCharId
          })) compagnonPresent = true;
        return;
      });
      return compagnonPresent;
    }
    return false;
  }

  function defenseOfToken(attaquant, target, pageId, evt, options) {
    options = options || {};
    if (options.difficultePVmax) {
      var pvmax = parseInt(target.token.get("bar1_max"));
      if (isNaN(pvmax)) {
        error("Points de vie de " + target.token.get('name') + " mal formés",
          target.token.get("bar1_max"));
        return 0;
      }
      return pvmax;
    }
    var tokenName = target.tokName;
    var explications = target.messages;
    var defense = 10;
    if (target.defautCuirasse === undefined) {
      defense += ficheAttributeAsInt(target, 'DEFARMURE', 0) * ficheAttributeAsInt(target, 'DEFARMUREON', 1);
      defense += ficheAttributeAsInt(target, 'DEFBOUCLIER', 0) * ficheAttributeAsInt(target, 'DEFBOUCLIERON', 1);
      if (attributeAsBool(target, 'armureDuMage')) {
        var bonusArmureDuMage = getValeurOfEffet(target, 'armureDuMage', 4);
        if (defense > 12) defense += bonusArmureDuMage / 2; // On a déjà une armure physique, ça ne se cumule pas.
        else defense += bonusArmureDuMage;
      }
      defense += ficheAttributeAsInt(target, 'DEFDIV', 0);
    } // Dans le cas contraire, on n'utilise pas ces bonus
    defense += modCarac(target, 'DEXTERITE');
    var formeDarbre;
    if (attributeAsBool(target, 'formeDArbre')) {
      formeDarbre = true;
      defense = 13;
    }
    if (attributeAsBool(target, 'statueDeBois')) defense = 10;
    // Malus de défense global pour les longs combats
    if (stateCOF.options.regles.val.usure_DEF.val)
      defense -= (Math.floor((stateCOF.tour - 1) / stateCOF.options.regles.val.usure_DEF.val) * 2);
    // Autres modificateurs de défense
    defense += attributeAsInt(target, 'defenseTotale', 0);
    defense += attributeAsInt(target, 'pacifisme', 0);
    if (attributeAsBool(target, 'aspectDuDemon')) {
        defense += getValeurOfEffet(target, 'aspectDuDemon', 2);
    }
    if (attributeAsBool(target, 'peauDEcorce')) {
      var bonusPeau = getValeurOfEffet(target, 'peauDEcorce', 1, 'voieDesVegetaux');
      var peauIntense = attributeAsInt(target, 'peauDEcorceTempeteDeManaIntense', 0);
      bonusPeau += peauIntense;
      if (stateCOF.options.regles.val.forme_d_arbre_amelioree.val && formeDarbre) {
        bonusPeau = Math.ceil(bonusPeau * 1.5);
      }
      defense += bonusPeau;
      explications.push("Peau d'écorce : +" + bonusPeau + " en DEF");
      if (peauIntense)
        removeTokenAttr(target, 'peauDEcorceTempeteDeManaIntense', evt);
    }
    if (attributeAsBool(target, 'champDeProtection')) {
      var bonusChamp = getValeurOfEffet(target, 'champDeProtection', 2, 'voieDeleTelekinesie');
      var champIntense = attributeAsInt(target, 'champDeProtectionTempeteDeManaIntense', 0);
      bonusChamp += champIntense;
      defense += bonusChamp;
      explications.push("Champ de protection : +" + bonusChamp + " en DEF");
      if (champIntense)
        removeTokenAttr(target, 'champDeProtectionTempeteDeManaIntense', evt);
    }
    if (attributeAsBool(target, 'mutationCuirasse')) {
      var bonusMutation = getValeurOfEffet(target, 'mutationCuirasse', 2, 'voieDesMutations');
      defense += bonusMutation;
      explications.push("Cuirasse : +" + bonusMutation + " en DEF");
    }
    if (getState(target, 'surpris')) defense -= 5;
    if (getState(target, 'renverse')) defense -= 5;
    if (getState(target, 'aveugle') || attributeAsBool(target, 'aveugleManoeuvre')) {
      if (options.distance || !charAttributeAsBool(target, 'radarMental') || estNonVivant(attaquant))
        defense -= 5;
    }
    if (getState(target, 'etourdi') || attributeAsBool(target, 'peurEtourdi'))
      defense -= 5;
    defense += attributeAsInt(target, 'bufDEF', 0);
    defense += attributeAsInt(target, 'actionConcertee', 0);
    if (ficheAttributeAsInt(target, 'DEFARMUREON', 1) === 0) {
      defense += charAttributeAsInt(target, 'vetementsSacres', 0);
      defense += charAttributeAsInt(target, 'armureDeVent', 0);
      if (!options.distance)
        defense += charAttributeAsInt(target, 'dentellesEtRapiere', 0);
    }
    if (charAttributeAsBool(target, 'graceFeline')) {
      defense += modCarac(target, 'CHARISME');
    }
    if (charAttributeAsBool(target, 'defenseIntuitive')) {
      defense += modCarac(target, 'SAGESSE');
    }
    if (attributeAsBool(target, 'armeSecreteBarde')) {
      defense -= 10;
    }
    if (options.metal && attributeAsBool(target, 'magnetisme')) {
      defense += 5;
      explications.push(tokenName + " contrôle le magnétisme (+5 DEF)");
    }
    if (attributeAsBool(target, 'diversionManoeuvre')) {
      var diversion = getValeurOfEffet(target, 'diversionManoeuvre', -5);
      defense += diversion;
      explications.push(tokenName + " est victime d'une diversion => " + diversion + " DEF");
    }
    if (options.attaqueMentale && charAttributeAsBool(target, 'bouclierPsi')) {
      defense += 5;
      explications.push(tokenName + " bénéficie d'un bouclier psi => +5 DEF");
    }
    if (attributeAsBool(target, 'monteSur') && charAttributeAsBool(target, 'montureLoyale')) {
      defense += 1;
      explications.push(tokenName + " est sur une monture => +1 DEF");
    }
    var attrsProtegePar = findObjs({
      _type: 'attribute',
      _characterid: target.charId,
    });
    attrsProtegePar.forEach(function(attr) {
      var attrName = attr.get('name');
      if (attrName.startsWith('protegePar_')) {
        var nameProtecteur = attr.get('max');
        if (attr.get('bar1_link') === '') {
          if (attrName != 'protegePar_' + nameProtecteur + '_' + tokenName) return;
        } else if (attrName != 'protegePar_' + nameProtecteur) return;
        var protecteur = tokenOfId(attr.get('current'), nameProtecteur, pageId);
        if (protecteur === undefined) {
          removeTokenAttr(target, 'protegePar_' + nameProtecteur, evt);
          sendChar(target.charId, "ne peut pas être protégé par " + nameProtecteur + " car aucun token le représentant n'est sur la page");
          return;
        }
        if (!isActive(protecteur)) {
          explications.push(nameProtecteur + " n'est pas en état de protéger " +
            tokenName);
          return;
        }
        var distTargetProtecteur = distanceCombat(target.token, protecteur.token, pageId);
        if (distTargetProtecteur > 0) {
          explications.push(nameProtecteur + " est trop loin de " +
            tokenName + " pour le protéger");
          return;
        }
        if (ficheAttributeAsInt(protecteur, 'DEFBOUCLIERON', 1) === 0) {
          var sujet = onGenre(protecteur.charId, 'il', 'elle');
          explications.push(nameProtecteur +
            " ne porte pas son bouclier, " + sujet + " ne peut pas proteger " +
            tokenName);
          return;
        }
        var defBouclierProtecteur = ficheAttributeAsInt(protecteur, 'DEFBOUCLIER', 0);
        defense += defBouclierProtecteur;
        explications.push(nameProtecteur + " protège " +
          tokenName + " de son bouclier (+" + defBouclierProtecteur + "DEF)");
      }
    });
    var attrPosture = tokenAttribute(target, 'postureDeCombat');
    if (attrPosture.length > 0) {
      attrPosture = attrPosture[0];
      var posture = attrPosture.get('max');
      var postureVal;
      if (posture.startsWith('DEF')) {
        postureVal = parseInt(attrPosture.get('current'));
        defense -= postureVal;
        explications.push("Posture de combat => -" + postureVal + " DEF");
      } else if (posture.endsWith('DEF')) {
        postureVal = parseInt(attrPosture.get('current'));
        defense += postureVal;
        explications.push("Posture de combat => +" + postureVal + " DEF");
      }
    }
    var instinctSurvie = charAttributeAsInt(target, 'instinctDeSurvie', 0);
    if (instinctSurvie > 0 && target.token.get('bar1_value') <= instinctSurvie)
      defense += 5;
    if (attributeAsBool(target, 'danseIrresistible')) {
      defense -= 4;
      explications.push("En train de danser => -4 DEF");
    }
    if (options.sortilege)
      defense += charAttributeAsInt(target, 'DEF_magie', 0);
    if (attributeAsBool(target, 'marcheSylvestre')) {
      defense += 2;
      explications.push("Marche sylvestre => +2 DEF");
    }
    if (attributeAsBool(target, 'prisonVegetale')) {
      defense -= getValeurOfEffet(target, 'prisonVegetale', 2);
      explications.push("Prison végétale => -2 DEF");
    }
    if (attributeAsBool(target, 'protectionContreLeMal') &&
      estMauvais(attaquant)) {
      var bonusProtectionContreLeMal = getValeurOfEffet(target, 'protectionContreLeMal', 2);
      defense += bonusProtectionContreLeMal;
      explications.push("Protection contre le mal => +" + bonusProtectionContreLeMal + " DEF");
    }
    if (attributeAsBool(target, 'rageDuBerserk')) {
      defense -= 4;
      explications.push("Rage du berserk => -4 DEF");
    }
    var combatEnPhalange = charAttributeAsBool(target, 'combatEnPhalange');
    if (combatEnPhalange || attributeAsBool(target, 'esquiveFatale')) {
      var tokensContact = findObjs({
        _type: 'graphic',
        _subtype: "token",
        _pageid: pageId,
        layer: 'objects'
      });
      tokensContact = tokensContact.filter(function(tok) {
        if (tok.id == target.token.id) return false;
        if (distanceCombat(target.token, tok, pageId) === 0) return true;
        return false;
      });
      var tokensAllies = [];
      var tokensEnnemis = [];
      var allies = alliesParPerso[target.charId] || new Set();
      tokensContact.forEach(function(tok) {
        var ci = tok.get('represents');
        if (ci === '') return; //next token au contact
        if (!isActive({
            token: tok,
            charId: ci
          })) return;
        if (allies.has(ci)) tokensAllies.push(tok);
        else tokensEnnemis.push(tok);
      });
      target.ennemisAuContact = tokensEnnemis;
      if (combatEnPhalange) {
        var defensePhalange = 0;
        tokensEnnemis.forEach(function(tokE) {
          var alliesAuContact = tokensAllies.filter(function(tokA) {
            if (distanceCombat(tokE, tokA, pageId) === 0) return true;
            return false;
          });
          if (alliesAuContact.length > defensePhalange)
            defensePhalange = alliesAuContact.length;
        });
        if (defensePhalange > 0) {
          defense += defensePhalange;
          explications.push("Combat en phalange => +" + defensePhalange + " DEF");
        }
      }
    }
    return defense;
  }

  //Bonus en Attaque qui ne dépendent pas du défenseur
  //attaquant doit avoir un champ tokName
  function bonusAttaqueA(attaquant, weaponName, evt, explications, options) {
    var attBonus = 0;
    if (options.bonusAttaque) attBonus += options.bonusAttaque;
    attBonus += bonusDAttaque(attaquant, explications, evt);
    if (options.tirDouble) {
      attBonus += 2;
      if (options.tirDouble.stats && options.tirDouble.stats.name) {
        explications.push(attaquant.tokName + " tire avec " +
          weaponName + " et " + options.tirDouble.stats.name + " à la fois !");
      } else {
        explications.push(attaquant.tokName + " tire avec 2 " +
          weaponName + "s à la fois !");
      }
    }
    if (options.chance) {
      attBonus += options.chance;
      var pc = options.chance / 10;
      explications.push(pc + " point" + ((pc > 1) ? "s" : "") + " de chance dépensé => +" + options.chance + " en Attaque");
    }
    if (options.semonce) {
      attBonus += 5;
    }
    if (attributeAsBool(attaquant, 'baroudHonneurActif')) {
      attBonus += 5;
      explications.push(attaquant.tokName + " porte une dernière attaque et s'effondre");
      mort(attaquant, function(m) {
        explications.push(m);
      }, evt);
      removeTokenAttr(attaquant, 'baroudHonneurActif', evt);
    }
    if (options.sortilege && attributeAsBool(attaquant, 'zoneDeSilence')) {
      attBonus -= 2;
      explications.push("Zone de silence => -2 en Attaque Magique");
    }
    if (attributeAsBool(attaquant, 'monteSur')) {
      if (!options.distance) {
        var cavalierEm = charAttributeAsInt(attaquant, 'cavalierEmerite');
        if (cavalierEm) {
          attBonus += cavalierEm;
          explications.push("Cavalier émérite => +2 en Attaque");
        }
      }
      if (charAttributeAsBool(attaquant, 'montureLoyale')) {
        attBonus += 1;
        explications.push("Monture loyale => +1 en Attaque");
      }
    }
    if (options.frappeDuVide) {
      attBonus += 2;
      explications.push("Frappe du vide => +2 en Attaque et +1d6 DM");
    }
    if (attributeAsBool(attaquant, 'putrefactionOutreTombe')) {
      attBonus -= 2;
      explications.push("Putréfaction => -2 en Attaque");
    }
    if (options.contact) {
      if (attributeAsBool(attaquant, 'rayonAffaiblissant')) {
        options.rayonAffaiblissant = true;
        attBonus -= 2;
        explications.push("Rayon affaiblissant => -2 en Attaque et aux DM");
      }
      if (attributeAsBool(attaquant, 'enragé')) {
        attBonus += 5;
        explications.push("Enragé => +5 en Attaque et +1d6 DM");
      }
    }
    var frenesie = charAttributeAsInt(attaquant, 'frenesie', 0);
    if (frenesie > 0) {
      var pv = parseInt(attaquant.token.get('bar1_value'));
      if (pv <= frenesie) {
        attBonus += 2;
        explications.push("Frénésie => +2 en Attaque");
      }
    }
    if (options.lamesJumelles) {
      var force = modCarac(attaquant, 'FORCE');
      if (force < 2) {
        attBonus += force - 2;
        explications.push("Lames jumelles => " + (force - 2) + " en Attaque");
      }
    }
    return attBonus;
  }

  //Bonus d'attaque qui dépendent de la cible
  // si options.aoe, target doit avoir un champ tokName
  function bonusAttaqueD(attaquant, target, portee, pageId, evt, explications, options) {
    var attackingCharId = attaquant.charId;
    attaquant.tokName = attaquant.tokName || attaquant.token.get('name');
    var attackerTokName = attaquant.tokName;
    var attBonus = 0;
    if (target.bonusAttaque) attBonus += target.bonusAttaque;
    if (getState(attaquant, 'aveugle')) {
      if (options.distance) {
        if (charAttributeAsBool(attaquant, 'tirAveugle')) {
          explications.push("Attaquant aveuglé, mais il sait tirer à l'aveugle");
        } else {
          attBonus -= 10;
          explications.push("Attaquant aveuglé => -10 en Attaque à distance");
        }
      } else {
        if (!charAttributeAsBool(attaquant, 'radarMental') || estNonVivant(target)) {
          attBonus -= 5;
          explications.push("Attaquant aveuglé => -5 en Attaque");
        }
      }
    } else if (attributeAsBool(attaquant, 'aveugleManoeuvre')) {
      if (options.distance || !charAttributeAsBool(attaquant, 'radarMental') || estNonVivant(target)) {
        attBonus -= 5;
        options.aveugleManoeuvre = true;
        explications.push("Attaquant aveuglé => -5 en Attaque et aux DM");
      }
    }
    if (options.mainsDEnergie) {
      if (options.aoe) error("Mains d'énergie n'est pas compatible avec les AOE", options.aoe);
      // Check if target wears armor
      var targetArmorDef = parseInt(getAttrByName(target.charId, "DEFARMURE"));
      if (isNaN(targetArmorDef) || targetArmorDef === 0) {
        attBonus += 2;
        explications.push("Mains d'énergie => +2 en Attaque (cible sans armure)");
      } else {
        var bonusMain = Math.min(5, 2 + targetArmorDef);
        attBonus += bonusMain;
        explications.push("Mains d'énergie => +" + bonusMain + " en Attaque");
      }
    }
    if (options.aoe === undefined && options.auto === undefined && portee > 0) {
      attBonus -=
        malusDistance(attaquant, target.token, target.distance, portee, pageId,
          explications, options.ignoreObstacles);
    }
    var chasseurEmerite =
      charAttributeAsBool(attaquant, 'chasseurEmerite') && estAnimal(target);
    if (chasseurEmerite) {
      attBonus += 2;
      var explChasseurEmerite = "Chasseur émérite => +2 en Attaque et aux DM";
      if (options.aoe) explChasseurEmerite += " contre " + target.tokName;
      explications.push(explChasseurEmerite);
      target.chasseurEmerite = true;
    }
    var ennemiJure = findObjs({
      _type: 'attribute',
      _characterid: attackingCharId,
      name: 'ennemiJure'
    });
    if (ennemiJure.length === 0) ennemiJure = false;
    else ennemiJure = raceIs(target, ennemiJure[0].get('current'));
    if (ennemiJure) {
      var ejSag = modCarac(attaquant, 'SAGESSE');
      attBonus += ejSag;
      var explEnnemiJure = "Attaque sur ennemi juré => +" + ejSag + " en attaque et +1d6 aux DM";
      if (options.aoe) explEnnemiJure += " contre " + target.tokName;
      explications.push(explEnnemiJure);
      target.ennemiJure = true;
    }
    if (options.argent) {
      if (estMortVivant(target) || raceIs(target, 'demon') || raceIs(target, 'démon')) {
        attBonus += 2;
        explications.push("Arme en argent => +2 en attaque et +1d6 aux DM");
        target.argent = true;
      }
    }
    var bonusContreBouclier = options.bonusContreBouclier || 0;
    if (target.bonusContreBouclier) bonusContreBouclier += target.bonusContreBouclier;
    if (bonusContreBouclier) {
      if (ficheAttributeAsInt(target, 'DEFBOUCLIERON', 1) &&
        ficheAttributeAsInt(target, 'DEFBOUCLIER', 0) > 0) {
        attBonus += bonusContreBouclier;
        explications.push("L'adversaire porte un bouclier => " + ((bonusContreBouclier > 0) ? '+' : '') + bonusContreBouclier + " en attaque");
      }
    }
    if (options.tueurDeGeants && estUnGeant(target)) {
      attBonus += 2;
      explications.push("Tueur de géant => +2 att. et 2d6 DM");
      target.tueurDeGeants = true;
    }
    if (attributeAsBool(target, 'feinte_' + attaquant.tokName)) {
      attBonus += 5;
      explications.push("Feinte => +5 en attaque");
    }
    if (options.contact) {
      if (attributeAsBool(target, 'criDeGuerre') &&
        ficheAttributeAsInt(attaquant, 'FORCE', 10) <= ficheAttributeAsInt(target, 'FORCE', 10) &&
        parseInt(attaquant.token.get("bar1_max")) <= parseInt(target.token.get("bar1_max"))) {
        attBonus -= 2;
        explications.push("Effrayé => -2 en Attaque");
      }
    }
    if (charAttributeAsBool(attaquant, 'combatEnPhalange')) {
      var tokensContact = findObjs({
        _type: 'graphic',
        _subtype: "token",
        _pageid: pageId,
        layer: 'objects'
      });
      //On compte tokens au contact de l'attaquant et du défenseur et alliés de l'attaquant
      var allies = alliesParPerso[attaquant.charId];
      if (allies) {
        var alliesAuContact = 0;
        tokensContact.forEach(function(tok) {
          if (tok.id == attaquant.token.id) return;
          if (distanceCombat(target.token, tok, pageId) > 0) return;
          if (distanceCombat(attaquant.token, tok, pageId) > 0) return;
          var ci = tok.get('represents');
          if (ci === '') return;
          if (!isActive({
              token: tok,
              charId: ci
            })) return;
          if (allies.has(ci)) alliesAuContact++;
        });
        if (alliesAuContact > 0) {
          attBonus += alliesAuContact;
          explications.push("Combat en phalange => +" + alliesAuContact + " en Attaque");
        }
      }
    }
    return attBonus;
  }

  function computeDice(lanceur, options) {
    options = options || {};
    var nbDe = options.nbDe;
    if (nbDe === undefined) nbDe = 1;
    var plusFort = options.plusFort;
    if (plusFort === undefined) plusFort = true;
    var dice = options.dice;
    if (dice === undefined) dice = deTest(lanceur, options.carac);
    if (attributeAsBool(lanceur, 'malediction')) {
      if (plusFort) {
        if (nbDe > 1) nbDe--;
        else {
          nbDe = 2;
          plusFort = false;
        }
      } else nbDe++;
    }
    var de = nbDe + "d" + dice;
    if (nbDe > 1) {
      if (plusFort) de += "kh1";
      else de += "kl1";
    }
    return de;
  }

  function diminueMalediction(lanceur, evt, attr) {
    var attrMalediction = attr || tokenAttribute(lanceur, 'malediction');
    if (attrMalediction.length > 0) {
      attrMalediction = attrMalediction[0];
      var nbMaudit = parseInt(attrMalediction.get('current'));
      if (isNaN(nbMaudit) || nbMaudit < 2) {
        evt.deletedAttributes = evt.deletedAttributes || [];
        evt.deletedAttributes.push(attrMalediction);
        attrMalediction.remove();
      } else {
        evt.attributes = evt.attributes || [];
        evt.attributes.push({
          attribute: attrMalediction,
          current: nbMaudit
        });
        attrMalediction.set('current', nbMaudit - 1);
      }
    }
  }

  function attributesOfClass(perso, classeEffet) {
    var attrs = findObjs({
      _type: 'attribute',
      _characterid: perso.charId
    });
    var res = [];
    attrs.forEach(function(attr) {
      var attrName = attr.get('name');
      var ice = attrName.indexOf('ClasseEffet');
      if (ice < 1) return;
      if (attr.get('current') == classeEffet) {
        var baseAttrName = attrName.replace(/ClasseEffet/, '');
        var baseAttr = attrs.find(function(a) {
          return (a.get('name') == baseAttrName);
        });
        if (baseAttr === undefined) {
          error("On a un attribut " + attrName + ", mais pas d'attribut " + baseAttrName + " pour " + perso.token.get('name'), classeEffet);
          attr.remove();
          return;
        }
        res.push({
          baseAttribute: baseAttr,
          classAttribute: attr
        });
      }
    });
    if (res.length === 0) {
      var ace = tokenAttribute(perso, classeEffet);
      if (ace.length > 0) {
        error(perso.token.get('name') + " a une classe d'effets " + classeEffet + " mais pas d'effet associé", ace);
        ace[0].remove();
      }
    }
    return res;
  }

  //Retourne true si il existe une limite qui empêche de lancer le sort
  function limiteRessources(personnage, options, defResource, msg, evt) {
    if (options.mana) {
      if (personnage) {
        if (!depenseMana(personnage, options.mana, msg, evt)) {
          addEvent(evt);
          return true;
        }
      } else {
        error("Impossible de savoir qui doit dépenser de la mana", options);
        return true;
      }
    }
    var ressource = defResource;
    var utilisations;
    if (options.limiteParJour) {
      if (personnage) {
        if (options.limiteParJourRessource)
          ressource = options.limiteParJourRessource;
        ressource = "limiteParJour_" + ressource;
        utilisations =
          attributeAsInt(personnage, ressource, options.limiteParJour);
        if (utilisations === 0) {
          sendChar(personnage.charId, "ne peut plus faire cette action aujourd'hui");
          addEvent(evt);
          return true;
        }
        setTokenAttr(personnage, ressource, utilisations - 1, evt);
      } else {
        error("Impossible de à qui appliquer la limite journalière", options);
        return true;
      }
    }
    if (options.limiteParCombat) {
      if (personnage) {
        if (!stateCOF.combat) {
          sendChar(personnage.charId, "ne peut pas faire cette action en dehors des combats");
          addEvent(evt);
          return true;
        }
        if (options.limiteParCombatRessource)
          ressource = options.limiteParCombatRessource;
        ressource = "limiteParCombat_" + ressource;
        utilisations =
          attributeAsInt(personnage, ressource, options.limiteParCombat);
        if (utilisations === 0) {
          sendChar(personnage.charId, "ne peut plus faire cette action pour ce combat");
          addEvent(evt);
          return true;
        }
        setTokenAttr(personnage, ressource, utilisations - 1, evt);
      } else {
        error("Impossible de savoir à qui appliquer la limite par combat", options);
        return true;
      }
    }
    if (options.dose) {
      if (personnage) {
        var nomDose = options.dose.replace(/_/g, ' ');
        var doses = attributeAsInt(personnage, 'dose_' + options.dose, 0);
        if (doses === 0) {
          sendChar(personnage.charId, "n'a plus de " + nomDose);
          addEvent(evt);
          return true;
        }
        setTokenAttr(personnage, 'dose_' + options.dose, doses - 1, evt);
      } else {
        error("Impossible de savoir qui doit dépenser la dose", options);
        return true;
      }
    }
    if (options.limiteAttribut) {
      if (personnage) {
        var nomAttr = options.limiteAttribut.nom;
        var currentAttr = attributeAsInt(personnage, nomAttr, 0);
        if (currentAttr >= options.limiteAttribut.limite) {
          sendChar(personnage.charId, options.limiteAttribut.message);
          addEvent(evt);
          return true;
        }
        setTokenAttr(personnage, nomAttr, currentAttr + 1, evt);
      } else {
        error("Impossible de savoir à qui appliquer la limitation", options);
        return true;
      }
    }
    if (options.decrAttribute) {
      var attr = options.decrAttribute;
      var oldval = parseInt(attr.get('current'));
      if (isNaN(oldval) || oldval < 1) {
        sendChar(attr.get('characterid'), "ne peut plus faire cela");
        return true;
      }
      evt.attributes = evt.attributes || [];
      evt.attributes.push({
        attribute: attr,
        current: oldval,
        max: attr.get('max')
      });
      attr.set('current', oldval - 1);
    }
    return false;
  }

  //targetToken est soit un token, soit une structure avec un champs cibles qui contient toutes les cibles
  function attack(playerId, attaquant, targetToken, attackLabel, options) {
    // Attacker and target infos
    var attackingToken = attaquant.token;
    var attackingCharId = attaquant.charId;
    attaquant.tokName = attaquant.tokName || attaquant.token.get("name");
    var attacker = getObj("character", attackingCharId);
    if (attacker === undefined) {
      error("Unexpected undefined 1", attacker);
      return;
    }
    attaquant.name = attaquant.name || attacker.get("name");
    var pageId = attaquant.token.get('pageid');
    //Options automatically set by some attributes
    if (attributeAsBool(attaquant, 'paralysieRoublard')) {
      if (attributeAsBool(attaquant, 'enragé')) {
        sendChar(attackingCharId, "est trop enragé pour sentir la douleur");
      } else if (charAttributeAsBool(attaquant, 'proprioception')) {
        sendChar(attackingCharId, "est immunisé à la douleur");
      } else {
        sendChar(attackingCharId, "ne peut pas attaquer car il est paralysé de douleur");
        return;
      }
    }
    if (charAttributeAsBool(attaquant, 'fauchage')) {
      var seuilFauchage = 10 + modCarac(attaquant, 'FORCE');
      options.etats = options.etats || [];
      options.etats.push({
        etat: 'renverse',
        condition: {
          type: 'deAttaque',
          seuil: 15
        },
        save: {
          carac: 'FOR',
          carac2: 'DEX',
          seuil: seuilFauchage
        }
      });
    }

    var weaponName;
    var weaponStats = {};
    var attaqueArray;
    try {
      attaqueArray = JSON.parse(attackLabel);
    } catch (e) {}
    if (Array.isArray(attaqueArray) && attaqueArray.length > 4 &&
      attaqueArray[1].length > 1 && attaqueArray[3].length > 3) {
      weaponName = attaqueArray[0].replace(/_/g, ' ');
      weaponStats.attSkill = attaqueArray[1][0];
      weaponStats.attSkillDiv = attaqueArray[1][1];
      weaponStats.crit = attaqueArray[2];
      var weaponDmg = attaqueArray[3];
      weaponStats.attNbDices = weaponDmg[0];
      weaponStats.attDice = weaponDmg[1];
      weaponStats.attCarBonus = weaponDmg[2];
      weaponStats.attDMBonusCommun = weaponDmg[3];
      weaponStats.portee = attaqueArray[4];
    } else {
      //On trouve l'attaque correspondant au label
      weaponStats = getWeaponStats(attaquant, attackLabel);
      if (weaponStats === undefined) {
        error("Pas d'arme de label " + attackLabel, attaquant);
        return;
      }
      weaponName = weaponStats.name;
    }
    weaponStats.attSkillDiv = parseInt(weaponStats.attSkillDiv);
    weaponStats.attNbDices = parseInt(weaponStats.attNbDices);
    weaponStats.attDice = parseInt(weaponStats.attDice);
    options.d6 = 'd6';
    if (charAttributeAsBool(attaquant, 'tropPetit')) {
      options.d6 = 'd4';
      if (weaponStats.divers && weaponStats.divers.includes('d3')) {
        weaponStats.attDice = 3;
      }
    }
    weaponStats.attDMBonusCommun = parseInt(weaponStats.attDMBonusCommun);
    weaponStats.crit = parseInt(weaponStats.crit);
    var portee = weaponStats.portee;
    if (options.tirDouble && options.tirDouble.label) {
      var stats2 = getWeaponStats(attaquant, options.tirDouble.label);
      if (stats2 === undefined) {
        error("Pas d'arme de label " + options.tirDouble.label + " pour le tir double", attaquant);
        return;
      }
      var tdSkillDiv = parseInt(stats2.attSkillDiv);
      if (!isNaN(tdSkillDiv) && tdSkillDiv < weaponStats.attSkillDiv)
        weaponStats.attSkillDiv = tdSkillDiv;
      stats2.attDMBonusCommun = parseInt(stats2.attDMBonusCommun);
      stats2.attNbDices = parseInt(stats2.attNbDices);
      stats2.attDice = parseInt(stats2.attDice);
      if (stats2.divers && stats2.divers.includes('d3')) stats2.attDice = 3;
      options.tirDouble.stats = stats2;
    }
    if (portee > 0) {
      options.distance = true;
      if (attributeAsBool(attaquant, 'rageDuBerserk')) {
        sendChar(attaquant.charId, "est en rage du berserk, il ne veut attaquer qu'au contact");
        return;
      }
      if (options.tempeteDeManaPortee) {
        portee = portee * 2;
        weaponStats.portee = portee;
      }
    } else options.contact = true;
    //Pour l'option grenaille implicite, il faut vérifier que toutes les charge de l'arme sont des charges de grenaille
    var chargesArme = findObjs({
      _type: 'attribute',
      _characterid: attackingCharId,
      name: "charge_" + attackLabel
    });
    if (!options.grenaille && chargesArme.length > 0) {
      var chargesGrenaille = findObjs({
        _type: 'attribute',
        _characterid: attackingCharId,
        name: "chargeGrenaille_" + attackLabel
      });
      if (chargesGrenaille.length > 0) {
        var chargesTotales = parseInt(chargesArme[0].get('current'));
        if (!isNaN(chargesTotales)) {
          var grenailles = parseInt(chargesGrenaille[0].get('current'));
          if (!isNaN(grenailles) && grenailles >= chargesTotales)
            options.grenaille = true;
        }
      }
    }
    if (options.grenaille) {
      portee = portee / 10;
      options.aoe = options.aoe || {
        type: 'cone',
        angle: 90
      };
      weaponStats.attDice -= 2;
      if (weaponStats.attDice < 0) weaponStats.attDice = 0;
      if (options.tirDouble && options.tirDouble.stats) {
        options.tirDouble.stats.attDice -= 2;
        if (options.tirDouble.stats.attDice < 0) options.tirDouble.stats.attDice = 0;
      }
      options.auto = true;
      var effet = findObjs({
        _type: 'custfx',
        name: 'grenaille ' + portee
      });
      if (effet.length === 0) {
        effet = createObj('custfx', {
          name: 'grenaille ' + portee,
          definition: {
            "angle": -1,
            "angleRandom": 45,
            "duration": 8,
            "emissionRate": 40,
            "endColour": [130, 130, 130, 0],
            "endColourRandom": [10, 10, 10, 0],
            "lifeSpan": portee * 5,
            "lifeSpanRandom": portee / 2,
            "maxParticles": 200,
            "size": 10,
            "sizeRandom": 3,
            "speed": 12,
            "speedRandom": 3,
            "startColour": [25, 25, 25, 1],
            "startColourRandom": [7, 7, 7, 0.5]
          }
        });
      } else effet = effet[0];
      options.fx = options.fx || effet.id;
    }
    //Détermination de la (ou des) cible(s)
    var nomCiblePrincipale; //Utilise pour le cas mono-cible
    var cibles = [];
    if (options.redo) { //Dans ce cas les cibles sont précisées dans targetToken
      cibles = targetToken;
      if (cibles.length === 0) {
        error("Attaque sans cible", targetToken);
        return;
      } else if (cibles.length == 1) targetToken = cibles[0].token;
      nomCiblePrincipale = cibles[0].tokName;
    } else {
      nomCiblePrincipale = targetToken.get('name');
      if (options.aoe) {
        if (options.targetFx) {
          spawnFx(targetToken.get('left'), targetToken.get('top'), options.targetFx, pageId);
        }
        var distanceTarget = distanceCombat(targetToken, attackingToken, pageId, {
          strict1: true,
          strict2: true
        });
        var pta = tokenCenter(attackingToken);
        var ptt = tokenCenter(targetToken);
        switch (options.aoe.type) {
          case 'ligne':
            if (distanceTarget < portee) { //la ligne va plus loin que la cible
              var scale = portee * 1.0 / distanceTarget;
              ptt = [
                Math.round((ptt[0] - pta[0]) * scale) + pta[0],
                Math.round((ptt[1] - pta[1]) * scale) + pta[1]
              ];
            }
            if (targetToken.get('bar1_max') == 0) { // jshint ignore:line
              //C'est juste un token utilisé pour définir la ligne
              if (options.fx) {
                var p1e = {
                  x: attackingToken.get('left'),
                  y: attackingToken.get('top'),
                };
                var p2e = {
                  x: targetToken.get('left'),
                  y: targetToken.get('top'),
                };
                spawnFxBetweenPoints(p1e, p2e, options.fx, pageId);
              }
              cibles = [];
              targetToken.remove(); //On l'enlève, normalement plus besoin
            }
            var allToks =
              findObjs({
                _type: "graphic",
                _pageid: pageId,
                _subtype: "token",
                layer: "objects"
              });
            allToks.forEach(function(obj) {
              if (obj.id == attackingToken.id) return; //on ne se cible pas
              var objCharId = obj.get('represents');
              if (objCharId === '') return;
              var cible = {
                token: obj,
                charId: objCharId
              };
              if (getState(cible, 'mort')) return; //pas de dégâts aux morts
              var pt = tokenCenter(obj);
              var distToTrajectory = VecMath.ptSegDist(pt, pta, ptt);
              if (distToTrajectory > (obj.get('width') + obj.get('height')) / 4)
                return;
              cible.tokName = obj.get('name');
              var objChar = getObj('character', objCharId);
              if (objChar === undefined) return;
              cible.name = objChar.get('name');
              cibles.push(cible);
            });
            break;
          case 'disque':
            if (distanceTarget > portee) {
              sendChar(attackingCharId,
                "Le centre du disque visé est trop loin pour " + weaponName +
                " (distance " + distanceTarget + ", portée " + portee + ")");
              return;
            }
            var allToksDisque =
              findObjs({
                _type: "graphic",
                _pageid: pageId,
                _subtype: "token",
                layer: "objects"
              });
            allToksDisque.forEach(function(obj) {
              if (portee === 0 && obj.id == attackingToken.id) return; //on ne se cible pas si le centre de l'aoe est soi-même
              if (obj.get('bar1_max') == 0) return; // jshint ignore:line
              var objCharId = obj.get('represents');
              if (objCharId === '') return;
              var cible = {
                token: obj,
                charId: objCharId
              };
              if (getState(cible, 'mort')) return; //pas de dégâts aux morts
              var distanceCentre =
                distanceCombat(targetToken, obj, pageId, {
                  strict1: true
                });
              if (distanceCentre > options.aoe.rayon) return;
              var objChar = getObj('character', objCharId);
              if (objChar === undefined) return;
              cible.name = objChar.get('name');
              cible.tokName = obj.get('name');
              cibles.push(cible);
            });
            if (targetToken.get('bar1_max') == 0) { // jshint ignore:line
              //C'est juste un token utilisé pour définir le disque
              targetToken.remove(); //On l'enlève, normalement plus besoin
            }
            // La nouvelle portée (pour ne rien éliminer à l'étape suivante
            portee += options.aoe.rayon;
            break;
          case 'cone':
            if (options.fx) {
              var p1eC = {
                x: attackingToken.get('left'),
                y: attackingToken.get('top'),
              };
              var p2eC = {
                x: targetToken.get('left'),
                y: targetToken.get('top'),
              };
              spawnFxBetweenPoints(p1eC, p2eC, options.fx, pageId);
            }
            var vecCentre = VecMath.normalize(VecMath.vec(pta, ptt));
            var cosAngle = Math.cos(options.aoe.angle * Math.PI / 360.0);
            if (targetToken.get('bar1_max') == 0) { // jshint ignore:line
              //C'est juste un token utilisé pour définir le cone
              cibles = [];
              targetToken.remove(); //On l'enlève, normalement plus besoin
            }
            var allToksCone =
              findObjs({
                _type: "graphic",
                _pageid: pageId,
                _subtype: "token",
                layer: "objects"
              });
            allToksCone.forEach(function(obj) {
              if (obj.id == attackingToken.id) return; //on ne se cible pas
              var objCharId = obj.get('represents');
              if (objCharId === '') return;
              var cible = {
                token: obj,
                charId: objCharId
              };
              if (getState(cible, 'mort')) return; //pas de dégâts aux morts
              var pt = tokenCenter(obj);
              var vecObj = VecMath.normalize(VecMath.vec(pta, pt));
              if (VecMath.dot(vecCentre, vecObj) < cosAngle) return;
              // La distance sera comparée à la portée plus loin
              var objChar = getObj('character', objCharId);
              if (objChar === undefined) return;
              cible.name = objChar.get('name');
              cible.tokName = obj.get('name');
              cibles.push(cible);
            });
            break;
          default:
            error("aoe inconnue", options.aoe);
            return;
        }
      } else {
        if (attackingToken.id == targetToken.id) { //même token pour attaquant et cible
          sendChar(attackingCharId,
            "s'attaque " + onGenre(attackingCharId, "lui", "elle") +
            "-même ? Probablement une erreur à la sélection de la cible. On annule");
          return;
        }
        var targetCharId = targetToken.get("represents");
        if (targetCharId === "") {
          error("Le token ciblé (" + nomCiblePrincipale + ") doit représenter un personnage ", targetToken);
          return;
        }
        var targetChar = getObj("character", targetCharId);
        if (targetChar === undefined) {
          error("Unexpected undefined 2", targetChar);
          return;
        }
        cibles = [{
          token: targetToken,
          charId: targetCharId,
          name: targetChar.get('name'),
          tokName: nomCiblePrincipale
        }];
      }
      if (options.ciblesSupplementaires) {
        options.ciblesSupplementaires.forEach(function(c) {
          var i = cibles.indexOf(function(t) {
            return (t.token.id == c.token.id);
          });
          if (i < 0) cibles.push(c);
        });
      }
    }

    //Les conditions qui peuvent empêcher l'attaque
    if (options.conditionAttaquant !== undefined) {
      if (!testCondition(options.conditionAttaquant, attaquant, cibles)) {
        sendChar(attackingCharId, "ne peut pas utiliser " + weaponName);
        return;
      }
    }
    if (options.avecd12 && (estAffaibli(attaquant) || getState(attaquant, 'immobilise'))) {
      sendChar(attackingCharId, "ne peut pas utiliser cette capacité quand il est affaibli.");
      return;
    }
    var attrRipostesDuTour = tokenAttribute(attaquant, 'ripostesDuTour');
    var ripostesDuTour = new Set();
    if (attrRipostesDuTour.length > 0) {
      ripostesDuTour = new Set(attrRipostesDuTour[0].get('current').split(' '));
    }
    cibles = cibles.filter(function(target) {
      if (attributeAsBool(target, 'ombreMortelle')) {
        sendChar(attackingCharId, "impossible d'attaquer une ombre");
        return false;
      }
      if (options.seulementVivant && estNonVivant(target)) {
        sendChar(attackingCharId, "cette attaque n'affecte que les créatures vivantes");
        return false;
      }
      if (options.pointsVitaux && estNonVivant(target)) {
        sendChar(attackingCharId, "La cible n'est pas vraiment vivante : " + attaquant.name + " ne trouve pas de points vitaux");
        return false;
      }
      if (attributeAsBool(attaquant, 'tenuADistanceManoeuvre(' + target.token.id + ')')) {
        sendChar(attackingCharId, "est tenu à distance de " + target.tokName + ", " + onGenre(attackingCharId, "il", "elle") + " ne peut pas l'attaquer ce tour.");
        return false;
      }
      if (charAttributeAsBool(target, 'armeeConjuree')) {
        return options.attaqueArmeeConjuree;
      }
      if (ripostesDuTour.has(target.token.id)) {
        sendChar(attackingCharId, "a déjà fait une riposte contre " + target.tokName);
        return false;
      }
      return true;
    });
    if (cibles.length === 0) return;
    //Prise en compte de la distance
    var optDistance = {};
    if (options.contact) optDistance.allonge = options.allonge;
    cibles = cibles.filter(function(target) {
      target.distance =
        distanceCombat(attackingToken, target.token, pageId, optDistance);
      if (options.intercepter || options.interposer) return true;
      if (target.distance > portee && target.esquiveFatale === undefined) {
        if (options.aoe || options.auto) return false; //distance stricte
        if (target.distance > 2 * portee) return false;
        // On peut aller jusqu'à 2x portee si unique cible et jet d'attaque
        return true;
      }
      return true;
    });
    if (cibles.length === 0) {
      if (options.aoe) {
        sendChar(attackingCharId, "aucune cible dans l'aire d'effet de " + weaponName + ", action annulée");
        return;
      }
      sendChar(attackingCharId, "est hors de portée de " + nomCiblePrincipale + " pour une attaque utilisant " + weaponName + ", action annulée");
      return;
    }
    var evt = options.evt || {
      type: "Tentative d'attaque"
    };
    if (options.attaqueArmeeConjuree) {
      setTokenAttr(attaquant, 'attaqueArmeeConjuree', 1, evt, undefined, getInit());
    }
    evt.action = evt.action || {
      options: JSON.parse(JSON.stringify(options)) //pour la chance etc.
    };
    if (options.tempsRecharge) {
      if (attributeAsBool(attaquant, options.tempsRecharge.effet)) {
        sendChar(attackingCharId, "ne peut pas encore utiliser cette attaque");
        return;
      }
      if (options.tempsRecharge.duree > 0)
        setTokenAttr(attaquant, options.tempsRecharge.effet, options.tempsRecharge.duree, evt, undefined, getInit());
    }
    //On met à jour l'arme en main, si nécessaire
    if (weaponStats.divers && weaponStats.divers.toLowerCase().includes('arme')) {
      options.weaponStats = weaponStats;
      options.messages = options.messages || [];
      degainerArme(attaquant, attackLabel, evt, options);
    }
    if (charAttributeAsBool(attaquant, 'riposte')) {
      //On stoque les cibles attaquées, pour ne pas les re-proposer en riposte
      var listeCibles =
        cibles.map(function(target) {
          return target.token.id;
        }).join(' ');
      if (attrRipostesDuTour.length === 0) {
        if (options.riposte) {
          setTokenAttr(attaquant, 'ripostesDuTour', listeCibles, evt);
        } else {
          setTokenAttr(attaquant, 'ripostesDuTour', '', evt, undefined, listeCibles);
        }
      } else { //L'attribut existe déjà
        attrRipostesDuTour = attrRipostesDuTour[0];
        evt.attributes = evt.attributes || [];
        ripostesDuTour = attrRipostesDuTour.get('current');
        var attaquesDuTour = attrRipostesDuTour.get('max');
        evt.attributes.push({
          attribute: attrRipostesDuTour,
          current: ripostesDuTour,
          max: attaquesDuTour
        });
        if (options.riposte) {
          if (ripostesDuTour === '') ripostesDuTour = listeCibles;
          else ripostesDuTour += ' ' + listeCibles;
          attrRipostesDuTour.set('current', ripostesDuTour);
        } else {
          if (attaquesDuTour === '') attaquesDuTour = listeCibles;
          else attaquesDuTour += ' ' + listeCibles;
          attrRipostesDuTour.set('max', attaquesDuTour);
        }
      }
    }
    //On fait les tests pour les cibles qui bénéficieraient d'un sanctuaire
    var ciblesATraiter = cibles.length;
    var attaqueImpossible = false;
    cibles.forEach(function(cible) {
      if (attaqueImpossible) return;
      if (attributeAsBool(cible, 'sanctuaire')) {
        testCaracteristique(attaquant, 'SAG', 15, {}, evt, function(tr) {
          if (tr.reussite) {
            sendChar(attaquant.charId, "réussi à passer outre le sanctuaire de " + cible.tokName + " (jet de SAG " + tr.texte + "&ge;15)");
            ciblesATraiter--;
            if (ciblesATraiter === 0)
              resoudreAttaque(attaquant, cibles, attackLabel, weaponName, weaponStats, playerId, pageId, evt, options, chargesArme);
          } else {
            sendChar(attaquant.charId, "ne peut se résoudre à attaquer " + cible.tokName + " (sanctuaire, jet de SAG " + tr.texte + "< 15)");
            attaqueImpossible = true;
            return;
          }
        });
      } else {
        ciblesATraiter--;
        if (ciblesATraiter === 0)
          resoudreAttaque(attaquant, cibles, attackLabel, weaponName, weaponStats, playerId, pageId, evt, options, chargesArme);
      }
    });
  }

  function displayAttaqueOpportunite(vid, cibles, type, action, option) {
    var attaquant = tokenOfId(vid);
    if (attaquant === undefined) {
      error("Impossible de retrouver le personnage qui pouvait faire une attaque " + type, vid);
      return;
    }
    var abilities = findObjs({
      _type: 'ability',
      _characterid: attaquant.charId,
    });
    var actions;
    var actionTrouvee;
    abilities.forEach(function(a) {
      if (actionTrouvee) return;
      var an = a.get('name');
      if (an == action) {
        actions = a;
        actionTrouvee = true;
        return;
      }
      if (an == '#Actions#' || an == '#TurnAction#') actions = a;
    });
    var actionsOpportunite = [];
    if (actions) {
      actions = actions.get('action').replace(/\n/gm, '').replace(/\r/gm, '').replace(/%/g, '\n%').replace(/#/g, '\n#').split("\n");
      if (actions.length > 0) {
        var macros = findObjs({
          _type: 'macro'
        });
        var command = '';
        actions.forEach(function(action, i) {
          action = action.trim();
          if (action.length > 0) {
            var actionCmd = action.split(' ')[0];
            var actionText = action.replace(/-/g, ' ').replace(/_/g, ' ');
            if (actionCmd.startsWith('%')) {
              actionCmd = actionCmd.substr(1);
              actionText = actionText.substr(1);
              abilities.forEach(function(abilitie, index) {
                if (abilitie.get('name') === actionCmd) {
                  command = abilitie.get('action').trim();
                  command = replaceAction(command, attaquant, macros, abilities);
                  if (command.startsWith('!cof-attack')) {
                    actionsOpportunite.push({
                      command: command,
                      text: actionText
                    });
                  }
                }
              });
            } else if (actionCmd.startsWith('#')) {
              actionCmd = actionCmd.substr(1);
              actionText = actionText.substr(1);
              macros.forEach(function(macro, index) {
                if (macro.get('name') === actionCmd) {
                  command = macro.get('action').trim();
                  command = replaceAction(command, attaquant, macros, abilities);
                  if (command.startsWith('!cof-attack')) {
                    actionsOpportunite.push({
                      command: command,
                      text: actionText
                    });
                  }
                }
              });
            } else if (actionCmd.startsWith('!cof-attack')) {
              actionsOpportunite.push({
                command: actionCmd,
                text: actionText
              });
            }
          }
        });
      }
    }
    if (actionsOpportunite.length === 0) {
      //Pas besoin de faire un frame, on n'a pas d'action
      var ligne = "peut faire une attaque " + type + " contre";
      cibles.forEach(function(target) {
        ligne += ' ' + target.token.get('name');
      });
      sendChar(attaquant.charId, ligne);
      return;
    }
    //On crée un display sans le header
    var display = startFramedDisplay(undefined, "Attaque " + type + " possible", attaquant, {
      retarde: true
    });
    cibles.forEach(function(target) {
      target.tokName = target.tokName || target.token.get('name');
      if (target.name === undefined) {
        var targetChar = getObj('character', target.charId);
        if (targetChar === undefined) {
          error('Impossible de trouver le personnage représentant ' + target.tokName, target);
          return;
        }
        target.name = targetChar.get('name');
      }
      addLineToFramedDisplay(display, "contre " + target.tokName, 100, true);
      actionsOpportunite.forEach(function(action) {
        var cmd = action.command.replace(/@\{target\|token_id\}/g, target.token.id);
        cmd = cmd.replace(/@\{target\|token_name\}/g, target.tokName);
        cmd = cmd.replace(/@\{target\|/g, '@{' + target.name + '|');
        if (option) cmd += ' ' + option;
        addLineToFramedDisplay(display, bouton(cmd, action.text, attaquant));
      });
    });
    // on envoie la liste aux joueurs qui gèrent l'attaquant
    var playerIds = getPlayerIds(attaquant);
    playerIds.forEach(function(playerid) {
      addFramedHeader(display, playerid, true);
      sendChat('', endFramedDisplay(display));
    });
    if (playerIds.length === 0) {
      addFramedHeader(display, undefined, 'gm');
      sendChat('', endFramedDisplay(display));
    }
  }

  function ajouteDe6Crit(x, first) {
    var bonusCrit = rollDePlus(6);
    if (first) x.dmgDisplay = "(" + x.dmgDisplay + ")+";
    x.dmgDisplay += bonusCrit.roll;
    x.dmgTotal += bonusCrit.val;
  }

  // Fonction asynchrone
  // displayRes est optionnel, et peut avoir 2 arguments
  // - un texte affichant le jet de dégâts
  // - la valeur finale des dégâts infligés
  // crit est un booléen, il augmente de 1 (ou options.critCoef) le coefficient (option.dmgCoef) et active certains effets
  function dealDamage(target, dmg, otherDmg, evt, crit, options, explications, displayRes) {
    if (target.tokName === undefined) target.tokName = target.token.get('name');
    if (options === undefined) options = {};
    var expliquer = function(msg) {
      if (explications) explications.push(msg);
      else sendChar(target.charId, msg);
    };
    if (options.interposer) {
      return dealDamageAfterOthers(target, crit, {}, evt, expliquer, displayRes, options.interposer, dmg.display, false);
    }
    if (attributeAsBool(target, 'intangible') ||
      attributeAsBool(target, 'ombreMortelle') ||
      (options.aoe === undefined &&
        attributeAsBool(target, 'formeGazeuse'))) {
      expliquer("L'attaque passe à travers de " + target.token.get('name'));
      if (displayRes) displayRes('0', 0);
      return 0;
    }
    if (options.asphyxie &&
      (charAttributeAsBool(target, 'creatureArtificielle') ||
        estNonVivant(target))) {
      expliquer("L'asphyxie est sans effet sur une créature non-vivante");
      if (displayRes) displayRes('0', 0);
      return 0;
    }
    var dmgCoef = options.dmgCoef || 1;
    if (target.dmgCoef) dmgCoef += target.dmgCoef;
    if (crit) {
      var critCoef = 1;
      if (options.critCoef) critCoef = options.critCoef;
      if (target.critCoef) critCoef += target.critCoef;
      dmgCoef += critCoef;
    }
    otherDmg = otherDmg || [];
    var dmgDisplay = dmg.display;
    var dmgTotal = dmg.total;
    var showTotal = false;
    if (dmgCoef > 1) {
      dmgDisplay += " X " + dmgCoef;
      dmgTotal = dmgTotal * dmgCoef;
      showTotal = true;
    }
    if (crit) {
      var firstBonusCritique = true;
      var x = {
        dmgDisplay: dmgDisplay,
        dmgTotal: dmgTotal
      };
      if (options.affute) {
        ajouteDe6Crit(x, firstBonusCritique);
        firstBonusCritique = false;
      }
      if (options.tirFatal) {
        ajouteDe6Crit(x, firstBonusCritique);
        if (options.tirFatal > 1) {
          ajouteDe6Crit(x, false);
        }
      }
      dmgDisplay = x.dmgDisplay;
      dmgTotal = x.dmgTotal;
    }
    //On trie les DM supplémentaires selon leur type
    var dmgParType = {};
    otherDmg.forEach(function(d) {
      if (_.has(dmgParType, d.type)) dmgParType[d.type].push(d);
      else dmgParType[d.type] = [d];
    });
    // Dommages de même type que le principal, mais à part, donc non affectés par les critiques
    var mainDmgType = dmg.type;
    var dmgExtra = dmgParType[mainDmgType];
    if (dmgExtra && dmgExtra.length > 0 && !charAttributeAsBool(target, 'immunite_' + mainDmgType)) {
      if (dmgCoef > 1) dmgDisplay = "(" + dmgDisplay + ")";
      showTotal = true;
      var count = dmgExtra.length;
      dmgExtra.forEach(function(d) {
        count--;
        partialSave(d, target, false, d.display, d.total, expliquer, evt,
          function(res) {
            if (res) {
              dmgTotal += res.total;
              dmgDisplay += "+" + res.dmgDisplay;
            } else {
              dmgTotal += d.total;
              dmgDisplay += "+" + d.display;
            }
            if (count === 0) dealDamageAfterDmgExtra(target, mainDmgType, dmgTotal, dmgDisplay, showTotal, dmgParType, dmgExtra, crit, options, evt, expliquer, displayRes);
          });
      });
    } else {
      return dealDamageAfterDmgExtra(target, mainDmgType, dmgTotal, dmgDisplay, showTotal, dmgParType, dmgExtra, crit, options, evt, expliquer, displayRes);
    }
  }

  // Effets quand on rentre en combat 
  // attaquant doit avoir un tokName et peut calculer le name
  function entrerEnCombat(attaquant, cibles, explications, evt) {
    var selected = [{
      _id: attaquant.token.id
    }];
    cibles.forEach(function(target) {
      selected.push({
        _id: target.token.id
      });
    });
    initiative(selected, evt); //ne recalcule pas l'init
    if (getState(attaquant, 'invisible')) {
      explications.push(attaquant.tokName + " redevient visible");
      setState(attaquant, 'invisible', false, evt);
    }
    var pacifisme = tokenAttribute(attaquant, 'pacifisme');
    if (pacifisme.length > 0 && pacifisme[0].get('current') > 0) {
      pacifisme[0].set('current', 0);
      if (attaquant.name === undefined) {
        var attackChar = getObj('character', attaquant.charId);
        if (attackChar) attaquant.name = attackChar.get('name');
        else attaquant.name = attaquant.tokName;
      }
      sendChat("GM", '/w "' + attaquant.name + '" ' + attaquant.tokName + " perd son pacifisme");
    }
    if (attributeAsBool(attaquant, 'sanctuaire')) {
      explications.push(attaquant.tokName + " met fin aux conditions du sanctuaire");
      removeTokenAttr(attaquant, 'sanctuaire', evt);
    }
  }

  //L'argument weaponStats est optionnel
  function critEnAttaque(attaquant, weaponStats, options) {
    var crit = 20;
    if (weaponStats) crit = weaponStats.crit;
    if (isNaN(crit) || crit < 1 || crit > 20) {
      error("Le critique n'est pas un nombre entre 1 et 20", crit);
      crit = 20;
    }
    if (charAttributeAsBool(attaquant, 'scienceDuCritique') ||
      (!options.distance && !options.sortilege && charAttributeAsBool(attaquant, 'morsureDuSerpent')) ||
      (crit == 20 && charAttributeAsBool(attaquant, 'ecuyer'))) crit -= 1;
    if (options.bonusCritique) crit -= options.bonusCritique;
    if (options.affute) crit -= 1;
    if (options.contact && charAttributeAsBool(attaquant, 'frappeChirurgicale'))
      crit -= modCarac(attaquant, 'INTELLIGENCE');
    if (options.arc || weaponStats.arc) {
      if (charAttributeAsBool(attaquant, 'tirFatal')) {
        crit -= modCarac(attaquant, 'SAGESSE');
        options.tirFatal = 1;
        if (charAttributeAsInt(attaquant, 'voieDeLArcEtDuCheval', 3) > 4)
          options.tirFatal = 2;
      }
    }
    if (crit < 2) crit = 2;
    return crit;
  }

  //attaquant doit avoir un champ name
  function attackExpression(attaquant, nbDe, dice, crit, weaponStats) {
    var de = computeDice(attaquant, {
      nbDe: nbDe,
      dice: dice
    });
    var attackRollExpr = "[[" + de + "cs>" + crit + "cf1]]";
    var attSkillDiv = weaponStats.attSkillDiv;
    if (isNaN(attSkillDiv)) attSkillDiv = 0;
    var attSkillDivTxt = "";
    if (attSkillDiv > 0) attSkillDivTxt = " + " + attSkillDiv;
    else if (attSkillDiv < 0) attSkillDivTxt += attSkillDiv;
    var attackSkillExpr = addOrigin(attaquant.name, "[[" + computeArmeAtk(attaquant, weaponStats.attSkill) + attSkillDivTxt + "]]");
    return attackRollExpr + " " + attackSkillExpr;
  }

  function resoudreAttaque(attaquant, cibles, attackLabel, weaponName, weaponStats, playerId, pageId, evt, options, chargesArme) {
    var attackingCharId = attaquant.charId;
    var attackingToken = attaquant.token;
    var attackerName = attaquant.name;
    var attackerTokName = attaquant.tokName;
    var explications = options.messages || [];
    var sujetAttaquant = onGenre(attackingCharId, 'il', 'elle');
    if (options.contact) {
      //Pris en compte du corps élémentaire
      var attrCorpsElem = findObjs({
        _type: 'attribute',
        _characterid: attackingCharId,
        name: 'corpsElementaire'
      });
      attrCorpsElem.forEach(function(attr) {
        var typeCorpsElem= attr.get('current');
          options.additionalDmg.push({
            type: typeCorpsElem,
            value: '1d6',
          });
          explications.push("Corps de "+typeCorpsElem+" => +1d6 DM");
      });
    }
    // Munitions
    if (options.munition) {
      if (attackingToken.get('bar1_link') === '') {
        error("Les munitions ne sont pas supportées pour les tokens qui ne sont pas liées à un personnage", attackingToken);
      }
      var munitionsAttr = findObjs({
        _type: 'attribute',
        _characterid: attackingCharId,
        name: 'munition_' + options.munition.nom
      });
      if (munitionsAttr.length === 0) {
        error("Pas de munition nommée " + options.munition.nom + " pour " + attackerName);
        return; //evt toujours vide
      }
      munitionsAttr = munitionsAttr[0];
      var munitions = munitionsAttr.get('current');
      if (munitions < 1 || (options.tirDouble && munitions < 2)) {
        sendChar(attackingCharId,
          "ne peut pas utiliser cette attaque, car " + sujetAttaquant +
          " n'a plus de " + options.munition.nom.replace(/_/g, ' '));
        return; //evt toujours vide
      }
      var munitionsMax = parseInt(munitionsAttr.get('max'));
      if (isNaN(munitionsMax)) {
        error("Attribut de munitions mal formé", munitionsMax);
        return;
      }
      //À partir de ce point, tout return doit ajouter evt
      evt.attributes = evt.attributes || [];
      evt.attributes.push({
        attribute: munitionsAttr,
        current: munitions,
        max: munitionsMax
      });
      //On cherche si la munition est empoisonnée
      var poisonAttr = tokenAttribute(attaquant, 'poisonRapide_munition_' + options.munition.nom);
      if (poisonAttr.length > 0) {
        poisonAttr = poisonAttr[0];
        var infosPoisonMunitions = poisonAttr.get('max');
        var infosPoisonMunitionsIndex = infosPoisonMunitions.indexOf(' ');
        var seuilMunitionsEmpoisonnees = parseInt(infosPoisonMunitions.substring(0, infosPoisonMunitionsIndex));
        var nombreMunitionsEmpoisonnees = parseInt(infosPoisonMunitions.substring(infosPoisonMunitionsIndex + 1));
        if (!isNaN(seuilMunitionsEmpoisonnees) && !isNaN(nombreMunitionsEmpoisonnees) && nombreMunitionsEmpoisonnees > 0) {
          options.additionalDmg.push({
            type: 'poison',
            value: poisonAttr.get('current'),
            partialSave: {
              carac: 'CON',
              seuil: seuilMunitionsEmpoisonnees
            }
          });
          explications.push("L'arme est empoisonnée");
          if (nombreMunitionsEmpoisonnees == 1) {
            evt.deletedAttributes = evt.deletedAttributes || [];
            evt.deletedAttributes.push(poisonAttr);
            poisonAttr.remove();
          } else {
            evt.attributes.push({
              attribute: poisonAttr,
              current: poisonAttr.get('current'),
              max: infosPoisonMunitions
            });
            poisonAttr.set('max', seuilMunitionsEmpoisonnees + ' ' + (nombreMunitionsEmpoisonnees - 1));
          }
        }
      }
      munitions--;
      if (randomInteger(100) < options.munition.taux) munitionsMax--;
      if (options.tirDouble) {
        munitions--;
        if (randomInteger(100) < options.munition.taux) munitionsMax--;
      }
      explications.push("Il reste " + munitions + " " +
        options.munition.nom.replace(/_/g, ' ') + " à " + attackerTokName);
      munitionsAttr.set('current', munitions);
      munitionsAttr.set('max', munitionsMax);
    }
    // Armes chargées
    if (options.semonce === undefined && options.tirDeBarrage === undefined) {
      if (chargesArme.length > 0) {
        var currentCharge = parseInt(chargesArme[0].get('current'));
        if (isNaN(currentCharge) || currentCharge < 1) {
          sendChar(attackingCharId, "ne peut pas attaquer avec " + weaponName + " car elle n'est pas chargée");
          addEvent(evt);
          return;
        }
        if (options.tirDouble &&
          (!options.tirDouble.stats || options.tirDouble.label == attackLabel) &&
          currentCharge < 2) {
          sendChar(attackingCharId,
            "ne peut pas faire de tir double avec ses" + weaponName + "s car " +
            sujetAttaquant + " n'en a pas au moins 2 chargées");
          addEvent(evt);
          return;
        }
        evt.attributes = evt.attributes || [];
        if (options.grenaille) {
          var chargesGrenaille = tokenAttribute(attaquant, 'chargeGrenaille_' + attackLabel);
          if (chargesGrenaille.length > 0) {
            var currentChargeGrenaille = parseInt(chargesGrenaille[0].get('current'));
            if (isNaN(currentChargeGrenaille) || currentChargeGrenaille < 1) {
              sendChar(attackingCharId, "ne peut pas attaquer avec " + weaponName + " car elle n'est pas chargée en grenaille");
              addEvent(evt);
              return;
            }
            if (options.tirDouble &&
              (!options.tirDouble.stats || options.tirDouble.label == attackLabel) &&
              currentChargeGrenaille < 2) {
              sendChar(attackingCharId,
                "ne peut pas faire de tir double de grenaille avec ses" + weaponName + "s car " +
                sujetAttaquant + " n'en a pas au moins 2 chargées de grenaille");
              addEvent(evt);
              return;
            }
            evt.attributes.push({
              attribute: chargesGrenaille[0],
              current: currentChargeGrenaille
            });
            if (options.tirDouble &&
              (!options.tirDouble.stats || options.tirDouble.label == attackLabel)
            ) currentChargeGrenaille -= 2;
            else currentChargeGrenaille -= 1;
            chargesGrenaille[0].set('current', currentChargeGrenaille);
          }
        }
        evt.attributes.push({
          attribute: chargesArme[0],
          current: currentCharge
        });
        if (options.tirDouble &&
          (!options.tirDouble.stats || options.tirDouble.label == attackLabel)) currentCharge -= 2;
        else currentCharge -= 1;
        chargesArme[0].set('current', currentCharge);
        if (currentCharge === 0 &&
          charAttributeAsInt(attaquant, "initEnMain" + attackLabel, 0) > 0) {
          updateNextInit(attackingToken);
        }
      }
      if (options.tirDouble && options.tirDouble.label && options.tirDouble.label != attackLabel) {
        var secondLabel = options.tirDouble.label;
        var secondNom = options.tirDouble.stats.name;
        var chargesSecondeArme = findObjs({
          _type: 'attribute',
          _characterid: attackingCharId,
          name: "charge_" + secondLabel
        });
        if (chargesSecondeArme.length > 0) {
          var currentCharge2 = parseInt(chargesSecondeArme[0].get('current'));
          if (isNaN(currentCharge2) || currentCharge2 < 1) {
            sendChar(attackingCharId, "ne peut pas faire de tir double avec " + secondNom + " car ce n'est pas chargé");
            addEvent(evt);
            return;
          }
          evt.attributes = evt.attributes || [];
          if (options.grenaille) {
            var chargesGrenaille2 = tokenAttribute(attaquant, 'chargeGrenaille_' + secondLabel);
            if (chargesGrenaille2.length > 0) {
              var currentChargeGrenaille2 = parseInt(chargesGrenaille2[0].get('current'));
              if (isNaN(currentChargeGrenaille2) || currentChargeGrenaille2 < 1) {
                sendChar(attackingCharId, "ne peut pas faire de tir double avec " + secondNom + " car ce n'est pas chargé en grenaille");
                addEvent(evt);
                return;
              }
              evt.attributes.push({
                attribute: chargesGrenaille2[0],
                current: currentChargeGrenaille2
              });
              currentChargeGrenaille2 -= 1;
              chargesGrenaille2[0].set('current', currentChargeGrenaille2);
            }
          }
          evt.attributes.push({
            attribute: chargesSecondeArme[0],
            current: currentCharge2
          });
          chargesArme[0].set('current', currentCharge2 - 1);
          if (currentCharge2 == 1 &&
            charAttributeAsInt(attaquant, "initEnMain" + secondLabel, 0) > 0) {
            updateNextInit(attackingToken);
          }
        }
      }
    }
    if (limiteRessources(attaquant, options, attackLabel, weaponName, evt))
      return;
    // Effets quand on rentre en combat 
    entrerEnCombat(attaquant, cibles, explications, evt);
    // On commence par le jet d'attaque de base : juste le ou les dés d'attaque 
    // et le modificateur d'arme et de caractéritiques qui apparaissent dans 
    // la description de l'attaque. Il faut quand même tenir compte des
    // chances de critique
    var crit = critEnAttaque(attaquant, weaponStats, options);
    var dice = 20;
    if (estAffaibli(attaquant)) {
      dice = 12;
      explications.push("Attaquant affaibli => D12 au lieu de D20 en Attaque");
    } else if (getState(attaquant, 'immobilise')) {
      dice = 12;
      explications.push("Attaquant aimmobilisé => D12 au lieu de D20 en Attaque");
    }
    if (options.avecd12) dice = 12;
    var nbDe = 1;
    if (options.m2d20) nbDe = 2;
    // toEvaluateAttack inlines
    // 0: attack roll
    // 1: attack skill expression
    // 2: dé de poudre
    var toEvaluateAttack = attackExpression(attaquant, nbDe, dice, crit, weaponStats);
    if (options.poudre) toEvaluateAttack += " [[1d20]]";
    sendChat(attackerName, toEvaluateAttack, function(resAttack) {
      var rollsAttack = options.rollsAttack || resAttack[0];
      var afterEvaluateAttack = rollsAttack.content.split(' ');
      var attRollNumber = rollNumber(afterEvaluateAttack[0]);
      var attSkillNumber = rollNumber(afterEvaluateAttack[1]);
      var d20roll = rollsAttack.inlinerolls[attRollNumber].results.total;
      var attSkill = rollsAttack.inlinerolls[attSkillNumber].results.total;

      evt.type = "Attaque";
      evt.succes = true;
      evt.action.player_id = playerId;
      evt.action.attaquant = attaquant;
      evt.action.cibles = cibles;
      evt.action.attack_label = attackLabel;
      evt.action.rollsAttack = rollsAttack;
      addEvent(evt);

      // debut de la partie affichage
      var action = "<b>Arme</b> : ";
      if (options.sortilege) action = "<b>Sort</b> : ";
      var label_type = BS_LABEL_INFO;
      var target = cibles[0];
      if (options.aoe || cibles.length > 1) {
        target = undefined;
        label_type = BS_LABEL_WARNING;
      }
      action += "<span style='" + BS_LABEL + " " + label_type + "; text-transform: none; font-size: 100%;'>" + weaponName + "</span>";

      var display = startFramedDisplay(playerId, action, attaquant, {
        perso2: target
      });

      // Cas des armes à poudre
      if (options.poudre) {
        var poudreNumber = rollNumber(afterEvaluateAttack[2]);
        var dePoudre = rollsAttack.inlinerolls[poudreNumber].results.total;
        explications.push(
          "Dé de poudre : " + buildinline(rollsAttack.inlinerolls[poudreNumber]));
        if (dePoudre === 1) {
          evt.succes = false;
          if (d20roll === 1) {
            explications.push(
              weaponName + " explose ! L'arme est complètement détruite");
            sendChat("", "[[2d6]]", function(res) {
              var rolls = res[0];
              var explRoll = rolls.inlinerolls[0];
              var r = {
                total: explRoll.results.total,
                type: 'normal',
                display: buildinline(explRoll, 'normal')
              };
              dealDamage(attaquant, r, [], evt, false, options, explications,
                function(dmgDisplay, dmg) {
                  var dmgMsg = "<b>Dommages pour " + attackerTokName + " :</b> " +
                    dmgDisplay;
                  addLineToFramedDisplay(display, dmgMsg);
                  finaliseDisplay(display, explications, evt, attaquant, cibles);
                });
            });
          } else {
            explications.push(
              "La poudre explose dans " + weaponName +
              ". L'arme est inutilisable jusqu'à la fin du combat");
            sendChat("", "[[1d6]]", function(res) {
              var rolls = res[0];
              var explRoll = rolls.inlinerolls[0];
              var r = {
                total: explRoll.results.total,
                type: 'normal',
                display: buildinline(explRoll, 'normal')
              };
              dealDamage(attaquant, r, [], evt, false, options, explications,
                function(dmgDisplay, dmg) {
                  var dmgMsg = "<b>Dommages pour " + attackerTokName + " :</b> " +
                    dmgDisplay;
                  addLineToFramedDisplay(display, dmgMsg);
                  finaliseDisplay(display, explications, evt, attaquant, cibles);
                });
            });
          }
          return;
        } else if (d20roll == dePoudre) {
          evt.succes = false;
          addLineToFramedDisplay(display,
            "<b>Attaque :</b> " +
            buildinline(rollsAttack.inlinerolls[attRollNumber]));
          explications.push(weaponName + " fait long feu, le coup ne part pas");
          finaliseDisplay(display, explications, evt, attaquant, cibles);
          return;
        }
      }
      //Modificateurs en Attaque qui ne dépendent pas de la cible
      var attBonusCommun =
        bonusAttaqueA(attaquant, weaponName, evt, explications, options);
      if (attributeAsBool(attaquant, 'aspectDuDemon') && weaponStats.attSkill==='@{ATKCAC}') {
        attBonusCommun += getValeurOfEffet(attaquant, 'aspectDuDemon', 2);
      }
      if (options.traquenard) {
        if (attributeAsInt(attaquant, 'traquenard', 0) === 0) {
          sendChar(attackingCharId, "ne peut pas faire de traquenard, car ce n'est pas sa première attaque du combat");
          return;
        }
        options.traquenard = tokenInit(attaquant, evt);
      }
      if (attributeAsInt(attaquant, 'traquenard', 0) > 0) {
        setTokenAttr(attaquant, 'traquenard', 0, evt);
      }
      if (options.feinte) explications.push("Mais c'était une feinte...");
      var mainDmgType = options.type || 'normal';
      if (options.sortilege) options.ignoreObstacles = true;
      var critSug; //Suggestion en cas d'écher critique
      //Calcul des cibles touchées
      //(et on ajuste le jet pour la triche)
      var ciblesTouchees = [];
      var count = cibles.length;
      cibles.forEach(function(target) {
        if (attributeAsBool(attaquant, 'menaceManoeuvre(' + target.token.id + ')')) {
          explications.push(attaquant.tokName + " attaque " + target.tokName + " malgré la menace. " + target.tokName + " a droit à une attaque au contact gratuite.");
          removeTokenAttr(attaquant, 'menaceManoeuvre(' + target.token.id + ')', evt);
          setTokenAttr(attaquant, 'attaqueMalgreMenace(' + target.token.id + ')', 1, evt, undefined);
        } else if (attributeAsBool(attaquant, 'menaceManoeuvre(' + target.token.id + ',crit)')) {
          explications.push(attaquant.tokName + " attaque " + target.tokName + " malgré la menace. " + target.tokName + " a droit à une attaque au contact gratuite (DM x 2 !).");
          removeTokenAttr(attaquant, 'menaceManoeuvre(' + target.token.id + ',crit)', evt);
          setTokenAttr(attaquant, 'attaqueMalgreMenace(' + target.token.id + ')', 2, evt, undefined);
        }
        target.additionalDmg = [];
        target.messages = [];
        var amm = 'attaqueMalgreMenace(' + attaquant.token.id + ')';
        if (options.contact && cibles.length == 1) {
          if (attributeAsBool(target, amm)) {
            target.messages.push('Attaque automatique suite à une menace ignorée');
            options.auto = true;
            if (attributeAsInt(target, amm, 1) > 1) options.dmFoisDeux = true;
            target.additionalDmg.push({
              type: mainDmgType,
              value: '1d6'
            });
            removeTokenAttr(target, amm, evt);
          } else if (attributeAsBool(attaquant, 'attaqueGratuiteAutomatique(' + target.token.id + ')')) {
            options.auto = true;
            removeTokenAttr(attaquant, 'attaqueGratuiteAutomatique(' + target.token.id + ')', evt);
          }
        }
        //Les bonus d'attaque qui dépendent de la cible
        var bad = bonusAttaqueD(attaquant, target, weaponStats.portee, pageId, evt, target.messages, options);
        var attBonus = attBonusCommun + bad;
        if (options.traquenard) {
          var initTarg = tokenInit(target, evt);
          if (options.traquenard >= initTarg) {
            attBonus += 2;
            target.additionalDmg.push({
              type: mainDmgType,
              value: '2' + options.d6
            });
            target.messages.push(attackerTokName + " fait un traquenard à " + target.tokName);
          } else {
            target.messages.push(attackerTokName + " n'est pas assez rapide pour faire un traquenard à " + target.tokName);
          }
        }
        var defautCuirasse =
          tokenAttribute(target, 'defautDansLaCuirasse_' + attackerTokName);
        target.crit = crit;
        if (defautCuirasse.length > 0) {
          target.defautCuirasse = true;
          if (target.crit > 2) target.crit -= 1;
        }
        //Defense de la cible
        var defense = defenseOfToken(attaquant, target, pageId, evt, options);
        var interchange;
        if (options.aoe === undefined) {
          interchange = interchangeable(attackingToken, target, pageId);
          if (interchange.result) defense += 5;
        }
        //Absorption au bouclier
        var absorber;
        if (target.absorber) {
          explications = explications.concat(target.absorberExpl);
          if (target.absorber > defense) {
            defense = target.absorber;
            absorber = target.absorberDisplay;
          }
        }
        var touche = true;
        var critique = false;
        // Calcule si touché, et les messages de dégats et attaque
        if (!options.auto && !options.interposer) {
          if (options.triche) {
            switch (options.triche) {
              case "rate":
                if (d20roll >= target.crit) {
                  if (target.crit < 2) d20roll = 1;
                  else d20roll = randomInteger(target.crit - 1);
                }
                if ((d20roll + attSkill + attBonus) >= defense) {
                  var maxd20roll = defense - attSkill - attBonus - 1;
                  if (maxd20roll >= target.crit) maxd20roll = target.crit - 1;
                  if (maxd20roll < 2) d20roll = 1;
                  else d20roll = randomInteger(maxd20roll);
                }
                break;
              case "touche":
                if (d20roll == 1) d20roll = randomInteger(dice - 1) + 1;
                if ((d20roll + attSkill + attBonus) < defense) {
                  var mind20roll = defense - attSkill - attBonus - 1;
                  if (mind20roll < 1) mind20roll = 1;
                  if (mind20roll >= dice) d20roll = dice;
                  else d20roll = randomInteger(dice - mind20roll) + mind20roll;
                }
                break;
              case "critique":
                if (d20roll < target.crit) {
                  if (target.crit <= dice) d20roll = randomInteger(dice - target.crit + 1) + target.crit - 1;
                  else d20roll = dice;
                }
                break;
              case "echecCritique":
                if (d20roll > 1) d20roll = 1;
                break;
              default:
                error("Option inconnue", options.triche);
            }
            // now adjust the roll
            var attackInlineRoll = rollsAttack.inlinerolls[attRollNumber];
            attackInlineRoll.results.total = d20roll;
            attackInlineRoll.results.rolls.forEach(function(roll) {
              switch (roll.type) {
                case "R":
                  if (roll.results.length == 1) {
                    roll.results[0].v = d20roll;
                  }
                  break;
                default:
                  return;
              }
            });
          }
          var attackRoll = d20roll + attSkill + attBonus;
          var attackResult; // string
          var paralyse = false;
          if (getState(target, 'paralyse')) {
            paralyse = true;
            target.messages.push("Cible paralysée => réussite critique automatique");
          }
          if (d20roll >= 15 && charAttributeAsBool(attaquant, 'champion'))
            options.champion = true;
          if (d20roll >= 17 && options.contact &&
            charAttributeAsBool(attaquant, 'crocEnJambe')) {
            if (d20roll >= 19 || !estQuadrupede(target)) {
              setState(target, 'renverse', true, evt);
              target.messages.push("tombe par terre");
            }
          }
          if (d20roll == 1 && options.chance === undefined) {
            attackResult = " : <span style='" + BS_LABEL + " " + BS_LABEL_DANGER + "'><b>échec&nbsp;critique</b></span>";
            if (options.demiAuto) {
              target.partialSaveAuto = true;
              evt.succes = false;
            } else touche = false;
            var confirmCrit = randomInteger(20);
            critSug = "/w GM Jet de confirmation pour l'échec critique : " +
              confirmCrit + "/20. Suggestion d'effet : ";
            switch (confirmCrit) {
              case 1:
                critSug += "l'attaquant se blesse ou est paralysé un tour";
                break;
              case 2:
                critSug += "l'attaquant blesse un allié";
                break;
              case 3:
                critSug += "l'arme casse, ou une pièce d'armure se détache, ou -5 DEF un tour (comme surpris)";
                break;
              case 4:
                critSug += "l'attaquant lache son arme ou glisse et tombe";
                break;
              default:
                critSug += "simple échec";
            }
          } else if (paralyse || d20roll == 20 ||
            (d20roll >= target.crit && attackRoll >= defense)) {
            attackResult = " : <span style='" + BS_LABEL + " " + BS_LABEL_SUCCESS + "'><b>réussite critique</b></span>";
            touche = true;
            critique = true;
          } else if (options.champion) {
            attackResult = " : <span style='" + BS_LABEL + " " + BS_LABEL_SUCCESS + "'><b>succès</b></span>";
          } else if (attackRoll < defense && d20roll < target.crit) {
            attackResult = " : <span style='" + BS_LABEL + " " + BS_LABEL_WARNING + "'><b>échec</b></span>";
            evt.succes = false;
            if (options.demiAuto) {
              target.partialSaveAuto = true;
            } else touche = false;
          } else if (d20roll % 2 && attributeAsBool(target, 'clignotement')) {
            target.messages.push(target.tokName + " disparaît au moment où l'attaque aurait du l" + onGenre(target.charId, 'e', 'a') + " toucher");
            attackResult = " : <span style='" + BS_LABEL + " " + BS_LABEL_WARNING + "'><b>échec</b></span>";
            target.clignotement = true;
            if (options.demiAuto) {
              target.partialSaveAuto = true;
            } else touche = false;
          } else { // Touché normal
            attackResult = " : <span style='" + BS_LABEL + " " + BS_LABEL_SUCCESS + "'><b>succès</b></span>";
          }
          var attRollValue = buildinline(rollsAttack.inlinerolls[attRollNumber]);
          if (attSkill > 0) attRollValue += "+" + attSkill;
          else if (attSkill < 0) attRollValue += attSkill;
          if (attBonus > 0) attRollValue += "+" + attBonus;
          else if (attBonus < 0) attRollValue += attBonus;
          var line = "<b>Attaque</b> ";
          if (options.aoe || cibles.length > 1) {
            line += "contre <b>" + target.tokName + "</b> ";
          }
          line += ":<br>";
          line += attRollValue + " vs <b>";
          if (absorber) line += absorber;
          else line += defense;
          line += "</b> " + attackResult;
          if (options.test) line += " (" + attackRoll + ")";
          target.attackMessage = line;
          if (touche) {
            if (options.asDeLaGachette && attackRoll > 24) {
              target.messages.push("As de la gachette : + 1" + options.d6 + " aux DM");
              target.additionalDmg.push({
                type: mainDmgType,
                value: '1' + options.d6
              });
            }
          } else { //Effet si on ne touche pas
            // Draw failed effect
            if (_.has(options, "fx") && options.distance) {
              var p1 = {
                x: attackingToken.get('left'),
                y: attackingToken.get('top')
              };
              var p2 = {
                x: target.token.get('left'),
                y: target.token.get('top')
              };
              // Compute some gaussian deviation in [0, 1]
              var dev =
                (Math.random() + Math.random() + Math.random() + Math.random() +
                  Math.random() + 1) / 6;
              // take into account by how far we miss
              dev = dev * (d20roll == 1) ? 2 : ((attackRoll - defense) / 20);
              if (Math.random() > 0.5) dev = -dev;
              p2.x += dev * (p2.y - p1.y);
              p2.y += dev * (p2.x - p1.x);
              spawnFxBetweenPoints(p1, p2, options.fx, pageId);
            }
            if (target.clignotement === undefined) {
              evt.succes = false;
              diminueMalediction(attaquant, evt);
            }
          }
        }
        target.touche = touche;
        target.critique = critique;
        if (options.aoe === undefined && interchange.targets.length > 1) { //any target can be affected
          var n = randomInteger(interchange.targets.length);
          target.token = interchange.targets[n - 1];
        }
        if (target.touche &&
          attributeAsBool(target, 'imageDecalee')) {
          var id = rollDePlus(6);
          if (id.val > 4) {
            target.touche = false;
            target.messages.push(id.roll + ": l'attaque passe à travers l'image de " + target.tokName);
          } else {
            target.messages.push(id.roll + ": malgré l'image légèrement décalée de " + target.tokName + " l'attaque touche");
          }
        }
        if (target.touche) {
          ciblesTouchees.push(target);
          if (attributeAsBool(target, 'esquiveFatale')) {
            var ennemisAuContact = target.ennemisAuContact;
            if (ennemisAuContact === undefined) {
              error("Les ennemis au contact n'ont pas été déterminé");
            } else {
              var iOther = ennemisAuContact.find(function(tok) {
                return (tok.id != attaquant.token.id);
              });
              if (iOther !== undefined)
                target.messages.push(bouton("!cof-esquive-fatale " + evt.id + " @{target|token_id}", "Esquive fatale ?", target));
            }
          }
        }
        if (options.test || options.feinte || !target.touche) {
          //On a fini avec cette cible, on imprime ce qui la concerne
          addLineToFramedDisplay(display, target.attackMessage);
          target.messages.forEach(function(expl) {
            addLineToFramedDisplay(display, expl, 80);
          });
        }
        if (options.feinte) {
          setTokenAttr(target, 'feinte_' + attaquant.tokName, 0, evt, undefined, target.touche);
        }
        count--;
        if (count === 0)
          attackDealDmg(attaquant, ciblesTouchees, critSug, attackLabel, weaponStats, d20roll, display, options, evt, explications, pageId, cibles);
      }); //fin de détermination de toucher des cibles
    }); // fin du jet d'attaque asynchrone
  }

  function computeMainDmgRollExpr(attaquant, target, weaponStats, attNbDices, attDMBonus, options) {
    var attDMArme = weaponStats.attDMBonusCommun;
    if (isNaN(attDMArme) || attDMArme === 0) attDMArme = '';
    else if (attDMArme > 0) attDMArme = '+' + attDMArme;
    attDMBonus = attDMArme + attDMBonus;
    var attNbDicesCible = attNbDices;
    var attDiceCible = computeAttackDice(weaponStats.attDice, options);
    var attCarBonusCible =
      computeAttackCarBonus(attaquant, weaponStats.attCarBonus);
    if (target.pressionMortelle) {
      attNbDicesCible = 1;
      attDiceCible = 6; //TODO : have an option for that
      attCarBonusCible = '';
    }
    if (!options.sortilege && charAttributeAsBool(target, 'immuniteAuxArmes')) {
      if (options.magique) {
        attNbDicesCible = options.magique;
        attDiceCible = "6";
        attCarBonusCible = modCarac(target, 'SAGESSE');
        if (attCarBonusCible < 1) attCarBonusCible = "";
        else attCarBonusCible = " +" + attCarBonusCible;
      } else {
        target.messages.push(target.tokName + " semble immunisé aux armes ordinaires");
        attNbDicesCible = 0;
        attCarBonusCible = "";
        attDMBonus = "";
      }
    }
    var symbde = 'd';
    if (target.maxDmg) symbde = '*';
    return addOrigin(attaquant.name, attNbDicesCible + symbde + attDiceCible + attCarBonusCible + attDMBonus);
  }

  function computeAttackDice(d, options) {
    if (isNaN(d) || d < 0) {
      error("Dé d'attaque incorrect", d);
      return 0;
    }
    var attDice = d;
    if (options.puissant) {
      attDice += 2;
    }
    if (options.reroll1) attDice += "r1";
    if (options.reroll2) attDice += "r2";
    if (options.explodeMax) attDice += '!';
    return attDice;
  }

  //retourne le mod de la caractéristique x, undefined si ce n'en est pas une
  function computeCarExpression(perso, x) {
    switch (x) {
      case '@{FOR}':
        return modCarac(perso, 'FORCE');
      case '@{DEX}':
        return modCarac(perso, 'DEXTERITE');
      case '@{CON}':
        return modCarac(perso, 'CONSTITUTION');
      case '@{INT}':
        return modCarac(perso, 'INTELLIGENCE');
      case '@{SAG}':
        return modCarac(perso, 'SAGESSE');
      case '@{CHA}':
        return modCarac(perso, 'CHARISME');
      default:
        return;
    }
  }


  function computeAttackCarBonus(attaquant, x) {
    if (x === undefined) return '';
    var attCarBonus = x;
    if (isNaN(attCarBonus)) {
      var simplerAttCarBonus = computeCarExpression(attaquant, x);
      if (simplerAttCarBonus !== undefined) {
        attCarBonus = simplerAttCarBonus;
      }
    }
    if (attCarBonus === "0" || attCarBonus === 0) attCarBonus = "";
    else attCarBonus = " + " + attCarBonus;
    return attCarBonus;
  }

  function computeArmeAtk(attaquant, x) {
    if (x === undefined) return '';
    var attDiv;
    var attCar;
    switch (x) {
      case '@{ATKCAC}':
        attDiv = ficheAttributeAsInt(attaquant, 'ATKCAC_DIV', 0);
        attCar = getAttrByName(attaquant.charId, 'ATKCAC_CARAC');
        break;
      case '@{ATKTIR}':
        attDiv = ficheAttributeAsInt(attaquant, 'ATKTIR_DIV', 0);
        attCar = getAttrByName(attaquant.charId, 'ATKTIR_CARAC');
        break;
      case '@{ATKMAG}':
        attDiv = ficheAttributeAsInt(attaquant, 'ATKMAG_DIV', 0);
        attCar = getAttrByName(attaquant.charId, 'ATKMAG_CARAC');
        break;
      default:
        return x;
    }
    attCar = computeCarExpression(attaquant, attCar);
    if (attCar === undefined) return x;
    return attCar + ficheAttributeAsInt(attaquant, 'NIVEAU', 1) + attDiv;
  }

  function attackDealDmg(attaquant, cibles, critSug, attackLabel, weaponStats, d20roll, display, options, evt, explications, pageId, ciblesAttaquees) {
    if (cibles.length === 0 || options.test || options.feinte) {
      finaliseDisplay(display, explications, evt, attaquant, ciblesAttaquees);
      if (critSug) sendChat('COF', critSug);
      return;
    }
    var attackingCharId = attaquant.charId;
    var attackingToken = attaquant.token;
    var attackerTokName = attaquant.tokName;
    options.attaquant = attaquant;

    //Les dégâts
    //Dégâts insrits sur la ligne de l'arme
    var mainDmgType = options.type || 'normal';
    var attNbDices = weaponStats.attNbDices;

    if (isNaN(attNbDices) || attNbDices < 0) {
      error("Dés de l'attaque incorrect", attNbDices);
      return;
    }
    if (attNbDices) {
      if (options.tempeteDeManaIntense) {
        attNbDices += options.tempeteDeManaIntense;
      } else if (options.conditionAttaquant &&
        options.conditionAttaquant.type == 'attribut') {
        var attrtdmi =
          options.conditionAttaquant.attribute + "TempeteDeManaIntense";
        var tdmCond = attributeAsInt(attaquant, attrtdmi, 0);
        if (tdmCond) {
          attNbDices += tdmCond;
          removeTokenAttr(attaquant, attrtdmi, evt);
        }
      }
    }
    // Les autres modifications aux dégâts qui ne dépendent pas de la cible
    var attDMBonusCommun = '';
    if (options.rayonAffaiblissant) {
      attDMBonusCommun += " -2";
    }
    if (attributeAsBool(attaquant, 'masqueDuPredateur')) {
      var bonusMasque = getValeurOfEffet(attaquant, 'masqueDuPredateur', modCarac(attaquant, 'SAGESSE'));
      if (bonusMasque > 0) attDMBonusCommun += " +" + bonusMasque;
    }
    if (attributeAsBool(attaquant, 'rageDuBerserk')) {
      options.additionalDmg.push({
        type: mainDmgType,
        value: '1' + options.d6
      });
    }
    if (attributeAsBool(attaquant, 'enragé')) {
      options.additionalDmg.push({
        type: mainDmgType,
        value: '1' + options.d6
      });
    }
    var attrPosture = tokenAttribute(attaquant, 'postureDeCombat');
    if (attrPosture.length > 0) {
      attrPosture = attrPosture[0];
      var posture = attrPosture.get('max');
      var postureVal;
      if (posture.startsWith('DM')) {
        postureVal = parseInt(attrPosture.get('current'));
        attDMBonusCommun += " -" + postureVal;
        explications.push("Posture de combat => -" + postureVal + " DM");
      } else if (posture.endsWith('DM')) {
        postureVal = parseInt(attrPosture.get('current'));
        attDMBonusCommun += " +" + postureVal;
        explications.push("Posture de combat => +" + postureVal + " DM");
      }
    }
    if (aUnCapitaine(attaquant, evt, pageId)) attDMBonusCommun += " +2";
    // Les autres sources de dégâts
    if (options.distance) {
      if (options.semonce) {
        options.additionalDmg.push({
          type: mainDmgType,
          value: '1' + options.d6
        });
        explications.push("Tir de semonce => +5 en Attaque et +1" + options.d6 + " aux DM");
      }
    } else { //bonus aux attaques de contact
      if (attributeAsBool(attaquant, 'agrandissement')) {
        attDMBonusCommun += "+2";
        explications.push("Agrandissement => +2 aux DM");
      }
      if (attributeAsBool(attaquant, 'forceDeGeant')) {
        var bonusForceDeGeant = getValeurOfEffet(attaquant, 'forceDeGeant', 2);
        attDMBonusCommun += "+" + bonusForceDeGeant;
        explications.push("Force de géant => +" + bonusForceDeGeant + " aux DM");
      }
      if (options.frappeDuVide) {
        options.additionalDmg.push({
          type: mainDmgType,
          value: '1' + options.d6
        });
      }
    }
    var attrForgeron = 'forgeron(' + attackLabel + ')';
    if (attributeAsBool(attaquant, attrForgeron)) {
      var feuForgeron = getValeurOfEffet(attackingCharId, attrForgeron, 1, 'voieDuMetal');
      var feuForgeronIntense = attributeAsInt(attaquant, attrForgeron + 'TempeteDeManaIntense', 0);
      if (feuForgeronIntense) {
        feuForgeron = feuForgeron * (1 + feuForgeronIntense);
        removeTokenAttr(attaquant, attrForgeron + 'TempeteDeManaIntense', evt);
      }
      options.additionalDmg.push({
        type: 'feu',
        value: feuForgeron
      });
    }
    var attrAEF = 'armeEnflammee(' + attackLabel + ')';
    if (attributeAsBool(attaquant, attrAEF)) {
      var nAEF = 1;
      var AEFIntense = attributeAsInt(attaquant, attrAEF + 'TempeteDeManaIntense', 0);
      if (AEFIntense) {
        nAEF += AEFIntense;
        removeTokenAttr(attaquant, attrAEF + 'TempeteDeManaIntense', evt);
      }
      options.additionalDmg.push({
        type: 'feu',
        value: nAEF + 'd6'
      });
    }
    var poisonAttr = tokenAttribute(attaquant, 'poisonRapide_' + attackLabel);
    if (poisonAttr.length > 0) {
      poisonAttr = poisonAttr[0];
      options.additionalDmg.push({
        type: 'poison',
        value: poisonAttr.get('current'),
        partialSave: {
          carac: 'CON',
          seuil: poisonAttr.get('max')
        }
      });
      explications.push("L'arme est empoisonnée");
      evt.deletedAttributes = evt.deletedAttributes || [];
      evt.deletedAttributes.push(poisonAttr);
      poisonAttr.remove();
    }
    var attrDmgArme = 'dmgArme(' + attackLabel + ')';
    if (charAttributeAsBool(attaquant, attrDmgArme)) {
      var dmgArme = {
        type: mainDmgType,
        value: '1' + options.d6
      };
      var valDmgArme = tokenAttribute(attaquant, attrDmgArme + 'Valeur');
      if (valDmgArme.length > 0) {
        dmgArme.value = valDmgArme[0].get('current');
        var dmgArmeType = valDmgArme[0].get('max');
        if (dmgArmeType !== '') dmgArme.type = dmgArmeType;
      }
      options.additionalDmg.push(dmgArme);
      explications.push("Arme enduite => +" + dmgArme.value + " aux DM");
    }
    if (options.champion) {
      options.additionalDmg.push({
        type: mainDmgType,
        value: '1' + options.d6
      });
      explications.push(attackerTokName + " est un champion, son attaque porte !");
    }
    /////////////////////////////////////////////////////////////////
    //Tout ce qui dépend de la cible
    var ciblesCount = cibles.length; //Pour l'asynchronie
    var attaquesEnTraitrePossibles = {};
    var finCibles = function() {
      ciblesCount--;
      if (ciblesCount === 0) {
        cibles.forEach(function(target) {
          if (target.attackMessage) {
            addLineToFramedDisplay(display, target.attackMessage);
          } else if (options.aoe) { //par exemple si attaque automatique
            addLineToFramedDisplay(display, "<b>" + target.tokName + "</b> :");
          }
          if (target.dmgMessage) addLineToFramedDisplay(display, target.dmgMessage, 100, false);
          target.messages.forEach(function(expl) {
            addLineToFramedDisplay(display, expl, 80);
          });
        });
        finaliseDisplay(display, explications, evt, attaquant, ciblesAttaquees);
        for (var vid in attaquesEnTraitrePossibles) {
          var voleur = tokenOfId(vid);
          if (voleur === undefined) continue;
          var attaqueEnTraitre = tokenAttribute(voleur, 'attaqueEnTraitre');
          if (attaqueEnTraitre.length === 0) {
            error("Impossible de trouver l'attribut d'attaque en traître", voleur);
            continue;
          }
          attaqueEnTraitre = attaqueEnTraitre[0];
          var curAttaqueEnTraitre = parseInt(attaqueEnTraitre.get('current'));
          if (isNaN(curAttaqueEnTraitre)) {
            error("Resource pour attaque en traître mal formée", attaqueEnTraitre);
            continue;
          }
          if (curAttaqueEnTraitre > 0) {
            displayAttaqueOpportunite(vid, attaquesEnTraitrePossibles[vid], "en traître", '#AttaqueEnTraitre#', '--decrAttribute ' + attaqueEnTraitre.id);
          }
        }
      }
    };
    cibles.forEach(function(target) {
      target.ignoreRD = options.ignoreRD;
      target.ignoreMoitieRD = options.ignoreMoitieRD;
      target.tempDmg = options.tempDmg;
      target.enflamme = options.enflamme;
      target.malediction = options.malediction;
      target.pietine = options.pietine;
      target.maxDmg = options.maxDmg;
      evalITE(attaquant, target, d20roll, options, evt, explications, options);
      if (options.enveloppe !== undefined) {
        var ligneEnveloppe = attaquant.tokName + " peut ";
        var commandeEnvelopper =
          '!cof-enveloppement ' + attaquant.token.id + ' ' + target.token.id + ' ' +
          options.enveloppe.difficulte + ' ' +
          options.enveloppe.type + ' ' + options.enveloppe.expression;
        ligneEnveloppe += boutonSimple(commandeEnvelopper, '', 'envelopper');
        ligneEnveloppe += target.tokName;
        target.messages.push(ligneEnveloppe);
      }
      var attDMBonus = attDMBonusCommun;
      //Les modificateurs de dégâts qui dépendent de la cible
      if (target.tempDmg) {
        var forceTarg = modCarac(target, "FORCE");
        if (forceTarg < 0) {
          attDMBonus += " +" + (-forceTarg);
        } else {
          attDMBonus += " -" + forceTarg;
        }
      }
      if (options.pressionMortelle || target.pressionMortelle) {
        var pMortelle = tokenAttribute(target, 'pressionMortelle');
        if (pMortelle.length === 0) {
          sendChar(attackingCharId, "Essaie une pression mortelle, mais aucun point vital de " + target.tokName + " n'a encore été affecté");
          ciblesCount--;
          return;
        }
        target.pressionMortelle = pMortelle;
        attDMBonus = "+ " + pMortelle[0].get('current');
      }
      if (options.distance && !options.grenaille) {
        var tirPrecis = charAttributeAsInt(attaquant, 'tirPrecis', 0);
        if (tirPrecis > 0) {
          var modDex = modCarac(attaquant, 'DEXTERITE');
          if (target.distance <= 5 * modDex) {
            attDMBonus += " + " + tirPrecis;
            target.messages.push("Tir précis : +" + tirPrecis + " DM");
          }
        }
      }
      var sournoise = options.sournoise || 0;
      if (target.sournoise) sournoise += target.sournoise;
      if (sournoise) {
        if (charAttributeAsBool(target, 'immuniteAuxSournoises')) {
          target.messages.push('Immunité aux attaques sournoises');
        } else {
          target.additionalDmg.push({
            type: mainDmgType,
            value: sournoise + options.d6
          });
          target.messages.push("Attaque sournoise => +" + sournoise + options.d6 + " DM");
        }
      }
      if (target.chasseurEmerite) {
        attDMBonus += "+2";
      }
      if (target.ennemiJure) {
        target.additionalDmg.push({
          type: mainDmgType,
          value: '1' + options.d6
        });
      }
      if (target.tueurDeGeants) {
        target.additionalDmg.push({
          type: mainDmgType,
          value: '2' + options.d6
        });
      }
      if (target.argent) {
        target.additionalDmg.push({
          type: mainDmgType,
          value: '1d6'
        });
      }
      var attrFeinte = tokenAttribute(target, 'feinte_' + attaquant.tokName);
      if (attrFeinte.length > 0 && attrFeinte[0].get('current') &&
        attrFeinte[0].get('max')) {
        target.additionalDmg.push({
          type: mainDmgType,
          value: '2' + options.d6
        });
      }
      var loupParmiLesLoups = charAttributeAsInt(attaquant, 'loupParmiLesLoups', 0);
      if (loupParmiLesLoups > 0 && estHumanoide(target)) {
        attDMBonus += "+" + loupParmiLesLoups;
        target.messages.push("Loup parmi les loups : +" + loupParmiLesLoups + " DM");
      }
      //Bonus aux DMs dus au défi samouraï
      var defiSamouraiAttr = tokenAttribute(attaquant, 'defiSamourai');
      if (defiSamouraiAttr.length > 0) {
        defiSamouraiAttr = defiSamouraiAttr[0];
        var cibleDefi = defiSamouraiAttr.get('max');
        if (cibleDefi.startsWith(target.token.id)) cibleDefi = true;
        else {
          var cibleDefiSep = cibleDefi.indexOf(' ');
          var cibleDefiName = cibleDefi.substring(cibleDefiSep + 1);
          if (cibleDefiName == target.tokName) {
            var cibleDefiId = cibleDefi.substring(0, cibleDefiSep);
            cibleDefi = tokenOfId(cibleDefiId, cibleDefiName, pageId);
            if (cibleDefi !== undefined && cibleDefi.id != target.id)
              cibleDefi = false;
            else cibleDefi = true;
          } else cibleDefi = false;
        }
        if (cibleDefi) {
          var bonusDefi = parseInt(defiSamouraiAttr.get('current'));
          target.additionalDmg.push({
            type: mainDmgType,
            value: bonusDefi
          });
          target.messages.push(attackerTokName + " bénéficie d'un bonus de +" + bonusDefi + " aux DMs contre " + target.tokName);
        }
      }

      if (attributeAsBool(attaquant, 'ombreMortelle') ||
        attributeAsBool(attaquant, 'dedoublement') ||
        (charAttributeAsBool(attaquant, 'armeeConjuree') && attributeAsBool(target, 'attaqueArmeeConjuree'))) {
        if (options.divise) options.divise *= 2;
        else options.divise = 2;
      }
      var mainDmgRollExpr =
        computeMainDmgRollExpr(attaquant, target, weaponStats, attNbDices,
          attDMBonus, options);
      //Additional damage
      var additionalDmg = options.additionalDmg.concat(target.additionalDmg);
      //On enlève les DM qui ne passent pas les conditions
      additionalDmg = additionalDmg.filter(function(dmSpec) {
        if (dmSpec.conditions === undefined) return true;
        return dmSpec.conditions.every(function(cond) {
          return testCondition(cond, attaquant, [target], d20roll);
        });
      });
      if (!options.sortilege && !options.magique &&
        charAttributeAsBool(target, 'immuniteAuxArmes')) {
        additionalDmg = additionalDmg.filter(function(dmSpec) {
          switch (dmSpec.type) {
            case undefined:
            case 'normal':
            case 'poison':
            case 'maladie':
              return false;
            default:
              return true;
          }
        });
      }
      if (options.tirDouble || options.tirDeBarrage || options.dmFoisDeux) {
        if (options.tirDouble && options.tirDouble.stats) {
          var stats2 = options.tirDouble.stats;
          mainDmgRollExpr += " +" +
            computeMainDmgRollExpr(attaquant, target, stats2, stats2.attNbDices,
              attDMBonus, options);
        } else {
          mainDmgRollExpr += " +" + mainDmgRollExpr;
        }
        additionalDmg.forEach(function(dmSpec) {
          dmSpec.value += " +" + dmSpec.Value;
        });
      }
      var ExtraDmgRollExpr = "";
      additionalDmg = additionalDmg.filter(function(dmSpec) {
        dmSpec.type = dmSpec.type || 'normal';
        if (dmSpec.type != mainDmgType || isNaN(dmSpec.value)) {
          ExtraDmgRollExpr += " [[" + dmSpec.value + "]]";
          return true;
        }
        // We have the same type and a constant -> should be multiplied by crit
        mainDmgRollExpr += " + " + dmSpec.value;
        return false;
      });
      if (options.aveugleManoeuvre) {
        mainDmgRollExpr += " -5";
      }
      var mainDmgRoll = {
        type: mainDmgType,
        value: mainDmgRollExpr
      };

      // toEvaluateDmg inlines
      // 0 : roll de dégâts principaux
      // 1+ : les rolls de dégâts supplémentaires

      var toEvaluateDmg = "[[" + mainDmgRollExpr + "]]" + ExtraDmgRollExpr;
      sendChat(attaquant.name, toEvaluateDmg, function(resDmg) {
        var rollsDmg = target.rollsDmg || resDmg[0];
        var afterEvaluateDmg = rollsDmg.content.split(' ');
        var mainDmgRollNumber = rollNumber(afterEvaluateDmg[0]);
        mainDmgRoll.total = rollsDmg.inlinerolls[mainDmgRollNumber].results.total;
        mainDmgRoll.display = buildinline(rollsDmg.inlinerolls[mainDmgRollNumber], mainDmgType, options.magique);
        additionalDmg.forEach(function(dmSpec, i) {
          var rRoll = rollsDmg.inlinerolls[rollNumber(afterEvaluateDmg[i + 1])];
          dmSpec.total = dmSpec.total || rRoll.results.total;
          var addDmType = dmSpec.type;
          dmSpec.display = dmSpec.display || buildinline(rRoll, addDmType, options.magique);
        });

        if (target.touche) { //Devrait être inutile ?
          if (options.tirDeBarrage) target.messages.push("Tir de barrage : undo si la cible décide de ne pas bouger");
          if (options.pointsVitaux) target.messages.push(attackerTokName + " vise des points vitaux mais ne semble pas faire de dégâts");
          if (options.pressionMortelle || target.pressionMortelle) {
            removeTokenAttr(target, 'pressionMortelle', evt);
            target.messages.push(attackerTokName + " libère la pression des points vitaux, l'effet est dévastateur !");
            spawnFx(target.token.get('left'), target.token.get('top'), 'bomb-death', pageId);
          }
          if (options.pasDeDmg === undefined) { //si l'attaque fait des DM, possibilité d'attaque en traître
            if (attaquant.alliesAvecAttaqueEnTraitre === undefined) {
              attaquant.alliesAvecAttaqueEnTraitre = [];
              //On cherche tous les alliés ayant l'attaque en traitre
              var allies = alliesParPerso[attaquant.charId] || new Set();
              allies.forEach(function(ci) {
                var aet = findObjs({
                  _type: 'attribute',
                  _characterid: ci,
                });
                aet.forEach(function(a) {
                  var an = a.get('name');
                  if (an == 'attaqueEnTraitre' ||
                    an.startsWith('attaqueEnTraitre_')) {
                    if (a.get('current')) {
                      iterTokensOfAttribute(ci, pageId, 'attaqueEnTraitre', an,
                        function(tok) {
                          attaquant.alliesAvecAttaqueEnTraitre.push(tok);
                        }, {
                          onlyOnPage: true,
                          possiblementAbsent: true
                        });
                    }
                  }
                });
              });
            }
            attaquant.alliesAvecAttaqueEnTraitre.forEach(function(tok) {
              if (tok.id == target.id) return;
              if (distanceCombat(target.token, tok, pageId) === 0) {
                var aetp = attaquesEnTraitrePossibles[tok.id];
                if (aetp === undefined) {
                  aetp = [];
                  attaquesEnTraitrePossibles[tok.id] = aetp;
                }
                aetp.push(target);
              }
            });
          }
          // change l'état de la cible, si spécifié
          if (target.enflamme) {
            var enflammePuissance = 1;
            if (options.puissant) enflammePuissance = 2;
            setTokenAttr(target, 'enflamme', enflammePuissance, evt);
            target.messages.push(target.tokName + " prend feu !");
          }
          if (target.malediction) {
            setTokenAttr(target, 'malediction', 3, evt);
            target.messages.push(target.tokName + " est maudit...");
          }
          // Draw effect, if any
          if (options.fx) {
            //Pour les cones, on fait un seul effet, car c'est bien géré.
            if (!options.aoe || options.aoe.type != 'cone') {
              var p1e = {
                x: attackingToken.get('left'),
                y: attackingToken.get('top'),
              };
              var p2e = {
                x: target.token.get('left'),
                y: target.token.get('top'),
              };
              spawnFxBetweenPoints(p1e, p2e, options.fx, pageId);
            }
          }
          if (options.targetFx && !options.aoe) {
            spawnFx(target.token.get('left'), target.token.get('top'), options.targetFx, pageId);
          }
          target.rollsDmg = rollsDmg;
          // Compte le nombre de saves pour la synchronisation
          // (On ne compte pas les psave, gérés dans dealDamage)
          var saves = 0;
          //ajoute les états sans save à la cible
          var etats = options.etats;
          if (target.etats) {
            if (etats) etats = etats.concat(target.etats);
            else etats = target.etats;
          }
          if (etats) {
            etats.forEach(function(ce) {
              if (ce.save) {
                saves++;
                return; //on le fera plus tard
              }
              if (testCondition(ce.condition, attaquant, [target], d20roll)) {
                setState(target, ce.etat, true, evt);
                target.messages.push(target.tokName + " est " + ce.etat + eForFemale(target.charId) + " par l'attaque");
                if (ce.saveCarac) {
                  setTokenAttr(target, ce.etat + 'Save', ce.saveCarac, evt, undefined, ce.saveDifficulte);
                }
              } else {
                if (ce.condition.type == "moins") {
                  target.messages.push(
                    "Grâce à sa " + ce.condition.text + ", " + target.tokName +
                    " n'est pas " + ce.etat + eForFemale(target.charId));
                }
              }
            });
          }
          var savesEffets = 0;
          // Ajoute les effets sans save à la cible
          var effets = options.effets;
          if (target.effets) {
            if (effets) effets = effets.concat(target.effets);
            else effets = target.effets;
          }
          if (effets) {
            effets.forEach(function(ef) {
              if (ef.save) {
                saves++;
                savesEffets++;
                return; //on le fera plus tard
              }
              if (ef.effet == 'dedoublement') {
                if (attributeAsBool(target, 'dedouble') ||
                  attributeAsBool(target, 'dedoublement')) {
                  target.messages.push(target.tokName + " a déjà été dédoublé pendant ce combat");
                  return;
                }
                target.messages.push("Un double translucide de " +
                  target.tokName + " apparaît. Il est aux ordres de " +
                  attackerTokName);
                setTokenAttr(target, 'dedouble', true, evt);
                copieToken(target, undefined, stateCOF.options.images.val.image_double.val,
                  "Double de " + target.tokName, 'dedoublement', ef.duree,
                  pageId, evt);
                return;
              }
              if (ef.duree) {
                if (ef.message)
                  target.messages.push(target.tokName + " " + ef.message.activation);
                setTokenAttr(target, ef.effet, ef.duree, evt, undefined,
                  getInit());
                if (ef.effet == 'aveugleTemp') {
                  setState(target, 'aveugle', true, evt);
                } else if (ef.effet == 'ralentiTemp') {
                  setState(target, 'ralenti', true, evt);
                } else if (ef.effet == 'paralyseTemp') {
                  setState(target, 'paralyse', true, evt);
                } else if (ef.effet == 'etourdiTemp') {
                  setState(target, 'etourdi', true, evt);
                }
              } else { //On a un effet de combat
                target.messages.push(target.tokName + " " + messageEffetCombat[ef.effet].activation);
                setTokenAttr(target, ef.effet, true, evt);
              }
              if (ef.valeur !== undefined) {
                setTokenAttr(target, ef.effet + "Valeur", ef.valeur, evt, undefined, ef.valeurMax);
              }
              if (options.tempeteDeManaIntense)
                setTokenAttr(target, ef.effet + 'TempeteDeManaIntense', options.tempeteDeManaIntense, evt);
              if (ef.saveParTour) {
                setTokenAttr(target, ef.effet + "SaveParTour",
                  ef.saveParTour.carac, evt, undefined, ef.saveParTour.seuil);
              }
            });
          }
          // Tout ce qui se passe après les saves (autres que saves de diminution des dmg
          var afterSaves = function() {
            if (saves > 0) return; //On n'a pas encore fait tous les saves
            if (options.pasDeDmg ||
              (additionalDmg.length === 0 && mainDmgRoll.total === 0 &&
                attNbDices === 0)) {
              // Pas de dégâts, donc pas d'appel à dealDamage
              finCibles();
            } else {
              dealDamage(target, mainDmgRoll, additionalDmg, evt, target.critique,
                options, target.messages,
                function(dmgDisplay, dmg) {
                  if (options.strigeSuce) {
                    var suce = attributeAsInt(attaquant, 'strigeSuce', 0);
                    if (suce === 0) {
                      setTokenAttr(attaquant, 'bufDEF', -3, evt);
                      target.messages.push(
                        attackerTokName + " s'agrippe à " + target.tokName +
                        " et commence à lui sucer le sang");
                    }
                    if (suce + dmg >= 6) {
                      target.messages.push(
                        "Repus, " + attackerTokName + " se détache et s'envole");
                      target.messages.push(target.tokName + " se sent un peu faible...");
                      setState(target, 'affaibli', true, evt);
                      var defbuf = attributeAsInt(attaquant, 'bufDEF', 0);
                      if (defbuf === -3) {
                        removeTokenAttr(attaquant, 'bufDEF', evt);
                      } else if (defbuf !== 0) {
                        setTokenAttr(attaquant, 'bufDEF', defbuf + 3, evt);
                      }
                    } else {
                      setTokenAttr(attaquant, 'strigeSuce', suce + dmg, evt);
                      if (suce > 0)
                        target.messages.push(
                          attackerTokName + " continue à sucer le sang de " + target.tokName);
                    }
                  }
                  if (options.vampirise || target.vampirise) {
                    soigneToken(attaquant, dmg, evt, function(soins) {
                      target.messages.push(
                        "L'attaque soigne " + attackerTokName + " de " + soins +
                        " PV");
                    });
                  }
                  target.dmgMessage = "<b>DM :</b> " + dmgDisplay;
                  if (options.contact) {
                    //Les DMs automatiques en cas de toucher une cible
                    if (attributeAsBool(target, 'sousTension')) {
                      ciblesCount++;
                      sendChat("", "[[1d6]]", function(res) {
                        var rolls = res[0];
                        var explRoll = rolls.inlinerolls[0];
                        var r = {
                          total: explRoll.results.total,
                          type: 'electrique',
                          display: buildinline(explRoll, 'electrique', true)
                        };
                        dealDamage(attaquant, r, [], evt, false, options,
                          target.messages,
                          function(dmgDisplay, dmg) {
                            var dmgMsg =
                              "<b>Décharge électrique sur " + attackerTokName + " :</b> " +
                              dmgDisplay;
                            target.messages.push(dmgMsg);
                            finCibles();
                          });
                      });
                    }
                    if (attributeAsBool(target, 'sangMordant')) {
                      ciblesCount++;
                      sendChat("", "[[1d6]]", function(res) {
                        var rolls = res[0];
                        var explRoll = rolls.inlinerolls[0];
                        var r = {
                          total: explRoll.results.total,
                          type: 'acide',
                          display: buildinline(explRoll, 'acide', true)
                        };
                        dealDamage(attaquant, r, [], evt, false, options,
                          target.messages,
                          function(dmgDisplay, dmg) {
                            var dmgMsg =
                              "<b>Le sang acide gicle sur " + attackerTokName + " :</b> " +
                              dmgDisplay + " DM";
                            target.messages.push(dmgMsg);
                            finCibles();
                          });
                      });
                    }
                    var attrDmSiToucheContact = findObjs({
                      _type: 'attribute',
                      _characterid: target.charId,
                      name: 'dmSiToucheContact'
                    });
                    attrDmSiToucheContact.forEach(function(dstc) {
                      ciblesCount++;
                      sendChat("", "[[" + dstc.get('current') + "]]", function(res) {
                        var rolls = res[0];
                        var explRoll = rolls.inlinerolls[0];
                        var type = dstc.get('max');
                        var r = {
                          total: explRoll.results.total,
                          type: type,
                          display: buildinline(explRoll, type, true)
                        };
                        dealDamage(attaquant, r, [], evt, false, options,
                          target.messages,
                          function(dmgDisplay, dmg) {
                            var dmgMsg =
                              "<b>" + attackerTokName + " subit :</b> " +
                              dmgDisplay + " DM en touchant " + target.tokName;
                            target.messages.push(dmgMsg);
                            finCibles();
                          });
                      });
                    });
                    var attrCorpsElem = findObjs({
                      _type: 'attribute',
                      _characterid: target.charId,
                      name: 'corpsElementaire'
                    });
                    attrCorpsElem.forEach(function(dstc) {
                      ciblesCount++;
                      sendChat("", "[[1d6]]", function(res) {
                        var rolls = res[0];
                        var explRoll = rolls.inlinerolls[0];
                        var type = dstc.get('current');
                        var r = {
                          total: explRoll.results.total,
                          type: type,
                          display: buildinline(explRoll, type, true)
                        };
                        dealDamage(attaquant, r, [], evt, false, options,
                          target.messages,
                          function(dmgDisplay, dmg) {
                            var dmgMsg =
                              "<b>" + attackerTokName + " subit :</b> " +
                              dmgDisplay + " DM en touchant " + target.tokName;
                            target.messages.push(dmgMsg);
                            finCibles();
                          });
                      });
                    });
                  }
                  finCibles();
                });
            }
          };
          var expliquer = function(msg) {
            target.messages.push(msg);
          };
          //Ajoute les états avec save à la cibles
          var etatsAvecSave = function() {
            if (savesEffets > 0) return; //On n'a pas encore fini avec les effets
            if (etats && saves > 0) {
              etats.forEach(function(ce) {
                if (ce.save) {
                  if (testCondition(ce.condition, attaquant, [target], d20roll)) {
                    var msgPour = " pour résister à un effet";
                    var msgRate = ", " + target.tokName + " est " + ce.etat + eForFemale(target.charId) + " par l'attaque";
                    var saveOpts = {
                      msgPour: msgPour,
                      msgRate: msgRate,
                      attaquant: attaquant
                    };
                    save(ce.save, target, expliquer, saveOpts, evt,
                      function(reussite, rolltext) {
                        if (!reussite) {
                          setState(target, ce.etat, true, evt);
                          if (ce.saveCarac) {
                            setTokenAttr(target, ce.etat + 'Save', ce.saveCarac, evt, undefined, ce.saveDifficulte);
                          }
                        }
                        saves--;
                        afterSaves();
                      });
                  } else {
                    if (ce.condition.type == "moins") {
                      target.messages.push(
                        "Grâce à sa " + ce.condition.text + ", " + target.tokName +
                        " n'est pas " + ce.etat + eForFemale(target.charId));
                    }
                    saves--;
                    afterSaves();
                  }
                }
              });
            } else afterSaves();
          };
          // Ajoute les effets avec save à la cible
          var effetsAvecSave = function() {
            if (effets && savesEffets > 0) {
              effets.forEach(function(ef) {
                if (ef.save) {
                  var msgPour = " pour résister à un effet";
                  var msgRate = ", " + target.tokName + " ";
                  if (ef.duree && ef.message)
                    msgRate += ef.message.activation;
                  else msgRate += messageEffetCombat[ef.effet].activation;
                  var saveOpts = {
                    msgPour: msgPour,
                    msgRate: msgRate,
                    attaquant: attaquant
                  };
                  var duree = ef.duree;
                  save(ef.save, target, expliquer, saveOpts, evt,
                    function(reussite, rollText) {
                      if (reussite && duree && ef.save.demiDuree) {
                        reussite = false;
                        duree = Math.ceil(duree / 2);
                      }
                      if (!reussite) {
                        if (ef.duree)
                          setTokenAttr(target, ef.effet, duree, evt,
                            undefined, getInit());
                        else setTokenAttr(target, ef.effet, true, evt);
                        if (ef.effet == 'aveugleTemp') {
                          setState(target, 'aveugle', true, evt);
                        } else if (ef.effet == 'ralentiTemp') {
                          setState(target, 'ralenti', true, evt);
                        } else if (ef.effet == 'paralyseTemp') {
                          setState(target, 'paralyse', true, evt);
                        } else if (ef.effet == 'etourdiTemp') {
                          setState(target, 'etourdi', true, evt);
                        }
                        if (ef.valeur !== undefined) {
                          setTokenAttr(target, ef.effet + "Valeur", ef.valeur, evt, undefined, ef.valeurMax);
                        }
                        if (options.tempeteDeManaIntense)
                          setTokenAttr(target, ef.effet + 'TempeteDeManaIntense', options.tempeteDeManaIntense, evt);
                        if (ef.saveParTour) {
                          setTokenAttr(target,
                            ef.effet + "SaveParTour", ef.saveParTour.carac,
                            evt, undefined, ef.saveParTour.seuil);
                        }
                      }
                      saves--;
                      savesEffets--;
                      etatsAvecSave();
                    });
                }
              });
            } else etatsAvecSave();
          };
          var effetPietinement = function() {
            if (target.pietine && estAussiGrandQue(attaquant, target)) {
              testOppose(target, 'FOR', attaquant, 'FOR', target.messages, evt,
                function(resultat) {
                  if (resultat == 2) {
                    target.messages.push(target.tokName + " est piétiné par " + attackerTokName);
                    setState(target, 'renverse', true, evt);
                    target.touche++;
                  } else {
                    if (resultat === 0) diminueMalediction(attaquant, evt);
                    target.messages.push(target.tokName + " n'est pas piétiné.");
                  }
                  effetsAvecSave();
                });
            } else effetsAvecSave();
          };
          // Peut faire peur à la cible
          if (options.peur) {
            peurOneToken(target, pageId, options.peur.seuil,
              options.peur.duree, {
                resisteAvecForce: true
              }, target.messages, evt, effetPietinement);
          } else effetPietinement();
        } else {
          evt.succes = false;
          finCibles();
        }
      });
    }); //Fin de la boucle pour toutes cibles
  }

  //Affichage final d'une attaque
  function finaliseDisplay(display, explications, evt, attaquant, cibles) {
    explications.forEach(function(expl) {
      addLineToFramedDisplay(display, expl, 80);
    });
    if (evt.action) {
      evt.personnage = evt.action.attaquant;
      if (evt.succes === false) {
        var pc = attributeAsInt(evt.personnage, 'PC', 0);
        if (pc > 0) {
          addLineToFramedDisplay(display, bouton("!cof-bouton-chance " + evt.id, "Chance", evt.personnage) + " (reste " + pc + " PC)");
        }
        if (attributeAsBool(evt.personnage, 'runeDEnergie')) {
          addLineToFramedDisplay(display, bouton("!cof-rune-energie " + evt.id, "Rune d'énergie", evt.personnage));
        }
        //TODO: pacte sanglant
      } else {
        if (evt.action.attack_label) {
          var attLabel = evt.action.attack_label;
          if (attributeAsBool(evt.personnage, 'runeDePuissance(' + attLabel + ')')) {
            addLineToFramedDisplay(display,
              bouton("!cof-rune-puissance " + attLabel + ' ' + evt.id,
                "Rune de puissance", evt.personnage));
          }
        }
        if (attributeAsBool(evt.personnage, 'kiai') && !attributeAsBool(evt.personnage, 'rechargeDuKiai')) {
          addLineToFramedDisplay(display,
            bouton("!cof-pousser-kiai " + evt.id, "Kiai", evt.personnage));
        }
        var sort = false;
        if (evt.action.options && evt.action.options.sortilege) sort = true;
        if (evt.action.cibles) {
          evt.action.cibles.forEach(function(target) {
            if (attributeAsBool(target, 'encaisserUnCoup')) {
              addLineToFramedDisplay(display, target.tokName + " peut " +
                bouton("!cof-encaisser-un-coup " + evt.id,
                  "encaisser le coup", target)
              );
            }
            if (sort) {
              if (attributeAsBool(target, 'absorberUnSort')) {
                addLineToFramedDisplay(display, target.tokName + " peut " +
                  bouton("!cof-absorber-au-bouclier " + evt.id,
                    "absorber le sort", target)
                );
              }
            } else {
              if (attributeAsBool(target, 'absorberUnCoup')) {
                addLineToFramedDisplay(display, target.tokName + " peut " +
                  bouton("!cof-absorber-au-bouclier " + evt.id,
                    "absorber le coup", target)
                );
              }
            }
          });
        }
      }
    }
    sendChat("", endFramedDisplay(display));
    if (attaquant) {
      cibles.forEach(function(target) {
        if (charAttributeAsBool(target, 'seulContreTous')) {
          displayAttaqueOpportunite(target.token.id, [attaquant], "de riposte", '#ActionsRiposte#');
        } else if (charAttributeAsBool(target, 'riposte')) {
          var attrRipostesDuTour = tokenAttribute(target, 'ripostesDuTour');
          if (attrRipostesDuTour.length > 0) {
            var ripostesDuTour =
              attrRipostesDuTour[0].get('current').split(' ');
            ripostesDuTour = new Set(ripostesDuTour);
            if (ripostesDuTour.has(attaquant.token.id)) return;
            ripostesDuTour = attrRipostesDuTour[0].get('max').split(' ');
            ripostesDuTour = new Set(ripostesDuTour);
            if (ripostesDuTour.has(attaquant.token.id)) return;
          }
          displayAttaqueOpportunite(target.token.id, [attaquant], "de riposte", '#ActionsRiposte#', '--riposte');
        }
      });
    }
  }

  // RD spécifique au type
  function typeRD(perso, dmgType) {
    if (dmgType === undefined || dmgType == 'normal') return 0;
    return charAttributeAsInt(perso, 'RD_' + dmgType, 0);
  }

  function probaSucces(de, seuil, nbreDe) {
    if (nbreDe == 2) {
      var proba1 = probaSucces(de, seuil, 1);
      return 1 - (1 - proba1) * (1 - proba1);
    }
    if (seuil < 2) seuil = 2; // 1 est toujours un échec
    else if (seuil > 20) seuil = 20;
    return ((de - seuil) + 1) / de;
  }

  function nbreDeTestCarac(carac, perso) {
    var typeJet = findObjs({
      _type: 'attribute',
      _characterid: perso.charId,
      name: carac + '_SUP'
    });
    if (typeJet.length === 0) return 1;
    switch (typeJet[0].get('current')) {
      case '@{JETNORMAL}':
        return 1;
      case '@{JETSUP}':
      case '@{JETSUPHERO}':
        return 2;
      default:
        error("Jet inconnu", typeJet[0].get('current'));
    }
    return 1;
  }

  // Meilleure carac parmis 2 pour un save.
  function meilleureCarac(carac1, carac2, personnage, seuil) {
    var bonus1 = bonusTestCarac(carac1, personnage);
    if (carac1 == 'DEX') bonus1 += charAttributeAsInt(personnage, 'reflexesFelins', 0);
    var bonus2 = bonusTestCarac(carac2, personnage);
    if (carac2 == 'DEX') bonus2 += charAttributeAsInt(personnage, 'reflexesFelins', 0);
    var nbrDe1 = nbreDeTestCarac(carac1, personnage);
    var nbrDe2 = nbreDeTestCarac(carac2, personnage);
    var de1 = deTest(personnage, carac1);
    var proba1 = probaSucces(de1, seuil - bonus1, nbrDe1);
    var de2 = deTest(personnage, carac2);
    var proba2 = probaSucces(de2, seuil - bonus2, nbrDe2);
    if (proba2 > proba1) return carac2;
    return carac1;
  }

  //s représente le save, avec une carac, une carac2 optionnelle et un seuil
  //expliquer est une fonction qui prend en argument un string et le publie
  // options peut contenir les champs :
  //   - msgPour : message d'explication à afficher avant le jet
  //   - msgReussite : message à afficher en cas de réussite
  //   - msgRate : message à afficher si l'action rate
  //   - attaquant : le {charId, token} de l'attaquant contre lequel le save se fait (si il y en a un)
  function save(s, target, expliquer, options, evt, afterSave) {
    var bonus = 0;
    if (options.attaquant &&
      charAttributeAsBool(target, 'protectionContreLeMal') &&
      estMauvais(options.attaquant)) {
      var bonusProtectionContreLeMal = getValeurOfEffet(target, 'protectionContreLeMal', 2);
      bonus += bonusProtectionContreLeMal;
      expliquer("Protection contre le mal => +" + bonusProtectionContreLeMal + " au jet de sauvegarde");
    }
    var bonusAttrs = [];
    var carac = s.carac;
    //Cas où le save peut se faire au choix parmis 2 caracs
    if (s.carac2) {
      carac = meilleureCarac(carac, s.carac2, target, s.seuil);
    }
    if (carac == 'DEX') {
      bonusAttrs.push('reflexesFelins');
    }
    testCaracteristique(target, carac, s.seuil, {
        bonusAttrs: bonusAttrs,
        bonus: bonus
      }, evt,
      function(tr) {
        var smsg = " Jet de " + carac + " " + s.seuil;
        if (options.msgPour) smsg += options.msgPour;
        expliquer(smsg);
        smsg = target.token.get('name') + " fait " + tr.texte;
        if (tr.reussite) {
          smsg += " => réussite";
          if (options.msgReussite) smsg += options.msgReussite;
        } else {
          smsg += " => échec";
          if (options.msgRate) smsg += options.msgRate;
        }
        expliquer(smsg);
        afterSave(tr.reussite, tr.texte);
      });
  }

  function partialSave(ps, target, showTotal, dmgDisplay, total, expliquer, evt, afterSave) {
    if (ps.partialSave !== undefined) {
      if ((ps.partialSave.carac == 'CON' || ps.partialSave.carac2 == 'CON') && estNonVivant(target)) {
        expliquer("Les créatures non-vivantes sont immnunisées aux attaques qui demandent un test de constitution");
        afterSave({
          succes: true,
          dmgDisplay: '0',
          total: 0,
          showTotal: false
        });
        return;
      }
      if (target.partialSaveAuto) {
        if (showTotal) dmgDisplay = '(' + dmgDisplay + ')';
        afterSave({
          succes: true,
          dmgDisplay: dmgDisplay + '/2',
          total: Math.ceil(total / 2),
          showTotal: true
        });
        return;
      }
      save(ps.partialSave, target, expliquer, {
          msgPour: " pour réduire les dégâts",
          msgReussite: ", dégâts divisés par 2",
          attaquant: ps.attaquant
        }, evt,
        function(succes, rollText) {
          if (succes) {
            if (showTotal) dmgDisplay = "(" + dmgDisplay + ")";
            dmgDisplay = dmgDisplay + " / 2";
            showTotal = true;
            total = Math.ceil(total / 2);
          } else {}
          afterSave({
            succes: succes,
            dmgDisplay: dmgDisplay,
            total: total,
            showTotal: showTotal
          });
        });
    } else afterSave();
  }

  function applyRDSauf(rds, dmgType, total, display, options) {
    options = options || {};
    var typeTrouve = function(t) {
      return (t == dmgType || options[t]);
    };
    if (total) {
      for (var saufType in rds) {
        var rd = rds[saufType];
        if (rd < 1) break;
        var types = saufType.split('_');
        if (types.find(typeTrouve)) break;
        if (total < rd) {
          display += "-" + total;
          rds[saufType] -= total;
          total = 0;
        } else {
          display += "-" + rd;
          total -= rd;
          rds[saufType] = 0;
        }
      }
    }
    return {
      total: total,
      display: display
    };
  }

  //On a déterminé les DM du type principal(possiblement après save des dmgExtra, maintenant on applique les résistances, puis on ajoute les DM d'autres types
  function dealDamageAfterDmgExtra(target, mainDmgType, dmgTotal, dmgDisplay, showTotal, dmgParType, dmgExtra, crit, options, evt, expliquer, displayRes) {
    if (options.pointsVitaux && dmgTotal > 0) { //dégâts retardés pour une pression mortelle
      var pMortelle = tokenAttribute(target, 'pressionMortelle');
      var dmgPMort = dmgTotal;
      var numberPMort = 1;
      if (pMortelle.length > 0) {
        dmgPMort += pMortelle[0].get('current');
        numberPMort += pMortelle[0].get('max');
      }
      setTokenAttr(target, 'pressionMortelle', dmgPMort, evt, undefined,
        numberPMort);
      dmgTotal = 0;
    }

    if (charAttributeAsBool(target, 'immunite_' + mainDmgType)) {
      if (expliquer) {
        target.tokName = target.tokName || target.token.get('name');
        expliquer(target.tokName + " ne semble pas affecté par le type " + mainDmgType);
      }
      dmgTotal = 0;
      dmgDisplay = '0';
      showTotal = false;
    } else if (target.ignoreRD === undefined) {
      var rdMain = typeRD(target, mainDmgType);
      if (options.vampirise || target.vampirise) {
        rdMain += attributeAsInt(target, 'RD_drain', 0);
      }
      if (target.ignoreMoitieRD) rdMain = parseInt(rdMain / 2);
      if (rdMain > 0 && dmgTotal > 0) {
        dmgTotal -= rdMain;
        if (dmgTotal < 0) {
          rdMain += dmgTotal;
          dmgTotal = 0;
        }
        dmgDisplay += " - " + rdMain;
        showTotal = true;
      }
      var rdElems = 0;
      if (attributeAsBool(target, 'protectionContreLesElements')) {
        rdElems = getValeurOfEffet(target, 'protectionContreLesElements', 1, 'voieDeLaMagieElementaire') * 2;
      }
      if (target.ignoreMoitieRD) rdElems = parseInt(rdElems / 2);
      if (rdElems > 0 && dmgTotal > 0 && estElementaire(mainDmgType)) {
        if (dmgTotal > rdElems) {
          dmgDisplay += ' - ' + rdElems;
          dmgTotal -= rdElems;
          rdElems = 0;
        } else {
          dmgDisplay += ' - ' + dmgTotal;
          rdElems -= dmgTotal;
          dmgTotal = 0;
        }
      }
      var rdSauf = [];
      if (target.attrs === undefined) {
        target.attrs = findObjs({
          _type: 'attribute',
          _characterid: target.charId
        });
      }
      target.attrs.forEach(function(attr) {
        var attrName = attr.get('name');
        if (attrName.startsWith('RD_sauf_')) {
          var rds = parseInt(attr.get('current'));
          if (target.ignoreMoitieRD) rds = parseInt(rds / 2);
          if (isNaN(rds) || rds < 1) return;
          rdSauf[attrName.substr(8)] = rds;
        }
      });
      if (attributeAsBool(target, 'formeDArbre')) {
        rdSauf.feu_tranchant = rdSauf.feu_tranchant || 0;
        if (target.ignoreMoitieRD) rdSauf.feu_tranchant += 5;
        else rdSauf.feu_tranchant += 10;
      }
      var additionalType = {
        magique: options.magique,
        tranchant: options.tranchant,
        percant: options.percant,
        contondant: options.contondant
      };
      var resSauf = applyRDSauf(rdSauf, mainDmgType, dmgTotal, dmgDisplay, additionalType);
      dmgTotal = resSauf.total;
      dmgDisplay = resSauf.display;
      var invulnerable = charAttributeAsBool(target, 'invulnerable');
      var mitigate = function(dmgType, divide, zero) {
        if (!options.sortilege && attributeAsBool(target, 'flou')) {
          divide();
        }
        if (options.attaqueMentale && charAttributeAsBool(target, 'bouclierPsi')) {
          divide();
        }
        if (options.aoe &&
          (attributeAsBool(target, 'protectionDMZone') ||
            attributeAsBool(target, 'protectionDMZone_' + dmgType))) {
          divide();
          expliquer(target.token.get('name') + " est protégé contre les dégâts de zone");
        }
        if (estElementaire(dmgType)) {
          if (invulnerable) {
            divide();
          }
          if (dmgType == 'froid' && attributeAsBool(target, 'masqueMortuaire')) {
            divide();
          }
          if ((dmgType == 'feu' || dmgType == 'acide') && attributeAsBool(target, 'mutationEcaillesRouges')) {
            divide();
          } else if ((dmgType == 'froid' || dmgType == 'electrique') && attributeAsBool(target, 'mutationFourrureViolette')) {
            divide();
          }
        } else {
          if (dmgType == 'poison' || dmgType == 'maladie') {
            if (invulnerable ||
              charAttributeAsBool(target, 'creatureArtificielle') ||
              estNonVivant(target)) {
              zero();
            } else if (attributeAsBool(target, 'mutationSangNoir')) {
              divide();
            }

          } else if (attributeAsBool(target, 'armureMagique')) {
            divide();
          }
        }
      };
      // Damage mitigaters for main damage
      mitigate(mainDmgType,
        function() {
          dmgTotal = Math.ceil(dmgTotal / 2);
          if (dmgExtra) dmgDisplay = "(" + dmgDisplay + ")";
          dmgDisplay += " / 2";
          showTotal = true;
        },
        function() {
          dmgTotal = 0;
        });
    }
    // Other sources of damage
    // First count all other sources of damage, for synchronization
    var count = 0;
    for (var dt in dmgParType) {
      if (charAttributeAsBool(target, 'immunite_' + dt)) {
        if (expliquer) {
          target.tokName = target.tokName || target.token.get('name');
          expliquer(target.tokName + " ne semble pas affecté par le type " + dt);
        }
        delete dmgParType[dt];
      } else
        count += dmgParType[dt].length;
    }
    var dealOneType = function(dmgType) {
      if (dmgType == mainDmgType) {
        count -= dmgParType[dmgType].length;
        if (count === 0) dealDamageAfterOthers(target, crit, options, evt, expliquer, displayRes, dmgTotal, dmgDisplay, showTotal);
        return; //type principal déjà géré
      }
      showTotal = true;
      var dm = 0;
      var typeDisplay = "";
      var typeCount = dmgParType[dmgType].length;
      dmgParType[dmgType].forEach(function(d) {
        partialSave(d, target, false, d.display, d.total, expliquer, evt,
          function(res) {
            if (res) {
              dm += res.total;
              if (typeDisplay === '') typeDisplay = res.dmgDisplay;
              else typeDisplay += "+" + res.dmgDisplay;
            } else {
              dm += d.total;
              if (typeDisplay === '') typeDisplay = d.display;
              else typeDisplay += "+" + d.display;
            }
            typeCount--;
            if (typeCount === 0) {
              if (target.ignoreRD === undefined) {
                var rdl = typeRD(target, dmgType);
                if (target.ignoreMoitieRD) rdl = parseInt(rdl / 2);
                if (rdl > 0 && dm > 0) {
                  dm -= rdl;
                  if (dm < 0) {
                    rdl += dm;
                    dm = 0;
                  }
                  typeDisplay += "-" + rdl;
                }
                if (rdElems > 0 && dm > 0 && estElementaire(dmgType)) {
                  if (dm > rdElems) {
                    typeDisplay += ' - ' + rdElems;
                    dm -= rdElems;
                    rdElems = 0;
                  } else {
                    typeDisplay += ' - ' + dm;
                    rdElems -= dm;
                    dm = 0;
                  }
                }
                var additionalType = {
                  magique: options.magique
                };
                var resSauf = applyRDSauf(rdSauf, dmgType, dm, typeDisplay, additionalType);
                dm = resSauf.total;
                typeDisplay = resSauf.display;
                mitigate(dmgType,
                  function() {
                    dm = Math.ceil(dm / 2);
                    if (dmgParType[dmgType].length > 1) typeDisplay = "(" + typeDisplay + ")";
                    typeDisplay += " / 2";
                  },
                  function() {
                    dm = 0;
                  });
                dmgTotal += dm;
                dmgDisplay += "+" + typeDisplay;
              }
            }
            count--;
            if (count === 0) dealDamageAfterOthers(target, crit, options, evt, expliquer, displayRes, dmgTotal, dmgDisplay, showTotal);
          });
      });
    };
    if (count > 0) {
      for (var dmgType in dmgParType) {
        dealOneType(dmgType);
      }
    } else {
      return dealDamageAfterOthers(target, crit, options, evt, expliquer, displayRes, dmgTotal, dmgDisplay, showTotal);
    }
  }

  //Appelé quand on met à 0 PV
  function mort(personnage, expliquer, evt) {
    if (charAttributeAsBool(personnage, 'exsangue') && !attributeAsBool(personnage, 'etatExsangue')) {
      var msg;
      if (expliquer) {
        personnage.tokName = personnage.tokName || personnage.token.get('name');
        expliquer(personnage.tokName + " continue à agir malgré son état");
      } else msg = "continue à agir malgré son état";
      setTokenAttr(personnage, 'etatExsangue', true, evt, msg);
      return;
    }
    setState(personnage, 'mort', true, evt);
    var targetPos = {
      x: personnage.token.get('left'),
      y: personnage.token.get('top')
    };
    spawnFxBetweenPoints(targetPos, {
      x: 400,
      y: 400
    }, "splatter-blood");
  }

  function dmgNaturel(options) {
    if (options.nature) return true;
    if (options.artificiel) return false;
    var attaquant = options.attaquant;
    if (attaquant === undefined) return false;
    if (estAnimal(attaquant)) return true;
    if (charAttributeAsBool(attaquant, 'insecte')) return true;
    var attr = findObjs({
      _type: 'attribute',
      _characterid: attaquant.charId,
    });
    var attrProfile = attr.filter(function(a) {
      return a.get('name').toUpperCase() == 'PROFIL';
    });
    if (attrProfile.length > 0) {
      switch (attrProfile[0].get('current').trim().toLowerCase()) {
        case 'insecte':
          return true;
      }
    }
    var attrRace = attr.filter(function(a) {
      return a.get('name').toUpperCase() == 'RACE';
    });
    if (attrRace.length === 0) return false;
    var charRace = attrRace[0].get('current').trim().toLowerCase();
    switch (charRace) {
      case 'insecte':
      case 'ankheg':
      case 'araignée':
      case 'araignee':
      case 'guêpe':
      case 'libellule':
      case 'scarabée':
      case 'scorpion':
      case 'strige':
        return true;
      default:
        return false;
    }
  }

  function testBlessureGrave(target, dmgTotal, expliquer, evt) {
    target.tokName = target.tokName || target.token.get('name');
    if (stateCOF.options.regles.val.blessures_graves.val && estPJ(target) && (dmgTotal == 'mort' ||
        dmgTotal >
        (ficheAttributeAsInt(target, 'NIVEAU', 1) +
          ficheAttributeAsInt(target, 'CONSTITUTION', 10)))) {
      var pr = pointsDeRecuperation(target);
      if (pr.current > 0) {
        expliquer("Les dégâts sont si importants que " + target.tokName + " perd 1 PR");
        enleverPointDeRecuperation(target, evt);
      } else if (getState(target, 'blessé')) {
        if (getState(target, 'mort')) {
          expliquer("Avec la blessure grave, c'est vraiment la fin, " + target.tokName + " ne se relèvera plus...");
        } else {
          expliquer("Les dégâts sont trop importants, et " + target.tokName + " s'effondre");
          mort(target, expliquer, evt);
        }
      } else {
        setState(target, 'blessé', true, evt);
        expliquer("Les dégâts occasionnent une blessure grave !");
      }
    }
  }

  function enlevePVStatueDeBois(perso, pvPerdus, evt) {
    if (pvPerdus <= 0) return;
    var attrs = tokenAttribute(perso, 'statueDeBoisValeur');
    if (attrs.length === 0) return;
    var cur = parseInt(attrs[0].get('current'));
    var attrsB = tokenAttribute(perso, 'statueDeBois');
    if (attrsB.length === 0) {
      error("Attribut pour l'effet status de bois introuvable", cur);
      evt.deletedAttributes = evt.deletedAttributes || [];
      evt.deletedAttributes.push(attrs[0]);
      attrs[0].remove();
    }
    if (isNaN(cur)) {
      finDEffet(attrsB[0], 'statueDeBois', attrsB[0].get('name'), perso.charId, evt);
      return;
    }
    var newCur = cur - pvPerdus;
    if (newCur <= 0) {
      finDEffet(attrsB[0], 'statueDeBois', attrsB[0].get('name'), perso.charId, evt);
      return;
    }
    evt.attributes = evt.attributes || [];
    evt.attributes.push({
      attribute: attrs[0],
      current: cur,
      max: attrs[0].get('max')
    });
    attrs[0].set('current', newCur);
  }

  function dealDamageAfterOthers(target, crit, options, evt, expliquer, displayRes, dmgTotal, dmgDisplay, showTotal) {
    var charId = target.charId;
    var token = target.token;
    // Now do some dmg mitigation rolls, if necessary
    if ((options.distance || options.aoe) &&
      attributeAsBool(target, 'aCouvert')) {
      if (showTotal) dmgDisplay = "(" + dmgDisplay + ")";
      dmgDisplay += " / 2";
      dmgTotal = Math.ceil(dmgTotal / 2);
      showTotal = true;
    }
    partialSave(options, target, showTotal, dmgDisplay, dmgTotal,
      expliquer, evt,
      function(saveResult) {
        if (saveResult) {
          dmgTotal = saveResult.total;
          dmgDisplay = saveResult.dmgDisplay;
          showTotal = saveResult.showTotal;
        }
        var rd = ficheAttributeAsInt(target, 'RDS', 0);
        if (attributeAsBool(target, 'statueDeBois')) rd += 10;
        if (attributeAsBool(target, 'mutationSilhouetteMassive')) rd += 3;
        if (crit) rd += charAttributeAsInt(target, 'RD_critique', 0);
        if (options.tranchant) rd += charAttributeAsInt(target, 'RD_tranchant', 0);
        if (options.percant) rd += charAttributeAsInt(target, 'RD_percant', 0);
        if (options.contondant) rd += charAttributeAsInt(target, 'RD_contondant', 0);
        if (options.distance) {
          var piqures = charAttributeAsInt(target, 'puquresDInsecte', 0);
          if (piqures > 0 && ficheAttributeAsBool(target, 'DEFARMUREON') && ficheAttributeAsInt(target, 'DEFARMURE', 0) > 5) rd += piqures;
        }
        if (attributeAsBool(target, 'masqueMortuaire')) rd += 2;
        var rdNature = charAttributeAsInt(target, 'RD_nature', 0);
        if (rdNature > 0 && dmgNaturel(options)) rd += rdNature;
        if (target.defautCuirasse) rd = 0;
        if (options.intercepter) rd += options.intercepter;
        if (target.extraRD) {
          rd += target.extraRD;
          expliquer(target.tokName + " dévie le coup sur son armure");
        }
        if (target.ignoreRD) rd = 0;
        else if (target.ignoreMoitieRD) rd = parseInt(rd / 2);
        if (rd > 0) {
          if (showTotal) dmgDisplay = "(" + dmgDisplay + ") - " + rd;
          else {
            dmgDisplay += " - " + rd;
            showTotal = true;
          }
        }
        dmgTotal -= rd;
        if (options.metal && attributeAsBool(target, 'magnetisme')) {
          if (showTotal) dmgDisplay = "(" + dmgDisplay + ") / 2";
          else dmgDisplay += " / 2";
          showTotal = true;
          dmgTotal = Math.ceil(dmgTotal / 2);
        }
        if (dmgTotal < stateCOF.options.regles.val.dm_minimum.val)
          dmgTotal = stateCOF.options.regles.val.dm_minimum.val;
        if (options.divise) {
          dmgTotal = Math.ceil(dmgTotal / options.divise);
          dmgDisplay = "(" + dmgDisplay + ")/" + options.divise;
          showTotal = true;
        }
        // compute effect on target
        var bar1 = parseInt(token.get('bar1_value'));
        var pvmax = parseInt(token.get('bar1_max'));
        if (isNaN(bar1)) {
          error("Pas de points de vie chez la cible", token);
          bar1 = 0;
          pvmax = 0;
        } else if (isNaN(pvmax)) {
          pvmax = bar1;
          token.set("bar1_max", bar1);
        }
        var manaAttr = findObjs({
          _type: 'attribute',
          _characterid: charId,
          name: 'PM'
        });
        var hasMana = false;
        if (manaAttr.length > 0) {
          var manaMax = parseInt(manaAttr[0].get('max'));
          hasMana = !isNaN(manaMax) && manaMax > 0;
        }
        var tempDmg = 0;
        if (hasMana) {
          tempDmg = attributeAsInt(target, 'DMTEMP', 0);
        } else {
          tempDmg = parseInt(token.get("bar2_value"));
          if (isNaN(tempDmg)) {
            if (target.tempDmg) { //then try to set bar2 correctly
              if (token.get("bar1_link") === '') {
                token.set("bar2_max", pvmax);
              } else {
                var tmpHitAttr =
                  findObjs({
                    _type: "attribute",
                    _characterid: charId,
                    name: "DMTEMP"
                  });
                var dmTemp;
                if (tmpHitAttr.length === 0) {
                  dmTemp =
                    createObj("attribute", {
                      characterid: charId,
                      name: "DMTEMP",
                      current: 0,
                      max: pvmax
                    });
                } else {
                  dmTemp = tmpHitAttr[0];
                }
                token.set("bar2_max", pvmax);
                token.set("bar2_link", dmTemp.id);
              }
            }
            tempDmg = 0;
          }
        }
        if (!options.aoe && charAttributeAsBool(target, 'ciblesMultiples')) {
          dmgTotal = 1;
          expliquer("La nuée est constituée de très nombreuses cibles, l'attaque ne lui fait qu'1 DM");
        }
        var pvPerdus = dmgTotal;
        if (target.tempDmg) {
          var oldTempDmg = tempDmg;
          tempDmg += dmgTotal;
          if (tempDmg > pvmax) {
            pvPerdus -= tempDmg - pvmax;
            tempDmg = pvmax;
          }
          if (hasMana) {
            setTokenAttr(target, 'DMTEMP', tempDmg, evt);
          } else {
            updateCurrentBar(token, 2, tempDmg, evt);
          }
          enlevePVStatueDeBois(target, pvPerdus, evt);
        } else {
          if (bar1 > 0 && bar1 <= dmgTotal &&
            charAttributeAsBool(target, 'instinctDeSurvieHumain')) {
            dmgTotal = dmgTotal / 2;
            if (dmgTotal < 1) dmgTotal = 1;
            dmgDisplay += "/2";
            showTotal = true;
            expliquer("L'instinct de survie aide à réduire une attaque fatale");
          }
          pvPerdus = dmgTotal;
          bar1 = bar1 - dmgTotal;
          if ((crit || bar1 < pvmax / 2) &&
            charAttributeAsBool(target, 'peutEnrager') &&
            !attributeAsBool(target, 'enragé')) {
            setTokenAttr(target, 'enragé', true, evt);
            expliquer(target.tokName + " devient enragé" + eForFemale(target.charId) + ".");
            finDEffetDeNom(target, 'peur', evt);
            finDEffetDeNom(target, 'peurEtourdi', evt);
            setState(target, 'apeure', false, evt);
          }
          if (bar1 <= 0) {
            var attrFDA = tokenAttribute(target, 'formeDArbre');
            if (attrFDA.length > 0) {
              var effetFDA = finDEffet(attrFDA[0], 'formeDArbre', attrFDA[0].get('name'), charId, evt, {
                pageId: token.get('pageid')
              });
              if (effetFDA && effetFDA.newToken) {
                token = effetFDA.newToken;
                target.token = token;
              }
              var newBar1 = parseInt(token.get('bar1_value'));
              if (isNaN(newBar1) || newBar1 < 0) {
                error("Points de vie de l'ancien token incorrects", newBar1);
              } else {
                bar1 += newBar1;
              }
            }
          }
          if (bar1 <= 0) {
            if (charAttributeAsBool(target, 'sergent') &&
              !attributeAsBool(target, 'sergentUtilise')) {
              expliquer(token.get('name') + " évite l'attaque in-extremis");
              setTokenAttr(target, 'sergentUtilise', true, evt);
            } else {
              testBlessureGrave(target, dmgTotal, expliquer, evt);
              updateCurrentBar(token, 1, 0, evt);
              pvPerdus -= bar1;
              if (charAttributeAsBool(target, 'baroudHonneur')) {
                expliquer(token.get('name') + " devrait être mort, mais il continue à se battre !");
                setTokenAttr(target, 'baroudHonneurActif', true, evt);
              } else if (attributeAsBool(target, 'enragé')) {
                if (!attributeAsBool(target, 'agitAZeroPV')) {
                  expliquer(token.get('name') + " devrait être mort, mais il continue à se battre !");
                  setTokenAttr(target, 'agitAZeroPV', 1, evt, undefined, getInit());
                }
              } else {
                var defierLaMort = charAttributeAsInt(target, 'defierLaMort', 0);
                if (defierLaMort > 0) {
                  save({
                      carac: 'CON',
                      seuil: defierLaMort
                    }, target, expliquer, {
                      msgPour: " pour défier la mort",
                      msgReussite: ", conserve 1 PV"
                    }, evt,
                    function(reussite, rollText) {
                      if (reussite) {
                        updateCurrentBar(token, 1, 1, evt);
                        bar1 = 1;
                        pvPerdus--;
                        setTokenAttr(target, 'defierLaMort', defierLaMort + 10, evt);
                        enlevePVStatueDeBois(target, pvPerdus, evt);
                      } else {
                        mort(target, expliquer, evt);
                        testBlessureGrave(target, 'mort', expliquer, evt);
                      }
                      if (bar1 > 0 && tempDmg >= bar1) { //assomé
                        setState(target, 'assome', true, evt);
                      }
                      if (showTotal) dmgDisplay += " = " + dmgTotal;
                      if (displayRes === undefined) return dmgDisplay;
                      displayRes(dmgDisplay, dmgTotal);
                    });
                  if (displayRes === undefined) return dmgDisplay;
                  return;
                } else {
                  mort(target, expliquer, evt);
                  testBlessureGrave(target, 'mort', expliquer, evt);
                }
              }
            }
          } else { // bar1>0
            testBlessureGrave(target, dmgTotal, expliquer, evt);
            updateCurrentBar(token, 1, bar1, evt);
            enlevePVStatueDeBois(target, pvPerdus, evt);
          }
        }
        if (bar1 > 0 && tempDmg >= bar1) { //assomé
          setState(target, 'assome', true, evt);
        }
        if (showTotal) dmgDisplay += " = " + dmgTotal;
        if (displayRes === undefined) return dmgDisplay;
        displayRes(dmgDisplay, dmgTotal);
      });
    return dmgDisplay;
  }

  function buildinline(inlineroll, dmgType, magique) {
    var InlineColorOverride = "";
    var values = [];
    var critRoll = false;
    var failRoll = false;
    var critCheck = false;
    var failCheck = false;
    var highRoll = false;
    var lowRoll = false;
    var noHighlight = false;

    inlineroll.results.rolls.forEach(function(roll) {
      var result = processRoll(roll, critRoll, failRoll, highRoll, lowRoll, noHighlight);
      if (result.value.toString().indexOf("critsuccess") != -1) critCheck = true;
      if (result.value.toString().indexOf("critfail") != -1) failCheck = true;
      values.push(result.value);
      critRoll = result.critRoll;
      failRoll = result.failRoll;
      highRoll = result.highRoll;
      lowRoll = result.lowRoll;
      noHighlight = result.noHighlight;
    });

    // Overrides the default coloring of the inline rolls...
    switch (dmgType) {
      case 'normal':
      case 'maladie':
        if (magique)
          InlineColorOverride = ' background-color: #FFFFFF; color: #534200;';
        else
          InlineColorOverride = ' background-color: #F1E6DA; color: #000;';
        break;
      case 'feu':
        InlineColorOverride = ' background-color: #FF3011; color: #440000;';
        break;
      case 'froid':
        InlineColorOverride = ' background-color: #77FFFF; color: #004444;';
        break;
      case 'acide':
        InlineColorOverride = ' background-color: #80BF40; color: #020401;';
        break;
      case 'sonique':
        InlineColorOverride = ' background-color: #E6CCFF; color: #001144;';
        break;
      case 'electrique':
        InlineColorOverride = ' background-color: #FFFF80; color: #222200;';
        break;
      case 'poison':
        InlineColorOverride = ' background-color: #558000; color: #DDAFFF;';
        break;
      default:
        if (critCheck && failCheck) {
          InlineColorOverride = ' background-color: #8FA4D4; color: #061539;';
        } else if (critCheck && !failCheck) {
          InlineColorOverride = ' background-color: #88CC88; color: #004400;';
        } else if (!critCheck && failCheck) {
          InlineColorOverride = ' background-color: #FFAAAA; color: #660000;';
        } else {
          InlineColorOverride = ' background-color: #FFFEA2; color: #000;';
        }
    }
    var rollOut = '<span style="display: inline-block; border-radius: 5px; padding: 0 4px; ' + InlineColorOverride + '" title="' + inlineroll.expression + ' = ' + values.join("");
    rollOut += '" class="a inlinerollresult showtip tipsy-n';
    rollOut += (critCheck && failCheck) ? ' importantroll' : (critCheck ? ' fullcrit' : (failCheck ? ' fullfail' : ''));
    rollOut += '">' + inlineroll.results.total + '</span>';
    return rollOut;
  }

  function processRoll(roll, critRoll, failRoll, highRoll, lowRoll, noHighlight) {
    switch (roll.type) {
      case 'C':
        return {
          value: " " + roll.text + " "
        };
      case 'L':
        if (roll.text.indexOf("HR") != -1) highRoll = parseInt(roll.text.substring(2));
        else highRoll = false;
        if (roll.text.indexOf("LR") != -1) lowRoll = parseInt(roll.text.substring(2));
        else lowRoll = false;
        if (roll.text.indexOf("NH") != -1) {
          // Blocks highlight on an individual roll...
          noHighlight = true;
        }
        // Remove inline tags to reduce clutter...
        roll.text = roll.text.replace(/HR(\d+)/g, "");
        roll.text = roll.text.replace(/LR(\d+)/g, "");
        roll.text = roll.text.replace(/NH/g, "");
        if (roll.text !== "") roll.text = " [" + roll.text + "] ";
        return {
          value: roll.text,
          highRoll: highRoll,
          lowRoll: lowRoll,
          noHighlight: noHighlight
        };
      case 'M':
        roll.expr = roll.expr.toString().replace(/\+/g, " + ");
        return {
          value: roll.expr
        };
      case 'R':
        var rollValues = [];
        roll.results.forEach(function(result) {
          if (result.tableItem !== undefined) {
            rollValues.push(result.tableItem.name);
          } else {
            // Turn off highlighting if true...
            if (noHighlight) {
              critRoll = false;
              failRoll = false;
            } else {
              if (_.has(roll, 'mods') && _.has(roll.mods, 'customCrit')) {
                switch (roll.mods.customCrit[0].comp) {
                  case '=':
                  case '==':
                    critRoll = (result.v == roll.mods.customCrit[0].point);
                    break;
                  case '>=':
                  case '=>':
                  case '>':
                    critRoll = (result.v >= roll.mods.customCrit[0].point);
                    break;
                  default:
                    critRoll =
                      (highRoll !== false && result.v >= highRoll ||
                        result.v === roll.sides);
                }
              } else {
                critRoll =
                  (highRoll !== false && result.v >= highRoll ||
                    result.v === roll.sides);
              }
              failRoll =
                (!critRoll &&
                  (lowRoll !== false && result.v <= lowRoll || result.v === 1));
            }
            var rv = "<span class='basicdiceroll" + (critRoll ? ' critsuccess' : (failRoll ? ' critfail' : '')) + "'>" + result.v + "</span>";
            rollValues.push(rv);
          }
        });
        var separator = ' + ';
        if (roll.mods && roll.mods.keep) separator = ' , ';
        return {
          value: "(" + rollValues.join(separator) + ")",
          critRoll: critRoll,
          failRoll: failRoll,
          highRoll: highRoll,
          lowRoll: lowRoll,
          noHighlight: noHighlight
        };
      case 'G':
        var grollVal = [];
        roll.rolls.forEach(function(groll) {
          groll.forEach(function(groll2) {
            var result = processRoll(groll2, highRoll, lowRoll, noHighlight);
            grollVal.push(result.value);
            critRoll = critRoll || result.critRoll;
            failRoll = failRoll || result.failRoll;
            highRoll = highRoll || result.highRoll;
            lowRoll = lowRoll || result.lowRoll;
            noHighlight = noHighlight || result.noHighlight;
          });
        });
        return {
          value: "{" + grollVal.join(" ") + "}",
          critRoll: critRoll,
          failRoll: failRoll,
          highRoll: highRoll,
          lowRoll: lowRoll,
          noHighlight: noHighlight
        };
    }
  }

  function getBrightness(hex) {
    hex = hex.replace('#', '');
    var c_r = hexDec(hex.substr(0, 2));
    var c_g = hexDec(hex.substr(2, 2));
    var c_b = hexDec(hex.substr(4, 2));
    return ((c_r * 299) + (c_g * 587) + (c_b * 114)) / 1000;
  }

  function hexDec(hex_string) {
    hex_string = (hex_string + '').replace(/[^a-f0-9]/gi, '');
    return parseInt(hex_string, 16);
  }

  function addOrigin(name, toEvaluate) {
    return toEvaluate.replace(/@{/g, "@{" + name + "|");
  }

  function getPortee(charId, weaponPrefix) {
    var res = getAttrByName(charId, weaponPrefix + "armeportee");
    if (res === undefined) return 0;
    res = parseInt(res);
    if (isNaN(res) || res <= 0) return 0;
    return res;
  }

  function tokenCenter(tok) {
    return [tok.get('left'), tok.get('top')];
  }

  // Retourne le diamètre d'un disque inscrit dans un carré de surface
  // équivalente à celle du token
  function tokenSizeAsCircle(token) {
    var surface = token.get('width') * token.get('height');
    return Math.sqrt(surface);
  }

  // if token is bigger than thresh reduce the distance by that size
  function tokenSize(tok, thresh) {
    var size = (tok.get('width') + tok.get('height')) / 2;
    if (size > thresh) return ((size - thresh) / 2);
    return 0;
  }


  function malusDistance(perso1, tok2, distance, portee, pageId, explications, ignoreObstacles) {
    if (distance === 0) return 0;
    var tok1 = perso1.token;
    var mPortee = (distance <= portee) ? 0 : (Math.ceil(5 * (distance - portee) / portee));
    if (mPortee > 0) {
      explications.push("Distance > " + portee + " m => -" + mPortee + " en Attaque");
    }
    if (ignoreObstacles || charAttributeAsBool(perso1, 'joliCoup'))
      return mPortee;
    // Now determine if any token is between tok1 and tok2
    var allToks =
      findObjs({
        _type: "graphic",
        _pageid: pageId,
        _subtype: "token",
        layer: "objects"
      });
    var mObstacle = 0;
    var pt1 = tokenCenter(tok1);
    var pt2 = tokenCenter(tok2);
    var distance_pix = VecMath.length(VecMath.vec(pt1, pt2));
    var liste_obstacles = [];
    allToks.forEach(function(obj) {
      if (obj.id == tok1.id || obj.id == tok2.id) return;
      var objCharId = obj.get('represents');
      var perso = {
        token: obj,
        charId: objCharId
      };
      if (objCharId !== '' && (getState(perso, 'mort') ||
          getState(perso, 'assome') || getState(perso, 'endormi') ||
          attributeAsBool(perso, 'intangible')))
        return;
      var pt = tokenCenter(obj);
      var obj_dist = VecMath.length(VecMath.vec(pt1, pt));
      if (obj_dist > distance_pix) return;
      obj_dist = VecMath.length(VecMath.vec(pt2, pt));
      if (obj_dist > distance_pix) return;
      var distToTrajectory = VecMath.ptSegDist(pt, pt1, pt2);
      // On modélise le token comme un disque
      var rayonObj = tokenSizeAsCircle(obj) / 2;
      if (distToTrajectory > rayonObj) return;
      liste_obstacles.push(obj.get("name"));
      // On calcule un malus proportionnel à l'arc à traverser
      // Pour l'instant, malus = 1 si distance = PIX_PER_UNIT
      var longueurArc = 2 * Math.sqrt(rayonObj * rayonObj - distToTrajectory * distToTrajectory);
      var mToken = longueurArc / PIX_PER_UNIT;
      //malus plus important si l'obstacle est au contact de la cible
      if (distanceCombat(tok2, obj, pageId) === 0) mToken *= 5;
      else mToken *= 3;
      mObstacle += mToken;
    });
    // On ajuste aussi en fonction de la taille de la cible
    mObstacle = mObstacle / (tokenSizeAsCircle(tok2) / PIX_PER_UNIT);
    if (mObstacle > 5) mObstacle = 5;
    else mObstacle = Math.round(mObstacle);
    var res = mPortee + mObstacle;
    if (mObstacle > 0) {
      log("Obstacle" + ((mObstacle > 1) ? "s" : "") + " trouvé : " + liste_obstacles.join(', '));
      explications.push('Obstacle' + ((mObstacle > 1) ? 's' : '') + ' sur le trajet => -' + mObstacle + ' en Attaque<br /><span style="font-size: 0.8em; color: #666;">' + liste_obstacles.join(', ') + '</span>');
    }
    return res;
  }

  // Returns all attributes in attrs, with name name or starting with name_
  function allAttributesNamed(attrs, name) {
    var reg = new RegExp("^" + name + "($|_|\\()");
    return attrs.filter(function(obj) {
      var attrName = obj.get('name');
      return reg.test(attrName);
    });
  }

  //Met tous les attributs avec le nom au max
  function resetAttr(attrs, attrName, evt, msg) {
    allAttributesNamed(attrs, attrName).forEach(function(att) {
      var vm = parseInt(att.get("max"));
      if (!isNaN(vm)) {
        var vc = parseInt(att.get("current"));
        if (vc != vm) {
          evt.attributes.push({
            attribute: att,
            current: vc
          });
          att.set("current", vm);
          if (msg) {
            var charId = att.get('characterid');
            var character = getObj('character', charId);
            var name = character.get('name');
            sendChar(charId, '/w "' + name + '" ' + msg);
          }
        }
      }
    });
  }

  // Fait foo sur tous les tokens représentant charId, ayant l'effet donné, et correspondant au nom d'attribut. Pour le cas où le token doit être lié au personnage, on ne prend qu'un seul token, sauf si les options indiquent autrement (soit option.tousLesTokens, soit une fonction options.filterAffected)
  // Ne fonctionne correctement que pour les attributs sans _
  function iterTokensOfAttribute(charId, pageId, attrName, attrNameComplet, foo, options) {
    options = options || {};
    var total = 1; //Nombre de tokens affectés, pour gérer l'asynchronie si besoin
    if (attrNameComplet == attrName) { //token lié au character
      var tokens;
      if (pageId) {
        tokens =
          findObjs({
            _type: 'graphic',
            _subtype: 'token',
            _pageid: pageId,
            layer: 'objects',
            represents: charId
          });
      }
      if (tokens === undefined ||
        (tokens.length === 0 && !options.onlyOnPage)) {
        tokens =
          findObjs({
            _type: 'graphic',
            _subtype: 'token',
            layer: 'objects',
            represents: charId
          });
        tokens = tokens.filter(function(tok) {
          if (tok.get('bar1_link') === '') return false;
          var pid = tok.get('pageid');
          var page = getObj('page', pid);
          if (page) {
            if (page.get('archived')) return false;
            return true;
          }
          return false;
        });
      }
      if (tokens.length === 0) {
        if (options.possiblementAbsent) return;
        log("Pas de token pour un personnage");
        log(charId);
        log(attrNameComplet);
        return;
      }
      if (options.tousLesTokens) {
        tokens.forEach(function(tok) {
          foo(tok, tokens.length);
        });
      } else if (options.filterAffected) {
        total = tokens.length;
        tokens.forEach(function(tok) {
          if (options.filterAffected(tok)) foo(tok, total);
        });
      } else foo(tokens[0], 1);
    } else { //token non lié au character
      var tokenName = attrNameComplet.substring(attrNameComplet.indexOf('_') + 1);
      var tNames;
      if (pageId) {
        tNames =
          findObjs({
            _type: 'graphic',
            _subtype: 'token',
            _pageid: pageId,
            layer: 'objects',
            represents: charId,
            name: tokenName,
            bar1_link: ''
          });
      }
      if (tNames === undefined || (tNames.length === 0 && !options.onlyOnPage)) {
        tNames =
          findObjs({
            _type: 'graphic',
            _subtype: 'token',
            represents: charId,
            name: tokenName,
            layer: 'objects',
            bar1_link: ''
          });
        tNames = tNames.filter(function(tok) {
          var pid = tok.get('pageid');
          var page = getObj('page', pid);
          if (page) {
            if (page.get('archived')) return false;
            return true;
          }
          return false;
        });
      }
      total = tNames.length;
      if (total > 1) {
        var character = getObj('character', charId);
        var charName = "d'id " + charId;
        if (character) charName = character.get('name');
        error("Attention, il y a plusieurs tokens nommés " + tokenName + ", instances du personnage " + charName, total);
      }
      tNames.forEach(function(tok) {
        foo(tok, total);
      });
    }
  }

  function sortirDuCombat() {
    if (!stateCOF.combat) {
      log("Pas en combat");
      sendChat("GM", "/w GM Le combat est déjà terminé");
      return;
    }
    sendChat("GM", "Le combat est terminé");
    var evt = {
      type: 'fin_combat',
      initiativepage: Campaign().get('initiativepage'),
      turnorder: Campaign().get('turnorder'),
      attributes: [],
      combat: true,
      tour: stateCOF.tour,
      init: stateCOF.init,
      deletedAttributes: []
    };
    stateCOF.combat = false;
    setActiveToken(undefined, evt);
    Campaign().set('initiativepage', false);
    var attrs = findObjs({
      _type: 'attribute'
    });
    // Fin des effets qui durent pour le combat
    attrs = removeAllAttributes('soinsDeGroupe', evt, attrs);
    attrs = removeAllAttributes('secondSouffle', evt, attrs);
    attrs = removeAllAttributes('sergentUtilise', evt, attrs);
    attrs = removeAllAttributes('enflamme', evt, attrs);
    attrs = removeAllAttributes('protegerUnAllie', evt, attrs);
    attrs = removeAllAttributes('protegePar', evt, attrs);
    attrs = removeAllAttributes('intercepter', evt, attrs);
    attrs = removeAllAttributes('interposer', evt, attrs);
    attrs = removeAllAttributes('defenseTotale', evt, attrs);
    attrs = removeAllAttributes('dureeStrangulation', evt, attrs);
    attrs = removeAllAttributes('defautDansLaCuirasse', evt, attrs);
    attrs = removeAllAttributes('postureDeCombat', evt, attrs);
    attrs = removeAllAttributes('dedouble', evt, attrs);
    attrs = removeAllAttributes('limiteParCombat', evt, attrs);
    attrs = removeAllAttributes('armeSecreteBardeUtilisee', evt, attrs);
    attrs = removeAllAttributes('attaqueMalgreMenace', evt, attrs);
    attrs = removeAllAttributes('limiteApplicationManoeuvre', evt, attrs);
    // Autres attributs
    // Remettre le pacifisme au max
    resetAttr(attrs, 'pacifisme', evt, "retrouve son pacifisme");
    // Remettre le traquenard à 1
    resetAttr(attrs, 'traquenard', evt);
    // Tout le monde recharge ses armes après un combat, non ?
    resetAttr(attrs, 'charge', evt, "recharge ses armes");
    // Et on récupère les munitions récupérables
    resetAttr(attrs, 'munition', evt, "récupère ses munitions");
    // Remettre défier la mort à 10
    resetAttr(attrs, 'defierLaMort', evt);
    // Recharger les runes d'énergie
    resetAttr(attrs, 'runeDEnergie', evt);
    resetAttr(attrs, 'runeDeProtection', evt);
    resetAttr(attrs, 'runeDePuissance', evt);
    // Remettre l'esquive fatale à 1
    resetAttr(attrs, 'esquiveFatale', evt);
    resetAttr(attrs, 'attaqueEnTraitre', evt);
    // Réinitialiser le kiai
    resetAttr(attrs, 'kiai', evt);
    // Pour frappe du vide, on rengaine l'arme, cela remet aussi l'attribut
    allAttributesNamed(attrs, 'frappeDuVide').forEach(function(attr) {
      var fdvCharId = attr.get('characterid');
      if (fdvCharId === undefined || fdvCharId === '') {
        error("Attribut sans personnage associé", attr);
        return;
      }
      iterTokensOfAttribute(fdvCharId, stateCOF.combat_pageid,
        'frappeDuVide', attr.get('name'),
        function(tok) {
          var perso = {
            charId: fdvCharId,
            token: tok
          };
          degainerArme(perso, '', evt);
        });
    });
    // On remet en main l'arme par défaut si elle est précisée
    allAttributesNamed(attrs, 'armeParDefaut').forEach(function(attr) {
      var apdCharId = attr.get('characterid');
      if (apdCharId === undefined || apdCharId === '') {
        error("Attribut sans personnage associé", attr);
        return;
      }
      iterTokensOfAttribute(apdCharId, stateCOF.combat_pageid,
        'armeParDefaut', attr.get('name'),
        function(tok) {
          var perso = {
            charId: apdCharId,
            token: tok
          };
          degainerArme(perso, attr.get('current'), evt);
        });
    });
    //Effet de ignorerLaDouleur
    var ilds = allAttributesNamed(attrs, 'ignorerLaDouleur');
    ilds.forEach(function(ild) {
      var douleur = parseInt(ild.get('current'));
      if (isNaN(douleur)) {
        error("La douleur ignorée n'est pas un nombre", douleur);
        return;
      }
      var charId = ild.get('characterid');
      if (charId === undefined || charId === '') {
        error("Attribut sans personnage", ild);
        return;
      }
      var ildName = ild.get('name');
      if (ildName == 'ignorerLaDouleur') {
        var pvAttr = findObjs({
          _type: 'attribute',
          _characterid: charId,
          name: 'PV'
        }, {
          caseInsensitive: true
        });
        if (getAttrByName(charId, 'type_personnage') == 'PNJ') {
          pvAttr = findObjs({
            _type: 'attribute',
            _characterid: charId,
            name: 'pnj_pv'
          }, {
            caseInsensitive: true
          });
        }
        if (pvAttr.length === 0) {
          error("Personnage sans PV ", charId);
          return;
        }
        pvAttr = pvAttr[0];
        var pv = parseInt(pvAttr.get('current'));
        if (isNaN(pv)) {
          error("PV mal formés ", pvAttr);
          return;
        }
        evt.attributes.push({
          attribute: pvAttr,
          current: pv
        });
        var newPv = pv - douleur;
        if (newPv < 0) newPv = 0;
        pvAttr.set('current', newPv);
        if (pv > 0 && newPv === 0) {
          sendChar(charId, "s'écroule. Il semble sans vie. La douleur qu'il avait ignorée l'a finalement rattrapé...");
        } else {
          var tempDmg = attributeAsInt(charId, 'DMTEMP', 0);
          if (pv > tempDmg && newPv <= tempDmg) {
            sendChar(charId, "s'écroule, assomé. La douleur qu'il avait ignorée l'a finalement rattrapé...");
          } else {
            sendChar(charId, "subit le contrecoup de la douleur qu'il avait ignorée");
          }
        }
      } else { // ignorer la douleur d'un token 
        var tokName = ildName.substring(ildName.indexOf('_') + 1);
        var tokensIld = findObjs({
          _type: 'graphic',
          _subtype: 'token',
          represents: charId,
          name: tokName
        });
        if (tokensIld.length === 0) {
          error("Pas de token nommé " + tokName + " qui aurait ignoré la douleur", ild);
          return;
        }
        if (tokensIld.length > 1) {
          sendChar(charId, "a plusieurs tokens nommés " + tokName + ". Un seul d'entre eux subira l'effet d'ignorer la douleur");
        }
        var tokPv = parseInt(tokensIld[0].get('bar1_value'));
        var tokNewPv = tokPv - douleur;
        if (tokNewPv < 0) tokNewPv = 0;
        updateCurrentBar(tokensIld[0], 1, tokNewPv, evt);
        //TODO: faire mourrir, assomer
      }
    }); // end forEach on all attributes ignorerLaDouleur
    ilds.forEach(function(ild) {
      evt.deletedAttributes.push(ild);
      ild.remove();
    });
    if (ilds.length > 0) {
      attrs = attrs.filter(function(attr) {
        var ind = ilds.findIndex(function(nattr) {
          return nattr.id == attr.id;
        });
        return (ind == -1);
      });
    }
    // fin des effets temporaires (durée en tours, ou durée = combat)
    attrs.forEach(function(obj) {
      var attrName = obj.get('name');
      var charId = obj.get('characterid');
      if (estEffetTemp(attrName)) {
        finDEffet(obj, effetTempOfAttribute(obj), attrName, charId, evt, {
          gardeAutresAttributs: true,
          //  pageId: stateCOF.combat_pageid //l'id pourrait avoir changé
        });
      } else if (estAttributEffetTemp(attrName)) {
        evt.deletedAttributes.push(obj);
        obj.remove();
      } else if (estEffetCombat(attrName)) {
        var mc = messageEffetCombat[effetCombatOfAttribute(obj)].fin;
        if (mc && mc !== '') sendChar(charId, mc);
        evt.deletedAttributes.push(obj);
        obj.remove();
      } else if (estAttributEffetCombat(attrName)) {
        evt.deletedAttributes.push(obj);
        obj.remove();
      }
    });
    addEvent(evt);
  }

  function pointsDeRecuperation(perso) {
    // retourne les nombre de PR restant
    var attrPR = tokenAttribute(perso, 'pointsDeRecuperation');
    if (attrPR.length > 0) {
      var prc = parseInt(attrPR[0].get('current'));
      var prm = parseInt(attrPR[0].get('max'));
      return {
        current: prc,
        max: prm
      };
    }
    var pr = 5;
    var x;
    for (var i = 1; i < 6; i++) {
      x = getAttrByName(perso.charId, "PR" + i);
      if (x == 1) pr--;
    }
    return {
      current: pr,
      max: 5
    };
  }

  function enleverPointDeRecuperation(perso, evt) {
    var attrPR = tokenAttribute(perso, 'pointsDeRecuperation');
    if (attrPR.length > 0) {
      var prc = parseInt(attrPR[0].get('current'));
      if (prc > 0) {
        setTokenAttr(perso, 'pointsDeRecuperation', prc - 1, evt);
        return;
      }
      sendChat("COF", "Plus de point de récupération à enlever");
      return;
    }
    evt.attributes = evt.attributes || [];
    for (var i = 1; i < 6; i++) {
      var prAttr = findObjs({
        _type: 'attribute',
        _characterid: perso.charId,
        name: "PR" + i
      });
      if (prAttr.length === 0) {
        prAttr = createObj("attribute", {
          characterid: perso.charId,
          name: "PR" + i,
          current: 1,
          max: 1
        });
        evt.attributes.push({
          attribute: prAttr,
          current: null
        });
        return;
      } else if (prAttr[0].get('current') == 0) { // jshint ignore:line
        prAttr[0].set("current", 1);
        evt.attributes.push({
          attribute: prAttr[0],
          current: 0
        });
        return;
      }
    }
    sendChat("COF", "Plus de point de récupération à enlever");
  }

  function rajouterPointDeRecuperation(perso, evt) {
    var attrPR = tokenAttribute(perso, 'pointsDeRecuperation');
    if (attrPR.length > 0) {
      var prc = parseInt(attrPR[0].get('current'));
      var prmax = parseInt(attrPR[0].get('max'));
      if (prc < prmax) {
        setTokenAttr(perso, 'pointsDeRecuperation', prc + 1, evt);
        return true;
      }
      log("Pas de point de récupération à récupérer pour " + perso.token.get('name'));
      return;
    }
    for (var i = 1; i < 6; i++) {
      var prAttr =
        findObjs({
          _type: "attribute",
          _characterid: perso.charId,
          name: "PR" + i
        });
      if (prAttr.length > 0 && prAttr[0].get("current") == 1) {
        prAttr[0].set("current", 0);
        evt.attributes.push({
          attribute: prAttr[0],
          current: 1
        });
        return true;
      }
    }
    log("Pas de point de récupération à récupérer pour " + perso.token.get('name'));
  }

  //Asynchrone
  function soinsEcuyers(ecuyers, manquePV, playerId, evt) {
    var count = ecuyers.length;
    var finalize = function() {
      count--;
      if (count === 0) {
        addEvent(evt);
      }
    };
    ecuyers.forEach(function(ec) {
      var ecuyer = ec.perso;
      var ecuyerDe = ec.ecuyerDe;
      var charChevalier = findObjs({
        _type: 'character',
        name: ecuyerDe
      });
      if (charChevalier.length === 0) {
        error("Pas de chevalier " + ecuyerDe + " pour l'écuyer " + ecuyer.token.get('name'), ec);
        finalize();
        return;
      }
      if (charChevalier.length > 1) {
        error("Plusieurs personnages nommés " + ecuyerDe + ". Attention aux ambiguités.");
      }
      charChevalier = charChevalier[0].id;
      var maxASoigner = modCarac(charChevalier, 'CHARISME') + 1;
      var allies = alliesParPerso[ecuyer.charId] || new Set();
      var alliesASoigner = [];
      var nbCibles = 0;
      var chevalier;
      var monture;
      manquePV.forEach(function(cible) {
        if (cible.charId == charChevalier) {
          chevalier = cible;
          nbCibles++;
          return;
        }
        if (allies.has(cible.charId)) {
          var montureDe = findObjs({
            _type: 'attribute',
            _characterid: cible.charId,
            name: 'montureDe'
          });
          if (montureDe.length > 0 && montureDe[0].get('current') == ecuyerDe) {
            monture = cible;
            nbCibles++;
            return;
          }
          alliesASoigner.push(cible);
        }
      }); //fin de détermination des cibles
      if (chevalier === undefined && monture === undefined &&
        (maxASoigner < 1 || alliesASoigner.length === 0)) { //Personne à soigner
        finalize();
        return;
      }
      //TODO: utiliser l'id d'un player qui contrôle le chevalier
      var display = startFramedDisplay(playerId, "Services d'écuyer", ecuyer);
      var finSoin = function() {
        nbCibles--;
        if (nbCibles === 0) {
          if (display) sendChat("", endFramedDisplay(display));
          finalize();
        }
      };
      var soigneUneCible = function(c) {
        sendChat('', "[[2d6]]", function(res) {
          var soins = res[0].inlinerolls[0].results.total;
          var soinTxt = buildinline(res[0].inlinerolls[0], 'normal', true);
          var printTrue = function(s) {
            var msgSoin = ecuyer.token.get('name') + ' ';
            if (c.id == ecuyer.token.id) {
              msgSoin = 'se soigne de ';
            } else {
              msgSoin = c.token.get('name') + " récupère ";
            }
            if (s < soins)
              msgSoin += s + " PV. (Le résultat du jet était " + soinTxt + ")";
            else msgSoin += soinTxt + " PV.";
            addLineToFramedDisplay(display, msgSoin);
          };
          soigneToken(c, soins, evt, printTrue);
          finSoin();
        }); //fin du sendChar
      }; // fin de définition de soigneCible
      var peutToutSoigner = (alliesASoigner.length <= maxASoigner);
      if (peutToutSoigner) nbCibles += alliesASoigner.length;
      else if (maxASoigner > 0) nbCibles++; //pour ne pas finir avant d'imprimer les boutons
      if (chevalier) soigneUneCible(chevalier);
      if (monture) soigneUneCible(monture);
      if (peutToutSoigner) {
        alliesASoigner.forEach(soigneUneCible);
      } else if (maxASoigner > 0) {
        addLineToFramedDisplay(display, "Peut prendre soin de (max " + maxASoigner + ") :");
        var attr = setTokenAttr(ecuyer, 'SoinsdEcuyer', maxASoigner, evt);
        var action = "!cof-soin " + ecuyer.token.id + " ";
        alliesASoigner.forEach(function(c) {
          var nom = c.token.get('name');
          addLineToFramedDisplay(display, bouton(action + c.token.id + " 2d6", nom, ecuyer, attr));
        });
        finSoin();
      }
    }); //fin iteration sur les écuyers
  }

  // Récupération pour tous les tokens sélectionnés
  function nuit(msg, evt) {
    if (stateCOF.combat) sortirDuCombat();
    getSelected(msg, function(selection, playerId) {
      if (selection.length === 0) {
        var pageId = getPageId(playerId);
        var tokens =
          findObjs({
            _type: 'graphic',
            _subtype: 'token',
            layer: 'objects',
            _pageid: pageId
          });
        tokens.forEach(function(tok) {
          if (tok.get('represents') === '') return;
          selection.push({
            _id: tok.id
          });
        });
      }
      if (evt === undefined) evt = {
        type: "Nuit",
        attributes: []
      };
      if (msg.content.startsWith('!cof-nuit')) jour(evt);
      recuperation(selection, true, playerId, evt);
    });
  }

  // Remise à zéro de toutes les limites journalières
  function jour(evt) {
    var attrs;
    attrs = removeAllAttributes('pressionMortelle', evt);
    attrs = removeAllAttributes('soinsLegers', evt, attrs);
    attrs = removeAllAttributes('soinsModeres', evt, attrs);
    attrs = removeAllAttributes('fortifie', evt, attrs);
    attrs = removeAllAttributes('limiteParJour', evt, attrs);
    attrs = removeAllAttributes('tueurFantasmagorique', evt, attrs);
    attrs = removeAllAttributes('resisteInjonction', evt, attrs);
    //Les élixirs
    var attrsElixirsACreer = attrs.filter(function(a) {
      return a.get('name').startsWith('elixirsACreer');
    });
    attrs = removeAllAttributes('elixirsACreer', evt, attrs);
    attrs = removeAllAttributes('elixir', evt, attrs);
    //On pourrait diviser par 2 le nombre de baies
    //var attrsBaie = allAttributesNamed(attrs, 'dose_baie_magique');
  }

  function nouveauJour(msg) {
    var evt = {
      type: "Nouveau jour",
      attributes: []
    };
    var playerId = getPlayerIdFromMsg(msg);
    var fromMsg = 'player|' + playerId;
    var player = getObj('player', playerId);
    if (player) {
      var speaksAs = player.get('speakingas');
      if (speaksAs !== '') fromMsg = speaksAs;
    }
    sendChat(fromMsg, "Un nouveau jour se lève");
    jour(evt);
    if (msg.content.includes(' --repos')) nuit(msg, evt);
    else addEvent(evt);
  }

  function recuperer(msg) {
    if (stateCOF.combat) {
      sendPlayer(msg, "impossible de se reposer en combat");
      return;
    }
    var reposLong = false;
    if (msg.content.includes(' --reposLong')) reposLong = true;
    getSelected(msg, function(selection, playerId) {
      if (selection.length === 0) {
        sendPlayer(msg, "!cof-recuperer sans sélection de tokens");
        log("!cof-recuperer requiert des tokens sélectionnés");
        return;
      }
      var evt = {
        type: "Récuperation",
        attributes: []
      };
      recuperation(selection, reposLong, playerId, evt);
    });
  }

  //Asynchrone (jets de dés)
  function recuperation(selection, reposLong, playerId, evt) {
    var manquePV = [];
    var ecuyers = [];
    var count = selection.length;
    var finalize = function() {
      count--;
      if (count === 0) {
        if (ecuyers.length > 0 && manquePV.length > 0) {
          soinsEcuyers(ecuyers, manquePV, playerId, evt);
        } else addEvent(evt);
      }
    };
    iterSelected(selection, function(perso) {
      if (getState(perso, 'mort')) {
        finalize();
        return;
      }
      if (reposLong) {
        var attrEcuyerDe = findObjs({
          _type: 'attribute',
          _characterid: perso.charId,
          name: 'ecuyerDe'
        });
        if (attrEcuyerDe.length > 0) {
          ecuyers.push({
            perso: perso,
            ecuyerDe: attrEcuyerDe[0].get('current')
          });
        }
      }
      var token = perso.token;
      var charId = perso.charId;
      var character = getObj("character", charId);
      var characterName = character.get("name");
      var pr = pointsDeRecuperation(perso);
      var bar2 = parseInt(token.get("bar2_value"));
      var manaAttr = findObjs({
        _type: 'attribute',
        _characterid: charId,
        name: 'PM'
      });
      var hasMana = false;
      var dmTemp = bar2;
      if (manaAttr.length > 0) { // Récupération des points de mana
        var manaMax = parseInt(manaAttr[0].get('max'));
        hasMana = !isNaN(manaMax) && manaMax > 0;
        if (hasMana) {
          dmTemp = attributeAsInt(perso, 'DMTEMP', 0);
          if (reposLong && (isNaN(bar2) || bar2 < manaMax)) {
            updateCurrentBar(token, 2, manaMax, evt);
          }
        }
      }
      if (!isNaN(dmTemp) && dmTemp > 0) { // récupération de DM temp
        if (reposLong) dmTemp = 0;
        else dmTemp = Math.max(0, dmTemp - 10);
        if (hasMana) {
          setTokenAttr(perso, 'DMTEMP', dmTemp, evt);
        } else {
          updateCurrentBar(token, 2, dmTemp, evt);
        }
      }
      var bar1 = parseInt(token.get("bar1_value"));
      var pvmax = parseInt(token.get("bar1_max"));
      if (isNaN(bar1) || isNaN(pvmax)) return;
      if (bar1 >= pvmax && (pr.current == pr.max || !reposLong)) {
        if (!reposLong) {
          sendChat("", characterName + " n'a pas besoin de repos");
        }
        finalize();
        return;
      }
      if (reposLong && charAttributeAsBool(perso, 'montureMagique')) {
        //La monture magique récupère tous ses PV durant la nuit
        updateCurrentBar(token, 1, pvmax, evt);
        sendChar(charId, "récupère tous ses PV");
        finalize();
        return;
      }
      var dVie = charAttributeAsInt(perso, "DV", 0);
      if (dVie < 4) {
        if (bar1 < pvmax) manquePV.push(perso);
        finalize();
        return; //Si pas de dé de vie, alors pas de PR.
      }
      var message;
      if (reposLong && pr.current < pr.max) { // on récupère un PR
        //Sauf si on a une blessure gave
        if (getState(perso, 'blessé')) {
          testCaracteristique(perso, 'CON', 8, {}, evt, function(tr) {
            sendChar(charId, "fait un jet de CON pour guérir de sa blessure");
            var m = "/direct " + onGenre(charId, 'Il', 'Elle') + " fait " + tr.texte;
            if (tr.reussite) {
              sendChar(charId, m + "&ge; 8, son état s'améliore nettement.");
              setState(perso, 'blessé', false, evt);
            } else sendChar(charId, m + "< 8, son état reste préoccupant.");
            finalize();
          });
          return;
        }
        var affAttr = rajouterPointDeRecuperation(perso, evt);
        if (affAttr === undefined) {
          error("Pas de point de récupérartion à rajouter et pourtant pas au max", token);
          finalize();
          return;
        }
        message =
          "Au cours de la nuit, les points de récupération de " + characterName +
          " passent de " + pr.current + " à " + (pr.current + 1);
        sendChar(charId, message);
        if (bar1 < pvmax) manquePV.push(perso);
        finalize();
        return;
      }
      if (!reposLong) {
        if (pr.current === 0) { //pas possible de récupérer
          message = " a besoin d'une nuit complète pour récupérer";
          sendChar(charId, message);
          finalize();
          return;
        } else { //dépense d'un PR
          enleverPointDeRecuperation(perso, evt);
          pr.current--;
        }
      }
      var conMod = modCarac(perso, 'CONSTITUTION');
      var niveau = ficheAttributeAsInt(perso, 'NIVEAU', 1);
      var rollExpr = addOrigin(characterName, "[[1d" + dVie + "]]");
      sendChat("COF", rollExpr, function(res) {
        var rolls = res[0];
        var dVieRoll = rolls.inlinerolls[0].results.total;
        var bonus = conMod + niveau;
        var total = dVieRoll + bonus;
        if (total < 0) total = 0;
        if (bar1 === 0) {
          if (attributeAsBool(perso, 'etatExsangue')) {
            removeTokenAttr(perso, 'etatExsangue', evt, "retrouve des couleurs");
          }
        }
        bar1 += total;
        if (bar1 < pvmax) manquePV.push(perso);
        else bar1 = pvmax;
        updateCurrentBar(token, 1, bar1, evt);
        if (reposLong) {
          message = "Au cours de la nuit, ";
        } else {
          message = "Après une dizaine de minutes de repos, ";
        }
        message +=
          characterName + " récupère " + buildinline(rolls.inlinerolls[0]) + "+" + bonus + " PV. Il lui reste " + pr.current + " points de récupération";
        sendChar(charId, "/direct " + message);
        finalize();
      });
    }, finalize); //fin de iterSelected
  }

  function iterSelected(selected, iter, callback) {
    selected.forEach(function(sel) {
      var token = getObj('graphic', sel._id);
      if (token === undefined) {
        if (callback !== undefined) callback();
        return;
      }
      var charId = token.get('represents');
      if (charId === undefined || charId === "") {
        if (callback !== undefined) callback();
        return;
      }
      iter({
        token: token,
        charId: charId
      });
    });
  }

  function recharger(msg) {
    var cmd = msg.content.split(" ");
    if (cmd.length < 2) {
      error("La fonction !cof-recharger attend au moins un argument", msg);
      return;
    }
    var attackLabel = cmd[1];
    var evt = {
      type: 'recharger',
      attributes: []
    };
    var grenaille = false;
    if (msg.content.includes(' --grenaille')) grenaille = true;
    getSelected(msg, function(selected) {
      if (selected === undefined) {
        sendPlayer(msg, "!cof-recharger sans sélection de tokens");
        log("!cof-recharger requiert des tokens sélectionnés");
        return;
      }
      iterSelected(selected, function(perso) {
        var att = getAttack(attackLabel, perso);
        if (att === undefined) {
          error("Arme " + attackLabel + " n'existe pas pour " + perso.tokName, perso);
          return;
        }
        var weaponName = att.weaponName;
        var attrs =
          findObjs({
            _type: 'attribute',
            _characterid: perso.charId,
            name: "charge_" + attackLabel
          });
        if (attrs.length < 1) {
          perso.tokName = perso.tokName || perso.token.get('name');
          log("Personnage " + perso.tokName + " sans charge " + attackLabel);
          attrs = createObj('attribute', {
            characterid: perso.charId,
            name: 'charge_' + attackLabel,
            current: 0,
            max: 1
          });
        } else attrs = attrs[0];
        var maxCharge = parseInt(attrs.get('max'));
        if (isNaN(maxCharge)) {
          error("max charge mal formée", attrs);
          return;
        }
        var currentCharge = parseInt(attrs.get('current'));
        if (isNaN(currentCharge)) {
          error("charge mal formée", attrs);
          return;
        }
        var attrGrenaille =
          findObjs({
            _type: 'attribute',
            _characterid: perso.charId,
            name: "chargeGrenaille_" + attackLabel
          });
        var currentChargeGrenaille;
        if (currentCharge < maxCharge) {
          if (grenaille) {
            if (attrGrenaille.length < 1) {
              attrGrenaille = createObj('attribute', {
                characterid: perso.charId,
                name: 'chargeGrenaille_' + attackLabel,
                current: 0
              });
            } else attrGrenaille = attrGrenaille[0];
            currentChargeGrenaille = parseInt(attrGrenaille.get('current'));
            if (isNaN(currentChargeGrenaille)) {
              error("charge de grenaille mal formée", attrGrenaille);
              return;
            }
            if (currentChargeGrenaille > currentCharge) currentChargeGrenaille = currentCharge;
            evt.attributes.push({
              attribute: attrGrenaille,
              current: currentChargeGrenaille
            });
            attrGrenaille.set('current', currentChargeGrenaille + 1);
          }
          evt.attributes.push({
            attribute: attrs,
            current: currentCharge
          });
          attrs.set('current', currentCharge + 1);
          updateNextInit(perso.token);
          if (grenaille)
            sendChar(perso.charId, "charge " + weaponName + " de grenaille.");
          else
            sendChar(perso.charId, "recharge " + weaponName);
          return;
        } else {
          if (grenaille) { //On peut vouloir changer des charges normales en grenaille
            if (attrGrenaille.length < 1) {
              attrGrenaille = createObj('attribute', {
                characterid: perso.charId,
                name: 'chargeGrenaille_' + attackLabel,
                current: 0
              });
            } else attrGrenaille = attrGrenaille[0];
            currentChargeGrenaille = parseInt(attrGrenaille.get('current'));
            if (isNaN(currentChargeGrenaille)) {
              error("charge de grenaille mal formée", attrGrenaille);
              return;
            }
            if (currentChargeGrenaille < currentCharge) {
              evt.attributes.push({
                attribute: attrGrenaille,
                current: currentChargeGrenaille
              });
              attrGrenaille.set('current', currentChargeGrenaille + 1);
              sendChar(perso.charId, "remplace une charge de " + weaponName + " par de la grenaille.");
              return;
            }
          } else if (attrGrenaille.length > 0) {
            attrGrenaille = attrGrenaille[0];
            currentChargeGrenaille = parseInt(attrGrenaille.get('current'));
            if (isNaN(currentChargeGrenaille)) {
              error("charge de grenaille mal formée", attrGrenaille);
              return;
            }
            if (currentChargeGrenaille > 0) {
              evt.attributes.push({
                attribute: attrGrenaille,
                current: currentChargeGrenaille
              });
              attrGrenaille.set('current', currentChargeGrenaille - 1);
              sendChar(perso.charId, "remplace une charge de grenaille  de " + weaponName + " par une charge normale.");
              return;
            }
          }
        }
        if (maxCharge == 1) {
          sendChar(perso.charId, weaponName + " est déjà chargé");
        } else {
          sendChar(perso.charId, "a déjà tous ses " + weaponName + " chargés");
        }
      });
    });
    addEvent(evt);
  }

  function peutController(msg, perso) {
    var playerId = getPlayerIdFromMsg(msg);
    if (playerIsGM(playerId)) return true;
    if (msg.selected && msg.selected.length > 0) {
      if (perso.token.id == msg.selected[0]._id) return true;
      var selectedPerso = tokenOfId(msg.selected[0]._id);
      if (selectedPerso !== undefined && selectedPerso.charId == perso.charId) return true;
    }
    var character = getObj('character', perso.charId);
    if (character === undefined) return false;
    var cb = character.get('controlledby');
    var res = cb.split(',').find(function(pid) {
      if (pid == 'all') return true;
      return (pid == playerId);
    });
    return (res !== undefined);
  }


  function boutonChance(msg) {
    var args = msg.content.split(' ');
    if (args.length < 2) {
      error("La fonction !cof-bouton-chance n'a pas assez d'arguments", args);
      return;
    }
    var evt = findEvent(args[1]);
    if (evt === undefined) {
      error("L'action est trop ancienne ou éte annulée", args);
      return;
    }
    var perso = evt.personnage;
    if (perso === undefined) {
      error("Erreur interne du bouton de chance : l'évenement n'a pas de personnage", evt);
      return;
    }
    if (!peutController(msg, perso)) {
      sendPlayer(msg, "pas le droit d'utiliser ce bouton");
      return;
    }
    var chance = attributeAsInt(perso, 'PC', 0);
    if (chance <= 0) {
      sendChar(perso.charId, " n'a plus de point de chance à dépenser...");
      return;
    }
    var evtChance = {
      type: 'chance'
    };
    chance--;
    var action = evt.action;
    if (action) { //alors on peut faire le undo
      undoEvent(evt);
      setTokenAttr(perso, 'PC', chance, evtChance,
        " a dépensé un point de chance. Il lui en reste " + chance);
      addEvent(evtChance);
      switch (evt.type) {
        case 'Attaque':
          chanceCombat(perso, action);
          return;
        case 'jetPerso':
          var options = action.options || {};
          options.chance = (options.chance === undefined) ? 1 : options.chance + 1;
          jetPerso(perso, action.caracteristique, action.difficulte, action.titre, action.playerId, options);
          return;
        case 'echapperEnveloppement':
          var optionsEE = action.options || {};
          optionsEE.chance = (optionsEE.chance === undefined) ? 1 : optionsEE.chance + 1;
          echapperEnveloppement({
            selected: action.selected,
            content: '!cof-chance-echapper-enveloppement',
            playerId: action.playerId,
            options: optionsEE
          });
          return;
        default:
          error("Evenement avec une action, mais inconnue au niveau chance. Impossible d'annuler !", evt);
          return;
      }
    }
    error("Type d'évènement pas encore géré pour la chance", evt);
    addEvent(evtChance);
  }

  function chance(msg) {
    if (msg.selected === undefined) {
      sendPlayer(msg, "!cof-chance sans sélection de token");
      log("!cof-chance requiert de sélectionner un token");
      return;
    } else if (msg.selected.length != 1) {
      sendPlayer(msg, "!cof-chance ne doit selectionner qu'un token");
      log("!cof-chance requiert de sélectionner exactement un token");
      return;
    }
    var cmd = msg.content.split(' ');
    if (cmd.length < 2) {
      error("La fonction !cof-chance attend au moins un argument (combat ou autre)", msg);
      return;
    }
    var tokenId = msg.selected[0]._id;
    var perso = tokenOfId(tokenId);
    if (perso === undefined) {
      error(" !cof-chance ne fonctionne qu'avec des tokens qui représentent des personnages", perso);
      return;
    }
    var name = perso.token.get('name');
    var action;
    if (cmd[1] == 'combat') { //further checks
      var lastAct = lastEvent();
      if (lastAct !== undefined) {
        if (lastAct.type != 'Attaque' || lastAct.succes !== false) {
          action = lastAct.action;
        }
      }
      if (action === undefined ||
        lastAct.action.attaquant.token.id != tokenId) {
        error("Pas de dernière action de combat ratée trouvée pour " + name, lastAct);
        return;
      }
    }
    var chance = attributeAsInt(perso, 'PC', 0);
    if (chance <= 0) {
      sendChat("", name + " n'a plus de point de chance à dépenser...");
      return;
    }
    var evt = {
      type: 'chance'
    };
    chance--;
    switch (cmd[1]) {
      case 'autre':
        setTokenAttr(perso, 'PC', chance, evt,
          " a dépensé un point de chance. Il lui en reste " + chance);
        addEvent(evt);
        return;
      case 'combat':
        undoEvent();
        setTokenAttr(perso, 'PC', chance, evt,
          " a dépensé un point de chance. Il lui en reste " + chance);
        addEvent(evt);
        chanceCombat(perso, action);
        return;
      default:
        error("argument de chance inconnu", cmd);
        addEvent(evt);
        return;
    }
  }

  function chanceCombat(perso, action) {
    // assumes that the original action was undone, re-attack with bonus
    var options = action.options;
    options.chance = (options.chance + 10) || 10;
    options.rollsAttack = action.rollsAttack;
    options.redo = true;
    if (action.cibles) {
      action.cibles.forEach(function(target) {
        delete target.partialSaveAuto;
      });
    }
    attack(action.player_id, perso, action.cibles, action.attack_label, options);
  }

  function persoUtiliseRuneEnergie(perso, evt) {
    var attr = tokenAttribute(perso, 'runeDEnergie');
    if (attr.length === 0) {
      sendChar(perso.charId, "n'a pas de rune d'énergie");
      return false;
    }
    attr = attr[0];
    var dispo = attr.get('current');
    if (dispo) {
      sendChar(perso.charId, "utilise sa rune d'énergie pour relancer un d20 sur un test d'attaque, de FOR, DEX ou CON");
      evt.attributes.push({
        attribute: attr,
        current: dispo
      });
      attr.set('current', 0);
      return true;
    }
    sendChar(perso.charId, "a déjà utilisé sa rune d'énergie durant ce combat");
    return false;
  }

  function runeEnergie(msg) {
    if (!stateCOF.combat) {
      sendPlayer(msg, "On ne peut utiliser les runes d'énergie qu'en combat");
      return;
    }
    var cmd = msg.content.split(' ');
    var evtARefaire;
    var evt = {
      type: "Rune d'énergie",
      attributes: []
    };
    if (cmd.length > 1) { //On relance pour un événement particulier
      evtARefaire = findEvent(cmd[1]);
      if (evtARefaire === undefined) {
        error("L'action est trop ancienne ou a été annulée", cmd);
        return;
      }
      var perso = evtARefaire.personnage;
      if (perso === undefined) {
        error("Erreur interne du bouton de rune d'énergie : l'évenement n'a pas de personnage", evtARefaire);
        return;
      }
      if (!peutController(msg, perso)) {
        sendPlayer(msg, "pas le droit d'utiliser ce bouton");
        return;
      }
      var action = evtARefaire.action;
      if (action === undefined) {
        error("Impossible de relancer l'action", evtARefaire);
        return;
      }
      var carac = action.caracteristque;
      if (carac == 'SAG' || carac == 'INT' || carac == 'CHA') {
        sendChar(perso, "ne peut pas utiliser la rune d'énergie pour un test de " + carac);
        return;
      }
      var options = action.options || {};
      options.redo = true;
      if (!persoUtiliseRuneEnergie(perso, evt)) return;
      addEvent(evt);
      switch (evtARefaire.type) {
        case 'Attaque':
          undoEvent(evtARefaire);
          if (action.cibles) {
            action.cibles.forEach(function(target) {
              delete target.partialSaveAuto;
            });
          }
          attack(action.player_id, perso, action.cibles, action.attack_label, options);
          return;
        case 'jetPerso':
          undoEvent(evtARefaire);
          delete options.roll; //On va le relancer
          jetPerso(perso, action.caracteristique, action.difficulte, action.titre, action.playerId, options);
          return;
        case 'echapperEnveloppement':
          undoEvent(evtARefaire);
          delete options.roll;
          echapperEnveloppement({
            selected: action.selected,
            content: '!cof-chance-echapper-enveloppement',
            playerId: action.playerId,
            options: options
          });
          return;
        default:
          return;
      }
    } else { //Juste pour vérifier l'attribut et le diminuer
      getSelected(msg, function(selection) {
        if (selection.length === 0) {
          sendPlayer(msg, 'Pas de token sélectionné pour !cof-rune-energie');
          return;
        }
        iterSelected(selection, function(perso) {
          persoUtiliseRuneEnergie(perso, evt);
        }); //fin iterSelected
        addEvent(evt);
      }); //fin getSelected
    }
  }

  function persoUtiliseRunePuissance(perso, labelArme, evt) {
    var attr = tokenAttribute(perso, 'runeDePuissance(' + labelArme + ')');
    var arme = getAttack(labelArme, perso);
    if (arme === undefined) {
      error(perso.tokNname + " n'a pas d'arme associée au label " + labelArme, perso);
      return false;
    }
    if (attr.length === 0) {
      sendChar(perso.charId, "n'a pas de rune de puissance sur " + arme.weaponName);
      return false;
    }
    attr = attr[0];
    var dispo = attr.get('current');
    if (dispo) {
      sendChar(perso.charId, "utilise sa rune de puissance pour obtenir les DM maximum de son arme (" + arme.weaponName + ")");
      evt.attributes.push({
        attribute: attr,
        current: dispo
      });
      attr.set('current', 0);
      return true;
    }
    sendChar(perso.charId, "a déjà utilisé sa rune de puissance durant ce combat");
    return false;
  }

  //!cof-rune-puissance label [evt.id]
  function runePuissance(msg) {
    if (!stateCOF.combat) {
      sendPlayer(msg, "On ne peut utiliser les runes de puissance qu'en combat");
      return;
    }
    var cmd = msg.content.split(' ');
    if (cmd.length < 2) {
      error("Il faut spécifier le label de l'arme sur laquelle la rune de puissance est inscrite", cmd);
      return;
    }
    var labelArme = cmd[1];
    var evtARefaire;
    var evt = {
      type: "Rune de puissance",
      attributes: []
    };
    if (cmd.length > 2) { //On relance pour un événement particulier
      evtARefaire = findEvent(cmd[2]);
      if (evtARefaire === undefined) {
        error("L'action est trop ancienne ou a été annulée", cmd);
        return;
      }
      var perso = evtARefaire.personnage;
      if (perso === undefined) {
        error("Erreur interne du bouton de rune de puissance : l'évenement n'a pas de personnage", evtARefaire);
        return;
      }
      if (!peutController(msg, perso)) {
        sendPlayer(msg, "pas le droit d'utiliser ce bouton");
        return;
      }
      var action = evtARefaire.action;
      if (action === undefined) {
        error("Impossible de relancer l'action", evtARefaire);
        return;
      }
      var options = action.options || {};
      options.redo = true;
      options.maxDmg = true;
      options.rollsAttack = action.rollsAttack;
      action.cibles.forEach(function(target) {
        delete target.rollsDmg;
      });
      if (!persoUtiliseRunePuissance(perso, labelArme, evt)) return;
      addEvent(evt);
      switch (evtARefaire.type) {
        case 'Attaque':
          undoEvent(evtARefaire);
          attack(action.player_id, perso, action.cibles, action.attack_label, options);
          return;
        default:
          return;
      }
    } else { //Juste pour vérifier l'attribut et le diminuer
      getSelected(msg, function(selection) {
        if (selection.length === 0) {
          sendPlayer(msg, 'Pas de token sélectionné pour !cof-rune-puissance');
          return;
        }
        iterSelected(selection, function(perso) {
          persoUtiliseRunePuissance(perso, labelArme, evt);
        }); //fin iterSelected
        addEvent(evt);
      }); //fin getSelected
    }
  }

  //!cof-pousser-kaia evt.id
  function kiai(msg) {
    if (!stateCOF.combat) {
      sendPlayer(msg, "On ne peut pousser un kiai qu'en combat");
      return;
    }
    var cmd = msg.content.split(' ');
    if (cmd.length < 2) {
      error("Il manque l'id de l'attaque sur laquelle pousser le kiai", cmd);
      return;
    }
    var evtARefaire = findEvent(cmd[1]);
    if (evtARefaire === undefined) {
      error("L'action est trop ancienne ou a été annulée", cmd);
      return;
    }
    var perso = evtARefaire.personnage;
    if (perso === undefined) {
      error("Erreur interne du bouton de kiai : l'évenement n'a pas de personnage", evtARefaire);
      return;
    }
    if (!peutController(msg, perso)) {
      sendPlayer(msg, "pas le droit d'utiliser ce bouton");
      return;
    }
    var action = evtARefaire.action;
    if (action === undefined) {
      error("Impossible de relancer l'action", evtARefaire);
      return;
    }
    var attrKiai = tokenAttribute(perso, 'kiai');
    if (attrKiai.length === 0) {
      error("Le personnage " + perso.token.get('name') + " ne sait pas pousser de kiai", cmd);
      return;
    }
    attrKiai = attrKiai[0];
    var currentKiai = parseInt(attrKiai.get('current'));
    if (isNaN(currentKiai) || currentKiai < 1) {
      sendPlayer(msg, perso.token.get('name') + " ne peut plus pousser de kiai pendant ce combat.");
      return;
    }
    var evt = {
      type: "Kiai",
      attributes: [{
        attribute: attrKiai,
        current: currentKiai
      }]
    };
    attrKiai.set('current', currentKiai - 1);
    if (currentKiai > 1) {
      setTokenAttr(perso, 'rechargeDuKiai', randomInteger(6), evt, undefined, getInit());
    }
    var options = action.options || {};
    options.redo = true;
    options.maxDmg = true;
    options.rollsAttack = action.rollsAttack;
    action.cibles.forEach(function(target) {
      delete target.rollsDmg;
    });
    addEvent(evt);
    switch (evtARefaire.type) {
      case 'Attaque':
        undoEvent(evtARefaire);
        attack(action.player_id, perso, action.cibles, action.attack_label, options);
        return;
      default:
        return;
    }
  }

  //Devrait être appelé seulement depuis un bouton
  //!cof-esquive-fatale evtid target_id
  function esquiveFatale(msg) {
    var cmd = msg.content.split(' ');
    var evtARefaire;
    var evt = {
      type: "Esquive fatale",
      attributes: []
    };
    if (cmd.length < 3) {
      error("Il manque des arguments à !cof-esquive-fatale", cmd);
      return;
    }
    evtARefaire = findEvent(cmd[1]);
    if (evtARefaire === undefined) {
      error("L'attaque est trop ancienne ou a été annulée", cmd);
      return;
    }
    var action = evtARefaire.action;
    if (action === undefined) {
      error("Impossible d'esquiver l'attaque", evtARefaire);
      return;
    }
    var perso = action.cibles[0];
    if (perso === undefined) {
      error("Erreur interne du bouton de 'esquive fatale : l'évenement n'a pas de personnage", evtARefaire);
      return;
    }
    var adversaire = tokenOfId(cmd[2]);
    if (adversaire === undefined) {
      sendPlayer(msg, "Il faut cibler un token valide");
      return;
    }
    var attaquant = action.attaquant;
    if (attaquant.token.id == adversaire.token.id) {
      sendPlayer(msg, "Il faut cibler un autre adversaire que l'attaquant");
      return;
    }
    if (distanceCombat(perso.token, adversaire.token) > 0) {
      sendChar(perso.charId, "doit choisir un adversaire au contact pour l'esquive fatale");
      return;
    }
    var ennemisAuContact = perso.ennemisAuContact;
    if (ennemisAuContact === undefined) {
      error("Ennemis au contact non définis", perso);
    } else {
      var i = ennemisAuContact.find(function(tok) {
        return (tok.id == adversaire.token.id);
      });
      if (i === undefined) {
        sendPlayer(msg, "Il faut cibler un adversaire au contact pour l'esquive fatale");
        return;
      }
    }
    if (!peutController(msg, perso)) {
      sendPlayer(msg, "pas le droit d'utiliser ce bouton");
      return;
    }
    var options = action.options || {};
    var attr = tokenAttribute(perso, 'esquiveFatale');
    if (attr.length === 0) {
      sendChar(perso.charId, "ne sait pas faire d'esquive fatale");
      return;
    }
    attr = attr[0];
    var dispo = parseInt(attr.get('current'));
    if (isNaN(dispo) || dispo < 1) {
      sendChar(perso.charId, "a déjà fait une esquive fatale durant ce combat");
      return;
    }
    adversaire.tokName = adversaire.token.get('name');
    sendChar(perso.charId, "s'arrange pour que l'attaque touche " + adversaire.tokName);
    evt.attributes.push({
      attribute: attr,
      current: dispo
    });
    attr.set('current', 0);
    addEvent(evt);
    undoEvent(evtARefaire);
    adversaire.esquiveFatale = true;
    options.redo = true;
    attack(action.player_id, attaquant, [adversaire], action.attack_label, options);
  }

  function intercepter(msg) {
    getSelected(msg, function(selected) {
      iterSelected(selected, function(cible) {
        var charId = cible.charId;
        var character = getObj('character', charId);
        if (character === undefined) {
          error("L'argument de !cof-intercepter n'est pas une id de token valide (personnage non défini)", msg.content);
          return;
        }
        cible.tokName = cible.token.get('name');
        cible.name = character.get('name');
        if (attributeAsBool(cible, 'intercepter')) {
          sendChar(charId, " a déjà intercepté une attaque ce tour");
          return;
        }
        var voieMeneur = charAttributeAsInt(cible, "voieDuMeneurDHomme", 0);
        if (voieMeneur < 2) {
          error(cible.tokName + " n'a pas un rang suffisant dans la voie du meneur d'homme pour intercepter l'attaque", voieMeneur);
          return;
        }
        var attaque;
        var lastAct = lastEvent();
        if (lastAct !== undefined) {
          attaque = lastAct.action;
        }
        if (attaque === undefined) {
          sendChar(charId, "la dernière action trouvée n'est pas une attaque, impossible d'intercepter");
          return;
        }
        if (attaque.cibles.length === 0) {
          sendChar(charId, "la dernière attaque n'a touché aucune cible, impossible d'intercepter");
          return;
        }
        if (attaque.cibles.length > 1) {
          sendChar(charId, "la dernière attaque a touché plus d'une cible, impossible d'intercepter");
          return;
        }
        var targetName = attaque.cibles[0].tokName;
        if (targetName === undefined) {
          error("Le token de la dernière attaque est indéfini", attaque);
          return;
        }
        if (distanceCombat(cible.token, attaque.cibles[0].token) > 0) {
          sendChar(charId, " est trop loin de " + targetName + " pour intercepter l'attaque");
          return;
        }
        var evt = {
          type: 'interception'
        };
        setTokenAttr(cible, 'intercepter', true, evt,
          "se met devant " + targetName + " pour intercepter l'attaque !");
        // On annule l'ancienne action
        undoEvent();
        // Puis on refait en changeant la cible
        var options = attaque.options;
        options.intercepter = voieMeneur;
        options.rollsAttack = attaque.rollsAttack;
        options.evt = evt;
        options.redo = true;
        cible.rollsDmg = attaque.cibles[0].rollsDmg;
        attack(attaque.player_id, attaque.attaquant, [cible], attaque.attack_label, options);
      });
    });
  }

  //simplement prendre les DM à la place d'un autre
  function interposer(msg) {
    getSelected(msg, function(selected) {
      iterSelected(selected, function(cible) {
        var charId = cible.charId;
        var character = getObj('character', charId);
        if (character === undefined) {
          error("L'argument de !cof-interposer n'est pas une id de token valide (personnage non défini)", msg.content);
          return;
        }
        cible.tokName = cible.token.get('name');
        cible.name = character.get('name');
        if (attributeAsBool(cible, 'interposer')) {
          sendChar(charId, " a déjà intercepté une attaque ce tour");
          return;
        }
        var attaque;
        var lastAct = lastEvent();
        if (lastAct !== undefined) {
          attaque = lastAct.action;
        }
        if (attaque === undefined) {
          sendChar(charId, "la dernière action trouvée n'est pas une attaque, impossible d'intercepter");
          return;
        }
        if (attaque.cibles.length === 0) {
          sendChar(charId, "la dernière attaque n'a touché aucune cible, impossible de s'interposer");
          return;
        }
        if (attaque.cibles.length > 1) {
          sendChar(charId, "la dernière attaque a touché plus d'une cible, impossible de s'interposer en utilisant le script");
          return;
        }
        var target = attaque.cibles[0];
        var targetName = target.tokName;
        if (targetName === undefined) {
          error("Le token de la dernière attaque est indéfini", attaque);
          return;
        }
        if (distanceCombat(cible.token, target.token) > 0) {
          sendChar(charId, " est trop loin de " + targetName + " pour s'interposer");
          return;
        }
        var evt = {
          type: 'interposer'
        };
        setTokenAttr(cible, 'interposer', true, evt,
          "se met devant " + targetName + " pour intercepter l'attaque !");
        var pvApres = target.token.get('bar1_value');
        // On annule l'ancienne action
        undoEvent();
        // On calcule ensuite les pv perdus, et on les applique au défenseur
        var pvPerdus = target.token.get('bar1_value') - pvApres;
        // Puis on refait en changeant la cible
        var options = attaque.options;
        options.interposer = pvPerdus;
        options.rollsAttack = attaque.rollsAttack;
        options.rollsDmg = attaque.rollsDmg;
        options.evt = evt;
        options.redo = true;
        cible.rollsDmg = target.rollsDmg;
        attack(attaque.player_id, attaque.attaquant, [cible], attaque.attack_label, options);
      });
    });
  }

  function exemplaire(msg) {
    getSelected(msg, function(selected) {
      iterSelected(selected, function(cible) {
        var charId = cible.charId;
        if (attributeAsBool(cible, 'exemplaire')) {
          sendChar(charId, " a déjà montré l'exemple à ce tour");
          return;
        }
        var attaque;
        var lastAct = lastEvent();
        if (lastAct !== undefined) {
          if (lastAct.type == 'Attaque' && lastAct.succes === false) {
            attaque = lastAct.action;
          }
        }
        if (attaque === undefined) {
          sendChar(charId, "la dernière action trouvée n'est pas une attaque ratée, impossible de montrer l'exemple");
          return;
        }
        var attackerName = attaque.attaquant.token.get('name');
        if (attackerName === undefined) {
          error("Le token de la dernière attaque est indéfini", attaque);
          return;
        }
        var evt = {
          type: "Montrer l'exemple"
        };
        setTokenAttr(cible, 'exemplaire', true, evt,
          "montre l'exemple à " + attackerName);
        // On annule l'ancienne action
        undoEvent();
        // Puis on refait 
        var options = attaque.options;
        options.evt = evt;
        options.redo = true;
        attack(attaque.player_id, attaque.attaquant, attaque.cibles, attaque.attack_label, options);
      });
    });
  }

  function parseOptions(msg) {
    var pageId, playerId;
    if (msg.selected && msg.selected.length > 0) {
      var firstSelected = getObj('graphic', msg.selected[0]._id);
      if (firstSelected === undefined) {
        error("Un token sélectionné n'est pas trouvé en interne", msg.selected);
        return;
      }
      pageId = firstSelected.get('pageid');
    } else {
      playerId = getPlayerIdFromMsg(msg);
      pageId = getPageId(playerId);
    }
    var opts = msg.content.split(' --');
    var cmd = opts.shift().split(' ');
    cmd = cmd.filter(function(c) {
      return c !== '';
    });
    var options = {
      pageId: pageId,
      playerId: playerId,
      cmd: cmd
    };
    opts.forEach(function(arg) {
      cmd = arg.trim().split(' ');
      switch (cmd[0]) {
        case "attaqueMentale":
          options[cmd[0]] = true;
          break;
        case "lanceur":
          if (cmd.length < 2) {
            error("Il faut préciser l'id ou le nom du lanceur", arg);
            return;
          }
          options.lanceur = tokenOfId(cmd[1], cmd[1], pageId);
          if (options.lanceur === undefined) {
            error("Argument de --lanceur non valide", cmd);
          }
          return;
        case 'puissant':
          if (cmd.length < 2) {
            options.puissant = "on";
            return;
          }
          switch (cmd[1]) {
            case "oui":
              options.puissant = "on";
              return;
            case "non":
              options.puissant = "off";
              return;
            case "duree":
              options.puissantDuree = true;
              return;
            default:
              error("Option puissant non reconnue", cmd);
          }
          return;
        case "mana":
          if (cmd.length < 2) {
            error("Pas assez d'argument pour --mana", cmd);
            return;
          }
          var cout;
          if (cmd.length > 2 && cmd[1] !== '' && cmd[2] !== '') {
            options.lanceur = tokenOfId(cmd[1], cmd[1], pageId);
            if (options.lanceur === undefined) {
              error("Premier argument de --mana non valide", cmd);
              return;
            }
            cout = parseInt(cmd[2]);
          } else {
            cout = parseInt(cmd[1]);
          }
          if (isNaN(cout) || cout < 0) {
            error("Cout en mana incorrect", cmd);
            return;
          }
          options.mana = cout;
          return;
        case "tempeteDeMana":
          parseTempeteDeMana(cmd, options);
          return;
        case "rang":
          if (cmd.length < 2) {
            error("Usage : --rang r", cmd);
            return;
          }
          var rang = parseInt(cmd[1]);
          if (isNaN(rang) || rang < 1) {
            error("Le rang doit être un nombre positif");
            return;
          }
          options.rang = rang;
          break;
        case 'limiteParJour':
          if (cmd.length < 2) {
            error("Il manque la limite journalière", cmd);
            return;
          }
          var limiteParJour = parseInt(cmd[1]);
          if (isNaN(limiteParJour) || limiteParJour < 1) {
            error("La limite journalière doit être un nombre positif", cmd);
            return;
          }
          options.limiteParJour = limiteParJour;
          if (cmd.length > 2) {
            cmd.splice(0, 2);
            options.limiteParJourRessource = cmd.join('_');
          }
          return;
        case 'limiteCibleParJour':
          if (cmd.length < 2) {
            error("Il manque la limite journalière", cmd);
            return;
          }
          var limiteCibleParJour = parseInt(cmd[1]);
          if (isNaN(limiteCibleParJour) || limiteCibleParJour < 1) {
            error("La limite journalière doit être un nombre positif", cmd);
            return;
          }
          options.limiteCibleParJour = limiteCibleParJour;
          if (cmd.length > 2) {
            cmd.splice(0, 2);
            options.limiteCibleParJourRessource = cmd.join('_');
          }
          return;
        case 'limiteParCombat':
          if (cmd.length < 2) {
            options.limiteParCombat = 1;
            return;
          }
          var limiteParCombat = parseInt(cmd[1]);
          if (isNaN(limiteParCombat) || limiteParCombat < 1) {
            error("La limite par combat doit être un nombre positif", cmd);
            return;
          }
          options.limiteParCombat = limiteParCombat;
          if (cmd.length > 2) {
            cmd.splice(0, 2);
            options.limiteParCombatRessource = cmd.join('_');
          }
          return;
        case "portee":
          if (cmd.length < 2) {
            error("Pas assez d'argument pour --portee n", cmd);
            return;
          }
          var portee;
          if (cmd.length > 2) {
            var tokPortee = tokenOfId(cmd[1], cmd[1], pageId);
            if (tokPortee === undefined) {
              error("Premier argument de --portee non valide", cmd);
              return;
            }
            portee = parseInt(cmd[2]);
          } else {
            portee = parseInt(cmd[1]);
          }
          if (isNaN(portee) || portee < 0) {
            error("Portée incorrecte", cmd);
            return;
          }
          options.portee = portee;
          return;
        case 'saveParTour':
          options.saveParTour = parseSave(cmd);
          return;
        case 'save':
          options.save = parseSave(cmd);
          return;
        case 'dose':
          if (cmd.length < 2) {
            error("Il faut le nom de la dose", cmd);
            return;
          }
          options.dose = cmd[1];
          return;
        case 'decrAttribute':
          if (cmd.length < 2) {
            error("Erreur interne d'une commande générée par bouton", opts);
            return;
          }
          var attr = getObj('attribute', cmd[1]);
          if (attr === undefined) {
            log("Attribut à changer perdu");
            log(cmd);
            return;
          }
          options.decrAttribute = attr;
          return;
        case 'valeur':
          if (cmd.length < 2) {
            error("Il manque la valeur en argument de l'option --valeur", opts);
            return;
          }
          options.valeur = cmd[1];
          if (cmd.length > 2) options.valeurMax = cmd[2];
          return;
        case "fx":
          getFx(cmd, 'fx', options);
          return;
        case 'message':
          if (arg.length > 8) options.message = arg.substring(8);
          return;
        case "targetFx":
          getFx(cmd, 'targetFx', options);
          break;
        case "classeEffet":
          if (cmd.length < 2) {
            sendChat("COF", "Il manque un argument à l'option --classeEffet");
            return;
          }
          options.classeEffet = cmd[1];
          return;
        case "nonVivant":
          options.nonVivant = true;
          if (cmd.length > 1) {
            var nonVivantPerso = tokenOfId(cmd[1], cmd[1], pageId);
            if (nonVivantPerso) {
              options.nonVivant = charAttributeAsBool(nonVivantPerso, 'nonVivant');
            }
          }
          return;
        default:
          return;
      }
    });
    return options;
  }

  function surprise(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd === undefined) {
      error("Problème de parse options", msg.content);
      return;
    }
    var testSurprise;
    if (cmd.length > 1) {
      testSurprise = parseInt(cmd[1]);
      if (isNaN(testSurprise)) testSurprise = undefined;
    }
    var bonusAttrs = ['vigilance', 'perception'];
    if (!options.nonVivant) bonusAttrs.push('radarMental');
    getSelected(msg, function(selected, playerId) {
      if (selected.length === 0) {
        sendPlayer(msg, "!cof-surprise sans sélection de token");
        log("!cof-surprise requiert de sélectionner des tokens");
        return;
      }
      var display;
      if (testSurprise === undefined) {
        display = startFramedDisplay(playerId, "<b>Surprise !</b>");
      } else {
        display = startFramedDisplay(playerId, "Test de surprise difficulté " + testSurprise);
      }
      var evt = {
        type: 'surprise',
      };
      var tokensToProcess = selected.length;
      var sendEvent = function() {
        if (tokensToProcess == 1) {
          addEvent(evt);
          sendChat("", endFramedDisplay(display));
        }
        tokensToProcess--;
      };
      iterSelected(selected, function(perso) {
        if (!isActive(perso)) {
          sendEvent();
          return;
        }
        var name = perso.token.get('name');
        var bonusSurprise = 0;
        if (surveillance(perso)) {
          bonusSurprise += 5;
          setTokenAttr(perso, 'bonusInitEmbuscade', 5, evt, "garde un temps d'avance grâce à son compagnon animal");
          initPerso(perso, evt, true);
        }
        if (testSurprise !== undefined) {
          testCaracteristique(perso, 'SAG', testSurprise, {
              bonus: bonusSurprise,
              bonusAttrs: bonusAttrs
            }, evt,
            function(tr) {
              var result;
              if (tr.reussite) result = "réussi";
              else {
                result = "raté, " + name + " est surpris";
                result += eForFemale(perso.charId);
                setState(perso, 'surpris', true, evt);
              }
              var message = name + " fait " + tr.texte + " : " + result;
              addLineToFramedDisplay(display, message);
              sendEvent();
            });
        } else { //no test
          setState(perso, 'surpris', true, evt);
          addLineToFramedDisplay(display, name + " est surpris." + eForFemale(perso.charId));
          sendEvent();
        }
      }, sendEvent);
    });
  }

  function interchangeable(attackingToken, target, pageId) { //détermine si il y a assez de tokens 
    var token = target.token;
    var charId = target.charId;
    var res = {
      result: false,
      targets: []
    };
    if (!isActive(target)) return res;
    var meuteAttr =
      findObjs({
        _type: 'attribute',
        _characterid: charId,
        name: 'interchangeable'
      });
    if (meuteAttr.length < 1) return res;
    meuteAttr = parseInt(meuteAttr[0].get('current'));
    if (isNaN(meuteAttr) || meuteAttr <= 0) return res;
    var tokens = findObjs({
      _type: 'graphic',
      _subtype: 'token',
      represents: charId,
      _pageid: pageId
    });
    tokens = tokens.filter(function(tok) {
      return isActive({
        token: tok
      });
    });
    res.result = (tokens.length > meuteAttr);
    // Now select the tokens which could be valid targets
    var p = distanceCombat(attackingToken, token);
    if (p === 0) { //cible au contact, on garde toutes celles au contact
      res.targets = tokens.filter(function(tok) {
        var d = distanceCombat(attackingToken, tok);
        return (d === 0);
      });
    } else { // cible à distance, on garde celles au contact de la cible
      res.targets = tokens.filter(function(tok) {
        var d = distanceCombat(token, tok);
        return (d === 0);
      });
    }
    return res;
  }

  var alliesParPerso = {};
  var listeCompetences = {
    FOR: [],
    DEX: [],
    CON: [],
    SAG: [],
    INT: [],
    CHA: []
  };
  // Appelé uniquement après le "ready" et lorsqu'on modifie un handout (fonctionne après l'ajout et la destruction d'un handout)
  // Du coup, alliesParPerso est toujours à jour 
  function changeHandout(hand, prev) {
    if (prev && prev.name && prev.name.startsWith("Equipe ")) {
      var handouts = findObjs({
        _type: 'handout'
      });
      alliesParPerso = {};
      handouts.forEach(parseHandout);
    } else if (hand) {
      parseHandout(hand);
    }
  }

  function charactersInHandout(note, nomEquipe) {
    note = note.trim();
    if (note.startsWith('<p>')) note = note.substring(3);
    note = note.trim().replace(/<p>/g, '<br>');
    note = note.replace(/<\/p>/g, '');
    var names = note.trim().split('<br>');
    var persos = new Set();
    names.forEach(function(name) {
      name = name.replace(/<(?:.|\s)*?>/g, ''); //Pour enlever les <h2>, etc
      name = name.trim();
      if (name.length === 0) return;
      var characters = findObjs({
        _type: 'character',
        name: name
      });
      if (characters.length === 0) {
        log(name + " dans l'équipe " + nomEquipe + " est inconnu");
        return;
      }
      if (characters.length > 1) {
        log(name + " dans l'équipe " + nomEquipe + " est en double");
      }
      characters.forEach(function(character) {
        persos.add(character.id);
      });
    });
    return persos;
  }

  function parseHandout(hand) {
    var handName = hand.get('name');
    if (handName.startsWith("Equipe ")) {
      hand.get('notes', function(note) { // asynchronous
        var persos = charactersInHandout(note, handName);
        persos.forEach(function(charId) {
          var ancien = alliesParPerso[charId];
          if (ancien === undefined) {
            ancien = new Set();
            alliesParPerso[charId] = ancien;
          }
          persos.forEach(function(aci) {
            if (aci == charId) return;
            ancien.add(aci);
          });
        });
      }); //end hand.get('notes')
    } else if (handName == 'Compétences' || handName == 'Competences') {
      listeCompetences = {
        FOR: [],
        DEX: [],
        CON: [],
        SAG: [],
        INT: [],
        CHA: []
      };
      hand.get('notes', function(note) { // asynchronous
        var carac; //La carac dont on spécifie les compétences actuellement
        var lignes = note.trim().replace(/<p>|<\/p>/g, '<br>').split('<br>');
        lignes.forEach(function(ligne) {
          ligne = ligne.trim();
          var header = ligne.split(':');
          if (header.length > 1) {
            var c = header.shift().trim().toUpperCase();
            if (!isCarac(c)) return;
            carac = c;
            ligne = header.join(':').trim();
          }
          if (ligne.length === 0) return;
          if (carac === undefined) {
            error("Compétences sans caractéristique associée", note);
            return;
          }
          var comps = ligne.split(/, |\/| /);
          comps.forEach(function(comp) {
            if (comp.length === 0) return;
            listeCompetences[carac].push(comp);
          });
        });
      }); //end hand.get(notes)
    }
  }

  function estControlleParJoueur(charId) {
    var character = getObj('character', charId);
    if (character === undefined) return false;
    if (character.get('controlledby').length === 0) return false;
    return true;
  }

  function estPJ(perso) {
    var typePerso = ficheAttribute(perso, 'type_personnage', 'PJ');
    if (typePerso == 'PNJ') return false;
    var dv = ficheAttributeAsInt(perso, 'DV', 0);
    if (dv === 0) return false;
    if (perso.token.get('bar1_link') === '') return false;
    return estControlleParJoueur(perso.charId);
  }

  function estAllieJoueur(perso) {
    if (estControlleParJoueur(perso.charId)) return true;
    var allies = alliesParPerso[perso.charId];
    if (allies === undefined) return false;
    var res = false;
    allies.forEach(function(p) {
      res = res || estControlleParJoueur(p);
    });
    return res;
  }

  function setTokenFlagAura(perso) {
    var token = perso.token;
    if (aura_token_on_turn) {
      // ennemi => rouge
      var aura2_color = '#CC0000';

      if (estAllieJoueur(perso)) {
        // equipe => vert
        aura2_color = '#59E594';
      }

      token.set('aura2_radius', '0.1');
      token.set('aura2_color', aura2_color);
      token.set('showplayers_aura2', true);
    } else token.set('status_flying-flag', true);
  }

  function removeTokenFlagAura(token) {
    if (aura_token_on_turn) {
      token.set('aura2_radius', '');
      token.set('showplayers_aura2', false);
    } else token.set('status_flying-flag', false);
  }

  //Si listActions est fourni, ça doit faire référence à une ability
  //dont le nom commence et termine par #, contenant une liste d'actions
  //à afficher
  function turnAction(perso, playerId, listActions) {
    var pageId = perso.token.get('pageid');
    // Toutes les Abilities du personnage lié au Token
    var abilities = findObjs({
      _type: 'ability',
      _characterid: perso.charId,
    });
    var title = 'Actions possibles :';
    if (listActions) {
      title = listActions;
      var fullListActions = '#' + listActions + '#';
      listActions = abilities.find(function(a) {
        return a.get('name') == fullListActions;
      });
    }
    var actionsDuTour = [];
    var actionsParDefaut = false;
    var formeDarbre = false;
    if (listActions) {
      actionsDuTour = [listActions];
    } else {
      if (!isActive(perso)) {
        sendChar(perso.charId, "ne peut pas agir à ce tour");
        return true;
      }
      //On recherche dans le Personnage s'il a une "Ability" dont le nom est #Actions#" ou "#TurnAction#".
      formeDarbre = attributeAsBool(perso, 'formeDArbre');
      if (formeDarbre) {
        actionsDuTour = abilities.filter(function(a) {
          return (a.get('name') == '#FormeArbre#');
        });
        if (actionsDuTour.length === 0) formeDarbre = false;
        else actionsParDefaut = true;
      }
      if (actionsDuTour.length === 0) {
        actionsDuTour = abilities.filter(function(a) {
          switch (a.get('name')) {
            case '#TurnAction#':
              return true;
            case '#Actions#':
              actionsParDefaut = true;
              return true;
            default:
              return false;
          }
        });
      }
    }
    //Si elle existe, on lui chuchotte son exécution 
    if (actionsDuTour.length > 0) {
      // on récupère la valeur de l'action dont chaque Macro #/Ability % est mis dans un tableau 'action'
      var actions = actionsDuTour[0].get('action')
        .replace(/\n/gm, '').replace(/\r/gm, '')
        .replace(/%#([^#]*)#/g, '\n!cof-liste-actions $1')
        .replace(/%/g, '\n%').replace(/#/g, '\n#')
        .split("\n");
      var actionsAAfficher;
      var ligne = '';
      var command = '';
      //Les dégâts aux personnages enveloppés par perso
      var attrs_enveloppe = tokenAttribute(perso, 'enveloppe');
      attrs_enveloppe.forEach(function(a) {
        var cible = tokenOfIdName(a.get('current'), pageId);
        if (cible === undefined) {
          error("Attribut d'enveloppe mal formé ou obsolète", a.get('current'));
          return;
        }
        var enveloppeDM = a.get('max');
        if (enveloppeDM.startsWith('ability ')) {
          enveloppeDM = enveloppeDM.substring(8);
          var abEnveloppe = abilities.find(function(abilitie) {
            return (abilitie.get('name') === enveloppeDM);
          });
          if (abEnveloppe) {
            command = abEnveloppe.get('action').trim();
            command = replaceAction(command, perso);
            command = command.replace(new RegExp(escapeRegExp('@{target|token_id}'), 'g'), cible.token.id);
            ligne += bouton(command, "Infliger DMS à " + cible.tokName, perso, false) + '<br />';
          }
        } else if (enveloppeDM.startsWith('label ')) {
          actionsAAfficher = true;
          command = '!cof-attack ' + perso.token.id + ' ' + cible.token.id + ' ' + enveloppeDM.substring(6) + ' --auto --acide --effet paralyseTemp [[2d6]] --save CON 15';
          ligne += bouton(command, "Infliger DMs à " + cible.tokName, perso, false) + '<br />';
        } //else pas reconnu
      });
      if (attributeAsBool(perso, 'enveloppePar')) {
        actionsAAfficher = true;
        command = '!cof-echapper-enveloppement --target ' + perso.token.id;
        ligne += bouton(command, 'Sortir de la créature', perso, false) + '<br />';
      } else {
        if (formeDarbre) {
          actionsAAfficher = true;
          command = '!cof-attack @{selected|token_id} @{target|token_id} ["Branches",["@{selected|NIVEAU}",0],20,[1,6,3,0],0]';
          ligne += bouton(command, 'Attaque', perso, false) + '<br />';
        }
        //On cherche si il y a une armée conjurée à attaquer
        var attrs_armee =
          findObjs({
            _type: "attribute",
            name: 'armeeConjuree',
          });
        if (attrs_armee.length > 0) {
          var allTokens =
            findObjs({
              _type: "graphic",
              _pageid: pageId,
              _subtype: "token",
              layer: "objects"
            });
          var page = getObj("page", pageId);
          var scale = page.get('scale_number');
          var px = perso.token.get('left');
          var py = perso.token.get('top');
          var pxp = px + 10 * PIX_PER_UNIT / scale;
          var pxm = px - 10 * PIX_PER_UNIT / scale;
          var pyp = py + 10 * PIX_PER_UNIT / scale;
          var pym = py - 10 * PIX_PER_UNIT / scale;
          var ps = tokenSize(perso.token, 0);
          pxp += ps;
          pxm -= ps;
          pyp += ps;
          pym -= ps;
          attrs_armee.forEach(function(aa) {
            var aacid = aa.get('characterid');
            if (aacid == perso.charId) return;
            var invocId = aa.get('current');
            if (invocId == perso.charId) return;
            var allies = alliesParPerso[invocId] || new Set();
            if (allies.has(perso.charId)) return;
            allTokens.forEach(function(t) {
              if (t.get('represents') == aacid) {
                //teste si dans un carré de 20 m de coté autour de l'armée.
                var tx = t.get('left');
                var ty = t.get('top');
                if (tx < pxp && tx > pxm && ty < pyp && ty > pym) {
                  command = '!cof-attack ' + perso.token.id + ' ' + t.id + ' ["AttaqueArmée",[0,0],20,[0,6,' + (charAttributeAsInt(perso, 'NIVEAU', 1) + 1) + ',0],20] --auto --attaqueArmeeConjuree';
                  ligne += bouton(command, "Attaque de l'armée", perso, false) + '<br />';
                }
              }
            });
          });
        }
        //Les soins pour les élémentaires
        if (charAttributeAsBool(perso, 'corpsElementaire')) {
          command = '!cof-soin 5';
          ligne += bouton(command, "Régénération", perso, false) + " si source élémentaire proche<br />";
        }
        if (actions.length > 0) {
          // Toutes les Macros
          var macros = findObjs({
            _type: 'macro'
          });
          var found;
          // On recherche si l'action existe (Ability % ou Macro #)
          actions.forEach(function(action, i) {
            action = action.trim();
            if (action.length > 0) {
              var actionCommands = action.split(' ');
              var actionCmd = actionCommands[0];
              var actionText = action.replace(/-/g, ' ').replace(/_/g, ' ');
              found = false;
              if (actionCmd.startsWith('%')) {
                actionCmd = actionCmd.substr(1);
                actionText = actionText.substr(1);
                abilities.forEach(function(abilitie, index) {
                  if (found) return;
                  if (abilitie.get('name') === actionCmd) {
                    // l'ability existe
                    found = true;
                    command = abilitie.get('action').trim();
                    ligne += bouton(command, actionText, perso, false) + '<br />';
                  }
                });
              } else if (actionCmd.startsWith('#')) {
                actionCmd = actionCmd.substr(1);
                actionText = actionText.substr(1);
                macros.forEach(function(macro, index) {
                  if (found) return;
                  if (macro.get('name') === actionCmd) {
                    found = true;
                    command = macro.get('action').trim();
                    ligne += bouton(command, actionText, perso, false) + '<br />';
                  }
                });
              } else if (actionCmd.startsWith('!')) {
                if (actionCommands.length > 1) {
                  actionText = actionCommands[1].replace(/-/g, ' ').replace(/_/g, ' ');
                }
                command = action;
                ligne += bouton(command, actionText, perso, false) + '<br />';
                found = true;
              }
              if (found) {
                actionsAAfficher = true;
              } else {
                // Si on n'a toujours rien trouvé, on ajoute un petit log
                log('Ability et macro non trouvé : ' + action);
              }
            }
          });
        }
        if (actionsParDefaut) {
          actionsAAfficher = true;
          command = "!cof-attendre ?{Nouvelle initiative}";
          ligne += bouton(command, 'Attendre', perso, false) + '<br />';
          if (!charAttributeAsBool(perso, 'armeeConjuree')) {
            command = "!cof-action-defensive ?{Action défensive|simple|totale}";
            ligne += bouton(command, 'Se défendre', perso, false) + '<br />';
            if (stateCOF.options.affichage.val.manoeuvres.val) {
              command = "!cof-manoeuvre @{selected|token_id} @{target|token_id} ?{Manoeuvre?|aveugler|bloquer|desarmer|faireDiversion|menacer|renverser|tenirADistance|repousser}";
              ligne += bouton(command, 'Manoeuvres', perso, false) + '<br />';
            }
          }
        }
        for (var etat in cof_states) {
          var saveEtat = boutonSaveState(perso, etat);
          if (saveEtat) {
            ligne += saveEtat + '<br />';
            actionsAAfficher = true;
          }
        }
      }
      if (actionsAAfficher) {
        // on envoie la liste aux joueurs qui gèrent le personnage dont le token est lié
        var last_playerid;
        // on récupère les players_ids qui controllent le Token
        var player_ids;
        if (playerId) player_ids = [playerId];
        else player_ids = getPlayerIds(perso);
        if (player_ids.length > 0) {
          _.each(player_ids, function(playerid) {
            last_playerid = playerid;

            var display = startFramedDisplay(playerid, title, perso, {
              chuchote: true
            });
            addLineToFramedDisplay(display, ligne);
            sendChat('', endFramedDisplay(display));
          });
        }
        // En prime, on l'envoie au MJ, si besoin
        if (stateCOF.options.affichage.val.MJ_voit_actions.val || player_ids.length === 0) {
          var display = startFramedDisplay(last_playerid, title, perso, {
            chuchote: 'gm'
          });
          addLineToFramedDisplay(display, ligne);
          sendChat('', endFramedDisplay(display));
        }
      }
    }
    return actionsDuTour.length;
  }

  function apiTurnAction(msg) {
    var cmd = msg.content.split(' ');
    var abil;
    if (cmd.length > 1 && !(cmd[1].startsWith('--'))) abil = cmd[1];
    getSelected(msg, function(selected, playerId) {
      iterSelected(selected, function(perso) {
        var actions = turnAction(perso, playerId, abil);
        if (!actions)
          sendChar(perso.charId, "n'a pas de liste d'actions définie");
      });
    });
  }

  function setActiveToken(tokenId, evt) {
    var pageId = Campaign().get('initiativepage');
    if (stateCOF.activeTokenId) {
      if (tokenId == stateCOF.activeTokenId) return;
      evt.activeTokenId = stateCOF.activeTokenId;
      var prevToken = getObj('graphic', stateCOF.activeTokenId);
      if (prevToken) {
        affectToken(prevToken, 'statusmarkers', prevToken.get('statusmarkers'), evt);
        affectToken(prevToken, 'aura2_radius', prevToken.get('aura2_radius'), evt);
        affectToken(prevToken, 'aura2_color', prevToken.get('aura2_color'), evt);
        affectToken(prevToken, 'showplayers_aura2', prevToken.get('showplayers_aura2'), evt);
        removeTokenFlagAura(prevToken);
      } else {
        if (pageId) {
          prevToken = findObjs({
            _type: 'graphic',
            _subtype: 'token',
            layer: 'objects',
            _pageid: pageId,
            name: stateCOF.activeTokenName
          });
        } else {
          prevToken = findObjs({
            _type: 'graphic',
            _subtype: 'token',
            layer: 'objects',
            name: stateCOF.activeTokenName
          });
        }
        prevToken.forEach(function(o) {
          affectToken(o, 'statusmarkers', o.get('statusmarkers'), evt);
          affectToken(o, 'aura2_radius', o.get('aura2_radius'), evt);
          affectToken(o, 'aura2_color', o.get('aura2_color'), evt);
          affectToken(o, 'showplayers_aura2', o.get('showplayers_aura2'), evt);
          removeTokenFlagAura(o);
        });
      }
    }
    if (tokenId) {
      var perso = tokenOfId(tokenId, tokenId);
      if (perso) {
        var token = perso.token;
        var charId = perso.charId;
        // personnage lié au Token
        affectToken(token, 'statusmarkers', token.get('statusmarkers'), evt);
        affectToken(token, 'aura2_radius', token.get('aura2_radius'), evt);
        affectToken(token, 'aura2_color', token.get('aura2_color'), evt);
        affectToken(token, 'showplayers_aura2', token.get('showplayers_aura2'), evt);
        setTokenFlagAura(perso);
        stateCOF.activeTokenId = tokenId;
        stateCOF.activeTokenName = token.get('name');
        turnAction(perso);
        // Gestion de la confusion
        if (attributeAsBool(perso, "confusion")) {
          //Une chance sur deux de ne pas agir
          if (randomInteger(2) < 2) {
            sendChar(charId, "est en pleine confusion. Il ne fait rien ce tour");
            removeTokenFlagAura(token);
          } else {
            //Trouver la créature la plus proche
            var closestToken;
            pageId = token.get('pageid');
            var toksOnPage = findObjs({
              _type: 'graphic',
              _subtype: 'token',
              _pageid: pageId,
              layer: 'objects'
            });
            toksOnPage.forEach(function(tok) {
              if (tok.id == tokenId) return;
              var perso = {
                token: tok
              };
              perso.charId = tok.get('represents');
              if (perso.charId === '') return;
              if (getState(perso, 'mort')) return;
              var dist = distanceCombat(token, tok, pageId);
              if (closestToken) {
                if (dist > closestToken.distance) return;
                if (dist < closestToken.distance) {
                  closestToken = {
                    distance: dist,
                    names: [tok.get('name')]
                  };
                  return;
                }
                closestToken.names.push(tok.get('name'));
                return;
              }
              closestToken = {
                distance: dist,
                names: [tok.get('name')]
              };
            });
            if (closestToken) {
              var r = randomInteger(closestToken.names.length) - 1;
              sendChar(charId,
                "est en pleine confusion. " + onGenre(charId, 'Il', 'Elle') +
                " attaque " + closestToken.names[r] + ".");
            } else {
              sendChar(charId, "est seul et en plein confusion");
            }
          }
        }
        //On enlève aussi les états qui ne durent qu'un tour
        var defenseTotale = tokenAttribute(perso, 'defenseTotale');
        if (defenseTotale.length > 0) {
          defenseTotale = defenseTotale[0];
          var tourDefTotale = defenseTotale.get('max');
          if (tourDefTotale < stateCOF.tour) {
            evt.deletedAttributes = evt.deletedAttributes || [];
            evt.deletedAttributes.push(defenseTotale);
            defenseTotale.remove();
          }
        }
      } else {
        error("Impossible de trouver le token dont c'est le tour", tokenId);
        stateCOF.activeTokenId = undefined;
      }
    } else stateCOF.activeTokenId = undefined;
  }

  function getTurnOrder(evt) {
    var turnOrder = Campaign().get('turnorder');
    evt.turnorder = evt.turnorder || turnOrder;
    if (turnOrder === "") {
      turnOrder = [{
        id: "-1",
        pr: 1,
        custom: "Tour",
        formula: "+1"
      }];
      evt.tour = stateCOF.tour;
      stateCOF.tour = 1;
    } else {
      turnOrder = JSON.parse(turnOrder);
    }
    var indexTour = turnOrder.findIndex(function(elt) {
      return (elt.id == "-1" && elt.custom == "Tour");
    });
    if (indexTour == -1) {
      indexTour = turnOrder.length;
      turnOrder.push({
        id: "-1",
        pr: 1,
        custom: "Tour",
        formula: "+1"
      });
      evt.tour = stateCOF.tour;
      stateCOF.tour = 1;
    }
    var res = {
      tour: turnOrder[indexTour],
      pasAgi: turnOrder.slice(0, indexTour),
      dejaAgi: turnOrder.slice(indexTour + 1, turnOrder.length)
    };
    return res;
  }

  function setTurnOrder(to, evt) {
    if (to.pasAgi.length > 0) {
      to.pasAgi.sort(function(a, b) {
        if (a.id == "-1") return 1;
        if (b.id == "-1") return -1;
        if (a.pr < b.pr) return 1;
        if (b.pr < a.pr) return -1;
        // Priorité aux joueurs
        // Premier critère : la barre de PV des joueurs est liée
        var tokenA = getObj('graphic', a.id);
        if (tokenA === undefined) return 1;
        var tokenB = getObj('graphic', b.id);
        if (tokenB === undefined) return -1;
        if (tokenA.get('bar1_link') === '') {
          if (tokenB.get('bar1_link') === '') return 0;
          return 1;
        }
        if (tokenB.get('bar1_link') === '') return -1;
        // Deuxième critère : les joueurs ont un DV
        var charIdA = tokenA.get('represents');
        if (charIdA === '') return 1;
        var charIdB = tokenB.get('represents');
        if (charIdB === '') return -1;
        var persoA = {
          token: tokenA,
          charId: charIdA
        };
        var persoB = {
          token: tokenB,
          charId: charIdB
        };
        var dvA = ficheAttributeAsInt(persoA, "DV", 0);
        var dvB = ficheAttributeAsInt(persoB, "DV", 0);
        if (dvA === 0) {
          if (dvB === 0) return 0;
          return 1;
        }
        if (dvB === 0) return -1;
        //Entre joueurs, priorité à la plus grosse sagesse
        var sagA = ficheAttributeAsInt(persoA, 'SAGESSE', 10);
        var sagB = ficheAttributeAsInt(persoB, 'SAGESSE', 10);
        if (sagA < sagB) return 1;
        if (sagB > sagA) return -1;
        return 0;
      });
      setActiveToken(to.pasAgi[0].id, evt);
    }
    to.pasAgi.push(to.tour);
    var turnOrder = to.pasAgi.concat(to.dejaAgi);
    Campaign().set('turnorder', JSON.stringify(turnOrder));
  }

  function attendreInit(msg) {
    getSelected(msg, function(selected) {
      if (selected === undefined || selected.length === 0) {
        error("La fonction !cof-attendre : rien à faire, pas de token selectionné", msg);
        return;
      }
      var cmd = msg.content.split(' ');
      if (cmd.length < 2) {
        error("Attendre jusqu'à quelle initiative ?", cmd);
        return;
      }
      var newInit = parseInt(cmd[1]);
      if (isNaN(newInit) || newInit < 1) {
        error("On ne peut attendre que jusqu'à une initiative de 1", cmd);
        newInit = 1;
      }
      var evt = {
        type: "attente"
      };
      var to = getTurnOrder(evt);
      iterSelected(selected, function(perso) {
        var charId = perso.charId;
        var token = perso.token;
        if (!isActive(perso)) return;
        var tokenPos =
          to.pasAgi.findIndex(function(elt) {
            return (elt.id == token.id);
          });
        if (tokenPos == -1) { // token ne peut plus agir
          sendChar(charId, " a déjà agit ce tour");
          return;
        }
        if (newInit < to.pasAgi[tokenPos].pr) {
          to.pasAgi[tokenPos].pr = newInit;
          sendChar(charId, " attend un peu avant d'agir...");
          updateNextInit(token);
        } else {
          sendChar(charId, " a déjà une initiative inférieure à " + newInit);
        }
      });
      setTurnOrder(to, evt);
      addEvent(evt);
    });
  }

  function statut(msg) { // show some character informations
    getSelected(msg, function(selected, playerId) {
      if (selected.length === 0) {
        error("Dans !cof-statut : rien à faire, pas de token selectionné", msg);
        return;
      }
      iterSelected(selected, function(perso) {
        var token = perso.token;
        var charId = perso.charId;
        var name = token.get('name');
        var lie = true;
        if (token.get('bar1_link') === '') lie = false;
        var display = startFramedDisplay(playerId, "État de " + name, perso, {
          chuchote: true
        });
        var line =
          "Points de vie    : " + token.get('bar1_value') + " / ";
        if (persoEstPNJ(perso)) line += getAttrByName(charId, 'pnj_pv', 'max');
        else line += getAttrByName(charId, 'PV', 'max');
        addLineToFramedDisplay(display, line);
        var manaAttr = findObjs({
          _type: 'attribute',
          _characterid: charId,
          name: 'PM'
        });
        var hasMana = false;
        if (manaAttr.length > 0) {
          var manaMax = parseInt(manaAttr[0].get('max'));
          hasMana = !isNaN(manaMax) && manaMax > 0;
        }
        var dmTemp = parseInt(token.get('bar2_value'));
        if (hasMana) {
          var mana = dmTemp;
          if (lie) mana = manaAttr[0].get('current');
          line = "Points de mana   : " + mana + " / " + manaAttr[0].get('max');
          addLineToFramedDisplay(display, line);
          dmTemp = attributeAsInt(perso, 'DMTEMP', 0);
        } else if (lie) {
          dmTemp = ficheAttributeAsInt(perso, 'DMTEMP', 0);
        }
        if (!isNaN(dmTemp) && dmTemp > 0) {
          line = "Dommages temporaires : " + dmTemp;
          addLineToFramedDisplay(display, line);
        }
        var aDV = charAttributeAsInt(perso, 'DV', 0);
        if (aDV > 0) { // correspond aux PJs
          var pr = pointsDeRecuperation(perso);
          line =
            "Points de récupération : " + pr.current + " / " + pr.max;
          addLineToFramedDisplay(display, line);
          line =
            "Points de chance : " + attributeAsInt(perso, 'PC', 0) + " / " +
            (3 + modCarac(perso, 'CHARISME'));
          addLineToFramedDisplay(display, line);
          var pacifisme =
            findObjs({
              _type: "attribute",
              _characterid: charId,
              name: "pacifisme"
            });
          if (pacifisme.length > 0) {
            pacifisme = parseInt(pacifisme[0].get('current'));
            if (!isNaN(pacifisme)) {
              if (pacifisme > 0) addLineToFramedDisplay(display, "Pacifisme actif");
              else addLineToFramedDisplay(display, "Pacifisme non actif");
            }
          }
        }
        var attrsChar = findObjs({
          _type: 'attribute',
          _characterid: charId
        });
        var attrsArmes = attrsChar.filter(function(attr) {
          var attrName = attr.get('name');
          return (attrName.startsWith("repeating_armes_") &&
            attrName.endsWith("_armenom"));
        });
        var armeEnMain =
          attrsChar.find(function(a) {
            return a.get('name') == 'armeEnMain';
          });
        if (armeEnMain) armeEnMain = armeEnMain.get('current');
        attrsArmes.forEach(function(attr) {
          var nomArme = attr.get('current');
          var armeLabel = nomArme.split(' ', 1)[0];
          nomArme = nomArme.substring(nomArme.indexOf(' ') + 1);
          var charge = attrsChar.find(function(a) {
            return (a.get('name') == 'charge_' + armeLabel);
          });
          if (charge) {
            charge = parseInt(charge.get('current'));
            if (!isNaN(charge)) {
              if (charge === 0) {
                line = nomArme + " n'est pas chargé";
              } else {
                var grenaille = attrsChar.find(function(a) {
                  return (a.get('name') == 'chargeGrenaille_' + armeLabel);
                });
                if (grenaille) {
                  grenaille = parseInt(grenaille.get('current'));
                  if (isNaN(grenaille) || grenaille < 0) grenaille = 0;
                } else grenaille = 0;
                if (charge == 1) {
                  line = nomArme + " est chargé";
                  if (grenaille) line += " de grenaille";
                } else if (charge > 1) {
                  line = nomArme + " contient encore " + charge + " charges";
                  if (grenaille == charge) line += " de grenaille";
                  else if (grenaille)
                    line += ", dont " + grenaille + " de grenaille";
                }
              }
              if (armeEnMain == armeLabel) line += " et en main";
              else line += ", pas en main";
              addLineToFramedDisplay(display, line);
            }
          } else if (armeEnMain == armeLabel) {
            addLineToFramedDisplay(display, "tient " + nomArme + " en main.");
          }
          if (attributeAsBool(perso, 'poisonRapide_' + armeLabel)) {
            addLineToFramedDisplay(display, nomArme + " est enduit de poison.");
          }
        });
        if (attributeAsInt(perso, 'enflamme', 0))
          addLineToFramedDisplay(display, "en flammes");
        var attrEnveloppe = tokenAttribute(perso, 'enveloppePar');
        if (attrEnveloppe.length > 0) {
          var cube = tokenOfIdName(attrEnveloppe[0].get('current'));
          if (cube) {
            addLineToFramedDisplay(display, "est enveloppé dans " + cube.tokName);
          }
        }
        var bufDef = attributeAsInt(perso, 'bufDEF', 0);
        if (bufDef > 0)
          addLineToFramedDisplay(display, "Défense temporairement modifiée de " + bufDef);
        for (var etat in cof_states) {
          if (getState(perso, etat)) {
            var etext = etat;
            if (etext.endsWith('e')) etext = etext.substring(0, etext.length - 1) + 'é';
            etext += eForFemale(charId);
            var saveEtat = boutonSaveState(perso, etat);
            if (saveEtat) etext += ", " + saveEtat;
            addLineToFramedDisplay(display, etext);
          }
        }
        if (ficheAttributeAsInt(perso, 'DEFARMUREON', 1) === 0) {
          addLineToFramedDisplay(display, "Ne porte pas son armure");
          if (charAttributeAsInt(perso, 'vetementsSacres', 0) > 0)
            addLineToFramedDisplay(display, "  mais bénéficie de ses vêtements sacrés");
          if (charAttributeAsInt(perso, 'armureDeVent', 0) > 0)
            addLineToFramedDisplay(display, "  mais bénéficie de son armure de vent");
        }
        if (ficheAttributeAsInt(perso, 'DEFBOUCLIERON', 1) === 0 &&
          ficheAttributeAsInt(perso, 'DEFBOUCLIER', 0))
          addLineToFramedDisplay(display, "Ne porte pas son bouclier");
        if (attributeAsBool(perso, 'etatExsangue')) {
          addLineToFramedDisplay(display, "est exsangue");
        }
        if (attributeAsBool(perso, 'malediction')) {
          addLineToFramedDisplay(display, "est maudit...");
        }
        var allAttrs = findObjs({
          _type: 'attribute',
          _characterid: charId
        });
        allAttrs.forEach(function(attr) {
          var attrName = attr.get('name');
          if (!lie && !attrName.endsWith('_' + name)) return;
          if (estEffetTemp(attrName)) {
            var effet = effetTempOfAttribute(attr);
            var mt = messageEffetTemp[effet];
            if (lie) {
              if (mt.generic) {
                if (attrName.indexOf(')_') > 0) return;
              } else if (effet != attrName) return;
            }
            addLineToFramedDisplay(display, mt.actif);
          } else if (estEffetCombat(attrName)) {
            var effetC = effetCombatOfAttribute(attr);
            if (lie && effetC != attrName) return;
            addLineToFramedDisplay(display, messageEffetCombat[effetC].actif);
          } else if (estEffetIndetermine(attrName)) {
            var effetI = effetIndetermineOfAttribute(attr);
            if (lie && effetI != attrName) return;
            addLineToFramedDisplay(display, messageEffetIndetermine[effetI].actif);
          }
        });
        allAttributesNamed(attrsChar, 'munition').forEach(function(attr) {
          var attrName = attr.get('name');
          var underscore = attrName.indexOf('_');
          if (underscore < 0 || underscore == attrName.length - 1) return;
          var munitionNom = attrName.substring(underscore + 1).replace(/_/g, ' ');
          addLineToFramedDisplay(display, munitionNom + " : " + attr.get('current') + " / " + attr.get('max'));
        });
        var attrPosture = tokenAttribute(perso, 'postureDeCombat');
        if (attrPosture.length > 0) {
          attrPosture = attrPosture[0];
          var posture = attrPosture.get('max');
          var postureMsg = "a une posture ";
          switch (posture.substr(-3, 3)) {
            case 'DEF':
              postureMsg += "défensive";
              break;
            case 'ATT':
              postureMsg += "offensive";
              break;
            case '_DM':
              postureMsg += "puissante";
              break;
            default:
          }
          postureMsg += " mais ";
          switch (posture.substr(0, 3)) {
            case 'DEF':
              postureMsg += "risquée";
              break;
            case 'ATT':
              postureMsg += "moins précise";
              break;
            case 'DM_':
              postureMsg += "moins puissante";
              break;
            default:
          }
          addLineToFramedDisplay(display, postureMsg);
        }
        sendChat("", endFramedDisplay(display));
      });
    });
  }

  function removeFromTurnTracker(tokenId, evt) {
    var turnOrder = Campaign().get('turnorder');
    if (turnOrder === "" || !stateCOF.combat) {
      return;
    }
    evt.turnorder = evt.turnorder || turnOrder;
    turnOrder = JSON.parse(turnOrder).filter(
      function(elt) {
        return (elt.id != tokenId);
      });
    Campaign().set('turnorder', JSON.stringify(turnOrder));
  }

  function replaceInTurnTracker(tidOld, tidNew, evt) {
    var turnOrder = Campaign().get('turnorder');
    if (turnOrder === "" || !stateCOF.combat) {
      return;
    }
    evt.turnorder = evt.turnorder || turnOrder;
    turnOrder = JSON.parse(turnOrder);
    turnOrder.forEach(function(elt) {
      if (elt.id == tidOld) elt.id = tidNew;
    });
    Campaign().set('turnorder', JSON.stringify(turnOrder));
    if (tidOld == stateCOF.activeTokenId)
      stateCOF.activeTokenId = tidNew;
  }

  function eForFemale(charId) {
    return onGenre(charId, '', 'e');
  }

  function armureMagique(msg) {
    msg.content += " armureMagique";
    effetCombat(msg);
  }

  function bufDef(msg) {
    var cmd = msg.content.split(' ');
    if (cmd.length < 2) {
      error("La fonction !cof-buf-def attend un argument", cmd);
      return;
    }
    var buf = parseInt(cmd[1]);
    if (isNaN(buf)) {
      error("Argument de !cof-bu-def invalide", cmd);
      return;
    }
    if (buf === 0) return;
    var message = "";
    if (buf > 0) message = "voit sa défense augmenter";
    else message = "voit sa défense baisser";
    var evt = {
      type: 'other'
    };
    getSelected(msg, function(selected) {
      if (selected === undefined || selected.length === 0) {
        sendPlayer(msg, "Pas de token sélectionné pour !cof--buf-def");
      }
      iterSelected(selected, function(perso) {
        setTokenAttr(perso, 'bufDEF', buf, evt, message);
        setToken(perso.token, 'status_blue', buf, evt);
      });
      if (evt.attributes.length === 0) {
        error("Pas de cible valide sélectionnée pour !cod-buf-def", msg);
        return;
      }
      addEvent(evt);
    });
  }

  function removeBufDef(msg) {
    var evt = {
      type: 'other'
    };
    getSelected(msg, function(selected) {
      if (selected === undefined || selected.length === 0) {
        sendPlayer(msg, "Pas de token sélectionné pour !cof-remove-buf-def");
      }
      iterSelected(selected, function(perso) {
        removeTokenAttr(perso, 'bufDEF', evt, "retrouve sa défense normale");
        setToken(perso.token, 'status_blue', false, evt);
      });
      addEvent(evt);
    });
  }

  //retourne un entier
  // evt n'est défini que si la caractéristique est effectivement utlilisée
  function bonusTestCarac(carac, personnage, evt) {
    var bonus = modCarac(personnage, caracOfMod(carac));
    bonus += ficheAttributeAsInt(personnage, carac + "_BONUS", 0);
    if (attributeAsBool(personnage, 'chantDesHeros')) {
      var bonusChantDesHeros = getValeurOfEffet(personnage, 'chantDesHeros', 1);
      var chantDesHerosIntense = attributeAsInt(personnage, 'chantDesHerosTempeteDeManaIntense', 0);
      bonusChantDesHeros += chantDesHerosIntense;
      bonus += bonusChantDesHeros;
      if (chantDesHerosIntense && evt)
        removeTokenAttr(personnage, 'chantDesHerosTempeteDeManaIntense', evt);
    }
    if (attributeAsBool(personnage, 'benediction')) {
      var bonusBenediction = getValeurOfEffet(personnage, 'benediction', 1);
      var benedictionIntense = attributeAsInt(personnage, 'benedictionTempeteDeManaIntense', 0);
      bonusBenediction += benedictionIntense;
      bonus += bonusBenediction;
      if (benedictionIntense && evt)
        removeTokenAttr(personnage, 'benedictionTempeteDeManaIntense', evt);
    }
    if (attributeAsBool(personnage, 'lameDeLigneePerdue')) {
      bonus -= 1;
    }
    if (attributeAsBool(personnage, 'strangulation')) {
      var malusStrangulation =
        1 + attributeAsInt(personnage, 'dureeStrangulation', 0);
      bonus -= malusStrangulation;
    }
    if (attributeAsBool(personnage, 'nueeDInsectes')) {
      var malusNuee = 2 + attributeAsInt(personnage, 'nueeDInsectesTempeteDeManaIntense', 0);
      bonus -= malusNuee;
      if (malusNuee > 2 && evt)
        removeTokenAttr(personnage, 'nueeDInsectesTempeteDeManaIntense', evt);
    }
    if (attributeAsBool(personnage, 'etatExsangue')) {
      bonus -= 2;
    }
    if (attributeAsBool(personnage, 'putrefactionOutrTombe')) {
      bonus -= 2;
    }
    var fortifie = attributeAsInt(personnage, 'fortifie', 0);
    if (fortifie > 0) {
      bonus += 3;
      if (evt) {
        fortifie--;
        if (fortifie === 0) {
          removeTokenAttr(personnage, 'fortifie', evt);
        } else {
          setTokenAttr(personnage, 'fortifie', fortifie, evt);
        }
      }
    }
    switch (carac) {
      case 'DEX':
        if (ficheAttributeAsInt(personnage, 'DEFARMUREON', 1))
          bonus -= ficheAttributeAsInt(personnage, 'DEFARMUREMALUS', 0);
        if (ficheAttributeAsInt(personnage, 'DEFBOUCLIERON', 1))
          bonus -= ficheAttributeAsInt(personnage, 'DEFBOUCLIERMALUS', 0);
        if (attributeAsBool(personnage, 'agrandissement'))
          bonus -= 2;
        if (attributeAsBool(personnage, 'aspectDuDemon'))
          bonus += getValeurOfEffet(personnage, 'aspectDuDemon', 2);
        break;
      case 'FOR':
        if (attributeAsBool(personnage, 'rayonAffaiblissant'))
          bonus -= 2;
        if (attributeAsBool(personnage, 'agrandissement'))
          bonus += 2;
        if (attributeAsBool(personnage, 'aspectDuDemon'))
          bonus += getValeurOfEffet(personnage, 'aspectDuDemon', 2);
        break;
      case 'CHA':
        if (attributeAsBool(personnage, 'aspectDeLaSuccube'))
          bonus += getValeurOfEffet(personnage, 'aspectDeLaSuccube', 5);
        break;
      case 'CON':
        if (attributeAsBool(personnage, 'mutationSilhouetteMassive'))
          bonus += 5;
        if (charAttributeAsBool(personnage, 'controleDuMetabolisme'))
          bonus += modCarac(personnage, 'CHARISME');
        if (attributeAsBool(personnage, 'aspectDuDemon'))
          bonus += getValeurOfEffet(personnage, 'aspectDuDemon', 2);
        break;
    }
    return bonus;
  }

  function deTest(personnage, carac) {
    var dice = 20;
    if (estAffaibli(personnage) || getState(personnage, 'immobilise') ||
      (carac == 'DEX' && getState(personnage, 'encombre')))
      dice = 12;
    return dice;
  }

  //callback peut prendre en argument une structure avec les champs:
  // - texte: Le texte du jet
  // - total : Le résultat total du jet
  // - echecCritique, critique pour indiquer si 1 ou 20
  // - roll: le inlineroll (pour les statistiques)
  function jetCaracteristique(personnage, carac, options, evt, callback) {
    var token = personnage.token;
    var bonusCarac = bonusTestCarac(carac, personnage, evt);
    if (options.bonusAttrs) {
      options.bonusAttrs.forEach(function(attr) {
        bonusCarac += charAttributeAsInt(personnage, attr, 0);
      });
    }
    if (options.bonus) bonusCarac += options.bonus;

    var carSup = nbreDeTestCarac(carac, personnage);
    var de = computeDice(personnage, {
      nbDe: carSup,
      carac: carac
    });

    var bonusText = (bonusCarac > 0) ? ' + ' + bonusCarac : (bonusCarac === 0) ? "" : ' - ' + (-bonusCarac);
    var rollExpr = "[[" + de + "cs20cf1" + "]]";

    sendChat("", rollExpr, function(res) {
      var rolls = res[0];
      var d20roll = rolls.inlinerolls[0].results.total;
      var rtext = buildinline(rolls.inlinerolls[0]) + bonusText;
      var rt = {
        total: d20roll + bonusCarac
      };
      if (d20roll == 1) {
        rtext += " -> échec critique";
        rt.echecCritique = true;
      } else if (d20roll == 20) {
        rtext += " -> réussite critique";
        rt.critique = true;
      } else if (bonusCarac !== 0) rtext += " = " + rt.total;
      rt.texte = rtext;
      rt.roll = rolls.inlinerolls[0];
      callback(rt);
    });
  }


  // Ne pas remplacer les inline rolls, il faut les afficher correctement
  function dmgDirects(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd === undefined || cmd.length < 2) {
      error("cof-dmg prend les dégats en argument, avant les options",
        msg.content);
      return;
    }
    getSelected(msg, function(selected, playerId) {
      if (selected === undefined || selected.length === 0) {
        sendPlayer(msg, "pas de cible trouvée, action annulée");
        return;
      }
      var evt = {
        type: 'dégâts directs',
      };
      if (limiteRessources(options.lanceur, options, 'dmg', 'dmg', evt)) return;
      var action = "<b>Dégâts.</b>";
      var optArgs = msg.content.split(' --');
      var partialSave;
      options.aoe = true;
      optArgs.forEach(function(opt) {
        opt = opt.trim().split(' ');
        opt = opt.filter(function(c) {
          return c !== '';
        });
        switch (opt[0]) {
          case 'psave':
            var psaveopt = options;
            if (options.additionalDmg && opt.length > 3 && opt[3] == 'local') {
              var psavel = options.additionalDmg.length;
              if (psavel > 0) {
                psaveopt = options.additionalDmg[psavel - 1];
              }
            }
            var psaveParams = parseSave(opt);
            if (psaveParams) {
              psaveopt.partialSave = psaveParams;
              action +=
                " Jet de " + psaveParams.carac + " difficulté " + psaveParams.seuil +
                " pour réduire les dégâts";
            }
            return;
          case 'once':
            if (opt.length < 2) {
              error("Il manque l'id de l'événement qui a provoqué les dégâts", optArgs);
              options.return = true;
              return;
            }
            var originalEvt = findEvent(opt[1]);
            if (originalEvt === undefined) {
              sendPlayer(msg, "Trop tard pour les dégâts : l'action de départ est trop ancienne ou a été annulée");
              options.return = true;
              return;
            }
            if (originalEvt.waitingForAoe) {
              evt = originalEvt;
              // Il faudra enlever waitingForAoe à la place de faire un addEvent
              return;
            }
            sendPlayer(msg, "Action déjà effectuée");
            options.return = true;
            return;
          case 'asphyxie':
          case 'affute':
          case "metal":
          case 'vampirise':
          case 'magique':
          case 'artificiel':
          case 'tranchant':
          case 'percant':
          case 'contondant':
          case 'tempDmg':
          case 'morts-vivants':
          case 'ignoreRD':
          case 'ignoreMoitieRD':
          case 'maxDmg':
            options[opt[0]] = true;
            return;
          case "feu":
          case "froid":
          case "acide":
          case "electrique":
          case "sonique":
          case "poison":
          case "maladie":
            if (options.additionalDmg) {
              var l = options.additionalDmg.length;
              if (l > 0) {
                options.additionalDmg[l - 1].type = opt[0];
              } else {
                options.type = opt[0];
              }
            } else options.type = opt[0];
            return;
          case "nature":
          case "naturel":
            options.nature = true;
            return;
        }
      });
      if (options.return) return;
      //L'expression à lancer est tout ce qui est entre le premier blanc et le premier --
      var debutDmgRollExpr = msg.content.indexOf(' ') + 1;
      var dmgRollExpr = msg.content.substring(debutDmgRollExpr);
      var finDmgRollExpr = msg.content.indexOf(' --');
      if (finDmgRollExpr > debutDmgRollExpr)
        dmgRollExpr = msg.content.substring(debutDmgRollExpr, finDmgRollExpr);
      else dmgRollExpr = msg.content.substring(debutDmgRollExpr);
      dmgRollExpr = dmgRollExpr.trim();
      var dmgType = options.type || 'normal';
      var dmg = {
        type: dmgType,
        value: dmgRollExpr
      };
      if (options.maxDmg) {
        dmgRollExpr = dmgRollExpr.replace(/d([1-9])/g, "*$1");
      }
      sendChat('', '[[' + dmgRollExpr + ']]', function(resDmg) {
        var rollsDmg = resDmg[0];
        var afterEvaluateDmg = rollsDmg.content.split(' ');
        var dmgRollNumber = rollNumber(afterEvaluateDmg[0]);
        dmg.total = rollsDmg.inlinerolls[dmgRollNumber].results.total;
        dmg.display = buildinline(rollsDmg.inlinerolls[dmgRollNumber], dmgType, options.magique);
        var display = startFramedDisplay(playerId, action);
        var tokensToProcess = selected.length;
        var someDmgDone;
        var finalDisplay = function() {
          if (tokensToProcess == 1) {
            if (someDmgDone) {
              sendChat("", endFramedDisplay(display));
              if (evt.affectes || evt.attributes) {
                if (evt.waitingForAoe) {
                  delete evt.waitingForAoe;
                } else {
                  addEvent(evt);
                }
              }
            } else {
              sendPlayer(msg, "Aucune cible valide n'a été sélectionée");
            }
          }
          tokensToProcess--;
        };
        iterSelected(selected, function(perso) {
          if (options['morts-vivants'] && !(estMortVivant(perso))) {
            sendPlayer(msg, perso.token.get('name') + " n'est pas un mort-vivant");
            finalDisplay();
            return;
          }
          var name = perso.token.get('name');
          var explications = [];
          perso.ignoreRD = options.ignoreRD;
          perso.ignoreMoitieRD = options.ignoreMoitieRD;
          perso.tempDmg = options.tempDmg;
          dealDamage(perso, dmg, [], evt, false, options, explications,
            function(dmgDisplay, dmgFinal) {
              someDmgDone = true;
              addLineToFramedDisplay(display,
                name + " reçoit " + dmgDisplay + " DM");
              explications.forEach(function(e) {
                addLineToFramedDisplay(display, e, 80, false);
              });
              finalDisplay();
            });
        }, finalDisplay); //fin iterSelected
      }); //fin du jet de dés
    }, options); //fin du getSelected
  }

  function findRollNumber(msg) {
    if (msg.length > 4) {
      if (msg.substring(0, 3) == '$[[') {
        var res = rollNumber(msg);
        if (isNaN(res)) return undefined;
        return res;
      }
    }
    return undefined;
  }

  function estElementaire(t) {
    if (t === undefined) return false;
    return (t == "feu" || t == "froid" || t == "acide" || t == "electrique");
  }

  function interfaceSetState(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd === undefined || cmd.length < 3) {
      error("Pas assez d'arguments pour !cof-set-state", msg.content);
      return;
    }
    var etat = cmd[1];
    var valeur = cmd[2];
    if (valeur == "false" || valeur == "0") valeur = false;
    if (valeur == "true") valeur = true;
    if (!_.has(cof_states, etat)) {
      error("Le premier argument de !cof-set-state n'est pas un état valide", cmd);
      return;
    }
    var save;
    if (isCarac(cmd[2])) {
      if (cmd.length < 4) {
        error("Il manque la difficulté du jet de sauvegarde.", cmd);
        return;
      }
      valeur = true;
      save = {
        carac: cmd[2]
      };
      var opposition = tokenOfId(cmd[3]);
      if (opposition) {
        save.difficulte = cmd[3] + ' ' + opposition.token.get('name');
      } else {
        save.difficulte = parseInt(cmd[3]);
        if (isNaN(save.difficulte)) {
          error("Difficulté du jet de sauvegarde incorrecte", cmd);
          return;
        }
      }
    }
    var evt = {
      type: "set_state",
    };
    getSelected(msg, function(selected) {
      if (selected === undefined || selected.length === 0) {
        error("Pas de cible pour le changement d'état", msg);
        return;
      }
      var lanceur = options.lanceur;
      if (lanceur === undefined && selected.length == 1)
        lanceur = tokenOfId(selected[0]._id);
      if (limiteRessources(lanceur, options, etat, etat, evt)) return;
      if (options.message) {
        if (lanceur) sendChar(lanceur.charId, options.message);
        else sendChat('', options.message);
      }
      iterSelected(selected, function(perso) {
        setState(perso, etat, valeur, evt);
        if (save) {
          setTokenAttr(perso, etat + 'Save', save.carac, evt, undefined, save.difficulte);
        }
      });
      addEvent(evt);
    });
  }

  function textOfSaveState(etat) {
    switch (etat) {
      case 'immobilise':
        return "se libérer";
      case 'aveugle':
        return "retrouver la vue";
      case 'etourdi':
        return "reprendre ses esprits";
      case 'assome':
        return "reprendre conscience";
      case 'renverse':
        return "se relever";
      case 'endormi':
        return "se réveiller";
      case 'apeure':
        return "retrouver du courage";
      default:
        return "ne plus être " + etat;
    }
  }

  function saveState(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd === undefined || cmd.length < 4 ||
      !_.has(cof_states, cmd[1]) || !isCarac(cmd[2])) {
      error("Paramètres de !cof-save-state incorrects", cmd);
      return;
    }
    var etat = cmd[1];
    var carac = cmd[2];
    var titre = 'Jet de ' + carac + ' pour ' + textOfSaveState(etat);
    getSelected(msg, function(selected, playerId) {
      if (selected.length === 0) {
        error("Pas de token sélectionné", msg.content);
        return;
      }
      var pageId = options.pageId;
      if (pageId === undefined) {
        iterSelected(selected, function(perso) {
          if (pageId) return;
          pageId = perso.token.get('pageid');
        });
      }
      var opposant = tokenOfId(cmd[3], cmd[4], pageId);
      if (opposant) {
        iterSelected(selected, function(perso) {
          if (!getState(perso, etat)) {
            sendChar(perso.charId, "n'est pas " + etat + eForFemale(perso.charId));
            return;
          }
          var evt = {
            type: titre
          };
          var display = startFramedDisplay(playerId, titre, perso, {
            perso2: opposant
          });
          var explications = [];
          testOppose(perso, carac, opposant, carac, explications, evt,
            function(resultat, crit) {
              if (resultat == 2) {
                explications.push(perso.token.get('name') + " est toujours " + etat + eForFemale(perso.charId));
              } else {
                setState(perso, etat, false, evt);
                explications.push(perso.token.get('name') + " n'est plus " + etat + eForFemale(perso.charId));
              }
              explications.forEach(function(e) {
                addLineToFramedDisplay(display, e);
              });
              addEvent(evt);
              sendChat("", endFramedDisplay(display));
            }); //fin test opposé (asynchrone)
        }); //fin iterSelected du cas avec opposant
      } else {
        var seuil = parseInt(cmd[3]);
        if (isNaN(seuil)) {
          error("La difficulté n'est pas un nombre", cmd);
          return;
        }
        iterSelected(selected, function(perso) {
          if (!getState(perso, etat)) {
            sendChar(perso.charId, "n'est pas " + etat + eForFemale(perso.charId));
            return;
          }
          var evt = {
            type: titre
          };
          testCaracteristique(perso, carac, seuil, {}, evt, function(res) {
            sendChar(perso.charId, titre + " : " + res.texte);
            if (res.reussite) {
              setState(perso, etat, false, evt);
              sendChar(perso.charId, res.texte + " &ge; " + seuil + ", " + perso.token.get('name') + " n'est plus " + etat + eForFemale(perso.charId));
            } else {
              sendChar(perso.charId, res.texte + " &lt; " + seuil + ", " + perso.token.get('name') + " est toujours " + etat + eForFemale(perso.charId));
            }
            addEvent(evt);
          }); //fin test carac
        }); //fin iterSelected du cas sans opposant
      }
    }); //fin getSelected
  }

  //Renvoie false si le personnage n'a pas d'attribut etatSave
  function boutonSaveState(perso, etat) {
    var attr = tokenAttribute(perso, etat + 'Save');
    if (attr.length === 0) return false;
    attr = attr[0];
    var carac = attr.get('current');
    if (!isCarac(carac)) {
      log("Caractéristiques du save contre " + etat + " de " + perso.token.get('name') + " n'est pas une caractéristique " + carac);
      return false;
    }
    var b = bouton("!cof-save-state " + etat + ' ' + carac + ' ' + attr.get('max'), "Jet", perso);
    return b + " de " + carac + " pour " + textOfSaveState(etat);
  }

  function updateInit(token, evt) {
    if (stateCOF.combat &&
      token.get('pageid') == stateCOF.combat_pageid)
      initiative([{
        _id: token.id
      }], evt, true);
  }

  function updateNextInit(token) {
    updateNextInitSet.add(token.id);
  }

  //renvoie le nom de l'arme si l'arme est déjà tenue en main
  function degainerArme(perso, labelArme, evt, options) {
    //D'abord, on rengaine l'arme en main, si besoin.
    var armeActuelle = tokenAttribute(perso, 'armeEnMain');
    var labelArmeActuelle;
    var ancienneArme;
    var message = perso.token.get('name') + " ";
    if (armeActuelle.length > 0) {
      armeActuelle = armeActuelle[0];
      labelArmeActuelle = armeActuelle.get('current');
      if (labelArmeActuelle == labelArme) {
        //Pas besoin de dégainer. Pas de message ?
        if (options && options.weaponStats) return options.weaponStats.name;
        ancienneArme = getWeaponStats(perso, labelArmeActuelle);
        if (ancienneArme) return ancienneArme.name;
        return;
      }
      //On dégaine une nouvelle arme
      ancienneArme = getWeaponStats(perso, labelArmeActuelle);
      if (ancienneArme) {
        if (options && options.messages) message += "rengaine " + ancienneArme.name + " et ";
        else sendChar(perso.charId, "rengaine " + ancienneArme.name);
      }
    } else armeActuelle = undefined;
    //Puis on dégaine
    //On vérifie que l'arme existe
    var nouvelleArme;
    if (options && options.weaponStats) nouvelleArme = options.weaponStats;
    else if (labelArme !== '') nouvelleArme = getWeaponStats(perso, labelArme);
    if (nouvelleArme === undefined) {
      if (armeActuelle) {
        removeTokenAttr(perso, 'armeEnMain', evt);
        if (!stateCOF.combat) {
          //Si le perso a la capacité frappe du vide, la réinitialiser
          var attrFDV = tokenAttribute(perso, 'frappeDuVide');
          if (attrFDV.length > 0) {
            if (!attrFDV[0].get('current')) {
              evt.attributes = evt.attributes || [];
              evt.attributes.push({
                attribute: attrFDV[0],
                current: 0,
                max: 1
              });
              attrFDV[0].set('current', 1);
            }
          }
        }
      }
      return;
    }
    if (nouvelleArme.deuxMains) {
      if (ficheAttributeAsBool(perso, 'DEFBOUCLIER') &&
        ficheAttributeAsInt(perso, 'DEFBOUCLIERON', 1)) {
        sendChar(perso.charId, "enlève son bouclier");
        var attrBouclier = findObjs({
          _type: 'attribute',
          _characterid: perso.charId,
          name: 'DEFBOUCLIERON'
        }, {
          caseInsensistive: true
        });
        evt.attributes = evt.attributes || [];
        if (attrBouclier.length > 0) {
          evt.attributes.push({
            attribute: attrBouclier[0],
            current: 1,
            max: ''
          });
          attrBouclier[0].set('current', 0);
        } else {
          attrBouclier = createObj('attribute', {
            characterid: perso.charId,
            name: 'DEFBOUCLIERON',
            current: 0
          });
          evt.attributes.push({
            attribute: attrBouclier,
            current: null
          });
        }
      }
    } else if (ancienneArme && ancienneArme.deuxMains) {
      if (ficheAttributeAsBool(perso, 'DEFBOUCLIER') &&
        !ficheAttributeAsInt(perso, 'DEFBOUCLIERON', 1)) {
        sendChar(perso.charId, "remet son bouclier");
        evt.attributes = evt.attributes || [];
        var attrBouclierOff = findObjs({
          _type: 'attribute',
          _characterid: perso.charId,
          name: 'DEFBOUCLIERON'
        }, {
          caseInsensistive: true
        }); //devrait être de taille au moins 1, avec valeur courante 0
        evt.attributes.push({
          attribute: attrBouclierOff[0],
          current: 0,
          max: ''
        });
        attrBouclierOff[0].set('current', 1);
      }
    }
    if (attributeAsBool(perso, 'frappeDuVide')) {
      if (options && options.contact) {
        options.frappeDuVide = true;
      }
      setTokenAttr(perso, 'frappeDuVide', 0, evt);
    }
    if (armeActuelle) {
      evt.attributes = evt.attributes || [];
      evt.attributes.push({
        attribute: armeActuelle,
        current: labelArmeActuelle,
        max: ''
      });
      armeActuelle.set('current', labelArme);
    } else {
      setTokenAttr(perso, 'armeEnMain', labelArme, evt);
    }
    if (options.messages) {
      message += "dégaine " + nouvelleArme.name;
      options.messages.push(message);
    } else sendChar(perso.charId, "dégaine " + nouvelleArme.name);
    if (charAttributeAsInt(perso, "initEnMain" + labelArme, 0) > 0)
      updateNextInit(perso.token);
    return;
  }

  function degainer(msg) {
    var cmd = msg.content.split(' ');
    var armeLabel = '';
    if (cmd.length > 1) armeLabel = cmd[1];
    var evt = {
      type: "Dégainer",
      attributes: []
    };
    getSelected(msg, function(selected) {
      if (selected === undefined || selected.length === 0) {
        error("Qui doit dégainer ?", msg);
        return;
      }
      iterSelected(selected, function(perso) {
        var nomArme = degainerArme(perso, armeLabel, evt);
        if (nomArme) sendChar(perso.charId, "a déjà " + nomArme + " en main");
      });
      if (evt.attributes.length > 0) addEvent(evt);
    });
  }

  function echangeInit(msg) {
    var args = msg.content.split(" ");
    if (args.length < 4) {
      error("Pas assez d'arguments pour !cof-echange-init: " + msg.content, args);
      return;
    }
    var perso1 = tokenOfId(args[1], args[1]);
    if (perso1 === undefined) {
      error("le premier argument n'est pas un token valide", args[1]);
      return;
    }
    var perso2 = tokenOfId(args[2], args[2]);
    if (perso2 === undefined) {
      error("le second argument n'est pas un token valide", args[2]);
      return;
    }
    var attackBonus = parseInt(args[3]);
    if (isNaN(attackBonus) || attackBonus < 1 || attackBonus > 2) {
      error("Le troisième argument n'est pas un nombre", args[3]);
      return;
    }
    var evt = {
      type: "echange_init"
    };
    var to = getTurnOrder(evt);
    var tourTok1 = to.pasAgi.findIndex(function(t) {
      return (t.id == perso1.token.id);
    });
    var tourTok2 = to.pasAgi.findIndex(function(t) {
      return (t.id == perso2.token.id);
    });
    if (tourTok1 < 0) {
      sendChar(perso1.charId, "a déjà agit, pas moyen d'échanger son initiative");
      return;
    }
    if (tourTok2 < 0) {
      sendChar(perso2.charId, "a déjà agit, pas moyen d'échanger son initiative");
      return;
    }
    var pr1 = to.pasAgi[tourTok1].pr;
    var pr2 = to.pasAgi[tourTok2].pr;
    if (pr1 == pr2) {
      sendChar(perso1.charId, "a la même initiative que " + perso2.token.get('name'));
      return;
    }
    if (pr1 > pr2) {
      setTokenAttr(perso1, 'actionConcertee', attackBonus, evt, "gagne un bonus de " + attackBonus + " à ses attaques et en DEF pour ce tour");
      addEvent(evt);
    }
    to.pasAgi[tourTok1].pr = pr2;
    to.pasAgi[tourTok2].pr = pr1;
    var t1 = to.pasAgi[tourTok1];
    to.pasAgi[tourTok1] = to.pasAgi[tourTok2];
    to.pasAgi[tourTok2] = t1;
    updateNextInit(perso1.token);
    updateNextInit(perso2.token);
    to.pasAgi.push(to.tour);
    var turnOrder = to.pasAgi.concat(to.dejaAgi);
    Campaign().set('turnorder', JSON.stringify(turnOrder));
    addEvent(evt);
  }

  function aCouvert(msg) {
    var args = msg.content.split(" ");
    if (args.length < 2) {
      error("Pas assez d'arguments pour !cof-a-couvert: " + msg.content, args);
      return;
    }
    var perso1 = tokenOfId(args[1], args[1]);
    if (perso1 === undefined) {
      error("Le premier argument n'est pas un token valide", args[1]);
      return;
    }
    var evt = {
      type: "aCouvert"
    };
    var init = getInit();
    setTokenAttr(perso1, 'aCouvert', 1, evt, "reste à couvert", init);
    if (args.length > 2) {
      var perso2 = tokenOfId(args[2], args[2]);
      if (perso2 === undefined) {
        error("Le second argument n'est pas un token valide", args[2]);
        addEvent(evt);
        return;
      }
      if (perso2.token.id == perso1.token.id) {
        sendChar(perso1.charId, "s'est ciblé lui-même, il est donc le seul à couvert");
        addEvent(evt);
        return;
      }
      var d = distanceCombat(perso1.token, perso2.token);
      if (d > 0) {
        sendChar(perso2.charId, "est trop éloigné de " + perso1.token.get('name') + " pour rester à couvert avec lui");
      } else {
        setTokenAttr(perso2, 'aCouvert', 1, evt,
          "suit " + perso1.token.get('name') + " et reste à couvert", init);
      }
    }
    addEvent(evt);
  }

  function getInit() {
    return stateCOF.init;
  }

  function effetTemporaire(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd === undefined || cmd.length < 3) {
      error("Pas assez d'arguments pour !cof-effet-temp", msg.content);
      return;
    }
    var effetC = cmd[1];
    if (!estEffetTemp(effetC)) {
      error(effetC + " n'est pas un effet temporaire répertorié", msg.content);
      return;
    }
    var effet = cmd[1];
    var pp = effet.indexOf('(');
    if (pp > 0) effet = effet.substring(effet, pp);
    if (messageEffetTemp[effet] === undefined) {
      error("Impossible de trouver l'effet " + effetC, cmd);
      return;
    }
    var duree = parseInt(cmd[2]);
    if (isNaN(duree) || duree < 1) duree = 0; //On veut terminer l'effet
    if (options.puissantDuree || options.tempeteDeManaDuree) duree = duree * 2;
    var evt = {
      type: 'Effet temporaire ' + effetC
    };
    var lanceur = options.lanceur;
    var charId;
    if (lanceur) charId = lanceur.charId;
    getSelected(msg, function(selected, playerId) {
      if (selected === undefined || selected.length === 0) {
        sendChar(charId, "Pas de cible sélectionée pour l'effet");
        return;
      }
      if (lanceur === undefined) {
        if (options.portee) {
          error("Impossible de savoir l'origine de l'effet", options);
          return;
        }
        if (selected.length == 1) {
          lanceur = tokenOfId(selected[0]._id);
          if (lanceur) charId = lanceur.charId;
        }
      }
      if (lanceur && options.tempeteDeMana) {
        if (options.tempeteDeMana.cout === 0) {
          //On demande de préciser les options
          var optMana = {
            mana: options.mana,
            dm: messageEffetTemp[effet].dm,
            soins: messageEffetTemp[effet].soins,
            portee: options.portee,
            duree: true,
            rang: options.rang,
            altruiste: options.altruiste
          };
          setTempeteDeMana(playerId, lanceur, msg.content, optMana);
          return;
        } else {
          if (options.rang && options.tempeteDeMana.cout > options.rang) {
            sendChar(lanceur.charId, "Attention, le coût de la tempête de mana (" + options.tempeteDeMana.cout + ") est supérieur au rang du sort");
          }
          if (selected.length == 1 && options.tempeteDeMana.altruiste) {
            selected[0]._id = options.tempeteDeMana.altruiste.token.id;
            if (options.portee === undefined) options.portee = 0;
          }
        }
      }
      if (options.portee !== undefined) {
        if (options.tempeteDeManaPortee) options.portee = options.portee * 2;
        selected = selected.filter(function(sel) {
          var token = getObj('graphic', sel._id);
          var dist = distanceCombat(lanceur.token, token);
          if (dist > options.portee) {
            sendChar(charId, " est trop loin de " + token.get('name'));
            return false;
          }
          return true;
        });
      }
      var ressource;
      if (options.limiteCibleParJour) {
        ressource = effet;
        if (options.limiteCibleParJourRessource)
          ressource = options.limiteCibleParJourRessource;
        ressource = "limiteParJour_" + ressource;
        var selectedAutorises = [];
        iterSelected(selected, function(perso) {
          var utilisations =
            attributeAsInt(perso, ressource, options.limiteCibleParJour);
          if (utilisations === 0) {
            sendChar(perso.charId, "ne peut plus bénéficier de " + effet + " aujourd'hui");
            return;
          }
          setTokenAttr(perso, ressource, utilisations - 1, evt);
          selectedAutorises.push({
            _id: perso.token.id
          });
        });
        selected = selectedAutorises;
      }
      if (selected.length === 0) return;
      if (limiteRessources(lanceur, options, effet, effet, evt)) {
        //Restore limiteCibleParJour
        if (options.limiteCibleParJour) {
          iterSelected(selected, function(perso) {
            var utilisations =
              attributeAsInt(perso, ressource, options.limiteCibleParJour);
            setTokenAttr(perso, ressource, utilisations + 1, evt);
          });
        }
        return;
      }
      if (selected.length > 0) {
        initiative(selected, evt);
      }
      if (duree > 0) {
        var count = selected.length;
        var setOneEffect = function(perso, d) {
          if (options.valeur !== undefined) {
            setTokenAttr(perso, effetC + "Valeur", options.valeur, evt, undefined, options.valeurMax);
          }
          //On retire l'autre aspect du Nécromancien si il est présent
          if(effetC == "aspectDuDemon") {
            var evt = {
              type: 'Nouvel aspect',
              attributes: [],
              deletedAttributes: []
            };
            finDEffetDeNom(perso,"aspectDeLaSuccube",evt,null);
          }
          if(effetC == "aspectDeLaSuccube") {
            var evt = {
              type: 'Nouvel aspect',
              attributes: [],
              deletedAttributes: []
            };
            finDEffetDeNom(perso,"aspectDuDemon",evt,null);
          }
          setTokenAttr(
            perso, effetC, d, evt, messageEffetTemp[effet].activation,
            getInit());
          if (options.saveParTour) {
            setTokenAttr(perso, effetC + "SaveParTour",
              options.saveParTour.carac, evt, undefined, options.saveParTour.seuil);
          }
          if (options.puissant) {
            var puissant = true;
            if (options.puissant == "off") puissant = false;
            setTokenAttr(perso, effetC + "Puissant", puissant, evt);
          }
          if (options.tempeteDeManaIntense !== undefined) {
            setTokenAttr(perso, effetC + "TempeteDeManaIntense", options.tempeteDeManaIntense, evt);
          }
          if (lanceur && options.fx) {
            var p1e = {
              x: lanceur.token.get('left'),
              y: lanceur.token.get('top'),
            };
            var p2e = {
              x: perso.token.get('left'),
              y: perso.token.get('top'),
            };
            spawnFxBetweenPoints(p1e, p2e, options.fx, options.pageId);
          }
          if (options.targetFx) {
            spawnFx(perso.token.get('left'), perso.token.get('top'), options.targetFx, options.pageId);
          }
          count--;
          if (count === 0) addEvent(evt);
        };
        iterSelected(selected, function(perso) {
          if (options.save) {
            var saveOpts = {
              msgPour: " pour résister à un effet",
              msgRate: ", raté.",
            };
            var expliquer = function(s) {
              sendChar(perso.charId, s);
            };
            var d = duree;
            save(options.save, perso, expliquer, saveOpts, evt,
              function(reussite, rollText) {
                if (reussite && options.save.demiDuree) {
                  reussite = false;
                  d = Math.ceil(d / 2);
                }
                if (reussite) {
                  count--;
                  if (count === 0) addEvent(evt);
                } else {
                  setOneEffect(perso, d);
                }
              });
          } else setOneEffect(perso, duree);
        });
        addEvent(evt);
      } else { //On met fin à l'effet
        var opt = {
          pageId: options.pageId
        };
        iterSelected(selected, function(perso) {
          var attr = tokenAttribute(perso, effetC);
          if (attr.length === 0) {
            log(perso.token.get('name') + "n'a pas d'attribut " + effetC);
            return;
          }
          finDEffet(attr[0], effetC, attr[0].get('name'), perso.charId, evt, opt);
        });
        addEvent(evt);
      }
    }, options);
  }

  function effetCombat(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd === undefined || cmd.length < 2) {
      error("Pas assez d'arguments pour !cof-effet-combat", msg.content);
      return;
    }
    var effet = cmd[1];
    if (!estEffetCombat(effet)) {
      error(effet + " n'est pas un effet de combat répertorié", msg.content);
      return;
    }
    var evt = {
      type: 'Effet ' + effet
    };
    var lanceur = options.lanceur;
    var charId;
    if (lanceur) charId = lanceur.charId;
    getSelected(msg, function(selected, playerId) {
      if (selected === undefined || selected.length === 0) {
        sendChar(charId, "Pas de cible sélectionée pour l'effet");
        return;
      }
      if (lanceur === undefined) {
        if (options.portee) {
          error("Impossible de savoir l'origine de l'effet", options);
          return;
        }
        if (selected.length == 1) {
          lanceur = tokenOfId(selected[0]._id);
          if (lanceur) charId = lanceur.charId;
        }
      }
      if (lanceur && options.tempeteDeMana) {
        if (options.tempeteDeMana.cout === 0) {
          //On demande de préciser les options
          var optMana = {
            mana: options.mana,
            dm: messageEffetCombat[effet].dm,
            soins: messageEffetCombat[effet].soins,
            portee: options.portee,
            altruiste: options.altruiste,
            rang: options.rang
          };
          setTempeteDeMana(playerId, lanceur, msg.content, optMana);
          return;
        } else {
          if (options.rang && options.tempeteDeMana.cout > options.rang) {
            sendChar(lanceur.charId, "Attention, le coût de la tempête de mana (" + options.tempeteDeMana.cout + ") est supérieur au rang du sort");
          }
          if (selected.length == 1 && options.tempeteDeMana.altruiste) {
            selected[0]._id = options.tempeteDeMana.altruiste.token.id;
            if (options.portee === undefined) options.portee = 0;
          }
        }
      }
      if (options.portee !== undefined) {
        if (options.tempeteDeManaPortee) options.portee = options.portee * 2;
        selected = selected.filter(function(sel) {
          var token = getObj('graphic', sel._id);
          var dist = distanceCombat(lanceur.token, token);
          if (dist > options.portee) {
            sendChar(charId, " est trop loin de " + token.get('name'));
            return false;
          }
          return true;
        });
      }
      if (selected.length === 0) return;
      if (limiteRessources(lanceur, options, effet, effet, evt)) return;
      if (selected.length > 0) {
        initiative(selected, evt);
      }
      iterSelected(selected, function(perso) {
        setTokenAttr(
          perso, effet, true, evt, messageEffetCombat[effet].activation);
        if (options.puissant) {
          var puissant = true;
          if (options.puissant == "off") puissant = false;
          setTokenAttr(perso, effet + "Puissant", puissant, evt);
        }
        if (options.valeur !== undefined) {
          setTokenAttr(perso, effet + "Valeur", options.valeur, evt, undefined, options.valeurMax);
        }
        if (options.tempeteDeManaIntense !== undefined) {
          setTokenAttr(perso, effet + "TempeteDeManaIntense", options.tempeteDeManaIntense, evt);
        }
      });
      addEvent(evt);
      if (lanceur && options.fx) {
        iterSelected(selected, function(target) {
          var p1e = {
            x: lanceur.token.get('left'),
            y: lanceur.token.get('top'),
          };
          var p2e = {
            x: target.token.get('left'),
            y: target.token.get('top'),
          };
          spawnFxBetweenPoints(p1e, p2e, options.fx, options.pageId);
        });
      }
      if (options.targetFx) {
        iterSelected(selected, function(target) {
          spawnFx(target.token.get('left'), target.token.get('top'), options.targetFx, options.pageId);
        });
      }
    });
  }

  function effetIndetermine(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd === undefined || cmd.length < 3) {
      error("Pas assez d'arguments pour !cof-effet", msg.content);
      return;
    }
    var effet = cmd[1];
    if (!estEffetIndetermine(effet)) {
      error(effet + " n'est pas un effet répertorié", msg.content);
      return;
    }
    var activer;
    switch (cmd[2]) {
      case 'oui':
      case 'Oui':
      case 'true':
        activer = true;
        break;
      case 'non':
      case 'Non':
      case 'false':
        activer = false;
        break;
      default:
        error("Option de !cof-effet inconnue", cmd);
        return;
    }
    var evt = {
      type: 'Effet ' + effet
    };
    var lanceur = options.lanceur;
    var charId;
    if (lanceur) charId = lanceur.charId;
    getSelected(msg, function(selected) {
      if (selected === undefined || selected.length === 0) {
        sendChar(charId, "Pas de cible sélectionée pour l'effet");
        return;
      }
      if (lanceur === undefined) {
        if (options.portee) {
          error("Impossible de savoir l'origine de l'effet", options);
          return;
        }
        if (selected.length == 1) {
          lanceur = tokenOfId(selected[0]._id);
          if (lanceur) charId = lanceur.charId;
        }
      }
      if (options.portee !== undefined) {
        selected = selected.filter(function(sel) {
          var token = getObj('graphic', sel._id);
          var dist = distanceCombat(lanceur.token, token);
          if (dist > options.portee) {
            sendChar(charId, " est trop loin de " + token.get('name'));
            return false;
          }
          return true;
        });
      }
      if (selected.length === 0) return;
      if (activer) {
        if (limiteRessources(lanceur, options, effet, effet, evt)) return;
        if (options.classeEffet) {
          selected = selected.filter(function(sel) {
            var perso = tokenOfId(sel._id);
            if (perso === undefined) return false;
            if (attributeAsBool(perso, options.classeEffet)) {
              var attrDeClasse = attributesOfClass(perso, options.classeEffet);
              var mpc = "Non cumulable avec";
              attrDeClasse.forEach(function(attrClasseEffet) {
                var attr = attrClasseEffet.baseAttribute;
                var attrName = attr.get('name');
                if (estEffetIndetermine(attrName))
                  mpc += ' ' + messageEffetIndetermine[effetIndetermineOfAttribute(attr)].actif;
                else mpc += ' ' + attrName;
              });
              sendChar(perso.charId, mpc);
              return false;
            }
            setTokenAttr(perso, options.classeEffet, true, evt);
            setTokenAttr(perso, effet + 'ClasseEffet', options.classeEffet, evt);
            return true;
          });
        }
        iterSelected(selected, function(perso) {
          setTokenAttr(
            perso, effet, true, evt, messageEffetIndetermine[effet].activation);
          if (options.puissant) {
            var puissant = true;
            if (options.puissant == "off") puissant = false;
            setTokenAttr(perso, effet + "Puissant", puissant, evt);
          }
          if (options.tempeteDeManaIntense !== undefined) {
            setTokenAttr(perso, effet + "TempeteDeManaIntense", options.tempeteDeManaIntense, evt);
          }
        });
      } else {
        iterSelected(selected, function(perso) {
          //On commence par enlever les attributs de classe d'effet, si besoin
          var ace = tokenAttribute(perso, effet + 'ClasseEffet');
          if (ace.length > 0) {
            var ce = ace[0].get('current');
            removeTokenAttr(perso, ce, evt);
            evt.deletedAttributes = evt.deletedAttributes || [];
            evt.deletedAttributes.push(ace[0]);
            ace[0].remove();
          }
          removeTokenAttr(perso, effet, evt, messageEffetIndetermine[effet].fin);
        });
      }
      addEvent(evt);
    });
  }

  function finClasseDEffet(msg) {
    var cmd = msg.content.split(' ');
    if (cmd.length < 2) {
      error("Il manque l'argument de !cof-fin-classe-effet", cmd);
      return;
    }
    var classeEffet = cmd[1];
    getSelected(msg, function(selected) {
      if (selected === undefined || selected.length === 0) {
        error("Pas de cible sélectionnée pour la fin d'une classe d'effets", msg);
        return;
      }
      var evt = {
        type: "Fin des effets de classe " + classeEffet,
        deletedAttributes: []
      };
      iterSelected(selected, function(perso) {
        if (attributeAsBool(perso, classeEffet)) {
          var attrDeClasse = attributesOfClass(perso, classeEffet);
          attrDeClasse.forEach(function(adc) {
            var attrName = adc.baseAttribute.get('name');
            if (estEffetIndetermine(attrName))
              sendChar(perso.charId, messageEffetIndetermine[effetIndetermineOfAttribute(adc.baseAttribute)].fin);
            evt.deletedAttributes.push(adc.baseAttribute);
            adc.baseAttribute.remove();
            evt.deletedAttributes.push(adc.classAttribute);
            adc.classAttribute.remove();
          });
          removeTokenAttr(perso, classeEffet, evt);
        }
      });
      addEvent(evt);
    }); //fin de getSelected
  }

  function peurOneToken(target, pageId, difficulte, duree, options,
    messages, evt, callback) {
    var charId = target.charId;
    var targetName = target.token.get('name');
    if (charAttributeAsBool(target, 'sansPeur') ||
      charAttributeAsBool(target, 'immunitePeur') ||
      charAttributeAsBool(target, 'proprioception') ||
      attributeAsBool(target, 'enragé')) {
      messages.push(targetName + " est insensible à la peur !");
      callback();
      return;
    }
    var carac = 'SAG'; //carac pour résister
    if (options.resisteAvecForce)
      carac = meilleureCarac('SAG', 'FOR', target, difficulte);
    //chercher si un partenaire a sansPeur pour appliquer le bonus
    var allieSansPeur = 0;
    var allies = alliesParPerso[target.charId];
    if (allies) {
      allies.forEach(function(cid) {
        if (charIdAttributeAsBool(cid, 'sansPeur')) {
          allieSansPeur =
            Math.max(allieSansPeur, 2 + modCarac(cid, 'CHARISME'));
        }
      });
    }
    testCaracteristique(target, carac, difficulte, {
        bonus: allieSansPeur
      }, evt,
      function(tr) {
        var line = "Jet de résistance de " + targetName + " :" + tr.texte;
        var sujet = onGenre(charId, 'il', 'elle');
        if (tr.reussite) {
          line += "&gt;=" + difficulte + ",  " + sujet + " résiste à la peur.";
        } else {
          setState(target, 'apeure', true, evt);
          line += "&lt;" + difficulte + ", " + sujet + ' ';
          var effet = 'peur';
          if (options.etourdi) {
            line += "s'enfuit ou reste recroquevillé" + eForFemale(charId) + " sur place";
            effet = 'peurEtourdi';
          } else if (options.ralenti) {
            line += "est ralenti" + eForFemale(charId);
            effet = 'ralentiTemp';
          } else {
            line += "s'enfuit.";
          }
          setTokenAttr(target, effet, duree, evt, undefined, getInit());
        }
        messages.push(line);
        callback();
      }); //fin testCaracteristique (asynchrone)
  }

  function peur(msg) {
    var optArgs = msg.content.split(' --');
    var cmd = optArgs[0].split(' ');
    if (cmd.length < 3) {
      error("Pas assez d'arguments pour !cof-peur", msg.content);
      return;
    }
    var playerId = getPlayerIdFromMsg(msg);
    var pageId = getPageId(playerId);
    var difficulte = parseInt(cmd[1]);
    if (isNaN(difficulte)) {
      error("Le premier argument de !cof-peur, la difficulté du test de résistance, n'est pas un nombre", cmd);
      return;
    }
    var duree = parseInt(cmd[2]);
    if (isNaN(duree) || duree < 0) {
      error("Le second argument de !cof-peur, la durée, n'est pas un nombre positif", cmd);
      return;
    }
    var options = {};
    optArgs.shift();
    optArgs.forEach(function(opt) {
      var optCmd = opt.split(' ');
      switch (optCmd[0]) {
        case "attaqueMagique":
          error("TODO", opt);
          return;
        case "resisteAvecForce":
        case "etourdi":
        case "ralenti":
        case "effroi":
          options[optCmd[0]] = true;
          return;
        case "portee":
          if (optCmd.length < 2) {
            error("Il manque l'argument de portée", optArgs);
            return;
          }
          options.portee = parseInt(optCmd[1]);
          if (isNaN(options.portee) || options.portee < 0) {
            error("La portée n'est pas un nombre positif", optCmd);
            delete options.portee;
          }
          return;
        case 'lanceur':
          if (optCmd.length < 2) {
            error("Il manque l'argument de lanceur", optArgs);
            return;
          }
          options.lanceur = tokenOfId(optCmd[1], optCmd[1]);
          if (options.lanceur) pageId = options.lanceur.token.get('pageid');
          return;
        default:
          return;
      }
    });
    getSelected(msg, function(selected) {
      if (selected === undefined || selected.length === 0) {
        error("Pas de cible sélectionnée pour la peur", msg);
        return;
      }
      var action = "Effet de peur";
      if (options.lanceur) {
        action = "<b>" + options.lanceur.token.get('name') + "</b> ";
        if (options.effroi)
          action += "est vraiment effrayant" + eForFemale(options.lanceur.charId);
        else action = "<b>Capacité</b> : Sort de peur";
      }
      var display = startFramedDisplay(playerId, action, options.lanceur);
      var evt = {
        type: 'peur'
      };
      initiative(selected, evt);
      var counter = selected.length;
      var messages = [];
      var finalEffect = function() {
        counter--;
        if (counter > 0) return;
        messages.forEach(function(m) {
          addLineToFramedDisplay(display, m);
        });
        sendChat("", endFramedDisplay(display));
        addEvent(evt);
      };
      iterSelected(selected, function(perso) {
          if (options.portee !== undefined && options.lanceur) {
            var distance = distanceCombat(options.lanceur.token, perso.token, pageId);
            if (distance > options.portee) {
              addLineToFramedDisplay(display,
                perso.token.get('name') + " est hors de portée de l'effet");
              finalEffect();
              return;
            }
          }
          peurOneToken(perso, pageId, difficulte, duree, options,
            messages, evt, finalEffect);
        }, //fun fonction de iterSelectde
        finalEffect //callback pour les cas où token incorrect
      );
    }, options);
  }

  // callback est seulement appelé si on fait le test
  function attaqueMagique(msg, evt, defResource, callback) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd.length < 3) {
      error("Pas assez d'arguments pour " + msg.content, cmd);
      return;
    }
    var attaquant = tokenOfId(cmd[1], cmd[1]);
    if (attaquant === undefined) {
      error("L'attaquant n'est pas un token valide", cmd[1]);
      return;
    }
    var token1 = attaquant.token;
    var charId1 = attaquant.charId;
    var char1 = getObj("character", attaquant.charId);
    if (char1 === undefined) {
      error("Unexpected undefined 1", attaquant);
      return;
    }
    var name1 = char1.get('name');
    var pageId = attaquant.token.get('pageid');
    var cible = tokenOfId(cmd[2], cmd[2], pageId);
    if (cible === undefined) {
      error("La cible n'est pas un token valide" + msg.content, cmd[2]);
      return;
    }
    var token2 = cible.token;
    var charId2 = cible.charId;
    var char2 = getObj("character", charId2);
    if (char2 === undefined) {
      error("Unexpected undefined 1", token2);
      return;
    }
    var name2 = char2.get('name');
    var explications = [];
    evt = evt || {
      type: 'attaque magique'
    };
    if (options.portee !== undefined) {
      var distance = distanceCombat(token1, token2, pageId);
      if (distance > options.portee) {
        sendChar(charId1, "est trop loin de " + cible.token.get('name') +
          " pour l'attaque magique");
        return;
      }
    }
    defResource = defResource || 'attaqueMagique';
    if (limiteRessources(attaquant, options, defResource, "l'attaque magique", evt)) return;
    var bonus1 = bonusDAttaque(attaquant, explications, evt);
    if (bonus1 === 0) bonus1 = "";
    else if (bonus1 > 0) bonus1 = " +" + bonus1;
    var attk1 = addOrigin(name1, "[[" + getAttrByName(charId1, 'ATKMAG') +
      bonus1 + "]]");
    var bonus2 = bonusDAttaque(cible, explications, evt);
    if (bonus2 === 0) bonus2 = "";
    else if (bonus2 > 0) bonus2 = " +" + bonus2;
    var attk2 = addOrigin(name2, "[[" + getAttrByName(charId2, 'ATKMAG') +
      bonus1 + "]]");
    var de1 = computeDice(attaquant);
    var de2 = computeDice(cible);
    var toEvaluate = "[[" + de1 + "]] [[" + de2 + "]] " + attk1 + " " + attk2;
    sendChat("", toEvaluate, function(res) {
      var rolls = res[0];
      // Determine which roll number correspond to which expression
      var afterEvaluate = rolls.content.split(" ");
      var att1RollNumber = rollNumber(afterEvaluate[0]);
      var att2RollNumber = rollNumber(afterEvaluate[1]);
      var attk1SkillNumber = rollNumber(afterEvaluate[2]);
      var attk2SkillNumber = rollNumber(afterEvaluate[3]);
      var d20roll1 = rolls.inlinerolls[att1RollNumber].results.total;
      var att1Skill = rolls.inlinerolls[attk1SkillNumber].results.total;
      var attackRoll1 = d20roll1 + att1Skill;
      var d20roll2 = rolls.inlinerolls[att2RollNumber].results.total;
      var att2Skill = rolls.inlinerolls[attk2SkillNumber].results.total;
      var attackRoll2 = d20roll2 + att2Skill;
      var action = "Attaque magique opposée";
      var display = startFramedDisplay(getPlayerIdFromMsg(msg), action, attaquant, {
        perso2: cible
      });
      var line =
        token1.get('name') + " fait " +
        buildinline(rolls.inlinerolls[att1RollNumber]);
      if (att1Skill > 0) line += "+" + att1Skill + " = " + attackRoll1;
      else if (att1Skill < 0) line += att1Skill + " = " + attackRoll1;
      addLineToFramedDisplay(display, line);
      line =
        token2.get('name') + " fait " +
        buildinline(rolls.inlinerolls[att2RollNumber]);
      if (att2Skill > 0) line += "+" + att2Skill + " = " + attackRoll2;
      else if (att2Skill < 0) line += att2Skill + " = " + attackRoll2;
      addLineToFramedDisplay(display, line);
      var reussi;
      if (d20roll1 == 1) {
        if (d20roll2 == 1) reussi = (attackRoll1 >= attackRoll2);
        else reussi = false;
      } else if (d20roll2 == 1) reussi = true;
      else if (d20roll1 == 20) {
        if (d20roll2 == 20) reussi = (attackRoll1 >= attackRoll2);
        else reussi = true;
      } else reussi = (attackRoll1 >= attackRoll2);
      if (reussi) {
        diminueMalediction(cible, evt);
        addLineToFramedDisplay(display, "<b>Attaque réussie !</b>");
      } else {
        diminueMalediction(attaquant, evt);
        addLineToFramedDisplay(display, "<b>L'attaque échoue.</b>");
      }
      if (callback) callback(attaquant, cible, display, reussi);
      else {
        sendChat("", endFramedDisplay(display));
        addEvent(evt);
      }
    });
  }

  function injonction(msg) {
    var evt = {
      type: 'Injonction'
    };
    if (!msg.content.includes(' --attaqueMentale'))
      msg.content += ' --attaqueMentale';
    attaqueMagique(msg, evt, 'injonction',
      function(attaquant, cible, display, reussi) {
        if (reussi) {
          if (attributeAsBool(cible, 'resisteInjonction')) {
            addLineToFramedDisplay(display, cible.token.get('name') + " a déjà résisté à une injonction aujourd'hui, c'est sans effet");
            sendChat("", endFramedDisplay(display));
            addEvent(evt);
            return;
          }
          addLineToFramedDisplay(display, cible.token.get('name') + " obéit à l'injonction");
          sendChat("", endFramedDisplay(display));
          addEvent(evt);
        } else {
          setTokenAttr(cible, 'resisteInjonction', true, evt);
          addLineToFramedDisplay(display, cible.token.get('name') + " n'obéit pas à l'injonction");
          sendChat("", endFramedDisplay(display));
          addEvent(evt);
        }
      });
  }

  function tueurFantasmagorique(msg) {
    var evt = {
      type: 'Tueur fantasmagorique'
    };
    attaqueMagique(msg, evt, 'tueurFantasmagorique',
      function(attaquant, cible, display, reussi) {
        if (reussi) {
          if (estNonVivant(cible)) {
            addLineToFramedDisplay(display, cible.token.get('name') + " n'est pas une créature vivante, il ne peut croire à sa mort");
            sendChat("", endFramedDisplay(display));
            addEvent(evt);
            return;
          }
          if (attributeAsBool(cible, 'tueurFantasmagorique')) {
            addLineToFramedDisplay(display, cible.token.get('name') + " a déjà été victime d'un tueur fantasmagorique aujourd'hui, c'est sans effet");
            sendChat("", endFramedDisplay(display));
            addEvent(evt);
            return;
          }
          setTokenAttr(cible, 'tueurFantasmagorique', true, evt);
          var s = {
            carac: 'SAG',
            seuil: 10 + modCarac(attaquant, 'CHARISME')
          };
          var niveauAttaquant = ficheAttributeAsInt(attaquant, 'NIVEAU', 1);
          var niveauCible = ficheAttributeAsInt(cible, 'NIVEAU', 1);
          if (niveauCible > niveauAttaquant)
            s.seuil -= (niveauCible - niveauAttaquant) * 5;
          else if (niveauCible < niveauAttaquant)
            s.seuil += (niveauAttaquant - niveauCible);
          var expliquer = function(message) {
            addLineToFramedDisplay(display, message, 80);
          };
          var saveOpts = {
            msgPour: " pour résister au tueur fantasmagorique",
            attaquant: attaquant
          };
          save(s, cible, expliquer, saveOpts, evt,
            function(reussiteSave) {
              if (reussiteSave) {
                addLineToFramedDisplay(display, cible.token.get('name') + " perd l'équilibre et tombe par terre");
                setState(cible, 'renverse', true, evt);
              } else { //save raté
                addLineToFramedDisplay(display, cible.token.get('name') + " succombe à ses pires terreurs");
                updateCurrentBar(cible.token, 1, 0, evt);
                setState(cible, 'mort', true, evt);
              }
              sendChat("", endFramedDisplay(display));
              addEvent(evt);
            });
        } else {
          setTokenAttr(cible, 'tueurFantasmagorique', true, evt);
          sendChat("", endFramedDisplay(display));
          addEvent(evt);
        }
      });
  }

  function sommeil(msg) { //sort de sommeil
    var args = msg.content.split(' ');
    if (args.length < 2) {
      error("La fonction !cof-sommeil a besoin du nom ou de l'id du lanceur de sort", args);
      return;
    }
    var caster = tokenOfId(args[1], args[1]);
    if (caster === undefined) {
      error("Aucun personnage nommé " + args[1], args);
      return;
    }
    var casterCharId = caster.charId;
    var casterChar = getObj('character', casterCharId);
    getSelected(msg, function(selected, playerId) {
      if (selected === undefined || selected.length === 0) {
        sendPlayer(msg, "Pas de cible sélectionnée pour le sort de sommeil");
        return;
      }
      var casterName = caster.token.get('name');
      var casterCharName = casterChar.get('name');
      var cha = modCarac(caster, 'CHARISME');
      var attMagText = addOrigin(casterCharName, getAttrByName(casterCharId, 'ATKMAG'));
      var action = "<b>Capacité</b> : Sort de sommeil";
      var display = startFramedDisplay(playerId, action, caster);
      sendChat("", "[[1d6]] [[" + attMagText + "]]", function(res) {
        var rolls = res[0];
        var afterEvaluate = rolls.content.split(" ");
        var d6RollNumber = rollNumber(afterEvaluate[0]);
        var attMagRollNumber = rollNumber(afterEvaluate[1]);
        var nbTargets = rolls.inlinerolls[d6RollNumber].results.total + cha;
        var attMag = rolls.inlinerolls[attMagRollNumber].results.total;
        var evt = {
          type: 'sommeil',
        };
        var targetsWithSave = [];
        var targetsWithoutSave = [];
        iterSelected(selected, function(perso) {
          perso.name = perso.token.get('name');
          if (estNonVivant(perso)) { //le sort de sommeil n'affecte que les créatures vivantes
            addLineToFramedDisplay(display, perso.name + " n'est pas affecté par le sommeil");
            return;
          }
          var pv = perso.token.get('bar1_max');
          if (pv > 2 * attMag) {
            var line =
              perso.name + " a trop de PV pour être affecté par le sort";
            addLineToFramedDisplay(display, line);
          } else if (pv > attMag) {
            targetsWithSave.push(perso);
          } else {
            targetsWithoutSave.push(perso);
          }
        });
        var targets = [];
        var i, r;
        if (targetsWithoutSave.length > nbTargets) {
          i = 0; //position to decide
          while (nbTargets > 0) {
            r = randomInteger(nbTargets) + i;
            targets.push(targetsWithoutSave[r]);
            targetsWithoutSave[r] = targetsWithoutSave[i];
            i++;
            nbTargets--;
          }
        } else {
          targets = targetsWithoutSave;
          nbTargets -= targets.length;
        }
        targets.forEach(function(t) {
          setState(t, 'endormi', true, evt);
          addLineToFramedDisplay(display, t.name + " s'endort");
        });
        if (nbTargets > 0 && targetsWithSave.length > 0) {
          if (targetsWithSave.length > nbTargets) {
            i = 0;
            targets = [];
            while (nbTargets > 0) {
              r = randomInteger(nbTargets) + i;
              targets.push(targetsWithSave[r]);
              targetsWithSave[r] = targetsWithSave[i];
              i++;
              nbTargets--;
            }
          } else {
            targets = targetsWithSave;
            nbTargets -= targets.length;
          }
          var seuil = 10 + cha;
          var tokensToProcess = targets.length;
          var sendEvent = function() {
            if (tokensToProcess == 1) {
              addEvent(evt);
              sendChat("", endFramedDisplay(display));
            }
            tokensToProcess--;
          };
          targets.forEach(function(t) {
            testCaracteristique(t, 'SAG', seuil, {}, evt,
              function(testRes) {
                var line = "Jet de résistance de " + t.name + ":" + testRes.texte;
                var sujet = onGenre(t.charId, 'il', 'elle');
                if (testRes.reussite) {
                  line += "&gt;=" + seuil + ",  " + sujet + " ne s'endort pas";
                } else {
                  setState(t, 'endormi', true, evt);
                  line += "&lt;" + seuil + ", " + sujet + " s'endort";
                }
                addLineToFramedDisplay(display, line);
                sendEvent();
              });
          });
        } else { // all targets are without save
          addEvent(evt);
          sendChat("", endFramedDisplay(display));
        }
      });
    }, {
      lanceur: caster
    });
  }

  //!cof-attaque-magique-contre-pv {selected|token_id} {target|token_id}
  function attaqueMagiqueContrePV(msg) {
    var options = parseOptions(msg);
    if (options === undefined || options.cmd === undefined) return;
    var cmd = options.cmd;
    if (cmd.length < 3) {
      error("Il faut au moins 2 arguments à !cof-attaque-magique-contre-pv", cmd);
      return;
    }
    var attaquant = tokenOfId(cmd[1], cmd[1]);
    var cible = tokenOfId(cmd[2], cmd[2]);
    if (attaquant === undefined || cible === undefined) {
      error("Arguments de !cof-attaque-magique-contre-pv incorrects", cmd);
      return;
    }
    if (options.portee !== undefined) {
      var distance = distanceCombat(attaquant.token, cible.token, options.pageId);
      if (distance > options.portee) {
        sendChar(attaquant.charId, "est trop loin de " + cible.token.get('name') +
          " pour l'attaque magique");
        return;
      }
    }
    var pvMax = parseInt(cible.token.get('bar1_max'));
    if (isNaN(pvMax)) {
      error("Token avec des PV max qui ne sont pas un nombre", cible.token);
      return;
    }
    var evt = {
      type: 'attaque magique',
    };
    if (limiteRessources(attaquant, options, 'attaque magique', "l'attaque magique", evt)) return;
    var attaquantChar = getObj('character', attaquant.charId);
    attaquant.tokName = attaquant.token.get('name');
    attaquant.name = attaquantChar.get('name');
    var playerId = options.playerId || getPlayerIdFromMsg(msg);
    var explications = [];
    var bonusA = bonusDAttaque(attaquant, explications, evt);
    if (bonusA === 0) bonusA = "";
    else if (bonusA > 0) bonusA = " +" + bonusA;
    var attMagText = addOrigin(attaquant.name, "[[" + getAttrByName(attaquant.charId, 'ATKMAG') + bonusA + "]]");
    var de = computeDice(attaquant);
    var action = "<b>Attaque magique</b> (contre pv max)";
    var display = startFramedDisplay(playerId, action, attaquant, {
      perso2: cible
    });
    sendChat("", "[[" + de + "]] " + attMagText, function(res) {
      var rolls = res[0];
      var afterEvaluate = rolls.content.split(" ");
      var attRollNumber = rollNumber(afterEvaluate[0]);
      var attSkillNumber = rollNumber(afterEvaluate[1]);
      var d20roll = rolls.inlinerolls[attRollNumber].results.total;
      var attSkill = rolls.inlinerolls[attSkillNumber].results.total;
      var attackRoll = d20roll + attSkill;
      var line =
        attaquant.tokName + " fait " +
        buildinline(rolls.inlinerolls[attRollNumber]);
      if (attSkill > 0) line += "+" + attSkill + " = " + attackRoll;
      else if (attSkill < 0) line += attSkill + " = " + attackRoll;
      addLineToFramedDisplay(display, line);
      var reussi;
      if (d20roll == 1) reussi = false;
      else if (d20roll == 20) reussi = true;
      else reussi = (attackRoll >= pvMax);
      if (reussi) {
        addLineToFramedDisplay(display, "<b>Attaque réussie !</b>");
      } else {
        diminueMalediction(attaquant, evt);
        addLineToFramedDisplay(display, "<b>L'attaque échoue.</b>");
      }
      sendChat("", endFramedDisplay(display));
      addEvent(evt);
    }); //Fin du jet de dés pour l'attaque
  }

  function transeGuerison(msg) {
    if (stateCOF.combat) {
      sendPlayer(msg, "Pas possible de méditer en combat");
      return;
    }
    var options = parseOptions(msg);
    if (options === undefined) return;
    getSelected(msg, function(selected, playerId) {
      if (selected === undefined || selected.length === 0) {
        sendPlayer(msg, "Pas de cible sélectionnée pour la transe de guérison");
        return;
      }
      var evt = {
        type: "Transe de guérison",
      };
      iterSelected(selected, function(perso) {
        var token = perso.token;
        if (attributeAsBool(perso, 'transeDeGuérison')) {
          sendChar(perso.charId, "a déjà médité depuis le dernier combat");
          return;
        }
        var bar1 = parseInt(token.get("bar1_value"));
        var pvmax = parseInt(token.get("bar1_max"));
        if (isNaN(bar1) || isNaN(pvmax)) return;
        if (bar1 >= pvmax) {
          sendChar(perso.charId, "n'a pas besoin de méditer");
          return;
        }
        var sagMod = modCarac(perso, 'SAGESSE');
        var niveau = ficheAttributeAsInt(perso, 'NIVEAU', 1);
        var soin = niveau + sagMod;
        if (soin < 0) soin = 0;
        if (bar1 === 0) {
          if (attributeAsBool(perso, 'etatExsangue')) {
            removeTokenAttr(perso, 'etatExsangue', evt, "retrouve des couleurs");
          }
        }
        bar1 += soin;
        if (bar1 > pvmax) {
          soin -= (bar1 - pvmax);
          bar1 = pvmax;
        }
        updateCurrentBar(token, 1, bar1, evt);
        setTokenAttr(perso, 'transeDeGuérison', true, evt);
        sendChar(perso.charId, "entre en méditation pendant 10 minutes et récupère " + soin + " points de vie.");
      });
      addEvent(evt);
    });
  }

  function raceIs(perso, race) {
    var charRace = ficheAttribute(perso, 'RACE');
    if (charRace === undefined) return false;
    return (charRace.toLowerCase() == race.toLowerCase());
  }

  function estMortVivant(perso) {
    if (charAttributeAsBool(perso, 'mort-vivant')) return true;
    var charRace = ficheAttribute(perso, 'RACE');
    if (charRace === undefined) return false;
    switch (charRace.toLowerCase()) {
      case 'squelette':
      case 'zombie':
      case 'mort-vivant':
      case 'momie':
      case 'goule':
      case 'vampire':
        return true;
      default:
        return false;
    }
  }

  function estNonVivant(perso) {
    return (charAttributeAsBool(perso, 'nonVivant') ||
      attributeAsBool(perso, 'masqueMortuaire') || estMortVivant(perso));
  }

  function estUnGeant(perso) {
    var charRace = ficheAttribute(perso, 'RACE');
    if (charRace === undefined) return false;
    switch (charRace.trim().toLowerCase()) {
      case 'géant':
      case 'geant':
      case 'ogre':
      case 'ettin':
      case 'cyclope':
        return true;
      default:
        return false;
    }
  }

  function estHumanoide(perso) {
    if (charAttributeAsBool(perso, 'humanoide')) return true;
    var charRace = ficheAttribute(perso, 'RACE');
    if (charRace === undefined) return false;
    switch (charRace.trim().toLowerCase()) {
      case 'humain':
      case 'nain':
      case 'elfe':
      case 'elfe des bois':
      case 'elfe noir':
      case 'drow':
      case 'halfelin':
      case 'géant':
      case 'geant':
      case 'ange':
      case 'barghest':
      case 'démon':
      case 'doppleganger':
      case 'dryade':
      case 'gnoll':
      case 'gobelin':
      case 'gobelours':
      case 'hobegobelin':
      case 'homme-lézard':
      case 'kobold':
      case 'nymphe':
      case 'ogre':
      case 'orque':
      case 'pixie':
      case 'troll':
        return true;
      default:
        return false;
    }
  }

  function estQuadrupede(perso) {
    if (charAttributeAsBool(perso, 'quadrupede')) return true;
    var charRace = ficheAttribute(perso, 'RACE');
    if (charRace === undefined) return false;
    switch (charRace.trim().toLowerCase()) {
      case 'ankheg':
      case 'araignée':
      case 'araignee':
      case 'basilic':
      case 'béhir':
      case 'behir':
      case 'bulette':
      case 'bison':
      case 'centaure':
      case 'cheval':
      case 'chien':
      case 'chimère':
      case 'chimere':
      case 'cockatrice':
      case 'crocodile':
      case 'dragon':
      case 'drider':
      case 'eléphant':
      case 'elephant':
      case 'éléphant':
      case 'mammouth':
      case 'griffon':
      case 'hipogriffe':
      case 'hippogriffe':
      case 'hydre':
      case 'licorne':
      case 'lion':
      case 'loup':
      case 'worg':
      case 'manticore':
      case 'ours':
      case 'panthere':
      case 'panthère':
      case 'pegase':
      case 'pégase':
      case 'pieuvre':
      case 'rat':
      case 'rhinoceros':
      case 'rhinocéros':
      case 'sanglier':
      case 'taureau':
      case 'tigre':
        return true;
      default:
        return false;
    }
  }

  function estAnimal(perso) {
    if (charAttributeAsBool(perso, 'animal')) return true;
    var attr = findObjs({
      _type: 'attribute',
      _characterid: perso.charId,
    });
    var attrProfile = attr.filter(function(a) {
      return a.get('name').toUpperCase() == 'PROFIL';
    });
    if (attrProfile.length > 0) {
      if (attrProfile[0].get('current').trim().toLowerCase() == 'animal')
        return true;
    }
    var attrRace = attr.filter(function(a) {
      return a.get('name').toUpperCase() == 'RACE';
    });
    if (attrRace.length === 0) return false;
    var charRace = attrRace[0].get('current').trim().toLowerCase();
    switch (charRace) {
      case 'animal':
      case 'aigle':
      case 'basilic':
      case 'bulette':
      case 'bison':
      case 'calmar':
      case 'chauve-souris':
      case 'cheval':
      case 'chien':
      case 'crocodile':
      case 'dinosaure':
      case 'éléphant':
      case 'eléphant':
      case 'elephant':
      case 'mammouth':
      case 'gorille':
      case 'griffon':
      case 'hipogriffe':
      case 'hydre':
      case 'lion':
      case 'loup':
      case 'mammouth':
      case 'manticore':
      case 'ours':
      case 'ours-hibou':
      case 'panthère':
      case 'pegase':
      case 'pégase':
      case 'pieuvre':
      case 'rhinocéros':
      case 'roc':
      case 'sanglier':
      case 'serpent':
      case 'rat':
      case 'taureau':
      case 'tigre':
      case 'wiverne':
        return true;
      default:
        return false;
    }
  }

  function estMauvais(perso) {
    if (charAttributeAsBool(perso, 'mauvais')) return true;
    var charRace = ficheAttribute(perso, 'RACE');
    if (charRace === undefined) return false;
    switch (charRace.trim().toLowerCase()) {
      case 'squelette':
      case 'zombie':
      case 'élémentaire':
      case 'démon':
      case 'momie':
        return true;
      default:
        return false;
    }
  }

  //Retourne un encodage des tailes :
  // 1 : minuscule
  // 2 : très petit
  // 3 : petit
  // 4 : moyen
  // 5 : grand
  // 6 : énorme
  // 7 : colossal
  function taillePersonnage(perso) {
    var attr = findObjs({
      _type: 'attribute',
      _characterid: perso.charId,
    });
    var attrTaille = attr.filter(function(a) {
      return a.get('name').toUpperCase() == 'TAILLE';
    });
    if (attrTaille.length > 0) {
      switch (attrTaille[0].get('current').trim().toLowerCase()) {
        case "minuscule":
          return 1;
        case "très petit":
        case "très petite":
        case "tres petit":
          return 2;
        case "petit":
        case "petite":
          return 3;
        case "moyen":
        case "moyenne":
        case "normal":
        case "normale":
          return 4;
        case "grand":
        case "grande":
          return 5;
        case "énorme":
        case "enorme":
          return 6;
        case "colossal":
        case "colossale":
          return 7;
        default: //On passe à la méthode suivante
      }
    }
    var attrRace = attr.filter(function(a) {
      return a.get('name').toUpperCase() == 'RACE';
    });
    if (attrRace.length > 0) {
      switch (attrRace[0].get('current').trim().toLowerCase()) {
        case 'lutin':
        case 'fee':
          return 2;
        case 'halfelin':
        case 'gobelin':
        case 'kobold':
          return 3;
        case 'humain':
        case 'elfe':
        case 'nain':
        case 'demi-elfe':
        case 'demi-orque':
        case 'orque':
        case 'gnome':
        case 'âme-forgée':
          return 4;
        case 'centaure':
        case 'demi-ogre':
        case 'ogre':
        case 'minotaure':
          return 5;
      }
    }
    return undefined;
  }

  function estAussiGrandQue(perso1, perso2) {
    var t1 = taillePersonnage(perso1);
    var t2 = taillePersonnage(perso2);
    if (t1 === undefined || t2 === undefined) return true;
    if (t2 > t1) return false;
    return true;
  }

  function soigner(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd.length < 2) {
      error("Il faut au moins un argument à !cof-soin", cmd);
      return;
    }
    var soigneur = options.lanceur;
    var pageId = options.pageId;
    var cible;
    var argSoin;
    if (cmd.length > 4) {
      error("Trop d'arguments à !cof-soin", cmd);
    }
    if (cmd.length > 2) { //cof-soin lanceur [cible] montant
      if (soigneur === undefined) {
        soigneur = tokenOfId(cmd[1], cmd[1]);
        if (soigneur === undefined) {
          error("Le premier argument n'est pas un token valide", cmd[1]);
          return;
        }
        pageId = soigneur.token.get('pageid');
      }
      if (cmd.length > 3) { // on a la cible en argument
        cible = tokenOfId(cmd[2], cmd[2], pageId);
        if (cible === undefined) {
          error("Le deuxième argument n'est pas un token valide: " + msg.content, cmd[2]);
          return;
        }
        argSoin = cmd[3];
      } else {
        argSoin = cmd[2];
      }
    } else { //on a juste le montant des soins
      argSoin = cmd[1];
    }
    if (soigneur === undefined && (options.mana || (options.portee !== undefined) || options.limiteParJour || options.limiteParCombat || options.dose)) {
      error("Il faut préciser un soigneur pour ces options d'effet", options);
      return;
    }
    var charId;
    var niveau = 1;
    var rangSoin = 0;
    var soins;
    if (soigneur) {
      charId = soigneur.charId;
      niveau = ficheAttributeAsInt(soigneur, 'NIVEAU', 1);
      rangSoin = charAttributeAsInt(soigneur, 'voieDesSoins', 0);
    }
    var effet = "soins";
    var nbDes = 1;
    if (options.tempeteDeManaIntense) nbDes += options.tempeteDeManaIntense;
    switch (argSoin) {
      case 'leger':
        effet += ' légers';
        if (options.dose === undefined && options.limiteParJour === undefined)
          options.limiteAttribut = {
            nom: 'soinsLegers',
            message: "ne peut plus lancer de sort de soins légers aujourd'hui",
            limite: rangSoin
          };
        var bonusLeger = niveau + charAttributeAsInt(soigneur, 'voieDuGuerisseur', 0);
        soins = "[[" + nbDes + "d8 +" + bonusLeger + "]]";
        if (options.portee === undefined) options.portee = 0;
        break;
      case 'modere':
        effet += ' modérés';
        if (options.dose === undefined && options.limiteParJour === undefined)
          options.limiteAttribut = {
            nom: 'soinsModeres',
            message: "ne peut plus lancer de sort de soins modéréss aujourd'hui",
            limite: rangSoin
          };
        if (options.portee === undefined) options.portee = 0;
        var bonusModere = niveau + charAttributeAsInt(soigneur, 'voieDuGuerisseur', 0);
        soins = "[[" + (nbDes + 1) + "d8 +" + bonusModere + "]]";
        break;
      case 'groupe':
        if (!stateCOF.combat) {
          sendChar(charId, " ne peut pas lancer de soin de groupe en dehors des combats");
          return;
        }
        effet += ' de groupe';
        if (options.dose === undefined && options.limiteParJour === undefined)
          options.limiteAttribut = {
            nom: 'soinsDeGroupe',
            message: " a déjà fait un soin de groupe durant ce combat",
            limite: 1
          };
        if (options.puissant) soins = "[[1d10";
        else soins = "[[" + nbDes + "d8";
        var bonusGroupe = niveau + charAttributeAsInt(soigneur, 'voieDuGuerisseur', 0);
        soins += " + " + bonusGroupe + "]]";
        msg.content += " --allies --self";
        if (options.mana === undefined) options.mana = 1;
        break;
      case 'secondSouffle':
        if (!stateCOF.combat) {
          sendChar(charId, " ne peut pas utiliser la capacité second souffle en dehors des combats");
          return;
        }
        effet = "second souffle";
        if (options.dose === undefined && options.limiteParJour === undefined)
          options.limiteAttribut = {
            nom: 'secondSouffle',
            message: " a déjà repris son souffle durant ce combat",
            limite: 1
          };
        soins = "[[1d10+" + niveau + "+" + modCarac(soigneur, 'CONSTITUTION') +
          "]]";
        cible = soigneur;
        options.recuperation = true;
        break;
      default:
        //TODO : augmenter les dés en cas de tempete de mana intense
        if (options.tempeteDeManaIntense) {
          var firstDicePart = argSoin.match(/[1-9][0-9]*d\d+/i);
          if (firstDicePart && firstDicePart.length > 0) {
            var fdp = firstDicePart[0];
            nbDes = parseInt(fdp) + options.tempeteDeManaIntense;
            argSoin =
              argSoin.replace(fdp, nbDes + fdp.substring(fdp.search(/d/i)));
          } else {
            argSoin = '(' + argSoin + ')*' + (1 + options.tempeteDeManaIntense);
          }
        }
        soins = "[[" + argSoin + "]]";
    }
    var playerId = getPlayerIdFromMsg(msg);
    if (options.tempeteDeMana && soigneur) {
      if (options.tempeteDeMana.cout === 0) {
        //On demande de préciser les options
        var optMana = {
          mana: options.mana,
          rang: options.rang,
          portee: options.portee,
          altruiste: options.altruiste,
          soins: true
        };
        setTempeteDeMana(playerId, soigneur, msg.content, optMana);
        return;
      } else {
        if (options.rang && options.tempeteDeMana.cout > options.rang) {
          sendChar(soigneur.charId, "Attention, le coût de la tempête de mana (" + options.tempeteDeMana.cout + ") est supérieur au rang du sort");
        }
      }
    }
    sendChat('', soins, function(res) {
      soins = res[0].inlinerolls[0].results.total;
      var soinTxt = buildinline(res[0].inlinerolls[0], 'normal', true);
      if (soins <= 0) {
        sendChar(charId, "ne réussit pas à soigner (total de soins " + soinTxt + ")");
        return;
      }
      var evt = {
        type: effet
      };
      var ressourceLimiteCibleParJour;
      if (options.limiteCibleParJour) {
        ressourceLimiteCibleParJour = effet;
        if (options.limiteCibleParJourRessource)
          ressourceLimiteCibleParJour = options.limiteCibleParJourRessource;
        ressourceLimiteCibleParJour = "limiteParJour_" + ressourceLimiteCibleParJour;
      }
      var limiteATester = true;
      var soinImpossible = false;
      var nbCibles;
      var display;
      var iterCibles = function(callback) {
        if (cible) {
          nbCibles = 1;
          callback(cible);
        } else {
          getSelected(msg, function(selected) {
            nbCibles = selected.length;
            if (nbCibles > 1) {
              display = startFramedDisplay(playerId, effet, soigneur);
            } else if (nbCibles === 0) {
              sendChar(charId, "personne à soigner");
              return;
            }
            iterSelected(selected, callback);
          }, {
            lanceur: soigneur
          });
        }
      };
      var finSoin = function() {
        if (nbCibles == 1) {
          if (display) sendChat("", endFramedDisplay(display));
          addEvent(evt);
        }
        nbCibles--;
      };
      iterCibles(function(cible) {
        if (ressourceLimiteCibleParJour) {
          var utilisations =
            attributeAsInt(cible, ressourceLimiteCibleParJour, options.limiteCibleParJour);
          if (utilisations === 0) {
            sendChar(cible.charId, "ne peut plus bénéficier de " + effet + " aujourd'hui");
            finSoin();
            return;
          }
          setTokenAttr(cible, ressourceLimiteCibleParJour, utilisations - 1, evt);
        }
        if (soinImpossible) {
          finSoin();
          return;
        }
        var token2 = cible.token;
        var nomCible = token2.get('name');
        var sujet = onGenre(cible.charId, 'il', 'elle');
        var Sujet = onGenre(cible.charId, 'Il', 'Elle');
        if (options.portee !== undefined) {
          if (options.tempeteDeManaPortee) options.portee = options.portee * 2;
          var distance = distanceCombat(soigneur.token, token2, pageId);
          if (distance > options.portee) {
            if (display)
              addLineToFramedDisplay(display, "<b>" + nomCible + "</b> : trop loin pour le soin.");
            else
              sendChar(charId,
                "est trop loin de " + nomCible + " pour le soigner.");
            return;
          }
        }
        if (limiteATester) {
          limiteATester = false;
          if (limiteRessources(soigneur, options, effet, effet, evt)) {
            soinImpossible = true;
            display = undefined;
            finSoin();
            return;
          } else if (display) {
            addLineToFramedDisplay(display, "Résultat des dés : " + soinTxt);
          }
        }
        var callMax = function() {
          if (display) {
            addLineToFramedDisplay(display, "<b>" + nomCible + "</b> : pas besoin de soins.");
          } else {
            var maxMsg = "n'a pas besoin de ";
            if (options.recuperation) {
              maxMsg = "se reposer";
              charId = soigneur.charId;
            } else if (!soigneur || token2.id == soigneur.token.id) {
              maxMsg += "se soigner";
              charId = cible.charId;
            } else {
              maxMsg += "soigner " + nomCible;
            }
            sendChar(charId, maxMsg + ". " + Sujet + " est déjà au maximum de PV");
          }
          return;
        };
        var printTrue = function(s) {
          if (display) {
            addLineToFramedDisplay(display,
              "<b>" + nomCible + "</b> : + " + s + " PV");
          } else {
            var msgSoin;
            if (!soigneur || token2.id == soigneur.token.id) {
              msgSoin = 'se soigne';
              charId = cible.charId;
            } else {
              msgSoin = 'soigne ' + nomCible;
            }
            msgSoin += " de ";
            if (options.recuperation) msgSoin = "récupère ";
            if (s < soins)
              msgSoin += s + " PV. (Le résultat du jet était " + soinTxt + ")";
            else msgSoin += soinTxt + " PV.";
            sendChar(charId, msgSoin);
          }
        };
        var callTrue = printTrue;
        var pvSoigneur;
        var callTrueFinal = callTrue;
        if (msg.content.includes(' --transfer')) { //paie avec ses PV
          if (soigneur === undefined) {
            error("Il faut préciser qui est le soigneur pour utiliser l'option --transfer", msg.content);
            soinImpossible = true;
            return;
          }
          pvSoigneur = parseInt(soigneur.token.get("bar1_value"));
          if (isNaN(pvSoigneur) || pvSoigneur <= 0) {
            if (display)
              addLineToFramedDisplay(display, "<b>" + nomCible + "</b> : plus assez de PV pour le soigner");
            else
              sendChar(charId,
                "ne peut pas soigner " + nomCible + ", " + sujet + " n'a plus de PV");
            soinImpossible = true;
            finSoin();
            return;
          }
          if (pvSoigneur < soins) {
            soins = pvSoigneur;
          }
          callTrueFinal = function(s) {
            updateCurrentBar(soigneur.token, 1, pvSoigneur - s, evt);
            if (pvSoigneur == s) mort(soigneur, undefined, evt);
            callTrue(s);
          };
        }
        if (options.fx) {
          var p1e = {
            x: soigneur.token.get('left'),
            y: soigneur.token.get('top'),
          };
          var p2e = {
            x: cible.token.get('left'),
            y: cible.token.get('top'),
          };
          spawnFxBetweenPoints(p1e, p2e, options.fx, pageId);
        }
        if (options.targetFx) {
          spawnFx(cible.token.get('left'), cible.token.get('top'), options.targetFx, pageId);
        }
        soigneToken(cible, soins, evt, callTrueFinal, callMax);
        finSoin();
      }); //fin de iterCibles
    }); //fin du sendChat du jet de dés
  }

  //Deprecated
  function aoeSoin(msg) {
    var args = msg.content.split(' ');
    if (args.length < 2) {
      error("Pas assez d'arguments pour !cof-aoe-soin: " + msg.content, args);
      return;
    }
    var evt = {
      type: 'soins'
    };
    var soigneur;
    var soins;
    var rollSoins;
    if (args[1] == "groupe") {
      if (msg.selected === undefined || msg.selected.length === 0) {
        error("Il faut sélectionner un token qui lance le sort de soins de groupe", msg);
        return;
      }
      if (msg.selected.length > 1) {
        error("Plusieurs tokens sélectionnés comme lançant le sort de soins de groupe.", msg.selected);
      }
      var persoSoigneur = tokenOfId(msg.selected[0]._id);
      if (persoSoigneur === undefined) {
        error("Le token sélectionné ne représente aucun personnage", tokSoigneur);
        return;
      }
      var tokSoigneur = persoSoigneur.token;
      var charIdSoigneur = persoSoigneur.charId;
      var niveau = ficheAttributeAsInt(persoSoigneur, 'NIVEAU', 1);
      if (stateCOF.combat) {
        var dejaSoigne = charAttributeAsBool(persoSoigneur, 'soinsDeGroupe');
        if (dejaSoigne) {
          sendChar(charIdSoigneur, " a déjà fait un soin de groupe durant ce combat");
          return;
        }
        setTokenAttr(persoSoigneur, 'soinsDeGroupe', true, evt);
      }
      if (!depenseMana(persoSoigneur, 1, "lancer un soin de groupe", evt))
        return;
      if (msg.content.includes(' --puissant')) {
        soins = rollDePlus(10, niveau);
      } else {
        soins = rollDePlus(8, niveau);
      }
      rollSoins = soins.roll;
      soins = soins.val;
      var nameSoigneur = tokSoigneur.get('name');
      soigneur = getObj('character', charIdSoigneur);
      msg.content += " --allies --self";
    } else { // soin générique
      soins = parseInt(args[1]);
      rollSoins = soins;
      if (isNaN(soins) || soins < 1) {
        error(
          "L'argument de !cof-aoe-soin doit être un nombre positif",
          msg.content);
        return;
      }
    }
    if (soins <= 0) {
      sendChat('', "Pas de soins (total de soins " + rollSoins + ")");
      return;
    }

    var action = "Soins de groupe (" + rollSoins + ")";
    getSelected(msg, function(selected, playerId) {
      var display = startFramedDisplay(playerId, action, soigneur);
      if (selected.length === 0) {
        addLineToFramedDisplay(display, "Aucune cible sélectionnée pour le soin");
        sendChat("", endFramedDisplay(display));
        addEvent(evt);
        return;
      }
      iterSelected(selected, function(perso) {
        var name = perso.token.get('name');
        var callMax = function() {
          addLineToFramedDisplay(display, "<b>" + name + "</b> : Pas besoin de soins.");
          return;
        };
        var callTrue = function(soinsEffectifs) {
          addLineToFramedDisplay(display,
            "<b>" + name + "</b> : + " + soinsEffectifs + " PV");
        };
        soigneToken(perso, soins, evt, callTrue, callMax);
      });
      sendChat("", endFramedDisplay(display));
      addEvent(evt);
    });
  }

  function natureNourriciere(msg) {
    getSelected(msg, function(selected) {
      iterSelected(selected, function(lanceur) {
        var charId = lanceur.charId;
        var duree = rollDePlus(6);
        var output =
          "cherche des herbes. Après " + duree.roll + " heures, " +
          onGenre(charId, "il", "elle");
        var evt = {
          type: "recherche d'herbes"
        };
        testCaracteristique(lanceur, 'SAG', 10, {}, evt,
          function(testRes) {
            if (testRes.reussite) {
              output += " revient avec de quoi soigner les blessés.";
            } else {
              output += " revient bredouille.";
            }
            sendChar(charId, output);
            addEvent(evt);
          });
      });
    });
  }

  function ignorerLaDouleur(msg) {
    getSelected(msg, function(selected) {
      iterSelected(selected, function(chevalier) {
        var charId = chevalier.charId;
        var token = chevalier.token;
        if (attributeAsInt(chevalier, 'ignorerLaDouleur', 0) > 0) {
          sendChar(charId, "a déjà ignoré la doubleur une fois pendant ce combat");
          return;
        }
        var lastAct = lastEvent();
        if (lastAct === undefined || lastAct.type != 'attaque') {
          sendChar(charId, "s'y prend trop tard pour ignorer la douleur : la dernière action n'était pas une attaque");
          return;
        }
        if (lastAct.affectes === undefined) {
          sendChar(charId, "ne peut ignorer la douleur : il semble que la dernière attaque n'ait affecté personne");
          return;
        }
        var affecte = lastAct.affectes[token.id];
        if (affecte === undefined || affecte.prev === undefined) {
          sendChar(charId, "ne peut ignorer la douleur : il semble que la dernière attaque ne l'ait pas affecté");
          return;
        }
        var lastBar1 = affecte.prev.bar1_value;
        var bar1 = parseInt(token.get('bar1_value'));
        if (isNaN(lastBar1) || isNaN(bar1) || lastBar1 <= bar1) {
          sendChar(charId, "ne peut ignorer la douleur : il semble que la dernière attaque ne lui ait pas enlevé de PV");
          return;
        }
        var evt = {
          type: 'ignorer la douleur'
        };
        updateCurrentBar(token, 1, lastBar1, evt);
        setTokenAttr(chevalier, 'ignorerLaDouleur', lastBar1 - bar1, evt);
        sendChar(charId, " ignore la douleur de la dernière attaque");
      });
    });
  }

  function fortifiant(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd === undefined || cmd.length < 2) {
      error("La fonction !cof-fortifiant attend en argument le rang dans la Voie des élixirs du créateur", cmd);
      return;
    }
    var rang = parseInt(cmd[1]);
    if (isNaN(rang) || rang < 1) {
      error("Rang du fortifiant incorrect", cmd);
      return;
    }
    getSelected(msg, function(selection) {
      iterSelected(selection, function(beneficiaire) {
        var evt = {
          type: 'fortifiant',
          attributes: []
        };
        if (limiteRessources(beneficiaire, options, 'elixir_fortifiant', "boire un fortifiant", evt)) return;
        var name2 = beneficiaire.token.get('name');
        var soins = rollDePlus(4, rang);
        sendChar(beneficiaire.charId, " boit un fortifiant");
        soigneToken(beneficiaire, soins.val, evt, function(soinsEffectifs) {
          var msgSoins = "et est soigné de ";
          if (soinsEffectifs == soins.val) msgSoins += soins.roll + " PV";
          else msgSoins += soinsEffectifs + " PV (le jet était " + soins.roll + ")";
          sendChar(beneficiaire.charId, msgSoins);
        });
        // Finalement on met l'effet fortifie
        setTokenAttr(beneficiaire, 'fortifie', rang + 1, evt);
        addEvent(evt);
      });
    });
  }

  function lancerSort(msg) {
    var cmd = msg.content.split(' ');
    if (cmd.length < 3) {
      error("La fonction !cof-lancer-sort attend en argument le coût en mana", cmd);
      return;
    }
    cmd.shift();
    var indexLanceur = cmd.findIndex(function(c) {
      return c == '--lanceur';
    });
    if (indexLanceur > -1 && indexLanceur < cmd.length - 1) {
      var l = tokenOfId(cmd[indexLanceur + 1]);
      if (l) {
        msg.selected = [{
          _id: cmd[indexLanceur + 1]
        }];
        cmd.splice(indexLanceur, 2);
      }
    }
    var mana = parseInt(cmd.shift());
    if (isNaN(mana) || mana < 0) {
      error("Le deuxième argument de !cof-lancer-sort doit être un nombre positif", msg.content);
      return;
    }
    var spell = cmd.join(' ');
    getSelected(msg, function(selected) {
      if (selected.length === 0) {
        error("Pas de token sélectionée pour !cof-lancer-sort", cmd);
        return;
      }
      iterSelected(selected, function(lanceur) {
        var charId = lanceur.charId;
        var evt = {
          type: "lancement de sort"
        };
        if (depenseMana(lanceur, mana, spell, evt)) {
          whisperChar(charId, spell);
          addEvent(evt);
        }
      });
    });
  }

  function emulerAs(msg) {
    var cmd = msg.content.split(' ');
    if (cmd.length < 2) {
      error("Il manque le nom du personnage pour !cof-as", msg.content);
      return;
    }
    cmd.shift();
    var nomPerso = cmd.shift();
    if (nomPerso.charAt(0) == '"') {
      nomPerso = nomPerso.substring(1);
      var inComma = cmd.length;
      while (inComma) {
        nomPerso += ' ' + cmd.shift();
        inComma--;
        if (nomPerso.endsWith('"')) {
          nomPerso = nomPerso.substr(0, nomPerso.length - 1);
          inComma = 0;
        }
      }
    }
    var message = cmd.join(' ');
    sendChat(nomPerso, message);
  }


  function murDeForce(msg) {
    var cmd = msg.content.split(' ');
    var sphere = true;
    if (cmd.length > 1 && cmd[1] == 'mur') sphere = false;
    getSelected(msg, function(selected) {
      iterSelected(selected, function(lanceur) {
        var charId = lanceur.charId;
        var token = lanceur.token;
        var pageId = lanceur.token.get('pageid');
        var options = {};
        var args = msg.content.split(' --');
        args.shift();
        args.forEach(function(opt) {
          var optCmd = opt.split(' ');
          switch (optCmd[0]) {
            case 'mana':
              if (optCmd.length < 2) {
                error("Il manque le coût en mana", cmd);
                options.mana = 5;
                return;
              }
              options.mana = parseInt(optCmd[1]);
              if (isNaN(options.mana) || options.mana < 0) {
                error("Coût en mana incorrect", optCmd);
                options.mana = 5;
              }
              return;
            case 'puissant':
              options.puissant = true;
              return;
            case 'image':
              if (optCmd.length < 2) {
                error("Il manque l'adresse de l'image", cmd);
                return;
              }
              options.image = optCmd[1];
              return;
            default:
              error("Option inconnue", cmd);
          }
        });
        var evt = {
          type: "Mur de force"
        };
        if (!depenseMana(lanceur, options.mana, "lancer un mur de force", evt)) {
          return;
        }
        sendChar(charId, "lance un sort de mur de force");
        if (options.image && sphere) {
          var page = getObj("page", pageId);
          var scale = page.get('scale_number');
          var diametre = PIX_PER_UNIT * (6 / scale);
          var imageFields = {
            _pageid: pageId,
            imgsrc: options.image,
            represents: '',
            left: token.get('left'),
            top: token.get('top'),
            width: diametre,
            height: diametre,
            layer: 'map',
            name: "Mur de force",
            isdrawing: true,
          };
          var newImage = createObj('graphic', imageFields);
          toFront(newImage);
          var duree = 5 + modCarac(lanceur, 'CHARISME');
          setTokenAttr(lanceur, 'murDeForce', duree, evt, undefined, getInit());
          setTokenAttr(lanceur, 'murDeForceId', newImage.id, evt);
        } else {
          sendChar(charId, '/w "' + token.get('name') + '" ' + "placer l'image du mur sur la carte");
        }
        addEvent(evt);
      });
    });
  }

  function tokensEnCombat() {
    var cmp = Campaign();
    var turnOrder = cmp.get('turnorder');
    if (turnOrder === '') return []; // nothing in the turn order
    turnOrder = JSON.parse(turnOrder);
    if (turnOrder.length === 0) return [];
    var tokens = [];
    turnOrder.forEach(function(a) {
      if (a.id == -1) return;
      tokens.push({
        _id: a.id
      });
    });
    return tokens;
  }

  function aUnCapitaine(cible, evt, pageId) {
    var charId = cible.charId;
    var attrs = findObjs({
      _type: 'attribute',
      _characterid: charId,
    });
    var attrCapitaine = attrs.find(function(a) {
      return (a.get('name') == 'capitaine');
    });
    if (attrCapitaine === undefined) return false;
    if (pageId === undefined) {
      pageId = cible.token.get('pageid');
    }
    var nomCapitaine = attrCapitaine.get('current');
    var idCapitaine = attrCapitaine.get('max');
    var capitaine = tokenOfId(idCapitaine, nomCapitaine, pageId);
    var capitaineActif = attrs.find(function(a) {
      return (a.get('name') == 'capitaineActif');
    });
    if (capitaine && isActive(capitaine)) {
      if (capitaineActif) return true;
      setTokenAttr({
        charId: charId
      }, 'capitaineActif', true, evt);
      iterSelected(tokensEnCombat(), function(perso) {
        if (perso.charId == charId) updateInit(perso.token, evt);
      });
      return true;
    }
    if (capitaineActif) {
      removeTokenAttr({
        charId: charId
      }, 'capitaineActif', evt);
      iterSelected(tokensEnCombat(), function(perso) {
        if (perso.charId == charId) updateInit(perso.token, evt);
      });
    }
    return false;
  }


  function devientCapitaine(msg) {
    var cmd = msg.content.split(' ');
    if (cmd.length < 2) {
      error("La fonction !cof-capitaine attend en argument l'id du capitaine ou --aucun", cmd);
      return;
    }
    var remove;
    var capitaine;
    var nomCapitaine;
    if (cmd[1] == '--aucun') {
      remove = true;
    } else {
      capitaine = tokenOfId(cmd[1], cmd[1]);
      if (capitaine === undefined) {
        error("Le premier argument de !cof-lancer-sort doit être un token", cmd[1]);
        return;
      }
      nomCapitaine = capitaine.token.get('name');
    }
    var evt = {
      type: 'Capitaine'
    };
    getSelected(msg, function(selected) {
      iterSelected(selected, function(perso) {
        var charId = perso.charId;
        var token = perso.token;
        if (remove) {
          removeTokenAttr({
            charId: charId
          }, 'capitaine', evt);
          removeTokenAttr({
            charId: charId
          }, 'capitaineActif', evt);
          sendChat('COF', "/w GM " + token.get('name') + " n'a plus de capitaine");
        } else {
          if (token.id == capitaine.token.id) return;
          setTokenAttr({
              charId: charId
            }, 'capitaine', nomCapitaine, evt,
            undefined, capitaine.token.id);
          sendChat('COF', "/w GM " + nomCapitaine + " est le capitaine de " + token.get('name'));
        }
      });
      addEvent(evt);
    });
  }


  function distribuerBaies(msg) {
    if (msg.selected === undefined || msg.selected.length != 1) {
      error("Pour utiliser !cof-distribuer-baies, il faut sélectionner un token", msg);
      return;
    }
    var druide = tokenOfId(msg.selected[0]._id);
    if (druide === undefined) {
      error("Erreur de sélection dans !cof-distribuer-baies", msg.selected);
      return;
    }
    var niveau = ficheAttributeAsInt(druide, 'NIVEAU', 1);
    var evt = {
      type: "Distribution de baies magiques"
    };
    var action = "Distribue des baies";
    var mangerBaie = "!cof-consommer-baie " + niveau + " --limiteParJour 1 baieMagique";
    getSelected(msg, function(selected, playerId) {
      var display = startFramedDisplay(playerId, action, druide);
      iterSelected(selected, function(perso) {
        var nom = perso.token.get('name');
        var baie = tokenAttribute(perso, 'dose_baie_magique');
        var nbBaies = 1;
        if (baie.length > 0) {
          var actionAncienne = baie[0].get('max');
          var indexNiveau = actionAncienne.indexOf(' ') + 1;
          var ancienNiveau = parseInt(actionAncienne.substring(indexNiveau));
          if (ancienNiveau > niveau) {
            addLineToFramedDisplay(display, nom + " a déjà une baie plus puissante");
            return;
          }
          if (ancienNiveau == niveau) {
            nbBaies = parseInt(baie[0].get('current'));
            if (isNaN(nbBaies) || nbBaies < 0) nbBaies = 0;
            nbBaies++;
          }
        }
        setTokenAttr(perso, 'dose_baie_magique', nbBaies, evt, undefined, mangerBaie);
        var line = nom + " reçoit une baie";
        if (perso.token.id == druide.token.id)
          line = nom + " en garde une pour " + onGenre(druide.charId, "lui", "elle");
        addLineToFramedDisplay(display, line);
      });
      addEvent(evt);
      sendChat("", endFramedDisplay(display));
    }, {
      lanceur: druide
    }); //fin du getSelected
  }

  function consommerBaie(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd.length < 2) {
      error("Il faut un argument à !cof-consommer-baie", cmd);
      return;
    }
    var baie = parseInt(cmd[1]);
    if (isNaN(baie) || baie < 0) {
      error("L'argument de !cof-consommer-baie doit être un nombre positif", cmd);
      return;
    }
    getSelected(msg, function(selection) {
      if (selection === undefined) {
        sendPlayer(msg, "Pas de token sélectionné pour !cof-consommer-baie");
        return;
      }
      var evt = {
        type: "consommer une baie"
      };
      iterSelected(msg.selected, function(perso) {
        if (limiteRessources(perso, options, 'baieMagique', "a déjà mangé une baie aujourd'hui. Pas d'effet.", evt)) return;
        var soins = rollDePlus(6, baie);
        soigneToken(perso, soins.val, evt, function(soinsEffectifs) {
            var msgSoins = "mange une baie magique. Il est rassasié et récupère ";
            if (soinsEffectifs == soins.val) msgSoins += soins.roll + " points de vie";
            else msgSoins += soinsEffectifs + " PV (le jet était " + soins.roll + ")";
            sendChar(perso.charId, msgSoins);
          },
          function() {
            sendChar(perso.charId, "mange une baie magique. " + onGenre(perso.charId, "Il", "Elle") + " se sent rassasié" + onGenre(perso.charId, '', 'e') + '.');
          });
      });
      addEvent(evt);
    }); //fin de getSelected
  }

  function replaceInline(msg) {
    if (msg.inlinerolls) {
      msg.content = _.chain(msg.inlinerolls)
        .reduce(function(m, v, k) {
          m['$[[' + k + ']]'] = v.results.total || 0;
          return m;
        }, {})
        .reduce(function(m, v, k) {
          return m.replace(k, v);
        }, msg.content)
        .value();
    }
  }

  /* Quand on protège un allié, on stocke l'id et le nom du token dans un attribut 'protegerUnAllie' (champs current et max), et pour ce token, on met un 
   * attribut 'protegePar_nom' où nom est le nom du token protecteur, et qui contient l'id et le nom du token protecteur
   * Ces attributs disparaissent à la fin des combats */
  function protegerUnAllie(msg) {
    var args = msg.content.split(" ");
    if (args.length < 3) {
      error("Pas assez d'arguments pour !cof-proteger-un-allie: " + msg.content, args);
      return;
    }
    var protecteur = tokenOfId(args[1], args[1]);
    if (protecteur === undefined) {
      error("Le premier argument n'est pas un token valide", args[1]);
      return;
    }
    var tokenProtecteur = protecteur.token;
    var charIdProtecteur = protecteur.charId;
    var nameProtecteur = tokenProtecteur.get('name');
    var pageId = tokenProtecteur.get('pageid');
    var target = tokenOfId(args[2], args[2], pageId);
    if (target === undefined) {
      error("Le deuxième argument n'est pas un token valide: " + msg.content, args[2]);
      return;
    }
    var tokenTarget = target.token;
    if (tokenTarget.id == tokenProtecteur.id) {
      sendChar(charIdProtecteur, "ne peut pas se protéger lui-même");
      return;
    }
    var charIdTarget = target.charId;
    var nameTarget = tokenTarget.get('name');
    var evt = {
      type: "Protéger un allié"
    };
    var attrsProtecteur = tokenAttribute(protecteur, 'protegerUnAllie');
    var protegePar = 'protegePar_' + nameProtecteur;
    if (attrsProtecteur.length > 0) { //On protège déjà quelqu'un
      var previousTarget =
        tokenOfId(attrsProtecteur[0].get('current'),
          attrsProtecteur[0].get('max'), pageId);
      if (previousTarget) {
        if (previousTarget.token.id == tokenTarget.id) {
          sendChar(charIdProtecteur, "protège déjà " + nameTarget);
          return;
        }
        removeTokenAttr(previousTarget, protegePar, evt,
          "n'est plus protégé par " + nameProtecteur);
      }
    }
    setTokenAttr(protecteur, 'protegerUnAllie',
      tokenTarget.id, evt, "protège " + nameTarget, nameTarget);
    setTokenAttr(target, protegePar, tokenProtecteur.id, evt, undefined, nameProtecteur);
    addEvent(evt);
  }

  function actionDefensive(msg) {
    var cmd = msg.content.split(' ');
    var def = 2; //pour une défense simple
    var defMsg = "préfère se défendre pendant ce tour";
    if (cmd.length > 1) {
      switch (cmd[1]) {
        case 'totale':
          def = 4;
          defMsg = "se consacre entièrement à sa défense pendant ce tour";
          break;
        case 'simple':
          def = 2;
          break;
        default:
          error("Argument de !cof-action-defensive non reconnu", cmd);
      }
    }
    var evt = {
      type: "action défensive"
    };
    getSelected(msg, function(selected) {
      initiative(selected, evt);
      iterSelected(selected, function(perso) {
        setTokenAttr(perso, 'defenseTotale', def, evt, defMsg, stateCOF.tour);
      });
      addEvent(evt);
    });
  }

  function strangulation(msg) {
    var args = msg.content.split(' ');
    if (args.length < 3) {
      error("Pas assez d'arguments pour !cof-strangulation: " + msg.content, args);
      return;
    }
    var necromancien = tokenOfId(args[1], args[1]);
    if (necromancien === undefined) {
      error("Le premier argument n'est pas un token", args[1]);
      return;
    }
    var charId1 = necromancien.charId;
    var pageId = necromancien.token.get('pageid');
    var target = tokenOfId(args[2], args[2], pageId);
    if (target === undefined) {
      error("Le deuxième argument n'est pas un token valide: " + msg.content, args[2]);
      return;
    }
    var charId2 = target.charId;
    var name2 = target.token.get('name');
    if (!attributeAsBool(target, 'strangulation')) {
      sendChar(charId1, "ne peut pas maintenir la strangulation. Il faut (re)lancer le sort");
      return;
    }
    var evt = {
      type: "Strangulation"
    };
    var dureeStrang = tokenAttribute(target, 'dureeStrangulation');
    var nouvelleDuree = 1;
    if (dureeStrang.length > 0) {
      nouvelleDuree = parseInt(dureeStrang[0].get('current'));
      if (isNaN(nouvelleDuree)) {
        log("Durée de strangulation n'est pas un nombre");
        log(dureeStrang);
        nouvelleDuree = 1;
      } else nouvelleDuree++;
    }
    setTokenAttr(target, 'dureeStrangulation', nouvelleDuree, evt, undefined, true);
    var deStrang = 6;
    if (msg.content.includes(' --puissant')) deStrang = 8;
    var dmgExpr = "[[1d" + deStrang + " ";
    var modInt = modCarac(necromancien, 'INTELLIGENCE');
    if (modInt > 0) dmgExpr += "+" + modInt;
    else if (modInt < 0) dmgExpr += modInt;
    dmgExpr += "]]";
    sendChat('', dmgExpr, function(res) {
      var dmg = {
        type: 'magique',
        total: res[0].inlinerolls[0].results.total,
        display: buildinline(res[0].inlinerolls[0], 'normal', true),
      };
      dealDamage(target, dmg, [], evt, false, {
          attaquant: necromancien
        }, undefined,
        function(dmgDisplay, dmg) {
          sendChar(charId1, "maintient sa strangulation sur " + name2 + ". Dommages : " + dmgDisplay);
          addEvent(evt);
        });
    });
  }


  function ombreMortelle(msg) {
    var args = msg.content.split(' ');
    if (args.length < 4) {
      error("Pas assez d'arguments pour " + args[0], args);
      return;
    }
    var lanceur = tokenOfId(args[1], args[1]);
    if (lanceur === undefined) {
      error("Le premier argument n'est pas un token valide", args[1]);
      return;
    }
    var pageId = lanceur.token.get('pageid');
    var cible = tokenOfId(args[2], args[2], pageId);
    if (cible === undefined) {
      error("La cible n'est pas un token valide", args[2]);
      return;
    }
    cible.name = cible.token.get('name');
    var duree = parseInt(args[3]);
    if (isNaN(duree) || duree <= 0) {
      error("La durée doit être un nombre positif", args);
      return;
    }
    var image = stateCOF.options.images.val.image_ombre.val;
    var options = {};
    var opts = msg.content.split(' --');
    opts.shift();
    opts.forEach(function(option) {
      var cmd = option.split(' ');
      switch (cmd[0]) {
        case 'portee':
          if (cmd.length < 2) {
            error("Il manque l'argument de --portee", msg.content);
            return;
          }
          options.portee = parseInt(cmd[1]);
          if (isNaN(options.portee) || options.portee < 0) {
            error("La portée doit être un nombre positif", cmd);
            delete options.portee;
          }
          return;
        case 'mana':
          if (cmd.length < 2) {
            error("Il manque l'argument de --mana", msg.content);
            return;
          }
          options.mana = parseInt(cmd[1]);
          if (isNaN(options.mana) || options.mana < 0) {
            error("Le coût en mana doit être un nombre positif", cmd);
            delete options.mana;
          }
          return;
        case 'image':
          if (cmd.length < 2) {
            error("Il manque l'argument de --image", msg.content);
            return;
          }
          image = cmd[1];
          return;
        default:
          return;
      }
    });
    if (options.portee !== undefined) {
      var distance = distanceCombat(lanceur.token, cible.token, pageId);
      if (distance > options.portee) {
        sendChar(lanceur.charId, "est trop loind de " + cible.name +
          " pour animer son ombre");
        return;
      }
    }
    var evt = {
      type: "Ombre mortelle"
    };
    if (options.mana) {
      var msgMana = "invoquer une ombre mortelle";
      if (!depenseMana(lanceur, options.mana, msgMana, evt)) return;
    }
    copieToken(cible, image, stateCOF.options.images.val.image_ombre.val, "Ombre de " + cible.name, 'ombreMortelle', duree, pageId, evt);
    sendChar(lanceur.charId,
      "anime l'ombre de " + cible.name + ". Celle-ci commence à attaquer " +
      cible.name + "&nbsp;!");
    addEvent(evt);
  }

  function copieToken(cible, image1, image2, nom, effet, duree, pageId, evt) {
    var pv = parseInt(cible.token.get('bar1_value'));
    if (isNaN(pv)) {
      error("Token avec des PV qui ne sont pas un nombre", cible.token);
      return;
    }
    if (pv > 1) pv = Math.floor(pv / 2);
    var pvMax = parseInt(cible.token.get('bar1_max'));
    if (isNaN(pvMax)) {
      error("Token avec des PV max qui ne sont pas un nombre", cible.token);
      return;
    }
    if (pvMax > 1) pvMax = Math.floor(pvMax / 2);
    var tokenFields = {
      _pageid: pageId,
      imgsrc: image1,
      represents: cible.charId,
      left: cible.token.get('left') + 60,
      top: cible.token.get('top'),
      width: cible.token.get('width'),
      height: cible.token.get('height'),
      rotation: cible.token.get('rotation'),
      layer: 'objects',
      name: nom,
      bar1_value: pv,
      bar1_max: pvMax,
      bar2_value: cible.token.get('bar2_value'),
      bar2_max: cible.token.get('bar2_max'),
      bar3_value: cible.token.get('bar3_value'),
      bar3_max: cible.token.get('bar3_max'),
      showname: true,
      showplayers_name: true,
      showplayers_bar1: true,
    };
    var newToken;
    if (image1) newToken = createObj('graphic', tokenFields);
    if (newToken === undefined) {
      tokenFields.imgsrc = cible.token.get('imgsrc').replace("max", "thumb");
      newToken = createObj('graphic', tokenFields);
      if (newToken === undefined) {
        log(tokenFields.imgsrc);
        if (image2 && image2 != image1) {
          tokenFields.imgsrc = image2;
          newToken = createObj('graphic', tokenFields);
        }
        if (newToken === undefined) {
          error("L'image du token sélectionné n'a pas été uploadé, et l'image par défaut n'est pas correcte. Impossible de créer un token.", tokenFields);
          return;
        }
      }
    }
    var perso = {
      token: newToken,
      charId: cible.charId
    };
    setTokenAttr(perso, effet, duree, evt, undefined, getInit());
    initPerso(perso, evt);
  }

  //Attention : ne tient pas compte de la rotation !
  function intersection(pos1, size1, pos2, size2) {
    if (pos1 == pos2) return true;
    if (pos1 < pos2) return ((pos1 + size1 / 2) >= pos2 - size2 / 2);
    return ((pos2 + size2 / 2) >= pos1 - size1 / 2);
  }

  var labelsEscalier = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

  function escalier(msg) {
    getSelected(msg, function(selected) {
      if (selected.length === 0) {
        sendPlayer(msg, "!cof-escalier sans sélection de token");
        log("!cof-escalier requiert de sélectionner des tokens");
        return;
      }
      var pageId = getObj('graphic', selected[0]._id).get('pageid');
      var escaliers = findObjs({
        _type: 'graphic',
        _pageid: pageId,
        layer: 'gmlayer'
      });
      if (escaliers.length === 0) {
        sendPlayer(msg, "Pas de token dans le layer GM");
        return;
      }
      iterSelected(selected, function(perso) {
        var token = perso.token;
        var posX = token.get('left');
        var sizeX = token.get('width');
        var posY = token.get('top');
        var sizeY = token.get('height');
        var sortieEscalier;
        var etages;
        escaliers.forEach(function(esc) {
          if (sortieEscalier) return;
          if (intersection(posX, sizeX, esc.get('left'), esc.get('width')) &&
            intersection(posY, sizeY, esc.get('top'), esc.get('height'))) {
            var escName = esc.get('name');
            var l = escName.length;
            if (l > 2) {
              etages = escName.substr(l - 2, 1);
              if (isNaN(etages)) return;
              var label = escName.substr(l - 1, 1);
              escName = escName.substr(0, l - 1);
              var i = labelsEscalier.indexOf(label);
              if (i == etages - 1) escName += labelsEscalier[0];
              else escName += labelsEscalier[i + 1];
              sortieEscalier = escaliers.find(function(esc2) {
                if (esc2.get('name') == escName) return true;
                return false;
              });
            }
          }
        });
        if (sortieEscalier) {
          token.set('left', sortieEscalier.get('left'));
          token.set('top', sortieEscalier.get('top'));
          return;
        }
        sendPlayer(msg, token.get('name') + " n'est pas sur un escalier");
      });
    }); //fin getSelected
  }

  function defautDansLaCuirasse(msg) {
    var args = msg.content.split(' ');
    if (args.length < 3) {
      error("Pas assez d'arguments pour !cof-defaut-dans-la-cuirasse", args);
      return;
    }
    var tireur = tokenOfId(args[1], args[1]);
    if (tireur === undefined) {
      error("Le premier argument n'est pas un token valide", args[1]);
      return;
    }
    var pageId = tireur.token.get('pageid');
    var cible = tokenOfId(args[2], args[2], pageId);
    if (cible === undefined) {
      error("La cible n'est pas un token valide", args[2]);
      return;
    }
    var evt = {
      type: "Défaut dans la cuirasse"
    };
    setTokenAttr(cible, 'defautDansLaCuirasse_' + tireur.token.get('name'), 2, evt);
    sendChar(tireur.charId, "passe le tour à analyser les points faibles de " + cible.token.get('name'));
    addEvent(evt);
  }

  function postureDeCombat(msg) {
    var args = msg.content.split(' ');
    if (args.length < 4) {
      error("Pas assez d'arguments pour !cof-posture-de-combat", args);
      return;
    }
    var bonus = parseInt(args[1]);
    var attrDebuf = args[2];
    if (attrDebuf != 'DEF' && attrDebuf != 'ATT' && attrDebuf != 'DM') {
      error("L'attribut à débuffer pour la posture de combat est incorrect", args);
      return;
    }
    var attrBuf = args[3];
    if (attrBuf != 'DEF' && attrBuf != 'ATT' && attrBuf != 'DM') {
      error("L'attribut à augmenter pour la posture de combat est incorrect", args);
      return;
    }
    getSelected(msg, function(selected) {
      iterSelected(selected, function(guerrier) {
        if (isNaN(bonus) || bonus < 1) {
          sendPlayer(msg, "choisir un bonus positif (pas " + args[1] + ") pour sa posture de combat");
          return;
        }
        var rang = charAttributeAsInt(guerrier, "voieDuSoldat", 0);
        var charId = guerrier.charId;
        if (rang > 0 && rang < bonus) {
          sendChar(charId, "ne peut choisir qu'un bonus inférieur à " + rang + " pour sa posture de combat");
          return;
        }
        var evt = {
          type: "Posture de combat"
        };
        if (attrBuf == attrDebuf) {
          sendChar(charId, "prend une posture de combat neutre");
          removeTokenAttr(guerrier, 'postureDeCombat', evt);
          addEvent(evt);
          return;
        }
        msg = "prend une posture ";
        switch (attrBuf) {
          case 'DEF':
            msg += "défensive";
            break;
          case 'ATT':
            msg += "offensive";
            break;
          case 'DM':
            msg += "puissante";
            break;
          default:
        }
        msg += " mais ";
        switch (attrDebuf) {
          case 'DEF':
            msg += "risquée";
            break;
          case 'ATT':
            msg += "moins précise";
            break;
          case 'DM':
            msg += "moins puissante";
            break;
          default:
        }
        setTokenAttr(guerrier, 'postureDeCombat', bonus, evt, msg,
          attrDebuf + "_" + attrBuf);
        addEvent(evt);
      });
    });
  }

  function tourDeForce(msg) {
    var args = msg.content.split(' ');
    if (args.length < 2) {
      error("Il manque un argument à !cof-tour-de-force", args);
      return;
    }
    var seuil = parseInt(args[1]);
    var action = "<b>Capacité</b> : Tour de force";
    getSelected(msg, function(selected, playerId) {
      iterSelected(selected, function(barbare) {
        if (isNaN(seuil)) {
          sendChar(barbare.charId, "le seuil de difficulté du tour de force doit être un nombre");
          return;
        }
        var display = startFramedDisplay(playerId, action, barbare);
        var evt = {
          type: "Tour de force"
        };
        testCaracteristique(barbare, 'FOR', seuil, {
            bonus: 10
          }, evt,
          function(testRes) {
            addLineToFramedDisplay(display, " Jet de force difficulté " + seuil);
            var smsg = barbare.token.get('name') + " fait " + testRes.texte;
            if (testRes.reussite) {
              smsg += " => réussite";
            } else {
              smsg += " => échec";
            }
            addLineToFramedDisplay(display, smsg);
            sendChat("", "[[1d4]]", function(res) {
              var rolls = res[0];
              var explRoll = rolls.inlinerolls[0];
              var r = {
                total: explRoll.results.total,
                type: 'normal',
                display: buildinline(explRoll, 'normal')
              };
              var explications = [];
              barbare.ignoreRD = true;
              dealDamage(barbare, r, [], evt, false, {}, explications,
                function(dmgDisplay, dmg) {
                  var dmgMsg = "mais cela lui coûte " + dmgDisplay + " PV";
                  addLineToFramedDisplay(display, dmgMsg);
                  finaliseDisplay(display, explications, evt);
                });
            });
          });
      });
    });
  }

  function encaisserUnCoup(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    var evtARefaire = lastEvent();
    if (cmd !== undefined && cmd.length > 1) { //On relance pour un événement particulier
      evtARefaire = findEvent(cmd[1]);
      if (evtARefaire === undefined) {
        error("L'action est trop ancienne ou a été annulée", cmd);
        return;
      }
    }
    getSelected(msg, function(selected, playerId) {
      if (selected.length === 0) {
        error("Personne n'est sélectionné pour encaisser un coup", msg);
        return;
      }
      if (evtARefaire === undefined) {
        sendChat('', "Historique d'actions vide, pas d'action trouvée pour encaisser un coup");
        return;
      }
      if (evtARefaire.type != 'Attaque' || evtARefaire.succes === false) {
        sendChat('', "la dernière action n'est pas une attaque réussie, trop tard pour encaisser le coup d'une action précédente");
        return;
      }
      var attaque = evtARefaire.action;
      if (attaque.options.distance) {
        sendChat('', "Impossible d'encaisser le dernier coup, ce n'était pas une attaque au contact");
        return;
      }
      var toProceed;
      var evt = {
        type: "Encaisser un coup"
      };
      iterSelected(selected, function(chevalier) {
        if (!attributeAsBool(chevalier, 'encaisserUnCoup')) {
          sendChar(chevalier.charId, "n'est pas placé pour encaisser un coup");
          return;
        }
        if (!peutController(msg, chevalier)) {
          sendPlayer(msg, "pas le droit d'utiliser ce bouton");
          return;
        }
        var cible = attaque.cibles.find(function(target) {
          return (target.token.id === chevalier.token.id);
        });
        if (cible === undefined) {
          sendChar(chevalier.charId, "n'est pas la cible de la dernière attaque");
          return;
        }
        removeTokenAttr(chevalier, 'encaisserUnCoup', evt);
        cible.extraRD =
          ficheAttributeAsInt(chevalier, 'DEFARMURE', 0) *
          ficheAttributeAsInt(chevalier, 'DEFARMUREON', 1) +
          ficheAttributeAsInt(chevalier, 'DEFBOUCLIER', 0) *
          ficheAttributeAsInt(chevalier, 'DEFBOUCLIERON', 1);
        toProceed = true;
      }); //fin iterSelected
      if (toProceed) {
        undoEvent();
        var options = attaque.options;
        options.rollsAttack = attaque.rollsAttack;
        options.evt = evt;
        options.redo = true;
        attack(attaque.player_id, attaque.attaquant, attaque.cibles, attaque.attack_label, options);
      }
    }); //fin getSelected
  }

  // asynchrone : on fait les jets du guerrier en opposition
  function absorberAuBouclier(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    var evtARefaire = lastEvent();
    if (cmd !== undefined && cmd.length > 1) { //On relance pour un événement particulier
      evtARefaire = findEvent(cmd[1]);
      if (evtARefaire === undefined) {
        error("L'action est trop ancienne ou a été annulée", cmd);
        return;
      }
    }
    getSelected(msg, function(selected, playerId) {
      if (selected.length === 0) {
        error("Personne n'est sélectionné pour absorber", msg);
        return;
      }
      if (evtARefaire === undefined) {
        sendChat('', "Historique d'actions vide, pas d'action trouvée pour absorber un coup ou un sort");
        return;
      }
      if (evtARefaire.type != 'Attaque' || evtARefaire.succes === false) {
        sendChat('', "la dernière action n'est pas une attaque réussie, trop tard pour absorber l'attaque précédente");
        return;
      }
      var attaque = evtARefaire.action;
      var options = attaque.options;
      options.rollsAttack = attaque.rollsAttack;
      var evt = {
        type: "absorber un "
      };
      options.evt = evt;
      options.redo = true;
      var attrAbsorbe = 'absorberUn';
      if (options.sortilege) {
        evt.type += "sort";
        attrAbsorbe += "Sort";
      } else {
        evt.type += "coup";
        attrAbsorbe += "Coup";
      }
      var toProceed;
      var count = selected.length;
      iterSelected(selected, function(guerrier) {
        if (!peutController(msg, guerrier)) {
          sendPlayer(msg, "pas le droit d'utiliser ce bouton");
          return;
        }
        if (ficheAttributeAsInt(guerrier, 'DEFBOUCLIERON', 1) != 1) {
          sendChar(guerrier.charId, "ne porte pas son bouclier, il ne peut pas " + evt.type);
          count--;
          return;
        }
        if (!attributeAsBool(guerrier, attrAbsorbe)) {
          sendChar(guerrier.charId, "n'est pas placé pour " + evt.type);
          count--;
          return;
        }
        var cible = attaque.cibles.find(function(target) {
          return (target.token.id === guerrier.token.id);
        });
        if (cible === undefined) {
          sendChar(guerrier.charId, "n'est pas la cible de la dernière attaque");
          count--;
          return;
        }
        removeTokenAttr(guerrier, attrAbsorbe, evt);
        toProceed = true;
        var attackRollExpr = "[[" + computeDice(guerrier) + "]]";
        sendChat('', attackRollExpr, function(res) {
          var rolls = res[0];
          var attackRoll = rolls.inlinerolls[0];
          var totalAbsorbe = attackRoll.results.total;
          var msgAbsorber = buildinline(attackRoll);
          var attBonus = ficheAttributeAsInt(guerrier, 'NIVEAU', 1);
          if (options.sortilege) {
            attBonus += modCarac(guerrier, 'SAGESSE');
            attBonus += ficheAttributeAsInt(guerrier, 'ATKMAG_DIV', 0);
          } else {
            attBonus += modCarac(guerrier, 'FORCE');
            attBonus += ficheAttributeAsInt(guerrier, 'ATKCAC_DIV', 0);
          }
          totalAbsorbe += attBonus;
          if (attBonus > 0) msgAbsorber += "+" + attBonus;
          else if (attBonus < 0) msgAbsorber += attBonus;
          var explAbsorber = [];
          var attAbsBonus = bonusAttaqueA(cible, 'bouclier', evt, explAbsorber, {});
          var pageId = guerrier.token.get('pageid');
          var bad = bonusAttaqueD(cible, attaque.attaquant, 0, pageId, evt, explAbsorber, {});
          attAbsBonus += bad;
          if (attAbsBonus > 0) msgAbsorber += "+" + attAbsBonus;
          else if (attAbsBonus < 0) msgAbsorber += attAbsBonus;
          explAbsorber.push(cible.tokName + " tente d'absorber l'attaque avec son bouclier. " + onGenre(cible.charId, "Il", "elle") + " fait " + msgAbsorber);
          cible.absorber = totalAbsorbe;
          cible.absorberDisplay = msgAbsorber;
          cible.absorberExpl = explAbsorber;
          count--;
          if (count === 0) {
            toProceed = false;
            undoEvent();
            attack(attaque.player_id, attaque.attaquant, attaque.cibles, attaque.attack_label, options);
          }
        }); //fin lancé de dés asynchrone
      }); //fin iterSelected
      if (count === 0 && toProceed) {
        undoEvent();
        attack(attaque.player_id, attaque.attaquant, attaque.cibles, attaque.attack_label, options);
      }
    }); //fin getSelected
  }

  // modifie res et le retourne (au cas où il ne serait pas donné)
  function listRollResults(roll, res) {
    res = res || [];
    switch (roll.type) {
      case 'V': //top-level des rolls
        if (roll.rolls === undefined) break;
        roll.rolls.forEach(function(r) {
          listRollResults(r, res);
        });
        return res;
      case 'R': //jet simple
        if (roll.results === undefined) break;
        roll.results.forEach(function(r) {
          if (r.v) res.push(r.v);
          else if (r.d) res.push(r.d);
          else log("Type de résultat de dé inconnu " + r);
        });
        return res;
      case 'M':
      case 'L':
        return res;
      case 'G':
        if (roll.rolls === undefined) break;
        roll.rolls.forEach(function(ra) {
          ra.forEach(function(r) {
            listRollResults(r, res);
          });
        });
        return res;
      default:
        log("tag inconnu");
    }
    error("Structure de roll inconnue", roll);
    return res;
  }

  //category est un tableau de string, le premier élément étant la catégorie
  //principale, le suivant la sous-catégorie, etc
  //value peut être un nombre, un tableau de nombres, ou un inline roll
  function addStatistics(playerId, category, value) {
    if (stateCOF.statistiques === undefined) return;
    var stat = stateCOF.statistiques;
    if (playerId) {
      var player = getObj('player', playerId);
      if (player) {
        //On utilise l'id roll20 qui semble persistante
        var pid = player.get('d20userid');
        stat[pid] = stat[pid] || {};
        stat = stat[pid];
      }
    }
    if (category) {
      category.forEach(function(cat) {
        stat[cat] = stat[cat] || {};
        stat = stat[cat];
      });
    }
    if (!Array.isArray(value)) {
      if (value.results) value = listRollResults(value.results);
      else value = [value];
    }
    value.forEach(function(v) {
      if (isNaN(v)) {
        error("statistique sur une valeur qui n'est pas un nombre", value);
        return;
      }
      if (typeof v != 'number') v = parseInt(v);
      if (stat.total) stat.total += v;
      else stat.total = v;
      if (stat.nombre) stat.nombre++;
      else stat.nombre = 1;
    });
  }

  function displayStatCategory(stats, indent, categoryName, accum) {
    var res = {
      nombre: 0,
      total: 0,
    };
    if (stats.nombre) { //on peut afficher des résultats
      res.nombre = stats.nombre;
      res.total = stats.total;
    }
    var nindent = indent + "&nbsp;&nbsp;";
    var nAccum = [];
    for (var category in stats) {
      if (category == 'total' || category == 'nombre') break;
      var catRes = displayStatCategory(stats[category], nindent, category, nAccum);
      res.nombre += catRes.nombre;
      res.total += catRes.total;
    }
    var msg = "aucun jet cellecté";
    if (res.nombre > 0) {
      var moyenne = res.total / res.nombre;
      msg = res.nombre + " jet" + ((res.nombre > 1) ? "s" : "") + ", moyenne " + moyenne;
    }
    if (nAccum.length > 0) msg = indent + categoryName + " (" + msg + ") :";
    else msg = indent + categoryName + " : " + msg;
    accum.push(msg);
    nAccum.forEach(function(m) {
      accum.push(m);
    });
    return res;
  }

  function displayStatistics(msg) {
    var stats = stateCOF.statistiques;
    var display = startFramedDisplay(getPlayerIdFromMsg(msg), "Statistiques");
    if (stats === undefined) {
      stats = stateCOF.statistiquesEnPause;
      if (stats)
        addLineToFramedDisplay(display, "Statistiques en pause");
      else {
        addLineToFramedDisplay(display, "Aucune statistique collectée");
        sendChat("COF", endFramedDisplay(display));
        return;
      }
    }
    var tot = {
      total: 0,
      nombre: 0
    };
    var players = findObjs({
      type: 'player'
    });
    var findPlayer = function(pid) {
      return players.find(function(p) {
        return (p.get('d20userid') == pid);
      });
    };
    var addMessages = function(mv) {
      mv.forEach(function(m) {
        addLineToFramedDisplay(display, m);
      });
    };
    for (var category in stats) {
      //first, check if the category is a player id
      var pl = findPlayer(category);
      var catName = category;
      if (pl) catName = pl.get('displayname');
      var accum = [];
      var catRes = displayStatCategory(stats[category], "", catName, accum);
      addMessages(accum);
      tot.total += catRes.total;
      tot.nombre += catRes.nombre;
    }
    addLineToFramedDisplay(display, tot.nombre + " jets au total, dont la somme fait " + tot.total);
    sendChat("COF", endFramedDisplay(display));
  }

  function destructionDesMortsVivants(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var args = options.cmd;
    if (args === undefined || args.length < 2) {
      error("Il faut au moins un argument à !cof-destruction-des-morts-vivants", args);
      return;
    }
    args.shift();
    var dm = args.join(' ');
    dm = dm.replace(/%/g, '&#37;');
    dm = dm.replace(/\)/g, '&#41;');
    dm = dm.replace(/\?/g, '&#63;');
    dm = dm.replace(/@/g, '&#64;');
    dm = dm.replace(/\[/g, '&#91;');
    dm = dm.replace(/\]/g, '&#93;');
    getSelected(msg, function(selected, playerId) {
      iterSelected(selected, function(lanceur) {
        var evt = {
          type: "Destruction des morts-vivants"
        };
        var display = startFramedDisplay(playerId,
          "<b>Sort :<b> destruction des morts-vivants", lanceur);
        var name = lanceur.token.get('name');
        testCaracteristique(lanceur, 'SAG', 13, {}, evt,
          function(testRes) {
            var msgJet = "Jet de SAG : " + testRes.texte;
            if (testRes.reussite) {
              var eventId = stateCOF.eventId;
              var action = "!cof-dmg " + dm + " --once " + eventId + " --morts-vivants";
              evt.waitingForAoe = true;
              addLineToFramedDisplay(display, msgJet + " &ge; 13");
              sendChat(name, endFramedDisplay(display));
              sendChat('COF', "/w GM Sélectionner les token en vue de " + name + ", et [cliquer ici](" + action + ")");
            } else {
              addLineToFramedDisplay(display, msgJet + " < 13");
              addLineToFramedDisplay(display, name + " ne réussit pas à invoquer son dieu.");
              sendChat(name, endFramedDisplay(display));
            }
            addEvent(evt);
          });
      });
    });
  }

  //!cof-enduire-poison label type dm save
  //si label = munition_nom, alors on enduit des munitions et non une arme.
  function enduireDePoison(msg) {
    var optArgs = msg.content.split(' --');
    var cmd = optArgs[0].split(' ');
    optArgs.shift();
    if (cmd.length < 5) {
      error("Usage : !cof-enduire-poison L type force save", cmd);
      return;
    }
    var labelArme = cmd[1];
    var typePoison = cmd[2];
    if (typePoison != 'rapide') {
      error("Le seul type de poison géré est rapide, pas " + typePoison, cmd);
    }
    var attribut = 'poisonRapide_' + labelArme;
    var nomMunition;
    var estMunition = labelArme.startsWith('munition_');
    if (estMunition) nomMunition = labelArme.substring(9);
    var forcePoison = cmd[3];
    var savePoison = parseInt(cmd[4]);
    if (isNaN(savePoison)) {
      error("Le dernier argument non optionnel doit être la difficulté du test de CON", cmd);
      return;
    }
    var testINT = 14;
    var dose;
    var decrAttribute;
    var proprio;
    optArgs.forEach(function(arg) {
      cmd = arg.split(' ');
      switch (cmd[0]) {
        case 'testINT':
          if (cmd.length < 2) {
            error("Il faut un argument à --testINT", cmd);
            return;
          }
          testINT = parseInt(cmd[1]);
          if (isNaN(testINT)) {
            error("Argument de --testINT invalide", cmd);
            testINT = 14;
          }
          return;
        case 'dose':
          if (cmd.length < 2) {
            error("Il manque le nom de la dose de poison", cmd);
            return;
          }
          dose = cmd[1];
          return;
        case 'decrAttribute':
          if (cmd.length < 2) {
            error("Erreur interne d'une commande générée par bouton", cmd);
            return;
          }
          var attr = getObj('attribute', cmd[1]);
          if (attr === undefined) {
            log("Attribut à changer perdu");
            log(cmd);
            return;
          }
          decrAttribute = attr;
          return;
      }
    }); //fin du traitement des options
    getSelected(msg, function(selected, playerId) {
      iterSelected(selected, function(perso) {
        if (proprio && perso.token.id != proprio) {
          sendChar(perso.charId, "ne peut pas utiliser un poison qu'il n'a pas");
          return;
        }
        perso.tokName = perso.token.get('name');
        var attr = tokenAttribute(perso, attribut);
        var armeEnduite;
        var infosAdditionelles = savePoison;
        if (estMunition) {
          armeEnduite = nomMunition.replace(/_/g, ' ');
          var attrMunitions = tokenAttribute(perso, labelArme);
          if (attrMunitions.length === 0) {
            sendPlayer(msg, perso.tokName + "n'a pas de munition nommée " + nomMunition);
            return;
          }
          attrMunitions = attrMunitions[0];
          var munitionsCourantes = parseInt(attrMunitions.get('current'));
          var maxMunitions = parseInt(attrMunitions.get('max'));
          if (isNaN(munitionsCourantes) || isNaN(maxMunitions)) {
            error("Attribut de munitions mal formé", attrMunitions);
            return;
          }
          if (munitionsCourantes === 0) {
            sendPlayer(msg, "Plus de munition " + nomMunition);
            return;
          }
          var dejaEnduits = 0;
          if (attr.length > 0) {
            var infos = attr[0].get('max');
            var indexInfos = infos.indexOf(' ');
            if (indexInfos < 1) {
              error("Attribut de poison rapide de munition mal formé (il faudrait la difficulté du save + le nombre de munitions empoisonnées)", infos);
              return;
            }
            var oldSave = parseInt(infos.substring(0, indexInfos));
            dejaEnduits = parseInt(infos.substring(indexInfos + 1));
            if (isNaN(dejaEnduits)) dejaEnduits = 0;
            if (dejaEnduits > 0 && (attr[0].get('current') != forcePoison || oldSave != savePoison)) {
              sendPlayer(msg, "Il y a déjà du poison de force " + attr[0].get('current') + "et de save " + oldSave + " sur les munitions " + armeEnduite + ". Le script ne sait pas gérer différents poisons sur les mêmes munitions.");
              return;
            }
          }
          infosAdditionelles = savePoison + ' ' + (dejaEnduits + 1);
          if (dejaEnduits >= maxMunitions) {
            sendPlayer(msg, "Toutes les munitions " + armeEnduite + " sont déjà enduites de poison");
            return;
          }
        } else {
          var att = getAttack(labelArme, perso);
          if (att === undefined) {
            error(perso.tokNname + " n'a pas d'arme associée au label " + labelArme, cmd);
            return;
          }
          armeEnduite = att.weaponName;
          if (attributeAsBool(perso, attribut)) {
            sendChar(perso.charId, armeEnduite + " est déjà enduit de poison.");
            return;
          }
        }
        var evt = {
          type: "Enduire de poison"
        };
        var display = startFramedDisplay(playerId, "Essaie d'enduire " + armeEnduite + " de poison", perso);
        if (dose) {
          var nomDose = dose.replace(/_/g, ' ');
          var doseAttr = tokenAttribute(perso, 'dose_' + dose);
          if (doseAttr.length === 0) {
            sendChar(perso.charId, "n'a pas de dose de " + nomDose);
            return; //evt toujours vide
          }
          doseAttr = doseAttr[0];
          var nbDoses = parseInt(doseAttr.get('current'));
          if (isNaN(nbDoses) || nbDoses < 1) {
            sendChar(perso.charId, "n'a plus de dose de " + nomDose);
            return; //evt toujours vide
          }
          evt.attributes = evt.attributes || [];
          evt.attributes.push({
            attribute: doseAttr,
            current: nbDoses
          });
          //À partir de ce point, tout return doit ajouter evt
          nbDoses--;
          addLineToFramedDisplay(display, "Il restera " + nbDoses + " dose de " + nomDose + " à " + perso.tokName);
          doseAttr.set('current', nbDoses);
        }
        if (decrAttribute) {
          var oldval = parseInt(decrAttribute.get('current'));
          if (isNaN(oldval) || oldval < 1) {
            sendChar(perso.charId, "n'a plus de ce poison");
            return;
          }
          evt.attributes = evt.attributes || [];
          evt.attributes.push({
            attribute: decrAttribute,
            current: oldval,
            max: decrAttribute.get('max')
          });
          decrAttribute.set('current', oldval - 1);
        }
        //Test d'INT pour savoir si l'action réussit.
        testCaracteristique(perso, 'INT', testINT, {}, evt,
          function(tr) {
            var jet = "Jet d'INT : " + tr.texte;
            if (tr.echecCritique) { //échec critique
              jet += " Échec critique !";
              addLineToFramedDisplay(display, jet);
              addLineToFramedDisplay(display, perso.tokName + " s'empoisonne.");
              sendChat('', "[[" + forcePoison + "]]", function(res) {
                var rolls = res[0];
                var dmgRoll = rolls.inlinerolls[0];
                var r = {
                  total: dmgRoll.results.total,
                  type: 'poison',
                  display: buildinline(dmgRoll, 'poison')
                };
                var ps = {
                  partialSave: {
                    carac: 'CON',
                    seuil: savePoison
                  }
                };
                var explications = [];
                dealDamage(perso, r, [], evt, false, ps, explications,
                  function(dmgDisplay, dmg) {
                    explications.forEach(function(e) {
                      addLineToFramedDisplay(display, e);
                    });
                    addLineToFramedDisplay(perso.tokName + " subit " + dmgDisplay + " DM");
                    addEvent(evt);
                    sendChat("", endFramedDisplay(display));
                  }); //fin de dmg dus à l'échec critique
              }); //fin du jet de dmg
              return;
            } else if (tr.reussite) {
              jet += " &ge; " + testINT;
              addLineToFramedDisplay(display, jet);
              setTokenAttr(perso, attribut, forcePoison, evt, undefined, infosAdditionelles);
              addLineToFramedDisplay(display, armeEnduite + " est maintenant enduit de poison");
              addEvent(evt);
              sendChat("", endFramedDisplay(display));
              return;
            } else { //echec normal au jet d'INT
              jet += " < " + testINT + " : échec";
              addLineToFramedDisplay(display, jet);
              addEvent(evt);
              sendChat("", endFramedDisplay(display));
              return;
            }
          }); //fin du test de carac
      }); //fin de iterSelected
    }); //fin de getSelected
  }

  function listeConsommables(msg) {
    getSelected(msg, function(selected, playerId) {
      iterSelected(selected, function(perso) {
        if (perso.token.get('bar1_link') === '') {
          error("La liste de consommables n'est pas au point pour les tokens non liés", perso);
          return;
        }
        var display = startFramedDisplay(playerId, 'Liste de vos consommables :', perso, {
          chuchote: true
        });
        var attributes = findObjs({
          _type: 'attribute',
          _characterid: perso.charId
        });
        var cpt = 0;
        attributes.forEach(function(attr) {
          var attrName = attr.get('name').trim();
          if (!(attrName.startsWith('dose_') || attrName.startsWith('consommable_') || attrName.startsWith('elixir_'))) return;
          var consName = attrName.substring(attrName.indexOf('_') + 1);
          consName = consName.replace(/_/g, ' ');
          var quantite = parseInt(attr.get('current'));
          if (isNaN(quantite) || quantite < 1) {
            //addLineToFramedDisplay(display, "0 " + consName);
            return;
          } else cpt++;
          var action = attr.get('max').trim();
          var ligne = quantite + ' ';
          ligne += bouton(action, consName, perso, attr);
          // Pictos : https://wiki.roll20.net/CSS_Wizardry#Pictos
          ligne += bouton('!cof-echange-consommables @{selected|token_id} @{target|token_id}', '<span style="font-family:Pictos">r</span>', perso, attr, 'Cliquez pour échanger');
          addLineToFramedDisplay(display, ligne);
        }); //fin de la boucle sur les attributs
        if (cpt === 0) addLineToFramedDisplay(display, "<code>Vous n'avez aucun consommable</code>");
        else addLineToFramedDisplay(display, '<em>Cliquez sur le consommable pour l\'utiliser ou sur <tt><span style="font-family:Pictos">r</span></tt> pour l\'échanger avec un autre personnage.</em>');
        sendChat('', endFramedDisplay(display));
      });
    }); //fin du getSelected
  }

  // Le premier argument est le message reçu : msg => String
  // Le deuxième nous indique si on effectue un échange ou pas : echange => true/false
  function utiliseConsommable(msg, echange) {
    var cmd = msg.content.split(' ');
    if ((!echange && cmd.length < 3) || (echange && cmd.length < 5)) {
      error("Erreur interne de consommables", cmd);
      return;
    }
    //perso1 = token avec qui utilise (ou qui va échanger) le consommable 
    var perso1 = tokenOfId(cmd[1]);
    if (perso1 === undefined) {
      log("Propriétaire perdu");
      sendChat('COF', "Plus possible d'utiliser cette action. Réafficher les consommables.");
      return;
    }
    var perso2;
    if (echange) {
      //perso2 = token avec lequel on va faire l'échange
      perso2 = tokenOfId(cmd[2]);
      if (perso2 === undefined) {
        log("Destinataire perdu");
        sendChat('COF', "Erreur concernant le destinataire. Veuillez réessayer.");
        return;
      }
    }
    // Vérifie les droits d'utiliser le consommable
    if (msg.selected && msg.selected.length == 1) {
      var utilisateur = tokenOfId(msg.selected[0]._id);
      if (utilisateur === undefined) {
        sendChat('COF', "Le token sélectionné n'est pas valide");
        return;
      }
      var d = distanceCombat(perso1.token, utilisateur.token);
      if (d > 0) {
        sendChar(utilisateur.charId, "est trop loin de " + perso1.token.get('name') + " pour utiliser ses objets");
        return;
      }
      perso1 = utilisateur;
    } else {
      //On regarde si le joueur contrôle le token
      if (!peutController(msg, perso1)) {
        sendPlayer(msg, "Pas les droits pour ça");
        return;
      }
    }
    //on récupère l'attribut à utiliser/échanger de perso1
    var attr1;
    if (echange) attr1 = getObj('attribute', cmd[4]);
    else attr1 = getObj('attribute', cmd[2]);
    var attrName = attr1.get('name').trim();
    var effet = attr1.get('max').trim();
    if (attr1 === undefined) {
      log("Attribut a changé/perdu");
      log(cmd);
      sendChat('COF', "Plus possible d'utiliser cette action. Veuillez réafficher les consommables.");
      return;
    }
    //Nom du consommable (pour affichage)
    var consName = attrName.substring(attrName.indexOf('_') + 1);
    consName = "<code>" + consName.replace(/_/g, ' ').trim() + "</code>";
    // quantité actuelle pour perso1
    var quantite1 = parseInt(attr1.get('current'));
    if (isNaN(quantite1) || quantite1 < 1) {
      attr1.set('current', 0);
      sendChat('COF', '/w "' + perso1.token.get('name') + '" Vous ne disposez plus de ' + consName);
      return;
    }
    var evt = {
      type: "Utilisation de consommable",
      attributes: []
    };
    if (echange) {
      //c'est un échange
      evt.type = "Échange de consommable";
      if (perso1.charId != perso2.charId) {
        // on baisse la valeur de 1 du consommable qu'on s'apprête à échanger
        attr1.set('current', quantite1 - 1);
        evt.attributes.push({
          attribute: attr1,
          current: quantite1,
          max: effet
        });
        // ajout du consommable dans perso2 :
        var attributes = findObjs({
          _type: 'attribute',
          _characterid: perso2.charId
        });
        var found = false;
        var quantite2;
        // on recherche si le consommable existe chez perso2
        attributes.forEach(function(attr2) {
          var attrName2 = attr2.get('name').trim();
          if (!found && attrName == attrName2) {
            if (attr2.get('max').trim() != effet) {
              error("Échange dangereux : pas le même effet pour le consommable selon le personnage \n" + effet + "\n" + attr2.get('max'), attr2);
              return;
            }
            found = true;
            // si oui, on augmente sa quantité de 1
            quantite2 = parseInt(attr2.get('current'));
            if (isNaN(quantite2) || quantite2 < 1) quantite2 = 0;
            attr2.set('current', quantite2 + 1);
            evt.attributes.push({
              attribute: attr2,
              current: quantite2,
              max: effet
            });
            return;
          }
        });
        // si le consommable n'a pas été trouvé, on le créé avec une valeur de 1.
        if (!found) {
          var attr2 = createObj("attribute", {
            name: attrName,
            current: 1,
            max: effet,
            characterid: perso2.charId
          });
          evt.attributes.push({
            attribute: attr2,
            current: null,
          });
        }
        // on envoie un petit message précisant la résultante de l'action.
        sendChat('COF', "Echange entre " + perso1.token.get('name') + " et " + perso2.token.get('name') + " terminée.");
        sendChat('COF', '/w "' + perso1.token.get('name') + '" Il vous reste <strong>' + parseInt(attr1.get('current')) + "</strong> " + consName + ".");
        sendChat('COF', '/w "' + perso2.token.get('name') + '" Vous possédez désormais <strong>' + quantite2 + "</strong> " + consName + ".");
        // le MJ est notifié :
        sendChat('COF', "/w GM " + perso1.token.get('name') + " vient de donner <strong>1</strong> " + consName + " à " + perso2.token.get('name') + ".");
      } else {
        sendChat('COF', '"/w ' + perso1.token.get('name') + '" Vous ne pouvez pas échanger un consommable avec vous-même ...');
      }
    } else {
      // on utilise le consommable
      attr1.set('current', quantite1 - 1);
      evt.attributes.push({
        attribute: attr1,
        current: quantite1,
        max: effet
      });
      var start = msg.content.indexOf(' --message ') + 10;
      sendChar(perso1.charId, msg.content.substring(start));
    }
    addEvent(evt);
  }

  //asynchrone
  //callback(resultat, crit):
  // resultat peut être 0, 1 ou 2 : 0 = match null, 1 le perso 1 gagne, 2 le perso 2 gagne.
  // crit peut être 1 si un des deux perso a fait une réussite critique et pas l'autre, -1 si un des personnage a fait un échec critique et pas l'autre, et 0 sinon
  function testOppose(perso1, carac1, perso2, carac2, explications, evt, callback) {
    if (carac2 === undefined) carac2 = carac1;
    var nom1 = perso1.token.get('name');
    var nom2 = perso2.token.get('name');
    jetCaracteristique(perso1, carac1, {}, evt, function(rt1) {
      jetCaracteristique(perso2, carac2, {}, evt, function(rt2) {
        explications.push("Jet de " + carac1 + " de " + nom1 + " :" + rt1.texte);
        explications.push("Jet de " + carac2 + " de " + nom2 + " :" + rt2.texte);
        var reussite;
        var crit = 0;
        if (rt1.total > rt2.total) reussite = 1;
        else if (rt2.total > rt1.total) reussite = 2;
        else reussite = 0;
        if (rt1.echecCritique) {
          if (!rt2.echecCritique) {
            reussite = 2;
            crit = -1;
          }
        } else if (rt2.echecCritique) {
          reussite = 1;
          crit = -1;
        } else if (rt1.critique) {
          if (!rt2.critique) {
            reussite = 1;
            crit = 1;
          }
        } else if (rt2.critique) {
          reussite = 2;
          crit = 1;
        }
        switch (reussite) {
          case 1:
            diminueMalediction(perso2, evt);
            break;
          case 2:
            diminueMalediction(perso1, evt);
            break;
        }
        callback(reussite, crit);
      }); //Fin du jet du deuxième perso
    }); //Fin du jet du premier perso
  }

  function provocation(msg) {
    var args = msg.content.split(' --');
    var cmd = args[0].split(' ');
    if (cmd.length < 3) {
      error("La commande !cof-provocation requiert 2 arguments", cmd);
      return;
    }
    var voleur = tokenOfId(cmd[1]);
    if (voleur === undefined) {
      error("Le premier argument de !cof-provocation n'est pas un token valide");
      return;
    }
    var cible = tokenOfId(cmd[2]);
    if (cible === undefined) {
      error("Le deuxième argument de !cof-provocation n'est pas un token valide");
      return;
    }
    var nomVoleur = voleur.token.get('name');
    var nomCible = cible.token.get('name');
    var display =
      startFramedDisplay(getPlayerIdFromMsg(msg), 'Provocation', voleur, {
        perso2: cible
      });
    var evt = {
      type: 'Provocation'
    };
    var jets = [];
    testOppose(voleur, 'CHA', cible, 'INT', jets, evt, function(res, crit) {
      jets.forEach(function(l) {
        addLineToFramedDisplay(display, l);
      });
      var reussite;
      switch (res) {
        case 0: //en cas d'égalité, on considère que la provocation est réussie
          diminueMalediction(cible, evt);
          switch (crit) {
            case -1:
              reussite = "Sur un malentendu, la provocation réussit...";
              break;
            case 0:
            case 1:
              reussite = "La provocation réussit tout juste.";
          }
          break;
        case 1:
          switch (crit) {
            case -1:
              reussite = nomCible + " marche complètement, il attaque " + nomVoleur;
              break;
            case 0:
              reussite = "La provocation réussit.";
              break;
            case 1:
              reussite = "La provocation est une réussite critique !";
          }
          break;
        case 2:
          switch (crit) {
            case -1:
              reussite = "Échec critique de la provocation !";
              break;
            case 0:
              reussite = "La provocation échoue";
              break;
            case 1:
              reussite = nomCible + " voit clair dans le jeu de " + nomCible + ". La provocation échoue.";
          }
      }
      addLineToFramedDisplay(display, reussite);
      addEvent(evt);
      sendChat('', endFramedDisplay(display));
    }); //Fin du test opposé
  }

  function enSelle(msg) {
    var cmd = msg.content.split(' ');
    if (cmd.length < 3) {
      error("Il faut 2 arguments pour !cof-en-selle", cmd);
      return;
    }
    var cavalier = tokenOfId(cmd[1]);
    if (cavalier === undefined) {
      error("Premier argument de !cof-en-selle incorrect", cmd);
      return;
    }
    if (attributeAsBool(cavalier, 'monteSur')) {
      sendChar(cavalier.charId, " est déjà en selle");
      return;
    }
    var tokenC = cavalier.token;
    var pageId = tokenC.get('pageid');
    var monture = tokenOfId(cmd[2], cmd[2], pageId);
    if (monture === undefined || !charAttributeAsBool(monture, 'monture')) {
      sendChar(cavalier.charId, " ne peut pas monter là-dessus");
      log(cmd);
      return;
    }
    var tokenM = monture.token;
    var nomMonture = tokenM.get('name');
    if (attributeAsBool(monture, 'estMontePar')) {
      sendChar(cavalier.charId, " ne peut monter sur " + nomMonture + " car elle a déjà un cavalier");
      return;
    }
    if (distanceCombat(tokenC, tokenM, pageId) > 0) {
      sendChar(cavalier.charId, " est trop loin de " + nomMonture);
      return;
    }
    var evt = {
      type: 'En selle'
    };
    setTokenAttr(cavalier, 'monteSur', tokenM.id, evt, " monte sur " + nomMonture, nomMonture);
    setTokenAttr(monture, 'estMontePar', tokenC.id, evt, undefined, tokenC.get('name'));
    setTokenAttr(monture, 'positionSurMonture', tokenC.get('left') - tokenM.get('left'), evt, undefined, tokenC.get('top') - tokenM.get('top'));
    setTokenAttr(monture, 'directionSurMonture', tokenC.get('rotation') - tokenM.get('rotation'), evt);
    addEvent(evt);
  }

  function listeElixirs(rang) {
    var liste = [{
      nom: 'fortifiant',
      action: "!cof-fortifiant $rang"
    }];
    if (rang < 2) return liste;
    liste.push({
      nom: 'feu_grégeois',
      action: "!cof-dmg $rangd6 --feu --psave DEX [[10+@{selected|INT}]] --disque @{target|token_id} 3 10 --lanceur @{selected|token_id} --targetFx burst-fire"
    });
    if (rang < 3) return liste;
    liste.push({
      nom: 'élixir_de_guérison',
      action: "!cof-soin 3d6+$INT"
    });
    if (rang < 4) return liste;
    liste.push({
      nom: "potion_d_agrandissement",
      action: "!cof-effet-temp agrandissement [[5+$INT]]"
    });
    liste.push({
      nom: "potion_de_forme_gazeuse",
      action: "!cof-effet-temp formeGazeuse [[1d4+$INT]]"
    });
    liste.push({
      nom: "potion_de_protection_contre_les_éléments",
      action: "!cof-effet-temp protectionContreLesElements [[5+$INT]] --valeur $rang"
    });
    liste.push({
      nom: "potion_d_armure_de_mage",
      action: "!cof-effet-combat armureDuMage"
    });
    liste.push({
      nom: "potion_de_chute_ralentie",
      action: "est léger comme une plume."
    });
    if (rang < 5) return liste;
    liste.push({
      nom: "potion_d_invisibilité",
      action: "!cof-set-state invisible true --message se rend invisible ([[1d6+$INT]] minutes)"
    });
    liste.push({
      nom: "potion_de_vol",
      action: "se met à voler"
    });
    liste.push({
      nom: "potion_de_respiration_aquatique",
      action: "peut respirer sous l'eau"
    });
    liste.push({
      nom: "potion_de_flou",
      action: "!cof-effet-temp flou [[1d4+$INT]]"
    });
    liste.push({
      nom: "potion_de_hâte",
      action: "!cof-effet-temp hate [[1d6+$INT]]"
    });
    return liste;
  }

  //!cof-creer-elixir token_id nom_token elixir
  function creerElixir(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd === undefined || cmd.length < 3) {
      error("Pas assez d'arguments pour !cof-creer-elixir", msg.content);
      return;
    }
    var forgesort = tokenOfId(cmd[1], cmd[1], options.pageId);
    if (forgesort === undefined) {
      if (msg.selected && msg.selected.length == 1) {
        forgesort = tokenOfId(msg.selected[0]._id);
      }
      if (forgesort === undefined) {
        error("Impossible de savoir qui crée l'élixir", cmd);
        return;
      }
    }
    var voieDesElixirs = charAttributeAsInt(forgesort, 'voieDesElixirs', 0);
    if (voieDesElixirs < 1) {
      sendChar(forgesort.charId, " ne connaît pas la Voie des Élixirs");
      return;
    }
    var elixir = listeElixirs(voieDesElixirs).find(function(i) {
      if (i.nom == cmd[2]) return true;
      return false;
    });
    if (elixir === undefined) {
      error(forgesort.token.get('name') + " est incapable de créer " + cmd[2], cmd);
      return;
    }
    var evt = {
      type: "Création d'élixir"
    };
    if (limiteRessources(forgesort, options, 'elixirsACreer', 'élixirs à créer', evt)) return;
    var attrName = 'elixir_' + elixir.nom;
    var message = "crée un " + elixir.nom.replace(/_/g, ' ');
    var attr = tokenAttribute(forgesort, attrName);
    if (attr.length === 0) {
      var action = elixir.action.replace(/\$rang/g, voieDesElixirs);
      action = action.replace(/\$INT/g, modCarac(forgesort, 'INTELLIGENCE'));
      setTokenAttr(forgesort, attrName, 1, evt, message, action);
    } else {
      var nb = parseInt(attr[0].get('current'));
      if (isNaN(nb) || nb < 1) nb = 0;
      setTokenAttr(forgesort, attrName, nb + 1, evt, message);
    }
    addEvent(evt);
  }

  function gestionElixir(msg) {
    getSelected(msg, function(selected, playerId) {
      var player = getObj('player', playerId);
      if (player === undefined) {
        error("Impossible de trouver le joueur", playerId);
        return;
      }
      iterSelected(selected, function(forgesort) {
        var voieDesElixirs = charAttributeAsInt(forgesort, 'voieDesElixirs', 0);
        if (voieDesElixirs < 1) {
          sendChar(forgesort.charId, " ne connaît pas la Voie des Élixirs");
          return;
        }
        var elixirsACreer = voieDesElixirs * 2;
        var attrElixirs = tokenAttribute(forgesort, 'elixirsACreer');
        if (attrElixirs.length === 0) {
          attrElixirs = setTokenAttr(forgesort, 'elixirsACreer', elixirsACreer, {});
        } else {
          attrElixirs = attrElixirs[0];
          elixirsACreer = parseInt(attrElixirs.get('current'));
          if (isNaN(elixirsACreer)) elixirsACreer = 0;
        }
        var titre;
        if (elixirsACreer < 1)
          titre = "Impossible de créer un autre élixir aujourd'hui";
        else titre = "Encore " + elixirsACreer + " élixirs à créer";
        var display = startFramedDisplay(playerId, titre, forgesort, {
          chuchote: true
        });
        listeElixirs(voieDesElixirs).forEach(function(elixir) {
          var nbElixirs = 0;
          var attr = tokenAttribute(forgesort, 'elixir_' + elixir.nom);
          if (attr.length > 0) {
            attr = attr[0];
            nbElixirs = parseInt(attr.get('current'));
            if (isNaN(nbElixirs) || nbElixirs < 0) nbElixirs = 0;
          }
          var nomElixir = elixir.nom.replace(/_/g, ' ');
          var options = '';
          var action;
          if (elixirsACreer > 0) {
            action = "!cof-creer-elixir " + forgesort.token.id + ' ' + elixir.nom;
            options += bouton(action, nbElixirs, forgesort, attrElixirs);
          } else {
            options = nbElixirs + ' ';
          }
          if (nbElixirs > 0) {
            action = elixir.action;
            action = action.replace(/\$rang/g, voieDesElixirs);
            action = action.replace(/\$INT/g, modCarac(forgesort, 'INTELLIGENCE'));
            options += bouton(action, nomElixir, forgesort, attr);
          } else {
            options += nomElixir;
          }
          addLineToFramedDisplay(display, options);
        });
        sendChat('', endFramedDisplay(display));
      });
    }); //Fin du getSelected
  }

  function rageDuBerserk(msg) {
    getSelected(msg, function(selection, playerId) {
      if (selection.length === 0) {
        sendPlayer(msg, "Pas de token sélectionné pour la rage");
        return;
      }
      iterSelected(selection, function(perso) {
        var evt = {
          type: "Rage"
        };
        if (attributeAsBool(perso, 'rageDuBerserk')) {
          //Jet de sagesse difficulté 13 pour sortir de cet état
          var options = {};
          var display = startFramedDisplay(playerId, "Essaie de calmer sa rage", perso);
          testCaracteristique(perso, 'SAG', 13, options, evt,
            function(tr) {
              addLineToFramedDisplay(display, "<b>Résultat du jet de SAG :</b> " + tr.texte);
              addEvent(evt);
              if (tr.reussite) {
                addLineToFramedDisplay(display, "C'est réussi, " + perso.token.get('name') + " se calme.");
                removeTokenAttr(perso, 'rageDuBerserk', evt);
              } else {
                var msgRate = "C'est raté, " + perso.token.get('name') + " reste enragé";
                //TODO : ajouter un bouton de chance
                addLineToFramedDisplay(display, msgRate);
              }
              sendChat('', endFramedDisplay(display));
            });
        } else {
          //Le barbare passe en rage
          if (!stateCOF.combat) {
            initiative(selection, evt);
          }
          setTokenAttr(perso, 'rageDuBerserk', true, evt, "entre dans une rage berserk !");
        }
      }); //fin iterSelected
    }); //fin getSelected
  }

  //!cof-arme-secrete @{selected|token_id} @{target|token_id}
  // TODO: ajouter la possibilité d'utiliser la chance
  function armeSecrete(msg) {
    var cmd = msg.content.split(' ');
    if (cmd.length < 3) {
      error("Il faut deux arguments à !cof-arme-secrete", cmd);
      return;
    }
    var barde = tokenOfId(cmd[1]);
    var cible = tokenOfId(cmd[2]);
    if (barde === undefined || cible === undefined) {
      error("Token non valide pour l'arme secrète", cmd);
      return;
    }
    if (attributeAsInt(barde, 'armeSecreteBardeUtilisee')) {
      sendChar(barde.charId, "a déjà utilisé son arme secrète durant ce combat");
      return;
    }
    var evt = {
      type: 'Arme secrète'
    };
    if (!stateCOF.combat) {
      initiative([{
        _id: barde.token.id
      }, {
        _id: cible.token.id
      }], evt);
    }
    setTokenAttr(barde, 'armeSecreteBardeUtilisee', true, evt);
    var intCible = ficheAttributeAsInt(cible, 'INTELLIGENCE', 10);
    testCaracteristique(barde, 'CHA', intCible, {}, evt, function(testRes) {
      var display = startFramedDisplay(getPlayerIdFromMsg(msg),
        "Arme secrète", barde, {
          perso2: cible
        });
      var line = "Jet de CHA : " + testRes.texte;
      if (testRes) {
        line += " &ge; " + intCible;
        addLineToFramedDisplay(display, line);
        addLineToFramedDisplay(display, cible.token.get('name') + " est complètement déstabilisé");
        setTokenAttr(cible, 'armeSecreteBarde', 1, evt, '', getInit());
      } else {
        line += "< " + intCible;
        addLineToFramedDisplay(display, line);
        addLineToFramedDisplay(display, cible.token.get('name') + " reste insensible au charme de " + barde.token.get('name'));
      }
      sendChat("", endFramedDisplay(display));
      addEvent(evt);
    }); //fin testCarac
    // testRes.texte est l'affichage du jet de dé
    // testRes.reussite indique si le jet est réussi
    // testRes.echecCritique, testRes.critique pour le type
  }

  function nouveauNomDePerso(nom) {
    var characters = findObjs({
      _type: 'character'
    });
    characters = characters.map(function(c) {
      return c.get('name');
    });
    var trouve = characters.indexOf(nom);
    if (trouve < 0) return nom;
    var n = 2;
    while (1) {
      var nomP = nom + ' ' + n;
      trouve = characters.indexOf(nomP);
      if (trouve < 0) return nomP;
      n++;
    }
  }

  //!cof-animer-arbre lanceur-id target-id [rang]
  function animerUnArbre(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd === undefined || cmd.length < 3) {
      error("cof-animer-arbre attend 2 arguments", msg.content);
      return;
    }
    var druide = tokenOfId(cmd[1], cmd[1], options.pageId);
    if (druide === undefined) {
      error("Le premier argument de !cof-animer-arbre n'est pas un token valie", cmd);
      return;
    }
    var tokenArbre = getObj('graphic', cmd[2]);
    if (tokenArbre === undefined) {
      error("Le deuxième argument de !cof-animer-arbre n'est pas un token", cmd);
      return;
    }
    if (tokenArbre.get('represents') !== '') {
      sendChar(druide.charId, "ne peut pas animer " + tokenArbre.get('name'));
      return;
    }
    if (options.portee !== undefined) {
      var dist = distanceCombat(druide.token, tokenArbre, options.pageId);
      if (dist > options.portee) {
        sendChar(druide.charId, " est trop loin de l'arbre");
        return;
      }
    }
    var rang = charAttributeAsInt(druide, 'voieDesVegetaux', 3);
    if (cmd.length > 3) { //Le rang est spécifié en argument optionnel
      var cmd3 = parseInt(cmd[3]);
      if (isNaN(cmd3) || cmd3 < 1) {
        error("Le rang n'est pas un nombre valie. On utilise " + rang + " à la place", cmd);
      } else rang = cmd3;
    }
    var evt = {
      type: "Animation d'un arbre"
    };
    if (limiteRessources(druide, options, 'animerUnArbre', 'animer un arbre', evt)) return;
    if (!stateCOF.combat) {
      initPerso(druide, evt);
    }
    var nomArbre = nouveauNomDePerso('Arbre animé');
    var charArbre = createObj('character', {
      name: nomArbre,
      avatar: "https://s3.amazonaws.com/files.d20.io/images/42323556/6qxlm965aFhBXGoYFy5fqg/thumb.png?1510582137"
    });
    evt.characters = [charArbre];
    var caid = charArbre.id;
    var pvArbre = rang * 10;
    setToken(tokenArbre, 'represents', caid, evt);
    //Les attributs n'ont pas besoin d'être ajoutés à evt, on les enlève en supprimant le personnage
    createObj('attribute', {
      characterid: caid,
      name: 'DEXTERITE',
      current: 7
    });
    createObj('attribute', {
      characterid: caid,
      name: 'DEFDIV',
      current: 5
    });
    var pvAttr;
    if (persoEstPNJ(druide)) {
      pvAttr = createObj('attribute', {
        characterid: caid,
        name: 'pnj_pv',
        current: pvArbre,
        max: pvArbre
      });
    } else {
      pvAttr = createObj('attribute', {
        characterid: caid,
        name: 'PV',
        current: pvArbre,
        max: pvArbre
      });
    }
    createObj('attribute', {
      characterid: caid,
      name: 'RD_sauf_feu_tranchant',
      current: 10
    });
    var niveau = ficheAttributeAsInt(druide, 'NIVEAU', 1);
    createObj('ability', {
      characterid: caid,
      name: 'Attaque',
      istokenaction: true,
      action: '!cof-attack @{selected|token_id} @{target|token_id} ["Branches",[' + niveau + ',0],20,[1,6,3,0],0]'
    });
    setToken(tokenArbre, 'bar1_link', pvAttr.id, evt);
    setToken(tokenArbre, 'bar1_value', pvArbre, evt);
    setToken(tokenArbre, 'bar1_max', pvArbre, evt);
    setToken(tokenArbre, 'sjowplayers_bar1', true, evt);
    setToken(tokenArbre, 'name', nomArbre, evt);
    setToken(tokenArbre, 'showname', true, evt);
    setToken(tokenArbre, 'showplayers_name', true, evt);
    createObj('attribute', {
      characterid: caid,
      name: 'arbreAnime',
      current: niveau,
      max: getInit()
    });
    sendChar(caid, "commence à s'animer");
    initiative([{
      _id: tokenArbre.id
    }], evt);
    addEvent(evt);
  }

  function runeProtection(msg) {
    if (!stateCOF.combat) {
      sendPlayer(msg, "On ne peut utiliser les runes de protection qu'en combat");
      return;
    }
    getSelected(msg, function(selected) {
      iterSelected(selected, function(perso) {
        var evt = {
          type: "Rune de protection",
          attributes: []
        };
        var attr = tokenAttribute(perso, 'runeDeProtection');
        if (attr.length === 0) {
          sendChar(perso.charId, "n'a pas de rune de protection");
          return;
        }
        attr = attr[0];
        var dispo = attr.get('current');
        if (dispo) {
          var lastAct = lastEvent();
          if (lastAct === undefined) {
            sendChar(perso.charId, "pas de dernière action sur laquelle utiliser la rune de protection");
            return;
          }
          if (lastAct.affectes === undefined || lastAct.type != 'Attaque') {
            sendChar(perso.charId, "la dernière action n'est pas une attaque, on ne peut utiliser la rune de protection");
            return;
          }
          var aff = lastAct.affectes[perso.token.id];
          var currentPV = perso.token.get('bar1_value');
          if (aff === undefined || aff.prev === undefined ||
            aff.prev.bar1_value === undefined ||
            aff.prev.bar1_value <= currentPV) {
            sendChar(perso.charId, "la dernière action n'a pas diminué les PV de " + perso.token.get('name'));
            return;
          }
          sendChar(perso.charId, "utilise sa rune de protection pour ignorer les derniers dommages");
          evt.attributes.push({
            attribute: attr,
            current: dispo
          });
          attr.set('current', 0);
          setToken(perso.token, 'bar1_value', aff.prev.bar1_value, evt);
          if (getState(perso, 'mort')) setState(perso, 'mort', false, evt);
          return;
        }
        sendChar(perso.charId, "a déjà utilisé sa rune de protection durant ce combat");
        return;
      });
    });
  }

  //!cof-delivrance @{selected|token_id} @{target|token_id}
  function delivrance(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd === undefined || cmd.length < 3) {
      error("cof-delivrance attend 2 arguments", msg.content);
      return;
    }
    var pretre = tokenOfId(cmd[1], cmd[1], options.pageId);
    if (pretre === undefined) {
      error("Le premier argument de !cof-delivrance n'est pas un token valide", msg.content);
      return;
    }
    var cible = tokenOfId(cmd[2], cmd[2], options.pageId);
    if (cible === undefined) {
      error("Le deuxième argument de !cof-delivrance n'est pas un token valide", msg.content);
      return;
    }
    cible.tokName = cible.token.get('name');
    if (options.portee !== undefined) {
      var dist = distanceCombat(pretre.token, cible.token, options.pageId);
      if (dist > options.portee) {
        sendChar(pretre.charId, " est trop loin de " + cible.tokName);
        return;
      }
    }
    var evt = {
      type: "Délivrance",
      deletedAttributes: []
    };
    if (limiteRessources(pretre, options, 'délivrance', 'délivrance', evt)) return;
    var attr;
    var display = startFramedDisplay(getPlayerIdFromMsg(msg), 'Délivrance', pretre, {
      perso2: cible
    });
    var printEffet = function(message) {
      addLineToFramedDisplay(display, "La cible " + message);
    };
    var optFin = {
      print: printEffet,
      pageId: options.pageId
    };
    _.each(messageEffetTemp, function(effet, nomEffet) {
      if (effet.prejudiciable) {
        //Attention, ne fonctionne pas avec les effets génériques
        attr = tokenAttribute(cible, nomEffet);
        if (attr.length > 0)
          finDEffet(attr[0], nomEffet, attr[0].get('name'), cible.charId, evt, optFin);
      }
    });
    _.each(messageEffetCombat, function(effet, nomEffet) {
      if (effet.prejudiciable) {
        attr = tokenAttribute(cible, nomEffet);
        if (attr.length > 0) {
          printEffet(effet.fin);
          evt.deletedAttributes.push(attr[0]);
          attr[0].remove();
        }
      }
    });
    if (attributeAsBool(cible, 'malediction')) {
      printEffet("n'est plus maudite");
      removeTokenAttr(cible, 'malediction', evt);
    }
    //On enlève enfin les états préjudiciables
    if (getState(cible, 'aveugle')) {
      printEffet("retrouve la vue");
      setState(cible, 'aveugle', false, evt);
    }
    if (getState(cible, 'affaibli')) {
      printEffet("retrouve des forces");
      setState(cible, 'affaibli', false, evt);
    }
    if (getState(cible, 'etourdi')) {
      printEffet("retrouve ses esprits");
      setState(cible, 'etourdi', false, evt);
    }
    if (getState(cible, 'paralyse')) {
      printEffet("peut à nouveau bouger");
      setState(cible, 'paralyse', false, evt);
    }
    if (getState(cible, 'ralenti')) {
      printEffet("retrouve une vitesse normale");
      setState(cible, 'ralenti', false, evt);
    }
    if (getState(cible, 'endormi')) {
      printEffet("se réveille");
      setState(cible, 'endormi', false, evt);
    }
    if (getState(cible, 'apeure')) {
      printEffet("reprend courage");
      setState(cible, 'apeure', false, evt);
    }
    sendChat('', endFramedDisplay(display));
    addEvent(evt);
  }

  function armeDeContact(perso, arme, labelArmeDefaut, armeContact) {
    if (arme) return arme;
    var labelArme = tokenAttribute(perso, 'armeEnMain');
    if (labelArme.length > 0) {
      labelArme = labelArme[0].get('current');
      arme = getWeaponStats(perso, labelArme);
    }
    if (arme === undefined && labelArmeDefaut)
      arme = getWeaponStats(perso, labelArmeDefaut);
    //L'arme doit être une arme de contact ?
    if (armeContact && arme && arme.portee) {
      sendChar(perso.charId, armeContact + " " + arme.name + " est une arme à distance.");
      return;
    }
    if (arme) {
      return arme;
    }
    arme = {
      name: 'Attaque par défaut',
      attSkillDiv: 0,
      attSkill: "@{ATKCAC}",
      crit: 20,
      parDefaut: true,
    };
    return arme;
  }

  function attaqueContactOpposee(playerId, attaquant, defenseur, evt, options, callback) {
    var explications = [];
    options = options || {};
    options.contact = true;
    attaquant.tokName = attaquant.tokName || attaquant.token.get('name');
    defenseur.tokName = defenseur.tokName || defenseur.token.get('name');
    if (attaquant.name === undefined) {
      var charAttaquant = getObj('character', attaquant.charId);
      if (charAttaquant === undefined) {
        error("Attaquant sans personnage", attaquant);
        return;
      }
      attaquant.name = charAttaquant.get('name');
    }
    if (defenseur.name === undefined) {
      var charDefenseur = getObj('character', defenseur.charId);
      if (charDefenseur === undefined) {
        error("Défenseur sans personnage", defenseur);
        return;
      }
      defenseur.name = charDefenseur.get('name');
    }
    entrerEnCombat(attaquant, [defenseur], explications, evt);
    //Recherche des armes utilisées
    var armeAttaquant = armeDeContact(attaquant, options.armeAttaquant, options.labelArmeAttaquant, options.armeAttaquantContact);
    var armeDefenseur = armeDeContact(defenseur, options.armeDefenseur, options.labelArmeDefenseur, options.armeDefenseurContact);
    var action = options.action || "<b>Attaque opposée</b>";
    if (!armeAttaquant.parDefaut) {
      action += " <span style='" + BS_LABEL + " " + BS_LABEL_INFO + "; text-transform: none; font-size: 100%;'>(" + armeAttaquant.name + ")</span>";
    }
    var display = startFramedDisplay(playerId, action, attaquant, {
      perso2: defenseur
    });
    var critAttaquant = critEnAttaque(attaquant, armeAttaquant, options);
    var dice = 20;
    if (estAffaibli(attaquant)) {
      dice = 12;
      explications.push("Attaquant affaibli => D12 au lieu de D20 en Attaque");
    } else if (getState(attaquant, 'immobilise')) {
      dice = 12;
      explications.push("Attaquant immobilisé => D12 au lieu de D20 en Attaque");
    }
    var toEvaluateAttack = attackExpression(attaquant, 1, dice, critAttaquant, armeAttaquant);
    sendChat('', toEvaluateAttack, function(resAttack) {
      var rollsAttack = options.rollsAttack || resAttack[0];
      var afterEvaluateAttack = rollsAttack.content.split(' ');
      var attRollNumber = rollNumber(afterEvaluateAttack[0]);
      var attSkillNumber = rollNumber(afterEvaluateAttack[1]);
      var d20rollAttaquant = rollsAttack.inlinerolls[attRollNumber].results.total;
      var attSkill = rollsAttack.inlinerolls[attSkillNumber].results.total;
      var attBonus =
        bonusAttaqueA(attaquant, armeAttaquant.name, evt, explications, options);
      var pageId = options.pageId || attaquant.token.get('pageid');
      attBonus +=
        bonusAttaqueD(attaquant, defenseur, 0, pageId, evt, explications, options);
      var attackRollAttaquant = d20rollAttaquant + attSkill + attBonus;
      var attRollValue = buildinline(rollsAttack.inlinerolls[attRollNumber]);
      attRollValue += (attSkill > 0) ? "+" + attSkill : (attSkill < 0) ? attSkill : "";
      attRollValue += (attBonus > 0) ? "+" + attBonus : (attBonus < 0) ? attBonus : "";
      if (options.bonusAttaqueAttaquant) {
        options.bonusAttaqueAttaquant.forEach(function(bad) {
          attRollValue += (bad.val > 0) ? "+" + bad.val : (bad.val < 0) ? bad.val : "";
          attackRollAttaquant += bad.val;
          if (bad.explication) explications.push(bad.explication);
        });
      }
      addLineToFramedDisplay(display, "Jet de " + attaquant.tokName + " : " + attRollValue);
      var critDefenseur = critEnAttaque(defenseur, armeDefenseur, options);
      var dice = 20;
      if (estAffaibli(defenseur)) {
        dice = 12;
        explications.push("Défenseur affaibli => D12 au lieu de D20 en Attaque");
      } else if (getState(defenseur, 'immobilise')) {
        dice = 12;
        explications.push("Défenseur immobilisé => D12 au lieu de D20 en Attaque");
      }
      toEvaluateAttack = attackExpression(defenseur, 1, dice, critDefenseur, armeDefenseur);
      sendChat('', toEvaluateAttack, function(resAttack) {
        rollsAttack = options.rollsAttack || resAttack[0];
        afterEvaluateAttack = rollsAttack.content.split(' ');
        attRollNumber = rollNumber(afterEvaluateAttack[0]);
        attSkillNumber = rollNumber(afterEvaluateAttack[1]);
        var d20rollDefenseur = rollsAttack.inlinerolls[attRollNumber].results.total;
        var attSkill = rollsAttack.inlinerolls[attSkillNumber].results.total;
        attBonus =
          bonusAttaqueA(defenseur, armeDefenseur.name, evt, explications, options);
        attBonus +=
          bonusAttaqueD(defenseur, attaquant, 0, pageId, evt, explications, options);
        var attackRollDefenseur = d20rollDefenseur + attSkill + attBonus;
        attRollValue = buildinline(rollsAttack.inlinerolls[attRollNumber]);
        attRollValue += (attSkill > 0) ? "+" + attSkill : (attSkill < 0) ? attSkill : "";
        attRollValue += (attBonus > 0) ? "+" + attBonus : (attBonus < 0) ? attBonus : "";
        if (options.bonusAttaqueDefenseur) {
          options.bonusAttaqueDefenseur.forEach(function(bad) {
            attRollValue += (bad.val > 0) ? "+" + bad.val : (bad.val < 0) ? bad.val : "";
            attackRollDefenseur += bad.val;
            if (bad.explication) explications.push(bad.explication);
          });
        }
        addLineToFramedDisplay(display, "Jet de " + defenseur.tokName + " : " + attRollValue);
        var resultat = {
          rollAttaquant: attackRollAttaquant,
          rollDefenseur: attackRollDefenseur,
        };
        if (d20rollAttaquant == 1 && d20rollDefenseur > 1) {
          resultat.echec = true;
          resultat.echecCritique = true;
          diminueMalediction(attaquant, evt);
        } else if (d20rollDefenseur == 1 & d20rollAttaquant > 1) {
          resultat.succes = true;
          resultat.echecCritiqueDefenseur = true;
          diminueMalediction(defenseur, evt);
        } else if (d20rollAttaquant >= critAttaquant && d20rollDefenseur < critDefenseur) {
          resultat.succes = true;
          resultat.critique = true;
          diminueMalediction(defenseur, evt);
        } else if (d20rollAttaquant < critAttaquant && d20rollDefenseur >= critDefenseur) {
          resultat.succes = false;
          resultat.critiqueDefenseur = true;
          diminueMalediction(attaquant, evt);
        } else if (attackRollAttaquant < attackRollDefenseur) {
          resultat.echec = true;
          diminueMalediction(attaquant, evt);
        } else {
          resultat.succes = true;
          diminueMalediction(defenseur, evt);
        }
        callback(resultat, display, explications); //evt est mis à jour
      }); //fin du sendchat pour jet du défenseur
    }); //Fin du sendChat pour jet de l'attaquant
  }

  function testAttaqueOpposee(msg) {
    var cmd = msg.content.split(' ');
    if (cmd.length < 3) {
      error("Il faut 2 personnages pour un test d'attaque en opposition", cmd);
      return;
    }
    var attaquant = tokenOfId(cmd[1], cmd[1]);
    var defenseur = tokenOfId(cmd[2], cmd[2]);
    if (attaquant === undefined) {
      error("Le premier argument de !cof-test-attaque-opposee doit être un token valide", cmd[1]);
      return;
    }
    if (defenseur === undefined) {
      error("Le deuxième argument de !cof-test-attaque-opposee doit être un token valide", cmd[2]);
      return;
    }
    var evt = {
      type: "Test d'attaque opposée"
    };
    var options = {};
    if (cmd.length > 3) options.labelArmeAttaquant = cmd[3];
    var playerId = getPlayerIdFromMsg(msg);
    attaqueContactOpposee(playerId, attaquant, defenseur, evt, options,
      function(res, display, explications) {
        if (res.succes)
          addLineToFramedDisplay(display, attaquant.token.get('name') + " remporte le test");
        else
          addLineToFramedDisplay(display, defenseur.token.get('name') + " remporte le test");
        explications.forEach(function(expl) {
          addLineToFramedDisplay(display, expl, 80);
        });
        sendChat("", endFramedDisplay(display));
        addEvent(evt);
      });
  }

  //!cof-desarmer attaquant cible, optionellement un label d'arme
  function desarmer(msg) {
    var cmd = msg.content.split(' ');
    if (cmd.length < 3) {
      error("Il manque des arguments à !cof-desarmer", msg.content);
      return;
    }
    var guerrier = tokenOfId(cmd[1], cmd[1]);
    if (guerrier === undefined) {
      error("Le premier argument de !cof-desarmer n'est pas un token valide", cmd);
      return;
    }
    guerrier.tokName = guerrier.token.get('name');
    var cible = tokenOfId(cmd[2], cmd[2]);
    if (cible === undefined) {
      error("Le deuxième argument de !cof-desarmer n'est pas un token valide", cmd);
      return;
    }
    cible.tokName = cible.token.get('name');
    var pageId = guerrier.token.get('pageid');
    if (distanceCombat(guerrier.token, cible.token, pageId)) {
      sendChar(guerrier.charId, "est trop loin de " + cible.tokName + " pour le désarmer.");
      return;
    }
    var options = {
      action: "<b>Désarmement</b>",
      armeContact: "doit porter une arme de contact pour désarmer son adversaire.",
      armeDefenseur: armeCible,
      pageId: pageId,
    };
    //On cherche l'arme de la cible. On en aura besoin pour désarmer
    var armeCible;
    var attrArmeCible = tokenAttribute(cible, 'armeEnMain');
    if (attrArmeCible.length > 0) {
      attrArmeCible = attrArmeCible[0];
      armeCible = getWeaponStats(cible, attrArmeCible.get('current'));
      if (armeCible) {
        options.armeDefenseur = armeCible;
        if (armeCible.deuxMains) {
          options.bonusAttaqueDefenseur = [{
            val: 5,
            explication: cible.tokName + " porte une arme à 2 mains => +5 à son jet"
          }];
        }
      }
    } else attrArmeCible = undefined;
    var enleverArmeCible = function() {
      if (attrArmeCible) {
        evt.deletedAttributes = evt.deletedAttributes || [];
        evt.deletedAttributes.push(attrArmeCible);
        attrArmeCible.remove();
      }
    };
    var evt = {
      type: 'Désarmer'
    };
    if (cmd.length > 3) options.labelArmeAttaquant = cmd[3];
    var playerId = getPlayerIdFromMsg(msg);
    attaqueContactOpposee(playerId, guerrier, cible, evt, options,
      function(res, display, explications) {
        var resultat;
        if (res.echecCritique) {
          resultat = "<span style='" + BS_LABEL + " " + BS_LABEL_DANGER + "'><b>échec&nbsp;critique</b></span>";
        } else if (res.echecCritiqueDefenseur) {
          resultat = "<span style='" + BS_LABEL + " " + BS_LABEL_SUCCESS + "'><b>succès</b></span>, " + cible.tokName + " laisse tomber son arme, difficile de la récupérer...";
          enleverArmeCible();
        } else if (res.critique) {
          resultat = "<span style='" + BS_LABEL + " " + BS_LABEL_SUCCESS + "'><b>réussite critique</b></span> : " + cible.tokName + " est désarmé, et " + guerrier.tokName + " empêche de reprendre l'arme";
          enleverArmeCible();
        } else if (res.critiqueDefenseur) {
          resultat = "<span style='" + BS_LABEL + " " + BS_LABEL_WARNING + "'><b>échec</b></span>, " + cible.tokName + " garde son arme bien en main";
        } else if (res.echec) {
          resultat = "<span style='" + BS_LABEL + " " + BS_LABEL_WARNING + "'><b>échec</b></span>, " + guerrier.tokName + " n'a pas réussi à désarmer son adversaire";
        } else { //succès
          enleverArmeCible();
          if (res.rollAttaquant > res.rollDefenseur + 9) {
            resultat = "<span style='" + BS_LABEL + " " + BS_LABEL_SUCCESS + "'><b>succès</b></span>, " + guerrier.tokName + " désarme son adversaire et l'empêche de récupérer son arme";
          } else {
            resultat = "<span style='" + BS_LABEL + " " + BS_LABEL_SUCCESS + "'><b>succès</b></span>, " + guerrier.tokName + " désarme son adversaire.";
          }
        }
        addLineToFramedDisplay(display, resultat);
        explications.forEach(function(expl) {
          addLineToFramedDisplay(display, expl, 80);
        });
        sendChat("", endFramedDisplay(display));
        addEvent(evt);
      });
  }

  function appliquerBloquer(attaquant, cible, critique, evt, envoyerMessage) {
    var msg;
    if (envoyerMessage) msg = "est bloqué par son adversaire";
    setTokenAttr(cible, 'bloqueManoeuvre', 1, evt, msg, getInit());
    if (critique)
      appliquerTenirADistance(attaquant, cible, false, evt, envoyerMessage);
  }

  function appliquerTenirADistance(attaquant, cible, critique, evt, envoyerMessage) {
    var msg;
    if (envoyerMessage) msg = "est tenu à distance par son adversaire";
    setTokenAttr(
      cible, 'tenuADistanceManoeuvre(' + attaquant.token.id + ')', 1, evt, msg, getInit());
    if (critique) appliquerBloquer(attaquant, cible, false, evt, envoyerMessage);
  }

  var listeManoeuvres = {
    aveugler: {
      appliquer: function(attaquant, cible, critique, evt, envoyerMessage) {
        var duree = 1;
        if (critique) duree = randomInteger(6);
        var msg;
        if (envoyerMessage) msg = "est aveuglé par son adversaire";
        setTokenAttr(
          cible, 'aveugleManoeuvre', duree, evt, msg, getInit());
        return critique; //Pour les DMs en plus
      },
      verbe: 'aveugler'
    },
    bloquer: {
      appliquer: appliquerBloquer,
      penalitePlusPetit: true,
      verbe: 'bloquer'
    },
    desarmer: {
      appliquer: function(attaquant, cible, critique, evt, envoyerMessage) {
        var armeCible;
        var attrArmeCible = tokenAttribute(cible, 'armeEnMain');
        if (attrArmeCible.length > 0) {
          attrArmeCible = attrArmeCible[0];
          evt.deletedAttributes = evt.deletedAttributes || [];
          evt.deletedAttributes.push(attrArmeCible);
          attrArmeCible.remove();
        }
        if (envoyerMessage) {
          var msgDesarme = "est désarmé" + onGenre(cible.charId, '', 'e');
          if (critique) msgDesarme += ", son adversaire lui a pris son arme.";
          else msgDesarme += ".";
          sendChar(cible.charId, msgDesarme);
        }
      },
      verbe: 'désarmer'
    },
    faireDiversion: {
      appliquer: function(attaquant, cible, critique, evt, envoyerMessage) {
        var msg;
        if (envoyerMessage) msg = "a son attention attirée ailleurs";
        var malus = -5;
        if (critique) malus = -10;
        setTokenAttr(cible, 'diversionManoeuvre', 1, evt, msg, getInit());
        setTokenAttr(cible, 'diversionManoeuvreValeur', malus, evt, undefined);
      },
      verbe: 'faire diversion sur'
    },
    menacer: {
      appliquer: function(attaquant, cible, critique, evt, envoyerMessage) {
        var msg;
        if (envoyerMessage) msg = "est sous le coup d'une menace";
        var effet = 'menaceManoeuvre(' + attaquant.token.id;
        if (critique) effet += ',crit';
        effet += ')';
        setTokenAttr(cible, effet, 1, evt, msg, getInit());
      },
      verbe: 'menacer'
    },
    renverser: {
      appliquer: function(attaquant, cible, critique, evt, envoyerMessage) {
        if (envoyerMessage) sendChar(cible.charId, "tombe au sol");
        setState(cible, 'renverse', true, evt);
        return critique; //Pour les DM en plus
      },
      penalitePlusPetit: true,
      verbe: 'renverser'
    },
    repousser: {
      appliquer: function(attaquant, cible, critique, evt, envoyerMessage) {
        var distance = rollDePlus(6);
        if (critique && distance < 3) distance = 3;
        if (envoyerMessage)
          sendChar(cible.charId, "est repoussé" + onGenre(cible.charId, '', 'e') + " et doit reculer de " + distance.roll + "m.");
        if (critique) setState(cible, 'renverse', true, evt);
      },
      penalitePlusPetit: true,
      verbe: 'repousser'
    },
    tenirADistance: {
      appliquer: appliquerTenirADistance,
      verbe: 'tenir à distance'
    }
  };

  //!cof-appliquer-manoeuvre id1 id2 effet attrId
  //attrId est utilisé pour limiter le nombre d'utilisations
  function appliquerManoeuvre(msg) {
    var cmd = msg.content.split(' ');
    if (cmd.length < 5) {
      error("cof-appliquer-manoeuvre attend 4 arguments", msg.content);
      return;
    }
    var limiteAttr = getObj('attribute', cmd[4]);
    if (limiteAttr === undefined) {
      sendPlayer(msg, "La manoeuvre a déjà été choisie");
      return;
    }
    var attaquant = tokenOfId(cmd[1], cmd[1]);
    if (attaquant === undefined) {
      error("Le premier argument de !cof-appliquer-maneuvre n'est pas un token valide", cmd);
      return;
    }
    var cible = tokenOfId(cmd[2], cmd[2]);
    if (cible === undefined) {
      error("Le deuxième argument de !cof-appliquer-manoeuvre n'est pas un token valide", cmd);
      return;
    }
    if (!_.has(listeManoeuvres, cmd[3])) {
      error("Manoeuvre " + cmd[3] + " inconnue.", cmd);
      return;
    }
    var effet = listeManoeuvres[cmd[3]];
    var evt = {
      type: 'Application de manoeuvre',
      deletedAttributes: [limiteAttr]
    };
    limiteAttr.remove();
    effet.appliquer(attaquant, cible, false, evt, true);
    addEvent(evt);
  }

  //!cof-manoeuvre id1 id2 effet
  function manoeuvreRisquee(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd === undefined || cmd.length < 4) {
      error("cof-manoeuvre attend 3 arguments", msg.content);
      return;
    }
    var attaquant = tokenOfId(cmd[1], cmd[1]);
    if (attaquant === undefined) {
      error("Le premier argument de !cof-maneuvre n'est pas un token valide", cmd);
      return;
    }
    attaquant.tokName = attaquant.token.get('name');
    var cible = tokenOfId(cmd[2], cmd[2]);
    if (cible === undefined) {
      error("Le deuxième argument de !cof-manoeuvre n'est pas un token valide", cmd);
      return;
    }
    cible.tokName = cible.token.get('name');
    if (!_.has(listeManoeuvres, cmd[3])) {
      sendPlayer(msg, "Manoeuvre " + cmd[3] + " inconnue.");
      return;
    }
    var effet = listeManoeuvres[cmd[3]];
    var evt = {
      type: 'manoeuvre'
    };
    if (effet.penalitePlusPetit) {
      var tailleAttaquant = taillePersonnage(attaquant);
      var tailleCible = taillePersonnage(cible);
      if (tailleAttaquant && tailleCible && tailleAttaquant < tailleCible) {
        var penalite = 5 * (tailleAttaquant - tailleCible);
        options.bonusAttaqueAttaquant = [{
          val: penalite,
          explication: attaquant.tokName + " est plus petit que " + cible.tokName + " => " + penalite + " Att"
        }];
      }
    }
    var playerId = getPlayerIdFromMsg(msg);
    attaqueContactOpposee(playerId, attaquant, cible, evt, options,
      function(res, display, explications) {
        var dmSupp;
        if (res.succes) {
          addLineToFramedDisplay(display, attaquant.tokName + " réussi à " + effet.verbe + " " + cible.tokName);
          dmSupp = effet.appliquer(attaquant, cible, res.critique, evt);
        } else {
          addLineToFramedDisplay(display, attaquant.tokName + " ne réussi pas à " + effet.verbe + " " + cible.tokName);
          //Envoyer à la cible la possibilité d'appliquer un effet de son choix
        }
        explications.forEach(function(expl) {
          addLineToFramedDisplay(display, expl, 80);
        });
        if (dmSupp) {
          addLineToFramedDisplay(display, attaquant.tokName + " fait en plus des dégâts à " + cible.tokName + " (lancer une attaque pour déterminer le montant)", 80);
          setTokenAttr(attaquant, 'attaqueGratuiteAutomatique(' + cible.token.id + ')', true, evt);
        }
        sendChat("", endFramedDisplay(display));
        addEvent(evt);
        /*if (dmSupp) {
           turnAction(attaquant, playerId);
        }*/
        if (!res.succes) {
          var charCible = getObj('character', cible.charId);
          if (charCible === undefined) {
            error("Cible sans personnage associé", cible);
            return;
          }
          var nomCible = charCible.get('name');
          var titre = "Choisir un effet contre " + attaquant.tokName;
          //On crée un display sans le header
          display = startFramedDisplay(undefined, titre, cible, {
            retarde: true
          });
          //Attribut pour empecher plusieurs utilisations
          var attrLimit = createObj('attribute', {
            _characterid: cible.charId,
            name: 'limiteApplicationManoeuvre',
            current: '1'
          });
          for (var man in listeManoeuvres) {
            var appliquerManoeuvre = '!cof-appliquer-manoeuvre ' + cible.token.id + ' ' + attaquant.token.id + ' ' + man + ' ' + attrLimit.id;
            var ligneManoeuvre = boutonSimple(appliquerManoeuvre, '', man);
            addLineToFramedDisplay(display, ligneManoeuvre, 90);
          }
          // on envoie la liste aux joueurs qui gèrent le voleur
          var playerIds = getPlayerIds(cible);
          playerIds.forEach(function(playerid) {
            addFramedHeader(display, playerid, true);
            sendChat('', endFramedDisplay(display));
          });
          if (playerIds.length === 0) {
            addFramedHeader(display, undefined, 'gm');
            sendChat('', endFramedDisplay(display));
          }
        }
      });
  }

  function sendCommands(from, commands) {
    if (commands.length === 0) return;
    var c = commands.shift();
    if (c.startsWith('!')) {
      _.delay(function() {
        sendChat(from, c);
        sendCommands(from, commands);
      }, 10);
    } else error("multi-commande invalide", c);
  }

  //!cof-multi-command !cmd1 ... --cof-multi-command !cmd2 .. --cof-multi-command !cmd3...
  function multiCommand(msg) {
    var posFirstCommand = msg.content.indexOf('!', 2);
    var commands = msg.content.substr(posFirstCommand).split(' --cof-multi-command ');
    sendCommands(msg.who, commands);
    /* commands.forEach(function(c) {
       if (c.startsWith('!')) sendChat(msg.who, c);
       else error("multi-commande invalide", c);
     });*/
  }

  function createCharacter(nom, playerId, avatar, token, spec) {
    var res = createObj('character', {
      name: nom,
      avatar: avatar,
      controlledby: playerId
    });
    if (!res) return;
    var charId = res.id;
    if (token) {
      token.set('represents', charId);
    }
    var attrs = findObjs({
      _type: 'attribute',
      _characterid: charId,
    });
    var attrVersion =
      attrs.find(function(a) {
        return a.get('name') == 'VERSION';
      });
    if (attrVersion) attrVersion.set('current', '1.8');
    else {
      createObj('attribute', {
        _characterid: charId,
        name: 'VERSION',
        current: '1.8'
      });
    }
    if (spec.attributesFiche) {
      for (var attrName in spec.attributesFiche) {
        /*jshint loopfunc: true */
        var attr =
          attrs.filter(function(a) {
            return a.get('name') == attrName;
          });
        if (attr.length === 0) {
          createObj('attribute', {
            _characterid: charId,
            name: attrName,
            current: spec.attributesFiche[attrName]
          });
        } else {
          attr[0].set('current', spec.attributesFiche[attrName]);
        }
      }
    } //end attributesFiche
    if (spec.pv) {
      var pvAttr = attrs.filter(function(a) {
        return a.get('name').toUpperCase() == 'PV';
      });
      if (pvAttr.length === 0) {
        pvAttr = createObj('attribute', {
          _characterid: charId,
          name: 'PV',
          current: spec.pv,
          max: spec.pv
        });
      } else {
        pvAttr = pvAttr[0];
        pvAttr.set('current', spec.pv);
        pvAttr.set('max', spec.pv);
      }
      if (token) {
        token.set('bar1_link', pvAttr.id);
        token.set('bar1_value', spec.pv);
        token.set('bar1_max', spec.pv);
      }
    }
    var actions = "";
    if (spec.actions) actions = spec.actions;
    if (spec.attaques) {
      spec.attaques.forEach(function(att) {
        if (!att.length) {
          error("Attaque mal formée", att);
        } else {
          createObj('ability', {
            _characterid: charId,
            name: att[0],
            istokenaction: true,
            action: '!cof-attack @{selected|token_id} @{target|token_id} ' + JSON.stringify(att)
          });
          actions += '%' + att[0] + ' ';
        }
      });
    }
    if (spec.attributes) {
      spec.attributes.forEach(function(a) {
        a._characterid = charId;
        createObj('attribute', a);
      });
    }
    if (spec.abilities) {
      spec.abilities.forEach(function(a) {
        a._characterid = charId;
        a.istokenaction = true;
        createObj('ability', a);
        actions += '%' + a.name + ' ';
      });
    }
    createObj('ability', {
      _characterid: charId,
      name: '#Actions#',
      istokenaction: false,
      action: actions
    });
    return res;
  }

  var predateurs = {
    loup: {
      nom: 'Loup',
      avatar: "https://s3.amazonaws.com/files.d20.io/images/59094468/bX_aTjrVAbIRHjpRn-HwdQ/max.jpg?1532611383",
      token: "https://s3.amazonaws.com/files.d20.io/images/59489165/3R9Ob68sTiqvNeEhwzwWcg/thumb.png?1533047142",
      attributesFiche: {
        NIVEAU: 1,
        FORCE: 12,
        DEXTERITE: 12,
        CONSTITUTION: 12,
        CON_SUP: '@{JETSUP}',
        INTELLIGENCE: 2,
        SAGESSE: 14,
        SAG_SUP: '@{JETSUP}',
        CHARISME: 6,
        DEFDIV: 3, //Total 14
        RACE: 'loup',
        TAILLE: 'moyen'
      },
      pv: 9,
      attaques: [
        ['Morsure', ["@{selected|ATKCAC}", 0], 20, [1, 6, 1, 0],
          [0]
        ]
      ],
      attributes: [],
      abilities: []
    },
    loupAlpha: {
      nom: 'Loup alpha',
      avatar: "https://s3.amazonaws.com/files.d20.io/images/59094818/J0yWdxryZFKakJtNGJNNvw/max.jpg?1532612061",
      token: "https://s3.amazonaws.com/files.d20.io/images/60183959/QAMH6WtyoK78aa4zX_mR_Q/thumb.png?1533898482",
      attributesFiche: {
        NIVEAU: 2,
        FORCE: 16,
        DEXTERITE: 12,
        CONSTITUTION: 16,
        CON_SUP: '@{JETSUP}',
        INTELLIGENCE: 2,
        SAGESSE: 14,
        SAG_SUP: '@{JETSUP}',
        CHARISME: 6,
        DEFDIV: 4, //Total 15
        INIT_DIV: 5, //Total 17
        RACE: 'loup',
        TAILLE: 'moyen'
      },
      pv: 15,
      attaques: [
        ['Morsure', ["@{selected|ATKCAC}", -1], 20, [1, 6, 3, 0],
          [0]
        ]
      ],
      attributes: [{
        name: 'discrétion',
        current: 5
      }],
      abilities: [{
        name: 'Embuscade',
        action: '!cof-surprise [[15 + @{selected|DEX}]]'
      }, {
        name: 'Attaque-embuscade',
        action: '!cof-attack @{selected|token_id} @{target|token_id} ["Morsure",["@{selected|ATKCAC}",-1],20,[1,6,3,0],[0]] --sournoise 1 --if moins FOR --etat renverse --endif'
      }]
    },
    worg: {
      nom: 'Grand loup',
      avatar: "https://s3.amazonaws.com/files.d20.io/images/25294798/4dJ_60uP2mw6UJA2elkoXA/max.jpg?1479223790",
      token: "https://s3.amazonaws.com/files.d20.io/images/60184237/smG5o2-siD2pChhPblO_sQ/thumb.png?1533899118",
      attributesFiche: {
        NIVEAU: 3,
        FORCE: 16,
        DEXTERITE: 12,
        CONSTITUTION: 16,
        CON_SUP: '@{JETSUP}',
        INTELLIGENCE: 4,
        SAGESSE: 14,
        SAG_SUP: '@{JETSUP}',
        CHARISME: 6,
        DEFDIV: 6, //Total 17
        INIT_DIV: 5, //Total 17
        RACE: 'loup',
        TAILLE: 'moyen'
      },
      pv: 35,
      attaques: [
        ['Morsure', ["@{selected|ATKCAC}", 0], 20, [1, 6, 5, 0],
          [0]
        ]
      ],
      attributes: [{
        name: 'discrétion',
        current: 5
      }],
      abilities: [{
        name: 'Embuscade',
        action: '!cof-surprise [[15 + @{selected|DEX}]]'
      }, {
        name: 'Attaque-embuscade',
        action: '!cof-attack @{selected|token_id} @{target|token_id} ["Morsure",["@{selected|ATKCAC}",0],20,[1,6,5,0],[0]] --sournoise 1 --if moins FOR --etat renverse --endif'
      }]
    },
    lion: {
      nom: 'Lion',
      avatar: "https://s3.amazonaws.com/files.d20.io/images/59486104/SngxPIGXDJKdCqsbrXxRYQ/max.jpg?1533041390",
      token: "https://s3.amazonaws.com/files.d20.io/images/60184437/df1MT2T6lrfo7st02Htxeg/thumb.png?1533899407",
      attributesFiche: {
        NIVEAU: 4,
        FORCE: 20,
        DEXTERITE: 18,
        DEX_SUP: '@{JETSUP}',
        CONSTITUTION: 20,
        INTELLIGENCE: 4,
        SAGESSE: 14,
        SAG_SUP: '@{JETSUP}',
        CHARISME: 6,
        DEFDIV: 4, //Total 18
        INIT_DIV: 5, //Total 23 
        RACE: 'lion',
        TAILLE: 'grand'
      },
      pv: 30,
      attaques: [
        ['Morsure', ["@{selected|ATKCAC}", -1], 20, [2, 6, 5, 0],
          [0]
        ]
      ],
      attributes: [{
        name: 'discrétion',
        current: 5
      }],
      abilities: [{
        name: 'Embuscade',
        action: '!cof-surprise [[15 + @{selected|DEX}]]'
      }, {
        name: 'Attaque-embuscade',
        action: '!cof-attack @{selected|token_id} @{target|token_id} ["Morsure",["@{selected|ATKCAC}",-1],20,[2,6,5,0],[0]] --sournoise 1 --if moins FOR --etat renverse --endif --if deAttaque 15 --message @{selected|token_name} saisit sa proie entre ses crocs et peut faire une attaque gratuite --if moins FOR --etat immobilise FOR @{selected|token_id} --endif --endif'
      }, {
        name: 'Dévorer',
        action: '!cof-attack @{selected|token_id} @{target|token_id} ["Morsure",["@{selected|ATKCAC}",-1],20,[2,6,5,0],[0]] --if deAttaque 15 --message @{selected|token_name} saisit sa proie entre ses crocs et peut faire une attaque gratuite --if moins FOR --etat renverse --etat immobilise FOR @{selected|token_id} --endif --endif'
      }]
    },
    grandLion: {
      nom: 'Grand lion',
      avatar: "https://s3.amazonaws.com/files.d20.io/images/59486144/8wHs_5WfEIeL_7dKbALHHA/max.jpg?1533041459",
      token: "https://s3.amazonaws.com/files.d20.io/images/60186141/mUZzndi9_sYIzdVVNNka_w/thumb.png?1533903070",
      attributesFiche: {
        NIVEAU: 5,
        FORCE: 22,
        DEXTERITE: 18,
        DEX_SUP: '@{JETSUP}',
        CONSTITUTION: 20,
        INTELLIGENCE: 2,
        SAGESSE: 14,
        SAG_SUP: '@{JETSUP}',
        CHARISME: 14,
        DEFDIV: 6, //Total 20
        RACE: 'lion',
        TAILLE: 'grand'
      },
      pv: 50,
      attaques: [
        ['Morsure', ["@{selected|ATKCAC}", -2], 20, [2, 6, 7, 0],
          [0]
        ]
      ],
      attributes: [{
        name: 'discrétion',
        current: 5
      }],
      abilities: [{
        name: 'Embuscade',
        action: '!cof-surprise [[15 + @{selected|DEX}]]'
      }, {
        name: 'Attaque-embuscade',
        action: '!cof-attack @{selected|token_id} @{target|token_id} ["Morsure",["@{selected|ATKCAC}",-2],20,[2,6,7,0],[0]] --sournoise 1 --if moins FOR --etat renverse --endif --if deAttaque 15 --message @{selected|token_name} saisit sa proie entre ses crocs et peut faire une attaque gratuite --if moins FOR --etat immobilise FOR @{selected|token_id} --endif --endif'
      }, {
        name: 'Dévorer',
        action: '!cof-attack @{selected|token_id} @{target|token_id} ["Morsure",["@{selected|ATKCAC}",-2],20,[2,6,7,0],[0]] --if deAttaque 15 --message @{selected|token_name} saisit sa proie entre ses crocs et peut faire une attaque gratuite --if moins FOR --etat renverse --etat immobilise FOR @{selected|token_id} --endif --endif'
      }]
    },
    oursPolaire: {
      nom: 'Ours polaire',
      avatar: "https://s3.amazonaws.com/files.d20.io/images/59486216/UssilagWK_2dfVGuPABBpA/max.png?1533041591",
      token: "https://s3.amazonaws.com/files.d20.io/images/60186288/B1uAii9G01GcPfQFNozIbw/thumb.png?1533903333",
      attributesFiche: {
        NIVEAU: 6,
        FORCE: 26,
        FOR_SUP: '@{JETSUP}',
        DEXTERITE: 11,
        CONSTITUTION: 26,
        CON_SUP: '@{JETSUP}',
        INTELLIGENCE: 2,
        SAGESSE: 14,
        CHARISME: 6,
        DEFDIV: 10, //Total 20
        RACE: 'ours',
        TAILLE: 'grand'
      },
      pv: 70,
      attaques: [
        ['Morsure', ["@{selected|ATKCAC}", 0], 20, [2, 8, 7, 0],
          [0]
        ]
      ],
      attributes: [{
        name: 'peutEnrager',
        current: 'true'
      }],
      abilities: [{
        name: 'Charge',
        action: '%{selected|Morsure} --m2d20 --pietine}'
      }, ]
    },
    tigreDentsDeSabre: {
      nom: 'Tigre à dents de sabre',
      avatar: "https://s3.amazonaws.com/files.d20.io/images/59486272/f5lUcN3Y9H0thmJPrqa6FQ/max.png?1533041702",
      token: "https://s3.amazonaws.com/files.d20.io/images/60186469/ShcrgpvgXKiQsLVOyg4SZQ/thumb.png?1533903741",
      attributesFiche: {
        NIVEAU: 7,
        FORCE: 26,
        FOR_SUP: '@{JETSUP}',
        DEXTERITE: 18,
        DEX_SUP: '@{JETSUP}',
        CONSTITUTION: 26,
        INTELLIGENCE: 2,
        SAGESSE: 12,
        SAG_SUP: '@{JETSUP}',
        CHARISME: 2,
        DEFDIV: 8, //Total 22
        RACE: 'tigre',
        TAILLE: 'grand'
      },
      pv: 90,
      attaques: [
        ['Morsure', ["@{selected|ATKCAC}", -1], 20, [2, 6, 12, 0],
          [0]
        ]
      ],
      attributes: [{
        name: 'discrétion',
        current: 5
      }],
      abilities: [{
        name: 'Embuscade',
        action: '!cof-surprise [[15 + @{selected|DEX}]]'
      }, {
        name: 'Attaque-embuscade',
        action: '!cof-attack @{selected|token_id} @{target|token_id} ["Morsure",["@{selected|ATKCAC}",-1],20,[2,6,12,0],[0]] --sournoise 1 --if moins FOR --etat renverse --endif --if deAttaque 15 --message @{selected|token_name} saisit sa proie entre ses crocs et peut faire une attaque gratuite --if moins FOR --etat immobilise FOR @{selected|token_id} --endif --endif'
      }, {
        name: 'Dévorer',
        action: '!cof-attack @{selected|token_id} @{target|token_id} ["Morsure",["@{selected|ATKCAC}",-1],20,[2,6,12,0],[0]] --if deAttaque 15 --message @{selected|token_name} saisit sa proie entre ses crocs et peut faire une attaque gratuite --if moins FOR --etat renverse --etat immobilise FOR @{selected|token_id} --endif --endif'
      }]
    },
    oursPrehistorique: {
      nom: 'Ours préhistorique',
      avatar: "https://s3.amazonaws.com/files.d20.io/images/59486323/V6RVSlBbeRJi_aIaIuGGBw/max.png?1533041814",
      token: "https://s3.amazonaws.com/files.d20.io/images/60186633/lNHXvCOsvfPMZDQnqJKQVw/thumb.png?1533904189",
      attributesFiche: {
        NIVEAU: 8,
        FORCE: 32,
        DEXTERITE: 10,
        CONSTITUTION: 32,
        CON_SUP: '@{JETSUP}',
        INTELLIGENCE: 2,
        SAGESSE: 14,
        CHARISME: 6,
        DEFDIV: 12, //Total 22
        RDS: 2,
        RACE: 'ours',
        TAILLE: 'énorme'
      },
      pv: 110,
      attaques: [
        ['Griffes', ["@{selected|ATKCAC}", -2], 20, [3, 6, 13, 0],
          [0]
        ]
      ],
      attributes: [{
        name: 'fauchage',
        current: 'true'
      }],
      abilities: [{
        name: 'Charge',
        action: '%{selected|Griffes} --m2d20 --pietine}'
      }, ]
    }
  };

  function conjurationPredateur(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd === undefined) {
      error("Pas de commande", msg.content);
      return;
    }
    var renforce = 0;
    if (cmd.length > 1) {
      renforce = parseInt(cmd[1]);
      if (isNaN(renforce)) {
        error("Il faut un nombre comme premier argument de !cof-conjuration-de-predateur");
        renforce = 0;
      }
    }
    getSelected(msg, function(selected, playerId) {
      if (selected === undefined || selected.length === 0) {
        error("pas de lanceur pour la conjuration de prédateurs", msg);
        return;
      }
      var evt = {
        type: 'conjuration de prédateurs'
      };
      initiative(selected, evt);
      iterSelected(selected, function(invocateur) {
        var pageId = invocateur.token.get('pageid');
        var niveau = ficheAttributeAsInt(invocateur, 'NIVEAU', 1);
        if (!renforce) {
          renforce = charAttributeAsInt(invocateur, 'voieDeLaConjuration', 0);
          if (renforce == 1) renforce = 0;
        }
        niveau += renforce;
        var predateur;
        if (niveau < 5) predateur = predateurs.loup;
        else if (niveau < 9) predateur = predateurs.loupAlpha;
        else if (niveau < 12) predateur = predateurs.worg;
        else if (niveau < 15) predateur = predateurs.lion;
        else if (niveau < 18) predateur = predateurs.grandLion;
        else if (niveau < 21) predateur = predateurs.oursPolaire;
        else if (niveau < 23) predateur = predateurs.tigreDentsDeSabre;
        else predateur = predateurs.oursPrehistorique;
        var nomPredateur =
          predateur.nom + ' de ' + invocateur.token.get('name');
        var token = createObj('graphic', {
          name: nomPredateur,
          subtype: 'token',
          pageid: pageId,
          imgsrc: predateur.token,
          left: invocateur.token.get('left'),
          top: invocateur.token.get('top'),
          width: 70,
          height: 70,
          layer: 'objects',
          showname: 'true',
          showplayers_bar1: 'true',
          light_hassight: 'true',
          light_angle: 0 //Pour que le joueur ne voit rien par ses yeux
        });
        toFront(token);
        var charPredateur =
          createCharacter(nomPredateur, playerId, predateur.avatar, token, predateur);
        //Tous les prédateurs sont des quadrupèdes
        createObj('attribute', {
          name: 'quadrupede',
          _characterid: charPredateur.id,
          current: true
        });
        //Attribut de predateur conjuré pour la disparition automatique
        createObj('attribute', {
          name: 'predateurConjure',
          _characterid: charPredateur.id,
          current: 5 + modCarac(invocateur, 'CHARISME'),
          max: getInit()
        });
        evt.characters = [charPredateur];
        evt.tokens = [token];
        initiative([{
          _id: token.id
        }], evt);
      }); //end iterSelected
      addEvent(evt);
    }); //end getSelected
  }

  //!cof-conjuration-armee [dé de DM] --limiteParJour...
  function conjurationArmee(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd === undefined) {
      error("Problème de parse options", msg.content);
      return;
    }
    getSelected(msg, function(selected, playerId) {
      if (selected.length === 0) {
        sendPlayer(msg, "Il faut sélectionner le lanceur de la conjuration d'arméé");
        return;
      }
      iterSelected(selected, function(invocateur) {
        var pageId = invocateur.token.get('pageid');
        var niveau = ficheAttributeAsInt(invocateur, 'NIVEAU', 1);
        var evt = {
          type: "Conjuration d'armée"
        };
        if (limiteRessources(invocateur, options, 'conjurationArmee', "conjurer une armée", evt)) return;
        var deDM;
        var nbDeDM;
        if (cmd.length > 1) {
          var argDe = cmd[1].split(/d/i);
          if (argDe.length == 2) {
            nbDeDM = parseInt(argDe[0]);
            if (isNaN(nbDeDM) || nbDeDM < 1) nbDeDM = undefined;
            else {
              deDM = parseInt(argDe[1]);
              if (isNaN(deDM) || deDM < 1) deDM = undefined;
            }
          }
        }
        if (deDM === undefined) {
          var rang = charAttributeAsInt(invocateur, 'voieDeLaConjuration', 3);
          if (rang <= 3) {
            deDM = 6;
            nbDeDM = 1;
          } else if (rang == 4) {
            deDM = 10;
            nbDeDM = 1;
          } else {
            deDM = 6;
            nbDeDM = 2;
          }
        }
        var nomArmee = "Armée de " + invocateur.token.get('name');
        var token = createObj('graphic', {
          name: nomArmee,
          subtype: 'token',
          pageid: pageId,
          imgsrc: 'https://s3.amazonaws.com/files.d20.io/images/73283129/-jrKAyQQ1P7zpD09xeTbXw/thumb.png?1549546953',
          left: invocateur.token.get('left'),
          top: invocateur.token.get('top'),
          width: 70,
          height: 70,
          layer: 'objects',
          showname: 'true',
          showplayers_bar1: 'true',
          light_hassight: 'true',
          light_angle: 0, //Pour que le joueur ne voit rien par ses yeux
          aura1_radius: 10,
          aura1_color: "#d56eef",
          aura1_square: true
        });
        toFront(token);
        var avatar = "https://s3.amazonaws.com/files.d20.io/images/73283254/r6sbxbP1QKKtqXyYq-MlLA/max.png?1549547198";
        var attaque = '!cof-attack @{selected|token_id} @{target|token_id} ';
        attaque += '["Attaque",["@{selected|ATKCAC}",0],20,[' + nbDeDM + ',' + deDM + ',0,0],[20]] --auto';
        var abilities = [{
          name: 'Attaque',
          action: attaque
        }];
        var attributes = [{
          name: 'armeeConjuree',
          current: invocateur.charId
        }];
        var charArmee =
          createCharacter(nomArmee, playerId, avatar, token, {
            pv: niveau * 10,
            abilities: abilities,
            attributes: attributes
          });
        evt.characters = [charArmee];
        evt.tokens = [token];
        if (stateCOF.combat) {
          initiative([{
            _id: token.id
          }], evt);
        }
      });
    });
  }

  //Crée les macros utiles au jeu
  var gameMacros = [{
    name: 'Actions',
    action: "!cof-liste-actions",
    visibleto: 'all',
    istokenaction: true
  }, {
    name: 'Attaque',
    action: "!cof-attack @{selected|token_id} @{target|token_id}",
    visibleto: 'all',
    istokenaction: false
  }, {
    name: 'Consommables',
    action: "!cof-consommables",
    visibleto: 'all',
    istokenaction: true
  }, {
    name: 'Escalier',
    action: "!cof-escalier",
    visibleto: '',
    istokenaction: false,
    inBar: true
  }, {
    name: 'Fin-combat',
    action: "!cof-fin-combat",
    visibleto: '',
    istokenaction: false,
    inBar: true
  }, {
    name: 'Init',
    action: "!cof-init",
    visibleto: '',
    istokenaction: false,
    inBar: true
  }, {
    name: 'Jets',
    action: "!cof-jet",
    visibleto: 'all',
    istokenaction: true,
  }, {
    name: 'Jets GM',
    action: "!cof-jet --secret",
    visibleto: '',
    istokenaction: false,
    inBar: true
  }, {
    name: 'Nuit',
    action: "!cof-nouveau-jour ?{Repos?|Oui,--repos|Non}",
    visibleto: '',
    istokenaction: false,
    inBar: true
  }, {
    name: 'Repos',
    action: "!cof-recuperation",
    visibleto: '',
    istokenaction: false,
    inBar: true
  }, {
    name: 'Statut',
    action: "!cof-statut",
    visibleto: 'all',
    istokenaction: true
  }, {
    name: 'Surprise',
    action: "!cof-surprise ?{difficulté}",
    visibleto: '',
    istokenaction: false,
    inBar: true
  }, {
    name: 'Torche',
    action: "!cof-torche @{selected|token_id}",
    visibleto: 'all',
    istokenaction: true,
  }, {
    name: 'Éteindre',
    action: "!cof-eteindre-lumiere ?{Quelle lumière?|Tout}",
    visibleto: '',
    istokenaction: false,
    inBar: true
  }, {
    name: 'devient',
    action: "!cof-set-state ?{État|mort|surpris|assome|renverse|aveugle|affaibli|etourdi|paralyse|ralenti|immobilise|endormi|apeure|invisible|blessé|encombre} true",
    visibleto: '',
    istokenaction: false,
    inBar: true
  }, {
    name: 'enlève',
    action: "!cof-set-state ?{État|mort|surpris|assome|renverse|aveugle|affaibli|etourdi|paralyse|ralenti|immobilise|endormi|apeure|invisible|blessé|encombre} false",
    visibleto: '',
    istokenaction: false,
    inBar: true
  }, {
    name: 'undo',
    action: "!cof-undo",
    visibleto: '',
    istokenaction: false,
    inBar: true
  }, ];

  function setGameMacros(msg) {
    var playerId = msg.playerid;
    var force = playerIsGM(playerId) && msg.content.includes('--force');
    var inBar = [];
    var allMacros = findObjs({
      _type: 'macro'
    });
    gameMacros.forEach(function(m) {
      var prev =
        allMacros.find(function(macro) {
          return macro.get('name') == m.name;
        });
      if (prev === undefined) {
        m.playerid = playerId;
        createObj('macro', m);
        sendPlayer(msg, "Macro " + m.name + " créée.");
        if (m.inBar) inBar.push(m.name);
      } else if (force) {
        prev.set('action', m.action);
        prev.set('visibleto', m.visibleto);
        prev.set('istokenaction', m.istokenaction);
        sendPlayer(msg, "Macro " + m.name + " réécrite.");
        if (m.inBar) inBar.push(m.name);
      } else {
        sendPlayer(msg, "Macro " + m.name + " déjà présente (utiliser --force pour réécrire).");
      }
    });
    if (inBar.length > 0) {
      sendPlayer(msg, "Macros à metter dans la barre d'action du MJ : " + inBar.join(', '));
      stateCOF.macros = true;
    }
  }

  function ajouteLumiere(msg) {
    var options = parseOptions(msg);
    var cmd = options.cmd;
    if (cmd === undefined || cmd.length < 3) {
      error("Il faut au moins 2 arguments à !cof-lumiere", cmd);
      return;
    }
    var cible = tokenOfId(cmd[1]);
    if (cible === undefined) {
      error("le premier argument de !cof-lumière doit être un token", cmd);
      return;
    }
    var radius = parseInt(cmd[2]);
    if (isNaN(radius) || radius <= 0) {
      error("La distance de vue de la lumière doit être positive", cmd[2]);
      return;
    }
    var dimRadius = '';
    if (cmd.length > 3) {
      dimRadius = parseInt(cmd[3]);
      if (isNaN(dimRadius)) {
        error("La distance de vue de la lumière assombrie doit être un nombre", cmd[3]);
        dimRadius = '';
      }
    }
    var nomToken = 'lumiere';
    if (cmd.length > 4) {
      nomToken = cmd[4].trim();
      if (nomToken === '') nomToken = 'lumiere';
    }
    var evt = {
      type: 'lumiere',
    };
    ajouteUneLumiere(cible, nomToken, radius, dimRadius, evt);
    addEvent(evt);
  }

  function ajouteUneLumiere(perso, groupe, radius, dimRadius, evt) {
    var ct = perso.token;
    var attrName = 'lumiere';
    if (ct.get('bar1_link') === "") attrName += "_" + ct.get('name');
    var nomLumiere = groupe + '_' + ct.get('name');
    if (ct.get('bar1_max') && !ct.get('light_radius')) {
      //Cas particulier où le personnage est un vrai personnage qui ne fait pas de lumière
      setToken(ct, 'light_radius', radius, evt);
      if (dimRadius !== '') setToken(ct, 'light_dimradius', dimRadius, evt);
      setToken(ct, 'light_otherplayers', true, evt);
      var attr1 = createObj('attribute', {
        characterid: perso.charId,
        name: attrName,
        current: nomLumiere,
        max: 'surToken'
      });
      evt.attributes = [{
        attribute: attr1,
        current: null
      }];
      return;
    }
    var pageId = ct.get('pageid');
    var tokLumiere = createObj('graphic', {
      _pageid: pageId,
      imgsrc: "https://s3.amazonaws.com/files.d20.io/images/3233035/xHOXBXoAgOHCHs8omiFAYg/thumb.png?1393406116",
      left: ct.get('left'),
      top: ct.get('top'),
      width: 70,
      height: 70,
      layer: 'walls',
      name: nomLumiere,
      light_radius: radius,
      light_dimradius: dimRadius,
      light_otherplayers: true
    });
    if (tokLumiere === undefined) {
      error("Problème lors de la création du token de lumière", perso);
      return;
    }
    evt.tokens = [tokLumiere];
    if (ct.get('bar1_max')) { //Lumière liée à un token
      var attr = createObj('attribute', {
        characterid: perso.charId,
        name: attrName,
        current: nomLumiere,
        max: tokLumiere.id
      });
      evt.attributes = [{
        attribute: attr,
        current: null
      }];
    } else { //cible temporaire, à effacer7
      ct.remove();
    }
  }

  function eteindreUneLumiere(perso, pageId, al, lumName, evt) {
    var lumId = al.get('max');
    if (lumId == 'surToken') {
      setToken(perso.token, 'light_radius', '', evt);
      setToken(perso.token, 'light_dimradius', '', evt);
      al.remove();
      return;
    }
    var lumiere = getObj('graphic', lumId);
    if (lumiere === undefined) {
      var tokensLumiere = findObjs({
        _type: 'graphic',
        _pageid: pageId,
        layer: 'walls',
        name: lumName
      });
      if (tokensLumiere.length === 0) {
        log("Pas de token pour la lumière " + lumName);
        al.remove();
        return;
      }
      lumiere = tokensLumiere.shift();
      if (tokensLumiere.length > 0) {
        //On cherche le token le plus proche de perso
        var pos = [perso.token.get('left'), perso.token.get('top')];
        var d =
          VecMath.length(
            VecMath.vec([lumiere.get('left'), lumiere.get('top')], pos));
        tokensLumiere.forEach(function(tl) {
          var d2 =
            VecMath.length(
              VecMath.vec([tl.get('left'), tl.get('top')], pos));
          if (d2 < d) {
            d = d2;
            lumiere = tl;
          }
        });
      }
    }
    al.remove();
    if (lumiere) lumiere.remove();
  }

  function eteindreLumieres(msg) {
    var options = parseOptions(msg);
    getSelected(msg, function(selected) {
      if (selected.length === 0) {
        sendPlayer(msg, "Pas de cible sélectionnée pour !cof-eteindre-lumiere");
        return;
      }
      var cmd = options.cmd;
      var groupe;
      if (cmd.length > 1) groupe = cmd[1];
      if (groupe && groupe.toLowerCase() == 'tout') groupe = '';
      var pageId = options.pageId;
      var evt = {
        type: "Eteindre la lumière"
      };
      iterSelected(selected, function(perso) {
        var attrLumiere = tokenAttribute(perso, 'lumiere');
        attrLumiere.forEach(function(al) {
          var lumName = al.get('current');
          if (groupe && !lumName.startsWith(groupe)) return;
          eteindreUneLumiere(perso, pageId, al, lumName, evt);
        });
      });
    }, options);
  }

  function switchTorche(msg) {
    var options = parseOptions(msg);
    var cmd = options.cmd;
    if (cmd.length < 2) {
      error("Il faut préciser le token en argument de !cof-torche");
      return;
    }
    var pageId = options.pageId;
    var perso = tokenOfId(cmd[1], cmd[1], pageId);
    if (perso === undefined) {
      error("Token invalide", cmd);
      return;
    }
    var diminueDuree = 0;
    if (cmd.length > 2) {
      //Dans ce cas, c'est pour diminuer la durée de vie de la torche
      diminueDuree = parseInt(cmd[2]);
      if (isNaN(diminueDuree) || diminueDuree <= 0) {
        sendPlayer(msg, "Le deuxième argument de !cof-torche doit être un nombre strictement positif " + msg.content);
        return;
      }
    }
    var evt;
    //On commence par chercher si une torche est allumée
    var torcheAllumee = false;
    var attrLumiere = tokenAttribute(perso, 'lumiere').filter(function(a) {
      return a.get('current').startsWith('torche');
    });
    if (!diminueDuree && attrLumiere.length > 0) {
      torcheAllumee = true;
      evt = {
        type: "Éteindre les torches"
      };
      attrLumiere.forEach(function(al) {
        var lumName = al.get('current');
        eteindreUneLumiere(perso, pageId, al, lumName, evt);
      });
    }
    var nbTorches = 0;
    var tempsTorche = 0;
    var attrTorches = tokenAttribute(perso, 'torches');
    if (attrTorches.length > 0) {
      nbTorches = parseInt(attrTorches[0].get('current'));
      if (isNaN(nbTorches) || nbTorches < 0) {
        error("Nombre de torches incorrect", nbTorches);
        if (evt) addEvent(evt);
        return;
      }
      if (!torcheAllumee && nbTorches === 0) {
        whisperChar(perso.charId, "n'a pas de torche.");
        return;
      }
      tempsTorche = parseInt(attrTorches[0].get('max'));
      if (isNaN(tempsTorche) || tempsTorche < 0) {
        error("Temps restant pour la torche incorrect", tempsTorche);
        if (evt) addEvent(evt);
        return;
      }
      if (tempsTorche === 0) {
        if (nbTorches === 0) { //Donc forcément torcheAllumee
          //On remet l'attribut dans un état convenable
          setTokenAttr(perso, 'torches', 0, evt, undefined, 60);
          addEvent(evt);
          return;
        }
        nbTorches--;
        tempsTorche = 60;
      }
      if (diminueDuree) {
        evt = evt || {
          type: "Diminuer le duree de vie d'une torche"
        };
        var temps = diminueDuree;
        tempsTorche -= diminueDuree;
        if (tempsTorche <= 0) {
          nbTorches--;
          temps += tempsTorche;
          tempsTorche = 60;
          var msgDiminue = "torche épuisée.";
          if (nbTorches === 0) {
            msgDiminue += " Plus de torche !";
          } else if (nbTorches == 1) {
            msgDiminue += " Plus qu'une torche.";
          } else {
            msgDiminue += " Il lui reste " + nbTorches + " torches.";
          }
          whisperChar(perso.charId, msgDiminue);
        }
        setTokenAttr(perso, 'torches', nbTorches, evt, undefined, tempsTorche);
        sendChar(perso.charId, '/w gm temps de torche diminué de ' + temps + ' minutes');
        addEvent(evt);
        return;
      }

      if (torcheAllumee) {
        sendChar(perso.charId,
          "/w gm torche éteinte. Reste " + nbTorches + " torches, et " +
          tempsTorche + " minutes pour la dernière. " +
          boutonSimple("!cof-torche " + perso.token.id + " ?{Durée?}", '', "Temps depuis allumage"));
        addEvent(evt);
        return;
      }
      evt = {
        type: "Allumer une torche"
      };
      ajouteUneLumiere(perso, 'torche', 13, 7, evt);
      var msgAllume =
        "allume une torche, qui peut encore éclairer pendant " + tempsTorche +
        " minute";
      if (tempsTorche > 1) msgAllume += 's';
      msgAllume += '.';
      if (nbTorches > 1) {
        msgAllume += " Il lui reste encore " + (nbTorches - 1);
        if (nbTorches == 2) msgAllume += " autre torche.";
        else msgAllume += " autres torches.";
      }
      whisperChar(perso.charId, msgAllume);
      addEvent(evt);
      return;
    }
    //On ne tient pas le compte précis des torches
    if (torcheAllumee) {
      whisperChar(perso.charId, "éteint sa torche");
    } else {
      evt = {
        type: "Allumer une torche"
      };
      ajouteUneLumiere(perso, 'torche', 13, 7, evt);
      whisperChar(perso.charId, "allume sa torche");
    }
    addEvent(evt);
  }

  //!cof-options
  //!cof-options opt1 [... optn] val, met l'option à val
  //!cof-options [opt0 ... optk] reset remet toutes les options à leur valeur patr défaut
  //Dans tous les cas, affiche les options du niveau demandé
  function setCofOptions(msg) {
    var playerId = getPlayerIdFromMsg(msg);
    if (!playerIsGM(playerId)) {
      sendPlayer(msg, "Seul le MJ peut changer les options du script");
      return;
    }
    var cmd = msg.content.split(' ');
    var cofOptions = stateCOF.options;
    if (cofOptions === undefined) {
      sendPlayer(msg, "Options non diponibles");
      return;
    }
    var prefix = '';
    var up;
    var defOpt = defaultOptions;
    var newOption;
    var lastCmd;
    var fini;
    cmd.shift();
    cmd.forEach(function(c) {
      if (fini) {
        sendPlayer(msg, "Option " + c + " ignorée");
        return;
      }
      if (c == 'reset') {
        for (var opt in cofOptions) delete cofOptions[opt];
        copyOptions(cofOptions, defOpt);
        fini = true;
      } else if (cofOptions[c]) {
        if (cofOptions[c].type == 'options') {
          if (defOpt[c] === undefined) {
            sendPlayer(msg, "Option " + c + " inconnue dans les options par défaut");
            fini = true;
            return;
          }
          defOpt = defOpt[c].val;
          cofOptions = cofOptions[c].val;
          up = prefix;
          prefix += ' ' + c;
        } else {
          newOption = cofOptions[c];
        }
      } else {
        if (newOption) { //on met newOption à c
          var val = c;
          switch (newOption.type) {
            case 'bool':
              switch (c) {
                case 'oui':
                case 'true':
                case '1':
                  val = true;
                  break;
                case 'non':
                case 'false':
                case '0':
                  val = false;
                  break;
                default:
                  sendPlayer(msg, "L'option " + lastCmd + " ne peut être que true ou false");
                  val = newOption.val;
              }
              break;
            case 'int':
              val = parseInt(c);
              if (isNaN(val)) {
                sendPlayer(msg, "L'option " + lastCmd + " est une valeur entière");
                val = newOption.val;
              }
              break;
          }
          newOption.val = val;
          fini = true;
        } else if (lastCmd) {
          sendPlayer(msg, "L'option " + lastCmd + " ne contient pas de sous-option " + c);
        } else {
          sendPlayer(msg, "Option " + c + " inconnue.");
        }
      }
      lastCmd = c;
      return;
    });
    var titre = "Options de COFantasy";
    if (prefix !== '') {
      titre += "<br>" + prefix + ' (';
      titre += boutonSimple('!cof-options' + up, '', 'retour') + ')';
    }
    var display = startFramedDisplay(playerId, titre, undefined, {
      chuchote: true
    });
    for (var opt in cofOptions) {
      var optVu = opt.replace(/_/g, ' ');
      var line = '<span title="' + cofOptions[opt].explications + '">' +
        optVu + '</span> : ';
      var action = '!cof-options' + prefix + ' ' + opt;
      var displayedVal = cofOptions[opt].val;
      var after = '';
      switch (cofOptions[opt].type) {
        case 'options':
          displayedVal = '<span style="font-family: \'Pictos\'">l</span>';
          break;
        case 'bool':
          action += ' ?{Nouvelle valeur de ' + optVu + '|actif,true|inactif,false}';
          if (displayedVal)
          // Bizarrement, le caractère '*' modifie la suite du tableau
            displayedVal = '<span style="font-family: \'Pictos\'">3</span>';
          else
            displayedVal = '<span style="font-family: \'Pictos\'">*</span>';
          break;
        case 'int':
          action += ' ?{Nouvelle valeur de ' + optVu + '(entier)}';
          break;
        case 'image':
          action += " ?{Entrez l'url pour " + optVu + '}';
          after =
            '<img src="' + displayedVal + '" style="width: 30%; height: auto; border-radius: 6px; margin: 0 auto;">';
          displayedVal = '<span style="font-family: \'Pictos\'">u</span>';
          break;
        default:
          action += ' ?{Nouvelle valeur de ' + optVu + '}';
      }
      line += boutonSimple(action, '', displayedVal) + after;
      addLineToFramedDisplay(display, line);
    }
    addLineToFramedDisplay(display, boutonSimple('!cof-options' + prefix + ' reset', '', 'Valeurs par défaut'), 70);
    sendChat('', endFramedDisplay(display));
  }

  function lancerDefiSamourai(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd === undefined || cmd.length < 3) {
      error("cof-defi-samourai demande au moins 2 options",
        msg.content);
      return;
    }
    var pageId = options.pageId;
    var samourai = tokenOfId(cmd[1], cmd[1], pageId);
    if (samourai === undefined) {
      error("Le token sélectionné n'est pas valide", msg.content);
      return;
    }
    samourai.tokName = samourai.token.get('name');
    if (attributeAsBool(samourai, 'defiSamourai')) {
      sendPlayer(msg, samourai.tokName + " a déjà lancé un défi durant ce combat.");
      return;
    }
    var cible = tokenOfId(cmd[2], cmd[2], pageId);
    if (cible === undefined) {
      error("Le deuxième token sélectionné n'est pas valide", msg.content);
      return;
    }
    cible.tokName = cible.token.get('name');
    var evt = {
      type: 'Défi samouraï'
    };
    var explications = [];
    entrerEnCombat(samourai, [cible], explications, evt);
    explications.forEach(function(m) {
      sendChar(samourai.charId, m);
    });
    var bonus;
    if (cmd.length > 3) {
      bonus = parseInt(cmd[3]);
      if (isNaN(bonus) || bonus < 1) {
        error("Bonus de défi de samouraï incorrect", cmd[3]);
        bonus = undefined;
      }
    }
    if (bonus === undefined)
      bonus = charAttributeAsInt(samourai, 'voieDeLHonneur', 2);
    setTokenAttr(samourai, 'defiSamourai', bonus, evt,
      samourai.tokName + " lance un défi à " + cible.tokName,
      cible.token.id + ' ' + cible.tokName);
  }

  //!cof-enveloppement cubeId targetId Difficulte Attaque
  //Attaque peut être soit label l, soit ability a
  function enveloppement(msg) {
    var options = parseOptions(msg);
    if (options === undefined) return;
    var cmd = options.cmd;
    if (cmd === undefined) {
      error("Problème de parse options", msg.content);
      return;
    }
    if (cmd.length < 6) {
      error("Il manque des arguments à !cof-enveloppement", cmd);
      return;
    }
    var cube = tokenOfId(cmd[1]);
    if (cube === undefined) {
      error("Token non défini", cmd[1]);
      return;
    }
    if (!peutController(msg, cube)) {
      sendPlayer(msg, "pas le droit d'utiliser ce bouton");
      return;
    }
    var cible = tokenOfId(cmd[2]);
    if (cible === undefined) {
      error("Token non défini", cmd[2]);
      return;
    }
    var difficulte = parseInt(cmd[3]);
    if (isNaN(difficulte)) {
      error("Difficulté n'est pas un nombre, on prend 15 par défaut", cmd[3]);
      difficulte = 15;
    }
    var exprDM;
    switch (cmd[4]) {
      case 'label':
      case 'ability':
        exprDM = cmd[4] + ' ' + cmd[5];
        break;
      default:
        error("Impossible de déterminer les dégâts quand enveloppé", cmd[4]);
        return;
    }
    var evt = {
      type: 'Enveloppement'
    };
    //Choix de la caractéristique pour résister : FOR ou DEX
    var caracRes = meilleureCarac('FOR', 'DEX', cible, 10 + modCarac(cube, 'FORCE'));
    var titre = "Enveloppement";
    var display = startFramedDisplay(options.playerId, titre, cube, {
      perso2: cible
    });
    var explications = [];
    testOppose(cube, 'FOR', cible, caracRes, explications, evt,
      function(res, crit) {
        switch (res) {
          case 1:
            explications.push(cube.token.get('name') + " a absorbé " + cible.token.get('name'));
            var cubeId = cube.token.id + ' ' + cube.token.get('name');

            setTokenAttr(cible, 'enveloppePar', cubeId, evt, undefined, difficulte);
            var cibleId = cible.token.id + ' ' + cible.token.get('name');
            cible.token.set('left', cube.token.get('left'));
            cible.token.set('right', cube.token.get('right'));
            toFront(cube.token);
            setTokenAttr(cube, 'enveloppe', cibleId, evt, undefined, exprDM);
            break;
          case 2:
            if (caracRes == 'FOR') {
              explications.push(cible.token.get('name') + " résiste et ne se laisse pas absorber");
            } else {
              explications.push(cible.token.get('name') + " évite l'absorption");
            }
            break;
          default: //match null, la cible s'en sort
            explications.push(cible.token.get('name') + " échappe de justesse à l'enveloppement");
        }
        explications.forEach(function(e) {
          addLineToFramedDisplay(display, e);
        });
        addEvent(evt);
        sendChat("", endFramedDisplay(display));
      }
    );
  }

  //!cof-echapper-enveloppement diff cubeId cubeName
  function echapperEnveloppement(msg) {
    var options = msg.options || parseOptions(msg);
    if (options === undefined) return;
    var evt = {
      type: "Tentative de sortie d'enveloppement"
    };
    getSelected(msg, function(selected, playerId) {
      if (selected.length === 0) {
        sendPlayer(msg, "!cof-echapper-enveloppement sans sélection de token");
        log("!cof-echapper-enveloppement requiert de sélectionner des tokens");
        return;
      }
      iterSelected(selected, function(perso) {
        var attr = tokenAttribute(perso, 'enveloppePar');
        if (attr.length === 0) {
          sendPlayer(msg, perso.token.get('name') + " n'est pas englouti.");
          return;
        }
        attr = attr[0];
        var cube = tokenOfIdName(attr.get('current'), options.pageId);
        if (cube === undefined) {
          error("Attribut enveloppePar mal formé, on le supprime", attr.get('current'));
          attr.remove();
          return;
        }
        var difficulte = parseInt(attr.get('max'));
        if (isNaN(difficulte)) {
          error("Difficulté mal formée", attr.get('max'));
          difficulte = 15;
        }
        var titre = "Tentative de sortir de " + cube.tokName;
        var display = startFramedDisplay(playerId, titre, perso, {
          chuchote: options.secret
        });
        if (options.chance) options.bonus = options.chance * 10;
        testCaracteristique(perso, 'FOR', difficulte, options, evt,
          function(tr) {
            addLineToFramedDisplay(display, "<b>Résultat :</b> " + tr.texte);
            addEvent(evt);
            if (tr.reussite) {
              addLineToFramedDisplay(display, "C'est réussi, " + perso.token.get('name') + " s'extirpe de " + cube.tokName);
              toFront(perso.token);
              evt.deletedAttributes = evt.deletedAttributes || [];
              evt.deletedAttributes.push(attr);
              attr.remove();
              attr = tokenAttribute(cube, 'enveloppe');
              attr.forEach(function(a) {
                var ca = tokenOfIdName(a.get('current'));
                if (ca && ca.token.id == perso.token.id) {
                  evt.deletedAttributes.push(a);
                  a.remove();
                }
              });
            } else if (selected.length == 1) {
              //TODO : ajouter le pacte sanglant, la prouesse et le tour de force
              var msgRate = "C'est raté.";
              evt.personnage = perso;
              evt.action = {
                selected: [{
                  _id: perso.token.id
                }],
                playerId: playerId,
                options: options
              };
              evt.type = 'echapperEnveloppement';
              var pc = attributeAsInt(perso, 'PC', 0);
              if (pc > 0) {
                options.roll = options.roll || tr.roll;
                msgRate += ' ' +
                  bouton("!cof-bouton-chance " + evt.id, "Chance", perso) +
                  " (reste " + pc + " PC)";
              }
              if (charAttributeAsBool(perso, 'runeDEnergie')) {
                msgRate += ' ' + bouton("!cof-bouton-rune-energie " + evt.id, "Rune d'énergie", perso);
              }
              addLineToFramedDisplay(display, msgRate);
            }
            sendChat('', endFramedDisplay(display));
          });
      });
      addEvent(evt);
    });
  }

  function apiCommand(msg) {
    msg.content = msg.content.replace(/\s+/g, ' '); //remove duplicate whites
    var command = msg.content.split(" ", 1);
    // First replace inline rolls by their values
    replaceInline(msg);
    var evt;
    switch (command[0]) {
      case "!cof-options":
        setCofOptions(msg);
        return;
      case "!cof-jet":
        jet(msg);
        return;
      case "!cof-resultat-jet":
        resultatJet(msg);
        return;
      case "!cof-attack":
        parseAttack(msg);
        return;
      case "!cof-undo":
        undoEvent();
        return;
      case "!cof-hors-combat":
      case "!cof-fin-combat":
        sortirDuCombat();
        return;
      case "!cof-nuit": //deprecated
        nuit(msg);
        return;
      case "!cof-jour": //deprecated
        evt = {
          type: "Nouveau jour"
        };
        jour(evt);
        addEvent(evt);
        return;
      case "!cof-nouveau-jour":
        nouveauJour(msg);
        return;
      case "!cof-recuperation":
        recuperer(msg);
        return;
      case "!cof-recharger":
        recharger(msg);
        return;
      case "!cof-chance": //deprecated
        chance(msg);
        return;
      case "!cof-bouton-chance":
        boutonChance(msg);
        return;
      case "!cof-bouton-rune-energie":
      case "!cof-rune-energie":
        runeEnergie(msg);
        return;
      case "!cof-rune-puissance":
        runePuissance(msg);
        return;
      case "!cof-pousser-kiai":
        kiai(msg);
        return;
      case "!cof-rune-protection":
        runeProtection(msg);
        return;
      case "!cof-surprise":
        surprise(msg);
        return;
      case "!cof-init":
        if (msg.selected === undefined) {
          error("Dans !cof-init : rien à faire, pas de token selectionné", msg);
          return;
        }
        if (msg.content.indexOf('--aura') !== -1) aura_token_on_turn = true;
        else aura_token_on_turn = false;
        evt = {
          type: "initiative"
        };
        initiative(msg.selected, evt);
        addEvent(evt);
        return;
      case "!cof-turn-action":
      case "!cof-liste-actions":
        apiTurnAction(msg);
        return;
      case "!cof-attendre":
        attendreInit(msg);
        return;
      case "!cof-statut":
        statut(msg);
        return;
      case "!cof-armure-magique":
        armureMagique(msg);
        return;
      case "!cof-buf-def":
        bufDef(msg);
        return;
      case "!cof-remove-buf-def":
        removeBufDef(msg);
        return;
      case "!cof-aoe": //deprecated
      case "!cof-dmg":
        dmgDirects(msg);
        return;
      case "!cof-set-state":
        interfaceSetState(msg);
        return;
      case "!cof-save-state":
        saveState(msg);
        return;
      case "!cof-degainer":
        degainer(msg);
        return;
      case "!cof-echange-init":
        echangeInit(msg);
        return;
      case "!cof-a-couvert":
        aCouvert(msg);
        return;
      case "!cof-effet-temp":
        effetTemporaire(msg);
        return;
      case "!cof-effet-combat":
        effetCombat(msg);
        return;
      case "!cof-effet":
        effetIndetermine(msg);
        return;
      case "!cof-fin-classe-effet":
        finClasseDEffet(msg);
        return;
      case "!cof-attaque-magique":
        attaqueMagique(msg);
        return;
      case "!cof-injonction":
        injonction(msg);
        return;
      case "!cof-sommeil":
        sommeil(msg);
        return;
      case "!cof-attaque-magique-contre-pv":
        attaqueMagiqueContrePV(msg);
        return;
      case "!cof-transe-guerison":
        transeGuerison(msg);
        return;
      case "!cof-soin":
        soigner(msg);
        return;
      case "!cof-aoe-soin": //Deprecated
        aoeSoin(msg);
        return;
      case "!cof-nature-nourriciere":
        natureNourriciere(msg);
        return;
      case "!cof-ignorer-la-douleur":
        ignorerLaDouleur(msg);
        return;
      case "!cof-fortifiant":
        fortifiant(msg);
        return;
      case "!cof-intercepter":
        intercepter(msg);
        return;
      case "!cof-interposer":
        interposer(msg);
        return;
      case "!cof-esquive-fatale":
        esquiveFatale(msg);
        return;
      case "!cof-exemplaire":
        exemplaire(msg);
        return;
      case "!cof-lancer-sort":
        lancerSort(msg);
        return;
      case "!cof-as":
        emulerAs(msg);
        return;
      case "!cof-peur":
        peur(msg);
        return;
      case "!cof-distribuer-baies":
        distribuerBaies(msg);
        return;
      case "!cof-consommer-baie":
        consommerBaie(msg);
        return;
      case "!cof-proteger-un-allie":
        protegerUnAllie(msg);
        return;
      case "!cof-action-defensive":
        actionDefensive(msg);
        return;
      case "!cof-strangulation":
        strangulation(msg);
        return;
      case "!cof-ombre-mortelle":
        ombreMortelle(msg);
        return;
      case "!cof-escalier":
        escalier(msg);
        return;
      case "!cof-defaut-dans-la-cuirasse":
        defautDansLaCuirasse(msg);
        return;
      case "!cof-posture-de-combat":
        postureDeCombat(msg);
        return;
      case "!cof-mur-de-force":
        murDeForce(msg);
        return;
      case "!cof-capitaine":
        devientCapitaine(msg);
        return;
      case "!cof-tueur-fantasmagorique":
        tueurFantasmagorique(msg);
        return;
      case "!cof-tour-de-force":
        tourDeForce(msg);
        return;
      case "!cof-encaisser-un-coup":
        encaisserUnCoup(msg);
        return;
      case "!cof-absorber-au-bouclier":
        absorberAuBouclier(msg);
        return;
      case "!cof-demarrer-statistiques":
        if (stateCOF.statistiquesEnPause) {
          stateCOF.statistiques = stateCOF.statistiquesEnPause;
          delete stateCOF.statistiquesEnPause;
        } else {
          stateCOF.statistiques = {}; //remet aussi les statistiques à 0
        }
        return;
      case "!cof-arreter-statistiques":
        delete stateCOF.statistiques;
        return;
      case "!cof-pause-statistiques":
        if (stateCOF.statistiques) {
          stateCOF.statistiquesEnPause = stateCOF.statistiques;
          delete stateCOF.statistiques;
        } // sinon, ne pas écraser les statistiques déjà en pause
        return;
      case "!cof-statistiques":
        displayStatistics(msg);
        return;
      case "!cof-destruction-des-morts-vivants":
        destructionDesMortsVivants(msg);
        return;
      case "!cof-enduire-poison":
        enduireDePoison(msg);
        return;
      case "!cof-consommables":
        listeConsommables(msg);
        return;
      case "!cof-utilise-consommable": //Usage interne seulement
        utiliseConsommable(msg, false);
        return;
      case "!cof-echange-consommables": //Usage interne seulement
        utiliseConsommable(msg, true);
        return;
      case "!cof-provocation":
        provocation(msg);
        return;
      case "!cof-en-selle":
        enSelle(msg);
        return;
      case "!cof-creer-elixir": //usage interne seulement
        creerElixir(msg);
        return;
      case "!cof-elixirs":
        gestionElixir(msg);
        return;
      case "!cof-rage-du-berserk":
        rageDuBerserk(msg);
        return;
      case "!cof-arme-secrete":
        armeSecrete(msg);
        return;
      case "!cof-animer-arbre":
        animerUnArbre(msg);
        return;
      case "!cof-delivrance":
        delivrance(msg);
        return;
      case "!cof-test-attaque-opposee":
        testAttaqueOpposee(msg);
        return;
      case "!cof-manoeuvre":
        manoeuvreRisquee(msg);
        return;
      case "!cof-appliquer-manoeuvre":
        appliquerManoeuvre(msg);
        return;
      case "!cof-desarmer":
        desarmer(msg);
        return;
      case "!cof-tempete-de-mana":
        optionsDeTempeteDeMana(msg);
        return;
      case "!cof-deplacer-token":
        deplacerToken(msg);
        return;
      case "!cof-permettre-deplacement":
        permettreDeplacement(msg);
        return;
      case "!cof-tour-suivant":
        tourSuivant(msg);
        return;
      case "!cof-multi-command":
        multiCommand(msg);
        return;
      case "!cof-conjuration-de-predateur":
        conjurationPredateur(msg);
        return;
      case "!cof-conjuration-armee":
        conjurationArmee(msg);
        return;
      case "!cof-set-macros":
        setGameMacros(msg);
        return;
      case "!cof-lumiere":
        ajouteLumiere(msg);
        return;
      case "!cof-eteindre-lumiere":
        eteindreLumieres(msg);
        return;
      case "!cof-torche":
        switchTorche(msg);
        return;
      case "!cof-defi-samourai":
        lancerDefiSamourai(msg);
        return;
      case "!cof-enveloppement":
        enveloppement(msg);
        return;
      case "!cof-echapper-enveloppement":
        echapperEnveloppement(msg);
        return;
      default:
        return;
    }
  }

  //Attributs possibles :
  // dm : permet d'infliger des dm
  // soins : soigne
  // prejudiciable: est un effet préjudiciable, qui peut être enlevé par délivrance
  // generic: admet un argument entre parenthèses
  // seulementVivant: ne peut s'appliquer qu'aux créatures vivantes
  var messageEffetTemp = {
    sousTension: {
      activation: "se charge d'énergie électrique",
      actif: "est chargé d'énergie électrique",
      fin: "n'est plus chargé d'énergie électrique",
      dm: true
    },
    aCouvert: {
      activation: "reste à couvert",
      actif: "est à couvert",
      fin: "n'est plas à couvert"
    },
    imageDecalee: {
      activation: "décale légèrement son image",
      actif: "a décalé son image",
      fin: "apparaît à nouveau là où il se trouve"
    },
    chantDesHeros: {
      activation: "écoute le chant du barde",
      actif: "est inspiré par le Chant des Héros",
      fin: "n'est plus inspiré par le Chant des Héros"
    },
    benediction: {
      activation: "est touché par la bénédiction",
      actif: "est béni",
      fin: "l'effet de la bénédiction s'estompe"
    },
    peauDEcorce: {
      activation: "donne à sa peau la consistance de l'écorce",
      actif: "a la peau dure comme l'écorce",
      fin: "retrouve une peau normale"
    },
    rayonAffaiblissant: {
      activation: "est touché par un rayon affaiblissant",
      actif: "est sous l'effet d'un rayon affaiblissant",
      fin: "n'est plus affaibli",
      prejudiciable: true
    },
    peur: {
      activation: "prend peur",
      actif: "est dominé par sa peur",
      fin: "retrouve du courage",
      prejudiciable: true
    },
    peurEtourdi: {
      activation: "prend peur: il peut fuir ou rester recroquevillé",
      actif: "est paralysé par la peur",
      fin: "retrouve du courage et peut à nouveau agir",
      prejudiciable: true
    },
    aveugleTemp: {
      activation: "n'y voit plus rien !",
      actif: "", //Déjà affiché avec l'état aveugle
      fin: "retrouve la vue",
      prejudiciable: true
    },
    ralentiTemp: {
      activation: "est ralenti : une seule action, pas d'action limitée",
      actif: "", //Déjà affiché avec l'état ralenti
      fin: "n'est plus ralenti",
      prejudiciable: true
    },
    paralyseTemp: {
      activation: "est paralysé : aucune action ni déplacement possible",
      actif: "", //Déjà affiché avec l'état ralenti
      fin: "n'est plus paralysé",
      prejudiciable: true
    },
    etourdiTemp: {
      activation: "est étourdi : aucune action et -5 en DEF",
      actif: "", //Déjà affiché avec l'état ralenti
      fin: "n'est plus étourdi",
      prejudiciable: true
    },
    aveugleManoeuvre: {
      activation: "est aveuglé par la manoeuvre",
      actif: "a du mal à voir où sont ses adversaires",
      fin: "retrouve une vision normale",
      prejudiciable: true
    },
    bloqueManoeuvre: {
      activation: "est bloqué par la manoeuvre",
      actif: "est bloqué et ne peut pas se déplacer",
      fin: "peut à nouveau se déplacer",
      prejudiciable: true
    },
    diversionManoeuvre: {
      activation: "est déconcentré",
      actif: "a été perturbé par une diversion",
      fin: "se reconcentre sur le combat",
      prejudiciable: true
    },
    menaceManoeuvre: {
      activation: "est menacé",
      actif: "a été menacée, risque de plus de DM",
      fin: "n'est plus sous la menace",
      prejudiciable: true,
      generic: true
    },
    tenuADistanceManoeuvre: {
      activation: "est tenu à distance",
      actif: "est tenu à distance de son adversaire, il ne peut pas l'attaquer",
      fin: "peut à nouveau attaquer son adversaire",
      prejudiciable: true,
      generic: true
    },
    epeeDansante: {
      activation: "fait apparaître une lame d'énergie lumineuse",
      actif: "contrôle une lame d'énergie lumineuse",
      fin: "La lame d'énergie lumineuse disparaît",
      dm: true
    },
    putrefaction: {
      activation: "vient de contracter une sorte de lèpre fulgurante",
      actif: "est en pleine putréfaction",
      fin: "La putréfaction s'arrête.",
      prejudiciable: true,
      dm: true
    },
    forgeron: {
      activation: "enflamme son arme",
      actif: "a une arme en feu",
      fin: "L'arme n'est plus enflammée.",
      dm: true,
      generic: true
    },
    armeEnflammee: {
      activation: "voit son arme prendre feu",
      actif: "a une arme enflammée",
      fin: "L'arme n'est plus enflammée.",
      dm: true,
      generic: true
    },
    dotGen: {
      activation: "subit un effet",
      actif: "subit régulièrement des dégâts",
      fin: "ne subit plus ces effets de dégâts",
      dm: true,
      generic: true
    },
    rechargeGen: {
      activation: "doit maintenant attendre un peu avant de pouvoir le refaire",
      actif: "attends avant de pouvoir refaire une attaque",
      fin: "a récupéré",
      generic: true
    },
    dmgArme1d6: {
      activation: "enduit son arme d'une huile magique",
      actif: "a une arme plus puissante",
      fin: "L'arme retrouve sa puissance normale",
      dm: true,
      generic: true
    },
    flou: {
      activation: "devient flou",
      actif: "apparaît flou",
      fin: "redevient net"
    },
    agrandissement: {
      activation: "se met à grandir",
      actif: "est vraiment très grand",
      fin: "retrouve sa taille normale"
    },
    formeGazeuse: {
      activation: "semble perdre de la consistance",
      actif: "est en forme gazeuse",
      fin: "retrouve sa consistance normale"
    },
    intangible: {
      activation: "devient translucide",
      actif: "est intangible",
      fin: "redevient solide"
    },
    strangulation: {
      activation: "commence à étouffer",
      actif: "est étranglé",
      fin: "respire enfin",
      prejudiciable: true,
      seulementVivant: true,
      dm: true
    },
    ombreMortelle: {
      activation: "voit son ombre s'animer et l'attaquer !",
      actif: "est une ombre animée",
      fin: "retrouve une ombre normale",
      dm: true
    },
    dedoublement: {
      activation: "voit un double translucide sortir de lui",
      actif: "est un double translucide",
      fin: "le double disparaît",
      dm: true
    },
    zoneDeSilence: {
      activation: "n'entend plus rien",
      actif: "est totalement sourd",
      fin: "peut à nouveau entendre"
    },
    danseIrresistible: {
      activation: "se met à danser",
      actif: "danse malgré lui",
      fin: "s'arrête de danser",
      prejudiciable: true
    },
    confusion: {
      activation: "ne sait plus très bien ce qu'il fait là",
      actif: "est en pleine confusion",
      fin: "retrouve ses esprits",
      prejudiciable: true
    },
    murDeForce: {
      activation: "fait apparaître un mur de force",
      actif: "en entouré d'un mur de force",
      fin: "voit son mur de force disparaître"
    },
    asphyxie: {
      activation: "commence à manquer d'air",
      actif: "étouffe",
      fin: "peut à nouveau respirer",
      prejudiciable: true,
      seulementVivant: true,
      dm: true
    },
    forceDeGeant: {
      activation: "devient plus fort",
      actif: "a une force de géant",
      fin: "retrouve sa force normale"
    },
    saignementsSang: {
      activation: "commence à saigner du nez, des oreilles et des yeux",
      actif: "saigne de tous les orifices du visage",
      fin: "ne saigne plus",
      prejudiciable: true,
      dm: true
    },
    encaisserUnCoup: {
      activation: "se place de façon à dévier un coup sur son armure",
      actif: "est placé de façon à dévier un coup",
      fin: "n'est plus en position pour encaisser un coup"
    },
    absorberUnCoup: {
      activation: "se prépare à absorber un coup avec son bouclier",
      actif: "est prêt à absorber un coup avec son bouclier",
      fin: "n'est plus en position de prendre le prochain coup sur son bouclier"
    },
    absorberUnSort: {
      activation: "se prépare à absorber un sort avec son bouclier",
      actif: "est prêt à absorber un sort avec son bouclier",
      fin: "n'est plus en position de se protéger d'un sort avec son bouclier"
    },
    nueeDInsectes: {
      activation: "est attaqué par une nuée d'insectes",
      actif: "est entouré d'une nuée d'insectes",
      fin: "est enfin débarassé des insectes",
      prejudiciable: true,
      dm: true
    },
    prisonVegetale: {
      activation: "voit des plantes pousser et s'enrouler autour de ses jambes",
      actif: "est bloqué par des plantes",
      fin: "se libère des plantes",
      prejudiciable: true
    },
    protectionContreLesElements: {
      activation: "lance un sort de protection contre les éléments",
      actif: "est protégé contre les éléments",
      fin: "n'est plus protégé contre les éléments"
    },
    masqueMortuaire: {
      activation: "prend l'apparence de la mort",
      actif: "semble mort et animé",
      fin: "retrouve une apparence de vivant"
    },
    armeBrulante: {
      activation: "sent son arme lui chauffer la main",
      actif: "se brûle la main sur son arme",
      fin: "sent son arme refroidir",
      dm: true
    },
    armureBrulante: {
      activation: "sent son armure chauffer",
      actif: "brûle dans son armure",
      fin: "sent son armure refroidir",
      dm: true
    },
    masqueDuPredateur: {
      activation: "prend les traits d'un prédateur",
      actif: "a les traits d'un prédateur",
      fin: "redevient normal"
    },
    aspectDeLaSuccube: {
      activation: "acquiert une beauté fascinante",
      actif: "est d'une beauté fascinante",
      fin: "retrouve sa beauté habituelle"
    },
    aspectDuDemon: {
      activation: "prend l’apparence d’un démon",
      actif: "a l’apparence d’un démon",
      fin: "retrouve son apparence habituelle"
    },
    sangMordant: {
      activation: "transforme son sang",
      actif: "a du sang acide",
      fin: "retrouve un sang normal"
    },
    armeSecreteBarde: {
      activation: "est déstabilisé",
      actif: "est déstabilisé par une action de charme",
      fin: "retrouve ses esprits",
      prejudiciable: true
    },
    regeneration: {
      activation: "commence à se régénérer",
      actif: "se régénère",
      fin: "a fini de se régénérer",
      soins: true
    },
    arbreAnime: {
      activation: "commence à bouger",
      actif: "est un arbre animé",
      fin: "redevient un arbre ordinaire"
    },
    magnetisme: {
      activation: "contrôle le magnétisme",
      actif: "contrôle le magnétisme",
      fin: "relache son contrôle du magnétisme"
    },
    hate: {
      activation: "voit son métabolisme s'accélérer",
      actif: "peut faire une action de plus par tour",
      fin: "retrouve un métabolisme normal (plus d'action supplémentaire)"
    },
    ailesCelestes: {
      activation: "sent des ailes célestes lui pousser dans le dos",
      actif: "possède des ailes célestes",
      fin: "n'a plus d'aile céleste. Espérons qu'il était au sol..."
    },
    sanctuaire: {
      activation: "lance un sort de sanctuaire",
      actif: "est protégé par un sanctuaire",
      fin: "n'est plus protégé par le sanctuaire"
    },
    rechargeSouffle: {
      activation: "doit maintenant attendre un peu avant de pouvoir le refaire",
      actif: "attends avant de pouvoir refaire un souffle",
      fin: "a récupéré"
    },
    paralysieRoublard: {
      activation: "est paralysé par la douleur",
      actif: "ne peut pas attaquer ni se déplacer",
      fin: "peut à nouveau attaquer et se déplacer",
      prejudiciable: true,
      seulementVivant: true
    },
    mutationOffensive: {
      activation: "échange une partie de son corps avec celle d'une créature monstrueuse",
      actif: "possède un appendice monstrueux",
      fin: "retrouve un corps normal"
    },
    formeDArbre: {
      activation: "se transorme en arbre",
      actif: "est transformé en arbre",
      fin: "retrouve sa forme normale"
    },
    statueDeBois: {
      activation: "se transforme en statue de bois",
      actif: "est transformé en statue de bois",
      fin: "retrouve sa forme normale",
      prejudiciable: true
    },
    clignotement: {
      activation: "disparaît, puis réapparaît",
      actif: "clignote",
      fin: "ne disparaît plus"
    },
    agitAZeroPV: {
      activation: "continue à agir malgré les blessures",
      actif: "devrait être à terre",
      fin: "subit l'effet de ses blessures"
    },
    predateurConjure: {
      activation: "apparaît depuis un autre plan",
      actif: "est un prédateur conjuré",
      fin: "disparaît",
      dm: true
    },
    champDeProtection: {
      activation: "devient protégé par un champ télékinétique",
      actif: "est protégé par un champ télékinétique",
      fin: "n'est plus sous l'effet d'un champ de protection",
    },
    attaqueArmeeConjuree: {
      activation: "se bat contre une armée conjurée",
      actif: "se bat contre une armée conjurée",
      fin: "ne se bat plus contre l'armée conjurée"
    },
    rechargeDuKiai: {
      activation: "pousse un kiai",
      actif: "ne peut pas encore pousser un autre kiai",
      fin: "peut pousser un autre kiai"
    },
  };

  function buildPatternEffets(listeEffets, postfix) {
    if (postfix && postfix.length === 0) postfix = undefined;
    var expression = "(";
    expression = _.reduce(listeEffets, function(reg, msg, effet) {
      var res = reg;
      if (res !== "(") res += "|";
      res += "^" + effet;
      if (msg.generic) res += "\\([^)]*\\)";
      res += "(";
      if (postfix) {
        postfix.forEach(function(p, i) {
          if (i) res += "|";
          res += p + "$|" + p + "_";
        });
      } else res += "$|_";
      res += ")";
      return res;
    }, expression);
    expression += ")";
    return new RegExp(expression);
  }

  var patternEffetsTemp = buildPatternEffets(messageEffetTemp);

  function estEffetTemp(name) {
    return (patternEffetsTemp.test(name));
  }

  var patternAttributEffetsTemp = buildPatternEffets(messageEffetTemp, ["Puissant", "Valeur", "SaveParTour", "TempeteDeManaIntense"]);

  function estAttributEffetTemp(name) {
    return (patternAttributEffetsTemp.test(name));
  }

  //On sait déjà que le nom a passé le test estEffetTemp
  function effetTempOfAttribute(attr) {
    var ef = attr.get('name');
    if (ef === undefined || messageEffetTemp[ef]) return ef;
    //D'abord on enlève le nom du token 
    var pu = ef.indexOf('_');
    if (pu > 0) {
      ef = ef.substring(0, pu);
      if (messageEffetTemp[ef]) return ef;
    }
    //Ensuite on enlève les parties entre parenthèse pour les effets génériques
    pu = ef.indexOf('(');
    if (pu > 0) {
      ef = ef.substring(0, pu);
      if (messageEffetTemp[ef]) return ef;
    }
    error("Impossible de déterminer l'effet correspondant à " + ef, attr);
  }

  function messageOfEffetTemp(effetC) {
    var res = messageEffetTemp[effetC];
    if (res) return res;
    var p = effetC.indexOf('(');
    if (p > 0) {
      var ef = effetC.substring(0, p);
      res = messageEffetTemp[ef];
      return res;
    }
    error("Effet temporaire non trouvé", effetC);
    return;
  }

  var messageEffetCombat = {
    armureMagique: {
      activation: "est entouré d'un halo magique",
      actif: "est protégé par une armure magique",
      fin: "n'est plus entouré d'un halo magique"
    },
    armureDuMage: {
      activation: "fait apparaître un nuage magique argenté qui le protège",
      actif: "est entouré d'une armure du mage",
      fin: "n'a plus son armure du mage"
    },
    armeDArgent: {
      activation: "crée une arme d'argent et de lumière",
      actif: "possède une arme d'argent et de lumière",
      fin: "ne possède plus d'arme d'argent et de lumière",
      dm: true
    },
    criDeGuerre: {
      activation: "pousse son cri de guerre",
      actif: "a effrayé ses adversaires",
      fin: ""
    },
    protectionContreLeMal: {
      activation: "reçoit une bénédiction de protection contre le mal",
      actif: "est protégé contre le mal",
      fin: "n'est plus protégé contre le mal"
    },
    rageDuBerserk: {
      activation: "entre dans une rage berserk",
      actif: "est dans une rage berserk",
      fin: "retrouve son calme"
    },
    enragé: {
      activation: "devient enragé",
      actif: "est enragé",
      fin: "retrouve son calme"
    },
    bonusInitEmbuscade: { //Effet interne pour la capacité Surveillance
      activation: "a un temps d'avance en cas d'embuscade",
      actif: "a un temps d'avance",
      fin: ""
    },
    putrefactionOutreTombe: {
      activation: "sent ses chairs pourrir",
      actif: "subit le contrecoup d'une putréfaction",
      fin: "se remet de la putréfaction",
      prejudiciable: true,
      dm: true
    },
    bonusInitVariable: {
      activation: "entre en combat",
      actif: "est en combat",
      fin: ''
    },
    defiSamourai: {
      activation: "lance un défi",
      actif: "a lancé un défi",
      fin: ''
    }
  };

  var patternEffetsCombat = buildPatternEffets(messageEffetCombat);

  function estEffetCombat(name) {
    return (patternEffetsCombat.test(name));
  }

  var patternAttributEffetsCombat = buildPatternEffets(messageEffetCombat, ["Puissant", "Valeur", "SaveParTour", "TempeteDeManaIntense"]);

  function estAttributEffetCombat(name) {
    return (patternAttributEffetsCombat.test(name));
  }

  function effetCombatOfAttribute(attr) {
    var ef = attr.get('name');
    if (ef === undefined || messageEffetCombat[ef]) return ef;
    //D'abord on enlève le nom du token 
    var pu = ef.indexOf('_');
    if (pu > 0) {
      ef = ef.substring(0, pu);
      if (messageEffetCombat[ef]) return ef;
    }
    error("Impossible de déterminer l'effet correspondant à " + ef, attr);
  }

  var messageEffetIndetermine = {
    aCheval: { //deprecated, mieux vaut utiliser la commande !cof-en-selle
      activation: "monte sur sa monture",
      actif: "est sur sa monture",
      fin: "descend de sa monture"
    },
    marcheSylvestre: {
      activation: "se deplace maintenant en terrain difficile",
      actif: "profite du terrain difficile",
      fin: "est maintenant en terrain normal"
    },
    mutationCuirasse: {
      activation: "endurcit sa peau",
      actif: "a la peau recouverte d'une cuirasse",
      fin: "retrouve une peau normale"
    },
    mutationEcaillesRouges: {
      activation: "recouvre sa peau d'écailles rouges",
      actif: "a la peau recouverte d'écailles rouges",
      fin: "retrouve une peau normale"
    },
    mutationFourrureViolette: {
      activation: "se fait pousser une fourrure violette",
      actif: "a la peau recouverte d'une fourrure violette",
      fin: "retrouve une peau normale"
    },
    mutationOuies: {
      activation: "se fait pousser des ouïes",
      actif: "possède des ouïes",
      fin: "n'a plus d'ouïes"
    },
    mutationSangNoir: {
      activation: "prend un teint plus sombre",
      actif: "a le sang noir",
      fin: "retrouve un sang normal"
    },
    mutationMusclesHypertrophies: {
      activation: "devient plus musclé",
      actif: "a les muscles hypertrophiés",
      fin: "retrouve des muscles normaux",
    },
    mutationSilhouetteFiliforme: {
      activation: "devient plus fin",
      actif: "a une silhouette filiforme",
      fin: "retrouve une silhouette normale",
    },
    mutationSilhouetteMassive: {
      activation: "devient plus massif",
      actif: "a une silhouette massive",
      fin: "retrouve une silhouette normale",
    },
  };

  var patternEffetsIndetermine = buildPatternEffets(messageEffetIndetermine);

  function estEffetIndetermine(name) {
    return (patternEffetsIndetermine.test(name));
  }

  function effetIndetermineOfAttribute(attr) {
    var ef = attr.get('name');
    if (ef === undefined || messageEffetIndetermine[ef]) return ef;
    //D'abord on enlève le nom du token 
    var pu = ef.indexOf('_');
    if (pu > 0) {
      ef = ef.substring(0, pu);
      if (messageEffetIndetermine[ef]) return ef;
    }
    error("Impossible de déterminer l'effet correspondant à " + ef, attr);
  }


  function getValeurOfEffet(perso, effet, def, attrDef) {
    var attrsVal = tokenAttribute(perso, effet + "Valeur");
    if (attrsVal.length === 0) {
      if (attrDef) return charAttributeAsInt(perso, attrDef, def);
      return def;
    }
    var res = parseInt(attrsVal[0].get('current'));
    if (isNaN(res)) return def;
    return res;
  }

  //L'argument effet doit être le nom complet, pas la base
  //evt.deletedAttributes doit être défini
  function enleverEffetAttribut(charId, effet, attrName, attribut, evt) {
    var nameWithSave = effet + attribut + attrName.substr(effet.length);
    findObjs({
      _type: 'attribute',
      _characterid: charId,
      name: nameWithSave
    }).
    forEach(function(attrS) {
      evt.deletedAttributes.push(attrS);
      attrS.remove();
    });
  }

  function effetComplet(effet, attrName) {
    if (effet == attrName) return effet;
    var p = attrName.indexOf('(', effet.length - 1);
    if (p > 0) {
      p = attrName.indexOf(')', p);
      if (p > 0) return attrName.substring(0, p + 1);
    }
    return effet;
  }

  function finDEffet(attr, effet, attrName, charId, evt, options) { //L'effet arrive en fin de vie, doit être supprimé
    options = options || {};
    evt.deletedAttributes = evt.deletedAttributes || [];
    var res;
    var newInit = [];
    var efComplet = effetComplet(effet, attrName);
    //Si on a un attrSave, alors on a déjà imprimé le message de fin d'effet
    if (options.attrSave) { //on a un attribut associé à supprimer)
      evt.deletedAttributes.push(options.attrSave);
      options.attrSave.remove();
    } else if (options.gardeAutresAttributs === undefined) { //On cherche si il y en a un
      enleverEffetAttribut(charId, efComplet, attrName, 'SaveParTour', evt);
    }
    switch (effet) {
      case 'agrandissement': //redonner sa taille normale
        getObj('character', charId).get('defaulttoken', function(normalToken) {
          normalToken = JSON.parse(normalToken);
          var largeWidth = normalToken.width + normalToken.width / 2;
          var largeHeight = normalToken.height + normalToken.height / 2;
          iterTokensOfAttribute(charId, options.pageId, effet, attrName, function(token) {
            var width = token.get('width');
            var height = token.get('height');
            affectToken(token, 'width', width, evt);
            token.set('width', normalToken.width);
            affectToken(token, 'height', height, evt);
            token.set('height', normalToken.height);
          }, {
            filterAffected: function(token) {
              if (token.get('width') == largeWidth) return true;
              if (token.get('height') == largeHeight) return true;
              return false;
            }
          });
        });
        break;
      case 'aveugleTemp':
        iterTokensOfAttribute(charId, options.pageId, effet, attrName,
          function(token) {
            setState({
              token: token,
              charId: charId
            }, 'aveugle', false, evt);
          }, {
            tousLesTokens: true
          });
        break;
      case 'ralentiTemp':
        iterTokensOfAttribute(charId, options.pageId, effet, attrName,
          function(token) {
            setState({
              token: token,
              charId: charId
            }, 'ralenti', false, evt);
          }, {
            tousLesTokens: true
          });
        break;
      case 'paralyseTemp':
        iterTokensOfAttribute(charId, options.pageId, effet, attrName,
          function(token) {
            setState({
              token: token,
              charId: charId
            }, 'paralyse', false, evt);
          }, {
            tousLesTokens: true
          });
        break;
      case 'etourdiTemp':
        iterTokensOfAttribute(charId, options.pageId, effet, attrName,
          function(token) {
            setState({
              token: token,
              charId: charId
            }, 'etourdi', false, evt);
          }, {
            tousLesTokens: true
          });
        break;
      case 'peur':
      case 'peurEtourdi':
        iterTokensOfAttribute(charId, options.pageId, effet, attrName,
          function(token) {
            setState({
              token: token,
              charId: charId
            }, 'apeure', false, evt);
          }, {
            tousLesTokens: true
          });
        break;
      case 'ombreMortelle':
      case 'dedoublement':
        iterTokensOfAttribute(charId, options.pageId, effet, attrName, function(token) {
          token.remove();
        });
        break;
      case 'murDeForce':
        iterTokensOfAttribute(charId, options.pageId, effet, attrName, function(token) {
          var attrM = tokenAttribute({
            charId: charId,
            token: token
          }, 'murDeForceId');
          if (attrM.length === 0) return;
          var imageMur = getObj('graphic', attrM[0].get('current'));
          if (imageMur) {
            imageMur.remove();
          }
          attrM[0].remove();
        });
        break;
      case 'regeneration': //faire les soins restants
        var toursRestant = attr.get('current');
        if (toursRestant == 'tourFinal' || isNaN(toursRestant)) break;
        iterTokensOfAttribute(charId, options.pageId, effet, attrName,
          function(token) {
            var perso = {
              token: token,
              charId: charId
            };
            var regen = getValeurOfEffet(perso, 'regeneration', 3);
            var soins = regen * (toursRestant + attributeAsInt(perso, 'regenerationTempeteDeManaIntense', 0));
            soigneToken(perso, soins, evt,
              function(s) {
                options.print = function(m) {}; //Pour ne pas afficher le message final.
                var tempsEffectif = Math.ceil(s / regen);
                sendChar(charId, "récupère encore " + s + " PV en " + tempsEffectif + " tours.");
              });
          });
        break;
      case 'predateurConjure':
      case 'arbreAnime': //effacer le personnage
        //On efface d'abord les attributs et les abilities
        var charAttributes = findObjs({
          _type: 'attribute',
          _characterid: charId
        });
        charAttributes.forEach(
          function(otherAttr) {
            if (otherAttr.id != attr.id) otherAttr.remove();
          }
        );
        var charAbilities = findObjs({
          _type: 'ability',
          _characterid: charId
        });
        charAbilities.forEach(
          function(ab) {
            ab.remove();
          }
        );
        if (effet == 'arbreAnime') {
          iterTokensOfAttribute(charId, options.pageId, effet, attrName,
            function(token) {
              removeFromTurnTracker(token.id, evt);
              setToken(token, 'bar1_link', '', evt);
              setToken(token, 'bar1_value', '', evt);
              setToken(token, 'bar1_max', '', evt);
              setToken(token, 'showplayers_bar1', false, evt);
              setToken(token, 'represents', '', evt);
              setToken(token, 'showname', false, evt);
              setToken(token, 'showplayers_name', false, evt);
              setToken(token, 'name', '', evt);
            });
        } else if (effet == 'predateurConjure') {
          iterTokensOfAttribute(charId, options.pageId, effet, attrName, function(token) {
            token.remove();
          });
        }
        attr.remove();
        if (options.print) options.print(messageEffetTemp[effet].fin);
        else sendChar(charId, 'disparaît');
        var arbreChar = getObj('character', charId);
        if (arbreChar) {
          evt.deletedCharacters = evt.deletedCharacters || [];
          evt.deletedCharacters.push({
            id: charId,
            name: arbreChar.get('name'),
            avatar: arbreChar.get('avatar'),
            attributes: charAttributes,
            abilities: charAbilities
          });
          arbreChar.remove();
        }
        return; //Pas besoin de faire le reste, car plus de perso
      case 'formeDArbre':
        var tokenChange = charIdAttributeAsBool(charId, 'changementDeToken');
        var iterTokOptions = {};
        if (tokenChange) {
          removeTokenAttr({
            charId: charId
          }, 'changementDeToken', evt);
          iterTokOptions.tousLesTokens = true;
        }
        iterTokensOfAttribute(charId, options.pageId, effet, attrName,
          function(token) {
            var perso = {
              token: token,
              charId: charId
            };
            if (tokenChange) {
              var tokenMJ =
                findObjs({
                  _type: 'graphic',
                  _subtype: 'token',
                  _pageid: token.get('pageid'),
                  layer: 'gmlayer',
                  represents: charId,
                  name: token.get('name')
                });
              if (tokenMJ.length === 0) return;
              var nouveauToken = tokenMJ[0];
              setToken(nouveauToken, 'layer', 'objects', evt);
              setToken(nouveauToken, 'left', token.get('left'), evt);
              setToken(nouveauToken, 'top', token.get('top'), evt);
              setToken(nouveauToken, 'width', token.get('width'), evt);
              setToken(nouveauToken, 'height', token.get('height'), evt);
              setToken(nouveauToken, 'rotation', token.get('rotation'), evt);
              setToken(nouveauToken, 'bar2_value', token.get('bar2_value'), evt);
              setToken(nouveauToken, 'aura1_radius', token.get('aura1_radius'), evt);
              setToken(nouveauToken, 'aura1_color', token.get('aura1_color'), evt);
              setToken(nouveauToken, 'aura1_square', token.get('aura1_square'), evt);
              setToken(nouveauToken, 'showplayers_aura1', token.get('showplayers_aura1'), evt);
              setToken(nouveauToken, 'aura2_radius', token.get('aura2_radius'), evt);
              setToken(nouveauToken, 'aura2_color', token.get('aura2_color'), evt);
              setToken(nouveauToken, 'aura2_square', token.get('aura2_square'), evt);
              setToken(nouveauToken, 'showplayers_aura2', token.get('showplayers_aura2'), evt);
              setToken(nouveauToken, 'statusmarkers', token.get('statusmarkers'), evt);
              setToken(nouveauToken, 'light_angle', token.get('light_angle'), evt);
              if (stateCOF.combat) {
                replaceInTurnTracker(token.id, nouveauToken.id, evt);
              }
              res = res || {};
              res.oldTokenId = token.id;
              res.newTokenId = nouveauToken.id;
              res.newToken = nouveauToken;
              token.remove();
              token = nouveauToken;
              perso.token = nouveauToken;
            }
            var apv = tokenAttribute(perso, 'anciensPV');
            if (apv.length > 0) {
              updateCurrentBar(token, 1, apv[0].get('current'), evt, apv[0].get('max'));
              removeTokenAttr(perso, 'anciensPV', evt);
              if (stateCOF.combat) {
                newInit.push({
                  _id: token.id
                });
              }
            }
          },
          iterTokOptions);
        break;
      case 'agitAZeroPV':
        iterTokensOfAttribute(charId, options.pageId, effet, attrName, function(token) {
          var pv = token.get('bar1_value');
          if (pv == 0) { //jshint ignore:line
            mort({
              charId: charId,
              token: token
            }, undefined, evt);
          }
        });
        break;
      default:
    }
    if (options.attrSave === undefined && charId && !getState({
        charId: charId
      }, 'mort')) {
      if (options.print) options.print(messageEffetTemp[effet].fin);
      else sendChar(charId, messageEffetTemp[effet].fin);
    }
    if (options.gardeAutresAttributs === undefined && charId) {
      enleverEffetAttribut(charId, efComplet, attrName, 'Puissant', evt);
      enleverEffetAttribut(charId, efComplet, attrName, 'Valeur', evt);
      enleverEffetAttribut(charId, efComplet, attrName, 'TempeteDeManaIntense', evt);
    }
    evt.deletedAttributes.push(attr);
    attr.remove();
    if (newInit.length > 0) initiative(newInit, evt, true);
    return res;
  }

  function finDEffetDeNom(perso, effet, evt, options) { //Supprime l'effet si présent
    var attrs = tokenAttribute(perso, effet);
    if (attrs.length === 0) return;
    options = options || {};
    options.pageId = options.pageId || perso.token.get('pageid');
    finDEffet(attrs[0], effet, attrs[0].get('name'), perso.charId, evt, options);
  }

  //asynchrone
  // effet est le nom complet de l'effet
  function degatsParTour(charId, pageId, effet, attrName, dmg, type, msg, evt, options, callback) {
    options = options || {};
    if (msg) msg += '. ' + onGenre(charId, 'Il', 'Elle');
    else msg = '';
    var count = -1;
    iterTokensOfAttribute(charId, pageId, effet, attrName,
      function(token, total) {
        if (count < 0) count = total;
        var perso = {
          token: token,
          charId: charId
        };
        var dmgExpr = dmg;
        var tdmi = attributeAsInt(perso, effet + "TempeteDeManaIntense", 0);
        if (dmg.de) {
          if (tdmi) {
            dmgExpr = (tdmi + dmg.nbDe) + 'd' + dmg.de;
            removeTokenAttr(perso, effet + "TempeteDeManaIntense", evt);
          } else dmgExpr = dmg.nbDe + 'd' + dmg.de;
        } else if (dmg.cst) {
          if (tdmi) {
            dmgExpr = dmg.cst * (1 + tdmi);
            removeTokenAttr(perso, effet + "TempeteDeManaIntense", evt);
          } else dmgExpr = dmg.cst;
        } else if (options.dotGen) {
          //alors dmg = '' et type = ''
          var valAttr = tokenAttribute(perso, effet + 'Valeur');
          if (valAttr.length === 0) {
            //Par défaut, 1d6 DM normaux
            dmgExpr = "1d6";
            type = 'normal';
          } else {
            dmgExpr = valAttr[0].get('current');
            type = valAttr[0].get('max');
            if (type === '') type = 'normal';
          }
        }
        sendChat('', "[[" + dmgExpr + "]]", function(res) {
          var rolls = res[0];
          var dmgRoll = rolls.inlinerolls[0];
          var r = {
            total: dmgRoll.results.total,
            type: type,
            display: buildinline(dmgRoll, type)
          };
          dealDamage(perso, r, [], evt, false, options, undefined,
            function(dmgDisplay, dmg) {
              if (dmg > 0)
                sendChar(charId, msg + " subit " + dmgDisplay + " DM");
              count--;
              if (count === 0) callback();
            });
        }); //fin sendChat du jet de dé
      }); //fin iterTokensOfAttribute
  }

  //asynchrone
  function soigneParTour(charId, pageId, effet, attrName, soinsExpr, msg, evt, options, callback) {
    options = options || {};
    msg = msg || '';
    var count = -1;
    iterTokensOfAttribute(charId, pageId, effet, attrName,
      function(token, total) {
        if (count < 0) count = total;
        var perso = {
          token: token,
          charId: charId
        };
        var tdmi = attributeAsInt(perso, effet + "TempeteDeManaIntense", 0);
        if (tdmi) {
          soinsExpr = "(" + soinsExpr + ")*" + (1 + tdmi);
          removeTokenAttr(perso, effet + "TempeteDeManaIntense", evt);
        }
        var localSoinsExpr = soinsExpr;
        if (options.valeur) {
          var attrsVal = tokenAttribute(perso, options.valeur);
          if (attrsVal.length > 0) localSoinsExpr = attrsVal[0].get('current');
        }
        sendChat('', "[[" + localSoinsExpr + "]]", function(res) {
          var rolls = res[0];
          var soinRoll = rolls.inlinerolls[0];
          var soins = soinRoll.results.total;
          var displaySoins = buildinline(soinRoll, 'normal', true);
          soigneToken(perso, soins, evt,
            function(s) {
              if (s < soins) sendChar(charId, "récupère tous ses PV.");
              else sendChar(charId, "récupère " + displaySoins + " PV.");
              count--;
              if (count === 0) callback();
            },
            function() {
              count--;
              if (count === 0) callback();
            });
        }); //fin sendChat du jet de dé
      }); //fin iterTokensOfAttribute
  }

  function nextTurn(cmp) {
    if (!cmp.get('initiativepage')) return;
    var turnOrder = cmp.get('turnorder');
    var pageId = stateCOF.combat_pageid;
    if (pageId === undefined) pageId = cmp.get('playerpageid');
    if (turnOrder === '') return; // nothing in the turn order
    turnOrder = JSON.parse(turnOrder);
    if (turnOrder.length < 1) return; // Juste le compteur de tour
    var evt = {
      type: 'Personnage suivant',
      attributes: [],
      deletedAttributes: []
    };
    var active = turnOrder[0];
    var lastHead = turnOrder.pop();
    turnOrder.unshift(lastHead);
    evt.turnorder = JSON.stringify(turnOrder);
    var attrs = findObjs({
      _type: 'attribute'
    });
    // Si on a changé d'initiative, alors diminue les effets temporaires
    var init = parseInt(active.pr);
    if (active.id == "-1" && active.custom == "Tour") init = 0;
    var count = 0; // pour l'aspect asynchrone des effets temporaires
    if (stateCOF.init > init) {
      var attrsTemp = attrs.filter(function(obj) {
        if (!estEffetTemp(obj.get('name'))) return false;
        var obji = obj.get('max');
        return (init < obji && obji <= stateCOF.init);
      });
      evt.init = stateCOF.init;
      stateCOF.init = init;
      // Boucle sur les effets temps peut être asynchrone à cause des DM
      count = attrsTemp.length;
      attrsTemp.forEach(function(attr) {
        var charId = attr.get('characterid');
        var effet = effetTempOfAttribute(attr);
        if (effet === undefined) {
          //erreur, on stoppe tout
          log(attr);
          count--;
          return;
        }
        var attrName = attr.get('name');
        var v = attr.get('current');
        if (v == 'tourFinal') { //L'effet arrive en fin de vie, doit être supprimé
          var effetFinal = finDEffet(attr, effet, attrName, charId, evt, {
            pageId: pageId
          });
          if (effetFinal && effetFinal.oldTokenId == active.id)
            active.id = effetFinal.newTokenId;
          count--;
        } else { //Effet encore actif
          evt.attributes.push({
            attribute: attr,
            current: v
          });
          if (v > 1) attr.set('current', v - 1);
          else attr.set('current', 'tourFinal');
          switch (effet) { //rien après le switch, donc on sort par un return
            case 'putrefaction': //prend 1d6 DM
              degatsParTour(charId, pageId, effet, attrName, {
                  nbDe: 1,
                  de: 6
                }, 'maladie',
                "pourrit", evt, {
                  magique: true
                },
                function() {
                  count--;
                  if (count === 0) nextTurnOfActive(active, attrs, evt, pageId);
                });
              return;
            case 'asphyxie': //prend 1d6 DM
              degatsParTour(charId, pageId, effet, attrName, {
                  nbDe: 1,
                  de: 6
                }, 'normal',
                "ne peut plus respirer", evt, {
                  asphyxie: true
                },
                function() {
                  count--;
                  if (count === 0) nextTurnOfActive(active, attrs, evt, pageId);
                });
              return;
            case 'saignementsSang': //prend 1d6 DM
              if (charIdAttributeAsBool(charId, 'immuniteSaignement')) {
                count--;
                if (count === 0) nextTurnOfActive(active, attrs, evt, pageId);
                return;
              }
              degatsParTour(charId, pageId, effet, attrName, {
                  nbDe: 1,
                  de: 6
                }, 'normal',
                "saigne par tous les orifices du visage", evt, {
                  magique: true
                },
                function() {
                  count--;
                  if (count === 0) nextTurnOfActive(active, attrs, evt, pageId);
                });
              return;
            case 'armureBrulante': //prend 1d4 DM
              degatsParTour(charId, pageId, effet, attrName, {
                  nbDe: 1,
                  de: 4
                }, 'feu',
                "brûle dans son armure", evt, {},
                function() {
                  count--;
                  if (count === 0) nextTurnOfActive(active, attrs, evt, pageId);
                });
              return;
            case 'nueeDInsectes': //prend 1 DM
              degatsParTour(charId, pageId, effet, attrName, {
                  cst: 1
                }, 'normal',
                "est piqué par les insectes", evt, {},
                function() {
                  count--;
                  if (count === 0) nextTurnOfActive(active, attrs, evt, pageId);
                });
              return;
            case 'armeBrulante': //prend 1 DM
              degatsParTour(charId, pageId, effet, attrName, {
                  cst: 1
                }, 'feu',
                "se brûle avec son arme", evt, {},
                function() {
                  count--;
                  if (count === 0) nextTurnOfActive(active, attrs, evt, pageId);
                });
              return;
            case 'regeneration': //soigne
              soigneParTour(charId, pageId, effet, attrName, 3, "régénère", evt, {
                  valeur: 'regenerationValeur'
                },
                function() {
                  count--;
                  if (count === 0) nextTurnOfActive(active, attrs, evt, pageId);
                });

              return;
            case 'strangulation':
              var nameDureeStrang = 'dureeStrangulation';
              if (effet != attrName) { //concerne un token non lié
                nameDureeStrang += attrName.substring(attrName.indexOf('_'));
              }
              var dureeStrang = findObjs({
                _type: 'attribute',
                _characterid: charId,
                name: nameDureeStrang
              });
              if (dureeStrang.length === 0) {
                var attrDuree = createObj('attribute', {
                  characterid: charId,
                  name: nameDureeStrang,
                  current: 0,
                  max: false
                });
                evt.attributes.push({
                  attribute: attrDuree,
                  current: null
                });
              } else {
                var strangUpdate = dureeStrang[0].get('max');
                if (strangUpdate) { //a été mis à jour il y a au plus 1 tour
                  evt.attributes.push({
                    attribute: dureeStrang[0],
                    current: dureeStrang[0].get('current'),
                    max: strangUpdate
                  });
                  dureeStrang[0].set('max', false);
                } else { //Ça fait trop longtemps, on arrête tout
                  sendChar(charId, messageEffetTemp[effet].fin);
                  attr.set('current', v);
                  evt.attributes.pop(); //On enlève des attributs modifiés pour mettre dans les attribute supprimés.
                  evt.deletedAttributes.push(attr);
                  attr.remove();
                  evt.deletedAttributes.push(dureeStrang[0]);
                  dureeStrang[0].remove();
                }
              }
              count--;
              return;
            case 'dotGen':
              var effetC = effetComplet(effet, attrName);
              degatsParTour(charId, pageId, effetC, attrName, {}, '', "", evt, {
                  dotGen: true
                },
                function() {
                  count--;
                  if (count === 0) nextTurnOfActive(active, attrs, evt, pageId);
                });
              return;
            default:
              count--;
              return;
          }
        }
      }); //fin de la boucle sur tous les attributs d'effets
    }
    if (count === 0) nextTurnOfActive(active, attrs, evt, pageId);
  }

  //Fonction appelée par !cof-tour-suivant
  function tourSuivant(msg) {
    if (!stateCOF.combat) {
      sendPlayer(msg, "Vous n'êtes pas en combat");
      return;
    }
    var cmp = Campaign();
    var turnOrder = cmp.get('turnorder');
    if (turnOrder === '') {
      error("Personne n'est en combat", turnOrder);
      return;
    }
    turnOrder = JSON.parse(turnOrder);
    if (turnOrder.length < 1) {
      error("Personne n'est en combat", turnOrder);
      return;
    }
    var active = turnOrder.shift();
    var persoActif = tokenOfId(active.id);
    if (persoActif === undefined) {
      error("Impossible de trouver le personnage actif", active);
      return;
    }
    if (!peutController(msg, persoActif)) {
      sendPlayer(msg, "Ce n'est pas votre tour (personnage actif : " + persoActif.token.get('name') + ")");
      return;
    }
    turnOrder.push(active);
    if (turnOrder[0].id == "-1" && turnOrder[0].custom == "Tour") {
      //Il faut aussi augmenter la valeur du tour
      var tour = parseInt(turnOrder[0].pr);
      if (isNaN(tour)) {
        error("Tour invalide", turnOrder);
        return;
      }
      turnOrder[0].pr = tour + 1;
    }
    cmp.set('turnorder', JSON.stringify(turnOrder));
    nextTurn(cmp);
  }

  //evt a un champ attributes et un champ deletedAttributes
  function nextTurnOfActive(active, attrs, evt, pageId) {
    if (active.id == "-1" && active.custom == "Tour") {
      var tour = parseInt(active.pr);
      if (isNaN(tour)) {
        error("Tour invalide", active);
        return;
      }
      evt.tour = tour - 1;
      evt.updateNextInitSet = updateNextInitSet;
      active.pr = tour - 1; // préparation au calcul de l'undo
      sendChat("GM", "Début du tour " + tour);
      stateCOF.tour = tour;
      stateCOF.init = 1000;
      // Enlever les bonus d'un tour
      attrs = removeAllAttributes('actionConcertee', evt, attrs);
      attrs = removeAllAttributes('intercepter', evt, attrs);
      attrs = removeAllAttributes('interposer', evt, attrs);
      attrs = removeAllAttributes('exemplaire', evt, attrs);
      attrs = removeAllAttributes('peutEtreDeplace', evt, attrs);
      attrs = removeAllAttributes('attaqueMalgreMenace', evt, attrs);
      attrs = removeAllAttributes('ripostesDuTour', evt, attrs);
      resetAttr(attrs, 'attaqueEnTraitre', evt);
      // Pour défaut dans la cuirasse, on diminue si la valeur est 2, et on supprime si c'est 1
      var defautsDansLaCuirasse = allAttributesNamed(attrs, 'defautDansLaCuirasse');
      defautsDansLaCuirasse.forEach(function(attr) {
        if (attr.get('current') < 2) {
          if (evt.deletedAttributes) evt.deletedAttributes.push(attr);
          else evt.deletedAttributes = [attr];
          attr.remove();
        } else {
          var prevAttr = {
            attribute: attr,
            current: 2
          };
          evt.attributes.push(prevAttr);
          attr.set('current', 1);
        }
      });
      // Pour la feinte, on augmente la valeur, et on supprime si la valeur est 2
      var feinte = allAttributesNamed(attrs, 'feinte');
      feinte.forEach(function(attr) {
        var valFeinte = parseInt(attr.get('current'));
        if (isNaN(valFeinte) || valFeinte > 0) {
          evt.deletedAttributes.push(attr);
          attr.remove();
        } else {
          var prevAttr = {
            attribute: attr,
            current: 0
          };
          evt.attributes.push(prevAttr);
          attr.set('current', 1);
        }
      });
      // nouveau tour : enlever le statut surpris
      // et faire les actions de début de tour
      var selected = [];
      updateNextInitSet.forEach(function(id) {
        selected.push({
          _id: id
        });
      });
      findObjs({
        _type: 'graphic',
        _subtype: 'token',
        _pageid: pageId
      }).forEach(function(tok) {
        var charId = tok.get('represents');
        if (charId === '') return;
        var perso = {
          token: tok,
          charId: charId
        };
        if (getState(perso, 'surpris')) { //surprise
          setState(perso, 'surpris', false, {});
          selected.push({
            _id: tok.id
          });
        }
        var enflammeAttr = tokenAttribute(perso, 'enflamme');
        if (enflammeAttr.length > 0) {
          var enflamme = parseInt(enflammeAttr[0].get('current'));
          // Pour ne pas faire les dégâts plusieurs fois (plusieurs tokens pour un même personnage), on utilise la valeur max de l'attribut
          var dernierTourEnflamme = parseInt(enflammeAttr[0].get('max'));
          if ((isNaN(dernierTourEnflamme) || dernierTourEnflamme < tour) &&
            !isNaN(enflamme) && enflamme > 0) {
            var d6Enflamme = randomInteger(6);
            var feu = d6Enflamme + enflamme - 1;
            var dmg = {
              type: 'feu',
              total: feu,
              display: feu
            };
            feu = dealDamage(perso, dmg, [], evt);
            sendChar(charId, " est en flamme ! " +
              onGenre(charId, 'Il', 'Elle') + " subit " + feu + " DM");
            if (d6Enflamme < 3) {
              sendChar(charId, " les flammes s'éteignent");
              removeTokenAttr(perso, 'enflamme', evt);
            } else {
              enflammeAttr[0].set('max', tour);
            }
          }
        }
      });
      setActiveToken(undefined, evt);
      initiative(selected, evt, true); // met Tour à la fin et retrie
      updateNextInitSet = new Set();
      // Saves à faire à la fin de chaque tour
      var attrsSave = attrs.filter(function(attr) {
        var attrName = attr.get('name');
        var indexSave = attrName.indexOf('SaveParTour');
        if (indexSave < 0) return false;
        return estEffetTemp(attrName.substring(0, indexSave));
      });
      //Les saves sont asynchrones
      var count = attrsSave.length;
      attrsSave.forEach(function(attr) {
        var attrName = attr.get('name');
        var carac = attr.get('current');
        if (!isCarac(carac)) {
          error("Save par tour " + attrName + " mal formé", carac);
          count--;
          if (count === 0) addEvent(evt);
          return;
        }
        var seuil = parseInt(attr.get('max'));
        if (isNaN(seuil)) {
          error("Save par tour " + attrName + " mal formé", seuil);
          count--;
          if (count === 0) addEvent(evt);
          return;
        }
        var charId = attr.get('characterid');
        var indexSave = attrName.indexOf('SaveParTour');
        var effetC = attrName.substring(0, indexSave);
        attrName = effetC + attrName.substr(indexSave + 11);
        var token;
        iterTokensOfAttribute(charId, pageId, effetC, attrName, function(tok) {
          if (token === undefined) token = tok;
        });
        if (token === undefined) {
          log("Pas de token pour le save " + attrName);
          count--;
          if (count === 0) addEvent(evt);
          return;
        }
        var perso = {
          token: token,
          charId: charId
        };
        if (getState(perso, 'mort')) {
          count--;
          if (count === 0) addEvent(evt);
          return;
        }
        var attrEffet = findObjs({
          _type: 'attribute',
          _characterid: charId,
          name: attrName
        });
        if (attrEffet === undefined || attrEffet.length === 0) {
          error("Save sans effet temporaire " + attrName, attr);
          attr.remove();
          count--;
          if (count === 0) addEvent(evt);
          return;
        }
        attrEffet = attrEffet[0];
        var expliquer = function(msg) {
          sendChar(charId, msg);
        };
        var msgPour = " pour ne plus être sous l'effet de ";
        if (effetC.startsWith('dotGen('))
          msgPour += effetC.substring(7, effetC.indexOf(')'));
        else msgPour += effetC;
        var sujet = onGenre(charId, 'il', 'elle');
        var met = messageOfEffetTemp(effetC);
        var msgReussite = ", " + sujet + " " + met.fin;
        var msgRate = ", " + sujet + " " + met.actif;
        var saveOpts = {
          msgPour: msgPour,
          msgReussite: msgReussite,
          msgRate: msgRate
        };
        save({
            carac: carac,
            seuil: seuil
          }, perso, expliquer, saveOpts, evt,
          function(reussite) { //asynchrone
            if (reussite) {
              finDEffet(attrEffet, effetC, attrName, charId, evt, {
                attrSave: attr,
                pageId: pageId
              });
            }
            count--;
            if (count === 0) addEvent(evt);
          });
      }); //fin boucle attrSave
    } else { // change the active token
      setActiveToken(active.id, evt);
    }
    addEvent(evt);
  }

  function destroyToken(token) { //to remove unused local attributes
    var charId = token.get('represeernts');
    if (charId === "") return;
    if (token.get('bar1_link') !== "") return;
    var endName = "_" + token.get('name');
    var tokAttr = findObjs({
      _type: 'attribute',
      _characterid: charId
    });
    tokAttr = tokAttr.filter(function(obj) {
      return obj.get('name').endsWith(endName);
    });
    if (tokAttr.length > 0) {
      log("Removing token local attributes");
      log(tokAttr);
      tokAttr.forEach(function(attr) {
        attr.remove();
      });
    }
  }

  function nePeutPasBouger(perso) {
    if (attributeAsBool(perso, 'peutEtreDeplace')) return false;
    if (isActive(perso)) {
      if (getState(perso, 'immobilise')) return true;
      if (attributeAsBool(perso, 'bloqueManoeuvre')) return true;
      if (attributeAsBool(perso, 'enveloppePar')) return true;
      return false;
    }
    return true;
  }

  function permettreDeplacement(msg) {
    getSelected(msg, function(selected) {
      var evt = {
        type: 'Permettre le déplacement pour un tour'
      };
      iterSelected(selected, function(perso) {
        setTokenAttr(perso, 'peutEtreDeplace', true, evt);
      });
      addEvent(evt);
    });
  }

  //Réagit au déplacement manuel d'un token.
  function moveToken(token, prev) {
    var charId = token.get('represents');
    if (charId === '') return;
    var perso = {
      token: token,
      charId: charId
    };
    var pageId = token.get('pageid');
    var x = token.get('left');
    var y = token.get('top');
    var deplacement = prev && (prev.left != x || prev.top != y);
    if (deplacement) {
      if (nePeutPasBouger(perso)) {
        sendChar(charId, "ne peut pas se déplacer.");
        sendChat('COF', "/w GM " +
          '<a href="!cof-deplacer-token ' + x + ' ' + y + ' --target ' + token.id + '">Déplacer </a>' +
          '<a href="!cof-permettre-deplacement --target ' + token.id + '">Décoincer</a>');
        token.set('left', prev.left);
        token.set('top', prev.top);
        return;
      } else {
        //On déplace les tokens de lumière, si il y en a
        var attrLumiere = tokenAttribute(perso, 'lumiere');
        attrLumiere.forEach(function(al) {
          var lumId = al.get('max');
          if (lumId == 'surToken') return;
          var lumiere = getObj('graphic', lumId);
          if (lumiere && lumiere.get('pageid') != pageId) lumiere = undefined;
          if (lumiere === undefined) {
            var tokensLumiere = findObjs({
              _type: 'graphic',
              _pageid: pageId,
              layer: 'walls',
              name: al.get('current')
            });
            if (tokensLumiere.length === 0) {
              log("Pas de token pour la lumière " + al.get('current'));
              al.remove();
              return;
            }
            lumiere = tokensLumiere.shift();
            if (tokensLumiere.length > 0) {
              //On cherche le token le plus proche de la position précédente
              var d =
                VecMath.length(
                  VecMath.vec([lumiere.get('left'), lumiere.get('top')], [prev.left, prev.top]));
              tokensLumiere.forEach(function(tl) {
                var d2 =
                  VecMath.length(
                    VecMath.vec([tl.get('left'), tl.get('top')], [prev.left, prev.top]));
                if (d2 < d) {
                  d = d2;
                  lumiere = tl;
                }
              });
            }
          }
          if (lumiere === undefined) {
            log("Pas de token pour la lumière " + al.get('current'));
            al.remove();
            return;
          }
          lumiere.set('left', x);
          lumiere.set('top', y);
        });
      }
    }
    //On regarde d'abord si perso est sur une monture
    var attr = tokenAttribute(perso, 'monteSur');
    if (attr.length > 0) {
      if (deplacement) {
        attr[0].remove();
        var monture = tokenOfId(attr[0].get('current'), attr[0].get('max'), pageId);
        if (monture === undefined) {
          sendChar(charId, "descend de sa monture");
          return;
        }
        sendChar(charId, "descend de " + monture.token.get('name'));
        removeTokenAttr(monture, 'estMontePar');
        removeTokenAttr(monture, 'positionSurMonture');
      }
      return;
    }
    //si non, perso est peut-être une monture
    attr = tokenAttribute(perso, 'estMontePar');
    attr.forEach(function(a) {
      var cavalier = tokenOfId(a.get('current'), a.get('max'), pageId);
      if (cavalier === undefined) {
        a.remove();
        return;
      }
      var position = tokenAttribute(perso, 'positionSurMonture');
      if (position.length > 0) {
        var dx = parseInt(position[0].get('current'));
        var dy = parseInt(position[0].get('max'));
        if (!(isNaN(dx) || isNaN(dy))) {
          x += dx;
          y += dy;
        }
      }
      cavalier.token.set('left', x);
      cavalier.token.set('top', y);
      cavalier.token.set('rotation', token.get('rotation') + attributeAsInt(perso, 'directionSurMonture', 0));
    });
    attr = tokenAttribute(perso, 'enveloppe');
    attr.forEach(function(a) {
      var cible = tokenOfIdName(a.get('current'), pageId);
      if (cible === undefined) {
        a.remove();
        return;
      }
      cible.token.set('left', x);
      cible.token.set('top', y);
    });
  }

  function deplacerToken(msg) {
    var cmd = msg.content.split(' ');
    if (cmd.length < 3) {
      error("Il manque un argument à !cof-deplacer-token", cmd);
      return;
    }
    getSelected(msg, function(selected) {
      if (selected.length === 0) {
        error("Il faut sélectionner un token", cmd);
        return;
      }
      if (selected.length > 1) {
        error("Déplacement de plusieurs tokens au même endroit", selected);
        return;
      }
      iterSelected(selected, function(perso) {
        perso.token.set('left', cmd[1]);
        perso.token.set('top', cmd[2]);
        moveToken(perso.token);
      });
    });
  }

  //Si le token représente un personnage et avec la barre de vie non liée, 
  // assure un nom unique en ajoutant un numéro
  // On en profite aussi pour mettre certaines valeurs par défaut
  function renameToken(token, tokenName) {
    var charId = token.get('represents');
    if (charId === undefined || charId === '') return;
    var perso = {
      token: token,
      tokName: tokenName,
      charId: charId
    };
    //Vision
    var visionNoir = charAttributeAsInt(perso, 'visionDansLeNoir', 0);
    if (visionNoir > 0) {
      token.set('light_radius', visionNoir);
      token.set('light_dimradius', -1);
      token.set('light_otherplayers', false);
      token.set('light_hassight', true);
      token.set('light_angle', 360);
    }
    if (token.get('bar1_link') !== '') return;
    var copyOf = 0;
    var tokenBaseName = tokenName;
    if (tokenBaseName.includes('%%NUMBERED%%')) {
      if (typeof TokenNameNumber !== 'undefined') return; //On laisse tokenNameNumber gérer ça
      tokenBaseName = tokenBaseName.replace('%%NUMBERED%%', '');
    } else {
      // On regarde si le nom se termine par un entier
      var lastSpace = tokenBaseName.lastIndexOf(' ');
      if (lastSpace > 0) {
        copyOf = +tokenBaseName.substring(lastSpace + 1);
        if (isNaN(copyOf)) copyOf = 0;
        else tokenBaseName = tokenBaseName.substring(0, lastSpace);
      }
    }
    var otherTokens = findObjs({
      _type: 'graphic',
      //_pageid: token.get('pageid'),
      represents: charId
    });
    otherTokens = otherTokens.filter(function(tok) {
      var pid = tok.get('pageid');
      var page = getObj('page', pid);
      if (page) {
        if (page.get('archived')) return false;
        return true;
      }
      return false;
    });
    var numero = 1;
    var nePasModifier = false;
    if (typeof TokenNameNumber !== 'undefined' && tokenBaseName.length > 0) {
      if (!isNaN(tokenBaseName[tokenBaseName.length - 1]))
        nePasModifier = true;
    }
    var pageId = token.get('pageid');
    otherTokens.forEach(function(ot) {
      if (ot.id == token.id) return;
      var name = ot.get('name');
      if (nePasModifier && name == tokenBaseName) nePasModifier = false;
      if (name.startsWith(tokenBaseName)) {
        var suffixe = name.replace(tokenBaseName + ' ', '');
        if (isNaN(suffixe)) return;
        var n = parseInt(suffixe);
        if (n == copyOf) {
          if (ot.get('pageid') == pageId) copyOf = 0;
        }
        if (n >= numero) numero = n + 1;
      }
    });
    if (nePasModifier || copyOf > 0) return;
    token.set('name', tokenBaseName + ' ' + numero);
  }

  function addToken(token, nb) {
    var tokenName = token.get('name');
    //La plupart du temps, il faut attendre un peu que le nom soit affecté
    if (tokenName !== '') {
      renameToken(token, tokenName);
      return;
    }
    nb = nb || 1;
    if (nb > 10) return; //Tant pis, peut-être que le nom est vide
    _.delay(function() {
      addToken(token, nb + 1);
    }, 50);
  }

  return {
    apiCommand: apiCommand,
    nextTurn: nextTurn,
    destroyToken: destroyToken,
    moveToken: moveToken,
    changeHandout: changeHandout,
    addToken: addToken,
    setStateCOF: setStateCOF,
  };

}();

on("change:handout", function(obj, prev) {
  COFantasy.changeHandout(obj, prev);
});

on("destroy:handout", function(prev) {
  COFantasy.changeHandout(undefined, prev);
});

on("ready", function() {
  var script_version = "1.11";
  COF_loaded = true;
  on('add:token', COFantasy.addToken);
  state.COFantasy = state.COFantasy || {
    combat: false,
    tour: 0,
    init: 1000,
    eventId: 0,
    version: script_version,
  };
  COFantasy.setStateCOF();
  if (state.COFantasy.version === undefined) {
    state.COFantasy.eventId = 0;
  }
  var handout = findObjs({
    _type: 'handout'
  });
  if (state.COFantasy.version < 1.0) {
    log("Mise à jour des attributs et macros vers la version 1.0");
    //Mise à jour des effets temporaires avec _
    var strReg = "(rayon_affaiblissant|peau_d_ecorce|chant_des_heros|image_decalee|a_couvert|sous_tension|forgeron_|armeEnflammee)";
    var regName = new RegExp("^" + strReg);
    var regText = new RegExp(strReg);
    var attrs = findObjs({
      _type: 'attribute',
    });
    attrs.forEach(function(attr) {
      var attrName = attr.get('name');
      if (regName.test(attrName)) {
        attrName = attrName.replace(/rayon_affaiblissant/, 'rayonAffaiblissant');
        attrName = attrName.replace(/peau_d_ecorce/, 'peauDEcorce');
        attrName = attrName.replace(/chant_des_heros/, 'chantDesHeros');
        attrName = attrName.replace(/image_decalee/, 'imageDecalee');
        attrName = attrName.replace(/a_couvert/, 'aCouvert');
        attrName = attrName.replace(/sous_tension/, 'sousTension');
        attrName = attrName.replace(/forgeron_([^_\s)]*)/, 'forgeron($1)');
        attrName = attrName.replace(/armeEnflammee([^_\s)]*)/, 'armeEnflammee($1)');
        attr.set('name', attrName);
      }
      //Pour les consommables, il faut aussi changer le champ max;
      var attrMax = attr.get('max');
      if (regText.test(attrMax)) {
        attrMax = attrMax.replace(/rayon_affaiblissant/g, 'rayonAffaiblissant');
        attrMax = attrMax.replace(/peau_d_ecorce/g, 'peauDEcorce');
        attrMax = attrMax.replace(/chant_des_heros/g, 'chantDesHeros');
        attrMax = attrMax.replace(/image_decalee/g, 'imageDecalee');
        attrMax = attrMax.replace(/a_couvert/g, 'aCouvert');
        attrMax = attrMax.replace(/sous_tension/g, 'sousTension');
        attrMax = attrMax.replace(/forgeron_([^_\s)]*)/g, 'forgeron($1)');
        attrMax = attrMax.replace(/armeEnflammee([^_\s)]*)/g, 'armeEnflammee($1)');
        attr.set('max', attrMax);
      }
    });
    var macros = findObjs({
      _type: 'macro'
    }).concat(findObjs({
      _type: 'ability'
    }));
    macros.forEach(function(m) {
      var action = m.get('action');
      if (regText.test(action)) {
        action = action.replace(/rayon_affaiblissant/g, 'rayonAffaiblissant');
        action = action.replace(/peau_d_ecorce/g, 'peauDEcorce');
        action = action.replace(/chant_des_heros/g, 'chantDesHeros');
        action = action.replace(/image_decalee/g, 'imageDecalee');
        action = action.replace(/a_couvert/g, 'aCouvert');
        action = action.replace(/sous_tension/g, 'sousTension');
        action = action.replace(/forgeron_([^_\s)]*)/g, 'forgeron($1)');
        action = action.replace(/armeEnflammee([^_\s)]*)/g, 'armeEnflammee($1)');
        m.set('action', action);
      }
    });
    log("Mise à jour effectuée.");
  }
  state.COFantasy.version = script_version;
  handout.forEach(function(hand) {
    COFantasy.changeHandout(hand);
  });
  log("COFantasy " + script_version + " loaded");
});

on("chat:message", function(msg) {
  "use strict";
  if (COF_loaded && msg.type == "api" && msg.content.startsWith('!cof-'))
    COFantasy.apiCommand(msg);
});

on("change:campaign:turnorder", COFantasy.nextTurn);
on("destroy:token", COFantasy.destroyToken);
on("change:token:left", COFantasy.moveToken);
on("change:token:top", COFantasy.moveToken);
on("change:token:rotation", COFantasy.moveToken);
