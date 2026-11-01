#!/bin/sh
set -eu
printf '%s\n' 'xboard-u uses reviewed source/image deployments.' 'See docs/UPGRADE-XBOARD-U.md before upgrading.' 'No files or database records have been changed.' >&2
exit 1
