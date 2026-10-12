const express = require("express");
const cors    = require("cors");
const axios   = require("axios");
const { InfluxDB, Point } = require("@influxdata/influxdb-client");

const app = express();
app.use(cors());
app.use(express.json());

// ========== INFLUXDB ==========
const INFLUX_URL    = process.env.INFLUX_URL;
const INFLUX_TOKEN  = process.env.INFLUX_TOKEN;
const INFLUX_ORG    = process.env.INFLUX_ORG;
const INFLUX_BUCKET = process.env.INFLUX_BUCKET;

if (!INFLUX_TOKEN || !INFLUX_URL || !INFLUX_ORG || !INFLUX_BUCKET) {
    console.error("❌ ERREUR: Variables InfluxDB manquantes. Vérifiez votre fichier .env");
    process.exit(1);
}

const influxDB = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });
const queryApi = influxDB.getQueryApi(INFLUX_ORG);
const writeApi = influxDB.getWriteApi(INFLUX_ORG, INFLUX_BUCKET);

const mego4_MEASUREMENT = "mego4";

// ========== CONTRÔLEURS mE180 ==========
// ✅ Chaque contrôleur a sa propre IP, son ID, son tag "Device" dans InfluxDB
// (mego4) et son propre état (config + compteurs). Le contrôleur 2 n'est
// activé que si MESSE_IP_2 et MESSE_ID_2 sont définis dans le .env : sans eux,
// le serveur fonctionne exactement comme avant, avec un seul contrôleur.
//
//   .env :
//     MESSE_IP=192.168.1.7      MESSE_ID=51105      MEGO4_DEVICE=mE180
//     MESSE_IP_2=192.168.1.8    MESSE_ID_2=xxxxx    MEGO4_DEVICE_2=mE180_2
const CONTROLLERS = {};

function addController(num, ip, id, device, label) {
    if (!ip || !id) return;
    CONTROLLERS[num] = {
        num,
        ip,
        id,
        device: device,
        label:  label || `Controller ${num}`,
        channelConfig: {},
        energyConfig:  {},
    };
}

addController("1", process.env.MESSE_IP,   process.env.MESSE_ID,   process.env.MEGO4_DEVICE   || "mE180",   process.env.MESSE_LABEL);
addController("2", process.env.MESSE_IP_2, process.env.MESSE_ID_2, process.env.MEGO4_DEVICE_2 || "mE180_2", process.env.MESSE_LABEL_2);

if (!CONTROLLERS["1"]) {
    console.error("❌ ERREUR: Variables Messkoffer manquantes (MESSE_IP / MESSE_ID). Vérifiez votre fichier .env");
    process.exit(1);
}

// ✅ Retrouve le contrôleur demandé via ?controller=1|2 (1 par défaut).
// Renvoie null (et répond 400) si le contrôleur n'existe pas.
function getCtrl(req, res) {
    const num  = String(req.query.controller || req.body?.controller || "1");
    const ctrl = CONTROLLERS[num];
    if (!ctrl) {
        res.status(400).json({ error: `Unbekannter Controller: ${num}` });
        return null;
    }
    return ctrl;
}

// ========== KANÄLE ==========
// CH1 a..f (phase L1), CH2 g..l (phase L2), CH3 m..r (phase L3).
// L'ORDRE correspond à la position 1..18 des CGI Messkoffer.
const channelsList = [
    "CH1 a", "CH1 b", "CH1 c", "CH1 d", "CH1 e", "CH1 f",
    "CH2 g", "CH2 h", "CH2 i", "CH2 j", "CH2 k", "CH2 l",
    "CH3 m", "CH3 n", "CH3 o", "CH3 p", "CH3 q", "CH3 r"
];

function getChannelNumber(ch) {
    const idx = channelsList.indexOf(ch);
    return idx === -1 ? null : idx + 1;
}

// Canaux avec correction ×10 (sauf CosinusPhi et Energie) : CGI 5, 6, 11, 12, 17, 18
const CHANNELS_X10 = [5, 6, 11, 12, 17, 18].map(num => channelsList[num - 1]);

function applyX10IfNeeded(ch, value) {
    if (value === null || value === undefined || isNaN(value)) return value;
    return CHANNELS_X10.includes(ch) ? value * 10 : value;
}

