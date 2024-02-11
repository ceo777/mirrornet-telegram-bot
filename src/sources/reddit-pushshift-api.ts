/**
 * Reddit PushShift API module
 *
 * Copyright © 2024 Oleg Dubnov
 * https://olegdubnov.com
 */

import axios from 'axios';
import * as path from 'path';
import { readFile } from 'node:fs/promises';


/** Reddit channel structure */
export interface RedditChannel {
    /** Channel id */
    readonly id: number;

    /** Posting to the channel is enabled or not */
    readonly enabled: boolean;

    /** Channel name */
    readonly name: string;

    /** Telegram address */
    readonly telegram: string;

    /** Posting interval in milliseconds */
    readonly interval?: number;

    /** Subreddit address */
    readonly subreddit: string;

    /** After hours in range 1-24, posts need some time to gain score on Reddit */
    readonly after?: number;

    /** Before hours in range 1-24, posts need some time to get tag 'removed' on Reddit */
    readonly before?: number;

    /** Score of posts on Reddit */
    readonly score?: number;

    /** Number of posts to be received */
    readonly size?: number;
}

/** Structure of a post received from the PushShift API */
export interface RedditPost {
    /** Post id */
    readonly id: number;

    /** Post creation date */
    readonly created_utc: string;

    /** Post title */
    readonly title: string;

    /** Content short url */
    readonly url: string;

    /** Content full url */
    readonly full_link?: string;

    /** Post score */
    readonly score?: number;

    /** Reason of removing for removed posts */
    readonly removed_by_category?: string;
}

/** Access to the Reddit subreddits data using the PushShift API */
export class RedditPushshiftApi {
    /** PushShift API search endpoint URL */
    private readonly pushshiftUrl: string = 'https://api.pushshift.io/reddit/submission/search';

    /** PushShift API search endpoint request parameters */
    private readonly requestParams: {
        /** Subreddit address */
        subreddit: string;

        /** After hours in range 1-24, posts need some time to gain score on Reddit */
        after: string;

        /** Before hours in range 1-24, posts need some time to get tag 'removed' on Reddit */
        before: string;

        /** Score of posts on Reddit */
        score: string;

        /** Number of posts to be received */
        size: number;

        /** Type of sorting of received posts */
        sort: 'asc' | 'desc';

        /** Fields to be retrieved (Corresponds to the RedditPost interface) */
        fields: string;
    }

    constructor(channel: RedditChannel) {
        /* Converting Reddit channel data into request parameters for use in a URL request */
        this.requestParams = {
            subreddit: channel.subreddit,
            after: ( channel.after || 24 ) + 'h',
            before: ( channel.before ?? 12 ) + 'h', /* 'before' can be zero */
            score: '>' + ( channel.score || 0),
            size: channel.size || 50,
            sort: 'asc',
            fields: 'id,created_utc,title,url,full_link,score,removed_by_category',
        };
    }

    /**
     * Imports posts from the PushShift API with a GET url request using Axios
     * @returns array of Reddit posts
     */
    public async importData(): Promise<RedditPost[]> {
        return await axios.get(this.pushshiftUrl, {params: this.requestParams}).then(
            response => response.data.post,
            error => {
                let cause: string;
                const errorData = error.response.data;

                /* PushShift API may respond with errors with various structures */
                cause = errorData.detail || errorData.auth || errorData;

                throw new Error(`Reddit PushShift API Error. Status code: ${error.response.status}. ${cause}`);
            })
    }

    /**
     * Imports mock posts from local disk. For development purposes only
     * @returns array of Reddit posts
     *
     * @internal
     */
    public async mockData(): Promise<RedditPost[]> {
        return await readFile(path.resolve(__dirname, '../../mockdata.json'), 'utf8').then(
            data => JSON.parse(data),
            error => new Error(`Mock data file reading Error. ${error}`)
        );
    }
}
