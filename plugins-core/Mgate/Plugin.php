<?php

namespace Plugin\Mgate;

use App\Services\Plugin\AbstractPlugin;
use App\Contracts\PaymentAttemptInterface;
use App\Exceptions\ApiException;
use Curl\Curl;

class Plugin extends AbstractPlugin implements PaymentAttemptInterface
{
    public function boot(): void
    {
        $this->filter('available_payment_methods', function ($methods) {
            if ($this->getConfig('enabled', true)) {
                $methods['MGate'] = [
                    'name' => $this->getConfig('display_name', 'MGate'),
                    'icon' => $this->getConfig('icon', '🏛️'),
                    'plugin_code' => $this->getPluginCode(),
                    'type' => 'plugin'
                ];
            }
            return $methods;
        });
    }

    public function form(): array
    {
        return [
            'mgate_url' => [
                'label' => 'API地址',
                'type' => 'string',
                'required' => true,
                'description' => 'MGate支付网关API地址'
            ],
            'mgate_app_id' => [
                'label' => 'APP ID',
                'type' => 'string',
                'required' => true,
                'description' => 'MGate应用标识符'
            ],
            'mgate_app_secret' => [
                'label' => 'App Secret',
                'type' => 'string',
                'required' => true,
                'description' => 'MGate应用密钥'
            ],
            'mgate_source_currency' => [
                'label' => '源货币',
                'type' => 'string',
                'description' => '默认CNY，源货币类型'
            ]
        ];
    }

    public function pay($order): array
    {
        $params = [
            'out_trade_no' => $order['trade_no'],
            'total_amount' => $order['total_amount'],
            'notify_url' => $order['notify_url'],
            'return_url' => $order['return_url']
        ];

        if ($this->getConfig('mgate_source_currency')) {
            $params['source_currency'] = $this->getConfig('mgate_source_currency');
        }

        $params['app_id'] = $this->getConfig('mgate_app_id');
        ksort($params);
        $str = http_build_query($params) . $this->getConfig('mgate_app_secret');
        $params['sign'] = md5($str);

        $url = rtrim((string) $this->getConfig('mgate_url'), '/');
        if (strtolower((string) parse_url($url, PHP_URL_SCHEME)) !== 'https') {
            throw new ApiException('MGate 网关需要 HTTPS 地址');
        }
        $curl = new Curl();
        $curl->setUserAgent('MGate');
        $curl->setOpt(CURLOPT_SSL_VERIFYPEER, true);
        $curl->setOpt(CURLOPT_SSL_VERIFYHOST, 2);
        $curl->setOpt(CURLOPT_FOLLOWLOCATION, false);
        try {
            $curl->post($url . '/v1/gateway/fetch', http_build_query($params));
            if ($curl->error || !$curl->response) {
                throw new ApiException('MGate 网关请求失败');
            }
            $result = $curl->response;
        } finally {
            $curl->close();
        }

        if (!isset($result->data->trade_no, $result->data->pay_url)) {
            throw new ApiException('接口请求失败');
        }

        return [
            'type' => 1,
            'data' => $result->data->pay_url
        ];
    }

    public function notify($params): array|bool
    {
        $secret = $this->getConfig('mgate_app_secret');
        if (!is_string($secret) || trim($secret) === '' || !is_array($params)) {
            return false;
        }
        foreach ($params as $key => $value) {
            if ($value === null) {
                // Laravel converts empty form fields to null before the notification reaches us.
                $params[$key] = '';
            } elseif (!is_string($value) && !is_int($value)) {
                return false;
            }
        }
        if (!is_string($params['sign'] ?? null)
            || !is_string($params['out_trade_no'] ?? null) || trim($params['out_trade_no']) === ''
            || !is_string($params['trade_no'] ?? null) || trim($params['trade_no']) === '') {
            return false;
        }

        $sign = $params['sign'];
        unset($params['sign']);
        ksort($params);
        reset($params);
        $str = http_build_query($params) . $secret;

        if (!hash_equals(md5($str), $sign)) {
            return false;
        }

        return [
            'trade_no' => $params['out_trade_no'],
            'callback_no' => $params['trade_no'],
            'transaction_no' => $params['trade_no'],
        ];
    }
}