// ========== ENCODAGE MESSKOFFER (Latin1 / Windows-1252) ==========
function decodeMesskofferText(raw) {
    if (typeof raw !== "string") return raw;
    try {
        const bytes = [];
        let i = 0;
        while (i < raw.length) {
            if (raw[i] === "%" && i + 2 < raw.length) {
                bytes.push(parseInt(raw.substr(i + 1, 2), 16));
                i += 3;
            } else if (raw[i] === "+") {
                bytes.push(0x20);
                i++;
            } else {
                bytes.push(raw.charCodeAt(i));
                i++;
            }
        }
        return Buffer.from(bytes).toString("latin1");
    } catch {
        return raw;
    }
}

function encodeMesskofferText(str) {
    if (typeof str !== "string") return "";
    let result = "";
    for (const ch of str) {
        const code = ch.codePointAt(0);
        if (/[A-Za-z0-9\-_.~]/.test(ch)) {
            result += ch;
        } else if (code <= 0xFF) {
            result += "%" + code.toString(16).padStart(2, "0").toUpperCase();
        } else {
            result += encodeURIComponent(ch);
        }
    }
    return result;
}

// ========== KONFIGURATION (par contrôleur) ==========
function getDefaultHoechstwert(ch) {
    return ch === "CH1 a" || ch === "CH2 g" || ch === "CH3 m" ? 64 : 32;
}

function initConfig(ctrl) {
    for (const ch of channelsList) {
        ctrl.channelConfig[ch] = {
            label:       ch,
            schwellwert: 0,
            hoechstwert: getDefaultHoechstwert(ch),
            updatedAt:   0
        };
    }
}

function initEnergyConfig(ctrl) {
    for (const ch of channelsList) {
        ctrl.energyConfig[ch] = { temporary: 0, updatedAt: 0 };
    }
}

Object.values(CONTROLLERS).forEach(ctrl => { initConfig(ctrl); initEnergyConfig(ctrl); });

// ========== MESSKOFFER CGI HELPERS (par contrôleur) ==========

async function getLabelsFromMesskoffer(ctrl) {
    const url = `http://${ctrl.ip}/get_sensor_config.cgi?id=${ctrl.id}&sensor=ch&field=label`;
    try {
        const res   = await axios.get(url, { timeout: 5000 });
        const raw   = res.data;
        const parts = typeof raw === "string"
            ? raw.split(";").map(v => decodeMesskofferText(v))
            : [];
        const result = {};
        for (let i = 0; i < 18; i++) {
            result[channelsList[i]] = (parts[i] !== undefined && parts[i] !== "") ? parts[i] : channelsList[i];
        }
        return result;
    } catch (err) {
        console.error(`[${ctrl.label}] Fehler Labels:`, err.message);
        return null;
    }
}

async function getScaleendFromMesskoffer(ctrl) {
    const url = `http://${ctrl.ip}/get_sensor_config.cgi?id=${ctrl.id}&sensor=ch&field=scaleend`;
    try {
        const res   = await axios.get(url, { timeout: 5000 });
        const parts = typeof res.data === "string" ? res.data.split(";") : [];
        const result = {};
        for (let i = 0; i < 18; i++) {
            const val = parseFloat(parts[i]);
            result[channelsList[i]] = !isNaN(val) ? val : 32;
        }
        return result;
    } catch (err) {
        console.error(`[${ctrl.label}] Fehler Scaleend:`, err.message);
        return null;
    }
}

async function getThresholdFromMesskoffer(ctrl) {
    const url = `http://${ctrl.ip}/get_sensor_config.cgi?id=${ctrl.id}&sensor=ch&field=threshold`;
    try {
        const res   = await axios.get(url, { timeout: 5000 });
        const parts = typeof res.data === "string" ? res.data.split(";") : [];
        const result = {};
        for (let i = 0; i < 18; i++) {
            const val = parseFloat(parts[i]);
            result[channelsList[i]] = !isNaN(val) ? val / 1000 : 0;
        }
        return result;
    } catch (err) {
        console.error(`[${ctrl.label}] Fehler Threshold:`, err.message);
        return null;
    }
}

