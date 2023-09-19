import RedditPushshiftAPI, {RedditChannel} from '../src/sources/reddit-pushshift';

describe('Sources testing', () => {
    test('Reddit PushShift API', async () => {
        const channel: RedditChannel = { subreddit: 'aww' };
        const api = new RedditPushshiftAPI(channel);
        await api.importData()
            .then(function (response) {
                expect(response.data).not.toBeUndefined();
            })
            .catch(function (error) {
                const responseData = error.response.data;
                if (responseData.hasOwnProperty('detail')) {
                    expect(responseData.detail).toEqual('Not authenticated');
                } else if (responseData.hasOwnProperty('auth')) {
                    expect(responseData.auth).toEqual('The user is not an approved moderator on Reddit.'
                        || 'Failed to validate the reddit user as an approved moderator.');
                } else {
                    expect(error.response.status).toEqual(403);
                }
            });
    });
});