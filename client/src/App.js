// App_20sensors.jsx — adapté pour cascade Messkoffer + mapping CH→SensorN
// ✅ Multi-contrôleur : le paramètre ?controller=1|2 de l'URL est transmis
// automatiquement à TOUTES les requêtes vers le serveur (intercepteur axios).
import React, { useEffect, useState, useCallback, memo } from "react";
import axios from "axios";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import {
  Paper, Typography, Box, Button, Divider,
  MenuItem, Checkbox, ListItemText, TextField, Alert,
  useMediaQuery, Drawer, Badge, Popover, FormControlLabel, Menu, Chip
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
import MemoryIcon from "@mui/icons-material/Memory";
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, Legend, CartesianGrid, ResponsiveContainer
} from "recharts";

// =================== DESIGN-TOKENS (identisch zum mE2go-Hauptportal) ===================
const INK        = '#111827';
const INK_MUTED  = '#667085';
const SURFACE    = '#F3F5F7';
const PANEL      = '#FFFFFF';
const BORDER     = '#E3E6EB';
const SUCCESS    = '#1E8A5D';
const DANGER     = '#C0392B';
const WARNING    = '#B7791F';
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
const STARTSEITE_URL = "http://192.168.1.20:8080";

// ✅ Contrôleur actif lu dans l'URL (?controller=1|2, 1 par défaut) et ajouté
// automatiquement à chaque requête envoyée au serveur API.
const CONTROLLER = new URLSearchParams(window.location.search).get("controller") || "1";
axios.interceptors.request.use(cfg => {
  if (typeof cfg.url === "string" && cfg.url.startsWith(API_BASE_URL)) {
    cfg.params = { controller: CONTROLLER, ...(cfg.params || {}) };
  }
  return cfg;
});

// ✅ Affichage par phase : "CH1 a" → "Ph1 a" (affichage uniquement ; les clés
// envoyées au serveur restent "CH1 a").
const formatChannelName  = (ch) => String(ch).replace(/^CH(\d+)\s+/i, "Ph$1 ");

// ✅ Un label resté au nom par défaut ("CH1 a") s'affiche aussi en "Ph1 a".
const displayLabel = (label) =>
  typeof label === "string" && /^CH\d+\s+[a-r]$/i.test(label.trim()) ? formatChannelName(label.trim()) : label;

const getChannelParts = (ch) => {
  const m = String(ch).match(/^CH(\d+)\s+([a-r])$/i);
  return m ? { group: m[1], letter: m[2] } : null;
};

const ChannelLabel = ({ channel, letterColor = BRAND }) => {
  const parts = getChannelParts(channel);
  if (!parts) return <>{formatChannelName(channel)}</>;
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "baseline", gap: "4px" }}>
      <Box component="span" sx={{ color: INK_MUTED, fontWeight: 600, fontSize: "0.75em", letterSpacing: "0.3px" }}>Ph{parts.group}</Box>
      <Box component="span" sx={{ color: letterColor, fontWeight: 800 }}>{parts.letter}</Box>
    </Box>
  );
};

const safeDecodeLabel = (str) => {
  if (typeof str !== "string" || str.length === 0) return str;
  if (!/%[0-9A-Fa-f]{2}/.test(str)) return str;
  try {
    const viaUri = decodeURIComponent(str);
    if (viaUri !== str) return viaUri;
  } catch { /* pas de l'UTF-8 percent-encodé valide, on continue */ }
  try {
    const viaUnescape = unescape(str);
    if (viaUnescape !== str) return viaUnescape;
  } catch { /* ignore */ }
  return str;
};

const DEFAULT_CHANNELS = [
  "CH1 a", "CH1 b", "CH1 c", "CH1 d", "CH1 e", "CH1 f",
  "CH2 g", "CH2 h", "CH2 i", "CH2 j", "CH2 k", "CH2 l",
  "CH3 m", "CH3 n", "CH3 o", "CH3 p", "CH3 q", "CH3 r"
];

const METRIC_LABELS = {
  Strom:        "Strom (A)",
  Wirkleistung: "Wirkleistung (W)",
  Spannung:     "Spannung (V)",
  CosinusPhi:   "Cosinus Phi",
  Energie:      "Energie (kWh)",
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
  const num = (value === undefined || value === null) ? 0 : parseFloat(value);
  const safeNum = isNaN(num) ? 0 : num;
  return `${safeNum.toFixed(decimals)}${unit ? " " + unit : ""}`;
};

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

