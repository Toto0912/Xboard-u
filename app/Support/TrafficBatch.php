<?php

namespace App\Support;

use App\Models\User;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Closure;
use Illuminate\Support\Facades\DB;

/** Atomic arithmetic updates, bounded for SQLite bind limits and MySQL packets. */
final class TrafficBatch
{
    public static function incrementUsage(array $traffic, $rate): void
    {
        $increments = [];
        $multiply = self::byteMultiplier($rate);
        foreach ($traffic as $uid => [$up, $down]) {
            $increments[(int) $uid] = [$multiply($up), $multiply($down)];
        }
        $now = time();
        self::increment((new User())->getTable(), $increments, ['t' => $now, 'updated_at' => $now]);
    }

    public static function byteMultiplier(int|float|string $rate, bool $dailyStat = false): Closure
    {
        if (DB::getDriverName() !== 'pgsql') {
            return $dailyStat
                ? static fn ($bytes): int => (int) ($bytes * $rate)
                : static fn ($bytes) => $bytes * $rate;
        }

        // Quota rounds to the nearest byte; historical per-user stats discard fractional bytes.
        $decimal = BigDecimal::of(is_float($rate) ? json_encode($rate, JSON_THROW_ON_ERROR) : $rate);
        $unitRate = $decimal->isEqualTo(1);
        $rounding = $dailyStat ? RoundingMode::Down : RoundingMode::HalfUp;
        return static function ($bytes) use ($decimal, $unitRate, $rounding): int {
            if ($unitRate && is_int($bytes)) {
                return $bytes;
            }
            $bytes = is_float($bytes) ? json_encode($bytes, JSON_THROW_ON_ERROR) : $bytes;
            return $decimal->multipliedBy($bytes)->toScale(0, $rounding)->toInt();
        };
    }

    public static function increment(string $table, array $increments, array $touch): void
    {
        ksort($increments, SORT_NUMERIC);
        $grammar = DB::connection()->getQueryGrammar();
        $idColumn = $grammar->wrap('id');
        // PostgreSQL infers the type of every untyped THEN parameter from ELSE.
        $zero = DB::getDriverName() === 'pgsql' ? 'CAST(0 AS BIGINT)' : '0';
        foreach (array_chunk($increments, 100, true) as $chunk) {
            $sets = [];
            $bindings = [];
            foreach (['u', 'd'] as $offset => $column) {
                $wrapped = $grammar->wrap($column);
                $case = "{$wrapped} = {$wrapped} + CASE {$idColumn}";
                foreach ($chunk as $id => $traffic) {
                    $case .= ' WHEN ? THEN ?';
                    array_push($bindings, (int) $id, $traffic[$offset]);
                }
                $sets[] = $case . " ELSE {$zero} END";
            }
            foreach ($touch as $column => $value) {
                $sets[] = $grammar->wrap($column) . ' = ?';
                $bindings[] = $value;
            }
            $where = implode(',', array_fill(0, count($chunk), '?'));
            array_push($bindings, ...array_map('intval', array_keys($chunk)));
            DB::update('UPDATE ' . $grammar->wrapTable($table) . ' SET ' . implode(', ', $sets)
                . " WHERE {$idColumn} IN ({$where})", $bindings);
        }
    }
}
