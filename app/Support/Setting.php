<?php

namespace App\Support;

use App\Models\Setting as SettingModel;
use Illuminate\Database\QueryException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Illuminate\Contracts\Cache\Repository;

class Setting
{
    const CACHE_KEY = 'admin_settings';

    private Repository $cache;
    private ?array $loadedSettings = null; // 请求内缓存

    public function __construct()
    {
        $this->cache = Cache::store('redis');
    }

    public static function matchesNodeToken(mixed $token, bool $fresh = false): bool
    {
        if (!is_string($token) || $token === '') {
            return false;
        }
        // Workerman has no HTTP request boundary to reset the scoped settings.
        $stored = $fresh
            ? (SettingModel::query()->useWritePdo()->toBase()->where('name', 'server_token')->value('value') ?? config('v2board.server_token'))
            : admin_setting('server_token');
        return is_string($stored) && $stored !== '' && hash_equals($stored, $token);
    }

    /**
     * 获取配置.
     */
    public function get(string $key, mixed $default = null): mixed
    {
        $this->load();
        return Arr::get($this->loadedSettings, strtolower($key), $default);
    }

    /**
     * 设置配置信息.
     */
    public function set(string $key, mixed $value = null): bool
    {
        SettingModel::createOrUpdate(strtolower($key), $value);
        $this->flush();
        return true;
    }

    /**
     * 保存配置到数据库.
     */
    public function save(array $settings): bool
    {
        foreach ($settings as $key => $value) {
            SettingModel::createOrUpdate(strtolower($key), $value);
        }
        $this->flush();
        return true;
    }

    /**
     * 删除配置信息
     */
    public function remove(string $key): bool
    {
        SettingModel::where('name', $key)->delete();
        $this->flush();
        return true;
    }

    /**
     * 更新单个设置项
     */
    public function update(string $key, $value): bool
    {
        return $this->set($key, $value);
    }
    
    /**
     * 批量获取配置项
     */
    public function getBatch(array $keys): array
    {
        $this->load();
        $result = [];
        
        foreach ($keys as $index => $item) {
            $isNumericIndex = is_numeric($index);
            $key = strtolower($isNumericIndex ? $item : $index);
            $default = $isNumericIndex ? config('v2board.' . $item) : (config('v2board.' . $key) ?? $item);
            
            $result[$key] = Arr::get($this->loadedSettings, $key, $default);
        }
        
        return $result;
    }
    
    /**
     * 将所有设置转换为数组
     */
    public function toArray(): array
    {
        $this->load();
        return $this->loadedSettings;
    }

    /**
     * 加载配置到请求内缓存
     */
    private function load(): void
    {
        if ($this->loadedSettings !== null) {
            return;
        }

        $read = static fn () => array_change_key_case(
            SettingModel::query()->useWritePdo()->toBase()->pluck('value', 'name')->all(), CASE_LOWER
        );
        try {
            $settings = $this->cache->rememberForever(self::CACHE_KEY, $read);
        } catch (\Throwable) {
            // The authoritative settings (including the node token) remain available without Redis.
            try {
                $settings = $read();
            } catch (QueryException $error) {
                if (Schema::hasTable((new SettingModel())->getTable())) {
                    throw $error;
                }
                // The installer can read defaults before running the settings migration.
                $settings = [];
            }
        }
        foreach ($settings as $key => $value) {
            if ($key !== 'server_token' && is_string($value)) {
                $decoded = json_decode($value, true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    $settings[$key] = $decoded;
                }
            }
        }
        $this->loadedSettings = $settings;
    }

    /**
     * 清空缓存
     */
    public function flush(): void
    {
        $this->cache->forget(self::CACHE_KEY);
        $this->loadedSettings = null;
    }
}
