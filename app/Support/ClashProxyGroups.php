<?php

namespace App\Support;

final class ClashProxyGroups
{
    /** Expand template patterns without leaving empty or dangling groups. */
    public static function appendNodes(array $groups, array $names): array
    {
        foreach ($groups as &$group) {
            $members = [];
            $filtered = false;
            foreach (is_array($group['proxies'] ?? null) ? $group['proxies'] : [] as $member) {
                if (is_string($member) && @preg_match($member, '') !== false) {
                    $filtered = true;
                    foreach ($names as $name) {
                        if (@preg_match($member, $name) === 1) {
                            $members[] = $name;
                        }
                    }
                } else {
                    $members[] = $member;
                }
            }
            if (!$filtered) {
                $members = array_merge($members, $names);
            }
            $group['proxies'] = array_values(array_unique($members));
            // Keep the named group for rules/other groups that reference it.
            // DIRECT is a built-in policy, not a fabricated subscription node.
            if (!$group['proxies'] && empty($group['use'])) {
                $group['proxies'] = ['DIRECT'];
            }
        }
        unset($group);
        return array_values($groups);
    }
}
