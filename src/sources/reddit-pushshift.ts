import axios from "axios";

export interface RedditChannel {
    /** subreddit address */
    readonly subreddit: string;

    /** hours in range 1-24, posts need some time to gain score */
    readonly after?: number;

    /** hours in range 1-24, posts need some time to get tag 'removed' */
    readonly before?: number;

    /** score of post on Reddit */
    readonly score?: number;

    /** number of posts to be received */
    readonly size?: number;
}

export default class RedditPushshiftAPI {
    private readonly pushShiftUrl: string = 'https://api.pushshift.io/reddit/submission/search'; // TODO: get link from .env
    private readonly requestParams: {
        subreddit: string;
        after: string;
        before: string;
        score: string;
        size: number;
        sort: 'asc' | 'desc';
        fields: string;
    }

    constructor(channel: RedditChannel) {
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

    public async importData()  {
        return axios.get(this.pushShiftUrl,{
                params: this.requestParams
            })
    }
}
