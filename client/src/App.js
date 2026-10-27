// App_20sensors.jsx — adapté pour cascade Messkoffer + mapping CH→SensorN
// ✅ Design harmonisé avec le portail principal mE2go (mêmes tokens de couleur,
// même typographie, mêmes cartes à bordure fine sans ombre lourde, mêmes
// pastilles de statut). Toute la logique métier (état, appels API, polling)
// est strictement inchangée — seul l'habillage visuel a été repris.
// ✅ Vue "sensorconfig" (Sensor-Bezeichnung) réécrite en version industrielle :
// saisie fluide (plus de perte de focus), suivi des modifications, barre
// d'enregistrement, Strg+S, recherche.
import React, { useEffect, useState, useCallback, memo, useRef } from "react";
import axios from "axios";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import {
  Paper, Typography, Box, Button, Divider,
  MenuItem, Checkbox, ListItemText, TextField, Alert,
  useMediaQuery, Drawer, Badge, Popover, FormControlLabel, Menu, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions
} from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import DashboardIcon from "@mui/icons-material/Dashboard";
import ElectricBoltIcon from "@mui/icons-material/ElectricBolt";
import FunctionsIcon from "@mui/icons-material/Functions";
import SpeedIcon from "@mui/icons-material/Speed";
import FlashOnIcon from "@mui/icons-material/FlashOn";
import TimelineIcon from "@mui/icons-material/Timeline";
import BatteryChargingFullIcon from "@mui/icons-material/BatteryChargingFull";
import DeviceHubIcon from "@mui/icons-material/DeviceHub";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import VoltageSvgIcon from "@mui/icons-material/FlashOn";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ElectricalServicesIcon from "@mui/icons-material/ElectricalServices";
import SaveIcon from "@mui/icons-material/Save";
import FilterListIcon from "@mui/icons-material/FilterList";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import UpdateIcon from "@mui/icons-material/Update";
import SyncIcon from "@mui/icons-material/Sync";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer
} from "recharts";

// =================== DESIGN-TOKENS (identisch zum mE2go-Hauptportal) ===================
const INK        = '#111827';
const INK_MUTED  = '#667085';
const SURFACE    = '#F3F5F7';
const PANEL      = '#FFFFFF';
const BORDER     = '#E3E6EB';
const SUCCESS    = '#1E8A5D';
const SUCCESS_BG = '#E7F5EE';
const DANGER     = '#C0392B';
const WARNING    = '#B7791F';
const WARNING_BG = '#FBF1DE';
const BRAND      = '#0a5e8c';
const BRAND_BG   = '#E9F2F7';
const ACCENT     = '#e67e22';
const ACCENT_BG  = '#FCEEE0';
const READOUT_BG = '#0d141b';
const MONO_FONT    = '"IBM Plex Mono","JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const DISPLAY_FONT = '"IBM Plex Sans","Inter","Segoe UI", sans-serif';

const theme = createTheme({
  palette: {
    primary:   { main: BRAND },
    secondary: { main: ACCENT },
    success:   { main: SUCCESS },
    error:     { main: DANGER },
    warning:   { main: WARNING }
  },
  typography: {
    fontFamily: DISPLAY_FONT,
    h4: { fontWeight: 700, letterSpacing: '-0.01em' },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
  },
  shape: { borderRadius: 14 },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${BORDER}`,
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 700 }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 700 }
      }
    }
  }
});

const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:4000`;
const STARTSEITE_URL = "http://172.16.1.177:8080";

// ✅ Affichage des canaux du mE180 : le préfixe "CH" est simplement remplacé
// par "PH" à l'affichage (ex: tag brut "CH1 a" -> affiché "PH1 a"), le
// numéro de groupe (1/2/3 = phase L1/L2/L3) et la lettre (a-r) sont conservés
// tels quels. Le tag brut ci-dessous reste identique partout ailleurs (API,
// mapping, tri, filtres, InfluxDB) pour ne rien casser côté stockage/historique.
const CHANNEL_ORDER = [
  "CH1 a", "CH1 b", "CH1 c", "CH1 d", "CH1 e", "CH1 f",
  "CH2 g", "CH2 h", "CH2 i", "CH2 j", "CH2 k", "CH2 l",
  "CH3 m", "CH3 n", "CH3 o", "CH3 p", "CH3 q", "CH3 r"
];

// ✅ Rendu à deux tons pour la lisibilité : "PH" + numéro de groupe en gris
// discret, seule la lettre (a, b, c...) ressort en couleur.
const getChannelParts = (ch) => {
  const m = String(ch).match(/^CH(\d+)\s+([a-r])$/i);
  return m ? { group: m[1], letter: m[2] } : null;
};

const ChannelLabel = ({ channel, letterColor = BRAND }) => {
  const parts = getChannelParts(channel);
  if (!parts) return <>{channel}</>;
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "baseline", gap: "4px" }}>
      <Box component="span" sx={{ color: INK_MUTED, fontWeight: 600, fontSize: "0.75em", letterSpacing: "0.3px" }}>PH{parts.group}</Box>
      <Box component="span" sx={{ color: letterColor, fontWeight: 800 }}>{parts.letter}</Box>
    </Box>
  );
};

// ✅ METRIC_LABELS alimente uniquement le sélecteur de la vue détaillée
// "Trends" (graphique historique par canal CH1-CH18) — Cosinus Phi y reste
// absent volontairement. Les cartes Live Daten utilisent METRIC_OPTIONS.
const METRIC_LABELS = {
  Strom:        "Strom (A)",
  Wirkleistung: "Wirkleistung (W)",
  Spannung:     "Spannung (V)",
  Energie_temp: "Energie (kWh)",
};

const METRIC_OPTIONS = [
  { value: "Strom",         label: "Strom (A)",          icon: ElectricBoltIcon,       decimals: 3, unit: "A"   },
  { value: "CosinusPhi",    label: "Cosinus Phi",         icon: FunctionsIcon,          decimals: 4, unit: ""    },
  { value: "Wirkleistung",  label: "Wirkleistung (W)",    icon: SpeedIcon,              decimals: 2, unit: "W"   },
  { value: "Blindleistung", label: "Blindleistung (var)", icon: FlashOnIcon,            decimals: 2, unit: "var" },
  { value: "Scheinleistung",label: "Scheinleistung (VA)", icon: TimelineIcon,           decimals: 2, unit: "VA"  },
  { value: "Energie_temp",  label: "Energie (kWh)",       icon: BatteryChargingFullIcon,decimals: 2, unit: "kWh" },
];

const TIME_RANGE_OPTIONS = [
  { value: "5m",  label: "letzte 5 Min"      },
  { value: "10m", label: "letzte 10 Min"     },
  { value: "15m", label: "letzte 15 Min"     },
  { value: "1h",  label: "letzte 1 Stunde"   },
  { value: "2h",  label: "letzte 2 Stunden"  },
  { value: "6h",  label: "letzte 6 Stunden"  },
  { value: "24h", label: "letzte 24 Stunden" },
];

const formatValue = (value, decimals = 3, unit = "") => {
  // ✅ Affiche "0" formaté au lieu de "—" quand il n'y a pas de valeur.
  let num = parseFloat(value);
  if (value === undefined || value === null || isNaN(num)) num = 0;
  return `${num.toFixed(decimals)}${unit ? " " + unit : ""}`;
};

// ✅ Seule Scheinleistung (S = U × I) est calculée côté React, à partir de
// Strom + de la tension partagée "Netz".
const computeScheinleistung = (U, I) => {
  if (U === null || U === undefined || isNaN(U) || I === null || I === undefined || isNaN(I)) {
    return null;
  }
  return U * I;
};

// ✅ Injecte Spannung (device "Netz") et Scheinleistung calculée sur chaque
// Kanal de chaque Sensor. Le Kanal "4" (Neutre) reste à null.
const augmentSensorsWithDerivedValues = (rawSensors) => {
  const netzDevice = rawSensors.find(s => s.device === "Netz" || s.device === "Sensor0");
  const voltageForKanal = (kanal) => {
    if (!netzDevice) return null;
    const k = netzDevice.kanaele.find(k => k.kanal === kanal);
    return k?.Spannung ?? null;
  };
  return rawSensors.map(s => {
    if (s === netzDevice) return s;
    return {
      ...s,
      kanaele: s.kanaele.map(k => {
        const U = voltageForKanal(k.kanal);
        return { ...k, Spannung: U, Scheinleistung: computeScheinleistung(U, k.Strom) };
      })
    };
  });
};

// ✅ "Energie" est déjà en kWh (registre Econsumed du Volt1000S) — aucune
// conversion d'unité.
const formatMappingMetricValue = (metric, rawValue) => {
  return formatValue(rawValue, metric.decimals, metric.unit);
};

// ─── Petit badge de valeur (chiffre en mono, cohérent avec le portail) ──────
const ValueBadge = ({ children, muted = false }) => (
  <Box sx={{
    bgcolor: SURFACE, border: `1px solid ${BORDER}`, px: "10px", py: "3px", borderRadius: "8px",
    minWidth: 92, textAlign: "center"
  }}>
    <Typography variant="caption" sx={{ fontFamily: MONO_FONT, fontWeight: 700, color: muted ? INK_MUTED : INK }}>
      {children}
    </Typography>
  </Box>
);

