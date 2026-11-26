<?php

namespace App\Http\Middleware;

use Illuminate\Foundation\Http\Middleware\TrimStrings as Middleware;

class TrimStrings extends Middleware
{
    /**
     * 不需要去除前后空格的字段名
     * @var array<int, string>
     */
    protected $except = [
        'password',
        'password_confirmation',
        'encrypted_data',
        'signature'
    ];

    protected function clean($request)
    {
        // Form signatures include whitespace in non-empty merchant fields.
        if ($request->is('api/v1/guest/payment/notify/EPay/*', 'api/v1/guest/payment/notify/MGate/*')) {
            return;
        }
        parent::clean($request);
    }
}
