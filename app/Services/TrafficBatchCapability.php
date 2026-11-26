<?php

namespace App\Services;

use Illuminate\Database\SQLiteDatabaseDoesNotExistException;
use Illuminate\Support\Facades\DB;
use PDOException;
use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;

final class TrafficBatchCapability
{
    private const MIGRATION = '2026_11_26_000001_create_traffic_batches';

    public static function available(): bool
    {
        $repository = config('database.migrations');
        $table = is_array($repository) ? $repository['table'] : $repository;

        try {
            $connection = DB::connection();
            $lookup = static fn (): bool => $connection->table($table, 'repo')->useWritePdo()
                ->where('repo.migration', self::MIGRATION)->exists();

            // A missing table must not abort an existing PostgreSQL transaction.
            return $connection->transactionLevel() > 0 && $connection->getDriverName() === 'pgsql'
                ? $connection->transaction($lookup)
                : $lookup();
        } catch (PDOException | SQLiteDatabaseDoesNotExistException $exception) {
            if ($exception instanceof PDOException) {
                [$state, $code, $message] = array_pad($exception->errorInfo ?? [], 3, null);
                if ($state === '42P01'
                    || ($state === '42S02' && (int) $code === 1146)
                    || ($state === 'HY000' && (int) $code === 1 && str_starts_with((string) $message, 'no such table:'))) {
                    return false;
                }
            }
            report($exception);
            throw new ServiceUnavailableHttpException(null, 'Unable to determine traffic batch capability.', $exception);
        }
    }
}
