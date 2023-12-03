/** Reddit PushShift API */

import axios from 'axios';

/** Reddit channel structure */
export interface RedditChannel {
    /** channel name */
    readonly name: string;

    /** telegram address */
    readonly telegram: string;

    /** posting interval in ms */
    readonly interval?: number;

    /** subreddit address */
    readonly subreddit: string;

    /** after hours in range 1-24, posts need some time to gain score */
    readonly after?: number;

    /** before hours in range 1-24, posts need some time to get tag 'removed' */
    readonly before?: number;

    /** score of post on Reddit */
    readonly score?: number;

    /** number of posts to be received */
    readonly size?: number;
}

/** Structure of a post retrieved using the PushShift API */
export interface RedditPost {
    /** post id */
    readonly id: number;

    /** post creation date */
    readonly created_utc: string;

    /** post title */
    readonly title: string;

    /** content short url */
    readonly url: string;

    /** content full url */
    readonly full_link?: string;

    /** post score */
    readonly score?: number;

    /** reason fof removing for removed posts */
    readonly removed_by_category?: string;
}

/** Reddit PushShift API */
export default class RedditPushshiftAPI {
    private readonly pushshiftUrl: string = 'https://api.pushshift.io/reddit/submission/search';
    private readonly requestParams: {
        subreddit: string;
        after: string;
        before: string;
        score: string;
        size: number;
        sort: 'asc' | 'desc';
        fields: string;
    }

    /** Access to the Reddit subreddits data using the PushShift API */
    constructor(channel: RedditChannel) {
        /** Reformatting Reddit channel data for using in URL request */
        this.requestParams = {
            subreddit: channel.subreddit,
            after: ( channel.after || 24 ) + 'h',
            before: ( channel.before || 12 ) + 'h',
            score: '>' + ( channel.score || 0),
            size: channel.size || 50,
            sort: 'asc',
            fields: 'id,created_utc,title,url,full_link,score,removed_by_category'
        };
    }

    /** Imports posts using a URL request to the PushShift API */
    public async importData(): Promise<RedditPost[]> {
        return await axios.get(this.pushshiftUrl, {params: this.requestParams}).then(
            response => response.data.post,
            error => {
                let cause: string;
                const errorData = error.response.data;
                if (errorData.hasOwnProperty('detail')) {
                    cause = errorData.detail;
                } else if (errorData.hasOwnProperty('auth')) {
                    cause = errorData.auth;
                } else {
                    cause = errorData;
                }
                throw new Error(`Reddit PushShift API Error. Status code: ${error.response.status}. ${cause}`);
            })
    }
}
