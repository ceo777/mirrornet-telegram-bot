/**
 * Telegram Bot API module
 *
 * Copyright © 2024 Oleg Dubnov
 * https://olegdubnov.com
 */

import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';


/** Reads credentials from the environment and establishes a connection to the Telegram API */
export class TelegramApi {
    /** Telegram Bot secret token. Stringifying the property for type safety */
    private readonly TELEGRAM_BOT_TOKEN:  string = String(process.env.TELEGRAM_BOT_TOKEN);

    /** Telegram Bot client */
    public readonly bot: TelegramBot;

    constructor() {
        if (this.TELEGRAM_BOT_TOKEN) {
            try {
                /* Connecting to the Telegram Bot API enabling polling mechanism, not webhooks */
                this.bot = new TelegramBot(this.TELEGRAM_BOT_TOKEN, {polling: true});
            } catch (error) {
                throw new Error(`Telegram Bot API Error: ${error}`);
            }
        } else {
            throw new Error('Invalid Telegram Bot API Token provided.');
        }
    }
}