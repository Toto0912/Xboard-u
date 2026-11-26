<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use RuntimeException;
use ZipArchive;

final class PackageFiles
{
    public static function directory(string $root, string $name): string
    {
        if (!preg_match('/^[\pL\pN][\pL\pN_. -]*$/uD', $name) || !self::portableName($name)) {
            throw new RuntimeException('Invalid package directory name');
        }
        $path = rtrim($root, '/\\') . DIRECTORY_SEPARATOR . $name;
        if (is_link($path)) {
            throw new RuntimeException('Package directory cannot be a symbolic link');
        }
        return $path;
    }

    private static function portableName(string $name): bool
    {
        return $name !== '' && !preg_match('~[\\\\:<>"|?*\x00-\x1f]|[. ]$|^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)~iD', $name);
    }

    public static function extract(ZipArchive $zip, string $target): void
    {
        try {
            for ($i = 0; $i < $zip->numFiles; ++$i) {
                $name = $zip->getNameIndex($i);
                foreach (explode('/', rtrim($name, '/')) as $part) {
                    if (!self::portableName($part)) {
                        throw new RuntimeException('Invalid package member name');
                    }
                }
                if ($zip->getExternalAttributesIndex($i, $os, $attributes) && $os === ZipArchive::OPSYS_UNIX
                    && !in_array(($attributes >> 16) & 0170000, [0, 0040000, 0100000], true)) {
                    throw new RuntimeException('Unsupported package member type');
                }
            }
            if (!$zip->extractTo($target)) {
                throw new RuntimeException('Package extraction failed');
            }
        } finally {
            $zip->close();
        }
    }

    public static function replace(string $source, string $target, bool $staticOnly = false): void
    {
        $root = dirname($target);
        File::ensureDirectoryExists($root);
        $stage = $root . '/.stage-' . Str::uuid();
        $old = $root . '/.old-' . Str::uuid();
        File::ensureDirectoryExists($stage);
        try {
            $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($source, \FilesystemIterator::SKIP_DOTS));
            foreach ($files as $file) {
                if ($file->isLink() || !$file->isFile()) {
                    throw new RuntimeException('Unsupported package file type');
                }
                $relative = substr($file->getPathname(), strlen(rtrim($source, '/\\')) + 1);
                if ($staticOnly && (!preg_match('/\.(?:html?|css|m?js|json|webmanifest|wasm|svg|png|gif|jpe?g|webp|ico|avif|woff2?|ttf|otf|eot|mp[34]|webm|ogg|txt)$/iD', $relative)
                    || preg_match('~(?:^|/)\.|(?:^|/)config\.json$|\.(?:php\d*|phtml|phar)(?:\.|$)~i', str_replace('\\', '/', $relative)))) {
                    continue;
                }
                $dest = $stage . '/' . $relative;
                File::ensureDirectoryExists(dirname($dest));
                if (!File::copy($file->getPathname(), $dest)) {
                    throw new RuntimeException('Cannot stage package files');
                }
            }
            Cache::lock('package:replace:' . hash('sha256', $target), 30)->block(5, function () use ($target, $stage, $old) {
                if (is_link($target) || (file_exists($target) && !rename($target, $old))) {
                    throw new RuntimeException('Cannot move installed package');
                }
                if (!rename($stage, $target)) {
                    if (is_dir($old)) {
                        rename($old, $target);
                    }
                    throw new RuntimeException('Cannot install package files');
                }
            });
            if (is_dir($old)) {
                File::deleteDirectory($old);
            }
        } finally {
            if (is_dir($stage)) {
                File::deleteDirectory($stage);
            }
        }
    }
}
