import React, { useMemo, useEffect, useCallback, useState } from 'react';
import {
    Autocomplete,
    Box,
    Button,
    Chip,
    FormControl,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    MenuItem,
    Select,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TableContainer,
    TextField,
    Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import ListAltIcon from '@mui/icons-material/ListAlt';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useDispatch, useSelector } from 'react-redux';
import { useSocket } from '../common/socket.jsx';
import {
    closeAddDialog,
    closeManageDialog,
    createMonitoredCelestial,
    deleteMonitoredCelestial,
    fetchMonitoredCelestial,
    openAddDialog,
    openManageDialog,
    setMonitoredFormError,
    setMonitoredFormField,
    toggleMonitoredCelestialEnabled,
    updateMonitoredCelestial,
} from './monitored-slice.jsx';
import { refreshMonitoredCelestialNow } from './celestial-slice.jsx';

const STALE_MS = 5 * 60 * 1000;
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/;
const HOUR_OPTIONS = [
    { value: 6, label: '6h' },
    { value: 12, label: '12h' },
    { value: 24, label: '1d' },
    { value: 72, label: '3d' },
    { value: 168, label: '7d' },
    { value: 336, label: '14d' },
    { value: 720, label: '1mo' },
    { value: 2160, label: '3mo' },
    { value: 4320, label: '6mo' },
    { value: 8760, label: '1y' },
];
const DIALOG_PAPER_SX = {
    bgcolor: 'background.paper',
    border: (theme) => `1px solid ${theme.palette.divider}`,
    borderRadius: 2,
};
const DIALOG_TITLE_SX = {
    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
    borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
    fontSize: '1.25rem',
    fontWeight: 'bold',
    py: 2.5,
};
const DIALOG_CONTENT_SX = {
    bgcolor: 'background.paper',
    px: 3,
    py: 3,
};
const DIALOG_ACTIONS_SX = {
    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
    borderTop: (theme) => `1px solid ${theme.palette.divider}`,
    px: 3,
    py: 2.5,
    gap: 2,
};
const DIALOG_CANCEL_BUTTON_SX = {
    borderColor: (theme) => theme.palette.mode === 'dark' ? 'grey.700' : 'grey.400',
    '&:hover': {
        borderColor: (theme) => theme.palette.mode === 'dark' ? 'grey.600' : 'grey.500',
        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.200',
    },
};

const getStatusMeta = (entry) => {
    if (entry?.lastError) {
        return { label: 'Error', color: 'error' };
    }

    if (!entry?.lastRefreshAt) {
        return { label: 'Stale', color: 'warning' };
    }

    const ageMs = Date.now() - new Date(entry.lastRefreshAt).getTime();
    if (Number.isNaN(ageMs) || ageMs > STALE_MS) {
        return { label: 'Stale', color: 'warning' };
    }

    return { label: 'OK', color: 'success' };
};

const formatLastRefresh = (value) => {
    if (!value) {
        return 'Never';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Unknown';
    }

    return date.toLocaleString();
};

const normalizeHexColor = (value) => {
    const text = String(value || '').trim();
    if (!text) {
        return '';
    }

    const prefixed = text.startsWith('#') ? text : `#${text}`;
    return prefixed.toUpperCase();
};

const getMissionStatusMeta = (status, statusLabel = '') => {
    const normalized = String(status || 'unknown').trim().toLowerCase();
    if (normalized === 'active') return { label: statusLabel || 'Active', color: 'success' };
    if (normalized === 'completed') return { label: statusLabel || 'Completed', color: 'default' };
    if (normalized === 'failed') return { label: statusLabel || 'Failed', color: 'error' };
    return { label: statusLabel || 'Unknown', color: 'warning' };
};

