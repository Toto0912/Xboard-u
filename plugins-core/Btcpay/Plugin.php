<?php

namespace Plugin\Btcpay;

use App\Services\Plugin\AbstractPlugin;
use App\Contracts\PaymentQuoteCurrencyInterface;
use Brick\Math\BigDecimal;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use App\Exceptions\ApiException;

class Plugin extends AbstractPlugin implements PaymentQuoteCurrencyInterface
{
    public function boot(): void
    {
        $this->filter('available_payment_methods', function($methods) {
            if ($this->getConfig('enabled', true)) {
                $methods['BTCPay'] = [
                    'name' => $this->getConfig('display_name', 'BTCPay'),
                    'icon' => $this->getConfig('icon', '₿'),
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
            'btcpay_url' => [
                'label' => 'API接口所在网址',
                'type' => 'string',
                'required' => true,
                'description' => '包含最后的斜杠，例如：https://your-btcpay.com/'
            ],
            'btcpay_storeId' => [
                'label' => 'Store ID',
                'type' => 'string',
                'required' => true,
                'description' => 'BTCPay商店标识符'
            ],
            'btcpay_api_key' => [
                'label' => 'API KEY',
                'type' => 'string',
                'required' => true,
                'description' => '个人设置中的API KEY(非商店设置中的)'
            ],
            'btcpay_webhook_key' => [
                'label' => 'WEBHOOK KEY',
                'type' => 'string',
                'required' => true,
                'description' => 'Webhook通知密钥'
            ],
        ];
    }

    public function quoteCurrency(): string
    {
        $configured = admin_setting('currency', 'CNY');
        $currency = is_string($configured) ? strtoupper(trim($configured)) : '';
        if (!preg_match('/\A[A-Z][A-Z0-9._-]{0,31}\z/', $currency)) {
            throw new ApiException('Invalid site currency for BTCPay');
        }
        return $currency;
    }

    public function pay($order): array
    {
        $currency = $order['quote_currency'];
        $minor = $order['total_amount'];
        $amount = sprintf('%d.%02d', intdiv($minor, 100), $minor % 100);
        $response = $this->api()->post($this->invoiceUrl(), [
            'amount' => $amount,
            'currency' => $currency,
            'checkout' => ['paymentTolerance' => 0],
            'metadata' => ['orderId' => $order['trade_no']],
        ]);

        $invoiceAmount = $response->json('amount');
        if (!$response->successful() || !is_string($response->json('checkoutLink')) || $response->json('checkoutLink') === ''
            || $response->json('currency') !== $currency || !$this->isDecimal($invoiceAmount)
            || !BigDecimal::of($invoiceAmount)->isEqualTo($amount)) {
            throw new ApiException("BTCPay could not issue the quoted invoice in {$currency}");
        }

        return ['type' => 1, 'data' => $response->json('checkoutLink')];
    }

    public function notify($params): array|string
    {
        $payload = request()->getContent();
        $secret = $this->getConfig('btcpay_webhook_key');
        if (!is_string($secret) || trim($secret) === '') {
            throw new ApiException('Missing webhook key', 400);
        }
        if (!hash_equals('sha256=' . hash_hmac('sha256', $payload, $secret), (string) request()->header('Btcpay-Sig'))) {
            throw new ApiException('HMAC signature does not match', 400);
        }

        $id = json_decode($payload, true)['invoiceId'] ?? null;
        if (!is_string($id) || $id === '' || $id === '.' || $id === '..') {
            throw new ApiException('Missing BTCPay invoice ID', 400);
        }
        $response = $this->api()->get($this->invoiceUrl() . '/' . rawurlencode($id));
        $invoice = $response->json();
        if (!$response->successful() || ($invoice['id'] ?? null) !== $id || !isset($invoice['status'])) {
            throw new ApiException('Unable to verify BTCPay invoice', 503);
        }
        if ($invoice['status'] !== 'Settled') {
            return 'success';
        }
        $amount = $invoice['amount'] ?? null;
        $currency = $invoice['currency'] ?? null;
        if (!$this->isDecimal($amount) || !is_string($currency) || $currency === '') {
            throw new ApiException('Missing BTCPay invoice amount or currency', 400);
        }

        // Older Greenfield versions report settlement status but omit paidAmount.
        $additionalStatus = $invoice['additionalStatus'] ?? null;
        if (in_array($additionalStatus, ['PaidPartial', 'Invalid'], true)) {
            throw new ApiException('BTCPay invoice requires settlement review', 400);
        }
        $paid = $invoice['paidAmount'] ?? null;
        if ($paid !== null) {
            if (!$this->isDecimal($paid) || BigDecimal::of($paid)->isLessThan($amount)) {
                throw new ApiException('BTCPay payment does not cover the invoice', 400);
            }
        } elseif ($additionalStatus !== 'PaidOver') {
            $tolerance = $invoice['checkout']['paymentTolerance'] ?? null;
            if (!in_array($additionalStatus, ['None', 'PaidLate'], true) || !is_scalar($tolerance)
                || !preg_match('/\A0+(?:\.0+)?\z/', (string) $tolerance)) {
                throw new ApiException('BTCPay invoice requires settlement review', 400);
            }
        }

        return [
            'trade_no' => $invoice['metadata']['orderId'] ?? null,
            'callback_no' => $id,
            'transaction_no' => $id,
            'verified_order_gross' => $amount,
            'verified_order_currency' => $currency,
        ];
    }

    private function invoiceUrl(): string
    {
        return rtrim($this->getConfig('btcpay_url'), '/') . '/api/v1/stores/'
            . rawurlencode($this->getConfig('btcpay_storeId')) . '/invoices';
    }

    private function api(): PendingRequest
    {
        return Http::withToken($this->getConfig('btcpay_api_key'), 'token')->withoutRedirecting();
    }

    private function isDecimal(mixed $value): bool
    {
        return (is_string($value) || is_int($value)) && preg_match('/\A[0-9]+(?:\.[0-9]+)?\z/', (string) $value);
    }
}
