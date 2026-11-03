<?php

require_once __DIR__ . '/../app/Support/AdminAssetPatcher.php';

\App\Support\AdminAssetPatcher::prepare(dirname(__DIR__));
fwrite(STDOUT, "Prepared xboard-u admin extensions.\n");