const CelestialTopBar = ({
    projectionPastHours = 24,
    projectionFutureHours = 24,
    onProjectionPastHoursChange,
    onProjectionFutureHoursChange,
}) => {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const monitoredState = useSelector((state) => state.celestialMonitored);
    const celestialLoading = useSelector((state) => state.celestial?.tracksLoading);
    const {
        monitored,
        addDialogOpen,
        manageDialogOpen,
        form,
        formError,
        saveLoading,
    } = monitoredState;

    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editError, setEditError] = useState('');
    const [editForm, setEditForm] = useState({
        id: '',
        displayName: '',
        command: '',
        color: '',
        enabled: true,
    });
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogError, setCatalogError] = useState('');
    const [catalogEntries, setCatalogEntries] = useState([]);
    const [selectedCatalogEntry, setSelectedCatalogEntry] = useState(null);
    const [targetInputValue, setTargetInputValue] = useState('');
    const [addFeedback, setAddFeedback] = useState('');

    const enabledCount = useMemo(
        () => monitored.filter((entry) => entry.enabled).length,
        [monitored],
    );

    useEffect(() => {
        if (!socket) {
            return undefined;
        }

        const fetchData = () => dispatch(fetchMonitoredCelestial({ socket }));
        fetchData();

        socket.on('connect', fetchData);
        return () => {
            socket.off('connect', fetchData);
        };
    }, [socket, dispatch]);

    useEffect(() => {
        if (!socket) {
            return;
        }
        let active = true;
        socket.emit('data_request', 'get-spacecraft-index', { limit: 1000 }, (response) => {
            if (!active) return;
            if (response?.success) {
                setCatalogEntries(response.data || []);
            }
        });
        return () => {
            active = false;
        };
    }, [socket]);

    useEffect(() => {
        if (!addDialogOpen || !socket) {
            return;
        }

        let active = true;
        setCatalogLoading(true);
        setCatalogError('');
        socket.emit('data_request', 'get-spacecraft-index', { limit: 1000 }, (response) => {
            if (!active) {
                return;
            }
            if (response?.success) {
                setCatalogEntries(response.data || []);
            } else {
                setCatalogEntries([]);
                setCatalogError(response?.error || 'Failed to load spacecraft catalog.');
            }
            setCatalogLoading(false);
        });

        return () => {
            active = false;
        };
    }, [addDialogOpen, socket]);

    useEffect(() => {
        if (addDialogOpen) {
            setAddFeedback('');
            setTargetInputValue(form.command || '');
            return;
        }
        setSelectedCatalogEntry(null);
        setTargetInputValue('');
        setCatalogError('');
        setAddFeedback('');
    }, [addDialogOpen, form.command]);

    const inferredSourceMode = useMemo(() => {
        const command = String(form.command || '').trim().toLowerCase();
        const catalogCommand = String(selectedCatalogEntry?.command || '').trim().toLowerCase();
        if (selectedCatalogEntry && command && command === catalogCommand) {
            return 'catalog';
        }
        return 'exact';
    }, [form.command, selectedCatalogEntry]);

    const catalogByCommand = useMemo(() => {
        const map = {};
        (catalogEntries || []).forEach((entry) => {
            const key = String(entry?.command || '').trim().toLowerCase();
            if (key) {
                map[key] = entry;
            }
        });
        return map;
    }, [catalogEntries]);

    const monitoredCommands = useMemo(
        () =>
            new Set(
                (monitored || [])
                    .map((entry) => String(entry?.command || '').trim().toLowerCase())
                    .filter(Boolean),
            ),
        [monitored],
    );

    const handleAdd = async () => {
        setAddFeedback('');
        if (!socket) {
            dispatch(setMonitoredFormError('Socket connection is not available.'));
            return;
        }

        const name = form.displayName.trim();
        const cmd = form.command.trim();
        if (!name || !cmd) {
            dispatch(setMonitoredFormError('Display name and command are required.'));
            return;
        }

        const exists = monitored.some((entry) => entry.command.toLowerCase() === cmd.toLowerCase());
        if (exists) {
            dispatch(setMonitoredFormError('This command is already in the monitored list.'));
            return;
        }

        const result = await dispatch(
            createMonitoredCelestial({
                socket,
                entry: {
                    displayName: name,
                    command: cmd,
                    enabled: true,
                    sourceMode: inferredSourceMode,
                },
            }),
        );
        if (result.meta.requestStatus === 'fulfilled') {
            setAddFeedback(`Added "${name}" using command "${cmd}".`);
            setSelectedCatalogEntry(null);
        }
    };

    const handleRefreshAll = useCallback(async () => {
        if (!socket || celestialLoading) {
            return;
        }

        await dispatch(
            refreshMonitoredCelestialNow({
                socket,
                ids: [],
                payload: {
                    past_hours: Number(projectionPastHours) || 24,
                    future_hours: Number(projectionFutureHours) || 24,
                    step_minutes: 60,
                },
            }),
        );
        await dispatch(fetchMonitoredCelestial({ socket }));
    }, [
        socket,
        celestialLoading,
        dispatch,
        projectionPastHours,
        projectionFutureHours,
    ]);

    const handleOpenEdit = (entry) => {
        setEditForm({
            id: entry.id,
            displayName: entry.displayName,
            command: entry.command,
            color: entry.color || '',
            enabled: entry.enabled,
        });
        setEditError('');
        setEditDialogOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!socket) {
            setEditError('Socket connection is not available.');
            return;
        }

        const name = editForm.displayName.trim();
        const cmd = editForm.command.trim();
        const normalizedColor = normalizeHexColor(editForm.color);
        if (!name || !cmd) {
            setEditError('Display name and command are required.');
            return;
        }
        if (normalizedColor && !HEX_COLOR_PATTERN.test(normalizedColor)) {
            setEditError('Color must be a valid hex value like #1A2B3C.');
            return;
        }

        const exists = monitored.some(
            (entry) => entry.id !== editForm.id && entry.command.toLowerCase() === cmd.toLowerCase(),
        );
        if (exists) {
            setEditError('This command is already in the monitored list.');
            return;
        }

        const result = await dispatch(
            updateMonitoredCelestial({
                socket,
                entry: {
                    id: editForm.id,
                    displayName: name,
                    command: cmd,
                    color: normalizedColor || null,
                    enabled: editForm.enabled,
                },
            }),
        );

        if (result.meta.requestStatus === 'fulfilled') {
            setEditDialogOpen(false);
            setEditError('');
            return;
        }

        setEditError(result.payload || result.error?.message || 'Failed to update monitored target.');
    };

    return (
        <>
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 1.5,
                    py: 1,
                    bgcolor: 'background.paper',
                    borderBottom: '1px solid',
                    borderColor: 'border.main',
                    minHeight: '64px',
                }}
            >
                <Stack direction="row" spacing={1} alignItems="center">
                    <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                            Past
                        </Typography>
                        <FormControl size="small" sx={{ minWidth: 72 }}>
                            <Select
                                size="small"
                                value={projectionPastHours}
                                onChange={(event) => onProjectionPastHoursChange?.(Number(event.target.value))}
                                disabled={!socket || celestialLoading}
                                sx={{
                                    '& .MuiSelect-select': {
                                        py: 0.5,
                                        pl: 1,
                                        pr: 3,
                                    },
                                }}
                            >
                                {HOUR_OPTIONS.map((option) => (
                                    <MenuItem key={`past-${option.value}`} value={option.value}>
                                        {option.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Stack>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                            Future
                        </Typography>
                        <FormControl size="small" sx={{ minWidth: 72 }}>
                            <Select
                                size="small"
                                value={projectionFutureHours}
                                onChange={(event) => onProjectionFutureHoursChange?.(Number(event.target.value))}
                                disabled={!socket || celestialLoading}
                                sx={{
                                    '& .MuiSelect-select': {
                                        py: 0.5,
                                        pl: 1,
                                        pr: 3,
                                    },
                                }}
                            >
                                {HOUR_OPTIONS.map((option) => (
                                    <MenuItem key={`future-${option.value}`} value={option.value}>
                                        {option.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Stack>
                </Stack>

                <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={() => dispatch(openAddDialog())}
                        disabled={!socket || celestialLoading}
                    >
                        Add
                    </Button>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ListAltIcon />}
                        onClick={() => dispatch(openManageDialog())}
                    >
                        Manage
                    </Button>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        disabled={!socket || celestialLoading || enabledCount === 0}
                        onClick={handleRefreshAll}
                    >
                        Refresh All
                    </Button>
                </Stack>
            </Box>

            <Dialog
                open={addDialogOpen}
                onClose={() => dispatch(closeAddDialog())}
                maxWidth="sm"
                fullWidth
                PaperProps={{ sx: DIALOG_PAPER_SX }}
            >
                <DialogTitle sx={DIALOG_TITLE_SX}>Add Monitored Celestial Target</DialogTitle>
                <DialogContent sx={DIALOG_CONTENT_SX}>
                    <Stack spacing={2} sx={{ pt: 3 }}>
                        <Box>
                            <Autocomplete
                                freeSolo
                                options={catalogEntries}
                                loading={catalogLoading}
                            value={selectedCatalogEntry}
                            inputValue={targetInputValue}
                            isOptionEqualToValue={(option, value) => option?.id === value?.id}
                            getOptionDisabled={(option) =>
                                monitoredCommands.has(String(option?.command || '').trim().toLowerCase())
                            }
                            getOptionLabel={(option) => {
                                if (typeof option === 'string') {
                                    return option;
                                }
                                return option?.display_name || option?.command || '';
                                }}
                                onInputChange={(event, value, reason) => {
                                    setTargetInputValue(value);
                                    if (reason === 'clear') {
                                        setSelectedCatalogEntry(null);
                                        dispatch(setMonitoredFormField({ field: 'displayName', value: '' }));
                                        dispatch(setMonitoredFormField({ field: 'command', value: '' }));
                                        dispatch(setMonitoredFormError(''));
                                        setAddFeedback('');
                                        return;
                                    }
                                    if (reason === 'input') {
                                        const typed = String(value || '');
                                        setSelectedCatalogEntry(null);
                                        dispatch(setMonitoredFormField({ field: 'displayName', value: typed }));
                                        dispatch(setMonitoredFormField({ field: 'command', value: typed }));
                                        dispatch(setMonitoredFormError(''));
                                        setAddFeedback('');
                                    }
                                }}
                                onChange={(event, value) => {
                                    setAddFeedback('');
                                    dispatch(setMonitoredFormError(''));

                                    if (!value) {
                                        setSelectedCatalogEntry(null);
                                        return;
                                    }

                                    if (typeof value === 'string') {
                                        setSelectedCatalogEntry(null);
                                        setTargetInputValue(value);
                                        dispatch(setMonitoredFormField({ field: 'displayName', value }));
                                        dispatch(setMonitoredFormField({ field: 'command', value }));
                                        return;
                                    }

                                    setSelectedCatalogEntry(value);
                                    setTargetInputValue(value.display_name || value.command || '');
                                    dispatch(setMonitoredFormField({ field: 'displayName', value: value.display_name || '' }));
                                    dispatch(setMonitoredFormField({ field: 'command', value: value.command || '' }));
                                }}
                                renderOption={(props, option) => (
                                    <Box component="li" {...props} key={option.id}>
                                        <Stack spacing={0.35} sx={{ width: '100%' }}>
                                            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                                                <Typography variant="body2">{option.display_name}</Typography>
                                                <Stack direction="row" spacing={0.75} alignItems="center">
                                                    {monitoredCommands.has(String(option?.command || '').trim().toLowerCase()) ? (
                                                        <Chip
                                                            size="small"
                                                            variant="outlined"
                                                            color="default"
                                                            label="Already monitored"
                                                        />
                                                    ) : null}
                                                    <Chip
                                                        size="small"
                                                        variant="outlined"
                                                        color={getMissionStatusMeta(option.mission_status, option.status_label).color}
                                                        label={getMissionStatusMeta(option.mission_status, option.status_label).label}
                                                    />
                                                </Stack>
                                            </Stack>
                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                                sx={{ fontFamily: 'monospace' }}
                                            >
                                                {option.command}{option.agency ? ` · ${option.agency}` : ''}
                                            </Typography>
                                        </Stack>
                                    </Box>
                                )}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Target"
                                        placeholder="Type command or pick from catalog"
                                        size="small"
                                        helperText={
                                            inferredSourceMode === 'catalog'
                                                ? 'Using static catalog entry.'
                                                : 'Using exact Horizons command.'
                                        }
                                    />
                                )}
                            />
                        </Box>
                        {selectedCatalogEntry && String(selectedCatalogEntry?.mission_status || '').toLowerCase() !== 'active' ? (
                            <Typography variant="caption" color="warning.main">
                                Selected mission is not active; Horizons data may be limited.
                            </Typography>
                        ) : null}
                        {catalogLoading ? (
                            <Typography variant="caption" color="text.secondary">
                                Loading spacecraft catalog...
                            </Typography>
                        ) : null}
                        <TextField
                            label="Display Name"
                            value={form.displayName}
                            onChange={(event) =>
                                dispatch(setMonitoredFormField({ field: 'displayName', value: event.target.value }))
                            }
                            fullWidth
                            size="small"
                        />
                        <TextField
                            label="Horizons Command"
                            value={form.command}
                            onChange={(event) =>
                                {
                                    const nextValue = event.target.value;
                                    dispatch(setMonitoredFormField({ field: 'command', value: nextValue }));
                                    if (!form.displayName || form.displayName === form.command) {
                                        dispatch(setMonitoredFormField({ field: 'displayName', value: nextValue }));
                                    }
                                    setSelectedCatalogEntry(null);
                                    setTargetInputValue(nextValue);
                                }
                            }
                            fullWidth
                            size="small"
                        />
                        {catalogError ? (
                            <Typography variant="body2" color="error">
                                {catalogError}
                            </Typography>
                        ) : null}
                        {formError ? (
                            <Typography variant="body2" color="error">
                                {formError}
                            </Typography>
                        ) : null}
                        {addFeedback ? (
                            <Typography variant="body2" color="success.main">
                                {addFeedback}
                            </Typography>
                        ) : null}
                    </Stack>
                </DialogContent>
                <DialogActions sx={DIALOG_ACTIONS_SX}>
                    <Button
                        onClick={() => dispatch(closeAddDialog())}
                        variant="outlined"
                        sx={DIALOG_CANCEL_BUTTON_SX}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleAdd} color="success" variant="contained" disabled={saveLoading || !socket || celestialLoading}>
                        Add
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={manageDialogOpen}
                onClose={() => dispatch(closeManageDialog())}
                maxWidth="lg"
                fullWidth
                PaperProps={{ sx: DIALOG_PAPER_SX }}
            >
                <DialogTitle sx={DIALOG_TITLE_SX}>Manage Monitored Celestial Targets</DialogTitle>
                <DialogContent sx={DIALOG_CONTENT_SX}>
                    <TableContainer
                        component={Paper}
                        sx={{
                            borderRadius: 0,
                            mt: 2.5,
                            maxHeight: 460,
                        }}
                    >
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Display Name</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Horizons Command</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Mission</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Status</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Last Refresh</TableCell>
                                    <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {monitored.length ? (
                                    monitored.map((entry) => {
                                        const statusMeta = getStatusMeta(entry);
                                        const mission = catalogByCommand[String(entry.command || '').toLowerCase()] || null;
                                        const missionStatusMeta = getMissionStatusMeta(
                                            mission?.mission_status,
                                            mission?.status_label,
                                        );
                                        return (
                                            <TableRow
                                                key={entry.id}
                                                sx={{
                                                    '&:nth-of-type(odd)': { bgcolor: 'action.hover' },
                                                    '& td': { py: 1.15 },
                                                }}
                                            >
                                                <TableCell>{entry.displayName}</TableCell>
                                                <TableCell>
                                                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                                        {entry.command}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Chip
                                                        size="small"
                                                        variant="outlined"
                                                        color={missionStatusMeta.color}
                                                        label={missionStatusMeta.label}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Chip
                                                        size="small"
                                                        color={statusMeta.color}
                                                        label={statusMeta.label}
                                                        variant="outlined"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                                        {formatLastRefresh(entry.lastRefreshAt)}
                                                    </Typography>
                                                    {entry.lastError ? (
                                                        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.25 }}>
                                                            {entry.lastError}
                                                        </Typography>
                                                    ) : null}
                                                </TableCell>
                                                <TableCell>
                                                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                                        <Button
                                                            size="small"
                                                            variant="text"
                                                            onClick={() =>
                                                                socket && dispatch(toggleMonitoredCelestialEnabled({
                                                                    socket,
                                                                    id: entry.id,
                                                                    enabled: !entry.enabled,
                                                                }))
                                                            }
                                                            disabled={!socket || celestialLoading}
                                                        >
                                                            {entry.enabled ? 'Enabled' : 'Disabled'}
                                                        </Button>
                                                        <Button
                                                            size="small"
                                                            startIcon={<EditIcon />}
                                                            onClick={() => handleOpenEdit(entry)}
                                                            disabled={!socket || celestialLoading}
                                                        >
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            size="small"
                                                            color="error"
                                                            startIcon={<DeleteOutlineIcon />}
                                                            onClick={() =>
                                                                socket && dispatch(deleteMonitoredCelestial({
                                                                    socket,
                                                                    ids: [entry.id],
                                                                }))
                                                            }
                                                            disabled={!socket || celestialLoading}
                                                        >
                                                            Delete
                                                        </Button>
                                                    </Stack>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} sx={{ py: 4 }}>
                                            <Typography variant="body2" color="text.secondary" textAlign="center">
                                                No monitored celestial targets yet.
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </DialogContent>
                <DialogActions sx={DIALOG_ACTIONS_SX}>
                    <Button
                        onClick={handleRefreshAll}
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        disabled={!socket || celestialLoading || enabledCount === 0}
                        sx={DIALOG_CANCEL_BUTTON_SX}
                    >
                        Refresh
                    </Button>
                    <Button
                        onClick={() => {
                            dispatch(openAddDialog());
                        }}
                        color="success"
                        variant="contained"
                        startIcon={<AddIcon />}
                        disabled={!socket || celestialLoading}
                    >
                        Add
                    </Button>
                    <Button
                        onClick={() => dispatch(closeManageDialog())}
                        variant="outlined"
                        sx={DIALOG_CANCEL_BUTTON_SX}
                    >
                        Close
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={editDialogOpen}
                onClose={() => setEditDialogOpen(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{ sx: DIALOG_PAPER_SX }}
            >
                <DialogTitle sx={DIALOG_TITLE_SX}>Edit Monitored Celestial Target</DialogTitle>
                <DialogContent sx={DIALOG_CONTENT_SX}>
                    <Stack spacing={2} sx={{ pt: 3 }}>
                        <TextField
                            label="Display Name"
                            value={editForm.displayName}
                            onChange={(event) =>
                                setEditForm((prev) => ({ ...prev, displayName: event.target.value }))
                            }
                            fullWidth
                            size="small"
                        />
                        <TextField
                            label="Horizons Command"
                            value={editForm.command}
                            onChange={(event) =>
                                setEditForm((prev) => ({ ...prev, command: event.target.value }))
                            }
                            fullWidth
                            size="small"
                        />
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <TextField
                                label="Color"
                                value={editForm.color}
                                onChange={(event) =>
                                    setEditForm((prev) => ({ ...prev, color: normalizeHexColor(event.target.value) }))
                                }
                                placeholder="#06D6A0"
                                fullWidth
                                size="small"
                            />
                            <input
                                type="color"
                                aria-label="Pick color"
                                value={HEX_COLOR_PATTERN.test(normalizeHexColor(editForm.color)) ? normalizeHexColor(editForm.color) : '#06D6A0'}
                                onChange={(event) =>
                                    setEditForm((prev) => ({ ...prev, color: normalizeHexColor(event.target.value) }))
                                }
                                style={{
                                    width: 46,
                                    height: 36,
                                    border: '1px solid rgba(120,120,120,0.35)',
                                    borderRadius: 6,
                                    padding: 2,
                                    background: 'transparent',
                                }}
                            />
                            <Button
                                size="small"
                                onClick={() => setEditForm((prev) => ({ ...prev, color: '' }))}
                            >
                                Clear
                            </Button>
                        </Stack>
                        {editError ? (
                            <Typography variant="body2" color="error">
                                {editError}
                            </Typography>
                        ) : null}
                    </Stack>
                </DialogContent>
                <DialogActions sx={DIALOG_ACTIONS_SX}>
                    <Button
                        onClick={() => setEditDialogOpen(false)}
                        variant="outlined"
                        sx={DIALOG_CANCEL_BUTTON_SX}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSaveEdit}
                        color="success"
                        variant="contained"
                        disabled={saveLoading || !socket || celestialLoading}
                    >
                        Save
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default React.memo(CelestialTopBar);
