<?php

namespace App\Support;

use Symfony\Component\Yaml\Yaml;

final class ClashTemplate
{
    public static function parse(string $template, string $appName): array
    {
        $config = Yaml::parse($template);
        return str_contains($template, '$app_name') ? self::replaceName($config, $appName) : $config;
    }

    private static function replaceName(array $values, string $appName): array
    {
        $result = [];
        foreach ($values as $key => $value) {
            $key = is_string($key) ? str_replace('$app_name', $appName, $key) : $key;
            if (is_array($value)) {
                $value = self::replaceName($value, $appName);
            } elseif (is_string($value)) {
                $value = str_replace('$app_name', $appName, $value);
            }
            $result[$key] = $value;
        }
        return $result;
    }

    public static function subscriptionRule(): ?string
    {
        $host = trim(request()->getHost(), '[]');
        if ($host === '') {
            return null;
        }
        if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            return "IP-CIDR6,{$host}/128,DIRECT,no-resolve";
        }
        if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return "IP-CIDR,{$host}/32,DIRECT,no-resolve";
        }
        return "DOMAIN,{$host},DIRECT";
    }
}
