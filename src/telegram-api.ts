import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';

export default class TelegramApi {
    private readonly TELEGRAM_BOT_TOKEN:  string | undefined = process.env.TELEGRAM_BOT_TOKEN;
    public bot: TelegramBot | undefined;
    constructor() {
        if (this.TELEGRAM_BOT_TOKEN) {
            try {
                this.bot = new TelegramBot(this.TELEGRAM_BOT_TOKEN, {polling: true});
            } catch (e) {
                throw new Error(`Telegram Bot API Error: ${e}`);
            }
        } else {
            throw new Error('Invalid telegram bot api token provided.');
        }
    }
}