const SectionHeaderIcon = ({ Icon, color = BRAND, bg = BRAND_BG }) => (
  <Box sx={{ display: 'inline-flex', width: 44, height: 44, borderRadius: '12px', bgcolor: bg, alignItems: 'center', justifyContent: 'center' }}>
    <Icon sx={{ color, fontSize: 24 }} />
  </Box>
);

// ─── FILTER BAR ───────────────────────────────────────────────────────────────
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
              <RTooltip labelFormatter={t => new Date(t).toLocaleString()}
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
      const decoded = Object.fromEntries(
        Object.entries(res.data).map(([ch, cfg]) => [ch, { ...cfg, label: safeDecodeLabel(cfg?.label) }])
      );
      setConfig(decoded);
    } catch (err) {
      setMessageType("error");
      const serverMsg = err.response?.data?.error;
      setMessage(err.name === "AbortError" || err.name === "CanceledError"
        ? "❌ Zeitüberschreitung: Server antwortet nicht."
        : "❌ Fehler beim Laden der Konfiguration: " + (serverMsg || err.message || "Netzwerkproblem"));
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
    } catch (err) {
      setMessageType("error");
      const serverMsg = err.response?.data?.error;
      setMessage("❌ Fehler beim Speichern der Konfiguration" + (serverMsg ? `: ${serverMsg}` : ""));
      setTimeout(() => setMessage(""), 5000);
    } finally { setSaving(false); }
  };

  if (loading) return <Typography sx={{ color: INK_MUTED }}>Konfiguration wird geladen...</Typography>;

  const entries = Object.entries(config).filter(([key]) => !key.startsWith("L"));
  const groups  = [
    { channels: entries.slice(0, 6),   bgColor: SURFACE,   title: "Phase 1 · Kanäle a–f" },
    { channels: entries.slice(6, 12),  bgColor: '#EEF1F4', title: "Phase 2 · Kanäle g–l" },
    { channels: entries.slice(12, 18), bgColor: '#F8F9FA', title: "Phase 3 · Kanäle m–r" },
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

// ─── ENERGIE-MANAGER (Kanal Zähler) ───────────────────────────────────────────
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
      const decoded = Object.fromEntries(
        Object.entries(res.data).map(([ch, d]) => [ch, { ...d, label: safeDecodeLabel(d?.label) }])
      );
      setEnergyData(decoded);
      return decoded;
    } catch (err) {
      setMessageType("error");
      const serverMsg = err.response?.data?.error;
      setMessage("❌ Fehler beim Laden der Energiedaten" + (serverMsg ? `: ${serverMsg}` : ""));
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
    setTimeout(() => loadEnergyData(), 3000);
  };

  if (loading && Object.keys(energyData).length === 0)
    return <Typography sx={{ p: 3, color: INK_MUTED }}>Energiedaten werden geladen...</Typography>;
  if (!energyData || typeof energyData !== "object" || Object.keys(energyData).length === 0)
    return (
      <Box sx={{ p: 3 }}>
        {message && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{message}</Alert>}
        <Typography sx={{ color: INK_MUTED }}>Keine Daten verfügbar...</Typography>
      </Box>
    );

  const entries       = Object.entries(energyData);
  const allChannels   = Object.keys(energyData);
  const selectedCount = selectedEnergyChannels.length;
  const totalCount    = allChannels.length;
  const groups        = [
    { channels: entries.slice(0, 6),   bgColor: SURFACE,   title: "Phase 1 · Kanäle a–f" },
    { channels: entries.slice(6, 12),  bgColor: '#EEF1F4', title: "Phase 2 · Kanäle g–l" },
    { channels: entries.slice(12, 18), bgColor: '#F8F9FA', title: "Phase 3 · Kanäle m–r" },
  ];

  const thStyle = { padding: "12px", textAlign: "left", color: INK_MUTED, fontSize: '0.8rem' };

  return (
    <Paper elevation={0} sx={{ p: 3, mt: 3, bgcolor: PANEL }}>
      {/* En-tête — identique à Kanal-Einstellungen */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <Typography variant="h5" sx={{ color: INK }}>Kanal Zähler</Typography>
        <Button variant="outlined" onClick={loadEnergyData} startIcon={<UpdateIcon />}
          sx={{ borderColor: BORDER, color: INK, borderRadius: 20 }}>
          Aktualisieren
        </Button>
      </Box>
      {message && <Alert severity={messageType === "success" ? "success" : "error"} sx={{ mb: 2, borderRadius: 2 }}>{message}</Alert>}

      {/* Zählerstand setzen — même bloc que les groupes de canaux */}
      <Box sx={{ mb: 3, p: 2, borderRadius: 2, backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
        <Typography variant="subtitle1" sx={{ mb: 1.5, color: INK, fontWeight: 700 }}>Zählerstand setzen</Typography>
        <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
          <Button variant="outlined" onClick={e => { e.stopPropagation(); setChannelAnchorEl(e.currentTarget); }}
            endIcon={<span>▼</span>} sx={{ minWidth: 200, borderColor: BORDER, color: INK, bgcolor: PANEL, borderRadius: 20 }}>
            {selectedCount === 0 ? "Kanäle wählen" : selectedCount === totalCount ? "Alle Kanäle" : `${selectedCount} Kanäle`}
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
                  const chLabel   = displayLabel(energyData[ch]?.label);
                  const showLabel = chLabel && chLabel !== formatChannelName(ch);
                  return (
                    <FormControlLabel key={ch}
                      control={<Checkbox checked={selectedEnergyChannels.includes(ch)} onChange={() => handleEnergyChannelToggle(ch)} />}
                      label={<span><ChannelLabel channel={ch} />{showLabel ? <span style={{ color: INK_MUTED }}> – {chLabel}</span> : null}</span>}
                      sx={{ display: "block" }} />
                  );
                })}
              </Box>
            </Box>
          </Popover>
          <TextField type="number" size="small" label="Wert (kWh)" value={globalEnergyValue}
            onChange={e => setGlobalEnergyValue(e.target.value)}
            inputProps={{ step: "0.1", style: { width: 120 } }} sx={{ bgcolor: PANEL, borderRadius: 1 }} />
          <Button variant="contained" onClick={sendGlobalEnergyValue} startIcon={<SaveIcon />}
            disabled={loading || selectedEnergyChannels.length === 0 || globalEnergyValue === ""}
            sx={{ bgcolor: SUCCESS, boxShadow: 'none', borderRadius: 20, '&:hover': { bgcolor: '#166B48', boxShadow: 'none' } }}>
            Absenden
          </Button>
        </Box>
        <Typography variant="caption" sx={{ mt: 1, display: "block", color: INK_MUTED }}>
          Kanäle auswählen, Wert eingeben und „Absenden“ klicken.
        </Typography>
      </Box>

      {/* Tableaux par phase — même style que Kanal-Einstellungen */}
      {groups.map((group, idx) => (
        <Box key={idx} sx={{ mb: 3, p: 2, borderRadius: 2, backgroundColor: group.bgColor, border: `1px solid ${BORDER}`, overflowX: "auto" }}>
          <Typography variant="subtitle1" sx={{ mb: 1, color: INK, fontWeight: 700 }}>{group.title}</Typography>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 500 : "auto" }}>
            <thead>
              <tr style={{ backgroundColor: "rgba(17,24,39,0.04)" }}>
                <th style={thStyle}>Kanal</th>
                <th style={thStyle}>Bezeichnung</th>
                <th style={thStyle}>Energie (kWh)</th>
                <th style={thStyle}>Letzte Änderung</th>
              </tr>
            </thead>
            <tbody>
              {group.channels.map(([channel, data_]) => {
                const isSelected  = selectedEnergyChannels.includes(channel);
                const lastUpdated = data_?.updatedAt ? new Date(data_.updatedAt) : null;
                const validDate   = lastUpdated && !isNaN(lastUpdated.getTime());
                return (
                  <tr key={channel} style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: isSelected ? BRAND_BG : "transparent" }}>
                    <td style={{ padding: "8px", fontWeight: 700, fontFamily: MONO_FONT }}><ChannelLabel channel={channel} /></td>
                    <td style={{ padding: "8px" }}>
                      <Box sx={{ px: 1.5, py: 1, bgcolor: PANEL, border: `1px solid ${BORDER}`, borderRadius: 1 }}>
                        <Typography sx={{ color: INK, fontSize: "1rem", fontWeight: 600 }}>
                          {displayLabel(data_?.label) || formatChannelName(channel)}
                        </Typography>
                      </Box>
                    </td>
                    <td style={{ padding: "8px" }}>
                      <Box sx={{ px: 1.5, py: 1, bgcolor: PANEL, border: `1px solid ${BORDER}`, borderRadius: 1, minWidth: isMobile ? 90 : 120, textAlign: "right" }}>
                        <Typography sx={{ fontFamily: MONO_FONT, fontWeight: 700, color: INK }}>
                          {(data_?.temporary || 0).toFixed(2)}
                        </Typography>
                      </Box>
                    </td>
                    <td style={{ padding: "8px" }}>
                      {validDate ? (
                        <Box>
                          <Typography variant="body2" sx={{ color: INK, fontFamily: MONO_FONT }}>{lastUpdated.toLocaleDateString()}</Typography>
                          <Typography variant="caption" sx={{ color: INK_MUTED, fontFamily: MONO_FONT }}>{lastUpdated.toLocaleTimeString()}</Typography>
                        </Box>
                      ) : <Typography variant="body2" sx={{ color: INK_MUTED }}>—</Typography>}
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

// ─── MAPPING METRIC OPTIONS ───────────────────────────────────────────────────
const MAPPING_METRIC_OPTIONS = [
  { value: "Strom",        label: "Strom (A)",        icon: ElectricBoltIcon,        decimals: 3, unit: "A"   },
  { value: "Wirkleistung", label: "Wirkleistung (W)", icon: SpeedIcon,               decimals: 2, unit: "W"   },
  { value: "Spannung",     label: "Spannung (V)",     icon: VoltageSvgIcon,          decimals: 1, unit: "V"   },
  { value: "Energie",      label: "Energie (kWh)",    icon: BatteryChargingFullIcon, decimals: 2, unit: "kWh" },
];
const MAPPING_METRIC_LABELS = {
  Strom:        "Strom (A)",
  Wirkleistung: "Wirkleistung (W)",
  Spannung:     "Spannung (V)",
  Energie:      "Energie (kWh)",
};
const KANAL_LABELS = { "1": "L1", "2": "L2", "3": "L3", "4": "N" };
const KANAL_OPTIONS = ["1", "2", "3", "4"];
const KANAL_COLORS = { "1": "#795548", "2": "#000000", "3": "#757575", "4": "#1976d2" };

// ─── MAPPING DETAIL ───────────────────────────────────────────────────────────
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
        if (!cancelled && res.data?.data) setHistoryData(res.data.data);
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
          {KANAL_LABELS[selectedKanal] || selectedKanal}&nbsp;(Kanal {selectedKanal})
        </Button>
        <Menu anchorEl={kanalAnchorEl} open={Boolean(kanalAnchorEl)} onClose={() => setKanalAnchorEl(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }} transformOrigin={{ vertical: "top", horizontal: "left" }}
          disableAutoFocus disableEnforceFocus disableScrollLock>
          {kanaele.map(k => (
            <MenuItem key={k.kanal} onClick={e => { e.stopPropagation(); setSelectedKanal(k.kanal); }}
              selected={selectedKanal === k.kanal} sx={{ borderRadius: 1 }}>
              <Checkbox checked={selectedKanal === k.kanal} size="small" />
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: KANAL_COLORS[k.kanal] || INK_MUTED, mr: 1 }} />
              <ListItemText primary={`${KANAL_LABELS[k.kanal] || k.kanal} (Kanal ${k.kanal})`} />
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
          {Object.entries(MAPPING_METRIC_LABELS).map(([key, label]) => (
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
                {formatValue(currentKanalData[m.value], m.decimals, m.unit)}
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
              <RTooltip labelFormatter={t => new Date(t).toLocaleString()}
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

// ─── MAPPING MANAGER ──────────────────────────────────────────────────────────
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

  const loadSensors = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/sensors-discovery`);
      setSensors(res.data?.sensors || []);
      if (isManualRefresh) {
        setMessageType("success");
        setMessage(`✅ ${res.data?.count || 0} Sensor(en) erkannt`);
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (err) {
      setMessageType("error");
      setMessage("❌ Fehler beim Abrufen der Sensoren: " + (err.message || "Netzwerkproblem"));
      setTimeout(() => setMessage(""), 5000);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadSensors(false); }, []);

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
            <SectionHeaderIcon Icon={DeviceHubIcon} />
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
          <Typography sx={{ color: INK_MUTED }}>Keine aktiven Sensoren in InfluxDB gefunden.</Typography>
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
                    <Typography variant="caption" sx={{ color: INK_MUTED, display: "block", mb: 1 }}>Kanal {k.kanal}</Typography>
                    <Typography variant="body1" sx={{ color: INK, fontWeight: 700, fontSize: "1rem", lineHeight: 1.2, mb: 1 }}>
                      {KANAL_LABELS[k.kanal] || k.kanal}
                    </Typography>
                    <Divider sx={{ mb: 1, bgcolor: BORDER }} />
                    {cardMetrics.map(m => {
                      if (!shouldShowMetric(m.value)) return null;
                      const Icon = m.icon;
                      return (
                        <Box key={m.value} display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: "4px" }}>
                          <Box display="flex" alignItems="center" gap={0.8}>
                            <Icon sx={{ color: INK_MUTED, fontSize: "0.8rem" }} />
                            <Typography variant="caption" sx={{ color: INK_MUTED }}>{m.label.split(" ")[0]}:</Typography>
                          </Box>
                          <ValueBadge>{formatValue(k[m.value], m.decimals, m.unit)}</ValueBadge>
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
  const [controllerLabel, setControllerLabel]               = useState(`Controller ${CONTROLLER}`);
  const isMobile = useMediaQuery("(max-width:600px)");

  useEffect(() => {
    const params    = new URLSearchParams(window.location.search);
    const viewParam = params.get("view");
    if (["config", "graphMenu", "dashboard", "energy", "mapping"].includes(viewParam)) setView(viewParam);
  }, []);

  // ✅ Nom du contrôleur actif (affiché dans la barre de navigation)
  useEffect(() => {
    axios.get(`${API_BASE_URL}/controllers`)
      .then(res => {
        const c = (res.data || []).find(x => String(x.num) === String(CONTROLLER));
        if (c?.label) setControllerLabel(c.label);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/config`)
      .then(res => {
        const keys = Object.keys(res.data).filter(k => !k.startsWith("L"));
        setOrderedChannels(keys.length > 0 ? keys : DEFAULT_CHANNELS);
      })
      .catch(() => setOrderedChannels(DEFAULT_CHANNELS));
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
      try {
        const res = await axios.get(`${API_BASE_URL}/data`);
        const decoded = Object.fromEntries(
          Object.entries(res.data).map(([ch, d]) => [ch, { ...d, Label: safeDecodeLabel(d?.Label) }])
        );
        setData(decoded);
        setLoading(false);
      }
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
        const res = await axios.get(`${API_BASE_URL}/history/${encodeURIComponent(selectedChannel)}`, { params: { time: timeRange } });
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

  const grafanaUrl = "http://192.168.1.20:3000/d/adkdpz6/energie?orgId=1&from=now-15m&to=now&timezone=browser&var-Kanal=CH1%20a&refresh=5s";

  // ── NavBar ──
  const NavBar = () => (
    <Paper elevation={0} sx={{ p: isMobile ? "8px 12px" : "8px 20px", mb: "20px", bgcolor: PANEL }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={isMobile ? 1 : 0}>
        <Box display="flex" alignItems="center" gap={1}>
          <DashboardIcon sx={{ color: BRAND }} />
          <Typography variant="h6" sx={{ fontSize: isMobile ? "1rem" : "1.25rem", color: INK }}>Energy Monitor</Typography>
          <Chip size="small" icon={<MemoryIcon sx={{ fontSize: '14px !important', color: `${BRAND} !important` }} />}
            label={controllerLabel} sx={{ bgcolor: BRAND_BG, color: BRAND, ml: 1 }} />
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
    const label       = displayLabel(channelData.Label) || formatChannelName(channel);
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
              <SectionHeaderIcon Icon={DashboardIcon} />
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
      const label = displayLabel(channelData.Label) || formatChannelName(channel);
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
              <SectionHeaderIcon Icon={ShowChartIcon} color={ACCENT} bg={ACCENT_BG} />
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
      {view === "config"  && <ChannelConfigManager />}
      {view === "energy"  && <EnergyManager />}
      {view === "mapping" && <MappingManager />}
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