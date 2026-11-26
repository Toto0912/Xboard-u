<?php

namespace Plugin\CoinPayments;

use App\Contracts\PaymentQuoteCurrencyInterface;
use App\Exceptions\ApiException;
use App\Services\Plugin\AbstractPlugin;
use Brick\Math\BigDecimal;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\HeaderUtils;

class Plugin extends AbstractPlugin implements PaymentQuoteCurrencyInterface
{
    private const CURRENCY_CODE = '/\A[A-Z0-9][A-Z0-9._-]{0,31}\z/';

    public function boot(): void
    {
        $this->filter('available_payment_methods', function($methods) {
            if ($this->getConfig('enabled', true)) {
                $methods['CoinPayments'] = [
                    'name' => $this->getConfig('display_name', 'CoinPayments'),
                    'icon' => $this->getConfig('icon', '💰'),
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
            'coinpayments_merchant_id' => [
                'label' => 'Merchant ID',
                'type' => 'string',
                'required' => true,
                'description' => '商户 ID，填写您在 Account Settings 中得到的 ID'
            ],
            'coinpayments_ipn_secret' => [
                'label' => 'IPN Secret',
                'type' => 'string',
                'required' => true,
                'description' => '通知密钥，填写您在 Merchant Settings 中自行设置的值'
            ],
            'coinpayments_currency' => [
                'label' => '货币代码',
                'type' => 'string',
                'required' => true,
                'description' => '填写您的货币代码（大写），建议与 Merchant Settings 中的值相同'
            ]
        ];
    }

    public function pay($order): array
    {
        $parseUrl = parse_url($order['return_url']);
        $port = isset($parseUrl['port']) ? ":{$parseUrl['port']}" : '';
        $successUrl = "{$parseUrl['scheme']}://{$parseUrl['host']}{$port}";

        $params = [
            'cmd' => '_pay_simple',
            'reset' => 1,
            'merchant' => $this->getConfig('coinpayments_merchant_id'),
            'item_name' => $order['trade_no'],
            'item_number' => $order['trade_no'],
            'want_shipping' => 0,
            'currency' => $this->quoteCurrency(),
            'amountf' => sprintf('%.2f', $order['total_amount'] / 100),
            'success_url' => $successUrl,
            'cancel_url' => $order['return_url'],
            'ipn_url' => $order['notify_url']
        ];

        $params_string = http_build_query($params);

        return [
            'type' => 1,
            'data' => 'https://www.coinpayments.net/index.php?' . $params_string
        ];
    }

    public function quoteCurrency(): string
    {
        $currency = strtoupper(trim((string) $this->getConfig('coinpayments_currency')));
        if (!preg_match(self::CURRENCY_CODE, $currency)) {
            throw new ApiException('Invalid CoinPayments quote currency');
        }
        return $currency;
    }

    public function notify($params): array|string
    {
        $body = request()->getContent();
        $signature = request()->header('HMAC', '');
        $secret = trim((string) $this->getConfig('coinpayments_ipn_secret'));
        if ($body === '' || $secret === '' || !hash_equals(hash_hmac('sha512', $body, $secret), $signature)) {
            throw new ApiException('HMAC signature does not match', 400);
        }

        // Only the form body is signed; Laravel's input() can also include query parameters.
        $fields = HeaderUtils::parseQuery($body, true);
        $params = [];
        $names = ['merchant', 'ipn_mode', 'ipn_type', 'status', 'item_number', 'txn_id',
            'amount1', 'currency1', 'amount2', 'currency2', 'received_amount'];
        foreach ($names as $name) {
            if (isset($fields[$name])) {
                if (count($fields[$name]) !== 1) {
                    throw new ApiException('Duplicate CoinPayments notification field');
                }
                $params[$name] = $fields[$name][0];
            }
        }
        $merchant = trim((string) $this->getConfig('coinpayments_merchant_id'));
        if ($merchant === '' || ($params['merchant'] ?? null) !== $merchant
            || ($params['ipn_mode'] ?? null) !== 'hmac' || ($params['ipn_type'] ?? null) !== 'simple') {
            throw new ApiException('Unexpected CoinPayments merchant or notification type');
        }
        $status = filter_var($params['status'] ?? null, FILTER_VALIDATE_INT);
        if ($status === false) {
            throw new ApiException('Invalid CoinPayments payment status');
        }
        if ($status >= 100 || $status === 2) {
            if (($params['amount1'] ?? '') === '' || ($params['currency1'] ?? '') === '') {
                throw new ApiException('Missing CoinPayments original amount or currency');
            }
            if (isset($params['received_amount'])) {
                $this->validateReceivedAmount($params);
            }
            return [
                'trade_no' => $params['item_number'] ?? null,
                'callback_no' => $params['txn_id'] ?? null,
                'transaction_no' => $params['txn_id'] ?? null,
                'verified_order_gross' => $params['amount1'],
                'verified_order_currency' => strtoupper($params['currency1']),
                'custom_result' => 'IPN OK'
            ];
        } else if ($status < 0) {
            throw new ApiException('Payment Timed Out or Error');
        } else {
            return 'IPN OK: pending';
        }
    }

    private function validateReceivedAmount(array $params): void
    {
        $decimal = '/\A[0-9]+(?:\.[0-9]+)?\z/';
        if (!preg_match(self::CURRENCY_CODE, strtoupper($params['currency2'] ?? ''))
            || !preg_match($decimal, $params['amount2'] ?? '') || !preg_match($decimal, $params['received_amount'])) {
            throw new ApiException('Invalid CoinPayments settlement amount or currency');
        }
        // CoinPayments reports both amounts in the buyer's selected currency2.
        $payable = BigDecimal::of($params['amount2']);
        if (!$payable->isPositive() || BigDecimal::of($params['received_amount'])->isLessThan($payable)) {
            Log::warning('CoinPayments receipt requires reconciliation', [
                'trade_no' => $params['item_number'] ?? null, 'transaction_no' => $params['txn_id'] ?? null,
                'currency' => $params['currency2'], 'expected' => $params['amount2'], 'received' => $params['received_amount'],
            ]);
            throw new ApiException('CoinPayments settlement amount does not cover the quoted payment');
        }
    }
} 
