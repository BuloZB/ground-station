/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

import * as React from "react";
import {useSocket} from "../common/socket.jsx";
import {useDispatch, useSelector} from "react-redux";
import {
    setRotator,
    setTrackingStateInBackend,
    setRotatorConnecting,
    setRotatorDisconnecting,
    sendNudgeCommand,
} from "../target/target-slice.jsx";
import { toast } from "../../utils/toast-with-timestamp.jsx";
import {getClassNamesBasedOnGridEditing, TitleBar} from "../common/common.jsx";
import { useTranslation } from 'react-i18next';
import Grid from "@mui/material/Grid";
import {Box, Button, Chip, FormControl, IconButton, InputLabel, MenuItem, Select, Stack, Tooltip} from "@mui/material";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import SettingsIcon from '@mui/icons-material/Settings';
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import AutorenewIcon from '@mui/icons-material/Autorenew';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import { GaugeAz, GaugeEl } from '../target/rotator-gauges.jsx';
import {
    getCurrentStatusofRotator,
    createTrackingState,
    canControlRotator,
    canStartTracking,
    canStopTracking,
    canConnectRotator,
    isRotatorSelectionDisabled
} from '../target/rotator-utils.js';
import { ROTATOR_STATES, TRACKER_COMMAND_SCOPES, TRACKER_COMMAND_STATUS } from '../target/tracking-constants.js';
import { useNavigate } from 'react-router-dom';


