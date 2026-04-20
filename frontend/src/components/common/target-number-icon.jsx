import React from 'react';
import { Box } from '@mui/material';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';

const TargetNumberIcon = React.memo(function TargetNumberIcon({
    targetNumber,
    size = 18,
    sx = {},
    iconColor = 'info.main',
    badgeBgColor = 'error.main',
    badgeTextColor = 'common.white',
}) {
    const badgeValue = Number.isFinite(Number(targetNumber)) ? String(targetNumber) : '?';

    return (
        <Box
            component="span"
            sx={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: size,
                height: size,
                ...sx,
            }}
        >
            <GpsFixedIcon
                sx={{
                    fontSize: size,
                    color: iconColor,
                }}
            />
            <Box
                component="span"
                sx={{
                    position: 'absolute',
                    right: -5,
                    bottom: -4,
                    minWidth: 12,
                    height: 12,
                    px: 0.25,
                    borderRadius: '999px',
                    bgcolor: badgeBgColor,
                    color: badgeTextColor,
                    border: '1px solid',
                    borderColor: 'background.paper',
                    fontSize: '0.55rem',
                    fontWeight: 700,
                    lineHeight: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                {badgeValue}
            </Box>
        </Box>
    );
});

export default TargetNumberIcon;
