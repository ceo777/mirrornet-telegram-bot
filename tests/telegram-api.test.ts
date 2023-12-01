import TelegramAPI from "../src/telegram-api";

describe('Telegram Bot API testing',() => {
    test('Bot token authorization',async () => {
        const api: TelegramAPI = new TelegramAPI();
        if (api.bot) {
            await api.bot.getMe()
                .then(user => {
                    expect(user.is_bot).toBeTruthy();
                });
        }
    });
});