const RotatorControl = React.memo(function RotatorControl() {
    const { socket } = useSocket();
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { t } = useTranslation('target');
    const {
        satGroups,
        groupId,
        loading,
        error,
        satelliteSelectOpen,
        satelliteGroupSelectOpen,
        groupOfSats,
        trackingState,
        satelliteId,
        uiTrackerDisabled,
        starting,
        selectedRadioRig,
        selectedRotator,
        selectedTransmitter,
        availableTransmitters,
        rotatorData,
        gridEditable,
        satelliteData,
        lastRotatorEvent,
        satellitePasses,
        activePass,
        rotatorConnecting,
        rotatorDisconnecting,
        trackerCommand,
    } = useSelector((state) => state.targetSatTrack);

    const { rigs } = useSelector((state) => state.rigs);
    const { rotators } = useSelector((state) => state.rotators);
    const isRotatorCommandBusy = Boolean(
        trackerCommand &&
        [TRACKER_COMMAND_SCOPES.ROTATOR, TRACKER_COMMAND_SCOPES.TRACKING].includes(trackerCommand.scope) &&
        trackerCommand?.requestedState?.rotatorState &&
        [TRACKER_COMMAND_STATUS.SUBMITTED, TRACKER_COMMAND_STATUS.STARTED].includes(trackerCommand.status)
    );
    const inFlightRotatorState = trackerCommand?.requestedState?.rotatorState;
    const isConnectActionPending = isRotatorCommandBusy && inFlightRotatorState === ROTATOR_STATES.CONNECTED;
    const isDisconnectActionPending = isRotatorCommandBusy && inFlightRotatorState === ROTATOR_STATES.DISCONNECTED;
    const isTrackActionPending = isRotatorCommandBusy && inFlightRotatorState === ROTATOR_STATES.TRACKING;
    const isStopActionPending = isRotatorCommandBusy && inFlightRotatorState === ROTATOR_STATES.STOPPED;
    const isParkActionPending = isRotatorCommandBusy && inFlightRotatorState === ROTATOR_STATES.PARKED;
    const [isSocketConnected, setIsSocketConnected] = React.useState(Boolean(socket?.connected));
    const [lastRotatorUpdateAt, setLastRotatorUpdateAt] = React.useState(Date.now());
    const [now, setNow] = React.useState(Date.now());

    const activeRotatorCommand = React.useMemo(() => {
        if (!trackerCommand) return null;
        const supportsScope = [TRACKER_COMMAND_SCOPES.ROTATOR, TRACKER_COMMAND_SCOPES.TRACKING].includes(trackerCommand.scope);
        return supportsScope && trackerCommand?.requestedState?.rotatorState ? trackerCommand : null;
    }, [trackerCommand]);

    React.useEffect(() => {
        if (!socket) return;
        setIsSocketConnected(Boolean(socket.connected));
        const handleConnect = () => setIsSocketConnected(true);
        const handleDisconnect = () => setIsSocketConnected(false);
        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        return () => {
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
        };
    }, [socket]);

    React.useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    React.useEffect(() => {
        setLastRotatorUpdateAt(Date.now());
    }, [
        rotatorData?.connected,
        rotatorData?.tracking,
        rotatorData?.slewing,
        rotatorData?.parked,
        rotatorData?.stopped,
        rotatorData?.az,
        rotatorData?.el,
    ]);

    const selectedRotatorDevice = React.useMemo(
        () => rotators.find((rotator) => rotator.id === selectedRotator),
        [rotators, selectedRotator]
    );

    const rotatorStatusChip = React.useMemo(() => {
        if (!isSocketConnected) return { label: 'Offline', color: 'default' };
        if (!rotatorData?.connected) return { label: 'Disconnected', color: 'error' };
        if (rotatorData?.tracking) return { label: 'Tracking', color: 'success' };
        if (rotatorData?.slewing) return { label: 'Slewing', color: 'warning' };
        if (rotatorData?.parked) return { label: 'Parked', color: 'warning' };
        if (rotatorData?.stopped) return { label: 'Stopped', color: 'warning' };
        return { label: 'Connected', color: 'success' };
    }, [isSocketConnected, rotatorData?.connected, rotatorData?.tracking, rotatorData?.slewing, rotatorData?.parked, rotatorData?.stopped]);

    const commandStateLabel = React.useMemo(() => {
        if (!activeRotatorCommand) return t('common.not_available', { ns: 'common', defaultValue: 'N/A' });
        if (activeRotatorCommand.status === TRACKER_COMMAND_STATUS.SUBMITTED) return t('common.pending', { ns: 'common', defaultValue: 'Pending' });
        if (activeRotatorCommand.status === TRACKER_COMMAND_STATUS.STARTED) return t('common.in_progress', { ns: 'common', defaultValue: 'In progress' });
        if (activeRotatorCommand.status === TRACKER_COMMAND_STATUS.SUCCEEDED) return t('common.success', { ns: 'common', defaultValue: 'Success' });
        if (activeRotatorCommand.status === TRACKER_COMMAND_STATUS.FAILED) return t('common.failed', { ns: 'common', defaultValue: 'Failed' });
        return t('common.unknown', { ns: 'common', defaultValue: 'Unknown' });
    }, [activeRotatorCommand, t]);

    const commandStatusIcon = React.useMemo(() => {
        if (!activeRotatorCommand) return { Icon: MoreHorizIcon, color: 'text.disabled' };
        if (activeRotatorCommand.status === TRACKER_COMMAND_STATUS.SUCCEEDED) {
            return { Icon: CheckCircleOutlineIcon, color: 'success.main' };
        }
        if (activeRotatorCommand.status === TRACKER_COMMAND_STATUS.FAILED) {
            return { Icon: ErrorOutlineIcon, color: 'error.main' };
        }
        if ([TRACKER_COMMAND_STATUS.SUBMITTED, TRACKER_COMMAND_STATUS.STARTED].includes(activeRotatorCommand.status)) {
            return { Icon: AutorenewIcon, color: 'info.main' };
        }
        return { Icon: MoreHorizIcon, color: 'text.disabled' };
    }, [activeRotatorCommand]);

    const lastUpdateAge = Math.max(0, Math.floor((now - lastRotatorUpdateAt) / 1000));

    const connectDisabled = isRotatorCommandBusy || !canConnectRotator(rotatorData, selectedRotator);
    const connectDisabledReason = isRotatorCommandBusy
        ? 'Command in progress'
        : !canConnectRotator(rotatorData, selectedRotator)
            ? 'Select a rotator first'
            : null;

    const disconnectDisabled = isRotatorCommandBusy || [ROTATOR_STATES.DISCONNECTED].includes(trackingState['rotator_state']);
    const disconnectDisabledReason = isRotatorCommandBusy
        ? 'Command in progress'
        : [ROTATOR_STATES.DISCONNECTED].includes(trackingState['rotator_state'])
            ? 'Rotator is already disconnected'
            : null;

    const parkDisabled = isRotatorCommandBusy || [ROTATOR_STATES.DISCONNECTED].includes(trackingState['rotator_state']);
    const parkDisabledReason = isRotatorCommandBusy
        ? 'Command in progress'
        : [ROTATOR_STATES.DISCONNECTED].includes(trackingState['rotator_state'])
            ? 'Connect the rotator first'
            : null;

    const trackDisabled = isRotatorCommandBusy || !canStartTracking(trackingState, satelliteId, selectedRotator);
    const trackDisabledReason = isRotatorCommandBusy
        ? 'Command in progress'
        : !canStartTracking(trackingState, satelliteId, selectedRotator)
            ? 'Select satellite and rotator, then connect first'
            : null;

    const stopDisabled = isRotatorCommandBusy || !canStopTracking(trackingState, satelliteId, selectedRotator);
    const stopDisabledReason = isRotatorCommandBusy
        ? 'Command in progress'
        : !canStopTracking(trackingState, satelliteId, selectedRotator)
            ? 'Rotator is not currently tracking'
            : null;

    const handleTrackingStop = () => {
        const newTrackingState = {...trackingState, 'rotator_state': ROTATOR_STATES.STOPPED};
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}));
    };

    const handleTrackingStart = () => {
        const newTrackingState = createTrackingState({
            satelliteId,
            groupId,
            rotatorState: ROTATOR_STATES.TRACKING,
            rigState: trackingState['rig_state'],
            selectedRadioRig,
            selectedRotator,
            selectedTransmitter
        });

        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}))
            .unwrap()
            .then((response) => {

            })
            .catch((error) => {
                toast.error(`${t('rotator_control.failed_start_tracking')}: ${error.message}`);
            });
    };

    function parkRotator() {
        const newTrackingState = createTrackingState({
            satelliteId,
            groupId,
            rotatorState: ROTATOR_STATES.PARKED,
            rigState: trackingState['rig_state'],
            selectedRadioRig,
            selectedRotator,
            selectedTransmitter
        });
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}))
            .unwrap()
            .then((response) => {

            });
    }

    function connectRotator() {
        const newTrackingState = createTrackingState({
            satelliteId,
            groupId,
            rotatorState: ROTATOR_STATES.CONNECTED,
            rigState: trackingState['rig_state'],
            selectedRadioRig,
            selectedRotator,
            selectedTransmitter
        });
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}))
            .unwrap()
            .then((response) => {
                //console.info("Response on setTrackingStateInBackend (connect): ", response);
            })
        .catch((error) => {
            dispatch(setRotatorConnecting(false));
        });
    }

    function disconnectRotator() {
        const newTrackingState = createTrackingState({
            satelliteId,
            groupId,
            rotatorState: ROTATOR_STATES.DISCONNECTED,
            rigState: trackingState['rig_state'],
            selectedRadioRig,
            selectedRotator,
            selectedTransmitter
        });
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}))
            .unwrap()
            .then((response) => {
                console.info("Response on setTrackingStateInBackend (disconnect): ", response);
            })
        .catch((error) => {
            dispatch(setRotatorDisconnecting(false));
        });
    }

    function handleRotatorChange(event) {
        dispatch(setRotator(event.target.value));
    }

    function handleNudgeCommand(cmd) {
        dispatch(sendNudgeCommand({socket: socket, cmd: {'cmd': cmd}}));
    }

    return (
        <>
            {/*<TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>Rotator control</TitleBar>*/}
            <Grid container spacing={{ xs: 0, md: 0 }} columns={{ xs: 12, sm: 12, md: 12 }}>
                <Grid
                    size={{ xs: 12, sm: 12, md: 12 }}
                    sx={{
                        px: 0.75,
                        pt: 0.45,
                        pb: 0.35,
                        backgroundColor: 'background.default',
                        borderBottom: '1px solid',
                        borderColor: 'divider'
                    }}
                >
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ minHeight: 24 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.2 }}>
                            {t('rotator_control.title', { defaultValue: 'Rotator Control' })}
                        </Typography>
                        <Chip
                            label={rotatorStatusChip.label}
                            color={rotatorStatusChip.color}
                            size="small"
                            sx={{ height: 18, '& .MuiChip-label': { px: 0.75, fontSize: '0.66rem', fontWeight: 600 } }}
                            variant={rotatorStatusChip.color === 'default' ? 'outlined' : 'filled'}
                        />
                    </Stack>
                    <Box
                        title={
                            `${selectedRotatorDevice ? `${selectedRotatorDevice.name} (${selectedRotatorDevice.host}:${selectedRotatorDevice.port})` : 'No rotator selected'} | ` +
                            `Socket ${isSocketConnected ? 'Online' : 'Offline'} | ` +
                            `Updated ${lastUpdateAge}s | ` +
                            `Cmd ${commandStateLabel}` +
                            (activeRotatorCommand?.status === TRACKER_COMMAND_STATUS.FAILED && activeRotatorCommand?.reason ? ` | ${activeRotatorCommand.reason}` : '')
                        }
                        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}
                    >
                        <Typography
                            variant="caption"
                            color="text.secondary"
                            noWrap
                            sx={{ display: 'block', fontSize: '0.66rem', lineHeight: 1.2, minWidth: 0, flex: 1 }}
                        >
                            {`${selectedRotatorDevice ? selectedRotatorDevice.name : 'No rotator'} | ${isSocketConnected ? 'Online' : 'Offline'}`}
                        </Typography>
                        <Box
                            sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.4,
                                flexShrink: 0,
                                px: 0.5,
                                py: '1px',
                                borderRadius: 0.75,
                                backgroundColor: 'action.hover'
                            }}
                        >
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.64rem', lineHeight: 1 }}>
                                {`${lastUpdateAge}s`}
                            </Typography>
                            <Tooltip
                                title={`Command: ${commandStateLabel}${activeRotatorCommand?.status === TRACKER_COMMAND_STATUS.FAILED && activeRotatorCommand?.reason ? ` (${activeRotatorCommand.reason})` : ''}`}
                            >
                                <Box component="span" sx={{ display: 'inline-flex' }}>
                                    <commandStatusIcon.Icon sx={{ fontSize: '0.8rem', color: commandStatusIcon.color }} />
                                </Box>
                            </Tooltip>
                        </Box>
                    </Box>
                </Grid>

                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0.5rem 0.5rem 0rem 0.5rem'}}>
                    <Grid container direction="row" spacing={1} sx={{ alignItems: 'flex-end' }}>
                        <Grid size="grow">
                            <FormControl disabled={isRotatorSelectionDisabled(trackingState)}
                                         sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth variant="outlined" size="small">
                                <InputLabel htmlFor="rotator-select">{t('rotator_control_labels.rotator_label')}</InputLabel>
                                <Select
                                    id="rotator-select"
                                    value={rotators.length > 0? selectedRotator: "none"}
                                    onChange={(event) => {
                                        handleRotatorChange(event);
                                    }}
                                    size="small"
                                    label={t('rotator_control_labels.rotator_label')}>
                                    <MenuItem value="none">
                                        {t('rotator_control_labels.no_rotator_control')}
                                    </MenuItem>
                                    <MenuItem value="" disabled>
                                        <em>{t('rotator_control_labels.select_rotator')}</em>
                                    </MenuItem>
                                    {rotators.map((rotators, index) => {
                                        return <MenuItem value={rotators.id} key={index}>{rotators.name} ({rotators.host}:{rotators.port})</MenuItem>;
                                    })}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid>
                            <IconButton
                                onClick={() => navigate('/hardware/rotator')}
                                sx={{
                                    height: '100%',
                                    marginBottom: 1,
                                    borderRadius: 1,
                                    backgroundColor: 'primary.main',
                                    color: 'white',
                                    '&:hover': {
                                        backgroundColor: 'primary.dark',
                                    }
                                }}
                            >
                                <SettingsIcon />
                            </IconButton>
                        </Grid>
                    </Grid>
                </Grid>

                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0rem 0.5rem 0rem 0.5rem'}}>

                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}>

                    </Grid>

                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            <GaugeAz
                                az={rotatorData['az']}
                                limits={[activePass?.['start_azimuth'], activePass?.['end_azimuth']]}
                                peakAz={activePass?.['peak_azimuth']}
                                targetCurrentAz={satelliteData?.['position']['az']}
                                isGeoStationary={activePass?.['is_geostationary']}
                                isGeoSynchronous={activePass?.['is_geosynchronous']}
                                hardwareLimits={[rotatorData['minaz'], rotatorData['maxaz']]}
                            />
                        </Grid>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            <GaugeEl
                                el={rotatorData['el']}
                                maxElevation={activePass?.['peak_altitude']}
                                targetCurrentEl={satelliteData?.['position']['el']}
                                hardwareLimits={[rotatorData['minel'], rotatorData['maxel']]}
                            />
                        </Grid>

                    </Grid>

                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "stretch",
                    }}>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            {t('rotator_control.az')} <Typography
                            variant="h5"
                            sx={{
                                fontFamily: "Monospace, monospace",
                                fontWeight: "bold",
                                display: "inline-flex",
                                alignItems: "center",
                                minWidth: "80px",
                                justifyContent: "center"
                            }}
                        >
                            {rotatorData['az'].toFixed(1)}°
                        </Typography>
                        </Grid>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                             {t('rotator_control.el')} <Typography
                            variant="h5"
                            sx={{
                                fontFamily: "Monospace, monospace",
                                fontWeight: "bold",
                                display: "inline-flex",
                                alignItems: "center",
                                minWidth: "80px",
                                justifyContent: "center"
                            }}
                        >
                            {rotatorData['el'].toFixed(1)}°
                        </Typography>
                        </Grid>
                    </Grid>

                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "stretch",
                    }}>
                        <Grid size="grow"
                              style={{paddingRight: '0.5rem', flex: 1, paddingBottom: '0.5rem', paddingTop: '0.2rem'}}
                              container spacing={1} justifyContent="center">
                            <Grid>
                                <Button
                                    size="small"
                                    disabled={!canControlRotator(rotatorData, trackingState)}
                                    fullWidth={true}
                                    variant="contained"
                                    color="primary"
                                    style={{height: '30px', fontSize: '0.9rem', padding: 0}}
                                    onClick={() => {
                                        handleNudgeCommand("nudge_counter_clockwise");
                                    }}>
                                    {t('rotator_control.ccw')}
                                </Button>
                            </Grid>
                            <Grid>
                                <Button
                                    size="small"
                                    disabled={!canControlRotator(rotatorData, trackingState)}
                                    fullWidth={true}
                                    variant="contained"
                                    color="primary"
                                    sx={{}}
                                    style={{height: '30px', fontSize: '0.9rem', padding: 0}}
                                    onClick={() => {
                                        handleNudgeCommand("nudge_clockwise");
                                    }}>
                                    {t('rotator_control.cw')}
                                </Button>
                            </Grid>
                        </Grid>
                        <Grid size="grow"
                              style={{paddingRight: '0rem', flex: 1, paddingBottom: '0.5rem', paddingTop: '0.2rem'}}
                              container
                              spacing={1} justifyContent="center">
                            <Grid>
                                <Button
                                    size="small"
                                    disabled={!canControlRotator(rotatorData, trackingState)}
                                    fullWidth={true}
                                    variant="contained"
                                    color="primary"
                                    style={{height: '30px', fontSize: '0.9rem', padding: 0}}
                                    onClick={() => {
                                        handleNudgeCommand("nudge_up");
                                    }}>
                                    {t('rotator_control.up')}
                                </Button>
                            </Grid>
                            <Grid>
                                <Button
                                    size="small"
                                    disabled={!canControlRotator(rotatorData, trackingState)}
                                    fullWidth={true}
                                    variant="contained"
                                    color="primary"
                                    style={{height: '30px', fontSize: '0.9rem', padding: 0}}
                                    onClick={() => {
                                        handleNudgeCommand("nudge_down");
                                    }}>
                                    {t('rotator_control.down')}
                                </Button>
                            </Grid>
                        </Grid>
                    </Grid>

                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "stretch",
                    }}>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            <Paper
                                elevation={1}
                                sx={{
                                    height: '30px',
                                    padding: '2px 0px',
                                    backgroundColor: theme => {
                                        const rotatorStatus = getCurrentStatusofRotator(rotatorData, lastRotatorEvent);
                                        return rotatorStatus.bgColor
                                    },
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '4px',
                                    minWidth: '180px',
                                    width: '100%',
                                }}
                            >
                                <Typography
                                    variant="body2"
                                    sx={{
                                        fontFamily: "Monospace, monospace",
                                        fontWeight: "bold",
                                        color: theme => {
                                            const rotatorStatus = getCurrentStatusofRotator(rotatorData, lastRotatorEvent);
                                            return rotatorStatus.fgColor;
                                        }
                                    }}
                                >
                                    {getCurrentStatusofRotator(rotatorData, lastRotatorEvent).value}
                                </Typography>
                            </Paper>
                        </Grid>

                    </Grid>
                </Grid>

                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0.5rem 0.5rem 0rem 0.5rem'}}>
                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "stretch",
                    }}>
                        <Grid size="grow" style={{paddingRight: '0.5rem', flex: 1}}>
                            <Tooltip title={connectDisabled ? connectDisabledReason : ''}>
                                <span style={{ display: 'block' }}>
                                    <Button
                                        loading={isConnectActionPending || rotatorConnecting}
                                        disabled={connectDisabled}
                                        fullWidth={true}
                                        variant="contained"
                                        color="success"
                                        style={{height: '40px'}}
                                        onClick={() => {
                                            connectRotator()
                                        }}
                                    >
                                        {t('rotator_control.connect')}
                                    </Button>
                                </span>
                            </Tooltip>
                        </Grid>
                        <Grid size="grow" style={{paddingRight: '0.5rem', flex: 1.5}}>
                            <Tooltip title={disconnectDisabled ? disconnectDisabledReason : ''}>
                                <span style={{ display: 'block' }}>
                                    <Button
                                        loading={isDisconnectActionPending || rotatorDisconnecting}
                                        disabled={disconnectDisabled}
                                        fullWidth={true}
                                        variant="contained"
                                        color="error"
                                        style={{height: '40px'}}
                                        onClick={() => {
                                             disconnectRotator()
                                        }}
                                    >
                                        {t('rotator_control.disconnect')}
                                    </Button>
                                </span>
                            </Tooltip>
                        </Grid>
                        <Grid size="grow" style={{paddingRight: '0rem', flex: 1}}>
                            <Tooltip title={parkDisabled ? parkDisabledReason : ''}>
                                <span style={{ display: 'block' }}>
                                    <Button
                                        loading={isParkActionPending}
                                        disabled={parkDisabled}
                                        fullWidth={true}
                                        variant="contained"
                                        color="warning"
                                        style={{height: '40px'}}
                                        onClick={() => {
                                            parkRotator()
                                        }}
                                    >
                                        {t('rotator_control.park')}
                                    </Button>
                                </span>
                            </Tooltip>
                        </Grid>
                    </Grid>
                </Grid>

                <Grid size={{xs: 12, sm: 12, md: 12}} style={{padding: '0.5rem 0.5rem 0.5rem'}}>
                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "stretch",
                    }}>
                        <Grid size="grow" style={{paddingRight: '0.5rem'}}>
                            <Tooltip title={trackDisabled ? trackDisabledReason : ''}>
                                <span style={{ display: 'block' }}>
                                    <Button
                                        fullWidth={true}
                                        loading={isTrackActionPending}
                                        disabled={trackDisabled}
                                        variant="contained"
                                        color="success"
                                        style={{height: '60px'}}
                                        onClick={()=>{handleTrackingStart()}}
                                    >
                                        {t('rotator_control.track')}
                                    </Button>
                                </span>
                            </Tooltip>
                        </Grid>
                        <Grid size="grow">
                            <Tooltip title={stopDisabled ? stopDisabledReason : ''}>
                                <span style={{ display: 'block' }}>
                                    <Button
                                        fullWidth={true}
                                        loading={isStopActionPending}
                                        disabled={stopDisabled}
                                        variant="contained"
                                        color="error"
                                        style={{height: '60px'}}
                                        onClick={() => {handleTrackingStop()}}
                                    >
                                        {t('rotator_control.stop')}
                                    </Button>
                                </span>
                            </Tooltip>
                        </Grid>
                    </Grid>
                </Grid>
            </Grid>
        </>
    );
});

export default RotatorControl;
