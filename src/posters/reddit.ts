/** Reddit Poster */

import MongoDB from '../db';
import TelegramAPI from '../telegram-api';
import RedditPushshiftAPI, { RedditChannel, RedditPost } from '../sources/reddit-pushshift-api';
import { Collection, Db, MongoClient } from "mongodb";


/** Reddit Poster */
export default class Reddit {
    /** MongoDB connection */
    private readonly mongo: MongoClient;

    /** MongoDB database */
    private readonly db: Db;

    /** MongoDB reddit collection */
    private readonly redditCollection: Collection<RedditChannel>;

    /** Telegram Bot API */
    private readonly bot: TelegramAPI["bot"];

    /** time interval between posts in ms */
    private readonly postingInterval: number;

    /** time interval between attempts to publish a post if unsuccessful in ms */
    private readonly retryInterval: number;

    /** time interval between importing new data from the source in ms */
    private readonly updatingInterval: number;

    /** time interval between clearing the history of published posts in ms */
    private readonly clearingInterval: number;

    /** maximum attempts to publish a post if unsuccessful */
    private readonly maxRetries: number;

    /** history of published posts containing id and creation time */
    private readonly publishedPosts: Map<number, string>;

    /** Publishes data from Reddit to Telegram */
    constructor() {
        this.mongo = new MongoDB().client;
        this.db = this.mongo.db();
        this.redditCollection = this.db.collection<RedditChannel>('reddit');

        this.bot = new TelegramAPI().bot;

        const second: number = 1000;
        const minute: number = 60 * second;
        const hour: number = 60 * minute;

        this.postingInterval = 5 * minute;
        this.retryInterval = 5 * second;
        this.updatingInterval = hour;
        this.clearingInterval = 24 * hour;
        this.maxRetries = 3;

        this.publishedPosts = new Map;
    }

    /** */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /** */
    private async getChannelFromDB(channel: RedditChannel): Promise<RedditChannel | null> {
        try {
            await this.mongo.connect();
            const query = {id: channel.id};
            const result = await this.redditCollection.findOne<RedditChannel>(
                query,
                {
                    projection: {_id: 0},
                }
            );

            if ((await this.redditCollection.countDocuments(query)) === 0) {
                throw new Error(`There is no Reddit channel "${channel.name}" (${channel.telegram}) in the database.`);
            }

            return result;
        } finally {
            await this.mongo.close();
        }
    }

    /** */
    private async getChannelsFromDB(): Promise<RedditChannel[]> {
        const redditChannels: RedditChannel[] = [];

        try {
            await this.mongo.connect();
            const query = {};
            const cursor = this.redditCollection.find<RedditChannel>(
                query,
                {
                    sort: { id: 1 },
                    projection: { _id: 0},
                }
            );

            if ((await this.redditCollection.countDocuments(query)) === 0) {
                throw new Error("No reddit channels found in the database!");
            }

            for await (const channel of cursor) {
                redditChannels.push(channel);
            }
        } finally {
            await this.mongo.close();
        }

        return redditChannels;
    }

    /** */
    private async getPosts(channel: RedditChannel): Promise<RedditPost[]> {
        const redditPushshiftAPI = new RedditPushshiftAPI(channel);
        return await redditPushshiftAPI.mockData();
    }

    /** */
    private getChatId(address: string): string {
        /** */
        if (address[0] != '-') {
            return '@' + address;
        } else {
            return address;
        }
    }

    /** */
    private async sendPost(channelName: string, chatId: string, post: RedditPost, attempt: number = 1): Promise<void> {
        /** */
        return await this.bot.sendPhoto(chatId, post.url, { caption: post.title} ).then(
            () => console.log(`Channel "${channelName}" — The post ${post.url} is published successfully!`),
            async error => {
                console.error(`Channel "${channelName}" — Attempt ${attempt} to publish the post ${post.url} is failed: ${error.message}`);
                /** */
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
        const telegramChatId: string = this.getChatId(channel.telegram);
        const postingInterval: number = channel.interval || this.postingInterval;
        const maxPostsPerUpdate: number = Math.floor(this.updatingInterval / postingInterval);
        let postsCounter: number = 0;

        if (!posts) {
            throw new Error('There are no posts to publish.');
        }

        /** */
        for (let post of posts.values()) {
            /** */
            if (postsCounter == maxPostsPerUpdate) {
                return this.updateChannel(channel);
            }
            /** */
            if (post.removed_by_category) {
                continue;
            }
            /** */
            if (this.publishedPosts.has(post.id)) {
                continue;
            }
            /** */
            await this.sendPost(channel.name, telegramChatId, post).then(
                async () => {
                    postsCounter++;
                    this.publishedPosts.set(post.id, post.created_utc);
                    await this.sleep(postingInterval);
                },
                error => console.error(error.message)
            );
        }

        /** */
        console.log(`${postsCounter} out of ${posts.length} posts have been published to the "${channel.name}" (${telegramChatId}) channel.`);
    }

    /** */
    private async updateChannel(channel: RedditChannel): Promise<void> {
        /** */
        return await this.getChannelFromDB(channel).then(
            channel => {
                if (channel) {
                    this.updatePosts(channel);
                }
            },
            error => {
                throw error;
            }
        );
    }

    /** */
    private async updatePosts(channel: RedditChannel, attempt: number = 1): Promise<void> {
        /** */
        return this.getPosts(channel).then(
            posts => this.publishPosts(channel, posts),
            async error => {
                console.error(`Channel "${channel.name}" — Attempt ${attempt} to get posts from Reddit is failed: ${error.message}`);
                /** */
                if (attempt < this.maxRetries) {
                    await this.sleep(this.retryInterval);
                    return this.updatePosts(channel, ++attempt);
                } else {
                    throw error;
                }
            });
    }

    /** */
    public async start(): Promise<void> {
        /** */
        setInterval(this.publishedPosts.clear, this.clearingInterval);

        await this.sleep(1000);

        /** */
        this.getChannelsFromDB().then(
            channels => channels.forEach(
                async channel => {
                    /** */
                    setTimeout(
                        channel => {
                            this.updateChannel(channel).catch(
                                error => console.error(`Channel "${channel.name}" — ${error}`)
                            );
                        },
                        5000,
                        channel
                    );
                }
            ),
            error => console.error(`Reddit module Error — ${error}`)
        );
    }
}
