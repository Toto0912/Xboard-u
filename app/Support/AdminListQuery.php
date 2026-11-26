<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class AdminListQuery
{
    public static function validate(Request $request, string $columns, array $extraFilters = []): void
    {
        $fields = explode(' ', $columns);
        if (is_string($request->input('sort'))) {
            $direction = $request->input('sort_type', 'DESC');
            if (!is_string($direction) || !in_array(strtoupper($direction), ['ASC', 'DESC'], true)) {
                throw ValidationException::withMessages(['sort_type' => 'Invalid sort direction.']);
            }
            $request->merge(['sort' => [['id' => $request->input('sort'), 'desc' => strtoupper($direction) === 'DESC']]]);
        }
        $request->validate([
            'filter' => 'sometimes|array|list|max:100',
            'filter.*' => 'required|array',
            'filter.*.id' => ['required', 'string', Rule::in(array_merge($fields, $extraFilters))],
            'filter.*.value' => 'present',
            'filter.*.logic' => 'sometimes|in:and,or',
            'sort' => 'sometimes|array|list|max:20',
            'sort.*' => 'required|array',
            'sort.*.id' => ['required', 'string', Rule::in($fields)],
            'sort.*.desc' => ['present', function ($key, $value, $fail) {
                if (!in_array($value, [true, false, 0, 1, '0', '1', 'true', 'false'], true)) $fail('Invalid sort direction.');
            }],
        ]);
        foreach ($request->input('filter', []) as $index => $row) {
            $value = $row['value'];
            if (is_array($value) && (!array_is_list($value) || count($value) > 1000
                || array_filter($value, static fn ($item) => !is_scalar($item)))) {
                throw ValidationException::withMessages(["filter.$index.value" => 'Expected a list of scalar values.']);
            }
        }
    }
}
