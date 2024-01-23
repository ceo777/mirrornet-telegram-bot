import { TelegramApi } from "../src/telegram-api";


describe('Telegram Bot API testing',() => {
    test('Bot token authorization',async () => {
        const api: TelegramApi = new TelegramApi();

        /* Calling the 'getMe()' Telegram API method to check if the Telegram user is a bot */
        if (api.bot) {
            await api.bot.getMe().then(
                user => expect(user.is_bot).toBeTruthy()
            );
        }
    });
});