<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/** Atomic arithmetic updates, bounded for SQLite bind limits and MySQL packets. */
final class TrafficBatch
{
    public static function increment(string $table, array $increments, array $touch): void
    {
        ksort($increments, SORT_NUMERIC);
        $grammar = DB::connection()->getQueryGrammar();
        $idColumn = $grammar->wrap('id');
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
                $sets[] = $case . ' ELSE 0 END';
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
