<?php

namespace App\Http\Controllers\V1\Guest;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Plugin\HookManager;
use App\Services\TelegramService;
use App\Services\UserService;
use Illuminate\Http\Request;

class TelegramController extends Controller
{
    protected ?object $msg = null;
    protected TelegramService $telegramService;
    protected UserService $userService;

    public function __construct(TelegramService $telegramService, UserService $userService)
    {
        $this->telegramService = $telegramService;
        $this->userService = $userService;
    }

    public function webhook(Request $request): void
    {
        $token = (string) admin_setting('telegram_bot_token');
        if (!(bool) admin_setting('telegram_bot_enable', false) || blank($token)) {
            throw new ApiException('Telegram webhook disabled', 401);
        }
        $digest = admin_setting('telegram_webhook_digest');
        // Existing registrations use a URL credential until an administrator re-registers the bot.
        $valid = filled($digest)
            ? hash_equals($digest, hash_hmac('sha256', (string) $request->header('X-Telegram-Bot-Api-Secret-Token'), $token))
            : (is_string($legacy = $request->query('access_token')) && hash_equals(md5($token), $legacy));
        if (!$valid) {
            throw new ApiException('access_token is error', 401);
        }

        $data = $request->json()->all();

        $this->formatMessage($data);
        $this->formatChatJoinRequest($data);
        $this->handle();
    }

    private function handle(): void
    {
        if (!$this->msg)
            return;
        $msg = $this->msg;
        $this->processBotName($msg);
        try {
            HookManager::call('telegram.message.before', [$msg]);
            $handled = HookManager::filter('telegram.message.handle', false, [$msg]);
            if (!$handled) {
                HookManager::call('telegram.message.unhandled', [$msg]);
            }
            HookManager::call('telegram.message.after', [$msg]);
        } catch (\Exception $e) {
            HookManager::call('telegram.message.error', [$msg, $e]);
            $this->telegramService->sendMessage($msg->chat_id, $e->getMessage());
        }
    }

    private function processBotName(object $msg): void
    {
        $commandParts = explode('@', $msg->command);

        if (count($commandParts) === 2) {
            $botName = $this->getBotName();
            if ($commandParts[1] === $botName) {
                $msg->command = $commandParts[0];
            }
        }
    }

    private function getBotName(): string
    {
        $response = $this->telegramService->getMe();
        return $response->result->username;
    }

    private function formatMessage(array $data): void
    {
        if (!isset($data['message']['text']))
            return;

        $message = $data['message'];
        $text = explode(' ', $message['text']);

        $this->msg = (object) [
            'command' => $text[0],
            'args' => array_slice($text, 1),
            'chat_id' => $message['chat']['id'],
            'message_id' => $message['message_id'],
            'message_type' => 'message',
            'text' => $message['text'],
            'is_private' => $message['chat']['type'] === 'private',
        ];

        if (isset($message['reply_to_message']['text'])) {
            $botId = explode(':', (string) admin_setting('telegram_bot_token'), 2)[0];
            $reply = $message['reply_to_message'];
            $this->msg->reply_from_bot = !empty($reply['from']['is_bot'])
                && (string) ($reply['from']['id'] ?? '') === $botId
                && (string) ($message['from']['id'] ?? '') === (string) $this->msg->chat_id
                && !isset($reply['forward_origin']) && !isset($reply['via_bot']);
            $this->msg->message_type = 'reply_message';
            $this->msg->reply_text = $message['reply_to_message']['text'];
        }
    }

    private function formatChatJoinRequest(array $data): void
    {
        $joinRequest = $data['chat_join_request'] ?? null;
        if (!$joinRequest)
            return;

        $chatId = $joinRequest['chat']['id'] ?? null;
        $userId = $joinRequest['from']['id'] ?? null;

        if (!$chatId || !$userId)
            return;

        $user = User::where('telegram_id', $userId)->first();

        if (!$user) {
            $this->telegramService->declineChatJoinRequest($chatId, $userId);
            return;
        }

        if (!$this->userService->isAvailable($user)) {
            $this->telegramService->declineChatJoinRequest($chatId, $userId);
            return;
        }

        $this->telegramService->approveChatJoinRequest($chatId, $userId);
    }
}
