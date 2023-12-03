/** Reddit Poster */

import 'dotenv/config';
import TelegramAPI from '../telegram-api';
import RedditPushshiftAPI, {RedditChannel, RedditPost} from '../sources/reddit-pushshift-api';

/** Reddit Poster */
export default class Reddit {
    /** Telegram Bot API */
    private readonly bot: TelegramAPI["bot"];

    /** Reddit channel object */
    private readonly redditChannel: RedditChannel;

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
        this.bot = new TelegramAPI().bot;

        const second: number = 1000;
        const minute: number = 60000;
        const hour: number = 60 * minute;

        this.postingInterval = 5 * minute;
        this.retryInterval = 5 * second;
        this.updatingInterval = hour;
        this.clearingInterval = 24 * hour;
        this.maxRetries = 3;

        this.publishedPosts = new Map;

        this.redditChannel = {
            name: String(process.env.TEST_CHANNEL_NAME),
            telegram: String(process.env.TEST_CHANNEL_ADDRESS),
            subreddit: String(process.env.TEST_CHANNEL_SUBREDDIT)
        };
    }

    /** */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /** */
    private async getPosts(channel: RedditChannel): Promise<RedditPost[]> {
        const redditPushshiftAPI = new RedditPushshiftAPI(channel);
        return await redditPushshiftAPI.importData();
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
                return this.update(channel);
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
    private async update(channel: RedditChannel, attempt: number = 1): Promise<void> {
        /** */
        return this.getPosts(channel).then(
            posts => this.publishPosts(channel, posts),
            async error => {
                console.error(`Channel "${channel.name}" — Attempt ${attempt} to get posts from Reddit is failed: ${error.message}`);
                /** */
                if (attempt < this.maxRetries) {
                    await this.sleep(this.retryInterval);
                    return this.update(channel, ++attempt);
                } else {
                    throw error;
                }
            });
    }

    /** */
    public async start(): Promise<void> {
        /** */
        setInterval(this.publishedPosts.clear, this.clearingInterval);
        /** */
        this.update(this.redditChannel).catch(
            error => console.error(`Channel "${this.redditChannel.name}" — ${error}`)
        );
    }
}