// ─── FILTER BAR ───────────────────────────────────────────────────────────────
// ✅ itemsLabel permet de réutiliser ce composant pour filtrer soit des
// "Kanäle", soit des "Sensoren".
const FilterBar = memo(({
  selectedChannels, selectedMetrics,
  onChannelChange, onSelectAllChannels,
  onMetricChange, onSelectAllMetrics,
  onResetFilters, hasActiveFilters,
  orderedChannels, metricOptions,
  mobileDrawer = false,
  itemsLabel = "Kanäle",
}) => {
  const isMobile = useMediaQuery("(max-width:600px)");
  const [drawerOpen, setDrawerOpen]           = useState(false);
  const [channelAnchorEl, setChannelAnchorEl] = useState(null);
  const [metricAnchorEl, setMetricAnchorEl]   = useState(null);

  const handleChannelToggle = (ch) => {
    const next = selectedChannels.includes(ch)
      ? selectedChannels.filter(c => c !== ch)
      : [...selectedChannels, ch];
    onChannelChange({ target: { value: next } });
  };

  const handleMetricToggle = (val) => {
    const next = selectedMetrics.includes(val)
      ? selectedMetrics.filter(m => m !== val)
      : [...selectedMetrics, val];
    onMetricChange({ target: { value: next } });
  };

  const selChCount = selectedChannels.length;
  const totChCount = orderedChannels.length;
  const selMtCount = selectedMetrics.length;
  const totMtCount = metricOptions.length;

  const channelPopover = (
    <Popover open={Boolean(channelAnchorEl)} anchorEl={channelAnchorEl}
      onClose={() => setChannelAnchorEl(null)}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      disableAutoFocus disableEnforceFocus keepMounted>
      <Box sx={{ p: 2, minWidth: 250, maxWidth: 350 }}>
        <FormControlLabel
          control={<Checkbox checked={selChCount === totChCount} indeterminate={selChCount > 0 && selChCount < totChCount} onChange={onSelectAllChannels} />}
          label={`Alle ${itemsLabel}`} />
        <Divider sx={{ my: 1 }} />
        <Box sx={{ maxHeight: 300, overflow: "auto" }}>
          {orderedChannels.map(ch => (
            <FormControlLabel key={ch}
              control={<Checkbox checked={selectedChannels.includes(ch)} onChange={() => handleChannelToggle(ch)} />}
              label={<ChannelLabel channel={ch} />} sx={{ display: "block" }} />
          ))}
        </Box>
      </Box>
    </Popover>
  );

  const metricPopover = (
    <Popover open={Boolean(metricAnchorEl)} anchorEl={metricAnchorEl}
      onClose={() => setMetricAnchorEl(null)}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      disableAutoFocus disableEnforceFocus keepMounted>
      <Box sx={{ p: 2, minWidth: 250, maxWidth: 350 }}>
        <FormControlLabel
          control={<Checkbox checked={selMtCount === totMtCount} indeterminate={selMtCount > 0 && selMtCount < totMtCount} onChange={onSelectAllMetrics} />}
          label="Alle Messgrößen" />
        <Divider sx={{ my: 1 }} />
        <Box sx={{ maxHeight: 300, overflow: "auto" }}>
          {metricOptions.map(m => (
            <FormControlLabel key={m.value}
              control={<Checkbox checked={selectedMetrics.includes(m.value)} onChange={() => handleMetricToggle(m.value)} />}
              label={m.label} sx={{ display: "block" }} />
          ))}
        </Box>
      </Box>
    </Popover>
  );

  const drawerContent = (
    <Box sx={{ p: 2, width: 280 }}>
      <Typography variant="h6" gutterBottom sx={{ color: INK }}>Filter</Typography>
      <Typography variant="subtitle2" gutterBottom sx={{ color: INK_MUTED }}>{itemsLabel}</Typography>
      <Box sx={{ mb: 2, maxHeight: 200, overflow: "auto" }}>
        <FormControlLabel
          control={<Checkbox checked={selChCount === totChCount} indeterminate={selChCount > 0 && selChCount < totChCount} onChange={onSelectAllChannels} />}
          label={`Alle ${itemsLabel}`} />
        {orderedChannels.map(ch => (
          <FormControlLabel key={ch}
            control={<Checkbox checked={selectedChannels.includes(ch)} onChange={() => handleChannelToggle(ch)} />}
            label={<ChannelLabel channel={ch} />} />
        ))}
      </Box>
      <Typography variant="subtitle2" gutterBottom sx={{ color: INK_MUTED }}>Messgrößen</Typography>
      <Box sx={{ mb: 2, maxHeight: 200, overflow: "auto" }}>
        <FormControlLabel
          control={<Checkbox checked={selMtCount === totMtCount} indeterminate={selMtCount > 0 && selMtCount < totMtCount} onChange={onSelectAllMetrics} />}
          label="Alle Messgrößen" />
        {metricOptions.map(m => (
          <FormControlLabel key={m.value}
            control={<Checkbox checked={selectedMetrics.includes(m.value)} onChange={() => handleMetricToggle(m.value)} />}
            label={m.label} />
        ))}
      </Box>
      <Button fullWidth variant="contained" onClick={() => { onResetFilters(); setDrawerOpen(false); }}
        startIcon={<ClearAllIcon />} disabled={!hasActiveFilters}
        sx={{ bgcolor: hasActiveFilters ? DANGER : BORDER, color: hasActiveFilters ? '#fff' : INK_MUTED, borderRadius: 20, boxShadow: 'none' }}>
        Filter zurücksetzen
      </Button>
    </Box>
  );

  if (mobileDrawer && isMobile) {
    return (
      <>
        <Badge badgeContent={selChCount + selMtCount} color="primary">
          <Button variant="outlined" onClick={() => setDrawerOpen(true)} startIcon={<FilterListIcon />} size="small"
            sx={{ borderColor: BORDER, color: INK }}>Filter</Button>
        </Badge>
        <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>{drawerContent}</Drawer>
      </>
    );
  }

  return (
    <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
      <Button variant="outlined" onClick={e => { e.stopPropagation(); setChannelAnchorEl(e.currentTarget); }}
        endIcon={<span>▼</span>} sx={{ minWidth: 150, borderRadius: 20, borderColor: BORDER, color: INK }}>
        {selChCount === 0 || selChCount === totChCount ? `Alle ${itemsLabel}` : `${selChCount} ${itemsLabel}`}
      </Button>
      {channelPopover}
      <Button variant="outlined" onClick={e => { e.stopPropagation(); setMetricAnchorEl(e.currentTarget); }}
        endIcon={<span>▼</span>} sx={{ minWidth: 150, borderRadius: 20, borderColor: BORDER, color: INK }}>
        {selMtCount === 0 || selMtCount === totMtCount ? "Alle Messgrößen" : `${selMtCount} Messgrößen`}
      </Button>
      {metricPopover}
      <Button variant="contained" onClick={onResetFilters} startIcon={<ClearAllIcon />} disabled={!hasActiveFilters}
        sx={{ bgcolor: hasActiveFilters ? DANGER : BORDER, color: hasActiveFilters ? '#fff' : INK_MUTED, borderRadius: 20, boxShadow: 'none', '&:hover': { bgcolor: hasActiveFilters ? '#A53023' : BORDER, boxShadow: 'none' } }}>
        Filter zurücksetzen
      </Button>
    </Box>
  );
});