async function setLabelToMesskoffer(ctrl, channelNum, label) {
    const idx = channelNum - 1;
    const url = `http://${ctrl.ip}/set_sensor_config.cgi?id=${ctrl.id}&sensor=ch&label${idx}=${encodeMesskofferText(label)}`;
    try {
        await axios.get(url, { timeout: 3000 });
        return true;
    } catch (err) {
        console.error(`[${ctrl.label}] Fehler label${idx}:`, err.message);
        return false;
    }
}

async function setScaleendToMesskoffer(ctrl, channelNum, value) {
    const idx = channelNum - 1;
    const url = `http://${ctrl.ip}/set_sensor_config.cgi?id=${ctrl.id}&sensor=ch&scaleend${idx}=${value}`;
    try {
        await axios.get(url, { timeout: 3000 });
        return true;
    } catch (err) {
        console.error(`[${ctrl.label}] Fehler scaleend${idx}:`, err.message);
        return false;
    }
}

async function setThresholdToMesskoffer(ctrl, channelNum, valueAmps) {
    const idx       = channelNum - 1;
    const threshVal = Math.round(valueAmps * 1000);
    const url = `http://${ctrl.ip}/set_sensor_config.cgi?id=${ctrl.id}&sensor=ch&threshold${idx}=${threshVal}`;
    try {
        await axios.get(url, { timeout: 3000 });
        return true;
    } catch (err) {
        console.error(`[${ctrl.label}] Fehler threshold${idx}:`, err.message);
        return false;
    }
}

async function getEnergiesFromMesskoffer(ctrl) {
    const url = `http://${ctrl.ip}/get_energy_values.cgi?id=${ctrl.id}`;
    try {
        const res = await axios.get(url, { timeout: 5000 });
        const raw = res.data;
        const temporary = {};
        if (typeof raw === "string") {
            const values = raw.split(";").map(v => parseFloat(v));
            // Index 0 = compteur d'inscription, 1-18 = cumulées (ignorées),
            // 19-36 = énergies temporaires des 18 canaux.
            for (let i = 0; i < 18; i++) {
                temporary[channelsList[i]] = (values[19 + i] || 0) / 10000;
            }
        }
        return { temporary };
    } catch (err) {
        console.error(`[${ctrl.label}] Fehler Energies:`, err.message);
        return { temporary: {} };
    }
}

async function setEnergyToMesskoffer(ctrl, channelNum, value) {
    const messeValue = Math.round(value * 10000);
    const url = `http://${ctrl.ip}/em_set_counters.cgi?id=${ctrl.id}&channel=${channelNum}&kwh=${messeValue}`;
    try {
        console.log(`[${ctrl.label} Energy] SET ch${channelNum}=${value}kWh (${messeValue})`);
        await axios.get(url, { timeout: 3000 });
        return true;
    } catch (err) {
        console.error(`[${ctrl.label} Energy] Fehler ch${channelNum}:`, err.message);
        return false;
    }
}

async function getVoltagesFromMesskoffer(ctrl) {
    const url      = `http://${ctrl.ip}/get_live_values.cgi?id=${ctrl.id}&ch=18`;
    const response = await axios.get(url, { timeout: 5000 });
    const values   = typeof response.data === "string"
        ? response.data.split(";").map(v => parseFloat(v.trim()))
        : [];
    return {
        1: !isNaN(values[1]) ? values[1] / 100 : 0,
        2: !isNaN(values[2]) ? values[2] / 100 : 0,
        3: !isNaN(values[3]) ? values[3] / 100 : 0
    };
}

