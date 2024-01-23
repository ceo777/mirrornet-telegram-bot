/** Telegram Bot API */

import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';


/** Reads credentials from the environment and establishes a connection to the Telegram API */
export class TelegramApi {
    /** Telegram Bot secret token. Stringifying the property for type safety */
    private readonly TELEGRAM_BOT_TOKEN:  string = String(process.env.TELEGRAM_BOT_TOKEN);
    public readonly bot: TelegramBot;
    constructor() {
        if (this.TELEGRAM_BOT_TOKEN) {
            try {
                this.bot = new TelegramBot(this.TELEGRAM_BOT_TOKEN, {polling: true});
            } catch (error) {
                throw new Error(`Telegram Bot API Error: ${error}`);
            }
        } else {
            throw new Error('Invalid Telegram Bot API Token provided.');
        }
    }
}