// ─── GRAPH DETAIL ─────────────────────────────────────────────────────────────
const GraphDetail = ({ selectedChannel, historyData, isMouseOverGraph, setIsMouseOverGraph,
  selectedMetric, setSelectedMetric, timeRange, setTimeRange, onBack }) => {

  const [metricAnchorEl, setMetricAnchorEl] = useState(null);
  const [timeAnchorEl, setTimeAnchorEl]     = useState(null);

  const formatXAxis    = tick => new Date(tick).toLocaleTimeString();
  const getMetricLabel = () => METRIC_LABELS[selectedMetric] || selectedMetric;
  const getTimeLabel   = () => TIME_RANGE_OPTIONS.find(o => o.value === timeRange)?.label || timeRange;

  return (
    <Box>
      <Paper elevation={0} sx={{ p: 2, mb: 2, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", bgcolor: PANEL }}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack} variant="outlined" sx={{ borderColor: BORDER, color: INK }}>
          Zurück zum Menü
        </Button>
        <Typography variant="h5" sx={{ color: INK }}>{selectedChannel ? <ChannelLabel channel={selectedChannel} /> : ""}</Typography>

        <Button variant="outlined" onClick={e => setMetricAnchorEl(e.currentTarget)}
          endIcon={<span>▼</span>} sx={{ minWidth: 150, borderColor: BORDER, color: INK }}>
          {getMetricLabel()}
        </Button>
        <Menu anchorEl={metricAnchorEl} open={Boolean(metricAnchorEl)}
          onClose={() => setMetricAnchorEl(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
          disableAutoFocus disableEnforceFocus disableScrollLock>
          {Object.entries(METRIC_LABELS).map(([key, label]) => (
            <MenuItem key={key}
              onClick={e => { e.stopPropagation(); setSelectedMetric(key); }}
              selected={selectedMetric === key} sx={{ borderRadius: 1 }}>
              <Checkbox checked={selectedMetric === key} size="small" />
              <ListItemText primary={label} />
            </MenuItem>
          ))}
        </Menu>

        <Button variant="outlined" onClick={e => setTimeAnchorEl(e.currentTarget)}
          endIcon={<span>▼</span>} sx={{ minWidth: 150, borderColor: BORDER, color: INK }}>
          {getTimeLabel()}
        </Button>
        <Menu anchorEl={timeAnchorEl} open={Boolean(timeAnchorEl)}
          onClose={() => setTimeAnchorEl(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
          disableAutoFocus disableEnforceFocus disableScrollLock>
          {TIME_RANGE_OPTIONS.map(opt => (
            <MenuItem key={opt.value}
              onClick={e => { e.stopPropagation(); setTimeRange(opt.value); }}
              selected={timeRange === opt.value} sx={{ borderRadius: 1 }}>
              <Checkbox checked={timeRange === opt.value} size="small" />
              <ListItemText primary={opt.label} />
            </MenuItem>
          ))}
        </Menu>

        <Chip size="small" icon={<SyncIcon sx={{ fontSize: '13px !important' }} />}
          label={isMouseOverGraph ? "Pause (Maus über Grafik)" : "Aktualisierung jede Sekunde"}
          sx={{ bgcolor: SURFACE, color: INK_MUTED }} />
      </Paper>

      <Paper elevation={0} sx={{ p: 2, height: "60vh", bgcolor: PANEL }}
        onMouseEnter={() => setIsMouseOverGraph(true)}
        onMouseLeave={() => setIsMouseOverGraph(false)}>
        {historyData.length === 0 ? (
          <Typography align="center" sx={{ color: INK_MUTED }}>Keine historischen Daten.</Typography>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid stroke={BORDER} strokeDasharray="5 5" />
              <XAxis dataKey="time" tickFormatter={formatXAxis} angle={-30} textAnchor="end" height={60}
                tick={{ fontSize: 11, fill: INK_MUTED }} axisLine={{ stroke: BORDER, strokeWidth: 1 }} />
              <YAxis tick={{ fontSize: 11, fill: INK_MUTED }} axisLine={{ stroke: BORDER, strokeWidth: 1 }}
                label={{ value: METRIC_LABELS[selectedMetric], angle: -90, position: "insideLeft",
                  style: { textAnchor: "middle", fill: INK_MUTED, fontSize: 12 } }} />
              <Tooltip labelFormatter={t => new Date(t).toLocaleString()}
                wrapperStyle={{ pointerEvents: "auto" }}
                contentStyle={{ backgroundColor: PANEL, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
              <Line type="monotone" dataKey={selectedMetric} stroke={ACCENT} strokeWidth={2.5}
                name={METRIC_LABELS[selectedMetric]} dot={false} isAnimationActive={false}
                connectNulls activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Paper>
    </Box>
  );
};

// ─── KANAL-KONFIGURATION ──────────────────────────────────────────────────────
const ChannelConfigManager = () => {
  const [config, setConfig]           = useState({});
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [message, setMessage]         = useState("");
  const [messageType, setMessageType] = useState("success");
  const isMobile = useMediaQuery("(max-width:600px)");

  const loadConfig = async () => {
    try {
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 5000);
      const res        = await axios.get(`${API_BASE_URL}/config`, { signal: controller.signal });
      clearTimeout(timeoutId);
      setConfig(res.data);
    } catch (err) {
      setMessageType("error");
      setMessage(err.name === "AbortError"
        ? "❌ Zeitüberschreitung: Server antwortet nicht."
        : "❌ Fehler beim Laden der Konfiguration: " + (err.message || "Netzwerkproblem"));
      setTimeout(() => setMessage(""), 5000);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadConfig(); }, []);

  const handleChange = (channel, field, value) =>
    setConfig(prev => ({ ...prev, [channel]: { ...prev[channel], [field]: value } }));

  const saveConfig = async () => {
    setSaving(true);
    try {
      await axios.post(`${API_BASE_URL}/config`, config);
      setMessageType("success");
      setMessage("✅ Konfiguration erfolgreich gespeichert");
      setTimeout(() => setMessage(""), 3000);
      await loadConfig();
    } catch {
      setMessageType("error");
      setMessage("❌ Fehler beim Speichern der Konfiguration");
      setTimeout(() => setMessage(""), 3000);
    } finally { setSaving(false); }
  };

  if (loading) return <Typography sx={{ color: INK_MUTED }}>Konfiguration wird geladen...</Typography>;

  const entries = Object.entries(config).filter(([key]) => !key.startsWith("L"));
  const groups  = [
    { channels: entries.slice(0, 6),   bgColor: SURFACE, title: "Kanäle A-F"   },
    { channels: entries.slice(6, 12),  bgColor: '#EEF1F4', title: "Kanäle G-L"  },
    { channels: entries.slice(12, 18), bgColor: '#F8F9FA', title: "Kanäle M-R" },
  ];

  return (
    <Paper elevation={0} sx={{ p: 3, mt: 3, bgcolor: PANEL }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <Typography variant="h5" sx={{ color: INK }}>Kanal-Einstellungen</Typography>
        <Button variant="contained" onClick={saveConfig} disabled={saving} startIcon={<SaveIcon />}
          sx={{ bgcolor: SUCCESS, borderRadius: 20, boxShadow: 'none', '&:hover': { bgcolor: '#166B48', boxShadow: 'none' } }}>
          {saving ? "Speichern..." : "Alle speichern"}
        </Button>
      </Box>
      {message && <Alert severity={messageType === "success" ? "success" : "error"} sx={{ mb: 2, borderRadius: 2 }}>{message}</Alert>}
      {groups.map((group, idx) => (
        <Box key={idx} sx={{ mb: 3, p: 2, borderRadius: 2, backgroundColor: group.bgColor, border: `1px solid ${BORDER}`, overflowX: "auto" }}>
          <Typography variant="subtitle1" sx={{ mb: 1, color: INK, fontWeight: 700 }}>{group.title}</Typography>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 500 : "auto" }}>
            <thead>
              <tr style={{ backgroundColor: "rgba(17,24,39,0.04)" }}>
                <th style={{ padding: "12px", textAlign: "left", color: INK_MUTED, fontSize: '0.8rem' }}>Kanal</th>
                <th style={{ padding: "12px", textAlign: "left", color: INK_MUTED, fontSize: '0.8rem' }}>Bezeichnung</th>
                <th style={{ padding: "12px", textAlign: "left", color: INK_MUTED, fontSize: '0.8rem' }}>Schwellwert (A)</th>
                <th style={{ padding: "12px", textAlign: "left", color: INK_MUTED, fontSize: '0.8rem' }}>Höchstwert (A)</th>
              </tr>
            </thead>
            <tbody>
              {group.channels.map(([channel, cfg]) => (
                <tr key={channel} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ padding: "8px", fontWeight: 700, fontFamily: MONO_FONT }}><ChannelLabel channel={channel} /></td>
                  <td style={{ padding: "8px" }}>
                    <TextField size="small" value={cfg.label || ""} onChange={e => handleChange(channel, "label", e.target.value)}
                      fullWidth variant="outlined"
                      InputProps={{ style: { color: INK, fontSize: "1rem", fontWeight: 600, backgroundColor: PANEL } }} />
                  </td>
                  <td style={{ padding: "8px" }}>
                    <TextField type="number" size="small" value={cfg.schwellwert || 0}
                      onChange={e => handleChange(channel, "schwellwert", parseFloat(e.target.value) || 0)}
                      variant="outlined" inputProps={{ step: "0.1", style: { width: isMobile ? 80 : 100 } }} />
                  </td>
                  <td style={{ padding: "8px" }}>
                    <TextField type="number" size="small" value={cfg.hoechstwert || 0}
                      onChange={e => handleChange(channel, "hoechstwert", parseFloat(e.target.value) || 0)}
                      variant="outlined" inputProps={{ step: "0.1", style: { width: isMobile ? 80 : 100 } }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      ))}
    </Paper>
  );
};

// ─── SENSOR-BEZEICHNUNG (Kundendaten) — version industrielle ─────────────────
// Sous-composants déclarés au niveau du module : le focus des champs reste
// stable pendant la saisie et pendant le rafraîchissement automatique.
const SC_KANAEL   = ["1", "2", "3", "4"];
const SC_MAX_LEN  = 40;
const SC_EXCLUDED = ["Netz", "Sensor0"];
const scKey       = (device, kanal) => `${device}_${kanal}`;
const scSplitKey  = (key) => {
  const i = key.lastIndexOf("_");
  return { device: key.slice(0, i), kanal: key.slice(i + 1) };
};

// ── Petit afficheur de valeur live (fond sombre, police mono) ──
const ScReadout = ({ label, value }) => (
  <Box sx={{ flex: 1, minWidth: 0, bgcolor: READOUT_BG, borderRadius: "6px", px: 1.2, py: 0.6, textAlign: "right" }}>
    <Typography sx={{ fontSize: "0.68rem", color: "#8A97A4", lineHeight: 1.2 }}>{label}</Typography>
    <Typography sx={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: "0.88rem", color: "#7CC7E8", lineHeight: 1.35, whiteSpace: "nowrap" }}>
      {value}
    </Typography>
  </Box>
);

// ── Une ligne = un Kanal (couleur de conducteur, saisie, valeurs live) ──
const ScKanalRow = memo(({ device, kanal, live, value, savedValue, onChange, isMobile }) => {
  const dirty  = value !== savedValue;
  const online = Boolean(live);
  const inputId = `bez-${device}-${kanal}`;
  return (
    <Box sx={{
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "112px minmax(0, 1fr) 230px",
      alignItems: "center", gap: isMobile ? 1 : 2,
      px: 2, py: 1.3,
      borderTop: `1px solid ${BORDER}`,
      bgcolor: dirty ? WARNING_BG : "transparent",
      transition: "background-color .15s ease",
    }}>
      {/* Conducteur : couleur réelle du fil (braun / schwarz / grau / blau) */}
      <Box display="flex" alignItems="center" gap={1.2}>
        <Box sx={{ width: 5, height: 34, borderRadius: "3px", bgcolor: KANAL_COLORS[kanal] || BORDER, flexShrink: 0 }} />
        <Box>
          <Typography component="label" htmlFor={inputId}
            sx={{ display: "block", fontFamily: MONO_FONT, fontWeight: 700, fontSize: "0.95rem", color: INK, lineHeight: 1.15 }}>
            {KANAL_LABELS[kanal]}
          </Typography>
          <Box display="flex" alignItems="center" gap={0.6}>
            <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: online ? SUCCESS : "#C4C9D1" }} />
            <Typography sx={{ fontSize: "0.72rem", color: INK_MUTED }}>
              Kanal {kanal} · {online ? "aktiv" : "kein Signal"}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Champ de saisie : large, toujours éditable, compteur de caractères */}
      <TextField
        id={inputId}
        fullWidth size="small" variant="outlined"
        value={value}
        onChange={e => onChange(device, kanal, e.target.value)}
        placeholder="z. B. Kompressor Halle 2"
        helperText={dirty ? `Geändert · ${value.length}/${SC_MAX_LEN}` : " "}
        FormHelperTextProps={{ sx: { m: 0, mt: 0.3, fontSize: "0.7rem", color: dirty ? WARNING : INK_MUTED, minHeight: 14 } }}
        inputProps={{ maxLength: SC_MAX_LEN, spellCheck: false, autoComplete: "off" }}
        sx={{
          "& .MuiOutlinedInput-root": {
            bgcolor: PANEL, borderRadius: "8px", fontSize: "0.95rem", fontWeight: 600, color: INK,
            "& fieldset": { borderColor: dirty ? WARNING : BORDER },
            "&:hover fieldset": { borderColor: dirty ? WARNING : "#B8BEC7" },
            "&.Mui-focused fieldset": { borderColor: BRAND, borderWidth: 2 },
          },
          "& input": { py: "9px" },
        }}
      />

      {/* Valeurs live : aide à identifier physiquement le départ */}
      <Box display="flex" gap={1}>
        <ScReadout label="Strom"    value={online ? formatValue(live.Strom, 2, "A") : "– A"} />
        <ScReadout label="Leistung" value={online ? formatValue(live.Wirkleistung, 0, "W") : "– W"} />
      </Box>
    </Box>
  );
});

// ── Un panneau = un Sensor (en-tête + 4 lignes Kanal) ──
const ScSensorPanel = memo(({ sensor, labels, saved, onChange, onDiscardSensor, isMobile }) => {
  const activeCount = sensor.kanaele.length;
  const dirtyCount  = SC_KANAEL.filter(k => (labels[scKey(sensor.device, k)] ?? "") !== (saved[scKey(sensor.device, k)] ?? "")).length;
  return (
    <Paper elevation={0} sx={{ bgcolor: PANEL, borderRadius: "12px", overflow: "hidden" }}>
      <Box display="flex" alignItems="center" gap={1.2} sx={{ px: 2, py: 1.3, bgcolor: SURFACE }}>
        <DeviceHubIcon sx={{ color: BRAND, fontSize: 20 }} />
        <Typography sx={{ fontFamily: MONO_FONT, fontWeight: 700, color: INK, fontSize: "1rem" }}>{sensor.device}</Typography>
        <Chip size="small"
          label={activeCount > 0 ? `${activeCount}/4 Kanäle aktiv` : "Offline"}
          sx={{ height: 22, bgcolor: activeCount > 0 ? SUCCESS_BG : "#ECEEF1", color: activeCount > 0 ? SUCCESS : INK_MUTED }} />
        <Box flex={1} />
        {dirtyCount > 0 && (
          <Button size="small" onClick={() => onDiscardSensor(sensor.device)}
            sx={{ color: WARNING, fontSize: "0.75rem", minWidth: 0, px: 1 }}>
            {dirtyCount} Änderung{dirtyCount > 1 ? "en" : ""} verwerfen
          </Button>
        )}
      </Box>
      {SC_KANAEL.map(kanal => {
        const key = scKey(sensor.device, kanal);
        return (
          <ScKanalRow key={key}
            device={sensor.device} kanal={kanal}
            live={sensor.kanaele.find(k => k.kanal === kanal)}
            value={labels[key] ?? ""} savedValue={saved[key] ?? ""}
            onChange={onChange} isMobile={isMobile} />
        );
      })}
    </Paper>
  );
});

// ── Vue principale ──
const SensorConfigManager = () => {
  const [sensors, setSensors]         = useState([]);
  const [labels, setLabels]           = useState({});   // ce que l'utilisateur tape
  const [saved, setSaved]             = useState({});   // ce qui est enregistré côté serveur
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]           = useState("");
  const [message, setMessage]         = useState("");
  const [messageType, setMessageType] = useState("success");
  const savedRef = useRef({});
  const isMobile = useMediaQuery("(max-width:900px)");

  const flash = (type, text, ms = 3500) => {
    setMessageType(type); setMessage(text);
    setTimeout(() => setMessage(""), ms);
  };

  // silent=true : polling en arrière-plan. Les champs que l'utilisateur est
  // en train de modifier ne sont JAMAIS écrasés par le serveur.
  const loadSensors = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res  = await axios.get(`${API_BASE_URL}/sensors-discovery`, { timeout: 5000 });
      const list = (res.data?.sensors || []).filter(s => !SC_EXCLUDED.includes(s.device));

      const serverLabels = {};
      list.forEach(s => SC_KANAEL.forEach(kanal => {
        const k = s.kanaele.find(x => x.kanal === kanal);
        serverLabels[scKey(s.device, kanal)] = k?.Bezeichnung || "";
      }));

      const prevSaved = savedRef.current;
      savedRef.current = serverLabels;
      setSensors(list);
      setSaved(serverLabels);
      setLabels(prev => {
        const next = { ...prev };
        Object.keys(serverLabels).forEach(key => {
          const untouched = next[key] === undefined || next[key] === (prevSaved[key] ?? "");
          if (untouched) next[key] = serverLabels[key];
        });
        return next;
      });
    } catch (err) {
      if (!silent) {
        flash("error", err.code === "ECONNABORTED"
          ? "Server antwortet nicht. Verbindung prüfen und erneut laden."
          : "Sensoren konnten nicht geladen werden. Verbindung prüfen.", 5000);
      }
    } finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => {
    loadSensors(false);
    const iv = setInterval(() => loadSensors(true), 3000);
    return () => clearInterval(iv);
  }, [loadSensors]);

  const handleChange = useCallback((device, kanal, value) =>
    setLabels(prev => ({ ...prev, [scKey(device, kanal)]: value })), []);

  const dirtyKeys = Object.keys(saved).filter(key => (labels[key] ?? "") !== (saved[key] ?? ""));
  const dirtyCount = dirtyKeys.length;

  const discardAll = () => setLabels(prev => ({ ...prev, ...savedRef.current }));
  const discardSensor = useCallback((device) => {
    setLabels(prev => {
      const next = { ...prev };
      SC_KANAEL.forEach(k => { const key = scKey(device, k); next[key] = savedRef.current[key] ?? ""; });
      return next;
    });
  }, []);

  // Enregistre uniquement les champs modifiés (moins de requêtes)
  const saveAll = async () => {
    if (dirtyCount === 0 || saving) return;
    setSaving(true);
    const results = await Promise.allSettled(dirtyKeys.map(key => {
      const { device, kanal } = scSplitKey(key);
      return axios.post(`${API_BASE_URL}/kundendaten-labels`, { device, kanal, label: (labels[key] || "").trim() });
    }));
    const failed = results.filter(r => r.status === "rejected").length;
    const ok = results.length - failed;
    if (failed === 0) flash("success", `${ok} Bezeichnung${ok > 1 ? "en" : ""} gespeichert`);
    else flash("error", `${ok} gespeichert, ${failed} fehlgeschlagen. Erneut speichern.`, 5000);
    setSaving(false);
    loadSensors(true);
  };

  // Raccourci clavier Strg+S / Cmd+S
  const saveRef = useRef(saveAll);
  saveRef.current = saveAll;
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Avertit avant de quitter la page avec des changements non enregistrés
  useEffect(() => {
    if (dirtyCount === 0) return;
    const onUnload = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirtyCount]);

  if (loading) return <Typography sx={{ p: 3, color: INK_MUTED }}>Sensoren werden geladen…</Typography>;

  const q = search.trim().toLowerCase();
  const visible = q
    ? sensors.filter(s => s.device.toLowerCase().includes(q) ||
        SC_KANAEL.some(k => (labels[scKey(s.device, k)] || "").toLowerCase().includes(q)))
    : sensors;
  const activeKanaele = sensors.reduce((n, s) => n + s.kanaele.length, 0);

  return (
    <Box sx={{ mt: 1, pb: dirtyCount > 0 ? 10 : 2 }}>
      {/* En-tête */}
      <Paper elevation={0} sx={{ p: { xs: 2, md: "18px 22px" }, mb: 2, bgcolor: PANEL, position: "relative", overflow: "hidden" }}>
        <Box sx={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, bgcolor: BRAND }} />
        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Box display="flex" alignItems="center" gap={1.4}>
            <Box sx={{ display: "inline-flex", width: 44, height: 44, borderRadius: "10px", bgcolor: BRAND_BG, alignItems: "center", justifyContent: "center" }}>
              <DeviceHubIcon sx={{ fontSize: 24, color: BRAND }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ color: INK, lineHeight: 1.2 }}>Sensor-Bezeichnung</Typography>
              <Typography variant="body2" sx={{ color: INK_MUTED }}>
                Jedem Kanal einen eindeutigen Namen geben. Strom und Leistung helfen beim Zuordnen.
              </Typography>
            </Box>
          </Box>
          <Box display="flex" gap={1} flexWrap="wrap">
            <Chip size="small" label={`${sensors.length} Sensoren`} sx={{ bgcolor: SURFACE, color: INK }} />
            <Chip size="small" label={`${activeKanaele} Kanäle aktiv`} sx={{ bgcolor: SUCCESS_BG, color: SUCCESS }} />
            <Chip size="small" icon={<SyncIcon sx={{ fontSize: "13px !important" }} />} label="Live, alle 3 s"
              sx={{ bgcolor: SURFACE, color: INK_MUTED }} />
          </Box>
        </Box>
        <TextField size="small" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Sensor oder Bezeichnung suchen"
          inputProps={{ spellCheck: false, autoComplete: "off" }}
          sx={{ mt: 2, width: { xs: "100%", sm: 360 }, "& .MuiOutlinedInput-root": { borderRadius: "8px", bgcolor: SURFACE } }} />
      </Paper>

      {message && <Alert severity={messageType === "success" ? "success" : "error"} sx={{ mb: 2, borderRadius: 2 }}>{message}</Alert>}

      {sensors.length === 0 ? (
        <Paper elevation={0} sx={{ p: 3, bgcolor: PANEL }}>
          <Typography sx={{ color: INK, fontWeight: 700 }}>Keine Sensoren erkannt</Typography>
          <Typography variant="body2" sx={{ color: INK_MUTED, mt: 0.5 }}>
            Verkabelung am RS485-Bus prüfen. Die Liste aktualisiert sich automatisch.
          </Typography>
        </Paper>
      ) : visible.length === 0 ? (
        <Typography sx={{ color: INK_MUTED, p: 1 }}>Kein Treffer für „{search}“.</Typography>
      ) : (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(620px, 1fr))" }}>
          {visible.map(s => (
            <ScSensorPanel key={s.device} sensor={s} labels={labels} saved={saved}
              onChange={handleChange} onDiscardSensor={discardSensor} isMobile={isMobile} />
          ))}
        </Box>
      )}

      {/* Barre d'enregistrement : apparaît uniquement s'il y a des changements */}
      {dirtyCount > 0 && (
        <Box sx={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 1200,
          bgcolor: READOUT_BG, color: "#fff",
          px: { xs: 2, md: 5 }, py: 1.5,
          display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap",
          borderTop: `3px solid ${WARNING}`,
        }}>
          <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "#F2B544" }} />
          <Typography sx={{ fontWeight: 700 }}>
            {dirtyCount} ungespeicherte Änderung{dirtyCount > 1 ? "en" : ""}
          </Typography>
          <Typography variant="body2" sx={{ color: "#8A97A4", display: { xs: "none", sm: "block" } }}>
            Strg+S zum Speichern
          </Typography>
          <Box flex={1} />
          <Button onClick={discardAll} disabled={saving} sx={{ color: "#C9D2DB", borderRadius: 20 }}>Verwerfen</Button>
          <Button variant="contained" onClick={saveAll} disabled={saving} startIcon={<SaveIcon />}
            sx={{ bgcolor: SUCCESS, borderRadius: 20, boxShadow: "none", "&:hover": { bgcolor: "#166B48", boxShadow: "none" } }}>
            {saving ? "Wird gespeichert…" : "Änderungen speichern"}
          </Button>
        </Box>
      )}
    </Box>
  );
};