// ========== INIT CONFIG DEPUIS MESSKOFFER (avec retry, par contrôleur) ==========
// Le contrôleur peut démarrer plus lentement que le conteneur : on réessaie
// jusqu'au succès. Chaque contrôleur a sa propre boucle, indépendante : si le
// n°2 est éteint, le n°1 fonctionne normalement.
async function initConfigFromMesskoffer(ctrl, retryDelayMs = 3000, maxAttempts = 0) {
    let attempt = 0;
    while (true) {
        attempt++;
        const [labels, scaleends, thresholds] = await Promise.all([
            getLabelsFromMesskoffer(ctrl),
            getScaleendFromMesskoffer(ctrl),
            getThresholdFromMesskoffer(ctrl)
        ]);

        if (scaleends !== null) {
            for (const ch of channelsList) {
                ctrl.channelConfig[ch] = {
                    label:       labels?.[ch]     || ch,
                    hoechstwert: scaleends?.[ch]  || getDefaultHoechstwert(ch),
                    schwellwert: thresholds?.[ch] || 0,
                    updatedAt:   Date.now()
                };
            }
            console.log(`[${ctrl.label}] Konfiguration geladen (Versuch ${attempt})`);
            return;
        }

        console.warn(`[${ctrl.label}] nicht erreichbar (Versuch ${attempt}), retry in ${retryDelayMs}ms...`);

        if (maxAttempts > 0 && attempt >= maxAttempts) {
            console.error(`[${ctrl.label}] Aufgegeben nach ${attempt} Versuchen — Default-Werte`);
            initConfig(ctrl);
            return;
        }

        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
}

Object.values(CONTROLLERS).forEach(ctrl => initConfigFromMesskoffer(ctrl));

const ENERGY_EPSILON = 1e-6;
const hasEnergyChanged = (a, b) => Math.abs((a ?? 0) - (b ?? 0)) > ENERGY_EPSILON;

// ========== HEALTHCHECK (Docker) ==========
// ✅ OK dès que le contrôleur 1 est prêt — un contrôleur 2 éteint ne doit pas
// faire redémarrer le conteneur.
app.get("/health", (req, res) => {
    const configOk = Object.values(CONTROLLERS["1"].channelConfig).some(c => c.updatedAt > 0);
    res.status(configOk ? 200 : 503).send(configOk ? "ok" : "messkoffer not ready");
});

// ========== LISTE DES CONTRÔLEURS ==========
// Utilisée par le frontend pour afficher (ou non) le sélecteur de contrôleur.
app.get("/controllers", (req, res) => {
    res.json(Object.values(CONTROLLERS).map(c => ({
        num:   c.num,
        label: c.label,
        ip:    c.ip,
        ready: Object.values(c.channelConfig).some(cfg => cfg.updatedAt > 0)
    })));
});

// ========== ROUTES MESSKOFFER DIREKT ==========

app.get("/messkoffer/labels", async (req, res) => {
    const ctrl = getCtrl(req, res); if (!ctrl) return;
    const labels = await getLabelsFromMesskoffer(ctrl);
    if (!labels) return res.status(500).json({ error: "Messkoffer nicht erreichbar" });
    res.json(labels);
});

app.get("/messkoffer/scaleend", async (req, res) => {
    const ctrl = getCtrl(req, res); if (!ctrl) return;
    const scaleends = await getScaleendFromMesskoffer(ctrl);
    if (!scaleends) return res.status(500).json({ error: "Messkoffer nicht erreichbar" });
    res.json(scaleends);
});

app.get("/messkoffer/threshold", async (req, res) => {
    const ctrl = getCtrl(req, res); if (!ctrl) return;
    const thresholds = await getThresholdFromMesskoffer(ctrl);
    if (!thresholds) return res.status(500).json({ error: "Messkoffer nicht erreichbar" });
    res.json(thresholds);
});

app.post("/messkoffer/reload", async (req, res) => {
    const ctrl = getCtrl(req, res); if (!ctrl) return;
    await initConfigFromMesskoffer(ctrl, 3000, 1);
    res.json({ success: true, config: ctrl.channelConfig });
});

// ========== ROUTES CONFIG ==========

app.get("/config", (req, res) => {
    const ctrl = getCtrl(req, res); if (!ctrl) return;
    try {
        const result = {};
        for (const ch of channelsList) {
            result[ch] = {
                label:       ctrl.channelConfig[ch]?.label       || ch,
                schwellwert: ctrl.channelConfig[ch]?.schwellwert ?? 0,
                hoechstwert: ctrl.channelConfig[ch]?.hoechstwert ?? getDefaultHoechstwert(ch)
            };
        }
        res.json(result);
    } catch (err) {
        console.error("/config error:", err);
        res.status(500).json({ error: "Interner Fehler" });
    }
});

app.post("/config", async (req, res) => {
    const ctrl = getCtrl(req, res); if (!ctrl) return;
    const updates = req.body;
    if (typeof updates !== "object") return res.status(400).json({ error: "JSON-Objekt erwartet" });

    try {
        for (const [ch, cfg] of Object.entries(updates)) {
            if (!channelsList.includes(ch)) continue;

            const old        = ctrl.channelConfig[ch];
            const newLabel   = cfg.label       !== undefined ? cfg.label                   : old.label;
            const newSchwell = cfg.schwellwert !== undefined ? parseFloat(cfg.schwellwert) : old.schwellwert;
            const newHoe     = cfg.hoechstwert !== undefined ? parseFloat(cfg.hoechstwert) : old.hoechstwert;
            const chNum      = getChannelNumber(ch);

            if (cfg.label !== undefined && cfg.label !== old.label)
                await setLabelToMesskoffer(ctrl, chNum, newLabel);
            if (cfg.schwellwert !== undefined && parseFloat(cfg.schwellwert) !== old.schwellwert)
                await setThresholdToMesskoffer(ctrl, chNum, newSchwell);
            if (cfg.hoechstwert !== undefined && parseFloat(cfg.hoechstwert) !== old.hoechstwert)
                await setScaleendToMesskoffer(ctrl, chNum, newHoe);

            const point = new Point("sensoren_config")
                .tag("controller", ctrl.num)
                .tag("channel", ch)
                .tag("label",   newLabel)
                .floatField("schwellwert", newSchwell)
                .floatField("hoechstwert", newHoe)
                .timestamp(new Date());
            writeApi.writePoint(point);

            ctrl.channelConfig[ch] = { label: newLabel, schwellwert: newSchwell, hoechstwert: newHoe, updatedAt: Date.now() };
        }
        await writeApi.flush();

        const result = {};
        for (const ch of channelsList) {
            result[ch] = {
                label:       ctrl.channelConfig[ch].label,
                schwellwert: ctrl.channelConfig[ch].schwellwert,
                hoechstwert: ctrl.channelConfig[ch].hoechstwert
            };
        }
        res.json({ success: true, config: result });
    } catch (err) {
        console.error("[POST /config] Fehler:", err);
        res.status(500).json({ error: err.message });
    }
});

// ========== ROUTES ENERGIE ==========

app.get("/energy-values", async (req, res) => {
    const ctrl = getCtrl(req, res); if (!ctrl) return;
    try {
        const { temporary } = await getEnergiesFromMesskoffer(ctrl);

        const result = {};
        for (const ch of channelsList) {
            const previous  = ctrl.energyConfig[ch] || { temporary: 0, updatedAt: 0 };
            const newTemp   = temporary[ch] ?? previous.temporary ?? 0;
            const changed   = hasEnergyChanged(newTemp, previous.temporary);
            const updatedAt = changed ? Date.now() : previous.updatedAt;

            result[ch] = {
                label:     ctrl.channelConfig[ch]?.label || ch,
                temporary: newTemp,
                updatedAt
            };
            ctrl.energyConfig[ch] = { temporary: newTemp, updatedAt };
        }

        res.json(result);
    } catch (err) {
        console.error("/energy-values error:", err);
        res.status(500).json({ error: "Interner Fehler" });
    }
});

app.post("/energy-values/set", async (req, res) => {
    const ctrl = getCtrl(req, res); if (!ctrl) return;
    const updates = req.body;
    if (typeof updates !== "object") return res.status(400).json({ error: "JSON-Objekt erwartet" });

    try {
        for (const [ch, cfg] of Object.entries(updates)) {
            if (!channelsList.includes(ch)) continue;
            const oldTemp = ctrl.energyConfig[ch]?.temporary || 0;
            const newTemp = cfg.temporary !== undefined ? parseFloat(cfg.temporary) : oldTemp;
            if (!hasEnergyChanged(newTemp, oldTemp)) continue;

            await setEnergyToMesskoffer(ctrl, getChannelNumber(ch), newTemp);
            ctrl.energyConfig[ch] = { temporary: newTemp, updatedAt: Date.now() };
        }

        // Attendre 2s que le Messkoffer traite avant de relire
        await new Promise(resolve => setTimeout(resolve, 2000));

        const { temporary } = await getEnergiesFromMesskoffer(ctrl);
        const result = {};
        for (const ch of channelsList) {
            const previous = ctrl.energyConfig[ch] || { temporary: 0, updatedAt: 0 };
            const confirmedTemp = (temporary[ch] && temporary[ch] > 0)
                ? temporary[ch]
                : previous.temporary ?? 0;
            const changed   = hasEnergyChanged(confirmedTemp, previous.temporary);
            const updatedAt = changed ? Date.now() : previous.updatedAt;

            result[ch] = {
                label:     ctrl.channelConfig[ch]?.label || ch,
                temporary: confirmedTemp,
                updatedAt
            };
            ctrl.energyConfig[ch] = { temporary: confirmedTemp, updatedAt };
        }
        res.json({ success: true, config: result });
    } catch (err) {
        console.error("[POST /energy-values/set] Fehler:", err);
        res.status(500).json({ error: err.message });
    }
});

// ========== CALCUL S / Q via P et cosφ (valeurs BRUTES, avant ×10) ==========
function computeApparentAndReactive(P, cosPhi) {
    if (P === null || P === undefined || isNaN(P)) return { S: null, Q: null };
    if (cosPhi === null || cosPhi === undefined || isNaN(cosPhi) || Math.abs(cosPhi) < 0.01) {
        return { S: null, Q: null };
    }
    const S = P / cosPhi;
    const Q = Math.sqrt(Math.max(0, S * S - P * P));
    return { S, Q };
}

// ========== ROUTE DATA (Echtzeit) ==========
// Source : measurement "mego4", Device = tag du contrôleur (ex. "mE180" / "mE180_2"),
// filtré par Kanal=CHx ET Label=<label CGI actuel du canal>.

app.get("/data", async (req, res) => {
    const ctrl = getCtrl(req, res); if (!ctrl) return;
    try {
        const [{ temporary: messeEnergy }, voltagesU] = await Promise.all([
            getEnergiesFromMesskoffer(ctrl),
            getVoltagesFromMesskoffer(ctrl).catch(err => {
                console.error(`[${ctrl.label} /data] Fehler Spannungen:`, err.message);
                return { 1: 0, 2: 0, 3: 0 };
            })
        ]);

        const queries = channelsList.map(ch => {
            const label     = ctrl.channelConfig[ch]?.label || ch;
            const safeLabel = label.replace(/"/g, '\\"');
            return `
                from(bucket: "${INFLUX_BUCKET}")
                  |> range(start: -10m)
                  |> filter(fn: (r) => r._measurement == "${mego4_MEASUREMENT}")
                  |> filter(fn: (r) => r.Device == "${ctrl.device}")
                  |> filter(fn: (r) => r.Kanal  == "${ch}")
                  |> filter(fn: (r) => r.Label  == "${safeLabel}")
                  |> filter(fn: (r) => r._field == "Strom" or r._field == "Wirkleistung" or r._field == "Leistungsfaktor")
                  |> last()
            `;
        });

        const results = await Promise.all(
            queries.map(q => queryApi.collectRows(q).catch(err => {
                console.error(`[${ctrl.label} /data] Flux Fehler:`, err.message);
                return [];
            }))
        );

        const result = {};
        channelsList.forEach((ch, idx) => {
            const influxData = {};
            results[idx].forEach(row => {
                if      (row._field === "Strom")           influxData.Strom        = row._value;
                else if (row._field === "Wirkleistung")    influxData.Wirkleistung = row._value;
                else if (row._field === "Leistungsfaktor") influxData.CosinusPhi   = row._value;
            });

            // index 0-5 -> phase 1, 6-11 -> phase 2, 12-17 -> phase 3
            const voltKanal = idx < 6 ? 1 : (idx < 12 ? 2 : 3);
            const U      = voltagesU[voltKanal] ?? null;
            const I      = influxData.Strom        ?? null;
            const P      = influxData.Wirkleistung ?? null;
            const cosPhi = influxData.CosinusPhi   ?? null;
            const { S, Q } = computeApparentAndReactive(P, cosPhi);

            const rawEnergie = (messeEnergy[ch] && messeEnergy[ch] > 0)
                ? messeEnergy[ch]
                : (ctrl.energyConfig[ch]?.temporary && ctrl.energyConfig[ch].temporary > 0)
                ? ctrl.energyConfig[ch].temporary
                : null;

            result[ch] = {
                Label:          ctrl.channelConfig[ch]?.label || ch,
                Strom:          applyX10IfNeeded(ch, I),
                Wirkleistung:   applyX10IfNeeded(ch, P),
                Spannung:       applyX10IfNeeded(ch, U),
                CosinusPhi:     cosPhi,
                Energie_temp:   rawEnergie,
                Scheinleistung: applyX10IfNeeded(ch, S),
                Blindleistung:  applyX10IfNeeded(ch, Q)
            };
        });

        res.json(result);
    } catch (error) {
        console.error("/data error:", error);
        res.status(500).send("Fehler: " + error.message);
    }
});

// ========== ROUTE HISTORY ==========

app.get("/history/:channel", async (req, res) => {
    const ctrl = getCtrl(req, res); if (!ctrl) return;
    const ch = req.params.channel;
    if (!channelsList.includes(ch)) {
        return res.status(400).json({ error: "Ungültiger Kanal" });
    }

    let duration = req.query.time || "1h";
    if (duration.includes("d") && parseInt(duration) > 1) duration = "24h";

    const label     = ctrl.channelConfig[ch]?.label || ch;
    const safeLabel = label.replace(/"/g, '\\"');

    const fluxQuery = `
        from(bucket: "${INFLUX_BUCKET}")
          |> range(start: -${duration})
          |> filter(fn: (r) => r._measurement == "${mego4_MEASUREMENT}")
          |> filter(fn: (r) => r.Device == "${ctrl.device}")
          |> filter(fn: (r) => r.Kanal  == "${ch}")
          |> filter(fn: (r) => r.Label  == "${safeLabel}")
          |> filter(fn: (r) => r._field == "Strom" or r._field == "Wirkleistung" or r._field == "Leistungsfaktor" or r._field == "Energie")
          |> aggregateWindow(every: 10s, fn: mean, createEmpty: false)
          |> sort(columns: ["_time"])
    `;

    try {
        const rows         = await queryApi.collectRows(fluxQuery);
        const pointsByTime = {};
        rows.forEach(row => {
            const t = row._time;
            if (!pointsByTime[t]) pointsByTime[t] = { time: t };
            if      (row._field === "Strom")           pointsByTime[t].Strom        = row._value;
            else if (row._field === "Wirkleistung")    pointsByTime[t].Wirkleistung = row._value;
            else if (row._field === "Leistungsfaktor") pointsByTime[t].CosinusPhi   = row._value;
            else if (row._field === "Energie")         pointsByTime[t].Energie      = row._value;
        });

        const data = Object.values(pointsByTime)
            .map(point => {
                const { S, Q } = computeApparentAndReactive(point.Wirkleistung ?? null, point.CosinusPhi ?? null);
                return {
                    time:           point.time,
                    Strom:          applyX10IfNeeded(ch, point.Strom ?? null),
                    Wirkleistung:   applyX10IfNeeded(ch, point.Wirkleistung ?? null),
                    CosinusPhi:     point.CosinusPhi ?? null,
                    Energie:        point.Energie ?? null,
                    Scheinleistung: applyX10IfNeeded(ch, S),
                    Blindleistung:  applyX10IfNeeded(ch, Q)
                };
            })
            .sort((a, b) => new Date(a.time) - new Date(b.time));

        res.json({ controller: ctrl.num, channel: ch, data });
    } catch (error) {
        console.error(`/history ${ch} error:`, error);
        res.status(500).json({ error: error.message });
    }
});

// ========== ROUTE VOLTAGES ==========

app.get("/voltages", async (req, res) => {
    const ctrl = getCtrl(req, res); if (!ctrl) return;
    try {
        const v = await getVoltagesFromMesskoffer(ctrl);
        res.json({ L1: v[1], L2: v[2], L3: v[3] });
    } catch (error) {
        console.error(`[${ctrl.label}] /voltages error:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

// ========== START ==========
app.listen(4000, "0.0.0.0", () => {
    console.log("✅ Server läuft auf Port 4000");
    console.log(`   InfluxDB : ${INFLUX_URL} | Bucket: ${INFLUX_BUCKET}`);
    Object.values(CONTROLLERS).forEach(c =>
        console.log(`   ${c.label}: ${c.ip} | ID: ${c.id} | Influx-Device: ${c.device}`)
    );
    console.log(`   Kanäle: 18 pro Controller`);
    console.log(`   Canaux ×10 (sauf CosinusPhi/Energie): ${CHANNELS_X10.join(", ")}`);
});