/**
 * Reddit Poster
 *
 * Copyright © 2024 Oleg Dubnov. All Rights Reserved.
 * https://olegdubnov.com
 */

import { MongoClient, Db, Collection } from "mongodb";
import { MongoDB } from '../db';
import { TelegramAPI } from '../telegram-api';
import { RedditChannel, RedditPost, RedditPushshiftAPI } from '../sources/reddit-pushshift-api';


/** Reddit Poster. Publishes data from Reddit to Telegram */
export default class Reddit {
    /** MongoDB connection */
    private readonly mongo: MongoClient;

    /** MongoDB database */
    private readonly db: Db;

    /** MongoDB 'reddit' collection */
    private readonly redditCollection: Collection<RedditChannel>;

    /** Telegram Bot API */
    private readonly bot: TelegramAPI["bot"];

    /** Time interval between starting channels in milliseconds */
    private readonly startingInterval: number;

    /** Time interval between posts in milliseconds */
    private readonly postingInterval: number;

    /** Time interval between attempts to publish a post if unsuccessful in milliseconds */
    private readonly retryInterval: number;

    /** Time interval between importing new data from the source in milliseconds */
    private readonly updatingInterval: number;

    /** Time interval between clearing the history of published posts in milliseconds */
    private readonly clearingInterval: number;

    /** Maximum attempts to publish a post if unsuccessful */
    private readonly maxRetries: number;

    /** History of published posts containing id and creation time for every channel */
    private readonly publishedPosts: Map<number, string>[];

    constructor() {
        /* Establishing the database connection */
        this.mongo = new MongoDB().client;
        this.db = this.mongo.db();
        this.redditCollection = this.db.collection<RedditChannel>('reddit');

        /* Establishing a connection to the Telegram API */
        this.bot = new TelegramAPI().bot;

        /* Auxiliary constants for convenience */
        const second: number = 1000;
        const minute: number = 60 * second;
        const hour: number = 60 * minute;

        /* Setting default values */
        this.startingInterval = second;
        this.postingInterval = 5 * minute;
        this.retryInterval = 5 * second;
        this.updatingInterval = hour;
        this.clearingInterval = 24 * hour;
        this.maxRetries = 3;

        /* Empty history of published posts */
        this.publishedPosts = [];
    }

    /**
     * Pauses execution of code in the current thread
     * @param ms - delay in milliseconds
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Fetches the channel data from the database
     * @param channel - Reddit channel
     * @returns actual Reddit channel data from the database
     */
    private async getChannelFromDB(channel: RedditChannel): Promise<RedditChannel | null> {
        const query = {id: channel.id};
        const result = await this.redditCollection.findOne<RedditChannel>(
            query,
            {
                projection: {_id: 0},
            }
        );

        /* Throw an error if there is no such Reddit channel in the database */
        if ((await this.redditCollection.countDocuments(query)) === 0) {
            throw new Error(`No Reddit channel "${channel.name}" (${channel.telegram}) found in the database!`);
        }

        return result;
    }

    /**
     * Fetches all Reddit channels from the database
     * @returns array of Reddit channels from the database
     */
    private async getChannelsFromDB(): Promise<RedditChannel[]> {
        const redditChannels: RedditChannel[] = [];

        const query = {};
        const cursor = this.redditCollection.find<RedditChannel>(
            query,
            {
                sort: { id: 1 },
                projection: { _id: 0},
            }
        );

        /* Throw an error if there are no Reddit channels in the database */
        if ((await this.redditCollection.countDocuments(query)) === 0) {
            throw new Error('No Reddit channels found in the database!');
        }

        /* Iterating a Mongo client cursor to form an array of channels  */
        for await (const channel of cursor) {
            redditChannels.push(channel);
        }

        return redditChannels;
    }

    /**
     * Imports posts to be published in the current channel
     * @param channel - Reddit channel
     * @returns array of Reddit posts for the current channel
     */
    private async getPosts(channel: RedditChannel): Promise<RedditPost[]> {
        const redditPushshiftAPI = new RedditPushshiftAPI(channel);

        /* Importing mock posts from local disk for testing purposes. Uncomment for testing only */
        // return await redditPushshiftAPI.mockData();

        /* Importing real posts from the Reddit PushShift Source */
        return await redditPushshiftAPI.importData();
    }

    /**
     * Converts the Telegram channel address into a chat id to which messages can be sent
     * @param address - Telegram channel address
     * @returns Telegram chat id
     */
    private getChatId(address: string): string {
        /* Private chat ids start with '-' and are already stored in the database with it. Public ones start with '@' */
        return (address[0] != '-') ? '@' + address : address;
    }