// ✅ Palette de couleurs professionnelles, une par canal (CH1-CH18), utilisée
// dans Kanal Zähler pour repérer visuellement chaque canal.
const CHANNEL_COLOR_PALETTE = [
  "#1976d2", "#2e7d32", "#e65100", "#6a1b9a", "#00838f", "#c2185b",
  "#5d4037", "#455a64", "#f9a825", "#00695c", "#4527a0", "#ad1457",
  "#37474f", "#6d4c41", "#0277bd", "#558b2f", "#ef6c00", "#8e24aa",
];
const getChannelColor = (channel) => {
  const num = parseInt(String(channel).replace(/\D/g, ""), 10);
  if (isNaN(num)) return INK_MUTED;
  return CHANNEL_COLOR_PALETTE[(num - 1) % CHANNEL_COLOR_PALETTE.length];
};

// ─── ENERGIE-MANAGER ──────────────────────────────────────────────────────────
const EnergyManager = () => {
  const [energyData, setEnergyData]                         = useState({});
  const [loading, setLoading]                               = useState(true);
  const [selectedEnergyChannels, setSelectedEnergyChannels] = useState([]);
  const [globalEnergyValue, setGlobalEnergyValue]           = useState("");
  const [message, setMessage]                               = useState("");
  const [messageType, setMessageType]                       = useState("success");
  const [channelAnchorEl, setChannelAnchorEl]               = useState(null);
  const isMobile = useMediaQuery("(max-width:600px)");

  const loadEnergyData = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/energy-values`);
      setEnergyData({ ...res.data });
      return res.data;
    } catch {
      setMessageType("error");
      setMessage("❌ Fehler beim Laden der Energiedaten");
      setTimeout(() => setMessage(""), 5000);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    loadEnergyData();
    const interval = setInterval(loadEnergyData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectAllEnergyChannels = () => {
    const all = Object.keys(energyData);
    setSelectedEnergyChannels(prev => prev.length === all.length ? [] : all);
  };

  const handleEnergyChannelToggle = ch =>
    setSelectedEnergyChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);

  const sendGlobalEnergyValue = async () => {
    const value = parseFloat(globalEnergyValue);
    if (isNaN(value) || value < 0) {
      setMessageType("error"); setMessage("❌ Ungültiger Wert (muss ≥ 0 sein)");
      setTimeout(() => setMessage(""), 3000); return;
    }
    if (selectedEnergyChannels.length === 0) {
      setMessageType("error"); setMessage("❌ Bitte wählen Sie mindestens einen Kanal aus");
      setTimeout(() => setMessage(""), 3000); return;
    }
    setLoading(true);
    let successCount = 0, errorCount = 0;

    for (const channel of selectedEnergyChannels) {
      try {
        await axios.post(`${API_BASE_URL}/energy-values/set`, { [channel]: { temporary: value } });
        successCount++;
      } catch (err) { errorCount++; console.error(`Fehler bei ${channel}:`, err); }
    }

    // ✅ Mettre à jour le state local immédiatement
    setEnergyData(prev => {
      const updated = { ...prev };
      for (const channel of selectedEnergyChannels) {
        updated[channel] = {
          ...updated[channel],
          temporary: value,
          updatedAt: new Date().toISOString()
        };
      }
      return updated;
    });

    setMessageType(errorCount === 0 ? "success" : "error");
    setMessage(errorCount === 0
      ? `✅ ${successCount} Kanäle auf ${value.toFixed(2)} kWh gesetzt`
      : `⚠️ ${successCount} OK, ${errorCount} Fehler`);
    setTimeout(() => setMessage(""), 3000);

    setLoading(false);
    setGlobalEnergyValue("");

    // ✅ Relire depuis le serveur après 3s
    setTimeout(() => loadEnergyData(), 3000);
  };

  if (loading && Object.keys(energyData).length === 0)
    return <Typography sx={{ p: 3, color: INK_MUTED }}>Energiedaten werden geladen...</Typography>;
  if (!energyData || typeof energyData !== "object" || Object.keys(energyData).length === 0)
    return <Typography sx={{ p: 3, color: INK_MUTED }}>Keine Daten verfügbar...</Typography>;

  const entries       = Object.entries(energyData);
  const allChannels   = Object.keys(energyData);
  const selectedCount = selectedEnergyChannels.length;
  const totalCount    = allChannels.length;
  const groups        = [
    { channels: entries.slice(0, 6),   bgColor: SURFACE, title: "Kanäle A-F"   },
    { channels: entries.slice(6, 12),  bgColor: '#EEF1F4', title: "Kanäle G-L"  },
    { channels: entries.slice(12, 18), bgColor: '#F8F9FA', title: "Kanäle M-R" },
  ];

  return (
    <Paper elevation={0} sx={{ p: 3, mt: 3, bgcolor: PANEL }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <Box display="flex" alignItems="center" gap={1}>
          <BatteryChargingFullIcon sx={{ color: SUCCESS }} />
          <Typography variant="h5" sx={{ color: INK }}>Kanal Zähler</Typography>
        </Box>
        <Button variant="outlined" onClick={loadEnergyData} startIcon={<UpdateIcon />} sx={{ borderColor: BORDER, color: INK, borderRadius: 20 }}>Aktualisieren</Button>
      </Box>
      {message && <Alert severity={messageType === "success" ? "success" : "error"} sx={{ mb: 2, borderRadius: 2 }}>{message}</Alert>}

      <Paper elevation={0} sx={{ p: 2, mb: 3, bgcolor: SURFACE }}>
        <Typography variant="subtitle1" sx={{ mb: 2, color: INK, fontWeight: 700 }}>Kanäle filtern / auswählen</Typography>
        <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
          <Button variant="outlined" onClick={e => { e.stopPropagation(); setChannelAnchorEl(e.currentTarget); }}
            endIcon={<span>▼</span>} sx={{ minWidth: 200, borderColor: BORDER, color: INK, bgcolor: PANEL }}>
            {selectedCount === 0 ? "Keine Kanäle" : selectedCount === totalCount ? "Alle Kanäle" : `${selectedCount} Kanäle`}
          </Button>
          <Popover open={Boolean(channelAnchorEl)} anchorEl={channelAnchorEl}
            onClose={() => setChannelAnchorEl(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            disableAutoFocus disableEnforceFocus keepMounted>
            <Box sx={{ p: 2, minWidth: 250, maxWidth: 350 }}>
              <FormControlLabel
                control={<Checkbox checked={selectedCount === totalCount} indeterminate={selectedCount > 0 && selectedCount < totalCount} onChange={handleSelectAllEnergyChannels} />}
                label="Alle Kanäle" />
              <Divider sx={{ my: 1 }} />
              <Box sx={{ maxHeight: 300, overflow: "auto" }}>
                {allChannels.map(ch => {
                  const chLabel = energyData[ch]?.label;
                  const displayText = (chLabel && chLabel !== ch)
                    ? <>{<ChannelLabel channel={ch} />} – {chLabel}</>
                    : <ChannelLabel channel={ch} />;
                  return (
                    <FormControlLabel key={ch}
                      control={<Checkbox checked={selectedEnergyChannels.includes(ch)} onChange={() => handleEnergyChannelToggle(ch)} />}
                      label={
                        <Box display="flex" alignItems="center" gap={1}>
                          <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: getChannelColor(ch), flexShrink: 0 }} />
                          <span>{displayText}</span>
                        </Box>
                      }
                      sx={{ display: "block" }} />
                  );
                })}
              </Box>
            </Box>
          </Popover>
          <TextField type="number" size="small" label="Wert (kWh)" value={globalEnergyValue}
            onChange={e => setGlobalEnergyValue(e.target.value)}
            inputProps={{ step: "0.1", style: { width: 120 } }} sx={{ flex: 1, bgcolor: PANEL, borderRadius: 1 }} />
          <Button variant="contained" onClick={sendGlobalEnergyValue}
            disabled={loading || selectedEnergyChannels.length === 0 || globalEnergyValue === ""}
            sx={{ bgcolor: SUCCESS, boxShadow: 'none', borderRadius: 20, '&:hover': { bgcolor: '#166B48', boxShadow: 'none' } }}>
            Absenden
          </Button>
        </Box>
        <Typography variant="caption" sx={{ mt: 1, display: "block", color: INK_MUTED }}>
          Wählen Sie Kanäle aus, geben Sie einen Wert ein und klicken Sie auf "Absenden".
        </Typography>
      </Paper>

      {groups.map((group, idx) => (
        <Box key={idx} sx={{ mb: 3, p: 2, borderRadius: 2, backgroundColor: group.bgColor, border: `1px solid ${BORDER}`, overflowX: "auto" }}>
          <Typography variant="subtitle1" sx={{ mb: 1, color: INK, fontWeight: 700 }}>{group.title}</Typography>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 500 : "auto" }}>
            <thead>
              <tr style={{ backgroundColor: "rgba(17,24,39,0.04)" }}>
                <th style={{ padding: "8px", textAlign: "left", color: INK_MUTED, fontSize: '0.8rem' }}>Kanal</th>
                <th style={{ padding: "8px", textAlign: "left", color: INK_MUTED, fontSize: '0.8rem' }}>Bezeichnung</th>
                <th style={{ padding: "8px", textAlign: "center", color: INK_MUTED, fontSize: '0.8rem' }}>Energie (kWh)</th>
                <th style={{ padding: "8px", textAlign: "center", color: INK_MUTED, fontSize: '0.8rem' }}>Letzte Änderung</th>
              </tr>
            </thead>
            <tbody>
              {group.channels.map(([channel, data_]) => {
                const isSelected  = selectedEnergyChannels.includes(channel);
                const lastUpdated = data_?.updatedAt ? new Date(data_.updatedAt) : null;
                return (
                  <tr key={channel} style={{ borderBottom: `1px solid ${BORDER}`, borderLeft: `4px solid ${getChannelColor(channel)}`, backgroundColor: isSelected ? SUCCESS_BG : "transparent" }}>
                    <td style={{ padding: "8px", fontWeight: 700, fontFamily: MONO_FONT, color: INK }}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Box sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: getChannelColor(channel), flexShrink: 0 }} />
                        <ChannelLabel channel={channel} />
                      </Box>
                    </td>
                    <td style={{ padding: "8px" }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: INK }}>{data_?.label || <ChannelLabel channel={channel} />}</Typography>
                    </td>
                    <td style={{ padding: "8px", textAlign: "center" }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: ACCENT, fontFamily: MONO_FONT }}>
                        {(data_?.temporary || 0).toFixed(2)} kWh
                      </Typography>
                    </td>
                    <td style={{ padding: "8px", textAlign: "center", fontSize: "0.75rem" }}>
                      {lastUpdated && !isNaN(lastUpdated.getTime()) ? (
                        <>
                          <Typography variant="caption" component="div" sx={{ color: INK }}>{lastUpdated.toLocaleDateString()}</Typography>
                          <Typography variant="caption" component="div" sx={{ color: INK_MUTED }}>{lastUpdated.toLocaleTimeString()}</Typography>
                        </>
                      ) : <Typography variant="caption" sx={{ color: INK_MUTED }}>—</Typography>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
      ))}
    </Paper>
  );
};

// ─── MAPPING METRIC OPTIONS ─────────────────────────────────────────────────
const MAPPING_METRIC_OPTIONS = [
  { value: "Strom",         label: "Strom (A)",          icon: ElectricBoltIcon,        decimals: 3, unit: "A"   },
  { value: "CosinusPhi",    label: "Cosinus Phi",         icon: FunctionsIcon,           decimals: 4, unit: ""    },
  { value: "Wirkleistung",  label: "Wirkleistung (W)",    icon: SpeedIcon,               decimals: 2, unit: "W"   },
  { value: "Blindleistung", label: "Blindleistung (var)", icon: FlashOnIcon,             decimals: 2, unit: "var" },
  { value: "Scheinleistung",label: "Scheinleistung (VA)", icon: TimelineIcon,            decimals: 2, unit: "VA"  },
  { value: "Spannung",      label: "Spannung (V)",        icon: VoltageSvgIcon,          decimals: 1, unit: "V"   },
  { value: "Energie",       label: "Energie (kWh)",       icon: BatteryChargingFullIcon, decimals: 2, unit: "kWh" },
];
const MAPPING_METRIC_LABELS = {
  Strom:          "Strom (A)",
  CosinusPhi:     "Cosinus Phi",
  // ✅ "CosPhi" = nom du champ InfluxDB réel, utilisé par le graphique historique
  CosPhi:         "Cosinus Phi",
  Wirkleistung:   "Wirkleistung (W)",
  Blindleistung:  "Blindleistung (var)",
  Scheinleistung: "Scheinleistung (VA)",
  Spannung:       "Spannung (V)",
  Energie:        "Energie (kWh)",
};
// ✅ Métriques avec historique réel par capteur/canal
const MAPPING_HISTORY_METRIC_LABELS = {
  Strom:         "Strom (A)",
  Wirkleistung:  "Wirkleistung (W)",
  Blindleistung: "Blindleistung (var)",
  CosPhi:        "Cosinus Phi",
  Energie:       "Energie (kWh)",
};
const KANAL_LABELS = { "1": "L1", "2": "L2", "3": "L3", "4": "N" };
const KANAL_OPTIONS = ["1", "2", "3", "4"];
// ✅ Couleur par Kanal = couleur réelle du conducteur :
// Kanal 1 = Braun, Kanal 2 = Schwarz, Kanal 3 = Grau, Kanal 4 = Blau.
const KANAL_COLORS = { "1": "#795548", "2": "#000000", "3": "#757575", "4": "#1976d2" };

// ─── MAPPING DETAIL (historique d'un Sensor/Kanal) ──────────────────────────
const MappingDetail = ({ device, kanaele, initialKanal, onBack }) => {
  const [selectedKanal, setSelectedKanal]   = useState(initialKanal);
  const [selectedMetric, setSelectedMetric] = useState("Strom");
  const [timeRange, setTimeRange]           = useState("5m");
  const [historyData, setHistoryData]       = useState([]);
  const [isMouseOverGraph, setIsMouseOverGraph] = useState(false);
  const [kanalAnchorEl, setKanalAnchorEl]   = useState(null);
  const [metricAnchorEl, setMetricAnchorEl] = useState(null);
  const [timeAnchorEl, setTimeAnchorEl]     = useState(null);

  const currentKanalData = kanaele.find(k => k.kanal === selectedKanal) || {};

  useEffect(() => {
    if (!selectedKanal) return;
    let cancelled = false;
    const update = async () => {
      try {
        const res = await axios.get(
          `${API_BASE_URL}/sensor-history/${device}/${selectedKanal}?metric=${selectedMetric}&time=${timeRange}`
        );
        if (!cancelled && res.data?.data) {
          // ✅ "Energie" déjà en kWh — aucune conversion
          setHistoryData(res.data.data);
        }
      } catch (err) { console.error("Erreur historique sensor-history:", err); }
    };
    update();
    const iv = setInterval(() => { if (!isMouseOverGraph) update(); }, 1000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [device, selectedKanal, selectedMetric, timeRange, isMouseOverGraph]);

  const formatXAxis  = tick => new Date(tick).toLocaleTimeString();
  const getTimeLabel = () => TIME_RANGE_OPTIONS.find(o => o.value === timeRange)?.label || timeRange;

  return (
    <Box>
      <Paper elevation={0} sx={{ p: 2, mb: 2, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", bgcolor: PANEL }}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack} variant="outlined" sx={{ borderColor: BORDER, color: INK }}>
          Zurück zum Menü
        </Button>
        <Typography variant="h5" sx={{ color: INK }}>{device}</Typography>

        <Button variant="outlined" onClick={e => setKanalAnchorEl(e.currentTarget)}
          endIcon={<span>▼</span>} sx={{ minWidth: 130, borderColor: KANAL_COLORS[selectedKanal] || BORDER, color: INK }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: KANAL_COLORS[selectedKanal] || INK_MUTED, mr: 1 }} />
          <span style={{ fontWeight: currentKanalData.Bezeichnung ? 700 : 400 }}>
            {currentKanalData.Bezeichnung ? currentKanalData.Bezeichnung : (KANAL_LABELS[selectedKanal] || selectedKanal)}
          </span>
          &nbsp;(Kanal {selectedKanal})
        </Button>
        <Menu anchorEl={kanalAnchorEl} open={Boolean(kanalAnchorEl)} onClose={() => setKanalAnchorEl(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }} transformOrigin={{ vertical: "top", horizontal: "left" }}
          disableAutoFocus disableEnforceFocus disableScrollLock>
          {kanaele.map(k => (
            <MenuItem key={k.kanal} onClick={e => { e.stopPropagation(); setSelectedKanal(k.kanal); }}
              selected={selectedKanal === k.kanal} sx={{ borderRadius: 1 }}>
              <Checkbox checked={selectedKanal === k.kanal} size="small" />
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: KANAL_COLORS[k.kanal] || INK_MUTED, mr: 1 }} />
              <ListItemText primary={`${k.Bezeichnung ? k.Bezeichnung : (KANAL_LABELS[k.kanal] || k.kanal)} (Kanal ${k.kanal})`} />
            </MenuItem>
          ))}
        </Menu>

        <Button variant="outlined" onClick={e => setMetricAnchorEl(e.currentTarget)}
          endIcon={<span>▼</span>} sx={{ minWidth: 150, borderColor: BORDER, color: INK }}>
          {MAPPING_METRIC_LABELS[selectedMetric]}
        </Button>
        <Menu anchorEl={metricAnchorEl} open={Boolean(metricAnchorEl)} onClose={() => setMetricAnchorEl(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }} transformOrigin={{ vertical: "top", horizontal: "left" }}
          disableAutoFocus disableEnforceFocus disableScrollLock>
          {Object.entries(MAPPING_HISTORY_METRIC_LABELS).map(([key, label]) => (
            <MenuItem key={key} onClick={e => { e.stopPropagation(); setSelectedMetric(key); }}
              selected={selectedMetric === key} sx={{ borderRadius: 1 }}>
              <Checkbox checked={selectedMetric === key} size="small" />
              <ListItemText primary={label} />
            </MenuItem>
          ))}
        </Menu>

        <Button variant="outlined" onClick={e => setTimeAnchorEl(e.currentTarget)}
          endIcon={<span>▼</span>} sx={{ minWidth: 150, borderColor: BORDER, color: INK }}>
          {getTimeLabel()}
        </Button>
        <Menu anchorEl={timeAnchorEl} open={Boolean(timeAnchorEl)} onClose={() => setTimeAnchorEl(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }} transformOrigin={{ vertical: "top", horizontal: "left" }}
          disableAutoFocus disableEnforceFocus disableScrollLock>
          {TIME_RANGE_OPTIONS.map(opt => (
            <MenuItem key={opt.value} onClick={e => { e.stopPropagation(); setTimeRange(opt.value); }}
              selected={timeRange === opt.value} sx={{ borderRadius: 1 }}>
              <Checkbox checked={timeRange === opt.value} size="small" />
              <ListItemText primary={opt.label} />
            </MenuItem>
          ))}
        </Menu>

        <Chip size="small" icon={<SyncIcon sx={{ fontSize: '13px !important' }} />}
          label={isMouseOverGraph ? "Pause (Maus über Grafik)" : "Aktualisierung jede Sekunde"}
          sx={{ bgcolor: SURFACE, color: INK_MUTED }} />
      </Paper>

      <Box display="flex" gap={2} sx={{ mb: 2, flexWrap: "wrap" }}>
        {MAPPING_METRIC_OPTIONS.map(m => (
          <Paper key={m.value} elevation={0} sx={{ flex: 1, minWidth: 150, p: 0, textAlign: "center", overflow: 'hidden', bgcolor: PANEL }}>
            <Typography variant="caption" sx={{ color: INK_MUTED, display: 'block', pt: 1.2 }}>{m.label}</Typography>
            <Box sx={{ mx: 1.2, my: 1.2, bgcolor: READOUT_BG, borderRadius: '8px', py: 1.4 }}>
              <Typography variant="h6" sx={{ fontFamily: MONO_FONT, fontWeight: 700, color: '#7CC7E8' }}>
                {formatMappingMetricValue(m, currentKanalData[m.value])}
              </Typography>
            </Box>
          </Paper>
        ))}
      </Box>

      <Paper elevation={0} sx={{ p: 2, height: "55vh", bgcolor: PANEL }}
        onMouseEnter={() => setIsMouseOverGraph(true)} onMouseLeave={() => setIsMouseOverGraph(false)}>
        {historyData.length === 0 ? (
          <Typography align="center" sx={{ color: INK_MUTED }}>Keine historischen Daten.</Typography>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid stroke={BORDER} strokeDasharray="5 5" />
              <XAxis dataKey="time" tickFormatter={formatXAxis} angle={-30} textAnchor="end" height={60}
                tick={{ fontSize: 11, fill: INK_MUTED }} axisLine={{ stroke: BORDER, strokeWidth: 1 }} />
              <YAxis tick={{ fontSize: 11, fill: INK_MUTED }} axisLine={{ stroke: BORDER, strokeWidth: 1 }}
                label={{ value: MAPPING_METRIC_LABELS[selectedMetric], angle: -90, position: "insideLeft",
                  style: { textAnchor: "middle", fill: INK_MUTED, fontSize: 12 } }} />
              <Tooltip labelFormatter={t => new Date(t).toLocaleString()}
                wrapperStyle={{ pointerEvents: "auto" }}
                contentStyle={{ backgroundColor: PANEL, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
              <Line type="monotone" dataKey={selectedMetric} stroke={ACCENT} strokeWidth={2.5}
                name={MAPPING_METRIC_LABELS[selectedMetric]} dot={false} isAnimationActive={false}
                connectNulls activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Paper>
    </Box>
  );
};

// ─── MAPPING MANAGER (boxes style Echtzeit + filtres + détail) ──────────────
const MappingManager = () => {
  const [sensors, setSensors]                       = useState([]);
  const [loading, setLoading]                       = useState(true);
  const [refreshing, setRefreshing]                 = useState(false);
  const [message, setMessage]                       = useState("");
  const [messageType, setMessageType]               = useState("success");
  const [selectedSensors, setSelectedSensors]       = useState([]);
  const [selectedMappingMetrics, setSelectedMappingMetrics] = useState([]);
  const [selectedKanaele, setSelectedKanaele]       = useState([]);
  const [kanalAnchorEl, setKanalAnchorEl]           = useState(null);
  const [detailDevice, setDetailDevice]             = useState(null);
  const [detailKanal, setDetailKanal]               = useState(null);
  const isMobile = useMediaQuery("(max-width:600px)");

  // ✅ /sensors-connected : vrai nombre de capteurs sur le bus RS485 ("Netz" exclu)
  const loadSensors = async (isManualRefresh = false, silent = false) => {
    if (isManualRefresh) setRefreshing(true);
    else if (!silent) setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/sensors-connected`);
      setSensors(res.data?.sensors || []);
      if (isManualRefresh) {
        setMessageType("success");
        setMessage(`✅ ${res.data?.count || 0} Sensor(en) erkannt`);
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (err) {
      if (!silent) {
        setMessageType("error");
        setMessage("❌ Fehler beim Abrufen der Sensoren: " + (err.message || "Netzwerkproblem"));
        setTimeout(() => setMessage(""), 5000);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadSensors(false); }, []);

  // ✅ Rafraîchissement silencieux toutes les secondes
  useEffect(() => {
    const iv = setInterval(() => loadSensors(false, true), 1000);
    return () => clearInterval(iv);
  }, []);

  const netzDevice   = sensors.find(s => s.device === "Netz" || s.device === "Sensor0");
  const otherSensors = sensors.filter(s => s !== netzDevice);
  const getNetzVoltage = (kanalNum) => {
    if (!netzDevice) return null;
    const k = netzDevice.kanaele.find(k => k.kanal === String(kanalNum));
    return k?.Spannung ?? null;
  };

  const allDeviceNames = otherSensors.map(s => s.device);
  const hasActiveFilters = selectedSensors.length > 0 || selectedMappingMetrics.length > 0 || selectedKanaele.length > 0;

  const handleSensorChange     = useCallback(e => setSelectedSensors(e.target.value), []);
  const handleSelectAllSensors = useCallback(() => setSelectedSensors(prev => prev.length === allDeviceNames.length ? [] : [...allDeviceNames]), [allDeviceNames]);
  const handleMetricChange     = useCallback(e => setSelectedMappingMetrics(e.target.value), []);
  const handleSelectAllMetrics = useCallback(() => setSelectedMappingMetrics(prev => prev.length === MAPPING_METRIC_OPTIONS.length ? [] : MAPPING_METRIC_OPTIONS.map(m => m.value)), []);
  const resetMappingFilters    = useCallback(() => { setSelectedSensors([]); setSelectedMappingMetrics([]); setSelectedKanaele([]); }, []);

  const handleKanalToggle = (k) => {
    setSelectedKanaele(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  };
  const handleSelectAllKanaele = () => {
    setSelectedKanaele(prev => prev.length === KANAL_OPTIONS.length ? [] : [...KANAL_OPTIONS]);
  };
  const selKaCount = selectedKanaele.length;
  const totKaCount = KANAL_OPTIONS.length;

  const shouldShowSensor = device => selectedSensors.length === 0 || selectedSensors.includes(device);
  const shouldShowMetric = key    => selectedMappingMetrics.length === 0 || selectedMappingMetrics.includes(key);
  const shouldShowKanal  = kanal  => selectedKanaele.length === 0 || selectedKanaele.includes(kanal);

  // ✅ Reset logiciel du compteur Energie (baseline soustraite côté serveur)
  const [resetTarget, setResetTarget]   = useState(null);
  const [resetLoading, setResetLoading] = useState(false);

  // ✅ Retire toute adresse IP d'un message d'erreur affiché
  const stripIps = (text) =>
    String(text || "")
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b(:\d+)?/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  const handleResetEnergieClick = (device, kanal, e) => {
    e.stopPropagation();
    setResetTarget({ device, kanal });
  };

  const confirmResetEnergie = async () => {
    if (!resetTarget) return;
    const { device, kanal } = resetTarget;
    setResetLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/energie-reset`, { device, kanal });
      setMessageType("success");
      setMessage(`✅ Energiezähler für ${device}, Kanal ${kanal} wurde zurückgesetzt.`);
      setTimeout(() => setMessage(""), 3000);
      loadSensors(false);
    } catch (err) {
      setMessageType("error");
      setMessage("❌ Der Energiezähler konnte nicht zurückgesetzt werden. " + stripIps(err.message || "Bitte erneut versuchen."));
      setTimeout(() => setMessage(""), 5000);
    } finally {
      setResetLoading(false);
      setResetTarget(null);
    }
  };

  if (detailDevice) {
    const sensorObj = otherSensors.find(s => s.device === detailDevice);
    if (sensorObj) {
      return (
        <MappingDetail
          device={sensorObj.device}
          kanaele={sensorObj.kanaele}
          initialKanal={detailKanal || sensorObj.kanaele[0]?.kanal}
          onBack={() => { setDetailDevice(null); setDetailKanal(null); }}
        />
      );
    }
    setDetailDevice(null);
  }

  if (loading) return <Typography sx={{ p: 3, color: INK_MUTED }}>Sensoren werden erkannt...</Typography>;

  const visibleSensors = otherSensors.filter(s => shouldShowSensor(s.device));
  const showNetzBox = Boolean(netzDevice) && (selectedSensors.length === 0) && shouldShowMetric("Spannung") && shouldShowKanal("1") && shouldShowKanal("2") && shouldShowKanal("3");

  return (
    <>
      <Paper elevation={0} sx={{ p: "16px 20px", mb: "20px", bgcolor: PANEL, position: 'relative', overflow: 'hidden' }}>
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, bgcolor: BRAND }} />
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <Box display="flex" alignItems="center" gap={1.4}>
            <Box sx={{ display: 'inline-flex', width: 44, height: 44, borderRadius: '12px', bgcolor: BRAND_BG, alignItems: 'center', justifyContent: 'center' }}>
              <DeviceHubIcon sx={{ color: BRAND, fontSize: 24 }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ color: INK, lineHeight: 1.2 }}>Mapping – Sensor-Übersicht</Typography>
              <Typography variant="caption" sx={{ color: INK_MUTED }}>Zuordnung Sensor → Kanal, live und historisch</Typography>
            </Box>
          </Box>
          <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
            <FilterBar selectedChannels={selectedSensors} selectedMetrics={selectedMappingMetrics}
              onChannelChange={handleSensorChange} onSelectAllChannels={handleSelectAllSensors}
              onMetricChange={handleMetricChange} onSelectAllMetrics={handleSelectAllMetrics}
              onResetFilters={resetMappingFilters} hasActiveFilters={hasActiveFilters}
              orderedChannels={allDeviceNames} metricOptions={MAPPING_METRIC_OPTIONS} mobileDrawer
              itemsLabel="Sensoren" />

            <Button variant="outlined" onClick={e => { e.stopPropagation(); setKanalAnchorEl(e.currentTarget); }}
              endIcon={<span>▼</span>} sx={{ minWidth: 150, borderRadius: 20, borderColor: BORDER, color: INK }}>
              {selKaCount === 0 || selKaCount === totKaCount ? "Alle Kanäle" : `${selKaCount} Kanäle`}
            </Button>
            <Popover open={Boolean(kanalAnchorEl)} anchorEl={kanalAnchorEl}
              onClose={() => setKanalAnchorEl(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
              disableAutoFocus disableEnforceFocus keepMounted>
              <Box sx={{ p: 2, minWidth: 220, maxWidth: 300 }}>
                <FormControlLabel
                  control={<Checkbox checked={selKaCount === totKaCount} indeterminate={selKaCount > 0 && selKaCount < totKaCount} onChange={handleSelectAllKanaele} />}
                  label="Alle Kanäle" />
                <Divider sx={{ my: 1 }} />
                {KANAL_OPTIONS.map(k => (
                  <FormControlLabel key={k}
                    control={<Checkbox checked={selectedKanaele.includes(k)} onChange={() => handleKanalToggle(k)} />}
                    label={
                      <Box display="flex" alignItems="center" gap={1}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: KANAL_COLORS[k] }} />
                        <span>{`${KANAL_LABELS[k] || k} (Kanal ${k})`}</span>
                      </Box>
                    } sx={{ display: "block" }} />
                ))}
              </Box>
            </Popover>

            <Button variant="outlined" onClick={() => loadSensors(true)} disabled={refreshing} startIcon={<UpdateIcon />}
              sx={{ borderRadius: 20, borderColor: BORDER, color: INK }}>
              {refreshing ? "Aktualisieren..." : "Aktualisieren"}
            </Button>
          </Box>
        </Box>
        <Typography variant="caption" sx={{ display: "block", mt: 1.5, color: INK_MUTED }}>
          Anzeige: nur Sensoren, die aktuell Daten senden.
        </Typography>
      </Paper>

      {message && <Alert severity={messageType === "success" ? "success" : "error"} sx={{ mb: 2, borderRadius: 2 }}>{message}</Alert>}

      {showNetzBox && (
        <Box display="flex" gap={2} sx={{ mb: "25px", flexDirection: isMobile ? "column" : "row" }}>
          {[{ phase: "Phase 1", kanal: 1, label: "Spannung L1" },
            { phase: "Phase 2", kanal: 2, label: "Spannung L2" },
            { phase: "Phase 3", kanal: 3, label: "Spannung L3" }].map(({ phase, kanal, label }) => (
            <Paper key={phase} elevation={0} sx={{ flex: 1, p: 0, bgcolor: PANEL, textAlign: "center", overflow: 'hidden' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, pt: 1.6 }}>
                <VoltageSvgIcon sx={{ color: BRAND, fontSize: 18 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: INK }}>{phase}</Typography>
              </Box>
              <Box sx={{ mx: 2, my: 1.6, bgcolor: READOUT_BG, borderRadius: '10px', py: 2 }}>
                <Typography sx={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: '1.8rem', color: '#7CC7E8' }}>
                  {formatValue(getNetzVoltage(kanal), 1, "V")}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: INK_MUTED, display: 'block', pb: 1.6 }}>{label}</Typography>
            </Paper>
          ))}
        </Box>
      )}

      {visibleSensors.length === 0 ? (
        <Paper elevation={0} sx={{ p: 3, bgcolor: PANEL }}>
          <Typography sx={{ color: INK_MUTED }}>
            Keine aktuell verbundenen Sensoren gefunden.
          </Typography>
        </Paper>
      ) : (
        visibleSensors.map(({ device, kanaele }) => {
          const cardMetrics = MAPPING_METRIC_OPTIONS.filter(m => m.value !== "Spannung");
          const visibleKanaele = kanaele.filter(k => shouldShowKanal(k.kanal));
          const visibleMetricsExist = cardMetrics.some(m => shouldShowMetric(m.value));
          if (!visibleMetricsExist || visibleKanaele.length === 0) return null;
          return (
            <Box key={device} sx={{ mb: "28px" }}>
              <Box display="flex" alignItems="center" gap={1} sx={{ mb: "10px" }}>
                <Box sx={{ display: 'inline-flex', width: 26, height: 26, borderRadius: '50%', bgcolor: BRAND_BG, alignItems: 'center', justifyContent: 'center' }}>
                  <DeviceHubIcon sx={{ color: BRAND, fontSize: "0.95rem" }} />
                </Box>
                <Typography variant="h6" sx={{ color: INK }}>{device}</Typography>
                <Chip size="small" label={`${visibleKanaele.length} Kanäle`} sx={{ bgcolor: SURFACE, color: INK_MUTED }} />
              </Box>
              <div style={{ display: "flex", gap: 15, flexWrap: "wrap", flexDirection: isMobile ? "column" : "row" }}>
                {visibleKanaele.map(k => (
                  <Paper key={`${device}_${k.kanal}`} elevation={0} onClick={() => { setDetailDevice(device); setDetailKanal(k.kanal); }}
                    sx={{
                      p: "12px 14px", bgcolor: PANEL, borderRadius: "12px", cursor: "pointer",
                      minWidth: isMobile ? "100%" : 220, flex: isMobile ? "1 1 100%" : "1 1 240px",
                      borderTop: `3px solid ${KANAL_COLORS[k.kanal] || BORDER}`,
                      transition: "transform 0.15s ease, box-shadow 0.15s ease",
                      "&:hover": { transform: "translateY(-3px)", boxShadow: "0 10px 24px rgba(17,24,39,0.08)" }
                    }}>
                    <Box display="flex" alignItems="center" gap={1} sx={{ mb: 1 }}>
                      <Typography variant="caption" sx={{ color: INK_MUTED, flex: 1 }}>Kanal {k.kanal}</Typography>
                    </Box>
                    <Typography variant="body1" sx={{ color: INK, fontWeight: 700, fontSize: "1rem", lineHeight: 1.2, mb: 1 }}>
                      {k.Bezeichnung ? k.Bezeichnung : (KANAL_LABELS[k.kanal] || k.kanal)}
                    </Typography>
                    <Divider sx={{ mb: 1, bgcolor: BORDER }} />
                    {cardMetrics.map(m => {
                      if (!shouldShowMetric(m.value)) return null;
                      const Icon = m.icon;
                      return (
                        <Box key={m.value} display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: "4px" }}>
                          <Box display="flex" alignItems="center" gap={0.8}>
                            <Icon sx={{ color: INK_MUTED, fontSize: "0.8rem" }} />
                            <Typography variant="caption" sx={{ color: INK_MUTED }}>{m.value === "CosinusPhi" ? "Cosinus Phi:" : m.label.split(" ")[0] + ":"}</Typography>
                          </Box>
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <ValueBadge>{formatMappingMetricValue(m, k[m.value])}</ValueBadge>
                            <Box sx={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {m.value === "Energie" && (
                                <IconButton size="small" onClick={(e) => handleResetEnergieClick(device, k.kanal, e)}
                                  sx={{ p: "3px" }} title="Zähler zurücksetzen">
                                  <RestartAltIcon sx={{ fontSize: "0.95rem", color: INK_MUTED }} />
                                </IconButton>
                              )}
                            </Box>
                          </Box>
                        </Box>
                      );
                    })}
                  </Paper>
                ))}
              </div>
            </Box>
          );
        })
      )}

      <Dialog open={Boolean(resetTarget)} onClose={() => !resetLoading && setResetTarget(null)}
        PaperProps={{ sx: { borderRadius: "16px" } }}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, pb: 1 }}>
          <Box sx={{ display: "inline-flex", width: 40, height: 40, borderRadius: "50%", bgcolor: WARNING_BG, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <RestartAltIcon sx={{ color: WARNING, fontSize: 22 }} />
          </Box>
          <Typography variant="h6" sx={{ color: INK, fontWeight: 700 }}>Energiezähler zurücksetzen</Typography>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: INK_MUTED, lineHeight: 1.6 }}>
            Möchten Sie den Energiezähler für{" "}
            <Box component="span" sx={{ fontWeight: 700, color: INK }}>
              {resetTarget?.device}, Kanal {resetTarget?.kanal}
            </Box>{" "}
            wirklich zurücksetzen?
          </Typography>
          <Typography variant="body2" sx={{ color: INK_MUTED, mt: 1.5, lineHeight: 1.6 }}>
            Die Anzeige beginnt anschließend wieder bei 0 Wh. Der interne Zähler des Messgeräts läuft im Hintergrund unverändert weiter.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setResetTarget(null)} disabled={resetLoading}
            sx={{ borderRadius: 20, color: INK_MUTED, fontWeight: 700 }}>
            Abbrechen
          </Button>
          <Button onClick={confirmResetEnergie} variant="contained" disabled={resetLoading}
            sx={{ borderRadius: 20, bgcolor: WARNING, boxShadow: "none", "&:hover": { bgcolor: "#96631A", boxShadow: "none" } }}>
            {resetLoading ? "Wird zurückgesetzt…" : "Zurücksetzen"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

// ─── HAUPTANWENDUNG ───────────────────────────────────────────────────────────
function AppContent() {
  const [data, setData]                                     = useState({});
  const [loading, setLoading]                               = useState(true);
  const [selectedChannels, setSelectedChannels]             = useState([]);
  const [selectedMetrics, setSelectedMetrics]               = useState([]);
  const [trendSelectedChannels, setTrendSelectedChannels]   = useState([]);
  const [trendSelectedMetrics, setTrendSelectedMetrics]     = useState([]);
  const [view, setView]                                     = useState("dashboard");
  const [selectedChannel, setSelectedChannel]               = useState(null);
  const [historyData, setHistoryData]                       = useState([]);
  const [selectedMetric, setSelectedMetric]                 = useState("Strom");
  const [timeRange, setTimeRange]                           = useState("5m");
  const [isMouseOverGraph, setIsMouseOverGraph]             = useState(false);
  const [orderedChannels, setOrderedChannels]               = useState([]);
  const [voltages, setVoltages]                             = useState({ L1: 0, L2: 0, L3: 0 });
  const isMobile = useMediaQuery("(max-width:600px)");

  useEffect(() => {
    const params    = new URLSearchParams(window.location.search);
    const viewParam = params.get("view");
    // ✅ "mapping" et "sensorconfig" accessibles via le portail externe
    if (["config", "graphMenu", "dashboard", "energy", "mapping", "sensorconfig"].includes(viewParam)) setView(viewParam);
  }, []);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/config`)
      .then(res => {
        const keys = Object.keys(res.data).filter(k => !k.startsWith("L"));
        setOrderedChannels(keys.length > 0 ? keys : CHANNEL_ORDER);
      })
      .catch(() => setOrderedChannels(CHANNEL_ORDER));
  }, []);

  const fetchVoltages = async () => {
    try { const res = await axios.get(`${API_BASE_URL}/voltages`); setVoltages(res.data); }
    catch (err) { console.error("Erreur tensions:", err); }
  };

  useEffect(() => {
    fetchVoltages();
    const iv = setInterval(fetchVoltages, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try { const res = await axios.get(`${API_BASE_URL}/data`); setData(res.data); setLoading(false); }
      catch (err) { console.error(err); setLoading(false); }
    };
    fetchData();
    const iv = setInterval(fetchData, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (view !== "graphDetail" || !selectedChannel || isMouseOverGraph) return;
    const update = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/history/${selectedChannel}?time=${timeRange}`);
        if (res.data?.data) setHistoryData(res.data.data);
      } catch (err) { console.error("Erreur historique:", err); }
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [view, selectedChannel, timeRange, isMouseOverGraph]);

  const handleOpenGraph = (channel) => { setSelectedChannel(channel); setView("graphDetail"); };

  const handleChannelChange      = useCallback(e => setSelectedChannels(e.target.value), []);
  const handleSelectAllChannels  = useCallback(() => setSelectedChannels(prev => prev.length === orderedChannels.length ? [] : [...orderedChannels]), [orderedChannels]);
  const handleMetricChange       = useCallback(e => setSelectedMetrics(e.target.value), []);
  const handleSelectAllMetrics   = useCallback(() => setSelectedMetrics(prev => prev.length === METRIC_OPTIONS.length ? [] : METRIC_OPTIONS.map(m => m.value)), []);
  const resetFilters             = useCallback(() => { setSelectedChannels([]); setSelectedMetrics([]); }, []);

  const handleTrendChannelChange     = useCallback(e => setTrendSelectedChannels(e.target.value), []);
  const handleTrendSelectAllChannels = useCallback(() => setTrendSelectedChannels(prev => prev.length === orderedChannels.length ? [] : [...orderedChannels]), [orderedChannels]);
  const handleTrendMetricChange      = useCallback(e => setTrendSelectedMetrics(e.target.value), []);
  const handleTrendSelectAllMetrics  = useCallback(() => setTrendSelectedMetrics(prev => prev.length === METRIC_OPTIONS.length ? [] : METRIC_OPTIONS.map(m => m.value)), []);
  const resetTrendFilters            = useCallback(() => { setTrendSelectedChannels([]); setTrendSelectedMetrics([]); }, []);

  const shouldShowChannel      = ch  => selectedChannels.length === 0      || selectedChannels.includes(ch);
  const shouldShowMetric       = key => selectedMetrics.length === 0       || selectedMetrics.includes(key);
  const shouldShowTrendChannel = ch  => trendSelectedChannels.length === 0 || trendSelectedChannels.includes(ch);
  const shouldShowTrendMetric  = key => trendSelectedMetrics.length === 0  || trendSelectedMetrics.includes(key);

  const grafanaUrl = "http://172.16.1.177:3000/d/adrxt9v/energie?orgId=1&from=now-30m&to=now&timezone=browser&var-Kanal=CH1%20a&refresh=5s";

  // ── NavBar ──
  const NavBar = () => (
    <Paper elevation={0} sx={{ p: isMobile ? "8px 12px" : "8px 20px", mb: "20px", bgcolor: PANEL }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={isMobile ? 1 : 0}>
        <Box display="flex" alignItems="center" gap={1}>
          <DashboardIcon sx={{ color: BRAND }} />
          <Typography variant="h6" sx={{ fontSize: isMobile ? "1rem" : "1.25rem", color: INK }}>Energy Monitor</Typography>
        </Box>
        <Box display="flex" gap={1}>
          {[
            { key: "dashboard", label: "Echtzeit", icon: <DashboardIcon /> },
            { key: "graphMenu", label: "Trends",   icon: <ShowChartIcon /> },
          ].map(btn => (
            <Button key={btn.key} variant={view === btn.key ? "contained" : "outlined"} startIcon={btn.icon}
              onClick={() => setView(btn.key)}
              sx={{
                borderRadius: 20, fontSize: isMobile ? "0.7rem" : undefined, padding: isMobile ? "4px 8px" : undefined,
                boxShadow: 'none', borderColor: BORDER, color: view === btn.key ? '#fff' : INK,
                '&:hover': { boxShadow: 'none' }
              }}
              size={isMobile ? "small" : "medium"}>{btn.label}</Button>
          ))}
          <Button variant="outlined" startIcon={<AccessTimeIcon />} onClick={() => window.open(STARTSEITE_URL, "_blank")}
            sx={{ borderRadius: 20, fontSize: isMobile ? "0.7rem" : undefined, padding: isMobile ? "4px 8px" : undefined, borderColor: ACCENT, color: ACCENT }}
            size={isMobile ? "small" : "medium"}>Startseite</Button>
        </Box>
      </Box>
    </Paper>
  );

  // ── Value Row ──
  const ValueRow = ({ metric, value, useTrendFilter = false }) => {
    if (!(useTrendFilter ? shouldShowTrendMetric(metric.value) : shouldShowMetric(metric.value))) return null;
    const Icon = metric.icon;
    return (
      <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: "6px" }}>
        <Box display="flex" alignItems="center" gap={0.8}>
          <Icon sx={{ color: INK_MUTED, fontSize: "0.85rem" }} />
          <Typography variant="caption" sx={{ color: INK_MUTED }}>
            {metric.value === "CosinusPhi" ? "Cosinus Phi:" : metric.label.split(" ")[0] + ":"}
          </Typography>
        </Box>
        <ValueBadge>{formatValue(value, metric.decimals, metric.unit)}</ValueBadge>
      </Box>
    );
  };

  // ── Channel Card ──
  const ChannelCard = ({ channel, useTrendFilter = false }) => {
    const channelData = data[channel] || {};
    const label       = channelData.Label || channel;
    const hasVisible  = METRIC_OPTIONS.some(m => useTrendFilter ? shouldShowTrendMetric(m.value) : shouldShowMetric(m.value));
    if (!hasVisible) return null;
    return (
      <Paper elevation={0} sx={{ p: "10px 12px", bgcolor: PANEL, borderRadius: "10px", mb: "10px" }}>
        <Box display="flex" alignItems="center" gap={1} sx={{ mb: 1 }}>
          <DeviceHubIcon sx={{ color: BRAND, fontSize: "0.9rem" }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: "0.85rem" }}><ChannelLabel channel={channel} /></Typography>
          <Typography variant="caption" sx={{ color: INK, fontSize: "0.9rem", fontWeight: 700, flex: 1, textAlign: "right" }}>{label}</Typography>
        </Box>
        <Divider sx={{ mb: 1, bgcolor: BORDER }} />
        {METRIC_OPTIONS.map(m => <ValueRow key={m.value} metric={m} value={channelData[m.value]} useTrendFilter={useTrendFilter} />)}
      </Paper>
    );
  };

  // ── Group Section ──
  const GroupSection = ({ channels, title, icon: Icon, useTrendFilter = false }) => {
    const filtered = channels.filter(ch => useTrendFilter ? shouldShowTrendChannel(ch) : shouldShowChannel(ch));
    if (filtered.length === 0) return null;
    return (
      <Paper elevation={0} sx={{ flex: 1, p: "16px", bgcolor: PANEL, borderRadius: "14px" }}>
        <Box display="flex" alignItems="center" justifyContent="center" gap={1} sx={{ mb: "14px" }}>
          <Box sx={{ display: 'inline-flex', width: 26, height: 26, borderRadius: '50%', bgcolor: BRAND_BG, alignItems: 'center', justifyContent: 'center' }}>
            <Icon sx={{ color: BRAND, fontSize: "0.95rem" }} />
          </Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: INK, letterSpacing: "0.3px" }}>{title}</Typography>
        </Box>
        {filtered.map(ch => <ChannelCard key={ch} channel={ch} useTrendFilter={useTrendFilter} />)}
      </Paper>
    );
  };

  // ── Dashboard ──
  const DashboardView = () => {
    const hasActiveFilters = selectedChannels.length > 0 || selectedMetrics.length > 0;
    const chunkSize = Math.ceil(orderedChannels.length / 3);
    const group1 = orderedChannels.slice(0, chunkSize);
    const group2 = orderedChannels.slice(chunkSize, chunkSize * 2);
    const group3 = orderedChannels.slice(chunkSize * 2);

    return (
      <>
        <Paper elevation={0} sx={{ p: "16px 20px", mb: "20px", bgcolor: PANEL, position: 'relative', overflow: 'hidden' }}>
          <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, bgcolor: BRAND }} />
          <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
            <Box display="flex" alignItems="center" gap={1.4}>
              <Box sx={{ display: 'inline-flex', width: 44, height: 44, borderRadius: '12px', bgcolor: BRAND_BG, alignItems: 'center', justifyContent: 'center' }}>
                <DashboardIcon sx={{ color: BRAND, fontSize: 24 }} />
              </Box>
              <Typography variant="h5" sx={{ color: INK }}>Live Daten</Typography>
            </Box>
            <FilterBar selectedChannels={selectedChannels} selectedMetrics={selectedMetrics}
              onChannelChange={handleChannelChange} onSelectAllChannels={handleSelectAllChannels}
              onMetricChange={handleMetricChange} onSelectAllMetrics={handleSelectAllMetrics}
              onResetFilters={resetFilters} hasActiveFilters={hasActiveFilters}
              orderedChannels={orderedChannels} metricOptions={METRIC_OPTIONS} mobileDrawer />
            <Button variant="outlined" href={grafanaUrl} target="_blank" startIcon={<TrendingUpIcon />}
              sx={{ borderColor: BRAND, color: BRAND, borderRadius: 20 }}>
              Grafana Dashboard
            </Button>
          </Box>
        </Paper>

        <Box display="flex" gap={2} sx={{ mb: "25px", flexDirection: isMobile ? "column" : "row" }}>
          {[{ phase: "Phase 1", voltage: voltages.L1, label: "Spannung L1" },
            { phase: "Phase 2", voltage: voltages.L2, label: "Spannung L2" },
            { phase: "Phase 3", voltage: voltages.L3, label: "Spannung L3" }].map(({ phase, voltage, label }) => (
            <Paper key={phase} elevation={0} sx={{ flex: 1, p: 0, bgcolor: PANEL, textAlign: "center", overflow: 'hidden' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, pt: 1.6 }}>
                <VoltageSvgIcon sx={{ color: BRAND, fontSize: 18 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: INK }}>{phase}</Typography>
              </Box>
              <Box sx={{ mx: 2, my: 1.6, bgcolor: READOUT_BG, borderRadius: '10px', py: 2 }}>
                <Typography sx={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: '1.8rem', color: '#7CC7E8' }}>
                  {formatValue(voltage, 1, "V")}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: INK_MUTED, display: 'block', pb: 1.6 }}>{label}</Typography>
            </Paper>
          ))}
        </Box>

        <div style={{ display: "flex", gap: 15, flexDirection: isMobile ? "column" : "row" }}>
          <GroupSection channels={group1} title="Phase 1" icon={ViewModuleIcon} />
          <GroupSection channels={group2} title="Phase 2" icon={ViewModuleIcon} />
          <GroupSection channels={group3} title="Phase 3" icon={ViewModuleIcon} />
        </div>
      </>
    );
  };

  // ── Trends Menü ──
  const GraphMenu = () => {
    const chunkSize = Math.ceil(orderedChannels.length / 3);
    const group1    = orderedChannels.slice(0, chunkSize);
    const group2    = orderedChannels.slice(chunkSize, chunkSize * 2);
    const group3    = orderedChannels.slice(chunkSize * 2);
    const hasTrendActiveFilters = trendSelectedChannels.length > 0 || trendSelectedMetrics.length > 0;

    const ChannelGraphCard = ({ channel }) => {
      const channelData = data[channel] || {};
      const label = channelData.Label || channel;
      if (!shouldShowTrendChannel(channel)) return null;
      return (
        <Paper elevation={0} onClick={() => handleOpenGraph(channel)}
          sx={{
            p: "24px 12px 20px", bgcolor: PANEL, borderRadius: "16px", mb: "16px",
            cursor: "pointer", textAlign: "center",
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
            "&:hover": { transform: "translateY(-3px)", boxShadow: "0 10px 24px rgba(17,24,39,0.08)" }
          }}>
          <Box display="flex" flexDirection="column" alignItems="center" gap={1.5}>
            <Box sx={{ display: 'inline-flex', width: 56, height: 56, borderRadius: '50%', bgcolor: BRAND_BG, alignItems: 'center', justifyContent: 'center' }}>
              <ElectricalServicesIcon sx={{ color: BRAND, fontSize: "1.7rem" }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "1rem" }}><ChannelLabel channel={channel} /></Typography>
            <Typography variant="caption" sx={{ color: INK_MUTED, fontSize: "0.85rem", fontWeight: 600 }}>{label}</Typography>
          </Box>
        </Paper>
      );
    };

    const GroupGraphSection = ({ channels, title }) => {
      const visible = channels.filter(ch => shouldShowTrendChannel(ch));
      if (visible.length === 0) return null;
      return (
        <Paper elevation={0} sx={{ flex: 1, p: "16px 8px", bgcolor: PANEL, borderRadius: "12px" }}>
          <Box display="flex" alignItems="center" justifyContent="center" gap={1} sx={{ mb: "16px" }}>
            <ViewModuleIcon sx={{ color: BRAND, fontSize: "1.2rem" }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: INK, letterSpacing: "1px", fontSize: "0.75rem" }}>{title}</Typography>
          </Box>
          {visible.map(ch => <ChannelGraphCard key={ch} channel={ch} />)}
        </Paper>
      );
    };

    return (
      <>
        <Paper elevation={0} sx={{ p: "16px 20px", mb: "20px", bgcolor: PANEL, position: 'relative', overflow: 'hidden' }}>
          <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, bgcolor: ACCENT }} />
          <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
            <Box display="flex" alignItems="center" gap={1.4}>
              <Box sx={{ display: 'inline-flex', width: 44, height: 44, borderRadius: '12px', bgcolor: ACCENT_BG, alignItems: 'center', justifyContent: 'center' }}>
                <ShowChartIcon sx={{ color: ACCENT, fontSize: 24 }} />
              </Box>
              <Typography variant="h5" sx={{ color: INK }}>Trends – Kanalübersicht</Typography>
            </Box>
            <FilterBar selectedChannels={trendSelectedChannels} selectedMetrics={trendSelectedMetrics}
              onChannelChange={handleTrendChannelChange} onSelectAllChannels={handleTrendSelectAllChannels}
              onMetricChange={handleTrendMetricChange} onSelectAllMetrics={handleTrendSelectAllMetrics}
              onResetFilters={resetTrendFilters} hasActiveFilters={hasTrendActiveFilters}
              orderedChannels={orderedChannels} metricOptions={METRIC_OPTIONS} />
          </Box>
        </Paper>
        <div style={{ display: "flex", gap: 16, flexDirection: isMobile ? "column" : "row" }}>
          <GroupGraphSection channels={group1} title="Phase 1" />
          <GroupGraphSection channels={group2} title="Phase 2" />
          <GroupGraphSection channels={group3} title="Phase 3" />
        </div>
      </>
    );
  };

  if (loading || orderedChannels.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh" sx={{ bgcolor: SURFACE }}>
        <Typography variant="h5" sx={{ color: BRAND }}>Laden...</Typography>
      </Box>
    );
  }

  return (
    <div style={{ padding: "15px 40px", backgroundColor: SURFACE, minHeight: "100vh", fontFamily: DISPLAY_FONT }}>
      <NavBar />
      {view === "dashboard"   && <DashboardView />}
      {view === "graphMenu"   && <GraphMenu />}
      {view === "graphDetail" && (
        <GraphDetail
          selectedChannel={selectedChannel}
          historyData={historyData}
          isMouseOverGraph={isMouseOverGraph}
          setIsMouseOverGraph={setIsMouseOverGraph}
          selectedMetric={selectedMetric}
          setSelectedMetric={setSelectedMetric}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          onBack={() => setView("graphMenu")}
        />
      )}
      {view === "config"       && <ChannelConfigManager />}
      {view === "energy"       && <EnergyManager />}
      {view === "mapping"      && <MappingManager />}
      {view === "sensorconfig" && <SensorConfigManager />}
    </div>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;