<?php

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;

// Keep the root list/entries compatible with existing panel consumers while
// retaining nested JSON objects, including {} and future native fields.
final class NativeConfigArray implements CastsAttributes
{
    public function get($model, string $key, mixed $value, array $attributes): mixed
    {
        if ($value === null) { return null; }
        $decoded = json_decode($value, false, 512, JSON_THROW_ON_ERROR);
        if (!is_array($decoded)) { return $decoded; }
        return array_map(static fn ($item) => is_object($item) ? (array) $item : $item, $decoded);
    }

    public function set($model, string $key, mixed $value, array $attributes): mixed
    {
        return $value === null ? null : json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }
}