    /**
     * Sends a post to the current Telegram channel
     * @param channelName - Telegram channel name
     * @param chatId - Telegram channel chat id
     * @param post - a post to be sent
     * @param attempt - a number of attempt to send the post
     */
    private async sendPost(channelName: string, chatId: string, post: RedditPost, attempt: number = 1): Promise<void> {
        /* The Telegram Bot API method that sends an image with a title to the current Telegram chat */
        return await this.bot.sendPhoto(chatId, post.url, { caption: post.title} ).then(
            () => console.log(`Channel "${channelName}" — The post ${post.url} is published successfully!`),
            async error => {
                console.error(`Channel "${channelName}" — Attempt ${attempt}` +
                    ` to publish the post ${post.url} is failed: ${error.message}`);

                /* If failed retry specified number of times (Recursive call) */
                if (attempt < this.maxRetries) {
                    await this.sleep(this.retryInterval);
                    return this.sendPost(channelName, chatId, post, ++attempt);
                } else {
                    throw new Error(`Failed to publish the post ${post.url}. ${error.message}`);
                }
            });
    }

    /** */
    private async publishPosts(channel: RedditChannel, posts: RedditPost[]): Promise<void> {
        /* */
        const telegramChatId: string = this.getChatId(channel.telegram);
        /* */
        const postingInterval: number = channel.interval || this.postingInterval;
        /* */
        const maxPostsPerUpdate: number = Math.floor(this.updatingInterval / postingInterval);

        const newPosts: RedditPost[] = [];

        let postsCounter: number = 0;

        /* */
        for (let post of posts.values()) {
            /* */
            if (post.removed_by_category) {
                continue;
            }

            /* */
            if (this.publishedPosts[channel.id].has(post.id)) {
                continue;
            }

            newPosts.push(post);
        }

        if (!newPosts.length) {
            throw new Error('There are no new posts to be published!');
        }

        /* */
        for (let post of newPosts.values()) {
            /* */
            if (postsCounter == maxPostsPerUpdate) {
                break;
            }

            /* */
            await this.sendPost(channel.name, telegramChatId, post).then(
                async () => {
                    postsCounter++;

                    /* */
                    this.publishedPosts[channel.id].set(post.id, post.created_utc);

                    /* */
                    await this.sleep(postingInterval);
                },
                error => console.error(`Channel "${channel.name}" — ${error.message}`)
            );
        }

        if (!postsCounter) {
            throw new Error(`Failed to publish any posts (${postsCounter} out of ${posts.length})!`);
        }

        console.log(`${postsCounter} out of ${posts.length} posts have been published` +
            ` to the "${channel.name}" (${telegramChatId}) channel.`);

        return this.updateChannel(channel);
    }

    /** */
    private async updatePosts(channel: RedditChannel, attempt: number = 1): Promise<void> {
        return this.getPosts(channel).then(
            posts => this.publishPosts(channel, posts).catch(
                error => {
                    throw error;
                }
            ),
            async error => {
                console.error(`Channel "${channel.name}" — Attempt ${attempt}` +
                    ` to get posts from Reddit is failed: ${error.message}`);

                /* */
                if (attempt < this.maxRetries) {
                    await this.sleep(this.retryInterval);
                    return this.updatePosts(channel, ++attempt);
                } else {
                    throw new Error(`Failed to get posts from Reddit: ${error.message}`);
                }
            });
    }

    /** */
    private async updateChannel(channel: RedditChannel): Promise<void> {
        console.log(`Updating Reddit channel "${channel.name}"...`);

        return await this.getChannelFromDB(channel).then(
            channel => {
                /* 'channel' can be null here (but anyway we will get an exception first) */
                if (channel) {
                    this.updatePosts(channel).catch(
                        error => {
                            console.error(`Channel "${channel.name}" — ${error.message}`);

                            /* */
                            setTimeout(
                                channel => this.updateChannel(channel),
                                this.postingInterval,
                                channel
                            );

                            console.error(`Channel "${channel.name}" — Scheduled to retry` +
                                ` in ${this.postingInterval/60000} minute(s).`);
                        }
                    );
                }
            },
            error => {
                console.error(`Channel "${channel.name}" — ${error.message}`);
                console.error(`Reddit channel "${channel.name}" is stopped.`);
            }
        );
    }

    /** */
    public async start(): Promise<void> {
        /* */
        let startTime: number = 1000;

        /* */
        this.getChannelsFromDB().then(
            channels => channels.forEach(
                channel => {
                    /* */
                    if (channel.enabled) {
                        console.log(`Reddit channel "${channel.name}" is ON`);
                        console.log(`Starting Reddit channel "${channel.name}"...`);

                        /* */
                        this.publishedPosts[channel.id] = new Map<number, string>;

                        /* Clearing channel's history of published posts after every specified period of time */
                        setInterval(this.publishedPosts[channel.id].clear, this.clearingInterval);

                        /* */
                        setTimeout(
                            channel => this.updateChannel(channel),
                            startTime,
                            channel
                        );

                        /* */
                        startTime += this.startingInterval;
                    } else {
                        console.log(`Reddit channel "${channel.name}" is OFF`);
                    }
                }
            ),
            error => console.error(`Reddit module Error — ${error.message}`)
        );
    }
}
