/**
 * Reddit Poster module
 *
 * Copyright © 2024 Oleg Dubnov
 * https://olegdubnov.com
 */

import { MongoClient, Db, Collection } from "mongodb";
import { MongoDB } from '../db';
import { TelegramApi } from '../telegram-api';
import { RedditChannel, RedditPost, RedditPushshiftApi } from '../sources/reddit-pushshift-api';


/** Reddit Poster. Publishes data from Reddit to Telegram */
export default class Reddit {
    /** MongoDB connection */
    private readonly mongo: MongoClient;

    /** MongoDB database */
    private readonly db: Db;

    /** MongoDB 'reddit' collection */
    private readonly redditCollection: Collection<RedditChannel>;

    /** Telegram Bot API */
    private readonly bot: TelegramApi["bot"];

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
        this.bot = new TelegramApi().bot;

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
                projection: {_id: 0}, /* Do not return the database internal ID in the query */
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
                sort: { id: 1 }, /* Sort results by the channel ID */
                projection: { _id: 0}, /* Do not return the database internal ID in the query */
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
     * Imports posts to be published to the current channel
     * @param channel - Reddit channel
     * @returns array of Reddit posts for the current channel
     */
    private async getPosts(channel: RedditChannel): Promise<RedditPost[]> {
        const redditPushshiftApi = new RedditPushshiftApi(channel);

        /* Importing mock posts from local disk for testing purposes. Uncomment for testing only */
        // return await redditPushshiftApi.mockData();

        /* Importing posts from the Reddit PushShift Source */
        return await redditPushshiftApi.importData();
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

                /* If failed, retry the specified number of times (recursive call) */
                if (attempt < this.maxRetries) {
                    await this.sleep(this.retryInterval);
                    return this.sendPost(channelName, chatId, post, ++attempt);
                } else {
                    throw new Error(`Failed to publish the post ${post.url}. ${error.message}`);
                }
            });
    }

    /**
     * Publishes imported posts to the current Telegram channel according to the posting interval
     * @param channel - Reddit channel
     * @param posts - array of posts to be published
     */
    private async publishPosts(channel: RedditChannel, posts: RedditPost[]): Promise<void> {
        /* Preparing the Telegram channel chat id */
        const telegramChatId: string = this.getChatId(channel.telegram);

        /* If the posting interval is not set for the current channel, the default value is used */
        const postingInterval: number = channel.interval || this.postingInterval;

        /* Calculating the maximum number of posts that can be published within the specified updating interval */
        const maxPostsPerUpdate: number = Math.floor(this.updatingInterval / postingInterval);

        const newPosts: RedditPost[] = [];
        let postsCounter: number = 0;

        /* Filtering the posts */
        for (let post of posts.values()) {
            /* Skip removed posts */
            if (post.removed_by_category) {
                continue;
            }

            /* Skip already published posts */
            if (this.publishedPosts[channel.id].has(post.id)) {
                continue;
            }

            newPosts.push(post);
        }

        if (!newPosts.length) {
            throw new Error('There are no new posts to be published!');
        }

        /* Publishing the remaining posts evenly within the specified updating interval */
        for (let post of newPosts.values()) {
            /* Stop if posts limit is reached */
            if (postsCounter == maxPostsPerUpdate) {
                break;
            }

            /* Sending the post */
            await this.sendPost(channel.name, telegramChatId, post).then(
                async () => {
                    postsCounter++;

                    /* Adding to history of published posts */
                    this.publishedPosts[channel.id].set(post.id, post.created_utc);

                    /* Waiting for the specified posting interval between sending the next post */
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

    /**
     * Updates an array of posts for the current channel and starts publishing
     * @param channel - Reddit channel
     * @param attempt - a number of attempt to update the posts
     */
    private async updatePosts(channel: RedditChannel, attempt: number = 1): Promise<void> {
        /* Importing posts and, if successful, starting publishing */
        return this.getPosts(channel).then(
            posts => this.publishPosts(channel, posts).catch(
                error => {
                    throw error;
                }
            ),
            async error => {
                console.error(`Channel "${channel.name}" — Attempt ${attempt}` +
                    ` to get posts from Reddit is failed: ${error.message}`);

                /* If failed, retry the specified number of times (recursive call) */
                if (attempt < this.maxRetries) {
                    await this.sleep(this.retryInterval);
                    return this.updatePosts(channel, ++attempt);
                } else {
                    throw new Error(`Failed to get posts from Reddit: ${error.message}`);
                }
            });
    }

    /**
     * Updates the current channel settings from the database and starts updating posts
     * @param channel - Reddit channel
     */
    private async updateChannel(channel: RedditChannel): Promise<void> {
        console.log(`Updating Reddit channel "${channel.name}"...`);

        return await this.getChannelFromDB(channel).then(
            channel => {
                /* 'channel' can be null here (but anyway we will get an exception first) */
                if (channel) {
                    this.updatePosts(channel).catch(
                        error => {
                            console.error(`Channel "${channel.name}" — ${error.message}`);

                            /* If posts updating is failed, update the channel after the specified period of time */
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

    /** Starts the Reddit poster */
    public async start(): Promise<void> {
        let startTime: number = 1000;

        /* Getting all available channels */
        this.getChannelsFromDB().then(
            channels => channels.forEach(
                channel => {
                    /* Starting only active channels */
                    if (channel.enabled) {
                        console.log(`Reddit channel "${channel.name}" is ON`);
                        console.log(`Starting Reddit channel "${channel.name}"...`);

                        /* Creating a new history of published posts for each active channel */
                        this.publishedPosts[channel.id] = new Map<number, string>;

                        /* Clearing channel's history of published posts after every specified period of time */
                        setInterval(this.publishedPosts[channel.id].clear, this.clearingInterval);

                        /* Starting all the channels with the specified interval between them */
                        setTimeout(
                            channel => this.updateChannel(channel),
                            startTime,
                            channel
                        );

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
